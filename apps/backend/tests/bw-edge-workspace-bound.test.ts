import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {WorkspaceRepository} from '../src/workspace.js';
import type {Asset} from '../src/repository.js';

const owner = {userId: 'owner'};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);
const boundRecipe = (assetID: string, originalSHA256 = SHA) => ({schemaVersion: 1,
  parameters: {exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {bwEdgeManual: {schemaVersion: 1,
      engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
      binding: {assetID, originalSHA256, sourceWidth: 16, sourceHeight: 16},
      subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}],
      correctionStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}],
    }}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
  }});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-bw-workspace-'));
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
      originalKey: `original/${id}`, sha256: SHA, size: 4,
      cloudSafe: true, deletedAt: null});
    repo.registerAsset(owner, workspace.id, project.id, id);
  }
  return {root, dbPath, repo, assets, workspace, project, cleanup: async () => {
    repo.close();
    const target = resolve(root), temp = resolve(tmpdir());
    if (!target.startsWith(temp + sep) || !target.split(sep).at(-1)?.startsWith('suite-bw-workspace-'))
      throw new Error('UNSAFE_TEST_CLEANUP');
    await rm(target, {recursive: true, force: true});
  }};
}

test('BW-WS-01: direct save binds B/W strokes to exact Asset UUID and Original SHA', async () => {
  const f = await fixture(); try {
    assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, B,
      {baseVersion: 0, body: boundRecipe(A)}), /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, A,
      {baseVersion: 0, body: boundRecipe(A, 'b'.repeat(64))}), /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.equal(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, B), null);
    assert.equal(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, A), null);
    const saved = f.repo.saveRecipe(owner, f.workspace.id, f.project.id, A,
      {baseVersion: 0, body: boundRecipe(A)});
    assert.equal(saved.outcome, 'saved');
    assert.equal(saved.version.version, 1);
    assert.deepEqual(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, A)?.body,
      boundRecipe(A));
    assert.deepEqual(f.repo.recipeHistory(owner, f.workspace.id, f.project.id, A)
      .map(entry => entry.version), [1]);
    assert.throws(() => f.repo.saveRecipe({userId: 'stranger'}, f.workspace.id,
      f.project.id, A, {baseVersion: 1, body: boundRecipe(A)}), /FORBIDDEN/);
  } finally {await f.cleanup();}
});

test('BW-WS-02: any bound history row with wrong Asset or SHA blocks read and next write', async () => {
  const f = await fixture(); try {
    const db = new DatabaseSync(f.dbPath);
    try {
      db.prepare('INSERT INTO ws_recipe_versions(id,workspace_id,project_id,asset_id,version,parent_version,editor_user_id,created_at,branch,body,changed_fields,preset_snapshot) VALUES(?,?,?,?,1,0,?,?,0,?,\'[]\',NULL)')
        .run(randomUUID(), f.workspace.id, f.project.id, B, owner.userId,
          new Date().toISOString(), JSON.stringify(boundRecipe(A)));
      db.prepare('INSERT INTO ws_recipe_heads(workspace_id,project_id,asset_id,version) VALUES(?,?,?,1)')
        .run(f.workspace.id, f.project.id, B);
    } finally {db.close();}
    assert.throws(() => f.repo.latestRecipe(owner, f.workspace.id, f.project.id, B),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => f.repo.recipeHistory(owner, f.workspace.id, f.project.id, B),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => f.repo.getRecipeVersion(owner, f.workspace.id, f.project.id, B, 1),
      /INVALID_BW_EDGE_MANUAL_BINDING/);
    assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, B,
      {baseVersion: 1, body: boundRecipe(B)}), /INVALID_BW_EDGE_MANUAL_BINDING/);
    const count = new DatabaseSync(f.dbPath);
    try {
      const row = count.prepare('SELECT COUNT(*) AS n FROM ws_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=?')
        .get(f.workspace.id, f.project.id, B);
      assert.equal(Number(row?.n), 1);
    } finally {count.close();}
  } finally {await f.cleanup();}
});

test('BW-WS-03: Original SHA replacement is independently refused by existing Asset identity guard', async () => {
  const f = await fixture(); try {
    f.repo.saveRecipe(owner, f.workspace.id, f.project.id, A,
      {baseVersion: 0, body: boundRecipe(A)});
    f.assets.set(A, {...f.assets.get(A)!, sha256: 'b'.repeat(64)});
    assert.throws(() => f.repo.latestRecipe(owner, f.workspace.id, f.project.id, A),
      /ORIGINAL_IDENTITY_CHANGED/);
    assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, A,
      {baseVersion: 1, body: boundRecipe(A)}), /ORIGINAL_IDENTITY_CHANGED/);
  } finally {await f.cleanup();}
});
