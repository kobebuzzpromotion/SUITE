import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readExifCaptureDateEvidence, MAX_EXIF_ORIGINAL_BYTES} from '../src/processing/exif-capture-date.mjs';

const ASSET_ID = randomUUID();
const hash = buffer => createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
const bound = buffer => ({assetID: ASSET_ID, originalSHA256: hash(buffer)});
const clone = buffer => buffer.slice(0);
function classicTiff({endian = 'II', date = '2024:02:29 23:59:58',
  offset = '+09:00', duplicateDate = false, omitDate = false,
  duplicatePointer = false, digitizedOnly = false} = {}) {
  const bytes = new Uint8Array(256), view = new DataView(bytes.buffer);
  const little = endian === 'II';
  bytes[0] = little ? 0x49 : 0x4d;
  bytes[1] = bytes[0];
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, duplicatePointer ? 2 : 1, little);
  function entry(at, tag, type, count, value) {
    view.setUint16(at, tag, little);
    view.setUint16(at + 2, type, little);
    view.setUint32(at + 4, count, little);
    view.setUint32(at + 8, value, little);
  }
  entry(10, 0x8769, 4, 1, 40);
  if (duplicatePointer) entry(22, 0x8769, 4, 1, 40);
  const tags = [];
  if (!omitDate) tags.push([0x9003, 20, 100]);
  if (offset !== null) tags.push([0x9011, 7, 128]);
  if (digitizedOnly) tags.push([0x9004, 20, 150]);
  if (duplicateDate) tags.push([0x9003, 20, 100]);
  view.setUint16(40, tags.length, little);
  tags.forEach(([tag, count, value], index) => entry(42 + index * 12, tag, 2, count, value));
  if (date !== null) {
    assert.equal(date.length, 19);
    bytes.set(new TextEncoder().encode(date), 100);
    bytes[119] = 0;
  }
  if (offset !== null) {
    assert.equal(offset.length, 6);
    bytes.set(new TextEncoder().encode(offset), 128);
    bytes[134] = 0;
  }
  if (digitizedOnly) {
    bytes.set(new TextEncoder().encode('2024:03:01 00:00:00'), 150);
    bytes[169] = 0;
  }
  return bytes.buffer;
}

test('EXIF-DATE-01 / SYNTHETIC_TIFF: both byte orders preserve original wall day and optional offset without timezone conversion', async () => {
  for (const endian of ['II', 'MM']) {
    const original = classicTiff({endian});
    const before = clone(original);
    const evidence = await readExifCaptureDateEvidence(original, bound(original));
    assert.deepEqual(evidence, {
      sourceAssetID: ASSET_ID, sourceSHA256: hash(original),
      sourceContainer: 'CLASSIC_TIFF_EXIF_IFD_ONLY',
      dateTimeOriginal: '2024:02:29 23:59:58',
      calendarDateOriginal: '20240229', dateSource: 'EXIF_DateTimeOriginal_0x9003',
      offsetTimeOriginal: '+09:00', offsetEvidence: 'EXIF_OffsetTimeOriginal_0x9011',
      verification: 'STRUCTURAL_EXIF_ONLY_NOT_RAW_OR_CLOCK_TRUTH',
    });
    assert.ok(Object.isFrozen(evidence));
    assert.deepEqual(original, before);
    assert.equal(Object.hasOwn(evidence, 'captureDate'), false);
  }
});

test('EXIF-DATE-02 / SYNTHETIC_TIFF: absent offset stays absent; wall date never becomes UTC instant or naming decision', async () => {
  const original = classicTiff({date: '2024:01:01 00:30:00', offset: null});
  const evidence = await readExifCaptureDateEvidence(original, bound(original));
  assert.equal(evidence.calendarDateOriginal, '20240101');
  assert.equal(evidence.offsetTimeOriginal, null);
  assert.equal(evidence.offsetEvidence, 'NOT_PRESENT');
  assert.equal(Object.hasOwn(evidence, 'utcTime'), false);
  assert.equal(Object.hasOwn(evidence, 'captureDate'), false);
});

