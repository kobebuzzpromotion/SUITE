import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {applyBatchGrainSync, mergeSavedGrain} from '../src/batch-grain-sync.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const THIRD = '33333333-3333-4333-8333-333333333333';
const GRAIN = {amount: 48, seed: 0x12345678, shadows: 75, midtones: 85,
  highlights: 65, size: 35, roughness: 25, colorVariation: 45};
const selected = (id, revision = 1) => ({id, sha256: SHA, revision});

function withGrain(body, grain) {
  const result = clone(body);
  const extra = result.parameters.extendedParameters;
  extra.postDecodeAdjustments ??= {schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1'};
  extra.postDecodeAdjustments.detail ??= {};
  extra.postDecodeAdjustments.detail.grain = clone(grain);
  if (!result.parameters.processingOrder.includes('postDecodeAdjustments'))
    result.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(result);
  return result;
}

function mockAPI(sourceBody, targetBodies, options = {}) {
  const assets = [ASSET_A, ...targetBodies.keys()].map(id => ({id, sha256: SHA, deletedAt: null}));
  const stored = new Map([[ASSET_A, {assetId: ASSET_A, revision: 1, body: clone(sourceBody)}],
    ...[...targetBodies].map(([id, body]) => [id, {assetId: id, revision: 1, body: clone(body)}])]);
  const calls = [];
  const api = {
    async listAssets() {return clone(assets);},
    async getRecipe(id) {return clone(stored.get(id));},
    async assertPermission(id, action) {
      calls.push(['permission', id, action]);
      return options.permission?.(id, action) ?? {authorized: true};
    },
    async saveRecipe(id, revision, body) {
      calls.push(['save', id, revision]);
      if (options.onSave) return options.onSave({id, revision, body, stored});
      const row = {assetId: id, revision: revision + 1, body: clone(body)};
      stored.set(id, row);
      return clone(row);
    },
  };
  return {api, assets, stored, calls};
}

test('GRAIN-SYNC-01 / only seven Grain controls and deterministic seed merge; target detail, color, portrait and BW binding remain', () => {
  const source = withGrain(recipe(), GRAIN);
  source.parameters.exposure = 1.25;
  const target = withGrain(recipe(portrait(ASSET_B)), {amount: 12, seed: 9});
  target.parameters.exposure = -0.5;
  target.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness = 24;
  target.parameters.extendedParameters.postDecodeAdjustments.detail.denoise = 18;
  target.parameters.extendedParameters.postDecodeAdjustments.color = {temperature: 25};
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  target.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_B, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [clone(stroke)], correctionStrokes: [clone(stroke)]};
  validateRecipe(target);
  const sourceBefore = clone(source), targetBefore = clone(target);
  const merged = mergeSavedGrain(source, target);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.detail.grain, GRAIN);
  assert.equal(merged.parameters.exposure, -0.5);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness, 24);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.detail.denoise, 18);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color, {temperature: 25});
  assert.deepEqual(merged.parameters.extendedParameters.portrait,
    targetBefore.parameters.extendedParameters.portrait);
  assert.deepEqual(merged.parameters.extendedParameters.bwEdgeManual,
    targetBefore.parameters.extendedParameters.bwEdgeManual);
  assert.deepEqual(source, sourceBefore);assert.deepEqual(target, targetBefore);
  validateRecipe(merged);
});

test('GRAIN-SYNC-02 / source without Grain clears only Grain and removes only an empty processing stage', () => {
  const source = recipe();
  assert.deepEqual(mergeSavedGrain(source, withGrain(recipe(), GRAIN)), recipe());
  const target = withGrain(recipe(), GRAIN);
  target.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness = 31;
  validateRecipe(target);
  const merged = mergeSavedGrain(source, target);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.detail.grain, undefined);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness, 31);
  assert.ok(merged.parameters.processingOrder.includes('postDecodeAdjustments'));
  const invalid = withGrain(recipe(), GRAIN);
  invalid.parameters.extendedParameters.postDecodeAdjustments.detail.grain.amount = 101;
  assert.throws(() => mergeSavedGrain(invalid, target));
});

