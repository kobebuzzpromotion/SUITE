import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {EditorSession, neutralRecipe} from '../src/session.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SHA = 'a'.repeat(64);
const BACKDROP_SHA = 'b'.repeat(64);
const asset = id => ({id, name: `${id}.nonraw`, sha256: SHA, size: 64,
  cloudSafe: true, deletedAt: null});
function recipe(id) {
  const body = neutralRecipe();
  if (id) body.parameters.extendedParameters.addShadowManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
    binding: {assetID: id, originalSHA256: SHA, sourceWidth: 16,
      sourceHeight: 16, backdropID: C, backdropSHA256: BACKDROP_SHA},
    subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}],
      radiusFraction: .1, hardness: 1}],
    settings: {mode: 'soft', opacity: 70, blur: 12, gradient: 20,
      blend: 'multiply', offsetX: 10, offsetY: -5,
      shadowColor: [10, 20, 30]},
  };
  return body;
}
const selected = (id, revision) => ({id, sha256: SHA, revision});
function adapter({source = recipe(), target = recipe()} = {}) {
  const stored = new Map([[A, {revision: 2, body: structuredClone(source)}],
    [B, {revision: 1, body: structuredClone(target)}]]);
  const writes = [];
  const api = {
    async listAssets() {return [asset(A), asset(B)];},
    async assertPermission() {return {authorized: true};},
    async getRecipe(id) {return structuredClone(stored.get(id));},
    async saveRecipe(id, revision, body) {
      writes.push(id);
      assert.equal(stored.get(id).revision, revision);
      const result = {revision: revision + 1, body: structuredClone(body)};
      stored.set(id, result);
      return result;
    },
  };
  return {api, stored, writes};
}

test('SHADOW-BATCH-01: photo-bound source never copies to another Asset', async () => {
  const fixture = adapter({source: recipe(A)});
  const before = structuredClone([...fixture.stored]);
  await assert.rejects(applyBatchRecipe({api: fixture.api,
    source: selected(A, 2), targets: [selected(B, 1)]}),
  /BATCH_ADD_SHADOW_PHOTO_BOUND_RECIPE/);
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual([...fixture.stored], before);
});

test('SHADOW-BATCH-02: target-owned document is not erased by full-Recipe copy', async () => {
  const fixture = adapter({target: recipe(B)});
  const before = structuredClone(fixture.stored.get(B));
  const result = await applyBatchRecipe({api: fixture.api,
    source: selected(A, 2), targets: [selected(B, 1)]});
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].reason, 'BATCH_ADD_SHADOW_PHOTO_BOUND_RECIPE');
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.stored.get(B), before);
});

test('SHADOW-BATCH-03: Batch Final refuses manual shadow before Original or Blob generation', async () => {
  let originalReads = 0, encodes = 0;
  const session = new EditorSession({api: {
    async getRecipe() {return {revision: 1, body: recipe()};},
    async getOriginal() {originalReads++; throw Error('ORIGINAL_MUST_NOT_BE_READ');},
  }, processing: {async encode() {encodes++; throw Error('BLOB_MUST_NOT_BE_MADE');}},
  storage: {async get() {return undefined;}}});
  session.proxy = {width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4)};
  session.data.asset = asset(A);
  session.data.assets = [asset(A), asset(B)];
  session.data.recipe = recipe(A);
  session.data.revision = 1;
  await assert.rejects(session.exportBatchFinal({orderedIds: [A, B], format: 'png'}),
    /EXPORT_BATCH_ADD_SHADOW_REVIEW_REQUIRED/);
  assert.equal(originalReads, 0);
  assert.equal(encodes, 0);
  assert.equal(session.state.exporting, false);
});

test('SHADOW-BATCH-04: non-Trial Editor cannot silently ignore a saved shadow', () => {
  const session = new EditorSession();
  assert.throws(() => session.bind(recipe(A), asset(A)),
    /ADD_SHADOW_AUTHENTICATED_TRIAL_REQUIRED/);
  assert.doesNotThrow(() => session.bind(recipe(), asset(A)));
});
