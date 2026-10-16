/**
 * A snapshot of an explicitly ordered selection, not a queue inferred from
 * library, upload, capture, or UI order. This module never reads an Original,
 * requests permission, renders, names a file, or starts Final export.
 */
export const MAX_EXPORT_QUEUE_ITEMS = 1000;
const plannedQueues = new WeakSet();

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim())
    throw Error('EXPORT_QUEUE_ID_INVALID');
  return value;
}

function assetSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('EXPORT_QUEUE_ASSET_INVALID');
  const assetId = id(value.id);
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 4096 ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256) ||
      !Number.isSafeInteger(value.size) || value.size < 1 ||
      (value.deletedAt !== undefined && value.deletedAt !== null) ||
      (value.cloudSafe !== undefined && typeof value.cloudSafe !== 'boolean'))
    throw Error('EXPORT_QUEUE_ASSET_INVALID');
  // Only stable, attribution-relevant inventory fields cross this boundary.
  // Do not pass storage keys, arbitrary metadata, or possible image bytes on.
  return Object.freeze({id: assetId, name: value.name, sha256: value.sha256.toLowerCase(),
    size: value.size, ...(value.cloudSafe !== undefined ? {cloudSafe: value.cloudSafe} : {})});
}

/**
 * @param {{orderedIds:string[],assets:object[]}} input Explicit selection and
 *   current Asset inventory from the same authenticated context.
 * @returns {ReadonlyArray<{assetId:string,sequence:number,total:number,asset:object}>}
 */
export function planExportQueue({orderedIds, assets} = {}) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) throw Error('EXPORT_QUEUE_SELECTION_REQUIRED');
  if (orderedIds.length > MAX_EXPORT_QUEUE_ITEMS) throw Error('EXPORT_QUEUE_TOO_LARGE');
  if (!Array.isArray(assets)) throw Error('EXPORT_QUEUE_INVENTORY_REQUIRED');
  const selection = orderedIds.map(id);
  if (new Set(selection).size !== selection.length) throw Error('EXPORT_QUEUE_DUPLICATE_SELECTION');
  const inventory = new Map();
  for (const item of assets) {
    const snapshot = assetSnapshot(item);
    if (inventory.has(snapshot.id)) throw Error('EXPORT_QUEUE_DUPLICATE_ASSET');
    inventory.set(snapshot.id, snapshot);
  }
  const total = selection.length;
  const plan = Object.freeze(selection.map((assetId, index) => {
    const asset = inventory.get(assetId);
    if (!asset) throw Error('EXPORT_QUEUE_ASSET_NOT_FOUND');
    return Object.freeze({assetId, sequence: index + 1, total, asset});
  }));
  plannedQueues.add(plan);
  return plan;
}

/**
 * Resolve the current Asset's position from an actual planExportQueue result.
 * A copied row or a manually constructed one cannot assert a batch order.
 * Callers must still verify permissions and a saved Recipe before Final export.
 */
export function resolveExportQueuePosition({plan, asset} = {}) {
  if (!plan || typeof plan !== 'object' || !plannedQueues.has(plan))
    throw Error('EXPORT_QUEUE_PLAN_REQUIRED');
  const current = assetSnapshot(asset);
  const entry = plan.find(item => item.assetId === current.id);
  if (!entry) throw Error('EXPORT_QUEUE_ASSET_NOT_SELECTED');
  if (entry.asset.name !== current.name || entry.asset.sha256 !== current.sha256 ||
      entry.asset.size !== current.size)
    throw Error('EXPORT_QUEUE_ASSET_STALE');
  return Object.freeze({sequence: entry.sequence, total: entry.total});
}
