import {assertPixels, checkAbort} from './pure.mjs';
import {validateSubjectMatte} from './background-composite.mjs';

/**
 * Retains an explicitly identified shadow from an original photograph on an
 * already composited replacement. This is a deterministic, limited sRGB8
 * transfer, NOT automatic shadow extraction or Evoto's AI Retain Shadows.
 *
 * The caller must supply an authorized, independently verified shadow mask
 * that excludes old background texture and a subject mask for the same asset.
 * This module only validates binding claims; it cannot authenticate their
 * issuer. Without trustworthy masks, original scene darkness cannot be
 * distinguished safely from a shadow. Old background colors are never pasted.
 */
export const ORIGINAL_SHADOW_VERSION = 'suite-srgb8-explicit-original-shadow-1';
export const ORIGINAL_SHADOW_MAX_PIXELS = 8_000_000;
export const ORIGINAL_SHADOW_MASK_SOURCE = 'owner-manual-shadow-selection';
const CONTEXT_KEYS = ['assetID', 'originalSHA256', 'savedRevision'];
const SHADOW_PROVENANCE_KEYS = ['kind', 'source', ...CONTEXT_KEYS, 'width', 'height'];

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length &&
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));

function assertMask(mask, width, height, label) {
  if (!exact(mask, ['width', 'height', 'data']) ||
      mask.width !== width || mask.height !== height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== width * height)
    throw Error(`ORIGINAL_SHADOW_${label}_INVALID`);
}

/**
 * Bind a caller-supplied manual shadow mask to the same saved Original as the
 * existing subject-matte contract. Matching claims are not authentication:
 * the caller must obtain the context and mask from an authenticated, authorized
 * Asset/Recipe path, and must not construct them from UI-controlled fields.
 */
export function validateOriginalShadowMasks(subjectMask, shadowMask, context, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > ORIGINAL_SHADOW_MAX_PIXELS)
    throw Error('ORIGINAL_SHADOW_DIMENSIONS_INVALID');
  // This also validates exact context keys, UUID, SHA, positive saved revision,
  // and the subject mask's distinct role and authenticated-issuer claim.
  validateSubjectMatte(subjectMask, context, width, height);
  if (!exact(shadowMask, ['width', 'height', 'data', 'provenance']) ||
      shadowMask.width !== width || shadowMask.height !== height ||
      !(shadowMask.data instanceof Uint8Array || shadowMask.data instanceof Uint8ClampedArray) ||
      shadowMask.data.length !== width * height)
    throw Error('ORIGINAL_SHADOW_SHADOW_MASK_INVALID');
  const proof = shadowMask.provenance;
  if (!exact(proof, SHADOW_PROVENANCE_KEYS) ||
      proof.kind !== 'original-shadow-mask' ||
      proof.source !== ORIGINAL_SHADOW_MASK_SOURCE ||
      proof.assetID !== context.assetID ||
      proof.originalSHA256 !== context.originalSHA256 ||
      proof.savedRevision !== context.savedRevision ||
      proof.width !== width || proof.height !== height)
    throw Error('ORIGINAL_SHADOW_PROVENANCE_MISMATCH');
  return {subject: subjectMask.provenance, shadow: proof};
}

/**
 * Bound-mask version for a future authorized product path. The legacy
 * applyOriginalShadow below is a low-level pixel primitive and does not prove
 * mask provenance. This function still does not perform permission checks or
 * AI shadow extraction; those remain external fail-closed prerequisites.
 */
export function applyBoundOriginalShadow(original, composite, subjectMask, shadowMask,
  context, options = {}) {
  checkAbort(options?.signal);
  assertPixels(original);
  assertPixels(composite);
  if (original.width !== composite.width || original.height !== composite.height)
    throw Error('ORIGINAL_SHADOW_DIMENSIONS_MISMATCH');
  validateOriginalShadowMasks(subjectMask, shadowMask, context,
    original.width, original.height);
  // Project away only the already-validated provenance for the unchanged pixel
  // primitive; do not trust the original argument again after validation.
  return applyOriginalShadow(original, composite,
    {width: original.width, height: original.height, data: subjectMask.data},
    {width: original.width, height: original.height, data: shadowMask.data}, options);
}

/** Low-level compatibility primitive: it does not verify mask provenance.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} original Unedited original frame.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} composite Already composited replacement (may include Add Shadow).
 * @param {{width:number,height:number,data:Uint8Array}} subjectMask Explicit foreground alpha; any nonzero value protects the pixel.
 * @param {{width:number,height:number,data:Uint8Array}} shadowMask Explicit original-shadow strength, 0..255.
 * @param {{opacity?:number,signal?:AbortSignal}} options Opacity is an integer percentage, 0..100.
 */
export function applyOriginalShadow(original, composite, subjectMask, shadowMask, options = {}) {
  if (!plain(options) || Reflect.ownKeys(options).some(key =>
    typeof key !== 'string' || !['opacity', 'signal'].includes(key)))
    throw Error('ORIGINAL_SHADOW_OPTIONS_INVALID');
  const {opacity = 100, signal} = options;
  if (!Number.isSafeInteger(opacity) || opacity < 0 || opacity > 100)
    throw Error('ORIGINAL_SHADOW_OPTIONS_INVALID');
  checkAbort(signal);
  assertPixels(original);
  assertPixels(composite);
  const {width, height} = composite;
  if (width !== original.width || height !== original.height)
    throw Error('ORIGINAL_SHADOW_DIMENSIONS_MISMATCH');
  if (width * height > ORIGINAL_SHADOW_MAX_PIXELS)
    throw Error('ORIGINAL_SHADOW_CAPACITY');
  assertMask(subjectMask, width, height, 'SUBJECT_MASK');
  assertMask(shadowMask, width, height, 'SHADOW_MASK');

  const out = new Uint8ClampedArray(composite.data);
  if (opacity === 0) return {...composite, data: out};
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x, offset = pixel * 4;
      const mask = shadowMask.data[pixel];
      // No original shadow crosses foreground or alpha-zero pixels. This also
      // leaves hidden RGB and every output alpha byte exactly as supplied.
      if (mask === 0 || subjectMask.data[pixel] !== 0 ||
          original.data[offset + 3] === 0 || composite.data[offset + 3] === 0)
        continue;
      const luminance = (54 * original.data[offset] + 183 * original.data[offset + 1] +
        19 * original.data[offset + 2]) / 256;
      const darkness = mask / 255 * (255 - luminance) / 255 *
        original.data[offset + 3] / 255 * opacity / 100;
      if (darkness <= 0) continue;
      for (let channel = 0; channel < 3; channel++)
        out[offset + channel] = composite.data[offset + channel] * (1 - darkness);
    }
  }
  checkAbort(signal);
  return {...composite, data: out};
}
