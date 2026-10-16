import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {WorkspaceRepository} from '../src/workspace.js';
import type {Asset} from '../src/repository.js';

const owner = {userId: 'owner'};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(64);
const recipe = (boundAsset?: string) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: boundAsset ? {bwEdgeManual: {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: boundAsset, originalSHA256: sha, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}],
    correctionStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}],
  }} : {},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-bw-preset-'));
  const dbPath = join(root, 'workspace.sqlite');
  const assets = new Map<string, Asset>();
  const repo = new WorkspaceRepository(dbPath, (workspaceId, assetId) => {
    const asset = assets.get(assetId);
    if (!asset || asset.tenantId !== workspaceId) throw new Error('ASSET_NOT_FOUND');
    return asset;
  });
  const workspace = repo.createWorkspace(owner, 'Studio');
  const project = repo.createProject(owner, workspace.id, 'Project');
  for (const id of [A, B]) {
    assets.set(id, {id, tenantId: workspace.id, name: 'Original',
      originalKey: `original/${id}`, sha256: sha, size: 4, cloudSafe: true,
      deletedAt: null});
    repo.registerAsset(owner, workspace.id, project.id, id);
  }
  return {root, dbPath, repo, workspace, project, cleanup: async () => {
    repo.close();
    const target = resolve(root), temp = resolve(tmpdir());
    if (!target.startsWith(temp + sep) || !target.split(sep).at(-1)?.startsWith('suite-bw-preset-'))
      throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(target, {recursive: true, force: true});
  }};
}

test('BW-PRESET-01: Personal and Workspace creation reject photo-bound mask without persistence', async () => {
  const f = await fixture(); try {
    for (const scope of ['PERSONAL', 'WORKSPACE'] as const)
      assert.throws(() => f.repo.createPreset(owner, f.workspace.id,
        {name: 'Bound', scope, body: recipe(A)}), /PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN/);
    assert.deepEqual(f.repo.listPresets(owner, f.workspace.id), []);
    const valid = f.repo.createPreset(owner, f.workspace.id,
      {name: 'Neutral', scope: 'PERSONAL', body: recipe()});
    assert.equal(valid.version, 1);
  } finally {await f.cleanup();}
});

test('BW-PRESET-02: update rejects bound mask without incrementing version or changing body', async () => {
  const f = await fixture(); try {
    const preset = f.repo.createPreset(owner, f.workspace.id,
      {name: 'Reusable', body: recipe()});
    assert.throws(() => f.repo.updatePreset(owner, f.workspace.id, preset.id,
      {baseVersion: 1, name: 'Unsafe', body: recipe(A)}), /PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN/);
    const unchanged = f.repo.getPreset(owner, f.workspace.id, preset.id);
    assert.equal(unchanged.version, 1);
    assert.equal(unchanged.name, 'Reusable');
    assert.deepEqual(unchanged.body, recipe());
    const applied = f.repo.applyPreset(owner, f.workspace.id, f.project.id, B, 0, preset.id);
    assert.equal(applied.outcome, 'saved');
  } finally {await f.cleanup();}
});

test('BW-PRESET-03: legacy bound preset row cannot apply to another Asset', async () => {
  const f = await fixture(); try {
    const preset = f.repo.createPreset(owner, f.workspace.id,
      {name: 'Legacy', body: recipe()});
    const db = new DatabaseSync(f.dbPath);
    try {
      db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,2,?,?,?,?)')
        .run(preset.id, 'Legacy unsafe', JSON.stringify(recipe(A)), owner.userId, new Date().toISOString());
      db.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(preset.id);
    } finally {db.close();}
    assert.throws(() => f.repo.applyPreset(owner, f.workspace.id, f.project.id, B, 0, preset.id),
      /PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN/);
    assert.equal(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, B), null);
    assert.deepEqual(f.repo.recipeHistory(owner, f.workspace.id, f.project.id, B), []);
  } finally {await f.cleanup();}
});
