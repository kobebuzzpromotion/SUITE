import {validateLevels} from '../processing/levels.mjs';
import {validateGrainSettings} from '../processing/grain.mjs';
import {validateGlow} from '../processing/glow.mjs';
import {validateSelectiveColor, SELECTIVE_COLOR_RANGES, SELECTIVE_COLOR_CONTROLS} from '../processing/selective-color.mjs';
import {validateColorCalibration, COLOR_CALIBRATION_PRIMARIES} from '../processing/color-calibration.mjs';
import {buildPointCurveLUT} from '../processing/point-curves.mjs';
import {validateVignetteSettings,VIGNETTE_ALGORITHM_VERSION} from '../processing/vignette.mjs';
import {validatePersonalLook} from '../local-personal-look-contract.mjs';

const TRANSITIONS = Object.freeze({
  DRAFT: new Set(["SUBMITTED", "WITHDRAWN"]),
  SUBMITTED: new Set(["CHANGES_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"]),
  CHANGES_REQUESTED: new Set(["SUBMITTED", "WITHDRAWN"]),
  APPROVED: new Set(["PUBLISHED", "ARCHIVED"]),
  PUBLISHED: new Set(["ARCHIVED"]),
  REJECTED: new Set(["ARCHIVED"]),
  WITHDRAWN: new Set(["ARCHIVED"]),
  ARCHIVED: new Set(),
});

const GLOBAL_STAGES = Object.freeze(["exposure", "contrast", "saturation"]);
const POST_DECODE_STAGE = "postDecodeAdjustments";
const POST_CROP_STAGE = "postCropAdjustments";
const ACCEPTED_INPUT_STAGES = Object.freeze([...GLOBAL_STAGES, POST_DECODE_STAGE, "rotation"]);
const POST_DECODE_ENGINE = "suite-srgb8-color-detail-1";
const TONE_FIELDS = new Set(["temperature", "tint", "highlights", "shadows", "whites", "blacks", "vibrance"]);
const HSL_COLORS = new Set(["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]);
const HSL_FIELDS = new Set(["hue", "saturation", "luminance"]);
const SHARPEN_FIELDS = new Set(["sharpenRadius", "sharpenDetail", "sharpenMasking"]);
const DETAIL_FIELDS = new Set(["clarity", "texture", "sharpness", "denoise", ...SHARPEN_FIELDS]);
const LEVELS_CHANNELS = ["master", "red", "green", "blue"];
const LEVELS_FIELDS = ["inputBlack", "inputWhite", "gamma", "outputBlack", "outputWhite"];
const GRAIN_FIELDS = ["amount", "seed", "shadows", "midtones", "highlights", "size", "roughness", "colorVariation"];
const GLOW_FIELDS = ["intensity", "radius", "threshold", "mode", "exposure", "diffusion", "tint"];
const CALIBRATION_FIELDS = ["hue", "saturation"];
const POINT_CURVE_CHANNELS = ["master", "red", "green", "blue"];
const PARAMETRIC_TONE_CURVE_FIELDS = ["shadows", "midtones", "highlights"];
const VIGNETTE_FIELDS = ["amount", "midpoint", "roundness", "feather", "highlights"];

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && !(Object.getPrototypeOf(prototype) === null &&
      Object.hasOwn(prototype, 'constructor') && prototype.constructor?.name === 'Object'))
    throw new Error(code);
  return value;
}

function exactKeys(value, allowed, code) {
  record(value, code);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)))
    throw new Error(code);
}

