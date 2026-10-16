import {TrialClient} from './trial-client.mjs';
import {validateBWEdgeManualContract} from './processing/bw-edge-manual-contract.mjs';
import {MAX_SOURCE_PIXELS} from './processing/pure.mjs';

const SHA = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a, b) => a === b;
const abortError = () => new DOMException('Aborted', 'AbortError');
function checkAbort(signal) {if (signal?.aborted) throw abortError();}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
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
  try {const value = await Promise.race([pending, cancelled]); checkAbort(signal); return value;}
  finally {signal.removeEventListener('abort', onAbort);}
}
function checkedSession(session, first) {
  const p = session?.principal;
  if (session?.mode !== 'INVITED_LOCAL_TRIAL' || !p ||
      typeof p.id !== 'string' || !UUID.test(p.id) ||
      typeof p.tenantId !== 'string' || p.tenantId !== `trial-${p.id}`)
    throw Error(session?.endedReason || 'BW_EDGE_GATE_SESSION_REQUIRED');
  if (first && (!same(p.id, first.id) || !same(p.tenantId, first.tenantId)))
    throw Error('BW_EDGE_GATE_SESSION_CHANGED');
  return {id: p.id, tenantId: p.tenantId};
}
function checkedAsset(assets, binding) {
  if (!Array.isArray(assets)) throw Error('BW_EDGE_GATE_ASSET_LIST_INVALID');
  const matches = assets.filter(item => item?.id === binding.assetID);
  if (matches.length !== 1 || matches[0].deletedAt !== null || matches[0].cloudSafe !== true)
    throw Error('BW_EDGE_GATE_ASSET_UNAVAILABLE');
  const asset = matches[0];
  if (typeof asset.sha256 !== 'string' || !SHA.test(asset.sha256) ||
      asset.sha256.toLowerCase() !== binding.originalSHA256.toLowerCase())
    throw Error('BW_EDGE_GATE_ORIGINAL_CHANGED');
  if (!Number.isSafeInteger(asset.size) || asset.size < 1)
    throw Error('BW_EDGE_GATE_ASSET_INVALID');
  return asset;
}
function checkedRecipe(saved, revision) {
  if (!saved || !Number.isSafeInteger(saved.revision) || saved.revision !== revision ||
      saved.body === undefined || saved.body === null)
    throw Error('BW_EDGE_GATE_REVISION_CONFLICT');
}
async function verifiedOriginal(api, binding, asset, signal) {
  const bytes = await read(() => api.getOriginal(binding.assetID, {signal}), signal);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== asset.size)
    throw Error('BW_EDGE_GATE_ORIGINAL_CHANGED');
  const digest = await read(() => crypto.subtle.digest('SHA-256', bytes), signal);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== binding.originalSHA256.toLowerCase())
    throw Error('BW_EDGE_GATE_ORIGINAL_CHANGED');
}

/**
 * Pre-Worker, read-only gate for the authenticated local Trial API only.
 * UI `allowed:true` cannot be passed in. The permission proof is an ephemeral
 * runtime assertion built only after a fresh server authorization response;
 * it is not itself a cryptographic capability or a replacement for save CAS.
 * Full-source dimensions are still verified by the decoded Worker frame.
 */
export async function readBWEdgeManualRuntime(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Reflect.ownKeys(options).some(key => !['api', 'document', 'draftBaseRevision',
        'confirmedSelections', 'action', 'signal'].includes(key)))
    throw Error('BW_EDGE_GATE_INPUT_INVALID');
  const {api, document, draftBaseRevision, confirmedSelections, action = 'edit', signal} = options;
  if (!(api instanceof TrialClient) || !['edit', 'export'].includes(action) ||
      !Number.isSafeInteger(draftBaseRevision) || draftBaseRevision < 1 ||
      !exact(confirmedSelections, ['subject', 'correction']) ||
      confirmedSelections.subject !== true || confirmedSelections.correction !== true)
    throw Error('BW_EDGE_GATE_INPUT_INVALID');
  const binding = document?.binding;
  if (!exact(binding, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight']) ||
      typeof binding.assetID !== 'string' || !UUID.test(binding.assetID) ||
      typeof binding.originalSHA256 !== 'string' || !SHA.test(binding.originalSHA256) ||
      !Number.isSafeInteger(binding.sourceWidth) || !Number.isSafeInteger(binding.sourceHeight) ||
      binding.sourceWidth < 1 || binding.sourceHeight < 1 ||
      binding.sourceWidth * binding.sourceHeight > MAX_SOURCE_PIXELS)
    throw Error('BW_EDGE_GATE_BINDING_INVALID');
  checkAbort(signal);
  const principal = checkedSession(await read(() => api.getSession(), signal));
  const firstAsset = checkedAsset(await read(() => api.listAssets(), signal), binding);
  checkedRecipe(await read(() => api.getRecipe(binding.assetID), signal), draftBaseRevision);
  await verifiedOriginal(api, binding, firstAsset, signal);
  const lastAsset = checkedAsset(await read(() => api.listAssets(), signal), binding);
  if (lastAsset.size !== firstAsset.size) throw Error('BW_EDGE_GATE_ORIGINAL_CHANGED');
  checkedRecipe(await read(() => api.getRecipe(binding.assetID), signal), draftBaseRevision);
  checkedSession(await read(() => api.getSession(), signal), principal);
  const permission = await read(() => api.assertPermission(binding.assetID, action), signal);
  if (permission?.authorized !== true) throw Error('BW_EDGE_GATE_PERMISSION_DENIED');
  const runtime = Object.freeze({assetID: binding.assetID,
    originalSHA256: binding.originalSHA256, sourceWidth: binding.sourceWidth,
    sourceHeight: binding.sourceHeight, draftBaseRevision,
    savedRevision: draftBaseRevision,
    confirmedSelections: Object.freeze({subject: true, correction: true}),
    permissionEvidence: Object.freeze({assetID: binding.assetID,
      originalSHA256: binding.originalSHA256, sourceWidth: binding.sourceWidth,
      sourceHeight: binding.sourceHeight, savedRevision: draftBaseRevision,
      action, allowed: true})});
  const validated = validateBWEdgeManualContract(document, runtime, {signal});
  checkAbort(signal);
  return Object.freeze({document: validated.document, runtime});
}
