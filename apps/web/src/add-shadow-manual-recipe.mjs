import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateAddShadowManualDocument} from './processing/add-shadow-manual-contract.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const BINDING_FIELDS = ['assetID', 'originalSHA256', 'sourceWidth',
  'sourceHeight', 'backdropID', 'backdropSHA256'];
const abortError = () => new DOMException('Manual shadow cancelled', 'AbortError');
function checkAbort(signal) {if (signal?.aborted) throw abortError();}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
}
function bindingFrom(target, backdrop) {
  if (!exact(target, ['id', 'sha256', 'sourceWidth', 'sourceHeight']) ||
      !exact(backdrop, ['id', 'sha256']) || !UUID.test(target.id) ||
      !SHA.test(target.sha256) || !UUID.test(backdrop.id) ||
      !SHA.test(backdrop.sha256) || target.id === backdrop.id ||
      !Number.isSafeInteger(target.sourceWidth) || target.sourceWidth < 1 ||
      !Number.isSafeInteger(target.sourceHeight) || target.sourceHeight < 1)
    throw Error('ADD_SHADOW_RECIPE_BINDING_INVALID');
  return {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: target.sourceWidth, sourceHeight: target.sourceHeight,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256};
}
function jsonCopy(value, signal, seen = new Set(), depth = 0) {
  checkAbort(signal);
  if (depth > 64) throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value))
    throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && ![Object.prototype, null].includes(prototype))
    throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1)
      throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
    result = Array.from({length: value.length}, (_, index) => {
      const item = Object.getOwnPropertyDescriptor(value, String(index));
      if (!item || !Object.hasOwn(item, 'value'))
        throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
      return jsonCopy(item.value, signal, seen, depth + 1);
    });
  } else {
    result = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
        throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
      const item = Object.getOwnPropertyDescriptor(value, key);
      if (!item || !Object.hasOwn(item, 'value') || !item.enumerable)
        throw Error('ADD_SHADOW_RECIPE_JSON_INVALID');
      Object.defineProperty(result, key, {value: jsonCopy(item.value, signal, seen,
        depth + 1), enumerable: true, configurable: true, writable: true});
    }
  }
  seen.delete(value);
  return result;
}

/**
 * Pure Recipe v1 transformation. `target` and `backdrop` MUST be independently
 * supplied by a fresh authenticated/decode Gate. This function does not
 * authorize either Asset, save, prove a revision, or produce Final pixels.
 */
export function buildAddShadowManualRecipe(options) {
  if (!exact(options, ['recipe', 'document', 'target', 'backdrop']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'signal']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'replaceBackdrop']) &&
      !exact(options, ['recipe', 'document', 'target', 'backdrop', 'replaceBackdrop', 'signal']))
    throw Error('ADD_SHADOW_RECIPE_INPUT_INVALID');
  const {recipe, document, target, backdrop, signal, replaceBackdrop = false} = options;
  if (typeof replaceBackdrop !== 'boolean') throw Error('ADD_SHADOW_RECIPE_INPUT_INVALID');
  checkAbort(signal);
  const expected = bindingFrom(target, backdrop);
  const checked = validateAddShadowManualDocument(document, expected, {signal});
  const copied = jsonCopy(recipe, signal);
  validateRecipe(copied);
  const extra = copied.parameters.extendedParameters;
  if (Object.hasOwn(extra, 'addShadowManual')) {
    const previous = validateAddShadowManualDocument(extra.addShadowManual,
      extra.addShadowManual?.binding, {signal});
    const targetFields = BINDING_FIELDS.slice(0, 4);
    if (targetFields.some(key => previous.binding[key] !== expected[key]) ||
        (!replaceBackdrop && BINDING_FIELDS.some(key => previous.binding[key] !== expected[key])))
      throw Error('ADD_SHADOW_RECIPE_EXISTING_BINDING_CONFLICT');
  }
  extra.addShadowManual = jsonCopy(checked, signal);
  validateRecipe(copied);
  checkAbort(signal);
  return copied;
}
