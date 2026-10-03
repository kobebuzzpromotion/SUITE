import {assertPixels, checkAbort, srgbToLinear, linearToSrgb} from './pure.mjs';

/**
 * CUSTOM 8-bit, straight-alpha sRGB post-decode adjustments, not RAW development.
 * No Kelvin WB, camera matrix, lost-highlight recovery, skin detection or Evoto parity.
 * All controls: finite [-100,100], neutral 0. HSL hue 100 means +30 degrees;
 * HSL "luminance" adjusts HSL lightness, not measured scene luminance.
 * Integration slot: existing globals -> tone -> vibrance -> HSL -> rotation/crop.
 * The caller must rerender from the unedited base, never from an edited output.
 */
export const HSL_COLORS = Object.freeze(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']);
export const HUE_CENTERS = Object.freeze([0, 30, 60, 120, 180, 240, 270, 300]);
export const COLOR_ADJUSTMENT_ORDER = Object.freeze(['highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'hsl']);
const SCALARS = COLOR_ADJUSTMENT_ORDER.slice(0, -1), CHANNELS = ['hue', 'saturation', 'luminance'];
const clamp = x => Math.max(0, Math.min(1, x));
const wrapHue = h => ((h % 360) + 360) % 360;
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('INVALID_COLOR_ADJUSTMENTS');
}
function allowedKeys(value, allowed) {
  record(value);
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string' || !allowed.includes(k))) throw Error('UNSUPPORTED_COLOR_ADJUSTMENT');
}
function control(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 100) throw Error('COLOR_ADJUSTMENT_RANGE');
  return value;
}
/** Local adapter input check, not a replacement for the shared Recipe validator. */
export function validateColorAdjustments(input = {}) {
  allowedKeys(input, [...SCALARS, 'hsl']);
  const out = Object.fromEntries(SCALARS.map(k => [k, Object.hasOwn(input, k) ? control(input[k]) : 0]));
  const hsl = Object.hasOwn(input, 'hsl') ? input.hsl : {};
  allowedKeys(hsl, HSL_COLORS);
  out.hsl = Object.fromEntries(HSL_COLORS.map(color => {
    const channel = Object.hasOwn(hsl, color) ? hsl[color] : {};
    allowedKeys(channel, CHANNELS);
    return [color, Object.fromEntries(CHANNELS.map(k => [k, Object.hasOwn(channel, k) ? control(channel[k]) : 0]))];
  }));
  return out;
}
/** Circular adjacent-band interpolation, evaluated on the original pixel hue. */
export function hueWeights(hue) {
  if (typeof hue !== 'number' || !Number.isFinite(hue)) throw Error('INVALID_HUE');
  const h = wrapHue(hue), weights = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    const left = HUE_CENTERS[i], right = i === 7 ? 360 : HUE_CENTERS[i + 1];
    if (h >= left && h < right) {
      const t = smooth((h - left) / (right - left));
      weights[i] = 1 - t; weights[(i + 1) % 8] = t;
      return weights;
    }
  }
  throw Error('INVALID_HUE');
}
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return {h: 0, s: 0, l};
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return {h: wrapHue(h * 60), s: d / (1 - Math.abs(2 * l - 1)), l};
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, sector = wrapHue(h) / 60, x = c * (1 - Math.abs(sector % 2 - 1)), m = l - c / 2;
  const rgb = sector < 1 ? [c, x, 0] : sector < 2 ? [x, c, 0] : sector < 3 ? [0, c, x] : sector < 4 ? [0, x, c] : sector < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map(v => clamp(v + m));
}
function boundedMove(value, amount) {
  return amount >= 0 ? value + (1 - value) * amount : value * (1 + amount);
}
function rangeCurve(value, left, right, amount) {
  if (amount === 0 || value <= left || value >= right) return value;
  return left + (right - left) * ((value - left) / (right - left)) ** (2 ** -amount);
}
function tone(value, p) {
  // Each monotone curve moves its selected range toward brighter/darker values.
  let y = rangeCurve(value, .4, 1, p.highlights / 100);
  y = rangeCurve(y, 0, .6, p.shadows / 100);
  y = clamp(y + .125 * (p.whites / 100) * smooth((y - .75) / .25));
  y = clamp(y + .125 * (p.blacks / 100) * (1 - smooth(y / .25)));
  return y;
}
export function applyColorAdjustments(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels); checkAbort(signal);
  const p = validateColorAdjustments(input);
  const hasTone = SCALARS.slice(0, 4).some(k => p[k] !== 0);
  const hasHsl = HSL_COLORS.some(color => CHANNELS.some(k => p.hsl[color][k] !== 0));
  const data = pixels.data.slice();
  if (hasTone || p.vibrance !== 0 || hasHsl) {
    for (let y = 0; y < pixels.height; y++) {
      if (y % 32 === 0) checkAbort(signal);
      for (let x = 0; x < pixels.width; x++) {
        const i = (y * pixels.width + x) * 4;
        let r = pixels.data[i] / 255, g = pixels.data[i + 1] / 255, b = pixels.data[i + 2] / 255;
        if (hasTone) {
          const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b), luma = .2126 * lr + .7152 * lg + .0722 * lb, target = tone(luma, p);
          if (target !== luma) {
            // Affine move toward white/black keeps linear RGB in gamut and neutral RGB neutral.
            const k = target < luma ? target / luma : (luma < 1 ? (1 - target) / (1 - luma) : 0);
            r = clamp(linearToSrgb(clamp(target + k * (lr - luma))));
            g = clamp(linearToSrgb(clamp(target + k * (lg - luma))));
            b = clamp(linearToSrgb(clamp(target + k * (lb - luma))));
          }
        }
        if (p.vibrance !== 0 || hasHsl) {
          let {h, s, l} = rgbToHsl(r, g, b);
          if (s > 0) {
            if (p.vibrance > 0) s += (p.vibrance / 100) * s * (1 - s);
            else if (p.vibrance < 0) s *= 1 + p.vibrance / 100;
            if (hasHsl) {
              const weights = hueWeights(h); let dh = 0, ds = 0, dl = 0;
              for (let c = 0; c < 8; c++) {
                const channel = p.hsl[HSL_COLORS[c]], w = weights[c];
                dh += 30 * channel.hue / 100 * w;
                ds += channel.saturation / 100 * w;
                dl += channel.luminance / 100 * w;
              }
              h = wrapHue(h + dh); s = boundedMove(s, ds); l = boundedMove(l, dl);
            }
            [r, g, b] = hslToRgb(h, clamp(s), clamp(l));
          }
        }
        data[i] = Math.round(clamp(r) * 255); data[i + 1] = Math.round(clamp(g) * 255); data[i + 2] = Math.round(clamp(b) * 255);
      }
    }
  }
  checkAbort(signal);
  return {width: pixels.width, height: pixels.height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
}
