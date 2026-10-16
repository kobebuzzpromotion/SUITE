import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding} from '../../../dist/apps/backend/src/portrait-recipe.js';

const clone = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revisionOf = stored => stored?.revision ?? stored?.version;

function selection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || !['id', 'sha256', 'revision'].includes(key)) ||
      typeof value.id !== 'string' || !value.id || value.id.trim() !== value.id ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256) ||
      !Number.isSafeInteger(value.revision) || value.revision < 1)
    throw Error('VIGNETTE_SYNC_SELECTION_INVALID');
  return Object.freeze({id:value.id, sha256:value.sha256.toLowerCase(), revision:value.revision});
}
function assetMatches(assets, identity) {
  if (!Array.isArray(assets)) throw Error('VIGNETTE_SYNC_ASSET_LIST_INVALID');
  const matches = assets.filter(asset => asset?.id === identity.id);
  if (matches.length !== 1 || matches[0].deletedAt != null) throw Error('VIGNETTE_SYNC_ASSET_UNAVAILABLE');
  if (typeof matches[0].sha256 !== 'string' || matches[0].sha256.toLowerCase() !== identity.sha256)
    throw Error('VIGNETTE_SYNC_ORIGINAL_CHANGED');
}
function checkedStored(stored, identity) {
  if (!stored || stored.branch === true || revisionOf(stored) !== identity.revision ||
      (stored.assetId !== undefined && stored.assetId !== identity.id) || !stored.body)
    throw Error('VIGNETTE_SYNC_REVISION_CONFLICT');
  validateRecipe(stored.body);
  const portrait = stored.body.parameters.extendedParameters?.portrait;
  if (portrait !== undefined) validatePortraitBinding(portrait, identity.id, identity.sha256);
  return stored.body;
}
function authorized(value) {if (value?.authorized !== true) throw Error('VIGNETTE_SYNC_PERMISSION_DENIED');}

/** Transfer only the typed post-crop vignette. Absence in the source means clear it on the target. */
export function mergeSavedVignette(sourceRecipe, targetRecipe) {
  validateRecipe(sourceRecipe);validateRecipe(targetRecipe);
  const result = clone(targetRecipe);
  const sourceEffect = sourceRecipe.parameters.extendedParameters?.postCropAdjustments;
  if (sourceEffect === undefined) delete result.parameters.extendedParameters.postCropAdjustments;
  else result.parameters.extendedParameters.postCropAdjustments = clone(sourceEffect);
  validateRecipe(result);
  return result;
}

/** Sequential authenticated per-target CAS. Ambiguous writes are never reported as saved. */
export async function applyBatchVignetteSync({api, source, targets, expectedSourceRecipe, preflightTarget} = {}) {
  for (const method of ['listAssets', 'getRecipe', 'assertPermission', 'saveRecipe'])
    if (typeof api?.[method] !== 'function') throw Error('VIGNETTE_SYNC_ADAPTER_REQUIRED');
  const fixedSource = selection(source);
  if (!Array.isArray(targets) || targets.length < 2 || targets.length > 20)
    throw Error('VIGNETTE_SYNC_TWO_TARGETS_REQUIRED');
  const fixedTargets = targets.map(selection);
  if (new Set(fixedTargets.map(item => item.id)).size !== fixedTargets.length ||
      fixedTargets.some(item => item.id === fixedSource.id)) throw Error('VIGNETTE_SYNC_SELECTION_INVALID');
  if (preflightTarget !== undefined && typeof preflightTarget !== 'function')
    throw Error('VIGNETTE_SYNC_PREFLIGHT_INVALID');

  assetMatches(await api.listAssets(), fixedSource);
  authorized(await api.assertPermission(fixedSource.id, 'edit'));
  const sourceBody = clone(checkedStored(await api.getRecipe(fixedSource.id), fixedSource));
  if (expectedSourceRecipe !== undefined && !equal(sourceBody, expectedSourceRecipe))
    throw Error('VIGNETTE_SYNC_SOURCE_RECIPE_CHANGED');
  const results = [];
  for (const target of fixedTargets) {
    let writeAttempted = false;
    try {
      assetMatches(await api.listAssets(), fixedSource);
      authorized(await api.assertPermission(fixedSource.id, 'edit'));
      if (!equal(checkedStored(await api.getRecipe(fixedSource.id), fixedSource), sourceBody))
        throw Error('VIGNETTE_SYNC_SOURCE_RECIPE_CHANGED');
      assetMatches(await api.listAssets(), target);
      authorized(await api.assertPermission(target.id, 'edit'));
      if (preflightTarget) await preflightTarget(target);
      const oldBody = checkedStored(await api.getRecipe(target.id), target);
      const merged = mergeSavedVignette(sourceBody, oldBody);
      if (preflightTarget) await preflightTarget(target);
      authorized(await api.assertPermission(target.id, 'edit'));
      assetMatches(await api.listAssets(), target);
      writeAttempted = true;
      const response = await api.saveRecipe(target.id, target.revision, merged);
      if (response?.outcome === 'conflict') {
        results.push({assetId:target.id, status:'conflict', reason:'VIGNETTE_SYNC_REVISION_CONFLICT'});
        continue;
      }
      const saved = response?.outcome === 'saved' ? response.version : response;
      if (response?.outcome !== undefined && response.outcome !== 'saved') throw Error('VIGNETTE_SYNC_SAVE_MISMATCH');
      if (revisionOf(saved) !== target.revision + 1 ||
          (saved?.assetId !== undefined && saved.assetId !== target.id) || !equal(saved?.body, merged))
        throw Error('VIGNETTE_SYNC_SAVE_MISMATCH');
      assetMatches(await api.listAssets(), target);
      const verified = await api.getRecipe(target.id);
      if (revisionOf(verified) !== target.revision + 1 ||
          (verified?.assetId !== undefined && verified.assetId !== target.id) || !equal(verified?.body, merged))
        throw Error('VIGNETTE_SYNC_POSTSAVE_MISMATCH');
      checkedStored(verified, {...target, revision:target.revision + 1});
      assetMatches(await api.listAssets(), fixedSource);
      authorized(await api.assertPermission(fixedSource.id, 'edit'));
      if (!equal(checkedStored(await api.getRecipe(fixedSource.id), fixedSource), sourceBody))
        throw Error('VIGNETTE_SYNC_SOURCE_RECIPE_CHANGED');
      results.push({assetId:target.id, status:'saved', revision:target.revision + 1});
    } catch (error) {
      results.push({assetId:target.id, status:writeAttempted ? 'unverified' : 'failed',
        reason:error?.message || 'VIGNETTE_SYNC_TARGET_FAILED'});
    }
  }
  const saved = results.filter(row => row.status === 'saved').length;
  return Object.freeze({status:saved === results.length ? 'complete' : saved ? 'partial' : 'failed',
    source:fixedSource, saved, notSaved:results.length - saved, results});
}
