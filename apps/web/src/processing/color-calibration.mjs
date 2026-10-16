import {assertPixels, checkAbort, srgbToLinear, linearToSrgb} from './pure.mjs';

/**
 * SUITE-owned display-referred calibration of linearized sRGB primaries.
 * This is NOT Evoto parameter, camera-profile, DCP, or RAW-stage equivalence.
 * Hue endpoints turn each primary's Cb/Cr vector by +/-30 degrees; saturation
 * endpoints scale its vector from 0 to 2. Linear Rec.709 luma is retained
 * before gamut clipping. Callers must rerender from the unedited image base.
 */
export const COLOR_CALIBRATION_ALGORITHM_VERSION = 'suite-srgb8-primary-calibration-1';
export const COLOR_CALIBRATION_PRIMARIES = Object.freeze(['red', 'green', 'blue']);
const CONTROLS = Object.freeze(['hue', 'saturation']);
const WEIGHTS = [0.2126, 0.7152, 0.0722];
const MAX_HUE_RADIANS = Math.PI / 6;
const clamp = value => Math.max(0, Math.min(1, value));
const code = value => Math.round(clamp(linearToSrgb(clamp(value))) * 255);

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exactKeys(value, allowed) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)))
    throw Error('INVALID_COLOR_CALIBRATION');
}

/** Strict, detached defaults; six integer controls range from -100 to 100. */
export function validateColorCalibration(input = {}) {
  exactKeys(input, COLOR_CALIBRATION_PRIMARIES);
  return Object.fromEntries(COLOR_CALIBRATION_PRIMARIES.map(primary => {
    const candidate = Object.hasOwn(input, primary) ? input[primary] : {};
    exactKeys(candidate, CONTROLS);
    const values = Object.fromEntries(CONTROLS.map(control => [control,
      Object.hasOwn(candidate, control) ? candidate[control] : 0]));
    if (CONTROLS.some(control => !Number.isInteger(values[control]) || values[control] < -100 || values[control] > 100))
      throw Error('COLOR_CALIBRATION_RANGE');
    return [primary, values];
  }));
}

function chroma(red, green, blue) {
  const y = WEIGHTS[0] * red + WEIGHTS[1] * green + WEIGHTS[2] * blue;
  return {y, cb: (blue - y) / (2 * (1 - WEIGHTS[2])), cr: (red - y) / (2 * (1 - WEIGHTS[0]))};
}

const BASIS = [chroma(1, 0, 0), chroma(0, 1, 0), chroma(0, 0, 1)];

function primaryDeltas(settings) {
  return COLOR_CALIBRATION_PRIMARIES.map((primary, index) => {
    const {hue, saturation} = settings[primary];
    if (hue === 0 && saturation === 0) return {cb: 0, cr: 0};
    const angle = hue / 100 * MAX_HUE_RADIANS;
    const strength = 1 + saturation / 100;
    const {cb, cr} = BASIS[index];
    return {
      cb: strength * (cb * Math.cos(angle) - cr * Math.sin(angle)) - cb,
      cr: strength * (cb * Math.sin(angle) + cr * Math.cos(angle)) - cr,
    };
  });
}

/**
 * Per-pixel primary-basis transform. Unlike HSL, the three separately set
 * primaries jointly define a color matrix; unlike Levels, this changes color
 * chroma rather than channel tone endpoints. For a neutral RGB triplet, the
 * centered primary coefficients all vanish, so gray/white/black are exact.
 * Alpha and fully transparent hidden RGB remain unchanged. Output is detached.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray,sourceWidth?:number,sourceHeight?:number}} pixels
 * @param {{red?:{hue?:number,saturation?:number},green?:{hue?:number,saturation?:number},blue?:{hue?:number,saturation?:number}}} input
 * @param {{signal?:AbortSignal}} options
 */
export function applyColorCalibration(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels);
  const settings = validateColorCalibration(input);
  checkAbort(signal);
  const data = pixels.data.slice();
  const output = {width: pixels.width, height: pixels.height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
  const deltas = primaryDeltas(settings);
  if (deltas.every(delta => delta.cb === 0 && delta.cr === 0)) return output;
  const [redDelta, greenDelta, blueDelta] = deltas;

  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      const offset = (y * pixels.width + x) * 4;
      if (pixels.data[offset + 3] === 0) continue;
      const r = pixels.data[offset], g = pixels.data[offset + 1], b = pixels.data[offset + 2];
      if (r === g && g === b) continue;
      const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255);
      const average = (lr + lg + lb) / 3;
      const dr = lr - average, dg = lg - average, db = lb - average;
      const changeCb = dr * redDelta.cb + dg * greenDelta.cb + db * blueDelta.cb;
      const changeCr = dr * redDelta.cr + dg * greenDelta.cr + db * blueDelta.cr;
      if (Math.abs(changeCb) < 1e-15 && Math.abs(changeCr) < 1e-15) continue;
      const yLinear = WEIGHTS[0] * lr + WEIGHTS[1] * lg + WEIGHTS[2] * lb;
      const newCr = (lr - yLinear) / (2 * (1 - WEIGHTS[0])) + changeCr;
      const newCb = (lb - yLinear) / (2 * (1 - WEIGHTS[2])) + changeCb;
      const outRed = yLinear + 2 * (1 - WEIGHTS[0]) * newCr;
      const outBlue = yLinear + 2 * (1 - WEIGHTS[2]) * newCb;
      const outGreen = (yLinear - WEIGHTS[0] * outRed - WEIGHTS[2] * outBlue) / WEIGHTS[1];
      data[offset] = code(outRed);
      data[offset + 1] = code(outGreen);
      data[offset + 2] = code(outBlue);
    }
  }
  checkAbort(signal);
  return output;
}
