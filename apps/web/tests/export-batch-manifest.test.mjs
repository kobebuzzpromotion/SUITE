import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportQueue} from '../src/export-queue.mjs';
import {MAX_BATCH_DOWNLOAD_BYTES, planBatchDownloadManifest} from '../src/export-batch-manifest.mjs';

const assets = [
  {id: 'second', name: 'Portrait.CR3', sha256: 'b'.repeat(64), size: 12},
  {id: 'first', name: 'Portrait.CR3', sha256: 'a'.repeat(64), size: 10},
];
const plan = () => planExportQueue({orderedIds: ['first', 'second'], assets});
const items = () => [
  {assetId: 'first', blob: new Blob(['a'], {type: 'image/jpeg'})},
  {assetId: 'second', blob: new Blob(['b'], {type: 'image/jpeg'})},
];

test('explicit queue order and collisions determine two safe download names', () => {
  const selected = plan(), output = planBatchDownloadManifest({plan: selected,
    items: items(), format: 'jpeg', method: 'custom-count', customName: 'Edit',
    existingNames: ['Edit (1 of 2).jpg']});
  assert.equal(output.status, 'download-manifest-only');
  assert.deepEqual(output.files.map(file => file.name),
    ['Edit (1 of 2)_01.jpg', 'Edit (2 of 2).jpg']);
  assert.deepEqual(output.files.map(file => file.assetId), ['first', 'second']);
  assert.equal(output.totalBytes, 2);
});

test('custom sequence is ordered from explicit selection, never library order', () => {
  const result = planBatchDownloadManifest({plan: plan(), items: items(), format: 'jpeg',
    method: 'custom-sequence', customName: 'Suite'});
  assert.deepEqual(result.files.map(file => file.name),
    ['Suite_001.jpg', 'Suite_002.jpg']);
});

test('TIFF8 batch manifest keeps verified MIME, order and safe tif names', () => {
  const selected = plan(), tiffs = [
    {assetId: 'first', blob: new Blob(['a'], {type: 'image/tiff'})},
    {assetId: 'second', blob: new Blob(['b'], {type: 'image/tiff'})},
  ];
  const result = planBatchDownloadManifest({plan: selected, items: tiffs,
    format: 'tiff', method: 'custom-sequence', customName: 'Suite'});
  assert.deepEqual(result.files.map(file => file.name), ['Suite_001.tif', 'Suite_002.tif']);
  assert.deepEqual(result.files.map(file => file.assetId), ['first', 'second']);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: [tiffs[0], {assetId: 'second', blob: new Blob(['b'], {type: 'image/png'})}],
    format: 'tiff'}), /EXPORT_BATCH_RESULT_INVALID/);
});

test('partial, swapped, forged or wrong MIME results fail closed', () => {
  const selected = plan(), complete = items();
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: complete.slice(0, 1), format: 'jpeg'}), /EXPORT_BATCH_RESULT_INCOMPLETE/);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: complete.toReversed(), format: 'jpeg'}), /EXPORT_BATCH_RESULT_INVALID/);
  assert.throws(() => planBatchDownloadManifest({plan: selected,
    items: [{assetId: 'first', blob: new Blob(['a'], {type: 'image/png'})}, complete[1]],
    format: 'jpeg'}), /EXPORT_BATCH_RESULT_INVALID/);
  assert.throws(() => planBatchDownloadManifest({plan: selected.map(row => ({...row})),
    items: complete, format: 'jpeg'}), /EXPORT_QUEUE_PLAN_REQUIRED/);
});

test('capture date without fresh evidence, unsupported naming and over-limit outputs are rejected without side effects', () => {
  assert.throws(() => planBatchDownloadManifest({plan: plan(), items: items(),
    format: 'jpeg', method: 'capture-date-original'}), /EXPORT_BATCH_CAPTURE_DATE_EVIDENCE_REQUIRED/);
  assert.throws(() => planBatchDownloadManifest({plan: plan(), items: items(),
    format: 'jpeg', method: 'original-effect-preset'}), /EXPORT_BATCH_NAMING_METHOD_UNSUPPORTED/);
  class OversizeTestBlob extends Blob {get size() {return MAX_BATCH_DOWNLOAD_BYTES + 1;}}
  const huge = new OversizeTestBlob(['x'], {type: 'image/png'});
  assert.throws(() => planBatchDownloadManifest({plan: plan(), items: [
    {assetId: 'first', blob: huge}, {assetId: 'second', blob: huge}],
    format: 'png'}), /EXPORT_BATCH_RESULT_TOO_LARGE/);
});
