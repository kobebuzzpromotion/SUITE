import {assertPixels, checkAbort} from './pure.mjs';

/**
 * SUITE-owned display-referred Selective Color on straight-alpha RGBA8.
 * Evoto documents nine ranges, four signed CMYK controls and two methods:
 * https://support.evoto.ai/color-adjustment-feature-modules/
 * Relative/Absolute are defined conceptually in Adobe's public reference:
 * https://helpx.adobe.com/photoshop/desktop/adjust-color/selective-color-adjustments/make-selective-color-adjustments.html
 * The hue/tone masks and RGB ink mapping below are SUITE's limited design,
 * NOT Evoto/Photoshop pixel-equivalent algorithms or ICC print conversion.
 */
export const SELECTIVE_COLOR_ALGORITHM_VERSION = 'suite-srgb8-selective-color-1';
export const SELECTIVE_COLOR_RANGES = Object.freeze([
  'reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks',
]);
export const SELECTIVE_COLOR_CONTROLS = Object.freeze(['cyan', 'magenta', 'yellow', 'black']);
const HUE_CENTERS = Object.freeze({reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300});
const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = (low, high, value) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  // Worker-cloned JSON can have a different realm's Object.prototype. Its
  // prototype is nevertheless the terminal Object prototype, unlike an
  // instance of a user-defined class (which has another prototype above it).
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || (Object.getPrototypeOf(prototype) === null &&
    Object.hasOwn(prototype, 'constructor') &&
    typeof prototype.constructor === 'function' && prototype.constructor.name === 'Object');
}
function exactKeys(value, allowed) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)))
    throw Error('INVALID_SELECTIVE_COLOR');
}

/** Strict detached defaults: optional method and nine optional CMYK groups. */
export function validateSelectiveColor(input = {}) {
  exactKeys(input, ['method', 'ranges']);
  const method = Object.hasOwn(input, 'method') ? input.method : 'relative';
  if (method !== 'relative' && method !== 'absolute') throw Error('INVALID_SELECTIVE_COLOR_METHOD');
  const supplied = Object.hasOwn(input, 'ranges') ? input.ranges : {};
  exactKeys(supplied, SELECTIVE_COLOR_RANGES);
  const ranges = Object.fromEntries(SELECTIVE_COLOR_RANGES.map(name => {
    const controls = Object.hasOwn(supplied, name) ? supplied[name] : {};
    exactKeys(controls, SELECTIVE_COLOR_CONTROLS);
    const values = Object.fromEntries(SELECTIVE_COLOR_CONTROLS.map(control =>
      [control, Object.hasOwn(controls, control) ? controls[control] : 0]));
    if (SELECTIVE_COLOR_CONTROLS.some(control => !Number.isInteger(values[control]) || values[control] < -100 || values[control] > 100))
      throw Error('SELECTIVE_COLOR_RANGE');
    return [name, values];
  }));
  return {method, ranges};
}

function hueDegrees(red, green, blue, maximum, chroma) {
  if (chroma === 0) return 0;
  let sector;
  if (maximum === red) sector = ((green - blue) / chroma) % 6;
  else if (maximum === green) sector = (blue - red) / chroma + 2;
  else sector = (red - green) / chroma + 4;
  return (sector * 60 + 360) % 360;
}

/**
 * Triangular hue windows cover adjacent 60-degree sectors; normalized chroma
 * fades hue selection toward gray. Tone families use deliberately documented
 * smooth RGB extrema masks: white=min RGB 0.50..0.85, black=max RGB 0.15..0.50,
 * and neutral is the remaining tonal weight. Masks are based on INPUT pixels.
 */
function familyWeight(name, maximum, minimum, chroma, hue) {
  if (Object.hasOwn(HUE_CENTERS, name)) {
    if (maximum === 0 || chroma === 0) return 0;
    const distance = Math.abs(hue - HUE_CENTERS[name]);
    return (chroma / maximum) * Math.max(0, 1 - Math.min(distance, 360 - distance) / 60);
  }
  const white = smoothstep(0.50, 0.85, minimum);
  const black = 1 - smoothstep(0.15, 0.50, maximum);
  if (name === 'whites') return white;
  if (name === 'blacks') return black;
  return Math.max(0, 1 - white - black);
}

/**
 * Positive C/M/Y subtracts R/G/B respectively; positive K subtracts all RGB.
 * Relative change scales by the pixel's existing C=1-R, M=1-G, Y=1-B or
 * K=1-max(R,G,B); Absolute changes by a direct fraction. All active family
 * effects are accumulated against the original pixel (order-independent),
 * weighted by their input-space masks, and clamped only at the final RGB8.
 * Alpha and hidden RGB of alpha-zero pixels are copied byte-exact.
 */
export function applySelectiveColor(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels);
  const params = validateSelectiveColor(input);
  checkAbort(signal);
  const data = pixels.data.slice();
  const output = {width: pixels.width, height: pixels.height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
  const active = SELECTIVE_COLOR_RANGES.filter(name =>
    SELECTIVE_COLOR_CONTROLS.some(control => params.ranges[name][control] !== 0));
  if (!active.length) return output;

  const relative = params.method === 'relative';
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      const offset = (y * pixels.width + x) * 4;
      if (pixels.data[offset + 3] === 0) continue;
      const red = pixels.data[offset] / 255, green = pixels.data[offset + 1] / 255, blue = pixels.data[offset + 2] / 255;
      const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue), chroma = maximum - minimum;
      const hue = hueDegrees(red, green, blue, maximum, chroma);
      let cyan = 0, magenta = 0, yellow = 0, black = 0;
      for (const name of active) {
        const weight = familyWeight(name, maximum, minimum, chroma, hue);
        if (weight === 0) continue;
        const sliders = params.ranges[name];
        cyan += weight * sliders.cyan / 100;
        magenta += weight * sliders.magenta / 100;
        yellow += weight * sliders.yellow / 100;
        black += weight * sliders.black / 100;
      }
      if (cyan === 0 && magenta === 0 && yellow === 0 && black === 0) continue;
      const kAmount = black * (relative ? 1 - maximum : 1);
      data[offset] = Math.round(clamp(red - cyan * (relative ? 1 - red : 1) - kAmount) * 255);
      data[offset + 1] = Math.round(clamp(green - magenta * (relative ? 1 - green : 1) - kAmount) * 255);
      data[offset + 2] = Math.round(clamp(blue - yellow * (relative ? 1 - blue : 1) - kAmount) * 255);
    }
  }
  checkAbort(signal);
  return output;
}
