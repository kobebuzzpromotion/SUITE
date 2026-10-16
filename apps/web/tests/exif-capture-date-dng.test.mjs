import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readDngExifCaptureDateEvidence} from '../src/processing/exif-capture-date.mjs';

// Synthetic TIFF structures with DNG-signalling tags, NOT a real DNG corpus
// and not evidence that the bytes contain a valid or decodable RAW image.
const ASSET_ID = randomUUID();
const sha = input => createHash('sha256').update(new Uint8Array(input)).digest('hex');
const binding = input => ({assetID: ASSET_ID, originalSHA256: sha(input)});
function signalledTiff({endian = 'II', version = [1, 4, 0, 0], backward = [1, 3, 0, 0],
  model = 'Test Camera', orientation = 1, offset = '+09:00',
  rootDate = false, exifDate = true, duplicateRootTag = false} = {}) {
  const bytes = new Uint8Array(384), view = new DataView(bytes.buffer);
  const little = endian === 'II';
  bytes[0] = bytes[1] = little ? 0x49 : 0x4d;
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  const root = [
    [0x0112, 3, 1, orientation],
    [0x8769, 4, 1, 120],
    [0xc612, 1, 4, version],
    [0xc614, 2, model.length + 1, 300],
  ];
  if (backward !== null) root.push([0xc613, 1, 4, backward]);
  if (rootDate) root.push([0x9003, 2, 20, 200]);
  if (duplicateRootTag) root.push([0xc612, 1, 4, version]);
  view.setUint16(8, root.length, little);
  function entry(at, [tag, type, count, value]) {
    view.setUint16(at, tag, little);
    view.setUint16(at + 2, type, little);
    view.setUint32(at + 4, count, little);
    if (Array.isArray(value)) bytes.set(value, at + 8);
    else if (type === 3 && count === 1) view.setUint16(at + 8, value, little);
    else view.setUint32(at + 8, value, little);
  }
  root.forEach((tag, index) => entry(10 + 12 * index, tag));
  const exif = [];
  if (exifDate) exif.push([0x9003, 2, 20, 200]);
  if (offset !== null) exif.push([0x9011, 2, 7, 240]);
  view.setUint16(120, exif.length, little);
  exif.forEach((tag, index) => entry(122 + 12 * index, tag));
  bytes.set(new TextEncoder().encode('2024:02:29 23:59:58\0'), 200);
  if (offset !== null) bytes.set(new TextEncoder().encode(`${offset}\0`), 240);
  bytes.set(new TextEncoder().encode(`${model}\0`), 300);
  return bytes.buffer;
}
async function rejectsWith(input, expression) {
  await assert.rejects(readDngExifCaptureDateEvidence(input, binding(input)), expression);
}

test('DNG-DATE-01 / SYNTHETIC_ONLY: both byte orders require IFD0 DNG signal, read only its direct Exif IFD and bind bytes by SHA', async () => {
  for (const endian of ['II', 'MM']) {
    const input = signalledTiff({endian});
    const before = input.slice(0);
    const result = await readDngExifCaptureDateEvidence(input, binding(input));
    assert.deepEqual(result, {
      sourceAssetID: ASSET_ID, sourceSHA256: sha(input),
      sourceContainer: 'DNG_VERSION_SIGNALLED_CLASSIC_TIFF_EXIF_IFD_SUBSET',
      dngVersion: '1.4.0.0', dngBackwardVersion: '1.3.0.0', dngBackwardVersionSource: 'TAG',
      dateTimeOriginal: '2024:02:29 23:59:58', calendarDateOriginal: '20240229',
      dateSource: 'EXIF_DateTimeOriginal_0x9003',
      offsetTimeOriginal: '+09:00', offsetEvidence: 'EXIF_OffsetTimeOriginal_0x9011',
      verification: 'STRUCTURAL_DNG_SIGNAL_ONLY_NOT_FULL_DNG_OR_CLOCK_TRUTH',
    });
    assert.deepEqual(input, before);
    assert.ok(Object.isFrozen(result));
    assert.equal(Object.hasOwn(result, 'captureDate'), false);
  }
});

test('DNG-DATE-02 / SYNTHETIC_ONLY: backward default and offset-less wall date remain evidence, not an export date policy', async () => {
  const input = signalledTiff({backward: null, offset: null});
  const result = await readDngExifCaptureDateEvidence(input, binding(input));
  assert.equal(result.dngBackwardVersion, '1.4.0.0');
  assert.equal(result.dngBackwardVersionSource, 'SPEC_DEFAULT');
  assert.equal(result.offsetTimeOriginal, null);
  assert.equal(result.offsetEvidence, 'NOT_PRESENT');
  assert.equal(Object.hasOwn(result, 'captureDate'), false);
  assert.equal(Object.hasOwn(result, 'utcTime'), false);
});

