import {assertPixels, checkAbort} from './pure.mjs';

/**
 * Explicit-mask, 8-bit sRGB compositing only. This module does not generate or
 * authenticate a matte, load assets, check permissions, save a Recipe, or edit
 * the Original. The caller must verify the attested provenance before calling.
 */
export const BACKGROUND_COMPOSITE_VERSION = 'suite-srgb8-explicit-subject-matte-1';
export const BACKGROUND_COMPOSITE_MAX_PIXELS = 8_000_000;
const MASK_SOURCES = Object.freeze(['verified-manual-subject-matte',
  'verified-segmentation-subject-matte']);
const CONTEXT_KEYS = ['assetID', 'originalSHA256', 'savedRevision'];
const PROVENANCE_KEYS = ['kind', 'source', ...CONTEXT_KEYS, 'width', 'height'];

const exact = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const validID = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validSHA = value => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

export function validateSubjectMatte(mask, context, width, height) {
  if (!exact(context, CONTEXT_KEYS) || !validID(context.assetID) ||
      !validSHA(context.originalSHA256) ||
      !Number.isSafeInteger(context.savedRevision) || context.savedRevision < 1)
    throw Error('BACKGROUND_COMPOSITE_CONTEXT_INVALID');
  if (!exact(mask, ['width', 'height', 'data', 'provenance']) ||
      mask.width !== width || mask.height !== height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== width * height)
    throw Error('BACKGROUND_COMPOSITE_MASK_INVALID');
  const proof = mask.provenance;
  if (!exact(proof, PROVENANCE_KEYS) || proof.kind !== 'subject-alpha-mask' ||
      !MASK_SOURCES.includes(proof.source) ||
      proof.width !== width || proof.height !== height ||
      proof.assetID !== context.assetID ||
      proof.originalSHA256 !== context.originalSHA256 ||
      proof.savedRevision !== context.savedRevision)
    throw Error('BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH');
  return proof;
}

/** Foreground Original over a replacement RGBA frame, constrained by a matte. */
export function applyBackgroundComposite(original, replacement, subjectMask, context, {signal} = {}) {
  validateSubjectMatte(subjectMask, context, original.width, original.height);
  return compositeSubjectPixels(original, replacement,
    {width: subjectMask.width, height: subjectMask.height, data: subjectMask.data}, {signal});
}

/** Pure arithmetic entry; caller owns local consent or authenticated authorization. */
export function compositeSubjectPixels(original, replacement, subjectMask, {signal} = {}) {
  checkAbort(signal);
  assertPixels(original);assertPixels(replacement);
  const {width, height} = original;
  if (width * height > BACKGROUND_COMPOSITE_MAX_PIXELS)
    throw Error('BACKGROUND_COMPOSITE_CAPACITY');
  if (replacement.width !== width || replacement.height !== height)
    throw Error('BACKGROUND_COMPOSITE_DIMENSION_MISMATCH');
  if (!exact(subjectMask, ['width','height','data']) || subjectMask.width !== width ||
      subjectMask.height !== height || !(subjectMask.data instanceof Uint8Array ||
      subjectMask.data instanceof Uint8ClampedArray) || subjectMask.data.length !== width * height)
    throw Error('BACKGROUND_COMPOSITE_MASK_INVALID');
  const out = new Uint8ClampedArray(original.data.length);
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x, offset = pixel * 4;
      if ((pixel & 0x3fff) === 0) checkAbort(signal);
      const foregroundAlpha = original.data[offset + 3] / 255 * subjectMask.data[pixel] / 255;
      const backgroundAlpha = replacement.data[offset + 3] / 255;
      const alpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
      out[offset + 3] = Math.round(alpha * 255);
      if (out[offset + 3] === 0) continue; // No hidden RGB from effectively transparent input.
      for (let channel = 0; channel < 3; channel++) {
        out[offset + channel] = Math.round((original.data[offset + channel] * foregroundAlpha +
          replacement.data[offset + channel] * backgroundAlpha * (1 - foregroundAlpha)) / alpha);
      }
    }
  }
  checkAbort(signal);
  // Do not inherit an Original-only provenance claim onto composite pixels.
  return {width, height, data: out};
}
