import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {resolveExportQueuePosition} from './export-queue.mjs';
import {BrowserLocalAPI} from './browser-local-api.mjs';

const isBrowserLocal=api=>api instanceof BrowserLocalAPI&&Object.getPrototypeOf(api)===BrowserLocalAPI.prototype;
/** Local possession check, never a server authorization or Cloud Safe grant. */
export async function assertBrowserLocalBatchAsset(api,expected){
  if(!isBrowserLocal(api)||typeof api.databaseName!=='string'||!api.databaseName||!api.factory||!api.crypto)throw Error('EXPORT_BATCH_LOCAL_SCOPE_REQUIRED');
  const database=api.databaseName,factory=api.factory,crypto=api.crypto;
  const rows=await BrowserLocalAPI.prototype.listAssets.call(api);
  if(!isBrowserLocal(api)||api.databaseName!==database||api.factory!==factory||api.crypto!==crypto)throw Error('EXPORT_BATCH_LOCAL_SCOPE_CHANGED');
  const matches=Array.isArray(rows)?rows.filter(row=>row?.id===expected?.id):[];
  if(matches.length!==1||!matchingAsset(matches[0],expected)||matches[0].storage!=='BROWSER_LOCAL_ONLY'||matches[0].cloudSafe!==false)throw Error('EXPORT_BATCH_LOCAL_ASSET_MISMATCH');
}

const sameRecipe = (left, right) => {
  try { return JSON.stringify(left) === JSON.stringify(right); }
  catch { return false; }
};

function matchingAsset(actual, expected) {
  return actual && typeof actual === 'object' && !Array.isArray(actual) &&
    actual.id === expected.id && actual.name === expected.name &&
    typeof actual.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(actual.sha256) &&
    actual.sha256.toLowerCase() === expected.sha256 &&
    actual.size === expected.size && Number.isSafeInteger(actual.size) && actual.size > 0 &&
    (actual.deletedAt === undefined || actual.deletedAt === null);
}

function savedRevision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (value.revision !== undefined && value.version !== undefined &&
        value.revision !== value.version)) throw Error('EXPORT_BATCH_RECIPE_MISMATCH');
  const revision = value.revision ?? value.version;
  if (!Number.isSafeInteger(revision) || revision < 1 ||
      value.branch === true || !value.body) throw Error('EXPORT_BATCH_RECIPE_MISMATCH');
  validateRecipe(value.body);
  return revision;
}

function checkedLocal(snapshot, expected) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !matchingAsset(snapshot.asset, expected) || snapshot.dirty !== false ||
      !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 ||
      !snapshot.recipe) throw Error('EXPORT_BATCH_LOCAL_STATE_MISMATCH');
  validateRecipe(snapshot.recipe);
  const portrait = snapshot.recipe?.parameters?.extendedParameters?.portrait;
  if (portrait !== undefined) validatePortraitBinding(portrait, expected.id, expected.sha256);
  return snapshot;
}

/**
 * Read-only preflight for an explicit planExportQueue result. Every selected
 * Asset needs a caller-provided local snapshot so dirty drafts cannot silently
 * be treated as clean. The API adapter must be bound to the current identity.
 * This is NOT an authorization grant: Final must recheck permission, Asset,
 * saved Recipe, and Original immediately before output.
 */
export async function preflightExportBatch({api, plan, localStates} = {}) {
  const localMode=isBrowserLocal(api);
  if (typeof api?.listAssets !== 'function' || typeof api?.getRecipe !== 'function' ||
      !localMode&&typeof api?.assertPermission !== 'function') throw Error('EXPORT_BATCH_ADAPTER_NOT_CONNECTED');
  if (!Array.isArray(plan) || !plan.length || !Array.isArray(localStates) ||
      localStates.length !== plan.length) throw Error('EXPORT_BATCH_SELECTION_MISMATCH');

  const locals = new Map();
  for (const snapshot of localStates) {
    const id = snapshot?.asset?.id;
    if (typeof id !== 'string' || !id || locals.has(id))
      throw Error('EXPORT_BATCH_DUPLICATE_OR_INVALID_LOCAL');
    locals.set(id, snapshot);
  }
  const selected = plan.map(entry => {
    // Besides position, this verifies the plan is the actual immutable result
    // of planExportQueue, not a reconstructed or rearranged Asset list.
    const position = resolveExportQueuePosition({plan, asset: entry.asset});
    const local = checkedLocal(locals.get(entry.assetId), entry.asset);
    return {entry, position, local};
  });

  const inventory = await (localMode?BrowserLocalAPI.prototype.listAssets.call(api):api.listAssets());
  if (!Array.isArray(inventory)) throw Error('EXPORT_BATCH_ASSET_LIST_MISMATCH');
  for (const {entry} of selected) {
    const matches = inventory.filter(item => item?.id === entry.assetId);
    if (matches.length !== 1 || !matchingAsset(matches[0], entry.asset))
      throw Error('EXPORT_BATCH_ASSET_LIST_MISMATCH');
  }

  const verified = [];
  for (const {entry, position, local} of selected) {
    const saved = await (localMode?BrowserLocalAPI.prototype.getRecipe.call(api,entry.assetId):api.getRecipe(entry.assetId));
    const revision = savedRevision(saved);
    if (saved.assetId !== undefined && saved.assetId !== entry.assetId)
      throw Error('EXPORT_BATCH_RECIPE_MISMATCH');
    const portrait = saved.body?.parameters?.extendedParameters?.portrait;
    if (portrait !== undefined) validatePortraitBinding(portrait, entry.assetId, entry.asset.sha256);
    if (revision !== local.revision || !sameRecipe(saved.body, local.recipe))
      throw Error('EXPORT_BATCH_RECIPE_MISMATCH');
    if(localMode)await assertBrowserLocalBatchAsset(api,entry.asset);
    else{
      const permission = await api.assertPermission(entry.assetId, 'export');
      if (permission?.authorized !== true) throw Error('EXPORT_BATCH_PERMISSION_DENIED');
    }
    verified.push(Object.freeze({assetId: entry.assetId, name: entry.asset.name,
      sha256: entry.asset.sha256, size: entry.asset.size, revision,
      sequence: position.sequence, total: position.total}));
  }
  return Object.freeze({status: 'preflight-only', items: Object.freeze(verified)});
}
