import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {validateRecipe} from '../src/photo-policy.js';
import {AssetRepository, type Asset} from '../src/repository.js';
import {WorkspaceRepository} from '../src/workspace.js';

const shaA = 'a'.repeat(64), shaB = 'b'.repeat(64);
const stroke = () => ({operation: 'ADD', path: [{u: .3, v: .7}],
  radiusFraction: .05, hardness: .8});
const manual = (targetId: string, targetSHA: string, backdropId: string,
  backdropSHA: string) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-original-shadow-1',
  source: 'owner-manual-input-unverified',
  binding: {assetID: targetId, originalSHA256: targetSHA,
    sourceWidth: 40, sourceHeight: 20,
    backdropID: backdropId, backdropSHA256: backdropSHA},
  subjectStrokes: [stroke()], shadowStrokes: [stroke()], settings: {opacity: 72}});
const recipe = (manualDocument?: unknown) => ({schemaVersion: 1, parameters: {
  exposure: .2, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: manualDocument === undefined ? {priorLook: {strength: 3}} :
    {priorLook: {strength: 3}, originalShadowManual: manualDocument},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const targetId = '11111111-1111-4111-8111-111111111111';
const backdropId = '22222222-2222-4222-8222-222222222222';

test('ORIGINAL-SHADOW-NODE-01: exact typed shape, source, bounded separate strokes and no saved revision', () => {
  const base = manual(targetId, shaA, backdropId, shaB);
  assert.doesNotThrow(() => validateRecipe(recipe(base)));
  assert.deepEqual(recipe(base).parameters.extendedParameters.priorLook, {strength: 3});
  const invalid: unknown[] = [
    {...base, source: 'verified-ai-shadow'},
    {...base, permissionEvidence: {allowed: true}},
    {...base, binding: {...base.binding, savedRevision: 1}},
    {...base, binding: {...base.binding, sourceWidth: 500000}},
    {...base, subjectStrokes: [{...stroke(), operation: 'ERASE'}]},
    {...base, shadowStrokes: [{...stroke(), path: [{u: 2, v: 0}]}]},
    {...base, shadowStrokes: Array.from({length: 64}, stroke)},
    {...base, settings: {opacity: 101}},
  ];
  for (const [index, document] of invalid.entries())
    assert.throws(() => validateRecipe(recipe(document)), /INVALID_ORIGINAL_SHADOW_MANUAL/u,
      `invalid case ${index}`);
  const verbose = Array.from({length: 4095}, () => ({
    u: .12345678901234566, v: .8765432109876543}));
  assert.throws(() => validateRecipe(recipe({...base,
    shadowStrokes: [{...stroke(), path: verbose}]})),
  /INVALID_ORIGINAL_SHADOW_MANUAL_JSON_LIMIT/u);
  const aliased = recipe();
  (aliased.parameters.extendedParameters as Record<string, unknown>).originalShadowAI = base;
  assert.throws(() => validateRecipe(aliased), /INVALID_ORIGINAL_SHADOW_MANUAL_ALIAS/u);
});

test('ORIGINAL-SHADOW-NODE-02 / SQLITE: Trial repository binds real same-tenant target/backdrop and rolls back rejects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-original-shadow-repo-'));
  const path = join(root, 'trial.sqlite');
  const repo = new AssetRepository(path);
  try {
    const target = repo.create('owner-a', {name: 'target.nonraw', sha256: shaA, size: 10});
    const backdrop = repo.create('owner-a', {name: 'backdrop.nonraw', sha256: shaB, size: 11});
    const foreign = repo.create('owner-b', {name: 'foreign.nonraw', sha256: 'c'.repeat(64), size: 12});
    const valid = manual(target.id, target.sha256, backdrop.id, backdrop.sha256);
    assert.throws(() => repo.saveRecipe('owner-a', target.id, 'owner', 0, recipe(valid)),
      /INVALID_ORIGINAL_SHADOW_MANUAL_SAVED_BASE/u);
    assert.equal(repo.saveRecipe('owner-a', target.id, 'owner', 0, recipe()).revision, 1);
    for (const bound of [
      {...valid, binding: {...valid.binding, assetID: backdrop.id}},
      {...valid, binding: {...valid.binding, originalSHA256: 'd'.repeat(64)}},
      {...valid, binding: {...valid.binding, backdropID: foreign.id,
        backdropSHA256: foreign.sha256}},
      {...valid, binding: {...valid.binding, backdropSHA256: 'e'.repeat(64)}},
    ]) assert.throws(() => repo.saveRecipe('owner-a', target.id, 'owner', 1, recipe(bound)),
      /INVALID_ORIGINAL_SHADOW_MANUAL_(BINDING|BACKDROP)/u);
    assert.throws(() => repo.saveRecipe('owner-b', target.id, 'other', 1, recipe(valid)),
      /NOT_FOUND/u);
    const saved = repo.saveRecipe('owner-a', target.id, 'owner', 1, recipe(valid));
    assert.equal(saved.revision, 2);
    assert.deepEqual(repo.latestRecipe('owner-a', target.id)?.body, recipe(valid));
    assert.throws(() => repo.saveRecipe('owner-a', target.id, 'owner', 1, recipe(valid)),
      /REVISION_CONFLICT/u);
    const db = new DatabaseSync(path);
    try {
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM recipes WHERE asset_id=?').get(target.id) as {n: number}).n, 2);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE asset_id=? AND action='recipe-committed'").get(target.id) as {n: number}).n, 2);
    } finally {db.close();}
    repo.trash('owner-a', backdrop.id);
    assert.throws(() => repo.latestRecipe('owner-a', target.id),
      /INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    assert.throws(() => repo.saveRecipe('owner-a', target.id, 'owner', 2, recipe()),
      /INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    assert.equal(repo.get('owner-a', target.id).sha256, shaA);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});

test('ORIGINAL-SHADOW-NODE-03 / SQLITE: Workspace verifies registration, scope, CAS, revocation and Preset ban', async () => {
  const root = await mkdtemp(join(tmpdir(), 'suite-original-shadow-workspace-'));
  const assets = new Map<string, Asset>();
  const repo = new WorkspaceRepository(join(root, 'workspace.sqlite'), (workspaceId, id) => {
    const asset = assets.get(`${workspaceId}:${id}`);
    if (!asset) throw Error('ASSET_NOT_FOUND');
    return asset;
  });
  const owner = {userId: 'owner'}, viewer = {userId: 'viewer'};
  try {
    const ws = repo.createWorkspace(owner, 'Studio');
    const project = repo.createProject(owner, ws.id, 'Targets');
    const backdropProject = repo.createProject(owner, ws.id, 'Backdrops');
    const foreignWs = repo.createWorkspace(owner, 'Foreign');
    const foreignProject = repo.createProject(owner, foreignWs.id, 'Foreign');
    const register = (workspaceId: string, projectId: string, id: string, sha256: string) => {
      const asset: Asset = {id, tenantId: workspaceId, name: 'synthetic.nonraw',
        originalKey: `original/${workspaceId}/${id}`, sha256, size: 16,
        cloudSafe: true, deletedAt: null};
      assets.set(`${workspaceId}:${id}`, asset);
      repo.registerAsset(owner, workspaceId, projectId, id);
      return asset;
    };
    const target = register(ws.id, project.id, targetId, shaA);
    const backdrop = register(ws.id, backdropProject.id, backdropId, shaB);
    const foreign = register(foreignWs.id, foreignProject.id,
      '33333333-3333-4333-8333-333333333333', 'c'.repeat(64));
    const valid = manual(target.id, target.sha256, backdrop.id, backdrop.sha256);
    const save = (baseVersion: number, body: unknown) => repo.saveRecipe(owner, ws.id,
      project.id, target.id, {baseVersion, body});
    assert.throws(() => save(0, recipe(valid)), /INVALID_ORIGINAL_SHADOW_MANUAL_SAVED_BASE/u);
    assert.equal(save(0, recipe()).version.version, 1);
    assert.throws(() => save(1, recipe(manual(target.id, shaA, foreign.id, foreign.sha256))),
      /ORIGINAL_SHADOW_BACKGROUND_NOT_FOUND/u);
    const saved = save(1, recipe(valid));
    assert.equal(saved.outcome, 'saved');
    assert.equal(saved.version.version, 2);
    assert.deepEqual(repo.latestRecipe(owner, ws.id, project.id, target.id)?.body, recipe(valid));
    assert.throws(() => save(1, recipe(valid)), /ORIGINAL_SHADOW_MANUAL_REVISION_CONFLICT/u);
    assert.deepEqual(repo.recipeHistory(owner, ws.id, project.id, target.id).map(v => v.version), [1, 2]);
    for (const scope of ['PERSONAL', 'WORKSPACE'] as const)
      assert.throws(() => repo.createPreset(owner, ws.id,
        {name: 'Photo-bound', scope, body: recipe(valid)}),
      /PHOTO_BOUND_ORIGINAL_SHADOW_PRESET_FORBIDDEN/u);
    assert.deepEqual(repo.listPresets(owner, ws.id), []);
    const invitation = repo.inviteMember(owner, ws.id, {email: 'viewer@example.test',
      role: 'VIEWER', expiresAt: new Date(Date.now() + 600000).toISOString()});
    repo.acceptInvitation(viewer, ws.id, invitation.token, 'viewer@example.test');
    assert.throws(() => repo.saveRecipe(viewer, ws.id, project.id, target.id,
      {baseVersion: 2, body: recipe(valid)}), /FORBIDDEN/u);
    repo.removeMember(owner, ws.id, 'viewer');
    assert.throws(() => repo.saveRecipe(viewer, ws.id, project.id, target.id,
      {baseVersion: 2, body: recipe(valid)}), /FORBIDDEN/u);
    repo.trashAsset(owner, ws.id, backdropProject.id, backdrop.id);
    assert.throws(() => repo.latestRecipe(owner, ws.id, project.id, target.id),
      /ORIGINAL_SHADOW_BACKGROUND_NOT_FOUND/u);
    assert.equal(target.sha256, shaA);
    assert.equal(backdrop.sha256, shaB);
  } finally {repo.close(); await rm(root, {recursive: true, force: true});}
});
