import {assertPixels, checkAbort, MAX_PIXELS} from './processing/pure.mjs';

/**
 * SUITE's own 8-bit sRGB export-stage unsharp mask, not an Evoto preset or a
 * reapplication of the saved Editor Sharpness adjustment. Official references:
 * https://support.evoto.ai/how-to-use-import-export/
 * https://support.evoto.ai/customizing-image-export-quality-in-evoto-a-guide-to-advanced-settings/
 * They document a Screen/Print × Low/Standard/High choice, but no numeric kernel,
 * radius, gain or threshold. The named modes below use SUITE-owned provisional
 * values; they do not claim pixel parity with the referenced product. This
 * remains an export-only stage after Final resize and before encoding, never
 * a photo Recipe or a reapplication of Editor Sharpness.
 *
 * The active path keeps at most two float32 pixel planes plus a new RGBA8
 * buffer; at 12 MP those new allocations are about 192 MB. The original frame
 * and fully transparent hidden RGB remain unchanged.
 */
export const OUTPUT_SHARPENING_VERSION = 'suite-export-srgb8-unsharp-2';
export const MAX_OUTPUT_SHARPEN_PIXELS = Math.min(MAX_PIXELS, 12_000_000);

const LIMITS = Object.freeze({gain: [0, 2], radiusPx: [0.5, 3], thresholdLuma: [0, 64]});
// Explicit, editable SUITE starting points. Print uses a broader radius at
// the same output pixel dimensions; no printer/PPI compensation is inferred.
export const OUTPUT_SHARPENING_PRESETS = Object.freeze({
  screen: Object.freeze({
    low: Object.freeze({gain: 0.35, radiusPx: 0.8, thresholdLuma: 3}),
    standard: Object.freeze({gain: 0.65, radiusPx: 1, thresholdLuma: 2}),
    high: Object.freeze({gain: 1, radiusPx: 1.2, thresholdLuma: 1}),
  }),
  print: Object.freeze({
    low: Object.freeze({gain: 0.5, radiusPx: 1.3, thresholdLuma: 3}),
    standard: Object.freeze({gain: 0.85, radiusPx: 1.7, thresholdLuma: 2}),
    high: Object.freeze({gain: 1.25, radiusPx: 2.1, thresholdLuma: 1}),
  }),
});
const luma = (data, offset) => 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
const clamp = (value, limit) => Math.max(0, Math.min(limit - 1, value));

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/** `none` is the default; named modes and `manual` are SUITE-owned effects. */
export function validateOutputSharpening(settings = {kind: 'none'}) {
  if (!plainRecord(settings) || Reflect.ownKeys(settings).some(key => typeof key !== 'string'))
    throw Error('OUTPUT_SHARPENING_SETTINGS_INVALID');
  if (settings.kind === 'none') {
    if (Reflect.ownKeys(settings).length !== 1) throw Error('OUTPUT_SHARPENING_SETTINGS_INVALID');
    return Object.freeze({kind: 'none'});
  }
  if (Object.hasOwn(OUTPUT_SHARPENING_PRESETS, settings.kind)) {
    if (Reflect.ownKeys(settings).length !== 2 ||
        !Object.hasOwn(settings, 'strength') ||
        !Object.hasOwn(OUTPUT_SHARPENING_PRESETS[settings.kind], settings.strength))
      throw Error('OUTPUT_SHARPENING_PRESET_UNSUPPORTED');
    return Object.freeze({kind: settings.kind, strength: settings.strength});
  }
  if (settings.kind !== 'manual' || Reflect.ownKeys(settings).length !== 4 ||
      Object.keys(settings).some(key => key !== 'kind' && !Object.hasOwn(LIMITS, key)))
    throw Error('OUTPUT_SHARPENING_PRESET_UNSUPPORTED');
  const validated = {kind: 'manual'};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = settings[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw Error('OUTPUT_SHARPENING_RANGE_' + key.toUpperCase());
    validated[key] = value;
  }
  return Object.freeze(validated);
}

function gaussianWeights(sigma) {
  const radius = Math.ceil(2 * sigma);
  const weights = new Float64Array(radius + 1);
  for (let distance = 0; distance <= radius; distance++)
    weights[distance] = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return {radius, weights};
}

function outputFrame(pixels, data) {
  return {
    width: pixels.width, height: pixels.height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {}),
  };
}

/**
 * Pure post-resize pixel adjustment. No encoded Blob, Recipe or Original is
 * touched. The caller owns Final-only stage ordering and persistence of any
 * explicit export setting; this module alone is not a product export control.
 */
export function applyExportOutputSharpening(pixels, settings = {kind: 'none'}, {signal} = {}) {
  assertPixels(pixels);
  const mode = validateOutputSharpening(settings);
  const parameters = mode.kind === 'none' ? null :
    mode.kind === 'manual' ? mode : OUTPUT_SHARPENING_PRESETS[mode.kind][mode.strength];
  checkAbort(signal);
  if (parameters && parameters.gain !== 0 && pixels.width * pixels.height > MAX_OUTPUT_SHARPEN_PIXELS)
    throw Error('OUTPUT_SHARPENING_MEMORY_LIMIT');
  let result;
  try { result = pixels.data.slice(); }
  catch { throw Error('OUTPUT_SHARPENING_ALLOCATION_FAILED'); }
  const output = outputFrame(pixels, result);
  if (!parameters || parameters.gain === 0) return output;

  const {width, height, data} = pixels;
  const count = width * height;
  let horizontalLuma, horizontalCoverage;
  try {
    horizontalLuma = new Float32Array(count);
    horizontalCoverage = new Float32Array(count);
  } catch { throw Error('OUTPUT_SHARPENING_ALLOCATION_FAILED'); }
  const {radius, weights} = gaussianWeights(parameters.radiusPx);

  // A coverage-weighted separable Gaussian excludes transparent hidden RGB and
  // avoids color fringes: apply only a luminance residual equally to R/G/B.
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let x = 0; x < width; x++) {
      if ((x & 4095) === 0) checkAbort(signal);
      let weightedLuma = 0, coverage = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const offset = (y * width + clamp(x + dx, width)) * 4;
        const weight = weights[Math.abs(dx)] * data[offset + 3] / 255;
        coverage += weight;
        weightedLuma += weight * luma(data, offset);
      }
      const pixel = y * width + x;
      horizontalLuma[pixel] = weightedLuma;
      horizontalCoverage[pixel] = coverage;
    }
  }
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let x = 0; x < width; x++) {
      if ((x & 4095) === 0) checkAbort(signal);
      const offset = (y * width + x) * 4;
      if (data[offset + 3] === 0) continue;
      let weightedLuma = 0, coverage = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const pixel = clamp(y + dy, height) * width + x;
        const weight = weights[Math.abs(dy)];
        weightedLuma += weight * horizontalLuma[pixel];
        coverage += weight * horizontalCoverage[pixel];
      }
      if (coverage === 0) continue;
      const residual = luma(data, offset) - weightedLuma / coverage;
      if (Math.abs(residual) <= parameters.thresholdLuma) continue;
      const delta = parameters.gain * (residual - Math.sign(residual) * parameters.thresholdLuma);
      for (let channel = 0; channel < 3; channel++) result[offset + channel] = Math.round(data[offset + channel] + delta);
    }
  }
  checkAbort(signal);
  return output;
}