function finiteInRange(value, minimum, maximum, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

// New portable color branches are checked before copying; do not sanitize an
// unknown field, getter or photo-local selection into a valid shared preset.
function strictColorFields(value, allowed, required = []) {
  const code = 'INVALID_POST_DECODE_PRESET';
  exactKeys(value, allowed, code);
  if (required.some(key => !Object.hasOwn(value, key)) || Reflect.ownKeys(value).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
  })) throw new Error(code);
  return value;
}
function strictColorArray(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1) throw new Error('INVALID_POST_DECODE_PRESET');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_POST_DECODE_PRESET');
  }
  return value;
}
function portableNewColor(name, value) {
  if (name === 'sceneMatch') {
    strictColorFields(value, ['scale', 'offset', 'amount'], ['scale', 'offset', 'amount']);
    // Fixed transform only: no reference image, identity or sample coordinates.
    return {
      scale: strictColorArray(value.scale, 3, 3).map(v => number(v, 0.5, 2)),
      offset: strictColorArray(value.offset, 3, 3).map(v => number(v, -2, 1)),
      amount: number(value.amount, 0, 1),
    };
  }
  const number = (v, min, max) => finiteInRange(v, min, max, 'INVALID_POST_DECODE_PRESET');
  if (name === 'lumaCurve') {
    const points = strictColorArray(value, 2, 16);
    let previousX = -1;
    return points.map((point, index) => {
      strictColorFields(point, ['x', 'y'], ['x', 'y']);
      const {x, y} = point;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 255 ||
          x <= previousX || index === 0 && x !== 0 || index === points.length - 1 && x !== 255)
        throw new Error('INVALID_LUMA_CURVE');
      previousX = x;
      return {x, y};
    });
  }
  if (name === 'whiteBalance') {
    strictColorFields(value, ['gains', 'domain', 'method'], ['gains', 'domain', 'method']);
    if (value.domain !== 'linear-rec709' || !['auto', 'selector'].includes(value.method))
      throw new Error('INVALID_COLOR_WHITE_BALANCE');
    const gains = strictColorArray(value.gains, 3, 3).map(gain => number(gain, 0.25, 4));
    // Fixed user-approved gains are portable; no photo-local sample/mask travels.
    return {gains, domain: value.domain, method: value.method};
  }
  if (name === 'profile') {
    const kind = Object.getOwnPropertyDescriptor(value, 'kind');
    if (kind && Object.hasOwn(kind, 'value') && kind.value === 'local-lut')
      throw new Error('LOCAL_LUT_PRESET_DISTRIBUTION_UNAVAILABLE');
    strictColorFields(value, ['kind', 'intensity'], ['kind', 'intensity']);
    if (!['standard', 'black-and-white'].includes(value.kind)) throw new Error('INVALID_POST_DECODE_PRESET');
    return {kind: value.kind, intensity: number(value.intensity, 0, 1)};
  }
  if (name === 'sceneBasic' || name === 'tonalBands') {
    const keys = name === 'sceneBasic' ? ['brightness', 'dehaze'] : ['shadows', 'darks', 'lights', 'highlights'];
    strictColorFields(value, keys, name === 'sceneBasic' ? keys : []);
    return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, number(value[key], -100, 100)]));
  }
  if (name === 'grading') {
    const wheels = ['global', 'shadows', 'midtones', 'highlights'];
    strictColorFields(value, [...wheels, 'blending', 'balance', 'amount']);
    const output = {};
    for (const [key, min, max] of [['blending', 0, 100], ['balance', -100, 100], ['amount', 0, 1]])
      if (Object.hasOwn(value, key)) output[key] = number(value[key], min, max);
    for (const key of wheels) if (Object.hasOwn(value, key)) {
      const wheel = strictColorFields(value[key], ['hue', 'saturation', 'luminance']);
      output[key] = {};
      for (const [field, min, max] of [['hue', 0, 360], ['saturation', 0, 100], ['luminance', -100, 100]])
        if (Object.hasOwn(wheel, field)) output[key][field] = number(wheel[field], min, max);
    }
    return output;
  }
  if (name !== 'pointColor') throw new Error('INVALID_POST_DECODE_PRESET');
  strictColorFields(value, ['selections', 'amount'], ['selections', 'amount']);
  const amount = number(value.amount, 0, 1), ids = new Set();
  const selections = strictColorArray(value.selections, 1, 16).map(selection => {
    strictColorFields(selection, ['id', 'hue', 'saturation', 'lightness', 'adjustment', 'enabled'],
      ['id', 'hue', 'saturation', 'lightness']);
    if (typeof selection.id !== 'string' || !selection.id.length || selection.id.length > 128 || ids.has(selection.id))
      throw new Error('INVALID_POST_DECODE_PRESET');
    ids.add(selection.id);
    let hue = null;
    if (selection.hue !== null) {
      const h = strictColorFields(selection.hue, ['center', 'inner', 'outer'], ['center', 'inner', 'outer']);
      const inner = number(h.inner, 0, 180);
      hue = {center: number(h.center, 0, 360), inner, outer: number(h.outer, inner, 180)};
    }
    const out = {id: selection.id, hue};
    for (const key of ['saturation', 'lightness']) {
      const edges = strictColorArray(selection[key], 4, 4).map(v => number(v, 0, 1));
      if (edges.some((v, i) => i && v < edges[i - 1])) throw new Error('INVALID_POST_DECODE_PRESET');
      out[key] = edges;
    }
    if (Object.hasOwn(selection, 'adjustment')) {
      const adjustment = strictColorFields(selection.adjustment, ['hue', 'saturation', 'lightness']);
      out.adjustment = {};
      for (const key of ['hue', 'saturation', 'lightness']) if (Object.hasOwn(adjustment, key))
        out.adjustment[key] = number(adjustment[key], key === 'hue' ? -180 : -100, key === 'hue' ? 180 : 100);
    }
    if (Object.hasOwn(selection, 'enabled')) {
      if (typeof selection.enabled !== 'boolean') throw new Error('INVALID_POST_DECODE_PRESET');
      out.enabled = selection.enabled;
    }
    return out;
  });
  return {selections, amount};
}

