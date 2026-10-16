/**
 * Read-only Perfect Shot candidate plan. This does not recognize people, choose
 * a face, edit pixels, or authorize a later operation. Both adapter methods
 * MUST be backed by fresh server authentication and Project membership checks.
 * In particular, Workspace.listAssets registration order is NOT a shoot order
 * and must never be relabeled as one. No current product adapter implements the
 * authenticated shoot-order method, so the current product fails closed.
 */
const MAX_PROJECT_ASSETS = 100_000;
const RADIUS = 7;
const SHA256 = /^[0-9a-f]{64}$/iu;
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const abort = signal => {
  if (signal?.aborted) throw new DOMException('Candidate planning cancelled', 'AbortError');
};
function id(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value))
    throw Error('PERFECT_SHOT_ID_INVALID');
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER)
    throw Error('PERFECT_SHOT_VERSION_INVALID');
  return value;
}
function order(value, workspaceId, projectId) {
  if (!exact(value, ['subjectId', 'workspaceId', 'projectId', 'orderKind',
    'orderRevision', 'orderedAssetIds']) || value.workspaceId !== workspaceId ||
    value.projectId !== projectId || value.orderKind !== 'authenticated-shoot-sequence-v1' ||
    !Array.isArray(value.orderedAssetIds) || value.orderedAssetIds.length < 1 ||
    value.orderedAssetIds.length > MAX_PROJECT_ASSETS ||
    Object.keys(value.orderedAssetIds).length !== value.orderedAssetIds.length)
    throw Error('PERFECT_SHOT_ORDER_EVIDENCE_INVALID');
  id(value.subjectId);
  version(value.orderRevision);
  const ids = value.orderedAssetIds.map(id);
  if (new Set(ids).size !== ids.length) throw Error('PERFECT_SHOT_ORDER_EVIDENCE_INVALID');
  return {subjectId: value.subjectId, orderRevision: value.orderRevision, ids};
}
function asset(value, context, assetId) {
  if (!exact(value, ['subjectId', 'workspaceId', 'projectId', 'assetId',
    'orderRevision', 'originalSHA256', 'recipeRevision', 'deletedAt']) ||
    value.subjectId !== context.subjectId || value.workspaceId !== context.workspaceId ||
    value.projectId !== context.projectId || value.assetId !== assetId ||
    value.orderRevision !== context.orderRevision || value.deletedAt !== null ||
    typeof value.originalSHA256 !== 'string' || !SHA256.test(value.originalSHA256))
    throw Error('PERFECT_SHOT_ASSET_EVIDENCE_INVALID');
  version(value.recipeRevision);
  return Object.freeze({assetId, originalSHA256: value.originalSHA256.toLowerCase(),
    recipeRevision: value.recipeRevision});
}

/**
 * Adapter contract:
 * - readAuthenticatedProjectShootOrder must freshly authenticate the caller,
 *   prove current Project membership, and return the Project's explicit shoot
 *   sequence. A UI array, gallery sort, registration timestamp or a boolean
 *   `authorized` claim is insufficient.
 * - readAuthenticatedProjectAsset must independently perform the same checks,
 *   return a nondeleted registered Asset, current Original SHA-256, and the
 *   current saved Recipe revision. It must not infer revision from a draft.
 * These are trust-boundary requirements, not verified by this pure client code.
 */
export async function planPerfectShotCandidateWindow({api, workspaceId, projectId,
  selectedAssetId, signal} = {}) {
  id(workspaceId); id(projectId); id(selectedAssetId); abort(signal);
  if (typeof api?.readAuthenticatedProjectShootOrder !== 'function')
    throw Error('PERFECT_SHOT_ORDER_EVIDENCE_UNAVAILABLE');
  if (typeof api?.readAuthenticatedProjectAsset !== 'function')
    throw Error('PERFECT_SHOT_ASSET_EVIDENCE_UNAVAILABLE');
  const request = Object.freeze({workspaceId, projectId, signal});
  const first = order(await api.readAuthenticatedProjectShootOrder(request), workspaceId, projectId);
  abort(signal);
  const centerIndex = first.ids.indexOf(selectedAssetId);
  if (centerIndex < 0) throw Error('PERFECT_SHOT_SELECTED_NOT_IN_PROJECT');
  const start = Math.max(0, centerIndex - RADIUS);
  const end = Math.min(first.ids.length, centerIndex + RADIUS + 1);
  const context = {workspaceId, projectId, subjectId: first.subjectId,
    orderRevision: first.orderRevision};
  const candidates = [];
  for (let index = start; index < end; index++) {
    abort(signal);
    const assetId = first.ids[index];
    const snapshot = asset(await api.readAuthenticatedProjectAsset(Object.freeze({
      ...request, assetId, orderRevision: first.orderRevision})), context, assetId);
    abort(signal);
    candidates.push(Object.freeze({...snapshot, orderIndex: index,
      relativeOffset: index - centerIndex}));
  }
  // A read-only plan still must not combine snapshots from two different order
  // revisions. The later face-operation gate must independently revalidate.
  const last = order(await api.readAuthenticatedProjectShootOrder(request), workspaceId, projectId);
  abort(signal);
  if (last.subjectId !== first.subjectId || last.orderRevision !== first.orderRevision ||
      last.ids.length !== first.ids.length ||
      last.ids.some((assetId, index) => assetId !== first.ids[index]))
    throw Error('PERFECT_SHOT_ORDER_CHANGED');
  return Object.freeze({kind: 'perfect-shot-candidate-window-v1', workspaceId, projectId,
    subjectId: first.subjectId, selectedAssetId, orderRevision: first.orderRevision,
    centerIndex, projectAssetCount: first.ids.length,
    candidates: Object.freeze(candidates)});
}
