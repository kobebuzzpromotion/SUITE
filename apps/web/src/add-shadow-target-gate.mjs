import {TrialClient} from './trial-client.mjs';
import {MAX_INPUT_BYTES} from './processing/pure.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const BINDING_KEYS = ['assetID', 'originalSHA256', 'savedRevision',
  'sourceWidth', 'sourceHeight', 'backdropID', 'backdropSHA256'];
const abortError = () => new DOMException('Target read cancelled', 'AbortError');
function checkAbort(signal) {if (signal?.aborted) throw abortError();}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
}
async function read(task, signal) {
  checkAbort(signal);
  const pending = Promise.resolve().then(task);
  if (!signal) return pending;
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, {once: true});
    if (signal.aborted) onAbort();
  });
  try {const result = await Promise.race([pending, cancelled]); checkAbort(signal); return result;}
  finally {signal.removeEventListener('abort', onAbort);}
}
function identity(session, first) {
  const p = session?.principal;
  if (session?.mode !== 'INVITED_LOCAL_TRIAL' || !UUID.test(p?.id) ||
      p?.tenantId !== `trial-${p.id}`)
    throw Error(session?.endedReason || 'ADD_SHADOW_TARGET_SESSION_REQUIRED');
  if (first && (p.id !== first.id || p.tenantId !== first.tenantId))
    throw Error('ADD_SHADOW_TARGET_SESSION_CHANGED');
  return Object.freeze({id: p.id, tenantId: p.tenantId});
}
function assetRecord(assets, binding, first) {
  if (!Array.isArray(assets)) throw Error('ADD_SHADOW_TARGET_ASSET_LIST_INVALID');
  const matches = assets.filter(item => item?.id === binding.assetID);
  if (matches.length !== 1 || matches[0].deletedAt !== null ||
      matches[0].cloudSafe !== true)
    throw Error('ADD_SHADOW_TARGET_ASSET_UNAVAILABLE');
  const asset = matches[0];
  if (!SHA.test(asset.sha256) ||
      asset.sha256.toLowerCase() !== binding.originalSHA256.toLowerCase() ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 ||
      asset.size > MAX_INPUT_BYTES || first && asset.size !== first.size)
    throw Error('ADD_SHADOW_TARGET_ORIGINAL_CHANGED');
  return Object.freeze({size: asset.size});
}
function recipeVersion(saved, revision) {
  if (saved?.revision !== revision || saved?.body == null)
    throw Error('ADD_SHADOW_TARGET_REVISION_CONFLICT');
}
async function originalDigest(api, binding, asset, signal) {
  const bytes = await read(() => api.getOriginal(binding.assetID, {signal}), signal);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== asset.size)
    throw Error('ADD_SHADOW_TARGET_ORIGINAL_CHANGED');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('ADD_SHADOW_TARGET_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await read(() => subtle.digest('SHA-256', bytes), signal));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== binding.originalSHA256.toLowerCase())
    throw Error('ADD_SHADOW_TARGET_ORIGINAL_CHANGED');
  return hex;
}

/**
 * Read-only, ephemeral local-Trial verification for the Add Shadow target.
 * Caller binding values are expectations, not authority. Saving or exporting
 * must still perform its own fresh authorization and Recipe CAS check.
 */
export async function readTrialAddShadowTarget(options) {
  if (!exact(options, ['api', 'binding', 'action']) &&
      !exact(options, ['api', 'binding', 'action', 'signal']))
    throw Error('ADD_SHADOW_TARGET_INPUT_INVALID');
  const {api, binding, action, signal} = options;
  if (!(api instanceof TrialClient) || !exact(binding, BINDING_KEYS) ||
      !UUID.test(binding.assetID) || !SHA.test(binding.originalSHA256) ||
      !UUID.test(binding.backdropID) || !SHA.test(binding.backdropSHA256) ||
      binding.assetID === binding.backdropID ||
      !Number.isSafeInteger(binding.savedRevision) || binding.savedRevision < 1 ||
      !Number.isSafeInteger(binding.sourceWidth) || binding.sourceWidth < 1 ||
      !Number.isSafeInteger(binding.sourceHeight) || binding.sourceHeight < 1 ||
      !['edit', 'export'].includes(action) ||
      signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function'))
    throw Error('ADD_SHADOW_TARGET_INPUT_INVALID');
  checkAbort(signal);
  const firstIdentity = identity(await read(() => api.getSession(), signal));
  const firstAsset = assetRecord(await read(() => api.listAssets(), signal), binding);
  recipeVersion(await read(() => api.getRecipe(binding.assetID), signal), binding.savedRevision);
  const digest = await originalDigest(api, binding, firstAsset, signal);
  assetRecord(await read(() => api.listAssets(), signal), binding, firstAsset);
  recipeVersion(await read(() => api.getRecipe(binding.assetID), signal), binding.savedRevision);
  identity(await read(() => api.getSession(), signal), firstIdentity);
  const permission = await read(() => api.assertPermission(binding.assetID, action), signal);
  if (permission?.authorized !== true) throw Error('ADD_SHADOW_TARGET_PERMISSION_DENIED');
  checkAbort(signal);
  return Object.freeze({kind: 'trial-add-shadow-target-read-only',
    assetID: binding.assetID, originalSHA256: digest,
    savedRevision: binding.savedRevision, originalByteLength: firstAsset.size,
    action, principal: firstIdentity});
}
