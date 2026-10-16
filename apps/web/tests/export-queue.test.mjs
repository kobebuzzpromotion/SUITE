import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportQueue, MAX_EXPORT_QUEUE_ITEMS} from '../src/export-queue.mjs';
import {buildExportFilename} from '../src/export-naming.mjs';

const asset = (id, name, overrides = {}) => ({id, name, sha256: id.repeat(64),
  size: 10, cloudSafe: true, deletedAt: null, originalKey: `private/${id}`, ...overrides});

test('EXPORT-QUEUE01: explicit order, not inventory order, yields stable one-based sequence and total', () => {
  const inventory = [asset('a', 'A.raw'), asset('b', 'B.raw'), asset('c', 'C.raw')];
  const orderedIds = ['c', 'a', 'b'];
  const before = structuredClone(inventory);
  const plan = planExportQueue({orderedIds, assets: inventory});
  assert.deepEqual(plan.map(item => [item.assetId, item.sequence, item.total]),
    [['c', 1, 3], ['a', 2, 3], ['b', 3, 3]]);
  assert.deepEqual(plan.map(item => item.asset.name), ['C.raw', 'A.raw', 'B.raw']);
  assert.equal(plan[0].asset.originalKey, undefined);
  assert.deepEqual(orderedIds, ['c', 'a', 'b']);
  assert.deepEqual(inventory, before);
  inventory[2].name = 'changed.raw';
  assert.equal(plan[0].asset.name, 'C.raw');
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan[0].asset), true);
});

test('EXPORT-QUEUE02: positions feed existing custom-count and custom-sequence filename planner', () => {
  const plan = planExportQueue({orderedIds: ['b', 'a'],
    assets: [asset('a', 'A.raw'), asset('b', 'B.raw')]});
  assert.equal(buildExportFilename({originalFilename: plan[0].asset.name, format: 'jpeg',
    method: 'custom-count', customName: 'Shoot', sequence: plan[0].sequence, total: plan[0].total}),
  'Shoot (1 of 2).jpg');
  assert.equal(buildExportFilename({originalFilename: plan[1].asset.name, format: 'png',
    method: 'custom-sequence', customName: 'Shoot', sequence: plan[1].sequence, total: plan[1].total}),
  'Shoot_002.png');
});

test('EXPORT-QUEUE03: missing, duplicate, malformed and stale inventory selections fail closed', () => {
  const inventory = [asset('a', 'A.raw'), asset('b', 'B.raw')];
  for (const input of [
    {assets: inventory}, {orderedIds: [], assets: inventory},
    {orderedIds: 'a', assets: inventory},
    {orderedIds: ['a'], assets: null},
    {orderedIds: ['a', 'a'], assets: inventory},
    {orderedIds: ['unknown'], assets: inventory},
    {orderedIds: [' a'], assets: inventory},
    {orderedIds: ['a'], assets: [...inventory, asset('a', 'duplicate.raw')]},
    {orderedIds: ['a'], assets: [asset('a', 'deleted.raw', {deletedAt: '2026-10-04'})]},
    {orderedIds: ['a'], assets: [asset('a', 'bad.raw', {sha256: 'wrong'})]},
  ]) assert.throws(() => planExportQueue(input));
});

test('EXPORT-QUEUE04: hard count limit includes exact boundary without reordering or overflow', () => {
  assert.equal(MAX_EXPORT_QUEUE_ITEMS, 1000);
  const ids = Array.from({length: MAX_EXPORT_QUEUE_ITEMS}, (_, n) => n.toString(16).padStart(64, '0'));
  const inventory = ids.map((id, n) => ({id, name: `Image-${n}.raw`, sha256: 'a'.repeat(64), size: 20}));
  const plan = planExportQueue({orderedIds: ids, assets: inventory});
  assert.equal(plan.length, MAX_EXPORT_QUEUE_ITEMS);
  assert.equal(plan.at(-1).sequence, MAX_EXPORT_QUEUE_ITEMS);
  assert.equal(plan.at(-1).total, MAX_EXPORT_QUEUE_ITEMS);
  assert.throws(() => planExportQueue({orderedIds: [...ids, 'extra'], assets: inventory}), /EXPORT_QUEUE_TOO_LARGE/);
});