test('EXIF-DATE-03: malformed, missing and conflicting calendar/offset tags fail closed', async () => {
  for (const date of ['2023:02:29 23:00:00', '2024:02:30 23:00:00',
    '2024:13:01 23:00:00', '2024:01:01 24:00:00',
    '0000:01:01 00:00:00', '2024:01:01 00:00:60',
    '2024-01-01 00:00:00']) {
    const input = classicTiff({date});
    await assert.rejects(readExifCaptureDateEvidence(input, bound(input)),
      /EXIF_CAPTURE_DATE_INVALID/);
  }
  for (const offset of ['+14:30', '+25:00', '+09:60', '+09-00']) {
    const input = classicTiff({offset});
    await assert.rejects(readExifCaptureDateEvidence(input, bound(input)),
      /EXIF_CAPTURE_OFFSET_INVALID/);
  }
  for (const options of [{omitDate: true}, {omitDate: true, digitizedOnly: true}, {duplicateDate: true},
    {duplicatePointer: true}]) {
    const input = classicTiff(options);
    await assert.rejects(readExifCaptureDateEvidence(input, bound(input)),
      /EXIF_CAPTURE_DATE_UNAVAILABLE|EXIF_CAPTURE_DUPLICATE_TAG/);
  }
});

test('EXIF-DATE-04: malicious IFD counts, pointers, types, count and unterminated text cannot read out of bounds', async () => {
  const cases = [
    bytes => new DataView(bytes).setUint16(8, 65535, true),
    bytes => new DataView(bytes).setUint32(18, 0xffffffff, true),
    bytes => new DataView(bytes).setUint32(4, 0xffffffff, true),
    bytes => new DataView(bytes).setUint16(44, 4, true),
    bytes => new DataView(bytes).setUint32(46, 19, true),
    bytes => new DataView(bytes).setUint32(50, 0xffffffff, true),
    bytes => {new Uint8Array(bytes)[119] = 65;},
    bytes => {new Uint8Array(bytes)[134] = 65;},
  ];
  for (const corrupt of cases) {
    const input = classicTiff(); corrupt(input);
    await assert.rejects(readExifCaptureDateEvidence(input, bound(input)),
      /EXIF_CAPTURE_(IFD_LIMIT|METADATA_BOUNDS|TAG_TYPE_OR_COUNT|ASCII_TERMINATOR)/);
  }
});

test('EXIF-DATE-05: unsupported JPEG/BigTIFF/other bytes and oversize Original are explicit failures', async () => {
  for (const prefix of [new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0]),
    new Uint8Array([0x49, 0x49, 43, 0, 8, 0, 0, 0]),
    new Uint8Array([0x52, 0x41, 0x57, 0, 0, 0, 0, 0])]) {
    const input = prefix.buffer;
    await assert.rejects(readExifCaptureDateEvidence(input, bound(input)),
      /EXIF_CAPTURE_UNSUPPORTED_CONTAINER/);
  }
  const huge = new ArrayBuffer(MAX_EXIF_ORIGINAL_BYTES + 1);
  await assert.rejects(readExifCaptureDateEvidence(huge,
    {assetID: ASSET_ID, originalSHA256: 'a'.repeat(64)}),
    /EXIF_CAPTURE_INPUT_INVALID/);
});

test('EXIF-DATE-06: Asset/SHA binding, abort and immutable snapshot gates do not return borrowed metadata', async () => {
  const original = classicTiff();
  await assert.rejects(readExifCaptureDateEvidence(original,
    {assetID: randomUUID(), originalSHA256: 'f'.repeat(64)}),
  /EXIF_CAPTURE_ORIGINAL_SHA_MISMATCH/);
  await assert.rejects(readExifCaptureDateEvidence(original,
    {assetID: 'not-uuid', originalSHA256: hash(original)}),
  /EXIF_CAPTURE_INPUT_INVALID/);
  await assert.rejects(readExifCaptureDateEvidence(original, bound(original),
    {timezone: 'UTC'}), /EXIF_CAPTURE_INPUT_INVALID/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readExifCaptureDateEvidence(original, bound(original),
    {signal: controller.signal}), {name: 'AbortError'});
  const before = clone(original);
  const result = await readExifCaptureDateEvidence(original, bound(original));
  assert.deepEqual(original, before);
  assert.equal(result.sourceSHA256, hash(original));
});
