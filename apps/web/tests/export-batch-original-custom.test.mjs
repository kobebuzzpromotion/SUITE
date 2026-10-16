import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportQueue} from '../src/export-queue.mjs';
import {planBatchDownloadManifest} from '../src/export-batch-manifest.mjs';
import {buildExportFilename} from '../src/export-naming.mjs';

const encoder = new TextEncoder();
const asset = (id, name) => ({id, name, sha256: id.repeat(64), size: 10});
const orderedAssets = [asset('a', 'Portrait.CR3'), asset('b', 'Portrait.CR3')];
const plan = (ids = ['b', 'a'], assets = orderedAssets) =>
  planExportQueue({orderedIds: ids, assets});
const items = (ids = ['b', 'a'], format = 'jpeg') => ids.map(assetId => ({assetId,
  blob: new Blob([assetId], {type: format === 'jpeg' ? 'image/jpeg' : 'image/png'})}));

test('BATCH-ORIGINAL-CUSTOM01: explicit queue order and one person-supplied text reuse the single-photo planner', () => {
  const selected = plan();
  const output = planBatchDownloadManifest({plan: selected, items: items(),
    format: 'jpeg', method: 'original-custom', customName: '仕上げ',
    existingNames: ['portrait_仕上げ.jpg']});
  assert.deepEqual(output.files.map(file => file.assetId), ['b', 'a']);
  assert.deepEqual(output.files.map(file => file.name),
    ['Portrait_仕上げ_01.jpg', 'Portrait_仕上げ_02.jpg']);
  assert.equal(output.files[0].name, buildExportFilename({
    originalFilename: 'Portrait.CR3', format: 'jpeg', method: 'original-custom',
    customText: '仕上げ', existingNames: ['portrait_仕上げ.jpg']}));
  assert.equal(output.status, 'download-manifest-only');
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.files));
});

test('BATCH-ORIGINAL-CUSTOM02: unsafe separators, reserved stems and Unicode-long text stay within a safe 255-byte basename', () => {
  const selected = plan(['a', 'b'], [asset('a', 'CON.CR3'), asset('b', 'NUL.CR3')]);
  const output = planBatchDownloadManifest({plan: selected, items: items(['a', 'b'], 'png'),
    format: 'png', method: 'original-custom', customText: 'proof/\\:*?<>|'});
  assert.deepEqual(output.files.map(file => file.name),
    ['_CON_proof_.png', '_NUL_proof_.png']);
  for (const file of output.files) {
    assert.ok(encoder.encode(file.name).byteLength <= 255);
    assert.doesNotMatch(file.name, /[\\/:*?<>|\u0000-\u001f]/);
  }
  const long = planBatchDownloadManifest({plan: plan(), items: items(),
    format: 'jpeg', method: 'original-custom', customText: '仕'.repeat(200)});
  assert.ok(long.files.every(file => encoder.encode(file.name).byteLength <= 255));
  assert.notEqual(long.files[0].name.toLocaleLowerCase('en-US'),
    long.files[1].name.toLocaleLowerCase('en-US'));
});

test('BATCH-ORIGINAL-CUSTOM03: missing or invalid custom text and partial or wrong-MIME Blob refuse the entire manifest', () => {
  const selected = plan(), complete = items();
  for (const customText of [undefined, '', ' /\\ ', 'x'.repeat(4097)]) {
    assert.throws(() => planBatchDownloadManifest({plan: selected, items: complete,
      format: 'jpeg', method: 'original-custom', customText}),
    /EXPORT_CUSTOM_TEXT_REQUIRED|EXPORT_NAME_TOO_LONG/);
  }
  assert.throws(() => planBatchDownloadManifest({plan: selected, items: complete,
    format: 'jpeg', method: 'original-custom', customName: 'Final',
    customText: 'Different'}), /EXPORT_BATCH_CUSTOM_TEXT_CONFLICT/);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: complete.slice(0, 1), format: 'jpeg', method: 'original-custom',
    customText: 'Final'}), /EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: [complete[0], {assetId: 'a', blob: new Blob(['x'], {type: 'image/png'})}],
    format: 'jpeg', method: 'original-custom', customText: 'Final'}),
  /EXPORT_BATCH_RESULT_INVALID/);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: complete.toReversed(), format: 'jpeg', method: 'original-custom',
    customText: 'Final'}), /EXPORT_BATCH_RESULT_INVALID/);
});

test('BATCH-ORIGINAL-CUSTOM04: exactly 2–20 selected Blobs are accepted; 1 and 21 are not batch manifests', () => {
  const manyAssets = Array.from({length: 21}, (_, index) => ({id: `photo-${index}`,
    name: 'Same.CR3', sha256: 'a'.repeat(64), size: 10}));
  const twenty = manyAssets.slice(0, 20).map(row => row.id);
  const accepted = planBatchDownloadManifest({plan: plan(twenty, manyAssets),
    items: items(twenty), format: 'jpeg', method: 'original-custom',
    customText: 'Final'});
  assert.equal(accepted.files.length, 20);
  assert.equal(new Set(accepted.files.map(file => file.name.toLowerCase())).size, 20);
  assert.deepEqual(accepted.files.map(file => file.sequence),
    Array.from({length: 20}, (_, index) => index + 1));
  assert.throws(() => planBatchDownloadManifest({plan: plan([twenty[0]], manyAssets),
    items: items([twenty[0]]), format: 'jpeg', method: 'original-custom',
    customText: 'Final'}), /EXPORT_BATCH_RESULT_INCOMPLETE/);
  const twentyOne = manyAssets.map(row => row.id);
  assert.throws(() => planBatchDownloadManifest({plan: plan(twentyOne, manyAssets),
    items: items(twentyOne), format: 'jpeg', method: 'original-custom',
    customText: 'Final'}), /EXPORT_BATCH_RESULT_INCOMPLETE/);
});

test('BATCH-ORIGINAL-CUSTOM05: existing original/count/sequence filenames do not change', () => {
  const selected = plan(), blobs = items();
  assert.deepEqual(planBatchDownloadManifest({plan: selected, items: blobs,
    format: 'jpeg', method: 'original'}).files.map(file => file.name),
  ['Portrait.jpg', 'Portrait_01.jpg']);
  assert.deepEqual(planBatchDownloadManifest({plan: selected, items: blobs,
    format: 'jpeg', method: 'custom-count', customName: 'Set'}).files.map(file => file.name),
  ['Set (1 of 2).jpg', 'Set (2 of 2).jpg']);
  assert.deepEqual(planBatchDownloadManifest({plan: selected, items: blobs,
    format: 'jpeg', method: 'custom-sequence', customName: 'Set'}).files.map(file => file.name),
  ['Set_001.jpg', 'Set_002.jpg']);
});
