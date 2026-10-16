import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {createPresetFacade} from '../src/preset-facade.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SHA = 'a'.repeat(64);
const add = () => ({operation: 'ADD', path: [{u: .5, v: .5}],
  radiusFraction: .12, hardness: 1});
function recipe(assetID = null) {
  const extendedParameters = {};
  if (assetID) extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [add()], correctionStrokes: [add()]};
  return {schemaVersion: 1, parameters: {exposure: .25, contrast: 1,
    saturation: 1, rotationDegrees: 0, extendedParameters,
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
}
const selected = (id, revision) => ({id, sha256: SHA, revision});

function adapter({source = recipe(), target = recipe(), second = recipe()} = {}) {
  const stored = new Map([[A, {revision: 2, body: structuredClone(source)}],
    [B, {revision: 1, body: structuredClone(target)}],
    [C, {revision: 1, body: structuredClone(second)}]]);
  const calls = [];
  const api = {
    async listAssets() {return [A, B, C].map(id => ({id, sha256: SHA}));},
    async assertPermission(id, action) {calls.push(`permission:${id}:${action}`);
      return {authorized: true};},
    async getRecipe(id) {calls.push(`get:${id}`);return structuredClone(stored.get(id));},
    async saveRecipe(id, expectedRevision, body) {
      calls.push(`save:${id}`);
      assert.equal(stored.get(id).revision, expectedRevision);
      const next = {revision: expectedRevision + 1, body: structuredClone(body)};
      stored.set(id, next);return structuredClone(next);
    },
    async getOriginal() {throw Error('RAW_READ_FORBIDDEN');},
    async putOriginal() {throw Error('RAW_WRITE_FORBIDDEN');},
  };
  return {api, stored, calls};
}

test('BW-BATCH-01: a source-bound manual mask blocks the entire full-Recipe copy', async () => {
  const f = adapter({source: recipe(A)}), before = structuredClone([...f.stored]);
  await assert.rejects(applyBatchRecipe({api: f.api, source: selected(A, 2),
    targets: [selected(B, 1), selected(C, 1)]}), /BATCH_BW_EDGE_PHOTO_BOUND_RECIPE/);
  assert.equal(f.calls.some(item => item.startsWith('save:')), false);
  assert.deepEqual([...f.stored], before);
});

test('BW-BATCH-02: a target-owned mask cannot be overwritten or erased; other target stays independent', async () => {
  const f = adapter({target: recipe(B)}), before = structuredClone(f.stored.get(B));
  const result = await applyBatchRecipe({api: f.api, source: selected(A, 2),
    targets: [selected(B, 1), selected(C, 1)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(item => item.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'BATCH_BW_EDGE_PHOTO_BOUND_RECIPE');
  assert.equal(f.calls.includes(`save:${B}`), false);
  assert.deepEqual(f.stored.get(B), before);
  assert.equal(f.stored.get(C).revision, 2);
  assert.equal(f.calls.some(item => item.includes('Original')), false);
});

test('BW-BATCH-03: Author Portable Preset refuses bound mask before any draft call', async () => {
  const bound = recipe(A);
  assert.throws(() => portablePresetRecipe(bound), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  let drafted = 0;
  const facade = createPresetFacade({author: {async createDraft() {drafted++;}},
    principal: {id: 'owner', authorName: 'Owner'},
    session: {state: {asset: {id: A}, revision: 2, dirty: false,
      busy: false, exporting: false}}});
  await assert.rejects(facade.save({kind: 'AUTHOR_DRAFT', name: 'unsafe',
    recipe: bound, source: {assetID: A, recipeRevision: 2}}),
  /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  assert.equal(drafted, 0);
});
