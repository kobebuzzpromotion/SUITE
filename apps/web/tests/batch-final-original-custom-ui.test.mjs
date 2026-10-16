import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBatchFinalNames} from '../src/editor-ui.mjs';

const assets = [
  {id: 'a', name: 'Portrait.CR3'},
  {id: 'b', name: 'Portrait.CR3'},
];
const base = {assets, orderedIds: ['b', 'a'], format: 'jpeg'};

test('BATCH-NAME-UI01: current Batch customName maps to single-photo customText only for Original–Custom', () => {
  const result = validateBatchFinalNames({...base, method: 'original-custom',
    customName: '仕上げ', existingNames: ['portrait_仕上げ.jpg']});
  assert.deepEqual(result, ['Portrait_仕上げ_01.jpg', 'Portrait_仕上げ_02.jpg']);
  assert.ok(Object.isFrozen(result));
  assert.throws(() => validateBatchFinalNames({...base, method: 'original-custom',
    customName: ''}), /EXPORT_CUSTOM_TEXT_REQUIRED/);
  assert.throws(() => validateBatchFinalNames({...base, method: 'original-custom',
    customName: ' /\\ '}), /EXPORT_CUSTOM_TEXT_REQUIRED/);
});

test('BATCH-NAME-UI02: old three naming modes retain their exact filenames and input roles', () => {
  assert.deepEqual(validateBatchFinalNames({...base, method: 'original'}),
    ['Portrait.jpg', 'Portrait_01.jpg']);
  assert.deepEqual(validateBatchFinalNames({...base, method: 'custom-count',
    customName: 'Set'}), ['Set (1 of 2).jpg', 'Set (2 of 2).jpg']);
  assert.deepEqual(validateBatchFinalNames({...base, method: 'custom-sequence',
    customName: 'Set'}), ['Set_001.jpg', 'Set_002.jpg']);
  assert.throws(() => validateBatchFinalNames({...base, method: 'custom-count',
    customName: ''}), /EXPORT_CUSTOM_NAME_REQUIRED/);
});

test('BATCH-NAME-UI03: invalid selection, later Asset filename and unsafe text reject before any Final call', () => {
  for (const orderedIds of [['a'], ['a', 'a'], ['a', 'missing'],
    Array.from({length: 21}, (_, index) => String(index))]) {
    assert.throws(() => validateBatchFinalNames({...base, orderedIds,
      method: 'original-custom', customName: 'Final'}),
    /EXPORT_BATCH_SELECTION_INVALID/);
  }
  assert.throws(() => validateBatchFinalNames({...base,
    assets: [assets[0], {id: 'b', name: '..'}], method: 'original-custom',
    customName: 'Final'}), /EXPORT_NAME_REQUIRED/);
  assert.throws(() => validateBatchFinalNames({...base, method: 'original-custom',
    customName: 'x'.repeat(4097)}), /EXPORT_NAME_TOO_LONG/);
});

test('BATCH-NAME-UI04: selection option, preflight before processing, and unchanged manifest customName path are wired', () => {
  const source = readFileSync(new URL('../src/editor-ui.mjs', import.meta.url), 'utf8');
  assert.match(source, /<option value="original-custom">元の名前＋指定文字<\/option>/);
  assert.match(source, /if\(method==='original-custom'\)options\.customText=customName/);
  assert.match(source, /const manifest=verifiedBatchFinalManifest\(result,ids,\{format,method,customName,existingNames:completedDownloadNames\}\)/);
  const start = source.slice(source.indexOf('async function startBatchFinal('),
    source.indexOf('function render(next)'));
  assert.ok(start.indexOf('validateBatchFinalNames(') <
    start.indexOf('session.exportBatchFinal('));
  assert.match(start, /catch\(error\)\{batchFinalStatus=`設定を確認してください：/);
});
