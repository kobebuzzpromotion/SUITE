import {assertPixels, checkAbort} from './pure.mjs';

/**
 * Deterministic, display-referred highlight bloom on straight-alpha RGBA8.
 * This is a local optical-style effect, not AI generation, RAW development,
 * clarity, texture, grain, or a claim of parity with another application's modes.
 * Radius is measured in pixels of this raster (proxy/final scale may differ).
 * Re-render from an unchanged base frame; never compound successive previews.
 */
export const GLOW_ALGORITHM_VERSION = 'suite-srgb8-highlight-glow-1';
export const GLOW_EXTENDED_ALGORITHM_VERSION = 'suite-srgb8-editorial-glow-1';
export const GLOW_MODES = Object.freeze(['whiteMist', 'blackMist', 'halation']);
export const GLOW_LIMITS = Object.freeze({intensity: Object.freeze([0, 100]), radius: Object.freeze([1, 64]),
  threshold: Object.freeze([0, 255]), exposure: Object.freeze([-100, 100]),
  diffusion: Object.freeze([0, 100]), tint: Object.freeze([-100, 100])});
const DEFAULTS = Object.freeze({intensity: 0, radius: 8, threshold: 180});
const EXTENDED_DEFAULTS = Object.freeze({mode: 'blackMist', exposure: 0, diffusion: 0, tint: 0});
const clampIndex = (value, size) => Math.max(0, Math.min(size - 1, value));
const hasExtension = input => ['mode', 'exposure', 'diffusion', 'tint'].some(key => Object.hasOwn(input, key));
function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || (Object.getPrototypeOf(prototype) === null &&
    Object.hasOwn(prototype, 'constructor') &&
    typeof prototype.constructor === 'function' && prototype.constructor.name === 'Object');
}

/** No unknown or non-finite controls may silently enter a saved glow stage. */
export function validateGlow(input = {}) {
  if (!plainRecord(input) ||
      Reflect.ownKeys(input).some(key => typeof key !== 'string' ||
        !Object.hasOwn(DEFAULTS, key) && !Object.hasOwn(EXTENDED_DEFAULTS, key)))
    throw Error('INVALID_GLOW_PARAMETERS');
  const result = {...DEFAULTS, ...EXTENDED_DEFAULTS, ...input};
  if (typeof result.intensity !== 'number' || !Number.isFinite(result.intensity) || result.intensity < 0 || result.intensity > 100)
    throw Error('GLOW_INTENSITY_RANGE');
  if (!Number.isInteger(result.radius) || result.radius < 1 || result.radius > 64)
    throw Error('GLOW_RADIUS_RANGE');
  if (!Number.isInteger(result.threshold) || result.threshold < 0 || result.threshold > 255)
    throw Error('GLOW_THRESHOLD_RANGE');
  if (!GLOW_MODES.includes(result.mode)) throw Error('GLOW_MODE_INVALID');
  for (const [key, [min, max]] of Object.entries({exposure: GLOW_LIMITS.exposure,
    diffusion: GLOW_LIMITS.diffusion, tint: GLOW_LIMITS.tint})) {
    if (typeof result[key] !== 'number' || !Number.isFinite(result[key]) ||
        result[key] < min || result[key] > max) throw Error('GLOW_CONTROL_RANGE');
  }
  return result;
}

function glowSignal(pixels, settings, signal) {
  const {width, height} = pixels;
  const count = width * height;
  const highlights = new Uint8Array(count), horizontal = new Uint8Array(count);
  const radius = Math.min(192, settings.radius + Math.round(settings.radius * settings.diffusion / 50));
  const span = 2 * radius + 1;
  for (let k = 0; k < count; k++) {
    if ((k & 0x3fff) === 0) checkAbort(signal);
    const offset = k * 4, alpha = pixels.data[offset + 3];
    if (alpha === 0) continue;
    const luminance = 0.2126 * pixels.data[offset] + 0.7152 * pixels.data[offset + 1] + 0.0722 * pixels.data[offset + 2];
    const selected = settings.threshold === 255 ? 0 :
      Math.max(0, luminance - settings.threshold) / (255 - settings.threshold);
    const ambient = settings.mode === 'whiteMist' ? 0.2 : 0;
    highlights[k] = Math.round(255 * Math.min(1, ambient + (1 - ambient) * selected) * alpha / 255);
  }
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    const start = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) sum += highlights[start + clampIndex(dx, width)];
    for (let x = 0; x < width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      horizontal[start + x] = Math.round(sum / span);
      sum += highlights[start + clampIndex(x + radius + 1, width)] - highlights[start + clampIndex(x - radius, width)];
    }
  }
  // The source signal is no longer read after the horizontal pass. Reuse its
  // frame-sized buffer instead of allocating a third grayscale frame.
  const blurred = highlights;
  for (let x = 0; x < width; x++) {
    if ((x & 31) === 0) checkAbort(signal);
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) sum += horizontal[clampIndex(dy, height) * width + x];
    for (let y = 0; y < height; y++) {
      if ((y & 0x3fff) === 0) checkAbort(signal);
      blurred[y * width + x] = Math.round(sum / span);
      sum += horizontal[clampIndex(y + radius + 1, height) * width + x] -
        horizontal[clampIndex(y - radius, height) * width + x];
    }
  }
  checkAbort(signal);
  return blurred;
}

