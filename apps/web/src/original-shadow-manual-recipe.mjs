import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {ORIGINAL_SHADOW_VERSION, ORIGINAL_SHADOW_MAX_PIXELS} from
  './processing/original-shadow.mjs';

/** A data label, not an authentication or mask-issuer attestation. */
export const ORIGINAL_SHADOW_MANUAL_SOURCE = 'owner-manual-input-unverified';
// Matches the current RAW decoder; not an allocation allowance for masks.
export const ORIGINAL_SHADOW_MANUAL_MAX_SOURCE_PIXELS = 96_000_000;
export const ORIGINAL_SHADOW_MANUAL_MAX_STROKES = 64;
export const ORIGINAL_SHADOW_MANUAL_MAX_POINTS = 4096;
export const ORIGINAL_SHADOW_MANUAL_MAX_JSON_BYTES = 96 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/iu;
const BINDING = ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
  'backdropID', 'backdropSHA256'];
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unit = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && value <= 1;
function exact(value, keys) {
  if (!plain(value) || Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}
function dense(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1) return false;
  return Array.from({length: value.length}, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  }).every(Boolean);
}
function abort(signal) {
  if (signal?.aborted) throw new DOMException('Original Shadow manual cancelled', 'AbortError');
}
function bindingCopy(input) {
  if (!exact(input, BINDING) || !UUID.test(input.assetID) ||
      !SHA.test(input.originalSHA256) || !UUID.test(input.backdropID) ||
      !SHA.test(input.backdropSHA256) || input.assetID === input.backdropID ||
      !Number.isSafeInteger(input.sourceWidth) || input.sourceWidth < 1 ||
      !Number.isSafeInteger(input.sourceHeight) || input.sourceHeight < 1 ||
      input.sourceWidth * input.sourceHeight > ORIGINAL_SHADOW_MANUAL_MAX_SOURCE_PIXELS)
    throw Error('ORIGINAL_SHADOW_MANUAL_BINDING_INVALID');
  return Object.freeze(Object.fromEntries(BINDING.map(key => [key, input[key]])));
}
function strokeCopy(input) {
  if (!exact(input, ['operation', 'path', 'radiusFraction', 'hardness']) ||
      !['ADD', 'ERASE'].includes(input.operation) ||
      !dense(input.path, 1, ORIGINAL_SHADOW_MANUAL_MAX_POINTS) ||
      typeof input.radiusFraction !== 'number' ||
      !Number.isFinite(input.radiusFraction) ||
      input.radiusFraction < .001 || input.radiusFraction > .25 ||
      !unit(input.hardness))
    throw Error('ORIGINAL_SHADOW_MANUAL_STROKE_INVALID');
  const path = input.path.map(point => {
    if (!exact(point, ['u', 'v']) || !unit(point.u) || !unit(point.v))
      throw Error('ORIGINAL_SHADOW_MANUAL_POINT_INVALID');
    return Object.freeze({u: point.u, v: point.v});
  });
  return Object.freeze({operation: input.operation, path: Object.freeze(path),
    radiusFraction: input.radiusFraction, hardness: input.hardness});
}
function copyLayer(value, signal) {
  if (!dense(value, 1, ORIGINAL_SHADOW_MANUAL_MAX_STROKES))
    throw Error('ORIGINAL_SHADOW_MANUAL_STROKES_INVALID');
  return value.map(stroke => {abort(signal); return strokeCopy(stroke);});
}
function jsonCopy(value, signal, seen = new Set(), depth = 0) {
  abort(signal);
  if (depth > 64) throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value) ||
      !Array.isArray(value) && !plain(value))
    throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
  seen.add(value);
  let copied;
  if (Array.isArray(value)) {
    if (!dense(value, 0, Number.MAX_SAFE_INTEGER))
      throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
    copied = value.map(item => jsonCopy(item, signal, seen, depth + 1));
  } else {
    copied = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value'))
        throw Error('ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID');
      Object.defineProperty(copied, key, {value: jsonCopy(descriptor.value, signal,
        seen, depth + 1), enumerable: true, configurable: true, writable: true});
    }
  }
  seen.delete(value);
  return copied;
}

