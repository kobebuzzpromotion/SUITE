import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding, validatePortraitContinuity} from '../../../dist/apps/backend/src/portrait-recipe.js';

/**
 * Apply one already-saved Recipe snapshot to selected assets, serially.
 * The adapter must be bound to the current identity/workspace/project and
 * enforce permission plus an atomic expected-revision save on the server.
 * No Original API is called. A Workspace conflict branch is NOT a success.
 */
const requireMethod = (api, name) => {
  if (typeof api?.[name] !== 'function') throw Error('BATCH_ADAPTER_NOT_CONNECTED');
  return api[name].bind(api);
};
const revision = (value, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw Error('BATCH_REVISION_REQUIRED');
  return value;
};
const sha256 = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw Error('BATCH_SHA256_REQUIRED');
  return value.toLowerCase();
};
const assetId = value => {
  if (typeof value !== 'string' || !value || value !== value.trim()) throw Error('BATCH_ASSET_ID_REQUIRED');
  return value;
};
function target(value, minimumRevision = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || !['id', 'sha256', 'revision'].includes(key)))
    throw Error('BATCH_TARGET_INVALID');
  return Object.freeze({id: assetId(value.id), sha256: sha256(value.sha256),
    revision: revision(value.revision, minimumRevision)});
}
function currentRevision(stored) {
  if (stored === null) return 0;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw Error('BATCH_RECIPE_RESPONSE_MISMATCH');
  const value = stored.revision ?? stored.version;
  if (!Number.isSafeInteger(value) || value < 1 || !stored.body) throw Error('BATCH_RECIPE_RESPONSE_MISMATCH');
  validateRecipe(stored.body);
  return value;
}
function portrait(recipe) {return recipe?.parameters?.extendedParameters?.portrait;}
function hasBWEdgeManual(recipe) {
  const extra = recipe?.parameters?.extendedParameters;
  return extra && Object.hasOwn(extra, 'bwEdgeManual');
}
function hasAddShadowManual(recipe) {
  const extra = recipe?.parameters?.extendedParameters;
  return extra && Object.hasOwn(extra, 'addShadowManual');
}
// Explicit photo-coordinate/selection branches. Whole-Recipe replacement must
// neither transplant the source selection nor erase a target's existing one.
// Global looks and the independently scoped synchronization paths are unchanged.
const photoLocalSelections = [
  'webDepthRange','webManualSpot','handToneManual','clothingSpotManual',
  'manualMakeup','manualClone','manualSkin','manualRedEye','manualHair','manualEyes',
  'webManualTeeth','webManualClothing','webManualBackground','webManualLiquify',
  'localLevels','colorRangeLevels','localLUTMask','originalShadowManual',
  'teethManual','makeupHighlightManual','blushManual','faceDecorationsManual',
  'contactsIrisManual','eyeshadowManual','eyelinerManual'
];
function hasPhotoLocalSelection(recipe) {
  const extra=recipe?.parameters?.extendedParameters;
  return extra&&photoLocalSelections.some(key=>Object.hasOwn(extra,key));
}
function checkedBody(recipe, asset, previous) {
  validateRecipe(recipe);
  // Both the source and a target's existing Recipe are photo-local. Copying
  // the former or replacing the latter would misbind/erase owner strokes.
  // Refuse before save; Levels-only sync has its own merge path.
  if (hasBWEdgeManual(recipe) || hasBWEdgeManual(previous))
    throw Error('BATCH_BW_EDGE_PHOTO_BOUND_RECIPE');
  if (hasAddShadowManual(recipe) || hasAddShadowManual(previous))
    throw Error('BATCH_ADD_SHADOW_PHOTO_BOUND_RECIPE');
  if (hasPhotoLocalSelection(recipe) || hasPhotoLocalSelection(previous))
    throw Error('BATCH_LOCAL_SELECTION_PHOTO_BOUND_RECIPE');
  // A target's verified Portrait inventory belongs to that photo, even when
  // the incoming generic Recipe has no Portrait branch at all. Full replace
  // must not silently erase it; use an explicitly scoped merge workflow.
  if (portrait(previous) !== undefined)
    throw Error('BATCH_PORTRAIT_PHOTO_BOUND_RECIPE');
  const incoming = portrait(recipe);
  if (incoming !== undefined) {
    validatePortraitBinding(incoming, asset.id, asset.sha256);
    const prior = portrait(previous);
    if (prior !== undefined) validatePortraitContinuity(prior, incoming);
  }
  return recipe;
}
function lookup(assets, selected) {
  if (!Array.isArray(assets)) throw Error('BATCH_ASSET_LIST_MISMATCH');
  const matches = assets.filter(item => item?.id === selected.id);
  if (matches.length > 1) throw Error('BATCH_ASSET_LIST_MISMATCH');
  const asset = matches[0];
  if (!asset) throw Error('BATCH_ASSET_NOT_FOUND');
  if (typeof asset.sha256 !== 'string' || asset.sha256.toLowerCase() !== selected.sha256)
    throw Error('BATCH_ORIGINAL_IDENTITY_CHANGED');
  return asset;
}
function sameAsset(stored, selected) {
  if (stored && Object.hasOwn(stored, 'assetId') && stored.assetId !== selected.id)
    throw Error('BATCH_RECIPE_RESPONSE_MISMATCH');
}
function savedVersion(response) {
  if (response?.outcome === 'conflict') return {conflict: true, branchVersion: response.version?.version};
  if (response?.outcome !== undefined && response.outcome !== 'saved')
    throw Error('BATCH_SAVE_RESPONSE_MISMATCH');
  const value = response?.outcome === 'saved' ? response.version : response;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('BATCH_SAVE_RESPONSE_MISMATCH');
  return {revision: value.revision ?? value.version, body: value.body, assetId: value.assetId};
}
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * @param {{api: object, source: {id:string,sha256:string,revision:number},
 *   targets: Array<{id:string,sha256:string,revision:number}>}} input
 * @returns {Promise<{status:string,saved:number,notSaved:number,results:Array<object>}>>}
 */
