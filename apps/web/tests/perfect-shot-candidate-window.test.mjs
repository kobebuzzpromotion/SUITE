import test from 'node:test';
import assert from 'node:assert/strict';
import {planPerfectShotCandidateWindow} from '../src/perfect-shot-candidate-window.mjs';

const workspaceId = 'workspace-1';
const projectId = 'project-1';
const sha = index => index.toString(16).padStart(64, '0');
const ids = count => Array.from({length: count}, (_, index) => `asset-${index}`);
const input = selectedAssetId => ({workspaceId, projectId, selectedAssetId});

function adapter(orderedAssetIds = ids(20), overrides = {}) {
  const calls = {orders: 0, assets: []};
  const api = {
    async readAuthenticatedProjectShootOrder() {
      calls.orders++;
      return {subjectId: 'owner-1', workspaceId, projectId,
        orderKind: 'authenticated-shoot-sequence-v1', orderRevision: 4,
        orderedAssetIds: [...orderedAssetIds]};
    },
    async readAuthenticatedProjectAsset({assetId, orderRevision}) {
      calls.assets.push(assetId);
      const index = orderedAssetIds.indexOf(assetId);
      return {subjectId: 'owner-1', workspaceId, projectId, assetId,
        orderRevision, originalSHA256: sha(index), recipeRevision: index + 1,
        deletedAt: null};
    },
    ...overrides,
  };
  return {api, calls};
}

test('PS-WINDOW-01: synthetic trusted adapter yields only ±7 ordered read-only snapshots', async () => {
  const {api, calls} = adapter();
  const plan = await planPerfectShotCandidateWindow({...input('asset-10'), api});
  assert.equal(plan.kind, 'perfect-shot-candidate-window-v1');
  assert.equal(plan.subjectId, 'owner-1');
  assert.equal(plan.selectedAssetId, 'asset-10');
  assert.equal(plan.centerIndex, 10);
  assert.equal(plan.orderRevision, 4);
  assert.equal(plan.projectAssetCount, 20);
  assert.deepEqual(plan.candidates.map(item => item.assetId), ids(20).slice(3, 18));
  assert.deepEqual(plan.candidates.map(item => item.relativeOffset),
    [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(plan.candidates[7].originalSHA256, sha(10));
  assert.equal(plan.candidates[7].recipeRevision, 11);
  assert.equal(calls.orders, 2);
  assert.deepEqual(calls.assets, ids(20).slice(3, 18));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.candidates) &&
    plan.candidates.every(Object.isFrozen));
  assert.throws(() => plan.candidates.push('forbidden'), TypeError);
});

test('PS-WINDOW-02: first/last Project edges are clipped, never wrap or infer neighbors', async () => {
  const {api} = adapter();
  const first = await planPerfectShotCandidateWindow({...input('asset-0'), api});
  const last = await planPerfectShotCandidateWindow({...input('asset-19'), api});
  assert.deepEqual(first.candidates.map(item => item.assetId), ids(8));
  assert.deepEqual(last.candidates.map(item => item.assetId), ids(20).slice(12));
  assert.deepEqual(last.candidates.map(item => item.relativeOffset), [-7, -6, -5, -4, -3, -2, -1, 0]);
});

test('PS-WINDOW-03: existing Workspace-style listAssets cannot masquerade as authenticated shoot order', async () => {
  const workspaceLike = {listAssets: async () => ids(20), getProject: async () => ({id: projectId})};
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: workspaceLike}),
    /PERFECT_SHOT_ORDER_EVIDENCE_UNAVAILABLE/);
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'),
    api: {readAuthenticatedProjectShootOrder: async () => ({})}}),
  /PERFECT_SHOT_ASSET_EVIDENCE_UNAVAILABLE/);
});

