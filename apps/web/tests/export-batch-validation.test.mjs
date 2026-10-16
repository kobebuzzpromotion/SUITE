import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportQueue} from '../src/export-queue.mjs';
import {preflightExportBatch} from '../src/export-batch-validation.mjs';
import {recipe} from './fixtures.mjs';

const copy = value => structuredClone(value);
const asset = (id, name, size = 12) => ({id, name, size, sha256: id.repeat(64),
  deletedAt: null, cloudSafe: true});
function setup() {
  const inventory = [asset('a', 'A.RAW'), asset('b', 'B.RAW'), asset('c', 'C.RAW')];
  const plan = planExportQueue({orderedIds: ['c', 'a'], assets: inventory});
  const localStates = [inventory[0], inventory[2]].map(item => ({asset: copy(item),
    revision: 2, recipe: recipe(), dirty: false}));
  const calls = [];
  const api = {
    async listAssets() {calls.push('list'); return copy(inventory);},
    async getRecipe(id) {calls.push(`recipe:${id}`); return {assetId: id,
      revision: 2, body: recipe()};},
    async assertPermission(id, action) {calls.push(`permission:${id}:${action}`);
      return {authorized: true};},
    async getOriginal() {throw Error('ORIGINAL_READ_FORBIDDEN');},
    async saveRecipe() {throw Error('RECIPE_WRITE_FORBIDDEN');},
  };
  return {inventory, plan, localStates, calls, api};
}

test('EXPORT-BATCH-PREFLIGHT01: explicit queue is checked against fresh assets, saved Recipes and export permission', async () => {
  const fixture = setup();
  const before = copy(fixture.localStates);
  const result = await preflightExportBatch(fixture);
  assert.deepEqual(result, {status: 'preflight-only', items: [
    {assetId: 'c', name: 'C.RAW', sha256: 'c'.repeat(64), size: 12,
      revision: 2, sequence: 1, total: 2},
    {assetId: 'a', name: 'A.RAW', sha256: 'a'.repeat(64), size: 12,
      revision: 2, sequence: 2, total: 2},
  ]});
  assert.deepEqual(fixture.calls, ['list', 'recipe:c', 'permission:c:export',
    'recipe:a', 'permission:a:export']);
  assert.deepEqual(fixture.localStates, before);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(fixture.calls.some(call => /Original|save/i.test(call)), false);
});

test('EXPORT-BATCH-PREFLIGHT02: reconstructed plan, missing or duplicate local state and dirty draft fail before API', async () => {
  for (const alter of [
    f => {f.plan = [...f.plan];},
    f => {f.localStates = f.localStates.slice(0, 1);},
    f => {f.localStates[1] = copy(f.localStates[0]);},
    f => {f.localStates[0].dirty = true;},
    f => {f.localStates[0].revision = 0;},
    f => {f.localStates[0].recipe = null;},
    f => {f.localStates[0].asset.name = 'renamed.RAW';},
    f => {f.localStates[0].asset.sha256 = 'f'.repeat(64);},
    f => {f.localStates[0].asset.size = 99;},
  ]) {
    const fixture = setup(); alter(fixture);
    await assert.rejects(preflightExportBatch(fixture));
    assert.deepEqual(fixture.calls, []);
  }
  const fixture = setup();
  await assert.rejects(preflightExportBatch({...fixture, api: {}}),
    /EXPORT_BATCH_ADAPTER_NOT_CONNECTED/);
});

test('EXPORT-BATCH-PREFLIGHT03: stale, deleted, absent or duplicated current Asset rejects whole plan', async () => {
  for (const alter of [
    f => {f.inventory[2].name = 'new-name.RAW';},
    f => {f.inventory[2].sha256 = 'f'.repeat(64);},
    f => {f.inventory[2].size = 13;},
    f => {f.inventory[2].deletedAt = '2026-10-04';},
    f => {f.inventory.splice(2, 1);},
    f => {f.inventory.push(copy(f.inventory[2]));},
  ]) {
    const fixture = setup(); alter(fixture);
    await assert.rejects(preflightExportBatch(fixture), /EXPORT_BATCH_ASSET_LIST_MISMATCH/);
    assert.deepEqual(fixture.calls, ['list']);
  }
});

test('EXPORT-BATCH-PREFLIGHT04: missing, stale, invalid or changed saved Recipe fails closed', async () => {
  for (const response of [
    null, {assetId: 'c', revision: 1, body: recipe()},
    {assetId: 'other', revision: 2, body: recipe()},
    {assetId: 'c', revision: 2, body: {...recipe(), schemaVersion: 999}},
    {assetId: 'c', revision: 2, body: {...recipe(), parameters: {...recipe().parameters, exposure: 1}}},
    {assetId: 'c', revision: 2, body: recipe(), branch: true},
  ]) {
    const fixture = setup();
    fixture.api.getRecipe = async id => {fixture.calls.push(`recipe:${id}`); return response;};
    await assert.rejects(preflightExportBatch(fixture));
    assert.deepEqual(fixture.calls, ['list', 'recipe:c']);
  }
});

test('EXPORT-BATCH-PREFLIGHT05: denial on any selected Asset yields no ready/partial result', async () => {
  const fixture = setup();
  fixture.api.assertPermission = async (id, action) => {
    fixture.calls.push(`permission:${id}:${action}`);
    return {authorized: id !== 'a'};
  };
  await assert.rejects(preflightExportBatch(fixture), /EXPORT_BATCH_PERMISSION_DENIED/);
  assert.deepEqual(fixture.calls, ['list', 'recipe:c', 'permission:c:export',
    'recipe:a', 'permission:a:export']);
  const another = setup();
  another.api.assertPermission = async () => {throw Error('TRIAL_EXPIRED');};
  await assert.rejects(preflightExportBatch(another), /TRIAL_EXPIRED/);
});
