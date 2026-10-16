// Deliberately narrow metadata reader for immutable Original bytes with a
// classic TIFF (42) header and an IFD0 -> Exif IFD pointer. This is NOT a RAW
// decoder, full DNG validator, timezone resolver, or export-naming policy.
// Exif DateTimeOriginal (0x9003) is ASCII[20] and OffsetTimeOriginal (0x9011)
// is ASCII[7], per CIPA Exif 2.31 Table 7. No fallback to DateTimeDigitized,
// LibRaw time_t, file time, or host locale is permitted here.
export const MAX_EXIF_ORIGINAL_BYTES = 128 * 1024 * 1024;
const MAX_METADATA_OFFSET = 16 * 1024 * 1024;
const MAX_IFD_ENTRIES = 256;
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const DNG_VERSION_TAG = 0xc612;
const DNG_BACKWARD_VERSION_TAG = 0xc613;
const DNG_UNIQUE_CAMERA_MODEL_TAG = 0xc614;
const ORIENTATION_TAG = 0x0112;
const EXIF_IFD_POINTER_TAG = 0x8769;
const MAX_DNG_VERSION = [1, 7, 1, 0]; // Adobe DNG 1.7.1 specification.

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Exif metadata read cancelled', 'AbortError');
}
function exactRecord(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function range(offset, length, byteLength) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 8 ||
      length < 0 || offset > MAX_METADATA_OFFSET ||
      length > MAX_METADATA_OFFSET - offset || length > byteLength - offset)
    throw Error('EXIF_CAPTURE_METADATA_BOUNDS');
}
function readIFD(view, offset, little, wanted) {
  range(offset, 2, view.byteLength);
  const count = view.getUint16(offset, little);
  if (count > MAX_IFD_ENTRIES) throw Error('EXIF_CAPTURE_IFD_LIMIT');
  range(offset, 2 + 12 * count + 4, view.byteLength);
  const selected = new Map();
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + 12 * index;
    const tag = view.getUint16(entry, little);
    if (!wanted.includes(tag)) continue;
    if (selected.has(tag)) throw Error('EXIF_CAPTURE_DUPLICATE_TAG');
    selected.set(tag, {type: view.getUint16(entry + 2, little),
      count: view.getUint32(entry + 4, little),
      value: view.getUint32(entry + 8, little), entryOffset: entry});
  }
  return selected;
}
function ascii(view, entry, count) {
  if (!entry || entry.type !== 2 || entry.count !== count)
    throw Error('EXIF_CAPTURE_TAG_TYPE_OR_COUNT');
  range(entry.value, count, view.byteLength);
  if (view.getUint8(entry.value + count - 1) !== 0)
    throw Error('EXIF_CAPTURE_ASCII_TERMINATOR');
  let value = '';
  for (let index = 0; index < count - 1; index++) {
    const byte = view.getUint8(entry.value + index);
    if (byte < 0x20 || byte > 0x7e) throw Error('EXIF_CAPTURE_ASCII_INVALID');
    value += String.fromCharCode(byte);
  }
  return value;
}
function dateParts(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw Error('EXIF_CAPTURE_DATE_INVALID');
  const [, yyyy, mm, dd, hh, minute, second] = match;
  const year = Number(yyyy), month = Number(mm), day = Number(dd);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 ||
      day > days[month - 1] || Number(hh) > 23 ||
      Number(minute) > 59 || Number(second) > 59)
    throw Error('EXIF_CAPTURE_DATE_INVALID');
  return `${yyyy}${mm}${dd}`;
}
function offsetValue(value) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 14 ||
      (Number(match[2]) === 14 && Number(match[3]) !== 0) ||
      Number(match[3]) > 59)
    throw Error('EXIF_CAPTURE_OFFSET_INVALID');
  // This is an Exif numeric offset, never a named timezone or UTC conversion.
  return value;
}
function versionCompare(left, right) {
  for (let index = 0; index < 4; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
function dngVersionBytes(view, entry) {
  if (!entry || entry.type !== 1 || entry.count !== 4)
    throw Error('EXIF_CAPTURE_DNG_VERSION_INVALID');
  return Array.from({length: 4}, (_, index) => view.getUint8(entry.entryOffset + 8 + index));
}
function requireDngIFD0(view, root, little) {
  // Adobe DNG 1.7.1: DNGVersion is required in IFD 0 (BYTE[4]);
  // DNGBackwardVersion defaults to the version with its last two bytes zero.
  // This checks a narrow DNG-signalled TIFF subset, NOT full DNG compliance.
  const version = dngVersionBytes(view, root.get(DNG_VERSION_TAG));
  if (versionCompare(version, [1, 0, 0, 0]) < 0 ||
      versionCompare(version, MAX_DNG_VERSION) > 0)
    throw Error('EXIF_CAPTURE_DNG_VERSION_UNSUPPORTED');
  const backwardEntry = root.get(DNG_BACKWARD_VERSION_TAG);
  const backward = backwardEntry ? dngVersionBytes(view, backwardEntry) :
    [version[0], version[1], 0, 0];
  if (versionCompare(backward, [1, 0, 0, 0]) < 0 ||
      versionCompare(backward, version) > 0 ||
      versionCompare(backward, MAX_DNG_VERSION) > 0)
    throw Error('EXIF_CAPTURE_DNG_VERSION_UNSUPPORTED');
  const orientation = root.get(ORIENTATION_TAG);
  if (!orientation || orientation.type !== 3 || orientation.count !== 1 ||
      view.getUint16(orientation.entryOffset + 8, little) < 1 ||
      view.getUint16(orientation.entryOffset + 8, little) > 8)
    throw Error('EXIF_CAPTURE_DNG_ORIENTATION_INVALID');
  const model = root.get(DNG_UNIQUE_CAMERA_MODEL_TAG);
  // The intentionally supported subset requires a printable, external ASCII
  // camera-model string. Other encodings/inline variants remain unsupported.
  if (!model || model.type !== 2 || model.count < 5 || model.count > 256)
    throw Error('EXIF_CAPTURE_DNG_CAMERA_MODEL_INVALID');
  range(model.value, model.count, view.byteLength);
  if (view.getUint8(model.value + model.count - 1) !== 0)
    throw Error('EXIF_CAPTURE_DNG_CAMERA_MODEL_INVALID');
  for (let index = 0; index < model.count - 1; index++) {
    const byte = view.getUint8(model.value + index);
    if (byte < 0x20 || byte > 0x7e)
      throw Error('EXIF_CAPTURE_DNG_CAMERA_MODEL_INVALID');
  }
  return {version: version.join('.'), backwardVersion: backward.join('.'),
    backwardVersionSource: backwardEntry ? 'TAG' : 'SPEC_DEFAULT'};
}
function parseClassicTiffExif(bytes, requireDng = false) {
  if (bytes.length < 8) throw Error('EXIF_CAPTURE_UNSUPPORTED_CONTAINER');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!little && !big) throw Error('EXIF_CAPTURE_UNSUPPORTED_CONTAINER');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42)
    throw Error('EXIF_CAPTURE_UNSUPPORTED_CONTAINER'); // BigTIFF and other RAWs
  const firstIFD = view.getUint32(4, little);
  // At most two IFDs are visited: IFD 0 and its direct Exif IFD. We do not
  // chase next-IFD, SubIFD, MakerNote, preview, or XMP metadata as fallbacks.
  const wantedRootTags = requireDng ? [EXIF_IFD_POINTER_TAG,
    DNG_VERSION_TAG, DNG_BACKWARD_VERSION_TAG,
    DNG_UNIQUE_CAMERA_MODEL_TAG, ORIENTATION_TAG] : [EXIF_IFD_POINTER_TAG];
  const root = readIFD(view, firstIFD, little, wantedRootTags);
  const dng = requireDng ? requireDngIFD0(view, root, little) : null;
  const pointer = root.get(EXIF_IFD_POINTER_TAG);
  if (!pointer) throw Error('EXIF_CAPTURE_DATE_UNAVAILABLE');
  if (pointer.type !== 4 || pointer.count !== 1)
    throw Error('EXIF_CAPTURE_TAG_TYPE_OR_COUNT');
  if (pointer.value === firstIFD) throw Error('EXIF_CAPTURE_IFD_CYCLE');
  const exif = readIFD(view, pointer.value, little, [0x9003, 0x9011]);
  if (!exif.has(0x9003)) throw Error('EXIF_CAPTURE_DATE_UNAVAILABLE');
  const dateTimeOriginal = ascii(view, exif.get(0x9003), 20);
  const calendarDateOriginal = dateParts(dateTimeOriginal);
  const offsetEntry = exif.get(0x9011);
  const offsetTimeOriginal = offsetEntry ? offsetValue(ascii(view, offsetEntry, 7)) : null;
  return {dateTimeOriginal, calendarDateOriginal, offsetTimeOriginal, dng};
}

