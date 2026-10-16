import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe as fixtureRecipe} from './fixtures.mjs';

const THIRD = '33333333-3333-4333-8333-333333333333';
const DIFFERENT_SHA = 'b'.repeat(64);
const clone = value => structuredClone(value);
const sourceRecipe = () => ({schemaVersion: 1, parameters: {
  exposure: 0.5, contrast: 1.1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const selected = (id, revision = 0, sha256 = SHA) => ({id, revision, sha256});

function adapter({denied = [], conflict = [], ambiguous = [], workspace = false} = {}) {
  const assets = [ASSET_A, ASSET_B, THIRD].map(id => ({id, sha256: SHA}));
  const stored = new Map([[ASSET_A, {revision: 2, body: sourceRecipe()}],
    [ASSET_B, {revision: 1, body: fixtureRecipe()}]]);
  const calls = [];
  const api = {
    async listAssets() {calls.push('listAssets'); return clone(assets);},
    async assertPermission(id, action) {
      calls.push(`permission:${id}:${action}`);
      if (denied.includes(id)) throw Error('FORBIDDEN');
      return {authorized: true};
    },
    async getRecipe(id) {
      calls.push(`get:${id}`);
      const found = stored.get(id);
      if (!found) return null;
      return workspace ? {version: found.revision, body: clone(found.body), assetId: id} : clone(found);
    },
    async saveRecipe(id, expectedRevision, body) {
      calls.push(`save:${id}:${expectedRevision}`);
      if (conflict.includes(id)) return {outcome: 'conflict', version: {version: expectedRevision + 2}};
      const current = stored.get(id)?.revision ?? 0;
      if (current !== expectedRevision) throw Error('REVISION_CONFLICT');
      const next = {revision: current + 1, body: clone(body)};
      stored.set(id, next);
      if (ambiguous.includes(id)) throw Error('NETWORK_AFTER_COMMIT');
      return workspace
        ? {outcome: 'saved', version: {version: next.revision, body: clone(body), assetId: id}}
        : clone(next);
    },
    async getOriginal() {throw Error('RAW_READ_NOT_ALLOWED');},
    async putOriginal() {throw Error('RAW_WRITE_NOT_ALLOWED');},
  };
  return {api, assets, stored, calls};
}

test('BATCH-01: fixed saved Recipe applies serially with per-asset permission and CAS verification', async () => {
  const {api, stored, calls} = adapter();
  const originalSource = clone(stored.get(ASSET_A));
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1), selected(THIRD, 0)]});
  assert.equal(result.status, 'complete');
  assert.equal(result.saved, 2);
  assert.deepEqual(result.results, [
    {assetId: ASSET_B, status: 'saved', revision: 2},
    {assetId: THIRD, status: 'saved', revision: 1},
  ]);
  assert.deepEqual(stored.get(ASSET_A), originalSource);
  assert.deepEqual(stored.get(ASSET_B).body, originalSource.body);
  assert.deepEqual(stored.get(THIRD).body, originalSource.body);
  assert.ok(calls.indexOf(`save:${ASSET_B}:1`) < calls.indexOf(`get:${THIRD}`));
  assert.equal(calls.filter(call => call === `permission:${ASSET_B}:edit`).length, 2);
  assert.equal(calls.some(call => call.includes('Original')), false);
});

test('BATCH-02: denied, stale and changed-RAW assets are not saved; later asset still proceeds', async () => {
  const {api, assets, calls} = adapter({denied: [ASSET_B]});
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1), selected(THIRD, 0)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(item => item.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'FORBIDDEN');
  assert.equal(calls.some(call => call.startsWith(`save:${ASSET_B}`)), false);

  const stale = await applyBatchRecipe({api: adapter().api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 0), selected(THIRD, 0)]});
  assert.deepEqual(stale.results.map(item => item.status), ['failed', 'saved']);
  assert.equal(stale.results[0].reason, 'BATCH_REVISION_CONFLICT');

  const changed = adapter();
  changed.assets.find(item => item.id === ASSET_B).sha256 = DIFFERENT_SHA;
  const mismatch = await applyBatchRecipe({api: changed.api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1)]});
  assert.equal(mismatch.results[0].status, 'failed');
  assert.equal(mismatch.results[0].reason, 'BATCH_ORIGINAL_IDENTITY_CHANGED');
  assert.equal(changed.calls.some(call => call.startsWith('save:')), false);
  assert.equal(assets.length, 3);
});

test('BATCH-03: missing authorization adapter or stale saved source blocks the whole batch', async () => {
  const {api, calls} = adapter();
  const withoutPermission = {...api}; delete withoutPermission.assertPermission;
  await assert.rejects(applyBatchRecipe({api: withoutPermission, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1)]}), /BATCH_ADAPTER_NOT_CONNECTED/);
  await assert.rejects(applyBatchRecipe({api, source: selected(ASSET_A, 1),
    targets: [selected(ASSET_B, 1)]}), /BATCH_SOURCE_REVISION_CONFLICT/);
  await assert.rejects(applyBatchRecipe({api, source: selected(ASSET_A, 2, DIFFERENT_SHA),
    targets: [selected(ASSET_B, 1)]}), /BATCH_ORIGINAL_IDENTITY_CHANGED/);
  await assert.rejects(applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1), selected(ASSET_B, 1)]}), /BATCH_DUPLICATE_TARGET/);
  assert.equal(calls.some(call => call.startsWith('save:')), false);
});

test('BATCH-03B: an adapter must return explicit positive edit authorization', async () => {
  const {api, calls} = adapter();
  api.assertPermission = async () => ({});
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1)]});
  assert.deepEqual(result.results, [{assetId: ASSET_B, status: 'failed',
    reason: 'BATCH_PERMISSION_DENIED'}]);
  assert.equal(calls.some(call => call.startsWith('save:')), false);
});

test('BATCH-04: Workspace conflict branch is reported as conflict, not saved head', async () => {
  const {api, stored} = adapter({workspace: true, conflict: [ASSET_B]});
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1), selected(THIRD, 0)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results[0], {assetId: ASSET_B, status: 'conflict',
    reason: 'BATCH_REVISION_CONFLICT', branchVersion: 3});
  assert.deepEqual(result.results[1], {assetId: THIRD, status: 'saved', revision: 1});
  assert.equal(stored.get(ASSET_B).revision, 1);
});

test('BATCH-05: ambiguous post-write error is unverified, never falsely successful or safely failed', async () => {
  const {api, stored} = adapter({ambiguous: [ASSET_B]});
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1), selected(THIRD, 0)]});
  assert.equal(result.status, 'partial');
  assert.equal(result.results[0].status, 'unverified');
  assert.equal(result.results[0].reason, 'NETWORK_AFTER_COMMIT');
  assert.equal(stored.get(ASSET_B).revision, 2);
  assert.equal(result.results[1].status, 'saved');
});

test('BATCH-06: asset-specific portrait geometry cannot be copied to another asset', async () => {
  const {api, stored, calls} = adapter();
  stored.set(ASSET_A, {revision: 2, body: fixtureRecipe(portrait(ASSET_A))});
  const result = await applyBatchRecipe({api, source: selected(ASSET_A, 2),
    targets: [selected(ASSET_B, 1)]});
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].status, 'failed');
  assert.match(result.results[0].reason, /PORTRAIT|ASSET|BINDING/);
  assert.equal(calls.some(call => call.startsWith('save:')), false);
});
