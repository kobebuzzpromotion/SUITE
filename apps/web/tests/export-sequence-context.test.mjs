import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportQueue, resolveExportQueuePosition} from '../src/export-queue.mjs';
import {resolveExportNamingContext} from '../src/export-naming-context.mjs';
import {buildExportFilenameFromForm} from '../src/export-naming-form.mjs';

const asset = (id, name, size = 10) => ({id, name, size, sha256: id.repeat(64),
  cloudSafe: true, deletedAt: null});
const assets = () => [asset('a', 'A.RAW'), asset('b', 'B.RAW'), asset('c', 'C.RAW')];
const savedState = (selected) => ({asset: selected, assets: assets(),
  recipe: {schemaVersion: 1, parameters: {}}, revision: 2, dirty: false});
const context = (state, method, exportQueuePlan) =>
  resolveExportNamingContext({state, method, exportQueuePlan});

test('EXPORT-SEQUENCE-CONTEXT01: explicit queue order, not library order, supplies both naming methods', () => {
  const inventory = assets();
  const before = structuredClone(inventory);
  const plan = planExportQueue({orderedIds: ['c', 'a', 'b'], assets: inventory});
  const current = savedState(inventory[0]);
  const count = context(current, 'custom-count', plan);
  assert.deepEqual(count, {originalFilename: 'A.RAW', sequence: 2, total: 3});
  assert.equal(buildExportFilenameFromForm({...count, method: 'custom-count',
    format: 'jpeg', customName: 'Shoot'}), 'Shoot (2 of 3).jpg');
  const sequence = context(current, 'custom-sequence', plan);
  assert.deepEqual(sequence, count);
  assert.equal(buildExportFilenameFromForm({...sequence, method: 'custom-sequence',
    format: 'png', customName: 'Shoot'}), 'Shoot_002.png');
  assert.equal(Object.isFrozen(count), true);
  assert.deepEqual(inventory, before);
  assert.deepEqual(current, savedState(inventory[0]));
});

test('EXPORT-SEQUENCE-CONTEXT02: single current Asset and library order cannot imply a queue', () => {
  const current = savedState(assets()[0]);
  for (const method of ['custom-count', 'custom-sequence']) {
    assert.throws(() => context(current, method), /EXPORT_SEQUENCE_UNAVAILABLE/);
    assert.throws(() => context(current, method, current.assets), /EXPORT_QUEUE_PLAN_REQUIRED/);
    assert.throws(() => context(current, method, [{assetId: 'a', sequence: 1, total: 1,
      asset: current.asset}]), /EXPORT_QUEUE_PLAN_REQUIRED/);
  }
  const plan = planExportQueue({orderedIds: ['a'], assets: assets()});
  assert.deepEqual(context(current, 'custom-count', plan),
    {originalFilename: 'A.RAW', sequence: 1, total: 1});
  assert.throws(() => resolveExportQueuePosition({plan: [...plan], asset: current.asset}),
    /EXPORT_QUEUE_PLAN_REQUIRED/);
});

test('EXPORT-SEQUENCE-CONTEXT03: current Asset identity, name, SHA and byte size must match the plan', () => {
  const inventory = assets();
  const plan = planExportQueue({orderedIds: ['b', 'a'], assets: inventory});
  const original = savedState(inventory[0]);
  for (const changed of [
    {...original.asset, id: 'c'},
    {...original.asset, name: 'renamed.RAW'},
    {...original.asset, sha256: 'f'.repeat(64)},
    {...original.asset, size: 11},
    {...original.asset, deletedAt: '2026-10-04T00:00:00Z'},
  ]) assert.throws(() => context({...original, asset: changed}, 'custom-sequence', plan),
    /EXPORT_QUEUE_ASSET_NOT_SELECTED|EXPORT_QUEUE_ASSET_STALE|EXPORT_QUEUE_ASSET_INVALID/);
  assert.deepEqual(context(original, 'custom-sequence', plan),
    {originalFilename: 'A.RAW', sequence: 2, total: 2});
});

test('EXPORT-SEQUENCE-CONTEXT04: dirty, unsaved or invalid saved state fails closed', () => {
  const current = savedState(assets()[0]);
  const plan = planExportQueue({orderedIds: ['a'], assets: assets()});
  for (const changed of [
    {...current, dirty: true}, {...current, dirty: undefined},
    {...current, revision: 0}, {...current, revision: -1},
    {...current, revision: 1.5}, {...current, recipe: null},
  ]) assert.throws(() => context(changed, 'custom-count', plan),
    /EXPORT_SEQUENCE_SAVED_RECIPE_REQUIRED/);
  assert.deepEqual(context(current, 'custom-count', plan),
    {originalFilename: 'A.RAW', sequence: 1, total: 1});
});

test('EXPORT-SEQUENCE-CONTEXT05: timestamps do not supply a calendar capture date', () => {
  const current = savedState(assets()[0]);
  current.metadata = {libRawTimestampSeconds: '1700000000',
    libRawTimestampTimezone: 'UNVERIFIED'};
  const plan = planExportQueue({orderedIds: ['a'], assets: assets()});
  assert.throws(() => context(current, 'capture-date-original', plan),
    /EXPORT_CAPTURE_DATE_UNAVAILABLE/);
});