function glowStrength(pixels, offset, field, settings) {
  if (pixels.data[offset + 3] === 0) return 0;
  const gain = Math.pow(2, settings.exposure / 100);
  let strength = field * settings.intensity / 100 * gain;
  if (settings.mode === 'blackMist') {
    const luma = (0.2126 * pixels.data[offset] + 0.7152 * pixels.data[offset + 1] +
      0.0722 * pixels.data[offset + 2]) / 255;
    strength *= 0.2 + 0.8 * Math.min(1, luma / 0.7);
  }
  if (settings.mode === 'halation') strength *= 1.4;
  return Math.min(255, strength);
}

function tintWeights(settings) {
  const tint = settings.tint / 100;
  if (settings.mode === 'halation') return [1 + 0.3 * tint, 0.55, 0.22 - 0.2 * tint];
  return [1 + 0.25 * tint, 1, 1 - 0.25 * tint];
}

/** SUITE-only optical approximations of the three looks, not Evoto pixel parity. */
function applyExtendedGlow(pixels, settings, signal) {
  const {width, height} = pixels, data = pixels.data.slice();
  const output = {width, height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
  if (settings.intensity === 0) return output;
  const field = glowSignal(pixels, settings, signal), weights = tintWeights(settings);
  for (let k = 0; k < width * height; k++) {
    if ((k & 0x3fff) === 0) checkAbort(signal);
    const offset = k * 4, strength = glowStrength(pixels, offset, field[k], settings);
    if (strength <= 0) continue;
    for (let channel = 0; channel < 3; channel++) {
      const base = pixels.data[offset + channel];
      data[offset + channel] = Math.round(base + (255 - base) * Math.min(1, strength * weights[channel] / 255));
    }
  }
  checkAbort(signal);
  return output;
}

/** Preview-only RGBA overlay. Never merge this visualization into Final pixels. */
export function createGlowMaskOverlay(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels); checkAbort(signal);
  const settings = validateGlow(input), {width, height} = pixels;
  const data = new Uint8ClampedArray(width * height * 4);
  if (settings.intensity === 0) return {width, height, data};
  const field = glowSignal(pixels, settings, signal);
  for (let k = 0; k < width * height; k++) {
    if ((k & 0x3fff) === 0) checkAbort(signal);
    const strength = glowStrength(pixels, k * 4, field[k], settings);
    if (strength <= 0) continue;
    const offset = k * 4;
    data[offset] = 255; data[offset + 1] = 40; data[offset + 2] = 70;
    data[offset + 3] = Math.round(Math.min(190, strength * 1.5));
  }
  checkAbort(signal);
  return {width, height, data};
}

/** Positive intensity adds a soft, threshold-selected halo without modifying alpha. */
export function applyGlow(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels); checkAbort(signal);
  const settings = validateGlow(input);
  if (hasExtension(input)) return applyExtendedGlow(pixels, settings, signal);
  const {intensity, radius, threshold} = settings;
  const {width, height} = pixels;
  const data = pixels.data.slice();
  const output = {width, height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
  if (intensity === 0 || threshold === 255) return output;

  const count = width * height;
  // Two one-byte full-frame buffers + the detached RGBA output. No second RGBA
  // copy or quadratic-radius kernel. assertPixels bounds count to MAX_PIXELS.
  const highlights = new Uint8Array(count);
  const horizontal = new Uint8Array(count);
  const span = 2 * radius + 1;
  for (let k = 0; k < count; k++) {
    if ((k & 0x3fff) === 0) checkAbort(signal);
    const i = k * 4, alpha = pixels.data[i + 3];
    if (alpha === 0) continue; // hidden RGB may not light adjacent pixels
    const luma = 0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2];
    highlights[k] = Math.round(255 * Math.max(0, luma - threshold) / (255 - threshold) * alpha / 255);
  }

  // Separable, edge-clamped box blur. Sliding sums keep work O(pixel count),
  // independent of radius. Horizontal and vertical passes never use edited RGB.
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    const start = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) sum += highlights[start + clampIndex(dx, width)];
    for (let x = 0; x < width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      horizontal[start + x] = Math.round(sum / span);
      sum += highlights[start + clampIndex(x + radius + 1, width)] - highlights[start + clampIndex(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x++) {
    if ((x & 31) === 0) checkAbort(signal);
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) sum += horizontal[clampIndex(dy, height) * width + x];
    for (let y = 0; y < height; y++) {
      if ((y & 0x3fff) === 0) checkAbort(signal);
      const i = (y * width + x) * 4;
      if (pixels.data[i + 3] !== 0) {
        const glow = (sum / span) * intensity / 100;
        if (glow > 0) for (let c = 0; c < 3; c++) {
          const base = pixels.data[i + c];
          data[i + c] = Math.round(base + (255 - base) * glow / 255);
        }
      }
      sum += horizontal[clampIndex(y + radius + 1, height) * width + x] -
        horizontal[clampIndex(y - radius, height) * width + x];
    }
  }
  checkAbort(signal);
  return output;
}