test('DNG-DATE-03 / SYNTHETIC_ONLY: ordinary TIFF, missing or malformed DNGVersion, unsupported versions and duplicate IFD0 tag are rejected', async () => {
  const noVersion = signalledTiff();
  new DataView(noVersion).setUint16(34, 0xc611, true);
  await rejectsWith(noVersion, /EXIF_CAPTURE_DNG_VERSION_INVALID/);
  for (const version of [[0, 9, 0, 0], [1, 7, 2, 0], [2, 0, 0, 0]]) {
    const input = signalledTiff({version});
    await rejectsWith(input, /EXIF_CAPTURE_DNG_VERSION_UNSUPPORTED/);
  }
  for (const backward of [[1, 8, 0, 0], [1, 5, 0, 0], [0, 9, 0, 0]]) {
    const input = signalledTiff({backward});
    await rejectsWith(input, /EXIF_CAPTURE_DNG_VERSION_UNSUPPORTED/);
  }
  const wrongType = signalledTiff();
  new DataView(wrongType).setUint16(36, 3, true);
  await rejectsWith(wrongType, /EXIF_CAPTURE_DNG_VERSION_INVALID/);
  const wrongCount = signalledTiff();
  new DataView(wrongCount).setUint32(38, 3, true);
  await rejectsWith(wrongCount, /EXIF_CAPTURE_DNG_VERSION_INVALID/);
  await rejectsWith(signalledTiff({duplicateRootTag: true}), /EXIF_CAPTURE_DUPLICATE_TAG/);
});

test('DNG-DATE-04 / SYNTHETIC_ONLY: required IFD0 camera/orientation and direct Exif provenance fail closed', async () => {
  await rejectsWith(signalledTiff({orientation: 0}), /EXIF_CAPTURE_DNG_ORIENTATION_INVALID/);
  await rejectsWith(signalledTiff({orientation: 9}), /EXIF_CAPTURE_DNG_ORIENTATION_INVALID/);
  await rejectsWith(signalledTiff({model: 'X'}), /EXIF_CAPTURE_DNG_CAMERA_MODEL_INVALID/);
  await rejectsWith(signalledTiff({rootDate: true, exifDate: false}), /EXIF_CAPTURE_DATE_UNAVAILABLE/);
  const noPointer = signalledTiff();
  new DataView(noPointer).setUint16(22, 0x8768, true);
  await rejectsWith(noPointer, /EXIF_CAPTURE_DATE_UNAVAILABLE/);
  const misplacedVersion = signalledTiff();
  const view = new DataView(misplacedVersion);
  view.setUint16(34, 0xc611, true);
  view.setUint16(120, 3, true);
  view.setUint16(146, 0xc612, true);
  view.setUint16(148, 1, true);
  view.setUint32(150, 4, true);
  new Uint8Array(misplacedVersion).set([1, 4, 0, 0], 154);
  await rejectsWith(misplacedVersion, /EXIF_CAPTURE_DNG_VERSION_INVALID/);
});

test('DNG-DATE-05 / SYNTHETIC_ONLY: bounded two-IFD walk, BigTIFF/other RAW and malformed metadata are rejected', async () => {
  const overCount = signalledTiff();
  new DataView(overCount).setUint16(8, 257, true);
  await rejectsWith(overCount, /EXIF_CAPTURE_IFD_LIMIT/);
  const overPointer = signalledTiff();
  new DataView(overPointer).setUint32(26 + 4, 0xffffffff, true);
  await rejectsWith(overPointer, /EXIF_CAPTURE_METADATA_BOUNDS/);
  const overExif = signalledTiff();
  new DataView(overExif).setUint16(120, 257, true);
  await rejectsWith(overExif, /EXIF_CAPTURE_IFD_LIMIT/);
  for (const prefix of [[0x49, 0x49, 43, 0, 8, 0, 0, 0],
    [0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0],
    [0x52, 0x41, 0x57, 0, 0, 0, 0, 0]]) {
    const input = Uint8Array.from(prefix).buffer;
    await rejectsWith(input, /EXIF_CAPTURE_UNSUPPORTED_CONTAINER/);
  }
});

test('DNG-DATE-06 / SYNTHETIC_ONLY: claimed Asset/SHA is not authentication; mismatch and abort reject without mutation', async () => {
  const input = signalledTiff();
  const before = input.slice(0);
  await assert.rejects(readDngExifCaptureDateEvidence(input,
    {assetID: ASSET_ID, originalSHA256: 'f'.repeat(64)}),
  /EXIF_CAPTURE_ORIGINAL_SHA_MISMATCH/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readDngExifCaptureDateEvidence(input, binding(input),
    {signal: controller.signal}), {name: 'AbortError'});
  assert.deepEqual(input, before);
});
