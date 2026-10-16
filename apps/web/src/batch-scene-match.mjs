import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {assertPixels, checkAbort} from './processing/pure.mjs';
import {estimateSceneMatch, validateSceneMatch} from './processing/delta66-scene-color.mjs';

const copy = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revisionOf = stored => stored?.revision ?? stored?.version;
function selected(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== 3 || !['id', 'sha256', 'revision'].every(key => {
        const d = Object.getOwnPropertyDescriptor(value, key);
        return d?.enumerable && Object.hasOwn(d, 'value');
      }) || typeof value.id !== 'string' || !value.id || value.id.trim() !== value.id ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256) ||
      !Number.isSafeInteger(value.revision) || value.revision < 1)
    throw Error('SCENE_MATCH_BATCH_SELECTION_INVALID');
  return Object.freeze({id: value.id, sha256: value.sha256.toLowerCase(), revision: value.revision});
}
function assetMatches(assets, target) {
  if (!Array.isArray(assets)) throw Error('SCENE_MATCH_BATCH_ASSET_LIST_INVALID');
  const matches = assets.filter(asset => asset?.id === target.id);
  if (matches.length !== 1 || matches[0].deletedAt != null) throw Error('SCENE_MATCH_BATCH_ASSET_UNAVAILABLE');
  if (typeof matches[0].sha256 !== 'string' || matches[0].sha256.toLowerCase() !== target.sha256)
    throw Error('SCENE_MATCH_BATCH_ORIGINAL_CHANGED');
}
function authorized(value) {
  if (value?.authorized !== true) throw Error('SCENE_MATCH_BATCH_PERMISSION_DENIED');
}
function checkedStored(stored, target) {
  if (!stored || stored.branch === true || revisionOf(stored) !== target.revision ||
      (stored.assetId !== undefined && stored.assetId !== target.id) || !stored.body)
    throw Error('SCENE_MATCH_BATCH_REVISION_CONFLICT');
  validateRecipe(stored.body);
  const extra = stored.body.parameters.extendedParameters;
  if (extra.portrait !== undefined) validatePortraitBinding(extra.portrait, target.id, target.sha256);
  for (const name of ['bwEdgeManual', 'addShadowManual', 'originalShadowManual']) {
    const binding = extra[name]?.binding;
    if (binding !== undefined && (binding.assetID !== target.id ||
        typeof binding.originalSHA256 !== 'string' || binding.originalSHA256.toLowerCase() !== target.sha256))
      throw Error('SCENE_MATCH_BATCH_PHOTO_BOUND_MISMATCH');
  }
  return stored.body;
}
function merge(targetRecipe, settings) {
  const result = copy(targetRecipe), params = result.parameters;
  const adjustments = params.extendedParameters.postDecodeAdjustments ??=
    {schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1'};
  adjustments.color ??= {};
  adjustments.color.sceneMatch = validateSceneMatch(settings);
  if (!params.processingOrder.includes('postDecodeAdjustments')) {
    const at = params.processingOrder.findIndex(stage => stage === 'rotation' || stage === 'crop');
    params.processingOrder.splice(at < 0 ? params.processingOrder.length : at, 0, 'postDecodeAdjustments');
  }
  validateRecipe(result);
  return result;
}
function samePixels(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Per-photo distribution matching from unedited cached Proxies, not a copied
 * transform and not an appearance-match guarantee. Host preflight must verify
 * cache Asset/SHA binding, reject dirty drafts, and return {proxy}. No RAW reads.
 * Saves are sequential, not atomic across photos; ambiguous writes stay unverified.
 */
export async function applyBatchSceneMatch({api, targets, referencePixels, amount = 1,
  preflightTarget, signal} = {}) {
  for (const method of ['listAssets', 'getRecipe', 'assertPermission', 'saveRecipe'])
    if (typeof api?.[method] !== 'function') throw Error('SCENE_MATCH_BATCH_ADAPTER_REQUIRED');
  if (!Array.isArray(targets) || targets.length < 2 || targets.length > 20)
    throw Error('SCENE_MATCH_BATCH_TWO_TARGETS_REQUIRED');
  const fixedTargets = Array.from(targets, selected);
  if (new Set(fixedTargets.map(target => target.id)).size !== fixedTargets.length)
    throw Error('SCENE_MATCH_BATCH_SELECTION_INVALID');
  if (typeof preflightTarget !== 'function') throw Error('SCENE_MATCH_BATCH_PREFLIGHT_REQUIRED');
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw Error('COLOR_MATCH_AMOUNT');
  assertPixels(referencePixels);
  const reference = copy(referencePixels);
  const results = [];
  for (const target of fixedTargets) {
    let writeAttempted = false;
    try {
      checkAbort(signal);
      assetMatches(await api.listAssets(), target); checkAbort(signal);
      authorized(await api.assertPermission(target.id, 'edit')); checkAbort(signal);
      const preflight = await preflightTarget(target); checkAbort(signal);
      assertPixels(preflight?.proxy);
      const pixels = copy(preflight.proxy);
      const oldBody = copy(checkedStored(await api.getRecipe(target.id), target)); checkAbort(signal);
      const settings = estimateSceneMatch(pixels, reference, {amount, signal});
      const merged = merge(oldBody, settings);
      // A regenerated/different Proxy must not silently receive an old estimate.
      const fresh = await preflightTarget(target); checkAbort(signal);
      assertPixels(fresh?.proxy);
      if (!samePixels(pixels, fresh.proxy)) throw Error('SCENE_MATCH_BATCH_PROXY_CHANGED');
      authorized(await api.assertPermission(target.id, 'edit')); checkAbort(signal);
      assetMatches(await api.listAssets(), target); checkAbort(signal);
      if (!equal(checkedStored(await api.getRecipe(target.id), target), oldBody))
        throw Error('SCENE_MATCH_BATCH_REVISION_CONFLICT');
      checkAbort(signal);
      writeAttempted = true;
      const response = await api.saveRecipe(target.id, target.revision, merged);
      if (response?.outcome === 'conflict') {
        results.push({assetId: target.id, status: 'conflict', reason: 'SCENE_MATCH_BATCH_REVISION_CONFLICT'});
        continue;
      }
      checkAbort(signal);
      if (response?.outcome !== undefined && response.outcome !== 'saved') throw Error('SCENE_MATCH_BATCH_SAVE_MISMATCH');
      const saved = response?.outcome === 'saved' ? response.version : response;
      const next = {...target, revision: target.revision + 1};
      if (!equal(checkedStored(saved, next), merged)) throw Error('SCENE_MATCH_BATCH_SAVE_MISMATCH');
      assetMatches(await api.listAssets(), target); checkAbort(signal);
      authorized(await api.assertPermission(target.id, 'edit')); checkAbort(signal);
      const verified = await api.getRecipe(target.id); checkAbort(signal);
      if (!equal(checkedStored(verified, next), merged)) throw Error('SCENE_MATCH_BATCH_POSTSAVE_MISMATCH');
      results.push({assetId: target.id, status: 'saved', revision: next.revision});
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'SCENE_MATCH_BATCH_CANCELLED' : error?.message || 'SCENE_MATCH_BATCH_TARGET_FAILED';
      const conflict = reason === 'SCENE_MATCH_BATCH_REVISION_CONFLICT' || reason === 'REVISION_CONFLICT';
      results.push({assetId: target.id, status: writeAttempted ? 'unverified' : conflict ? 'conflict' : 'failed', reason});
    }
  }
  const saved = results.filter(row => row.status === 'saved').length;
  return Object.freeze({status: saved === results.length ? 'complete' : saved ? 'partial' : 'failed',
    saved, notSaved: results.length - saved, results, cancelled: signal?.aborted === true});
}