test('GRAIN-SYNC-03 / two explicitly selected saved targets use edit permissions, CAS, post-save read and fresh source', async () => {
  const source = withGrain(recipe(), GRAIN);
  const first = withGrain(recipe(portrait(ASSET_B)), {amount: 12, seed: 9});
  first.parameters.exposure = -0.5;
  const second = recipe();second.parameters.exposure = 0.6;
  const f = mockAPI(source, new Map([[ASSET_B, first], [THIRD, second]]));
  const preflights = [];
  const result = await applyBatchGrainSync({api: f.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)], expectedSourceRecipe: clone(source),
    preflightTarget: async target => preflights.push(target.id)});
  assert.equal(result.status, 'complete');assert.equal(result.saved, 2);
  assert.deepEqual(preflights, [ASSET_B, ASSET_B, THIRD, THIRD]);
  for (const [id, previous] of [[ASSET_B, first], [THIRD, second]]) {
    const saved = f.stored.get(id);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.detail.grain, GRAIN);
    assert.equal(saved.body.parameters.exposure, previous.parameters.exposure);
    assert.deepEqual(saved.body.parameters.extendedParameters.portrait,
      previous.parameters.extendedParameters.portrait);
  }
  assert.deepEqual(f.stored.get(ASSET_A).body, source);
  assert.equal(f.calls.filter(call => call[0] === 'save').length, 2);
  assert.ok(f.calls.filter(call => call[0] === 'permission' && call[2] === 'edit').length >= 6);
});

test('GRAIN-SYNC-04 / conflict, dirty draft, permission loss and ambiguous write never report complete', async () => {
  const source = withGrain(recipe(), GRAIN);
  const f = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]), {
    onSave: ({id, revision, body, stored}) => {
      if (id === ASSET_B) return {outcome: 'conflict', version: {version: revision + 1}};
      stored.set(id, {assetId: id, revision: revision + 1, body: clone(body)});
      throw Error('NETWORK_AFTER_COMMIT');
    },
  });
  const result = await applyBatchGrainSync({api: f.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)]});
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.results.map(row => row.status), ['conflict', 'unverified']);
  const denied = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]), {
    permission: id => ({authorized: id !== ASSET_B}),
  });
  const blocked = await applyBatchGrainSync({api: denied.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)],
    preflightTarget: async target => {if (target.id === THIRD) throw Error('TARGET_DIRTY_DRAFT');}});
  assert.deepEqual(blocked.results.map(row => row.status), ['failed', 'failed']);
  assert.equal(denied.calls.some(call => call[0] === 'save'), false);
  await assert.rejects(applyBatchGrainSync({api: denied.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)], expectedSourceRecipe: recipe()}),
  /GRAIN_SYNC_SOURCE_RECIPE_CHANGED/);
});

test('GRAIN-SYNC-05 / source or target SHA, duplicate selection and foreign photo-bound mask reject', async () => {
  const source = withGrain(recipe(), GRAIN);
  const f = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]));
  const input = {api: f.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)]};
  await assert.rejects(applyBatchGrainSync({...input, targets: [selected(ASSET_B)]}),
    /GRAIN_SYNC_TWO_TARGETS_REQUIRED/);
  await assert.rejects(applyBatchGrainSync({...input,
    targets: [selected(ASSET_B), selected(ASSET_B)]}), /GRAIN_SYNC_SELECTION_INVALID/);
  f.assets[0].sha256 = 'f'.repeat(64);
  await assert.rejects(applyBatchGrainSync(input), /GRAIN_SYNC_ORIGINAL_CHANGED/);
  f.assets[0].sha256 = SHA;f.assets[1].sha256 = 'f'.repeat(64);
  const partial = await applyBatchGrainSync(input);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(f.calls.filter(call => call[0] === 'save').length, 1);
  const wrong = recipe();
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  wrong.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_A, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [clone(stroke)], correctionStrokes: [clone(stroke)]};
  validateRecipe(wrong);
  const bound = mockAPI(source, new Map([[ASSET_B, wrong], [THIRD, recipe()]]));
  const guarded = await applyBatchGrainSync({api: bound.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)]});
  assert.deepEqual(guarded.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(bound.calls.some(call => call[0] === 'save' && call[1] === ASSET_B), false);
});
