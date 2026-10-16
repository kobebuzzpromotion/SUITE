import {ADD_SHADOW_VERSION, ADD_SHADOW_MAX_PIXELS,
  validateAddShadowSettings} from './add-shadow.mjs';

/** JSON-only authoring limits; no Original, raster mask or decoded backdrop. */
export const ADD_SHADOW_MANUAL_MAX_STROKES = 64;
// Metadata only; actual Add Shadow buffers remain limited to 8MP.
export const ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS = 96_000_000;
export const ADD_SHADOW_MANUAL_MAX_POINTS = 4096;
export const ADD_SHADOW_MANUAL_MAX_JSON_BYTES = 96 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const BINDING_KEYS = ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
  'backdropID', 'backdropSHA256'];
const SETTINGS_KEYS = ['mode', 'opacity', 'blur', 'gradient', 'blend', 'offsetX',
  'offsetY', 'shadowColor'];
const unit = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && value <= 1;
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
}
function dense(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Manual shadow cancelled', 'AbortError');
}
function bindingCopy(input) {
  if (!exact(input, BINDING_KEYS) || !UUID.test(input.assetID) ||
      !SHA.test(input.originalSHA256) || !UUID.test(input.backdropID) ||
      !SHA.test(input.backdropSHA256) || input.assetID === input.backdropID ||
      !Number.isSafeInteger(input.sourceWidth) || input.sourceWidth < 1 ||
      !Number.isSafeInteger(input.sourceHeight) || input.sourceHeight < 1 ||
      input.sourceWidth * input.sourceHeight > ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS)
    throw Error('ADD_SHADOW_MANUAL_BINDING_INVALID');
  return Object.freeze(Object.fromEntries(BINDING_KEYS.map(key => [key, input[key]])));
}
function strokeCopy(input) {
  if (!exact(input, ['operation', 'path', 'radiusFraction', 'hardness']) ||
      !['ADD', 'ERASE'].includes(input.operation) ||
      !dense(input.path, 1, ADD_SHADOW_MANUAL_MAX_POINTS) ||
      typeof input.radiusFraction !== 'number' ||
      !Number.isFinite(input.radiusFraction) ||
      input.radiusFraction < .001 || input.radiusFraction > .25 ||
      !unit(input.hardness))
    throw Error('ADD_SHADOW_MANUAL_STROKE_INVALID');
  const path = input.path.map(point => {
    if (!exact(point, ['u', 'v']) || !unit(point.u) || !unit(point.v))
      throw Error('ADD_SHADOW_MANUAL_POINT_INVALID');
    return Object.freeze({u: point.u, v: point.v});
  });
  return Object.freeze({operation: input.operation, path: Object.freeze(path),
    radiusFraction: input.radiusFraction, hardness: input.hardness});
}
function settingsCopy(input) {
  // validateAddShadowSettings checks numerical ranges/modes. Data-only shape
  // additionally excludes accessors and sparse/color-array extra properties.
  if (!exact(input, SETTINGS_KEYS) || !dense(input.shadowColor, 3, 3))
    throw Error('ADD_SHADOW_MANUAL_SETTINGS_INVALID');
  const safe = Object.fromEntries(SETTINGS_KEYS.map(key => [key, input[key]]));
  safe.shadowColor = [...input.shadowColor];
  return validateAddShadowSettings(safe);
}

/**
 * Strict, non-destructive document validation. `expectedBinding` MUST come
 * from a freshly authenticated Asset + backdrop Gate; equal caller-authored
 * JSON is not an authorization or a substitute for save CAS. In particular,
 * the saved document contains no bitmap, Original bytes, digest, permission
 * assertion, or revision. Old Recipe v1 documents are unaffected because this
 * function does not alter their schema or validate unrelated fields.
 */
export function validateAddShadowManualDocument(document, expectedBinding,
  {signal} = {}) {
  checkAbort(signal);
  if (!exact(document, ['schemaVersion', 'engineVersion', 'binding',
    'subjectStrokes', 'settings']) || document.schemaVersion !== 1 ||
      document.engineVersion !== ADD_SHADOW_VERSION)
    throw Error('ADD_SHADOW_MANUAL_DOCUMENT_INVALID');
  const binding = bindingCopy(document.binding);
  const expected = bindingCopy(expectedBinding);
  if (BINDING_KEYS.some(key => binding[key] !== expected[key]))
    throw Error('ADD_SHADOW_MANUAL_BINDING_MISMATCH');
  if (!dense(document.subjectStrokes, 1, ADD_SHADOW_MANUAL_MAX_STROKES))
    throw Error('ADD_SHADOW_MANUAL_STROKES_INVALID');
  let points = 0, hasAdd = false;
  const strokes = document.subjectStrokes.map(stroke => {
    checkAbort(signal);
    const copied = strokeCopy(stroke);
    points += copied.path.length;
    if (points > ADD_SHADOW_MANUAL_MAX_POINTS)
      throw Error('ADD_SHADOW_MANUAL_CAPACITY');
    if (copied.operation === 'ADD') hasAdd = true;
    return copied;
  });
  if (!hasAdd) throw Error('ADD_SHADOW_MANUAL_ADD_REQUIRED');
  const settings = settingsCopy(document.settings);
  const validated = Object.freeze({schemaVersion: 1,
    engineVersion: ADD_SHADOW_VERSION, binding,
    subjectStrokes: Object.freeze(strokes), settings});
  if (new TextEncoder().encode(JSON.stringify(validated)).byteLength >
      ADD_SHADOW_MANUAL_MAX_JSON_BYTES)
    throw Error('ADD_SHADOW_MANUAL_JSON_LIMIT');
  checkAbort(signal);
  return validated;
}