/** Only the existing, actually rendered sRGB8 controls may cross the preset boundary. */
function portablePostDecode(value) {
  const adjustment = record(value, "INVALID_POST_DECODE_PRESET");
  if (adjustment.schemaVersion !== 1 || adjustment.engineVersion !== POST_DECODE_ENGINE ||
      !Object.hasOwn(adjustment, 'schemaVersion') || !Object.hasOwn(adjustment, 'engineVersion'))
    throw new Error("INVALID_POST_DECODE_PRESET");
  exactKeys(adjustment, ["schemaVersion", "engineVersion", "color", "detail"], "INVALID_POST_DECODE_PRESET");
  let controls = 0;
  const output = {schemaVersion: 1, engineVersion: POST_DECODE_ENGINE};
  if (adjustment.color !== undefined) {
    const color = record(adjustment.color, "INVALID_POST_DECODE_PRESET");
    exactKeys(color, [...TONE_FIELDS, "hsl", "levels", "glow", "selectiveColor", "calibration", "pointCurves", "toneCurve", "grading", "pointColor", "tonalBands", "profile", "sceneBasic", "sceneMatch", "illuminant", "whiteBalance", "lumaCurve"], "INVALID_POST_DECODE_PRESET");
    if (Object.hasOwn(color, 'whiteBalance') && Object.hasOwn(color, 'illuminant'))
      throw new Error('WHITE_BALANCE_ILLUMINANT_CONFLICT');
    const copy = {};
    if (Object.hasOwn(color, 'illuminant')) {
      const descriptor = Object.getOwnPropertyDescriptor(color, 'illuminant');
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
          typeof descriptor.value !== 'string' ||
          !['daylight', 'cloudy', 'shade', 'tungsten', 'fluorescent', 'flash'].includes(descriptor.value))
        throw new Error('INVALID_COLOR_ILLUMINANT');
      copy.illuminant = descriptor.value; controls++;
    }
    for (const key of ['grading', 'pointColor', 'tonalBands', 'profile', 'sceneBasic', 'sceneMatch', 'whiteBalance', 'lumaCurve']) if (Object.hasOwn(color, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(color, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_POST_DECODE_PRESET');
      copy[key] = portableNewColor(key, descriptor.value);
      // Count a validated structured control as one, as for Grain below.
      // Empty optional groups are legal neutral controls in the saved contract.
      controls++;
    }
    for (const key of TONE_FIELDS) if (Object.hasOwn(color, key)) {
      copy[key] = finiteInRange(color[key], -100, 100, "INVALID_POST_DECODE_PRESET"); controls++;
    }
    if (color.hsl !== undefined) {
      const hsl = record(color.hsl, "INVALID_POST_DECODE_PRESET");
      exactKeys(hsl, [...HSL_COLORS], "INVALID_POST_DECODE_PRESET");
      const channels = {};
      for (const key of HSL_COLORS) if (Object.hasOwn(hsl, key)) {
        const fields = record(hsl[key], "INVALID_POST_DECODE_PRESET");
        exactKeys(fields, [...HSL_FIELDS], "INVALID_POST_DECODE_PRESET");
        if (!Object.keys(fields).length) throw new Error("INVALID_POST_DECODE_PRESET");
        const channel = {};
        for (const field of HSL_FIELDS) if (Object.hasOwn(fields, field)) {
          channel[field] = finiteInRange(fields[field], -100, 100, "INVALID_POST_DECODE_PRESET"); controls++;
        }
        channels[key] = channel;
      }
      if (!Object.keys(channels).length) throw new Error("INVALID_POST_DECODE_PRESET");
      copy.hsl = channels;
    }
    if (color.levels !== undefined) {
      const levels = record(color.levels, "INVALID_POST_DECODE_PRESET");
      exactKeys(levels, LEVELS_CHANNELS, "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(levels).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const channels = {};
      for (const name of LEVELS_CHANNELS) if (Object.hasOwn(levels, name)) {
        const fields = record(levels[name], "INVALID_POST_DECODE_PRESET");
        exactKeys(fields, LEVELS_FIELDS, "INVALID_POST_DECODE_PRESET");
        if (!Object.keys(fields).length) throw new Error("INVALID_POST_DECODE_PRESET");
        channels[name] = {};
        for (const field of LEVELS_FIELDS) if (Object.hasOwn(fields, field)) {
          channels[name][field] = fields[field]; controls++;
        }
      }
      // Copy first so JSON from another realm reaches the renderer's strict
      // validator as a local plain object with the same explicit controls.
      try { validateLevels(channels); }
      catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
      copy.levels = channels;
    }
    if (color.glow !== undefined) {
      const glow = record(color.glow, "INVALID_POST_DECODE_PRESET");
      exactKeys(glow, GLOW_FIELDS, "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(glow).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const settings = {};
      for (const field of GLOW_FIELDS) if (Object.hasOwn(glow, field)) {
        settings[field] = glow[field]; controls++;
      }
      // Copy before validation: Worker/JSON realm boundaries must not turn
      // genuine plain data into a rejected class instance.
      try { validateGlow(settings); }
      catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
      copy.glow = settings;
    }
    if (color.selectiveColor !== undefined) {
      const selective = record(color.selectiveColor, "INVALID_POST_DECODE_PRESET");
      exactKeys(selective, ["method", "ranges"], "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(selective).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const settings = {};
      if (Object.hasOwn(selective, 'method')) {
        settings.method = selective.method; controls++;
      }
      if (Object.hasOwn(selective, 'ranges')) {
        const ranges = record(selective.ranges, "INVALID_POST_DECODE_PRESET");
        exactKeys(ranges, SELECTIVE_COLOR_RANGES, "INVALID_POST_DECODE_PRESET");
        if (!Object.keys(ranges).length) throw new Error("INVALID_POST_DECODE_PRESET");
        settings.ranges = {};
        for (const family of SELECTIVE_COLOR_RANGES) if (Object.hasOwn(ranges, family)) {
          const sliders = record(ranges[family], "INVALID_POST_DECODE_PRESET");
          exactKeys(sliders, SELECTIVE_COLOR_CONTROLS, "INVALID_POST_DECODE_PRESET");
          if (!Object.keys(sliders).length) throw new Error("INVALID_POST_DECODE_PRESET");
          settings.ranges[family] = {};
          for (const field of SELECTIVE_COLOR_CONTROLS) if (Object.hasOwn(sliders, field)) {
            settings.ranges[family][field] = sliders[field]; controls++;
          }
        }
      }
      // A local plain copy allows structured-cloned/JSON records from another
      // realm while retaining the exact method/range fields that were saved.
      try { validateSelectiveColor(settings); }
      catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
      copy.selectiveColor = settings;
    }
    if (color.calibration !== undefined) {
      const calibration = record(color.calibration, "INVALID_POST_DECODE_PRESET");
      exactKeys(calibration, COLOR_CALIBRATION_PRIMARIES, "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(calibration).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const primaries = {};
      for (const primary of COLOR_CALIBRATION_PRIMARIES) if (Object.hasOwn(calibration, primary)) {
        const settings = record(calibration[primary], "INVALID_POST_DECODE_PRESET");
        exactKeys(settings, CALIBRATION_FIELDS, "INVALID_POST_DECODE_PRESET");
        if (!Object.keys(settings).length) throw new Error("INVALID_POST_DECODE_PRESET");
        primaries[primary] = {};
        for (const field of CALIBRATION_FIELDS) if (Object.hasOwn(settings, field)) {
          primaries[primary][field] = settings[field]; controls++;
        }
      }
      // Validate copied plain JSON so cross-realm author payloads keep the
      // renderer's exact integer/range contract without inventing defaults.
      try { validateColorCalibration(primaries); }
      catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
      copy.calibration = primaries;
    }
    if (color.pointCurves !== undefined) {
      const curves = record(color.pointCurves, "INVALID_POST_DECODE_PRESET");
      exactKeys(curves, [...POINT_CURVE_CHANNELS, 'refineSaturation'], "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(curves).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const channels = {};
      for (const channel of POINT_CURVE_CHANNELS) if (Object.hasOwn(curves, channel)) {
        const points = curves[channel];
        if (!Array.isArray(points) || points.length < 2 || points.length > 32 ||
            Reflect.ownKeys(points).some(key => key !== 'length' &&
              (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= points.length)))
          throw new Error("INVALID_POST_DECODE_PRESET");
        const copied = [];
        for (let index = 0; index < points.length; index++) {
          if (!Object.hasOwn(points, index)) throw new Error("INVALID_POST_DECODE_PRESET");
          const point = record(points[index], "INVALID_POST_DECODE_PRESET");
          exactKeys(point, ['x', 'y'], "INVALID_POST_DECODE_PRESET");
          if (!Object.hasOwn(point, 'x') || !Object.hasOwn(point, 'y'))
            throw new Error("INVALID_POST_DECODE_PRESET");
          copied.push({x: point.x, y: point.y});
        }
        // LUT construction validates 0/255 endpoints, ascending integer X,
        // integer Y, and point count against the exact render contract.
        try { buildPointCurveLUT(copied); }
        catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
        channels[channel] = copied; controls++;
      }
      if (Object.hasOwn(curves, 'refineSaturation')) {
        if (!Object.keys(channels).length || !Number.isSafeInteger(curves.refineSaturation) ||
            curves.refineSaturation < 0 || curves.refineSaturation > 100) throw new Error("INVALID_POST_DECODE_PRESET");
        channels.refineSaturation = curves.refineSaturation; controls++;
      }
      copy.pointCurves = channels;
    }
    if (color.toneCurve !== undefined) {
      const curve = record(color.toneCurve, "INVALID_POST_DECODE_PRESET");
      exactKeys(curve, PARAMETRIC_TONE_CURVE_FIELDS, "INVALID_POST_DECODE_PRESET");
      if (!Object.keys(curve).length) throw new Error("INVALID_POST_DECODE_PRESET");
      const settings = {};
      for (const field of PARAMETRIC_TONE_CURVE_FIELDS) if (Object.hasOwn(curve, field)) {
        settings[field] = finiteInRange(curve[field], -100, 100, "INVALID_POST_DECODE_PRESET");
        controls++;
      }
      copy.toneCurve = settings;
    }
    if (copy.tonalBands && Object.values(copy.tonalBands).some(value => value !== 0) &&
        copy.toneCurve && Object.values(copy.toneCurve).some(value => value !== 0))
      throw new Error('TONAL_BANDS_LEGACY_CURVE_CONFLICT');
    if (!Object.keys(copy).length) throw new Error("INVALID_POST_DECODE_PRESET");
    output.color = copy;
  }
  if (adjustment.detail !== undefined) {
    const detail = record(adjustment.detail, "INVALID_POST_DECODE_PRESET");
    exactKeys(detail, [...DETAIL_FIELDS, "grain"], "INVALID_POST_DECODE_PRESET");
    if (!Object.keys(detail).length) throw new Error("INVALID_POST_DECODE_PRESET");
    const copy = {};
    for (const key of DETAIL_FIELDS) if (Object.hasOwn(detail, key)) {
      const minimum = key === "sharpness" || SHARPEN_FIELDS.has(key) ? 0 : -100;
      const value = finiteInRange(detail[key], minimum, 100, "INVALID_POST_DECODE_PRESET");
      if (SHARPEN_FIELDS.has(key) && !Number.isSafeInteger(value)) throw new Error("INVALID_POST_DECODE_PRESET");
      copy[key] = value; controls++;
    }
    if (detail.grain !== undefined) {
      const grain = record(detail.grain, "INVALID_POST_DECODE_PRESET");
      exactKeys(grain, GRAIN_FIELDS, "INVALID_POST_DECODE_PRESET");
      if (!Object.hasOwn(grain, 'amount') || !Object.hasOwn(grain, 'seed') ||
          !Number.isSafeInteger(grain.seed) || grain.seed < 0 || grain.seed > 0xffffffff)
        throw new Error("INVALID_POST_DECODE_PRESET");
      const {seed, ...settings} = grain;
      try { validateGrainSettings(settings); }
      catch { throw new Error("INVALID_POST_DECODE_PRESET"); }
      // Seed is a fixed 32-bit value, not derived from an Asset identity. The
      // rendering pattern varies with raster coordinates as any grain does.
      copy.grain = {};
      for (const field of GRAIN_FIELDS) if (Object.hasOwn(grain, field)) copy.grain[field] = grain[field];
      controls++;
    }
    output.detail = copy;
  }
  if (!controls) throw new Error("INVALID_POST_DECODE_PRESET");
  return output;
}

/** Photo-independent manual vignette controls; Crop and placement are never copied. */
function portablePostCrop(value) {
  const adjustment = record(value, "INVALID_POST_CROP_PRESET");
  // A bare/legacy photo-local extension was rejected before portable
  // vignetting existed. Keep that rejection contract for untyped payloads.
  if (!Object.hasOwn(adjustment, "schemaVersion") &&
      !Object.hasOwn(adjustment, "engineVersion") &&
      !Object.hasOwn(adjustment, "vignette"))
    throw new Error("PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION");
  exactKeys(adjustment, ["schemaVersion", "engineVersion", "vignette"], "INVALID_POST_CROP_PRESET");
  if (Reflect.ownKeys(adjustment).length !== 3 || adjustment.schemaVersion !== 1 ||
      adjustment.engineVersion !== VIGNETTE_ALGORITHM_VERSION)
    throw new Error("INVALID_POST_CROP_PRESET");
  const vignette = record(adjustment.vignette, "INVALID_POST_CROP_PRESET");
  exactKeys(vignette, VIGNETTE_FIELDS, "INVALID_POST_CROP_PRESET");
  if (!Object.hasOwn(vignette, "amount")) throw new Error("INVALID_POST_CROP_PRESET");
  const controls = {};
  for (const field of VIGNETTE_FIELDS) if (Object.hasOwn(vignette, field)) controls[field] = vignette[field];
  try { validateVignetteSettings(controls); }
  catch { throw new Error("INVALID_POST_CROP_PRESET"); }
  return {schemaVersion: 1, engineVersion: VIGNETTE_ALGORITHM_VERSION, vignette: controls};
}

/**
 * Produces a portable Recipe-v1 body from the currently rendered global adjustments.
 * Photo-local identity, crop, portrait, export and unknown extension data are rejected,
 * never silently copied into a shared preset.
 */
export function portablePresetRecipe(recipe) {
  const envelope = record(recipe, "INVALID_RECIPE");
  if (envelope.schemaVersion !== 1) {
    throw new Error("UNSUPPORTED_RECIPE_SCHEMA");
  }
  exactKeys(envelope, ["schemaVersion", "parameters"], "UNSUPPORTED_RECIPE_SCHEMA");
  const parameters = record(envelope.parameters, "INVALID_PARAMETERS");
  const expected = ["exposure", "contrast", "saturation", "rotationDegrees", "extendedParameters", "processingOrder"];
  if (expected.some(key => !Object.hasOwn(parameters, key))) {
    throw new Error("INVALID_RECIPE_FIELDS");
  }
  exactKeys(parameters, expected, "INVALID_RECIPE_FIELDS");
  const extensions = record(parameters.extendedParameters, "INVALID_EXTENSIONS");
  exactKeys(extensions, [POST_DECODE_STAGE, POST_CROP_STAGE, 'personalLook'], "PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION");
  if (parameters.rotationDegrees !== 0) throw new Error("PHOTO_LOCAL_ROTATION");
  if (!Array.isArray(parameters.processingOrder) || parameters.processingOrder.some(stage => !ACCEPTED_INPUT_STAGES.includes(stage)) ||
      new Set(parameters.processingOrder).size !== parameters.processingOrder.length) {
    throw new Error("UNSUPPORTED_PROCESSING_STAGE");
  }
  const hasPostDecode = Object.hasOwn(extensions, POST_DECODE_STAGE);
  if (hasPostDecode !== parameters.processingOrder.includes(POST_DECODE_STAGE)) throw new Error("UNSUPPORTED_PROCESSING_STAGE");
  if (hasPostDecode) {
    const index = parameters.processingOrder.indexOf(POST_DECODE_STAGE);
    if (parameters.processingOrder.some((stage, i) => (GLOBAL_STAGES.includes(stage) && i > index) || (stage === "rotation" && i < index))) {
      throw new Error("UNSUPPORTED_PROCESSING_STAGE");
    }
  }

  const exposure = finiteInRange(parameters.exposure, -4, 4, "INVALID_EXPOSURE");
  const contrast = finiteInRange(parameters.contrast, 0, 2, "INVALID_CONTRAST");
  const saturation = finiteInRange(parameters.saturation, 0, 2, "INVALID_SATURATION");
  const processingOrder = GLOBAL_STAGES.filter(stage => {
    const value = {exposure, contrast, saturation}[stage];
    const neutral = {exposure: 0, contrast: 1, saturation: 1}[stage];
    return value !== neutral;
  });
  const postDecode = hasPostDecode ? portablePostDecode(extensions.postDecodeAdjustments) : undefined;
  if (postDecode) processingOrder.push(POST_DECODE_STAGE);
  const postCrop = Object.hasOwn(extensions, POST_CROP_STAGE) ? portablePostCrop(extensions.postCropAdjustments) : undefined;
  // Self-contained numeric transform only: no training images, source IDs,
  // local library identity or inferred author/approval travels with it.
  const personalLook = Object.hasOwn(extensions, 'personalLook') ? validatePersonalLook(extensions.personalLook) : undefined;

  return {
    schemaVersion: 1,
    parameters: {
      exposure,
      contrast,
      saturation,
      rotationDegrees: 0,
      extendedParameters: {
        ...(postDecode ? {[POST_DECODE_STAGE]: postDecode} : {}),
        ...(postCrop ? {[POST_CROP_STAGE]: postCrop} : {}),
        ...(personalLook ? {personalLook} : {}),
      },
      processingOrder,
    },
  };
}

export function createSubmission({presetId, presetVersion, authorUserId, authorCreditName, recipe, now}) {
  if (typeof presetId !== "string" || !presetId.trim()) throw new Error("INVALID_PRESET_ID");
  if (!Number.isSafeInteger(presetVersion) || presetVersion < 1) throw new Error("INVALID_PRESET_VERSION");
  if (typeof authorUserId !== "string" || !authorUserId.trim()) throw new Error("INVALID_AUTHOR");
  if (typeof authorCreditName !== "string" || !authorCreditName.trim() || authorCreditName.length > 80) {
    throw new Error("INVALID_CREDIT_NAME");
  }
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) throw new Error("INVALID_TIMESTAMP");
  return Object.freeze({
    presetId,
    presetVersion,
    authorUserId,
    authorCreditName: authorCreditName.trim(),
    recipe: portablePresetRecipe(recipe),
    state: "SUBMITTED",
    submittedAt: now,
  });
}

export function transitionSubmission(submission, {to, actorUserId, actorRole, expectedPresetVersion}) {
  const current = record(submission, "INVALID_SUBMISSION");
  if (expectedPresetVersion !== current.presetVersion) throw new Error("PRESET_VERSION_CONFLICT");
  if (!TRANSITIONS[current.state]?.has(to)) throw new Error("INVALID_SUBMISSION_TRANSITION");
  const authorAction = to === "SUBMITTED" || to === "WITHDRAWN";
  if (authorAction && actorUserId !== current.authorUserId) throw new Error("FORBIDDEN_AUTHOR_ACTION");
  if (!authorAction && actorRole !== "OWNER" && actorRole !== "ADMIN") throw new Error("FORBIDDEN_REVIEW_ACTION");
  return Object.freeze({...current, state: to});
}
