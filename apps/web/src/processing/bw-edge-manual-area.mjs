import {assertPixels, checkAbort} from './pure.mjs';
import {applyBlackWhiteEdgeRemoval, BW_EDGE_REMOVAL_MAX_PIXELS} from './bw-edge-removal.mjs';

export const BW_EDGE_MANUAL_AREA_VERSION = 'suite-srgb8-explicit-subject-and-correction-area-1';

function assertMask(mask, width, height) {
  if (!mask || typeof mask !== 'object' || Array.isArray(mask) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(mask)) ||
      Reflect.ownKeys(mask).length !== 3 ||
      !['width', 'height', 'data'].every(key => Object.hasOwn(mask, key)) ||
      mask.width !== width || mask.height !== height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== width * height)
    throw Error('BW_EDGE_MANUAL_MASK_INVALID');
}

/**
 * Restrict the existing neutral black/white boundary correction to a manually
 * authorized coverage mask. A positive coverage byte is an ON gate, not a
 * strength value; the existing pure correction chooses the RGB replacement.
 *
 * This function cannot authenticate the masks' author, Asset, Original SHA or
 * source dimensions. Its caller must verify provenance before invoking it.
 */
export function applyBlackWhiteEdgeManualArea(pixels, subjectMask, correctionMask,
  {signal} = {}) {
  checkAbort(signal);
  if (Number.isSafeInteger(pixels?.width) && Number.isSafeInteger(pixels?.height) &&
      pixels.width > 0 && pixels.height > 0 &&
      pixels.width * pixels.height > BW_EDGE_REMOVAL_MAX_PIXELS)
    throw Error('BW_EDGE_MANUAL_CAPACITY');
  assertPixels(pixels);
  assertMask(subjectMask, pixels.width, pixels.height);
  assertMask(correctionMask, pixels.width, pixels.height);
  const corrected = applyBlackWhiteEdgeRemoval(pixels, subjectMask, {signal});
  const {width, height, data} = pixels;
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (correctionMask.data[pixel] === 0) {
        const offset = pixel * 4;
        corrected.data.set(data.subarray(offset, offset + 4), offset);
      }
    }
  }
  checkAbort(signal);
  return corrected;
}
