import {TrialClient} from './trial-client.mjs';
import {MAX_EXIF_ORIGINAL_BYTES,
  readDngExifCaptureDateEvidence} from './processing/exif-capture-date.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const abortError = () => new DOMException('Capture-date read cancelled', 'AbortError');
function checkAbort(signal) {if (signal?.aborted) throw abortError();}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
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
  try {
    const value = await Promise.race([pending, cancelled]);
    checkAbort(signal);
    return value;
  } finally {signal.removeEventListener('abort', onAbort);}
}
function sessionIdentity(session, first) {
  const principal = session?.principal;
  if (session?.mode !== 'INVITED_LOCAL_TRIAL' ||
      typeof principal?.id !== 'string' || !UUID.test(principal.id) ||
      principal.tenantId !== `trial-${principal.id}`)
    throw Error(session?.endedReason || 'CAPTURE_DATE_GATE_SESSION_REQUIRED');
  if (first && (first.id !== principal.id || first.tenantId !== principal.tenantId))
    throw Error('CAPTURE_DATE_GATE_SESSION_CHANGED');
  return Object.freeze({id: principal.id, tenantId: principal.tenantId});
}
function listedAsset(assets, binding, prior) {
  if (!Array.isArray(assets)) throw Error('CAPTURE_DATE_GATE_ASSET_LIST_INVALID');
  const matches = assets.filter(asset => asset?.id === binding.assetID);
  if (matches.length !== 1 || matches[0].deletedAt !== null ||
      matches[0].cloudSafe !== true)
    throw Error('CAPTURE_DATE_GATE_ASSET_UNAVAILABLE');
  const asset = matches[0];
  if (typeof asset.sha256 !== 'string' || !SHA256.test(asset.sha256) ||
      asset.sha256.toLowerCase() !== binding.originalSHA256)
    throw Error('CAPTURE_DATE_GATE_ORIGINAL_CHANGED');
  if (!Number.isSafeInteger(asset.size) || asset.size < 8 ||
      asset.size > MAX_EXIF_ORIGINAL_BYTES)
    throw Error('CAPTURE_DATE_GATE_ORIGINAL_SIZE_INVALID');
  if (prior && asset.size !== prior.size)
    throw Error('CAPTURE_DATE_GATE_ORIGINAL_CHANGED');
  return Object.freeze({size: asset.size});
}
function savedRecipe(saved, binding) {
  if (!saved || !Number.isSafeInteger(saved.revision) ||
      saved.revision !== binding.savedRevision ||
      saved.body === null || saved.body === undefined)
    throw Error('CAPTURE_DATE_GATE_REVISION_CONFLICT');
}
async function exportPermission(api, binding, signal) {
  const permission = await read(() => api.assertPermission(binding.assetID, 'export'), signal);
  if (permission?.authorized !== true)
    throw Error('CAPTURE_DATE_GATE_EXPORT_PERMISSION_DENIED');
}

/**
 * Read-only evidence Gate for a current authenticated local Trial Asset only.
 * The caller-supplied binding is a claim, never authority. Fresh Trial HTTP
 * reads check principal, Asset SHA/size, saved Recipe revision and export
 * permission around the immutable Original read. This is not a transferable
 * permission capability: the eventual export must re-authorize independently.
 * The DNG reader proves only bounded metadata structure and bytes matching
 * the server-advertised SHA, not RAW decodability or camera-clock truth.
 */
export async function readTrialDngCaptureDateEvidence(options) {
  if (!exact(options, ['api', 'binding']) &&
      !exact(options, ['api', 'binding', 'signal']))
    throw Error('CAPTURE_DATE_GATE_INPUT_INVALID');
  const {api, signal} = options;
  const requested = options.binding;
  if (!(api instanceof TrialClient) ||
      !exact(requested, ['assetID', 'originalSHA256', 'savedRevision']) ||
      typeof requested.assetID !== 'string' || !UUID.test(requested.assetID) ||
      typeof requested.originalSHA256 !== 'string' ||
      !SHA256.test(requested.originalSHA256) ||
      !Number.isSafeInteger(requested.savedRevision) ||
      requested.savedRevision < 1 ||
      (signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function')))
    throw Error('CAPTURE_DATE_GATE_INPUT_INVALID');
  const binding = Object.freeze({assetID: requested.assetID.toLowerCase(),
    originalSHA256: requested.originalSHA256.toLowerCase(),
    savedRevision: requested.savedRevision});
  checkAbort(signal);
  const principal = sessionIdentity(await read(() => api.getSession(), signal));
  const firstAsset = listedAsset(await read(() => api.listAssets(), signal), binding);
  savedRecipe(await read(() => api.getRecipe(binding.assetID), signal), binding);
  await exportPermission(api, binding, signal);
  const original = await read(() => api.getOriginal(binding.assetID, {signal}), signal);
  if (!(original instanceof ArrayBuffer) || original.byteLength !== firstAsset.size)
    throw Error('CAPTURE_DATE_GATE_ORIGINAL_CHANGED');
  const evidence = await read(() => readDngExifCaptureDateEvidence(original, {
    assetID: binding.assetID, originalSHA256: binding.originalSHA256}, {signal}), signal);
  if (evidence.sourceAssetID !== binding.assetID ||
      evidence.sourceSHA256 !== binding.originalSHA256)
    throw Error('CAPTURE_DATE_GATE_ORIGINAL_CHANGED');
  listedAsset(await read(() => api.listAssets(), signal), binding, firstAsset);
  savedRecipe(await read(() => api.getRecipe(binding.assetID), signal), binding);
  sessionIdentity(await read(() => api.getSession(), signal), principal);
  await exportPermission(api, binding, signal);
  sessionIdentity(await read(() => api.getSession(), signal), principal);
  checkAbort(signal);
  return Object.freeze({evidence, binding,
    verification: 'TRIAL_FRESH_EXPORT_READ_ONLY_NOT_NAMING_AUTHORITY'});
}
