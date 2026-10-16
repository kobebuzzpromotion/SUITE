import {assertPixels, checkAbort} from './pure.mjs';
import {applyLevels} from './levels.mjs';

export const LOCAL_LEVELS_ALGORITHM_VERSION = 'suite-srgb8-local-levels-coverage-1';

function assertCoverage(mask, width, height) {
  if (!mask || typeof mask !== 'object' || mask.width !== width || mask.height !== height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== width * height) throw Error('LOCAL_LEVELS_MASK_INVALID');
}

/**
 * Apply the existing display-referred RGB Levels to an explicit one-byte-per-
 * pixel coverage mask. 0 preserves the source byte; 255 equals applyLevels;
 * intermediate coverage linearly blends each encoded sRGB8 channel with one
 * final rounding. Straight alpha, hidden RGB, dimensions, and source pixels
 * are never changed. The mask is supplied by the caller: no person detection,
 * auto-selection, Recipe edit, or RAW recovery occurs here.
 */
export function applyLocalLevels(pixels, mask, levels = {}, {signal} = {}) {
  assertPixels(pixels);
  assertCoverage(mask, pixels.width, pixels.height);
  checkAbort(signal);
  const output = applyLevels(pixels, levels, {signal});
  const source = pixels.data, target = output.data, coverage = mask.data;
  for (let index = 0; index < coverage.length; index++) {
    if ((index & 0x3fff) === 0) checkAbort(signal);
    const offset = index * 4, amount = coverage[index];
    if (amount === 255 || source[offset + 3] === 0) continue;
    if (amount === 0) {
      target[offset] = source[offset];
      target[offset + 1] = source[offset + 1];
      target[offset + 2] = source[offset + 2];
      continue;
    }
    for (let channel = 0; channel < 3; channel++)
      target[offset + channel] = Math.round(source[offset + channel] +
        (target[offset + channel] - source[offset + channel]) * amount / 255);
  }
  checkAbort(signal);
  return output;
}
