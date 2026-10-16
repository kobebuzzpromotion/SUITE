import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatchLevelsSync, mergeSavedLevels} from '../src/batch-levels-sync.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

const THIRD = '33333333-3333-4333-8333-333333333333';
const clone = value => structuredClone(value);
const identity = (id, revision = 1, sha256 = SHA) => ({id, revision, sha256});
function withLevels(base = recipe(), levels = {master: {gamma: 0.5, outputBlack: 20}, red: {inputWhite: 210}}) {
  const next = clone(base), parameters = next.parameters;
  parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {levels: clone(levels)}, detail: {clarity: 18},
  };
  parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  return next;
}
function adapter({denied = [], ambiguous = []} = {}) {
  const assets = [ASSET_A, ASSET_B, THIRD].map(id => ({id, sha256: SHA}));
  const stored = new Map([[ASSET_A, {revision: 1, body: withLevels()}],
    [ASSET_B, {revision: 1, body: withLevels(recipe(portrait(ASSET_B)), {blue: {outputWhite: 170}})}],
    [THIRD, {revision: 1, body: recipe()}]]);
  const calls = [];
  const api = {
    async listAssets() {calls.push('list'); return clone(assets);},
    async assertPermission(id, action) {calls.push(`permission:${id}:${action}`);
      if (denied.includes(id)) throw Error('DENIED'); return {authorized: true};},
    async getRecipe(id) {calls.push(`get:${id}`); return clone(stored.get(id) ?? null);},
    async saveRecipe(id, revision, body) {
      calls.push(`save:${id}`);
      const current = stored.get(id);
      if (!current || current.revision !== revision) throw Error('CAS_CONFLICT');
      const saved = {revision: revision + 1, body: clone(body)};
      stored.set(id, saved);
      if (ambiguous.includes(id)) throw Error('NETWORK_AFTER_COMMIT');
      return clone(saved);
    },
    async getOriginal() {throw Error('ORIGINAL_READ_FORBIDDEN');},
    async putOriginal() {throw Error('ORIGINAL_WRITE_FORBIDDEN');},
  };
  return {api, assets, stored, calls};
}

test('LEVELS-SYNC01: only saved Levels crosses; target person, other adjustments, geometry, source and Original stay separate', () => {
  const source = withLevels(), target = withLevels(recipe(portrait(ASSET_B)), {blue: {outputWhite: 170}});
  target.parameters.exposure = -1;
  target.parameters.extendedParameters.postDecodeAdjustments.color.temperature = 25;
  const frozenSource = clone(source), frozenTarget = clone(target);
  const merged = mergeSavedLevels(source, target);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.levels,
    source.parameters.extendedParameters.postDecodeAdjustments.color.levels);
  const expected = clone(target);
  expected.parameters.extendedParameters.postDecodeAdjustments.color.levels = clone(
    source.parameters.extendedParameters.postDecodeAdjustments.color.levels);
  assert.deepEqual(merged, expected);
  assert.deepEqual(source, frozenSource);
  assert.deepEqual(target, frozenTarget);
});

test('LEVELS-SYNC02: neutral saved source clears only target Levels and required empty stage', () => {
  const target = withLevels();
  const merged = mergeSavedLevels(recipe(), target);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color, undefined);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.detail, {clarity: 18});
  const only = withLevels();
  delete only.parameters.extendedParameters.postDecodeAdjustments.detail;
  const cleared = mergeSavedLevels(recipe(), only);
  assert.equal(cleared.parameters.extendedParameters.postDecodeAdjustments, undefined);
  assert.equal(cleared.parameters.processingOrder.includes('postDecodeAdjustments'), false);
});

test('LEVELS-SYNC03: two selected targets CAS-save separately without Original APIs or source history changes', async () => {
  const {api, stored, calls} = adapter();
  const before = clone(stored.get(ASSET_A));
  const result = await applyBatchLevelsSync({api, source: identity(ASSET_A),
    targets: [identity(ASSET_B), identity(THIRD)]});
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.results.map(row => row.status), ['saved', 'saved']);
  assert.deepEqual(stored.get(ASSET_A), before);
  assert.deepEqual(stored.get(ASSET_B).body.parameters.extendedParameters.portrait,
    portrait(ASSET_B));
  assert.deepEqual(stored.get(ASSET_B).body.parameters.extendedParameters.postDecodeAdjustments.color.levels,
    before.body.parameters.extendedParameters.postDecodeAdjustments.color.levels);
  assert.equal(stored.get(THIRD).body.parameters.extendedParameters.postDecodeAdjustments.detail, undefined);
  assert.equal(calls.some(call => call.includes('Original')), false);
});

test('LEVELS-SYNC04: target permission and CAS conflicts are partial, not all-saved; ambiguous commit is unverified', async () => {
  const denied = adapter({denied: [ASSET_B]});
  const partial = await applyBatchLevelsSync({api: denied.api, source: identity(ASSET_A),
    targets: [identity(ASSET_B), identity(THIRD)]});
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(denied.calls.includes(`save:${ASSET_B}`), false);
  const ambiguous = adapter({ambiguous: [ASSET_B]});
  const result = await applyBatchLevelsSync({api: ambiguous.api, source: identity(ASSET_A),
    targets: [identity(ASSET_B), identity(THIRD)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(row => row.status), ['unverified', 'saved']);
  assert.equal(result.results[0].reason, 'NETWORK_AFTER_COMMIT');
});

test('LEVELS-SYNC05: stale source and invalid selection are rejected before a write; target mismatch fails per row', async () => {
  const {api, stored, calls} = adapter();
  await assert.rejects(applyBatchLevelsSync({api, source: identity(ASSET_A, 2),
    targets: [identity(ASSET_B), identity(THIRD)]}), /LEVELS_SYNC_REVISION_CONFLICT/);
  await assert.rejects(applyBatchLevelsSync({api, source: identity(ASSET_A),
    expectedSourceRecipe: recipe(), targets: [identity(ASSET_B), identity(THIRD)]}),
  /LEVELS_SYNC_SOURCE_RECIPE_CHANGED/);
  await assert.rejects(applyBatchLevelsSync({api, source: identity(ASSET_A),
    targets: [identity(ASSET_B)]}), /LEVELS_SYNC_TWO_TARGETS_REQUIRED/);
  assert.equal(calls.some(call => call.startsWith('save:')), false);
  stored.get(ASSET_B).revision = 2;
  const result = await applyBatchLevelsSync({api, source: identity(ASSET_A),
    targets: [identity(ASSET_B), identity(THIRD)]});
  assert.deepEqual(result.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'LEVELS_SYNC_REVISION_CONFLICT');
});
