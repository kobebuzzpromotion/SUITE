import {assertPixels, checkAbort} from './pure.mjs';

// A bounded SUITE 8-bit sRGB treatment for an ALREADY VERIFIED subject mask.
// Evoto's automatic affected-area detection, brush/eraser, Update and sync are
// not implemented by this pure function. It never generates a subject mask.
export const BW_EDGE_REMOVAL_VERSION = 'suite-srgb8-explicit-mask-bw-edge-1';
export const BW_EDGE_REMOVAL_MAX_PIXELS = 8_000_000;
const EDGE_BAND = 2;
const DONOR_RADIUS = 4;

function validMask(mask, width, height) {
  if (!mask || typeof mask !== 'object' || Array.isArray(mask) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(mask)) ||
      Reflect.ownKeys(mask).length !== 3 ||
      !['width', 'height', 'data'].every(key => Object.hasOwn(mask, key)) ||
      mask.width !== width || mask.height !== height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== width * height)
    throw Error('BW_EDGE_MASK_INVALID');
}

const maskAt = (mask, width, height, x, y) =>
  x < 0 || y < 0 || x >= width || y >= height ? null : mask[y * width + x];

function nearExplicitBackground(mask, width, height, x, y) {
  for (let dy = -EDGE_BAND; dy <= EDGE_BAND; dy++)
    for (let dx = -EDGE_BAND; dx <= EDGE_BAND; dx++)
      if (maskAt(mask, width, height, x + dx, y + dy) === 0) return true;
  return false;
}

function safeInterior(mask, width, height, x, y) {
  if (maskAt(mask, width, height, x, y) !== 255) return false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (!(maskAt(mask, width, height, x + dx, y + dy) > 0)) return false;
  return true;
}

function haloKind(data, offset) {
  const r = data[offset], g = data[offset + 1], b = data[offset + 2];
  const lowest = Math.min(r, g, b), highest = Math.max(r, g, b);
  if (highest - lowest > 48) return null;
  if (highest <= 35) return 'black';
  if (lowest >= 220) return 'white';
  return null;
}

const luma = (data, offset) =>
  (data[offset] * 54 + data[offset + 1] * 183 + data[offset + 2] * 19) / 256;

function interiorDonor(pixels, mask, x, y, kind) {
  const {width, height, data} = pixels, sourceOffset = (y * width + x) * 4;
  const sourceLuma = luma(data, sourceOffset);
  let closest = Infinity, donors = [];
  for (let dy = -DONOR_RADIUS; dy <= DONOR_RADIUS; dy++)
    for (let dx = -DONOR_RADIUS; dx <= DONOR_RADIUS; dx++) {
      const distance = dx * dx + dy * dy;
      if (distance === 0 || distance > DONOR_RADIUS * DONOR_RADIUS || distance > closest) continue;
      const xx = x + dx, yy = y + dy;
      if (!safeInterior(mask, width, height, xx, yy)) continue;
      const offset = (yy * width + xx) * 4;
      if (data[offset + 3] === 0) continue;
      const donorLuma = luma(data, offset);
      if (kind === 'black' ? donorLuma - sourceLuma < 48 : sourceLuma - donorLuma < 48)
        continue;
      if (distance < closest) {closest = distance; donors = [offset];}
      else donors.push(offset);
    }
  if (!donors.length) return null;
  return [0, 1, 2].map(channel => Math.round(donors.reduce((sum, offset) =>
    sum + data[offset + channel], 0) / donors.length));
}

/**
 * Correct only extreme neutral fringe pixels near an explicit subject mask's
 * background boundary. Internal subject colour, alpha, source and mask remain
 * byte-identical. A missing interior reference leaves the pixel unchanged.
 */
export function applyBlackWhiteEdgeRemoval(pixels, subjectMask, {signal} = {}) {
  checkAbort(signal);
  assertPixels(pixels);
  if (pixels.width * pixels.height > BW_EDGE_REMOVAL_MAX_PIXELS)
    throw Error('BW_EDGE_CAPACITY');
  validMask(subjectMask, pixels.width, pixels.height);
  const {width, height, data} = pixels, mask = subjectMask.data;
  const output = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const index = y * width + x, offset = index * 4;
      if (mask[index] === 0 || data[offset + 3] === 0 ||
          !nearExplicitBackground(mask, width, height, x, y)) continue;
      const kind = haloKind(data, offset);
      if (!kind) continue;
      const donor = interiorDonor(pixels, mask, x, y, kind);
      if (!donor) continue;
      output.set(donor, offset);
    }
  }
  checkAbort(signal);
  return {...pixels, data: output};
}