export async function applyBatchRecipe({api, source, targets} = {}) {
  const listAssets = requireMethod(api, 'listAssets');
  const getRecipe = requireMethod(api, 'getRecipe');
  const assertPermission = requireMethod(api, 'assertPermission');
  const saveRecipe = requireMethod(api, 'saveRecipe');
  const selectedSource = target(source, 1);
  if (!Array.isArray(targets) || !targets.length) throw Error('BATCH_TARGETS_REQUIRED');
  const selectedTargets = targets.map(item => target(item));
  if (new Set(selectedTargets.map(item => item.id)).size !== selectedTargets.length)
    throw Error('BATCH_DUPLICATE_TARGET');

  lookup(await listAssets(), selectedSource);
  const sourceStored = await getRecipe(selectedSource.id);
  if (currentRevision(sourceStored) !== selectedSource.revision) throw Error('BATCH_SOURCE_REVISION_CONFLICT');
  sameAsset(sourceStored, selectedSource);
  const fixedRecipe = structuredClone(checkedBody(sourceStored.body, selectedSource));
  const results = [];
  for (const selected of selectedTargets) {
    let writeAttempted = false;
    try {
      lookup(await listAssets(), selected);
      const permission = await assertPermission(selected.id, 'edit');
      if (permission?.authorized !== true) throw Error('BATCH_PERMISSION_DENIED');
      const current = await getRecipe(selected.id);
      const actualRevision = currentRevision(current);
      sameAsset(current, selected);
      if (actualRevision !== selected.revision) throw Error('BATCH_REVISION_CONFLICT');
      if (current?.body) checkedBody(current.body, selected);
      const body = structuredClone(checkedBody(fixedRecipe, selected, current?.body));
      // A second authorization immediately precedes the atomic CAS write.
      const lastPermission = await assertPermission(selected.id, 'edit');
      if (lastPermission?.authorized !== true) throw Error('BATCH_PERMISSION_DENIED');
      writeAttempted = true;
      const response = savedVersion(await saveRecipe(selected.id, selected.revision, body));
      if (response.conflict) {
        results.push({assetId: selected.id, status: 'conflict', reason: 'BATCH_REVISION_CONFLICT',
          ...(Number.isSafeInteger(response.branchVersion) ? {branchVersion: response.branchVersion} : {})});
        continue;
      }
      if (response.revision !== selected.revision + 1 || !equal(response.body, body) ||
          (response.assetId !== undefined && response.assetId !== selected.id))
        throw Error('BATCH_SAVE_RESPONSE_MISMATCH');
      lookup(await listAssets(), selected);
      const verified = await getRecipe(selected.id);
      sameAsset(verified, selected);
      if (currentRevision(verified) !== response.revision || !equal(verified.body, body))
        throw Error('BATCH_POSTSAVE_MISMATCH');
      results.push({assetId: selected.id, status: 'saved', revision: response.revision});
    } catch (error) {
      // Once the save call began, a network error/malformed response cannot
      // prove whether the backend committed. Never label it failed-and-safe.
      results.push({assetId: selected.id, status: writeAttempted ? 'unverified' : 'failed',
        reason: error?.message || 'BATCH_ASSET_FAILED'});
    }
  }
  const saved = results.filter(item => item.status === 'saved').length;
  return Object.freeze({status: saved === results.length ? 'complete' : saved ? 'partial' : 'failed',
    source: selectedSource, saved, notSaved: results.length - saved, results});
}