test('PS-WINDOW-04: missing selection, duplicate or registration-order claim fail closed', async () => {
  await assert.rejects(planPerfectShotCandidateWindow({...input('unknown'), api: adapter().api}),
    /PERFECT_SHOT_SELECTED_NOT_IN_PROJECT/);
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-1'),
    api: adapter(['asset-1', 'asset-1']).api}), /PERFECT_SHOT_ORDER_EVIDENCE_INVALID/);
  const base = adapter().api;
  const old = base.readAuthenticatedProjectShootOrder;
  base.readAuthenticatedProjectShootOrder = async () => ({...await old(), orderKind: 'registration-created-at'});
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: base}),
    /PERFECT_SHOT_ORDER_EVIDENCE_INVALID/);
});

test('PS-WINDOW-05: cross-Project, cross-subject, deleted, SHA and unsaved revision are rejected', async () => {
  for (const mutate of [
    row => ({...row, projectId: 'other-project'}),
    row => ({...row, workspaceId: 'other-workspace'}),
    row => ({...row, subjectId: 'other-user'}),
    row => ({...row, deletedAt: '2026-10-04T00:00:00Z'}),
    row => ({...row, originalSHA256: 'not-sha'}),
    row => ({...row, recipeRevision: 0}),
    row => ({...row, orderRevision: row.orderRevision - 1}),
  ]) {
    const base = adapter().api;
    const old = base.readAuthenticatedProjectAsset;
    base.readAuthenticatedProjectAsset = async request => mutate(await old(request));
    await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: base}),
      /PERFECT_SHOT_(ASSET_EVIDENCE_INVALID|VERSION_INVALID)/);
  }
});

test('PS-WINDOW-06: changing order, revision, or actor during reads invalidates whole plan', async () => {
  for (const mutate of [
    row => ({...row, orderedAssetIds: [...row.orderedAssetIds].reverse()}),
    row => ({...row, orderRevision: row.orderRevision + 1}),
    row => ({...row, subjectId: 'other-user'}),
  ]) {
    const base = adapter().api;
    const old = base.readAuthenticatedProjectShootOrder;
    let reads = 0;
    base.readAuthenticatedProjectShootOrder = async request => {
      const row = await old(request);
      return ++reads === 2 ? mutate(row) : row;
    };
    await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: base}),
      /PERFECT_SHOT_ORDER_CHANGED/);
  }
});

test('PS-WINDOW-07: cancellation before and during I/O returns no plan', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: adapter().api,
    signal: before.signal}), {name: 'AbortError'});
  const mid = new AbortController();
  const base = adapter().api;
  const old = base.readAuthenticatedProjectAsset;
  base.readAuthenticatedProjectAsset = async request => {
    const row = await old(request);
    mid.abort();
    return row;
  };
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: base,
    signal: mid.signal}), {name: 'AbortError'});
});

test('PS-WINDOW-08: malformed identifiers, sparse/oversized orders and unknown keys fail closed', async () => {
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-1'), projectId: '\n',
    api: adapter().api}), /PERFECT_SHOT_ID_INVALID/);
  const sparse = ['asset-0', , 'asset-2'];
  const sparseApi = adapter().api;
  const oldOrder = sparseApi.readAuthenticatedProjectShootOrder;
  sparseApi.readAuthenticatedProjectShootOrder = async request => ({
    ...await oldOrder(request), orderedAssetIds: sparse});
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-0'),
    api: sparseApi}), /PERFECT_SHOT_ORDER_EVIDENCE_INVALID/);
  const huge = ids(100_001);
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-0'),
    api: adapter(huge).api}), /PERFECT_SHOT_ORDER_EVIDENCE_INVALID/);
  const base = adapter().api;
  const old = base.readAuthenticatedProjectAsset;
  base.readAuthenticatedProjectAsset = async request => ({...await old(request), trusted: true});
  await assert.rejects(planPerfectShotCandidateWindow({...input('asset-10'), api: base}),
    /PERFECT_SHOT_ASSET_EVIDENCE_INVALID/);
});