/**
 * Read only file-embedded Exif evidence from a SHA-bound immutable Original.
 * A successful result is structural evidence, not proof that the camera clock
 * was correct or that the container is a decodable camera RAW. In particular,
 * an offset-less wall date is NOT authorized for export naming by this module.
 * The SHA matches bytes to the supplied hash; this pure reader cannot prove
 * that the supplied Asset ID/SHA came from an authenticated Asset authority.
 */
async function readCaptureDateEvidence(original, binding, options, requireDng) {
  if (!exactRecord(options, []) && !exactRecord(options, ['signal']))
    throw Error('EXIF_CAPTURE_INPUT_INVALID');
  const {signal} = options;
  if (!(original instanceof ArrayBuffer) || original.byteLength < 8 ||
      original.byteLength > MAX_EXIF_ORIGINAL_BYTES ||
      !exactRecord(binding, ['assetID', 'originalSHA256']) ||
      typeof binding.assetID !== 'string' || !ASSET_ID.test(binding.assetID) ||
      typeof binding.originalSHA256 !== 'string' || !SHA256.test(binding.originalSHA256) ||
      (signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean')))
    throw Error('EXIF_CAPTURE_INPUT_INVALID');
  abortIfNeeded(signal);
  // Snapshot before hashing and parsing: a mutable caller buffer must not let
  // the digest authenticate different bytes from the ones whose tags we read.
  const snapshot = new Uint8Array(original.slice(0));
  const parsed = parseClassicTiffExif(snapshot, requireDng);
  abortIfNeeded(signal);
  if (!globalThis.crypto?.subtle) throw Error('EXIF_CAPTURE_CRYPTO_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', snapshot);
  abortIfNeeded(signal);
  const actualSHA256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actualSHA256 !== binding.originalSHA256.toLowerCase())
    throw Error('EXIF_CAPTURE_ORIGINAL_SHA_MISMATCH');
  return Object.freeze({sourceAssetID: binding.assetID.toLowerCase(),
    sourceSHA256: actualSHA256,
    sourceContainer: requireDng ? 'DNG_VERSION_SIGNALLED_CLASSIC_TIFF_EXIF_IFD_SUBSET' :
      'CLASSIC_TIFF_EXIF_IFD_ONLY',
    ...(requireDng ? {dngVersion: parsed.dng.version,
      dngBackwardVersion: parsed.dng.backwardVersion,
      dngBackwardVersionSource: parsed.dng.backwardVersionSource} : {}),
    dateTimeOriginal: parsed.dateTimeOriginal,
    calendarDateOriginal: parsed.calendarDateOriginal,
    dateSource: 'EXIF_DateTimeOriginal_0x9003',
    offsetTimeOriginal: parsed.offsetTimeOriginal,
    offsetEvidence: parsed.offsetTimeOriginal === null ? 'NOT_PRESENT' : 'EXIF_OffsetTimeOriginal_0x9011',
    verification: requireDng ? 'STRUCTURAL_DNG_SIGNAL_ONLY_NOT_FULL_DNG_OR_CLOCK_TRUTH' :
      'STRUCTURAL_EXIF_ONLY_NOT_RAW_OR_CLOCK_TRUTH'});
}

export function readExifCaptureDateEvidence(original, binding, options = {}) {
  return readCaptureDateEvidence(original, binding, options, false);
}

/**
 * DNG-version-signalled Classic TIFF subset only. This does not validate the
 * raw image, camera-clock truth, or that the bytes are a complete compliant
 * DNG. The supplied Asset binding still needs authenticated product evidence.
 * No export filename is selected, especially when OffsetTimeOriginal is absent.
 */
export function readDngExifCaptureDateEvidence(original, binding, options = {}) {
  return readCaptureDateEvidence(original, binding, options, true);
}
