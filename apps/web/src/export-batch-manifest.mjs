import {buildExportFilename} from './export-naming.mjs';
import {resolveExportQueuePosition} from './export-queue.mjs';
import {captureDateForVerifiedBatch} from './export-naming-context.mjs';

export const MAX_BATCH_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const TYPES = Object.freeze({jpeg: 'image/jpeg', png: 'image/png', tiff: 'image/tiff'});
const METHODS = Object.freeze(['original', 'custom-count', 'custom-sequence', 'original-custom',
  'capture-date-original']);

/**
 * Name already-produced Final Blobs without downloading or writing anything.
 * This is not authorization: the caller must first complete Final for every
 * explicitly selected Asset, and must not publish a partial batch on failure.
 */
export function planBatchDownloadManifest({plan, items, format, method = 'original',
  customName, customText, captureDateEvidence, existingNames = []} = {}) {
  if (!Object.hasOwn(TYPES, format)) throw Error('EXPORT_FORMAT_UNSUPPORTED');
  if (!METHODS.includes(method)) throw Error('EXPORT_BATCH_NAMING_METHOD_UNSUPPORTED');
  if (method === 'original-custom' && customName !== undefined &&
      customText !== undefined && customName !== customText)
    throw Error('EXPORT_BATCH_CUSTOM_TEXT_CONFLICT');
  // The existing Batch UI calls its explicit text field `customName`. Only
  // this new method maps that input to the single-photo planner's customText.
  const selectedCustomText = method === 'original-custom' ?
    (customText === undefined ? customName : customText) : undefined;
  if (!Array.isArray(items) || items.length < 2 || items.length > 20 || !Array.isArray(plan) ||
      items.length !== plan.length) throw Error('EXPORT_BATCH_RESULT_INCOMPLETE');
  if (existingNames == null || typeof existingNames === 'string' ||
      typeof existingNames[Symbol.iterator] !== 'function')
    throw Error('EXPORT_EXISTING_NAMES_INVALID');
  const occupied = [...existingNames];
  if (occupied.some(name => typeof name !== 'string'))
    throw Error('EXPORT_EXISTING_NAMES_INVALID');
  let totalBytes = 0;
  const files = items.map((item, index) => {
    const selected = plan[index];
    if (!item || typeof item !== 'object' || item.assetId !== selected?.assetId ||
        !(item.blob instanceof Blob) || item.blob.type !== TYPES[format] ||
        !Number.isSafeInteger(item.blob.size) || item.blob.size < 1)
      throw Error('EXPORT_BATCH_RESULT_INVALID');
    const position = resolveExportQueuePosition({plan, asset: selected.asset});
    if (position.sequence !== index + 1 || position.total !== items.length)
      throw Error('EXPORT_BATCH_ORDER_MISMATCH');
    totalBytes += item.blob.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_BATCH_DOWNLOAD_BYTES)
      throw Error('EXPORT_BATCH_RESULT_TOO_LARGE');
    const name = buildExportFilename({originalFilename: selected.asset.name,
      format, method, customName, customText: selectedCustomText, sequence: position.sequence,
      total: position.total,
      ...(method === 'capture-date-original' ? {captureDate: captureDateForVerifiedBatch({
        evidence: captureDateEvidence, plan, asset: selected.asset})} : {}),
      existingNames: occupied});
    occupied.push(name);
    return Object.freeze({assetId: item.assetId, name, blob: item.blob,
      sequence: position.sequence, total: position.total});
  });
  return Object.freeze({status: 'download-manifest-only', files: Object.freeze(files),
    totalBytes});
}
