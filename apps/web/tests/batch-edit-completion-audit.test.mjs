import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {batchEditGate} from '../src/editor-ui.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

// Read-only characterization of the shipped synthetic non-RAW path. This
// intentionally does not present Recipe copy as AI Lab Batch Edit completion.
const third = '33333333-3333-4333-8333-333333333333';
const asset = id => ({id, sha256: SHA});
const selection = (id, revision) => ({id, sha256: SHA, revision});
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('BATCH-AUDIT-01 / SOURCE: EV3-0934 is AI Lab People Removal, not generic Recipe synchronization', async () => {
  const source = JSON.parse(await readFile(resolve(repoRoot, 'docs/EVOTO_AUDIT/evoto-deep-audit.json'), 'utf8'));
  const entries = Array.isArray(source) ? source : Object.values(source).flatMap(value => Array.isArray(value) ? value : []);
  const candidate = entries.find(entry => entry?.id === 'EV3-0934');
  assert.ok(candidate, 'original candidate ID must be traceable in the audit source');
  assert.equal(candidate.category, 'AI Lab');
  assert.equal(candidate.feature, 'Batch Edit');
  assert.equal(candidate.option, 'People Removal');
  assert.equal(candidate.batch, 'DOCUMENTED_FOR_THESE_THREE_ONLY');
});

test('BATCH-AUDIT-02 / PRODUCT: actual UI gate accepts one target and has no 20-item full-Recipe cap', () => {
  const ids = Array.from({length: 21}, (_, index) => `${index + 1}`);
  const state = {asset: {id: ASSET_A}, assets: [{id: ASSET_A}, ...ids.map(id => ({id}))],
    revision: 1, dirty: false, busy: null, exporting: false};
  const session = {batchAvailable: true, batchApplyCurrentRecipe() {}};
  assert.equal(batchEditGate(session, state, [ids[0]]), null);
  assert.equal(batchEditGate(session, state, ids), null);
  assert.equal(batchEditGate(session, {...state, dirty: true}, ids), 'BATCH_SAVED_SOURCE_REQUIRED');
  assert.equal(batchEditGate(session, state, ids, {blocked: true}), 'BATCH_ACCESS_EXPIRED');
});

test('BATCH-AUDIT-03 / SYNTHETIC: generic batch refuses target Portrait, saves another target, and never generates AI results', async () => {
  const sourceRecipe = recipe();
  sourceRecipe.parameters.exposure = 0.5;
  const targetRecipe = recipe(portrait(ASSET_B));
  const beforeTarget = structuredClone(targetRecipe);
  const stored = new Map([[ASSET_A, {assetId: ASSET_A, revision: 1, body: sourceRecipe}],
    [ASSET_B, {assetId: ASSET_B, revision: 1, body: targetRecipe}]]);
  const calls = [];
  const api = {
    async listAssets() {return [asset(ASSET_A), asset(ASSET_B), asset(third)];},
    async getRecipe(id) {calls.push(`recipe:${id}`);return structuredClone(stored.get(id) ?? null);},
    async assertPermission(id, action) {
      calls.push(`permission:${id}:${action}`);return {authorized: true};
    },
    async saveRecipe(id, expected, body) {
      calls.push(`save:${id}`);
      const old = stored.get(id)?.revision ?? 0;
      if (old !== expected) throw Error('REVISION_CONFLICT');
      const next = {assetId: id, revision: expected + 1, body: structuredClone(body)};
      stored.set(id, next);return structuredClone(next);
    },
    async getOriginal() {throw Error('ORIGINAL_READ_NOT_EXPECTED');},
    async generate() {throw Error('AI_GENERATION_NOT_EXPECTED');},
  };
  const result = await applyBatchRecipe({api, source: selection(ASSET_A, 1),
    targets: [selection(ASSET_B, 1), selection(third, 0)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'BATCH_PORTRAIT_PHOTO_BOUND_RECIPE');
  assert.deepEqual(stored.get(ASSET_B).body, beforeTarget);
  assert.equal(stored.get(ASSET_B).revision, 1);
  assert.deepEqual(stored.get(third).body, sourceRecipe);
  assert.equal(calls.includes(`save:${ASSET_B}`), false);
  assert.equal(calls.some(call => call.includes('Original') || call.includes('generate')), false);
  assert.deepEqual(stored.get(ASSET_A).body, sourceRecipe);
});
