import {assertPixels, checkAbort} from './pure.mjs';

/**
 * Display-referred RGB Levels on straight-alpha RGBA8. This is independent of
 * the existing parametric tone curve and makes no RAW/highlight recovery claim.
 * Master is applied identically to R/G/B first, then each channel's own curve.
 * Inputs and outputs are 8-bit code values; gamma > 1 brightens midtones.
 * The caller must always rerender from the unedited base, never compound frames.
 */
export const LEVELS_ALGORITHM_VERSION = 'suite-srgb8-rgb-levels-1';
export const LEVELS_CHANNELS = Object.freeze(['master', 'red', 'green', 'blue']);
const FIELDS = Object.freeze(['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite']);
const NEUTRAL = Object.freeze({inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255});
const clamp = value => Math.max(0, Math.min(1, value));

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function ownKeys(value, allowed) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)))
    throw Error('INVALID_LEVELS_PARAMETERS');
}
function codeValue(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw Error('LEVELS_CODE_VALUE_RANGE');
  return value;
}
function channel(value = {}) {
  ownKeys(value, FIELDS);
  const output = Object.fromEntries(FIELDS.map(field => [field, Object.hasOwn(value, field) ? value[field] : NEUTRAL[field]]));
  for (const field of FIELDS) if (field !== 'gamma') codeValue(output[field]);
  if (output.inputBlack >= output.inputWhite || output.outputBlack > output.outputWhite)
    throw Error('LEVELS_ENDPOINT_ORDER');
  if (typeof output.gamma !== 'number' || !Number.isFinite(output.gamma) || output.gamma < 0.1 || output.gamma > 10)
    throw Error('LEVELS_GAMMA_RANGE');
  return output;
}

/** Strict detached defaults; unknown controls are rejected, not silently omitted. */
export function validateLevels(input = {}) {
  ownKeys(input, LEVELS_CHANNELS);
  return Object.fromEntries(LEVELS_CHANNELS.map(name => [name, channel(Object.hasOwn(input, name) ? input[name] : {})]));
}

function lookup(params) {
  const table = new Uint8Array(256);
  for (let code = 0; code < 256; code++) {
    const normalized = clamp((code - params.inputBlack) / (params.inputWhite - params.inputBlack));
    const adjusted = normalized ** (1 / params.gamma);
    table[code] = Math.round(params.outputBlack + adjusted * (params.outputWhite - params.outputBlack));
  }
  return table;
}
function neutral(params) {
  return FIELDS.every(field => params[field] === NEUTRAL[field]);
}

/** Returns a detached image with identical dimensions/source frame and unchanged alpha. */
export function applyLevels(pixels, input = {}, {signal} = {}) {
  assertPixels(pixels); checkAbort(signal);
  const params = validateLevels(input);
  const {width, height} = pixels;
  const data = pixels.data.slice();
  if (LEVELS_CHANNELS.some(name => !neutral(params[name]))) {
    const master = lookup(params.master);
    const channelTables = ['red', 'green', 'blue'].map(name => lookup(params[name]));
    for (let y = 0; y < height; y++) {
      if (y % 32 === 0) checkAbort(signal);
      for (let x = 0; x < width; x++) {
        if (x % 16384 === 0) checkAbort(signal);
        const offset = (y * width + x) * 4;
        // Hidden RGB is left untouched; no neighboring pixel or alpha is sampled.
        if (pixels.data[offset + 3] === 0) continue;
        for (let color = 0; color < 3; color++)
          data[offset + color] = channelTables[color][master[pixels.data[offset + color]]];
      }
    }
  }
  checkAbort(signal);
  return {width, height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
}