/** Shape-only validation. Expected binding must come from a separate fresh auth gate. */
export function validateOriginalShadowManualDocument(document, expectedBinding,
  {signal} = {}) {
  abort(signal);
  if (!exact(document, ['schemaVersion', 'engineVersion', 'source', 'binding',
    'subjectStrokes', 'shadowStrokes', 'settings']) || document.schemaVersion !== 1 ||
      document.engineVersion !== ORIGINAL_SHADOW_VERSION ||
      document.source !== ORIGINAL_SHADOW_MANUAL_SOURCE)
    throw Error('ORIGINAL_SHADOW_MANUAL_DOCUMENT_INVALID');
  const binding = bindingCopy(document.binding);
  const expected = bindingCopy(expectedBinding);
  if (BINDING.some(key => binding[key] !== expected[key]))
    throw Error('ORIGINAL_SHADOW_MANUAL_BINDING_MISMATCH');
  const subjectStrokes = copyLayer(document.subjectStrokes, signal);
  const shadowStrokes = copyLayer(document.shadowStrokes, signal);
  const strokes = [...subjectStrokes, ...shadowStrokes];
  if (strokes.length > ORIGINAL_SHADOW_MANUAL_MAX_STROKES ||
      strokes.reduce((sum, stroke) => sum + stroke.path.length, 0) >
        ORIGINAL_SHADOW_MANUAL_MAX_POINTS)
    throw Error('ORIGINAL_SHADOW_MANUAL_CAPACITY');
  if (!subjectStrokes.some(stroke => stroke.operation === 'ADD') ||
      !shadowStrokes.some(stroke => stroke.operation === 'ADD'))
    throw Error('ORIGINAL_SHADOW_MANUAL_ADD_REQUIRED');
  if (!exact(document.settings, ['opacity']) ||
      !Number.isSafeInteger(document.settings.opacity) ||
      document.settings.opacity < 0 || document.settings.opacity > 100)
    throw Error('ORIGINAL_SHADOW_MANUAL_SETTINGS_INVALID');
  const result = Object.freeze({schemaVersion: 1, engineVersion: ORIGINAL_SHADOW_VERSION,
    source: ORIGINAL_SHADOW_MANUAL_SOURCE, binding,
    subjectStrokes: Object.freeze(subjectStrokes),
    shadowStrokes: Object.freeze(shadowStrokes),
    settings: Object.freeze({opacity: document.settings.opacity})});
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength >
      ORIGINAL_SHADOW_MANUAL_MAX_JSON_BYTES)
    throw Error('ORIGINAL_SHADOW_MANUAL_JSON_LIMIT');
  abort(signal);
  return result;
}

function bindingFrom(target, backdrop) {
  if (!exact(target, ['id', 'sha256', 'sourceWidth', 'sourceHeight', 'savedRevision']) ||
      !exact(backdrop, ['id', 'sha256']) ||
      !Number.isSafeInteger(target.savedRevision) || target.savedRevision < 1)
    throw Error('ORIGINAL_SHADOW_MANUAL_CONTEXT_INVALID');
  return bindingCopy({assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: target.sourceWidth, sourceHeight: target.sourceHeight,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256});
}

/**
 * Builds a candidate photo-local Recipe without authorizing or persisting it.
 * `target`/`backdrop` MUST be supplied by independent fresh Asset/Original gates;
 * `draftBaseRevision` is runtime-only and MUST be checked again by save CAS.
 * It is deliberately never persisted in the photo-bound stroke document: after
 * a successful save the current Recipe revision advances.
 * equal caller-provided fields, the manual source label and owner clicks are not
 * authentication. Backend typed validation, reference/permission/CAS save gate,
 * raster mask generation, Worker Preview/Final and AI extraction are NOT connected.
 */
export function buildOriginalShadowManualRecipe(options) {
  if (!exact(options, ['recipe', 'document', 'target', 'backdrop', 'draftBaseRevision']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'draftBaseRevision', 'signal']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'draftBaseRevision',
        'replaceBackdrop']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'draftBaseRevision',
        'replaceBackdrop', 'signal']))
    throw Error('ORIGINAL_SHADOW_MANUAL_INPUT_INVALID');
  const {recipe, document, target, backdrop, draftBaseRevision, signal,
    replaceBackdrop = false} = options;
  if (typeof replaceBackdrop !== 'boolean') throw Error('ORIGINAL_SHADOW_MANUAL_INPUT_INVALID');
  abort(signal);
  const expected = bindingFrom(target, backdrop);
  if (!Number.isSafeInteger(draftBaseRevision) || draftBaseRevision < 1 ||
      draftBaseRevision !== target.savedRevision)
    throw Error('ORIGINAL_SHADOW_MANUAL_REVISION_MISMATCH');
  const checked = validateOriginalShadowManualDocument(document, expected, {signal});
  const copied = jsonCopy(recipe, signal);
  validateRecipe(copied);
  const extra = copied.parameters.extendedParameters;
  if (Object.hasOwn(extra, 'addShadowManual')) {
    const binding = extra.addShadowManual?.binding;
    if (!binding || binding.assetID !== expected.assetID ||
        binding.originalSHA256 !== expected.originalSHA256 ||
        binding.sourceWidth !== expected.sourceWidth ||
        binding.sourceHeight !== expected.sourceHeight ||
        binding.backdropID !== expected.backdropID ||
        binding.backdropSHA256 !== expected.backdropSHA256)
      throw Error('ORIGINAL_SHADOW_MANUAL_ADD_SHADOW_BACKDROP_CONFLICT');
  }
  if (Object.hasOwn(extra, 'originalShadowManual')) {
    const old = validateOriginalShadowManualDocument(extra.originalShadowManual,
      extra.originalShadowManual?.binding, {signal});
    for (const key of BINDING.slice(0, 4))
      if (old.binding[key] !== expected[key])
        throw Error('ORIGINAL_SHADOW_MANUAL_EXISTING_BINDING_CONFLICT');
    if (!replaceBackdrop && (old.binding.backdropID !== expected.backdropID ||
        old.binding.backdropSHA256 !== expected.backdropSHA256))
      throw Error('ORIGINAL_SHADOW_MANUAL_EXISTING_BINDING_CONFLICT');
  }
  extra.originalShadowManual = jsonCopy(checked, signal);
  validateRecipe(copied);
  abort(signal);
  return copied;
}
