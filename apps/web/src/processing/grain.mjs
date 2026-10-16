import {assertPixels, checkAbort} from './pure.mjs';

export const GRAIN_ALGORITHM_VERSION = 'suite-srgb8-monochrome-grain-1';
export const GRAIN_EXTENDED_ALGORITHM_VERSION = 'suite-srgb8-tonal-film-grain-1';
export const GRAIN_SETTINGS_DEFAULTS = Object.freeze({
  amount: 0, shadows: 100, midtones: 100, highlights: 100,
  size: 0, roughness: 0, colorVariation: 0,
});
const SETTINGS = Object.keys(GRAIN_SETTINGS_DEFAULTS);

function hash(value) {
  let h = value ^ (value >>> 16);
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

// Two independent uniform values yield bounded, zero-centered triangular noise.
function noiseAt(x, y, seed) {
  const position = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77) ^ seed) >>> 0;
  return (hash(position) + hash(position ^ 0x68bc21eb)) / 0x100000000 - 1;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  // Accept a structured-cloned plain object from a Worker/another realm.
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/** SUITE controls, not Evoto numeric ranges or Evoto's proprietary rendering. */
export function validateGrainSettings(input = 0) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0 || input > 100) throw Error('INVALID_GRAIN_AMOUNT');
    return Object.freeze({...GRAIN_SETTINGS_DEFAULTS, amount: input});
  }
  if (input === null || typeof input !== 'object') throw Error('INVALID_GRAIN_AMOUNT');
  if (!isPlainRecord(input) || Reflect.ownKeys(input).some(key => typeof key !== 'string' || !SETTINGS.includes(key)))
    throw Error('INVALID_GRAIN_SETTINGS');
  const settings = {...GRAIN_SETTINGS_DEFAULTS, ...input};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)
      throw Error(key === 'amount' ? 'INVALID_GRAIN_AMOUNT' : 'INVALID_GRAIN_SETTING_RANGE');
  }
  return Object.freeze(settings);
}

function smoothstep(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function noiseAtScale(x, y, seed, size) {
  if (size === 0) return noiseAt(x, y, seed);
  const scale = 1 + size * 0.08;
  const gx = x / scale, gy = y / scale;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = smoothstep(0, 1, gx - ix), fy = smoothstep(0, 1, gy - iy);
  const top = noiseAt(ix, iy, seed) * (1 - fx) + noiseAt(ix + 1, iy, seed) * fx;
  const bottom = noiseAt(ix, iy + 1, seed) * (1 - fx) + noiseAt(ix + 1, iy + 1, seed) * fx;
  return top * (1 - fy) + bottom * fy;
}

function shapedNoise(x, y, seed, size, roughness) {
  const broad = noiseAtScale(x, y, seed, size);
  const fine = size === 0 ? broad : noiseAt(x, y, seed);
  const rugged = roughness / 100;
  const mixed = broad * (1 - 0.35 * rugged) + fine * 0.35 * rugged;
  return Math.sign(mixed) * Math.abs(mixed) ** (1 - 0.65 * rugged);
}

function tonalWeight(red, green, blue, {shadows, midtones, highlights}) {
  if (shadows === 100 && midtones === 100 && highlights === 100) return 1;
  const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const shadow = 1 - smoothstep(0.15, 0.55, luma);
  const highlight = smoothstep(0.45, 0.85, luma);
  const middle = Math.max(0, 1 - shadow - highlight);
  return (shadow * shadows + middle * midtones + highlight * highlights) / 100;
}

/**
 * Add deterministic monochrome grain to decoded/rendered 8-bit sRGB pixels.
 * This is an actual texture addition, not denoising. It never edits the source
 * pixels, the alpha channel, or hidden RGB of fully transparent pixels. The
 * pixel pattern is anchored to the supplied raster coordinates and seed;
 * callers must persist/derive a stable seed and keep a stable stage position.
 * A proxy and a differently sized final raster are not pixel-identical grain.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * @param {number|{amount?:number,shadows?:number,midtones?:number,highlights?:number,size?:number,roughness?:number,colorVariation?:number}} amount
 *   Numeric calls retain the original Amount+Seed output. Object controls are
 *   finite 0..100 SUITE-only values. Tonal defaults 100 preserve the uniform
 *   legacy texture; Size/Roughness/Color Variation default to zero.
 * @param {{seed?:number,signal?:AbortSignal}} options
 */
export function applyGrain(pixels, amount = 0, {seed = 0, signal} = {}) {
  assertPixels(pixels);
  const settings = validateGrainSettings(amount);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('INVALID_GRAIN_SEED');
  checkAbort(signal);
  const data = pixels.data.slice();
  const output = {
    width: pixels.width,
    height: pixels.height,
    data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {}),
  };
  if (settings.amount === 0) return output;

  const amplitude = 48 * settings.amount / 100;
  const legacyTexture = settings.shadows === 100 && settings.midtones === 100 && settings.highlights === 100 &&
    settings.size === 0 && settings.roughness === 0 && settings.colorVariation === 0;
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      const offset = (y * pixels.width + x) * 4;
      if (pixels.data[offset + 3] === 0) continue;
      if (legacyTexture) {
        // Preserve the pre-extension Amount+Seed path byte-for-byte.
        const delta = noiseAt(x, y, seed) * amplitude;
        data[offset] = pixels.data[offset] + delta;
        data[offset + 1] = pixels.data[offset + 1] + delta;
        data[offset + 2] = pixels.data[offset + 2] + delta;
        continue;
      }
      const red = pixels.data[offset], green = pixels.data[offset + 1], blue = pixels.data[offset + 2];
      const strength = amplitude * tonalWeight(red, green, blue, settings);
      if (strength === 0) continue;
      const delta = shapedNoise(x, y, seed, settings.size, settings.roughness) * strength;
      if (settings.colorVariation === 0) {
        data[offset] = red + delta;
        data[offset + 1] = green + delta;
        data[offset + 2] = blue + delta;
        continue;
      }
      // Independent chroma noise is centered around the luma-weighted mean.
      // Color Variation changes hue texture without creating a second full frame.
      const chroma = strength * 0.75 * settings.colorVariation / 100;
      const nr = shapedNoise(x, y, seed ^ 0x62bd91a7, settings.size, settings.roughness);
      const ng = shapedNoise(x, y, seed ^ 0x348cd5ef, settings.size, settings.roughness);
      const nb = shapedNoise(x, y, seed ^ 0x764cc23b, settings.size, settings.roughness);
      const mean = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      data[offset] = red + delta + chroma * (nr - mean);
      data[offset + 1] = green + delta + chroma * (ng - mean);
      data[offset + 2] = blue + delta + chroma * (nb - mean);
    }
  }
  checkAbort(signal);
  return output;
}
