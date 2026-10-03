import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceRepository, recipeDifferences, type WorkspaceRole, type TeamRecipeSaveResult} from '../src/workspace.js';
import {defaultCropSettings, defaultExportSettings} from '../src/crop-export.js';

// Arbitrary storage-boundary bytes, NOT a RAW image or a decoder/Cloud-provider fixture.
const bytes = Buffer.from('workspace immutable storage-boundary evidence');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const owner = {userId: 'owner'}, other = {userId: 'other'}, editor = {userId: 'editor'}, viewer = {userId: 'viewer'}, admin = {userId: 'admin'};
const body = (exposure = 0.3) => ({schemaVersion: 1, parameters: {exposure, contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-workspace-'));
  const assetPath = join(root, 'assets.sqlite'), workspacePath = join(root, 'workspace.sqlite');
  const assets = new AssetRepository(assetPath), storage = new LocalObjectStorage(join(root, 'objects'));
  let timestamp = new Date('2026-10-03T00:00:00.000Z');
  const repo = new WorkspaceRepository(workspacePath, (ws, id, deleted) => assets.get(ws, id, deleted), () => timestamp);
  const workspace = repo.createWorkspace(owner, 'STUDIO'), project = repo.createProject(owner, workspace.id, 'Session');
  const asset = assets.create(workspace.id, {name: 'boundary-bytes', sha256, size: bytes.length});
  await storage.putImmutable(asset.originalKey, Readable.from([bytes]), {sha256, size: bytes.length});
  repo.registerAsset(owner, workspace.id, project.id, asset.id);
  const add = (userId: string, role: Exclude<WorkspaceRole, 'OWNER'>) => {
    const invitation = repo.inviteMember(owner, workspace.id, {email: `${userId}@example.test`, role, expiresAt: '2026-10-04T00:00:00.000Z'});
    return repo.acceptInvitation({userId}, workspace.id, invitation.token, `${userId}@example.test`);
  };
  return {root, repo, assets, storage, workspace, project, asset, add, assetPath, workspacePath, setTime: (date: string) => {timestamp = new Date(date);}, cleanup: async () => {repo.close(); assets.close(); await rm(root, {recursive: true, force: true});}};
}

test('Workspace membership lists only authorized workspaces and never crosses Asset or Project boundaries', async () => {
  const f = await fixture(); try {
    const b = f.repo.createWorkspace(other, 'Other Studio'), bp = f.repo.createProject(other, b.id, 'Other project');
    const ba = f.assets.create(b.id, {name: 'other bytes', sha256, size: bytes.length}); f.repo.registerAsset(other, b.id, bp.id, ba.id);
    assert.deepEqual(f.repo.listWorkspaces(owner).map(x => x.id), [f.workspace.id]);
    assert.throws(() => f.repo.getWorkspace({userId: ' owner '}, f.workspace.id), /FORBIDDEN/);
    assert.throws(() => f.repo.getAsset(owner, b.id, bp.id, ba.id), /FORBIDDEN/);
    assert.throws(() => f.repo.getAsset(owner, f.workspace.id, f.project.id, ba.id), /ASSET_NOT_FOUND/);
    assert.throws(() => f.repo.registerAsset(owner, f.workspace.id, f.project.id, ba.id), /NOT_FOUND/);
    assert.throws(() => f.repo.getProject(owner, f.workspace.id, bp.id), /PROJECT_NOT_FOUND/);
    const invitation = f.repo.inviteMember(other, b.id, {email: 'owner@example.test', role: 'EDITOR', expiresAt: '2026-10-04'});
    f.repo.acceptInvitation(owner, b.id, invitation.token, 'owner@example.test'); assert.equal(f.repo.listWorkspaces(owner).length, 2);
  } finally {await f.cleanup();}
});

test('Workspace invitations require matching verified email and workspace, expire, revoke, and accept idempotently', async () => {
  const f = await fixture(); try {
    const invite = f.repo.inviteMember(owner, f.workspace.id, {email: 'EDITOR@EXAMPLE.TEST', role: 'EDITOR', expiresAt: '2026-10-04'});
    assert.equal(invite.invitation.state, 'pending');
    assert.throws(() => f.repo.acceptInvitation(editor, f.workspace.id, invite.token, 'other@example.test'), /INVALID_INVITATION/);
    assert.throws(() => f.repo.acceptInvitation(editor, 'wrong-workspace', invite.token, 'editor@example.test'), /INVALID_INVITATION/);
    assert.throws(() => f.repo.inviteMember(owner, f.workspace.id, {email: 'editor@example.test', role: 'VIEWER', expiresAt: '2026-10-04'}), /INVITATION_EXISTS/);
    assert.equal(f.repo.acceptInvitation(editor, f.workspace.id, invite.token, 'editor@example.test').role, 'EDITOR');
    f.repo.acceptInvitation(editor, f.workspace.id, invite.token, 'editor@example.test'); assert.equal(f.repo.listMembers(owner, f.workspace.id).length, 2);
    const revoked = f.repo.inviteMember(owner, f.workspace.id, {email: 'revoked@example.test', role: 'VIEWER', expiresAt: '2026-10-04'});
    f.repo.revokeInvitation(owner, f.workspace.id, revoked.invitation.id);
    assert.throws(() => f.repo.acceptInvitation({userId: 'revoked'}, f.workspace.id, revoked.token, 'revoked@example.test'), /INVALID_INVITATION/);
    const expired = f.repo.inviteMember(owner, f.workspace.id, {email: 'expired@example.test', role: 'VIEWER', expiresAt: '2026-10-04'});
    f.setTime('2026-10-04T00:00:00.000Z');
    assert.throws(() => f.repo.acceptInvitation({userId: 'expired'}, f.workspace.id, expired.token, 'expired@example.test'), /INVITATION_EXPIRED/);
  } finally {await f.cleanup();}
});

test('Workspace live role checks deny Viewer edit/export/delete and Editor administration', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('viewer', 'VIEWER'); f.add('admin', 'ADMIN');
    f.repo.authorize(editor, f.workspace.id, 'edit'); f.repo.authorize(editor, f.workspace.id, 'export');
    f.repo.authorize(viewer, f.workspace.id, 'read'); f.repo.saveSelection(viewer, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, selected: true});
    for (const permission of ['edit', 'export', 'delete', 'manage-members', 'owner'] as const) assert.throws(() => f.repo.authorize(viewer, f.workspace.id, permission), /FORBIDDEN/);
    assert.throws(() => f.repo.saveRecipe(viewer, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body()}), /FORBIDDEN/);
    assert.throws(() => f.repo.createProject(editor, f.workspace.id, 'denied'), /FORBIDDEN/);
    assert.throws(() => f.repo.createPreset(editor, f.workspace.id, {name: 'shared', body: body()}), /FORBIDDEN/);
    assert.throws(() => f.repo.trashAsset(editor, f.workspace.id, f.project.id, f.asset.id), /FORBIDDEN/);
    assert.throws(() => f.repo.authorize(admin, f.workspace.id, 'owner'), /FORBIDDEN/);
    f.repo.setMemberRole(owner, f.workspace.id, 'editor', 'VIEWER');
    assert.throws(() => f.repo.authorize(editor, f.workspace.id, 'edit'), /FORBIDDEN/);
  } finally {await f.cleanup();}
});

test('Workspace member revoke invalidates existing subject access and stale invitation issuers without owner lockout', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('admin', 'ADMIN');
    const pending = f.repo.inviteMember(admin, f.workspace.id, {email: 'pending@example.test', role: 'EDITOR', expiresAt: '2026-10-04'});
    f.repo.removeMember(owner, f.workspace.id, 'editor');
    assert.throws(() => f.repo.getAsset(editor, f.workspace.id, f.project.id, f.asset.id), /FORBIDDEN/);
    assert.throws(() => f.repo.saveRecipe(editor, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body()}), /FORBIDDEN/);
    assert.deepEqual(f.repo.listWorkspaces(editor), []);
    f.repo.removeMember(owner, f.workspace.id, 'admin');
    assert.throws(() => f.repo.acceptInvitation({userId: 'pending'}, f.workspace.id, pending.token, 'pending@example.test'), /FORBIDDEN/);
    assert.throws(() => f.repo.removeMember(owner, f.workspace.id, 'owner'), /LAST_OWNER/);
    assert.throws(() => f.repo.setMemberRole(owner, f.workspace.id, 'owner', 'EDITOR'), /LAST_OWNER/);
    f.add('admin', 'ADMIN'); assert.throws(() => f.repo.setMemberRole(admin, f.workspace.id, 'admin', 'OWNER'), /FORBIDDEN/);
    f.repo.setMemberRole(owner, f.workspace.id, 'admin', 'OWNER'); f.repo.removeMember(admin, f.workspace.id, 'owner');
    assert.equal(f.repo.authorize(admin, f.workspace.id, 'owner').role, 'OWNER');
  } finally {await f.cleanup();}
});

test('Workspace Recipe conflict preserves both immutable versions, parent, editor, diff and current head', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); const first = f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body(0.3)});
    const stale = f.repo.saveRecipe(editor, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body(0.6)});
    assert.equal(first.outcome, 'saved'); assert.equal(stale.outcome, 'conflict'); assert.equal(stale.currentVersion, 1); assert.equal(stale.version.branch, true);
    assert.equal(stale.version.parentVersion, 0); assert.equal(stale.version.editorUserId, 'editor');
    assert.deepEqual(stale.diff, [{path: '/parameters/exposure', before: 0.3, after: 0.6}]);
    assert.deepEqual(f.repo.latestRecipe(editor, f.workspace.id, f.project.id, f.asset.id)?.body, body(0.3));
    const resolved = f.repo.saveRecipe(editor, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 1, body: stale.version.body});
    assert.equal(resolved.outcome, 'saved'); assert.equal(resolved.version.version, 3); assert.equal(resolved.version.parentVersion, 1);
    assert.equal(f.repo.recipeHistory(owner, f.workspace.id, f.project.id, f.asset.id).length, 3);
    const sql = new DatabaseSync(f.workspacePath); try {assert.throws(() => sql.prepare('UPDATE ws_recipe_versions SET body=? WHERE id=?').run('{}', first.version.id), /IMMUTABLE_RECIPE_VERSION/); assert.throws(() => sql.prepare('DELETE FROM ws_recipe_versions WHERE id=?').run(first.version.id), /IMMUTABLE_RECIPE_VERSION/);} finally {sql.close();}
  } finally {await f.cleanup();}
});

async function simultaneousEditors(count: number): Promise<void> {
  const f = await fixture(); const workers: Worker[] = []; try {
    for (let i = 0; i < count; i++) f.add(`editor-${i}`, 'EDITOR');
    f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body(0)});
    const code = `const {parentPort,workerData}=require('node:worker_threads'); (async()=>{const {WorkspaceRepository}=await import(workerData.workspaceModule); const {AssetRepository}=await import(workerData.assetModule); const a=new AssetRepository(workerData.assetPath); const r=new WorkspaceRepository(workerData.workspacePath,(w,id,d)=>a.get(w,id,d)); parentPort.once('message',()=>{try {const result=r.saveRecipe({userId:workerData.user},workerData.ws,workerData.project,workerData.asset,{baseVersion:1,body:workerData.body});parentPort.postMessage({result});}catch(e){parentPort.postMessage({error:String(e)});}finally{r.close();a.close();}});parentPort.postMessage({ready:true});})().catch(e=>{parentPort.postMessage({error:String(e)});});`;
    for (let i = 0; i < count; i++) {
      const worker = new Worker(code, {eval: true, workerData: {workspaceModule: new URL('../src/workspace.js', import.meta.url).href, assetModule: new URL('../src/repository.js', import.meta.url).href, assetPath: f.assetPath, workspacePath: f.workspacePath, user: `editor-${i}`, ws: f.workspace.id, project: f.project.id, asset: f.asset.id, body: body(i + 1)}});
      workers.push(worker); const [message] = await once(worker, 'message'); assert.deepEqual(message, {ready: true});
    }
    const pending = workers.map(worker => once(worker, 'message')); for (const worker of workers) worker.postMessage('go');
    const results = (await Promise.all(pending)).map(([message]) => {assert.equal(message.error, undefined); return message.result as TeamRecipeSaveResult;});
    assert.equal(results.filter(result => result.outcome === 'saved').length, 1); assert.equal(results.filter(result => result.outcome === 'conflict').length, count - 1);
    assert.equal(f.repo.recipeHistory(owner, f.workspace.id, f.project.id, f.asset.id).length, count + 1);
    assert.equal(new Set(results.map(result => result.version.editorUserId)).size, count);
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
  } finally {await Promise.all(workers.map(worker => worker.terminate())); await f.cleanup();}
}

test('Workspace two real worker Editors race on SQLite CAS without Last Write Wins', async () => {await simultaneousEditors(2);});
test('Workspace three real worker Editors retain all concurrent branches and unchanged Original', async () => {await simultaneousEditors(3);});

test('Workspace shared Preset snapshots survive update and deletion without breaking saved Recipe', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('viewer', 'VIEWER');
    const preset = f.repo.createPreset(owner, f.workspace.id, {name: 'Wedding', body: body(0.4)});
    assert.equal(f.repo.getPreset(viewer, f.workspace.id, preset.id).scope, 'WORKSPACE');
    const applied = f.repo.applyPreset(editor, f.workspace.id, f.project.id, f.asset.id, 0, preset.id);
    f.repo.updatePreset(owner, f.workspace.id, preset.id, {baseVersion: 1, name: 'Wedding v2', body: body(0.7)});
    assert.throws(() => f.repo.updatePreset(owner, f.workspace.id, preset.id, {baseVersion: 1, name: 'stale', body: body(0.8)}), /PRESET_VERSION_CONFLICT/);
    assert.deepEqual(f.repo.getPreset(owner, f.workspace.id, preset.id).body, body(0.7));
    f.repo.deletePreset(owner, f.workspace.id, preset.id);
    assert.throws(() => f.repo.getPreset(editor, f.workspace.id, preset.id), /PRESET_NOT_FOUND/);
    const stored = f.repo.getRecipeVersion(editor, f.workspace.id, f.project.id, f.asset.id, applied.version.version);
    assert.deepEqual(stored.body, body(0.4)); assert.deepEqual(stored.presetSnapshot, {id: preset.id, version: 1, body: body(0.4)});
    assert.throws(() => f.repo.applyPreset(viewer, f.workspace.id, f.project.id, f.asset.id, 1, preset.id), /FORBIDDEN/);
  } finally {await f.cleanup();}
});

test('Workspace personal Preset isolation and unsupported Community do not bypass shared management permissions', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); const personal = f.repo.createPreset(editor, f.workspace.id, {scope: 'PERSONAL', name: 'Private', body: body()});
    assert.throws(() => f.repo.getPreset(owner, f.workspace.id, personal.id), /PRESET_NOT_FOUND/); assert.equal(f.repo.listPresets(owner, f.workspace.id).length, 0);
    assert.throws(() => f.repo.createPreset(owner, f.workspace.id, {scope: 'COMMUNITY', name: 'Public', body: body()}), /COMMUNITY_NOT_IMPLEMENTED/);
    const otherWs = f.repo.createWorkspace(other, 'Other'); const shared = f.repo.createPreset(other, otherWs.id, {name: 'Other shared', body: body()});
    assert.throws(() => f.repo.getPreset(owner, f.workspace.id, shared.id), /PRESET_NOT_FOUND/);
  } finally {await f.cleanup();}
});

test('Workspace Selection CAS preserves winner when two or three users submit the same base', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('viewer', 'VIEWER');
    const selected = f.repo.saveSelection(viewer, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, selected: true});
    for (const actor of [editor, owner]) assert.throws(() => f.repo.saveSelection(actor, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, selected: false}), /SELECTION_VERSION_CONFLICT/);
    assert.deepEqual(f.repo.getSelection(owner, f.workspace.id, f.project.id, f.asset.id), selected);
    assert.throws(() => f.repo.saveSelection(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 1, selected: 'true' as unknown as boolean}), /INVALID_SELECTION/);
  } finally {await f.cleanup();}
});

test('Workspace soft delete and recovery retain object bytes, Recipe versions and Cloud Safe evidence', async () => {
  const f = await fixture(); try {
    f.assets.markVerified(f.workspace.id, f.asset.id, {sha256, size: bytes.length, persisted: true});
    f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body()});
    f.repo.trashAsset(owner, f.workspace.id, f.project.id, f.asset.id);
    assert.throws(() => f.repo.getAsset(owner, f.workspace.id, f.project.id, f.asset.id), /ASSET_NOT_FOUND/);
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
    assert.equal(f.repo.restoreAsset(owner, f.workspace.id, f.project.id, f.asset.id).cloudSafe, true);
    assert.deepEqual(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, f.asset.id)?.body, body());
    f.repo.trashProject(owner, f.workspace.id, f.project.id); assert.throws(() => f.repo.listAssets(owner, f.workspace.id, f.project.id), /PROJECT_NOT_FOUND/);
    f.repo.restoreProject(owner, f.workspace.id, f.project.id); assert.equal(f.repo.listAssets(owner, f.workspace.id, f.project.id).length, 1);
    f.assets.invalidateVerification(f.workspace.id, f.asset.id); assert.equal(f.repo.getAsset(owner, f.workspace.id, f.project.id, f.asset.id).cloudSafe, false);
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
  } finally {await f.cleanup();}
});

test('Workspace audit retains authenticated actor and cannot be read across workspace or altered in SQLite', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.repo.recordEvent(editor, f.workspace.id, 'login', 'session'); f.repo.recordEvent(editor, f.workspace.id, 'export', f.asset.id, {recipeVersion: 1});
    f.repo.saveRecipe(editor, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body()});
    const events = f.repo.listAudit(owner, f.workspace.id); assert.ok(events.some(event => event.action === 'recipe-saved' && event.actorUserId === 'editor'));
    assert.ok(events.some(event => event.action === 'export' && event.actorUserId === 'editor'));
    assert.throws(() => f.repo.listAudit(editor, f.workspace.id), /FORBIDDEN/); assert.throws(() => f.repo.listAudit(other, f.workspace.id), /FORBIDDEN/);
    assert.throws(() => f.repo.recordEvent(editor, f.workspace.id, 'billing-changed', 'bill'), /FORBIDDEN/);
    const sql = new DatabaseSync(f.workspacePath); try {assert.throws(() => sql.exec('DELETE FROM ws_audit'), /IMMUTABLE_AUDIT/); assert.throws(() => sql.exec("UPDATE ws_audit SET actor_user_id='spoofed'"), /IMMUTABLE_AUDIT/);} finally {sql.close();}
  } finally {await f.cleanup();}
});

test('Workspace Recipe rejects invalid base and invalid payload without losing current revision', async () => {
  const f = await fixture(); try {
    const saved = f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 0, body: body()});
    for (const baseVersion of [-1, 0.5, Number.MAX_SAFE_INTEGER, 99]) assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion, body: body()}), /INVALID_REVISION|VERSION_NOT_FOUND/);
    assert.throws(() => f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion: 1, body: {schemaVersion: 1, parameters: null}}));
    assert.deepEqual(f.repo.latestRecipe(owner, f.workspace.id, f.project.id, f.asset.id), saved.version);
    assert.deepEqual(recipeDifferences({'a/b': {'~': 1}}, {'a/b': {'~': 2}}), [{path: '/a~1b/~0', before: 1, after: 2}]);
    const reopened = new WorkspaceRepository(f.workspacePath, (ws, id, deleted) => f.assets.get(ws, id, deleted));
    try {assert.deepEqual(reopened.latestRecipe(owner, f.workspace.id, f.project.id, f.asset.id), saved.version);} finally {reopened.close();}
  } finally {await f.cleanup();}
});

test('Workspace members share one registered Original reference rather than creating per-member copies', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('viewer', 'VIEWER');
    const duplicate = f.repo.registerAsset(editor, f.workspace.id, f.project.id, f.asset.id); assert.equal(duplicate.originalKey, f.asset.originalKey);
    assert.equal(f.repo.getAsset(viewer, f.workspace.id, f.project.id, f.asset.id).originalKey, f.asset.originalKey);
    assert.equal(f.repo.listAssets(editor, f.workspace.id, f.project.id).length, 1); assert.equal(f.assets.list(f.workspace.id).length, 1);
    const sql = new DatabaseSync(f.workspacePath); try {
      assert.equal(Number(sql.prepare('SELECT COUNT(*) AS n FROM ws_assets').get()!.n), 1);
      const blobColumns = (sql.prepare('PRAGMA table_info(ws_assets)').all()).filter(column => String(column.type).toUpperCase() === 'BLOB'); assert.equal(blobColumns.length, 0);
    } finally {sql.close();}
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
  } finally {await f.cleanup();}
});

test('Workspace shared Recipe keeps Crop Print DPI and JPEG TIFF PNG settings without modifying Original', async () => {
  const f = await fixture(); try {
    let baseVersion = 0;
    for (const format of ['jpeg', 'tiff', 'png'] as const) {
      const crop = {...defaultCropSettings(), preset_id: 'custom.mm', preset_name: 'Print test', width_mm: 25.4, height_mm: 25.4, crop_ratio: {width: 1, height: 1}, custom_size: true};
      const output = {...defaultExportSettings(), format, bit_depth: format === 'tiff' ? 16 : 8, preserve_alpha: format === 'png'};
      const recipe = {schemaVersion: 1, parameters: {...body().parameters, extendedParameters: {crop, export: output}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation', 'crop']}};
      const saved = f.repo.saveRecipe(owner, f.workspace.id, f.project.id, f.asset.id, {baseVersion, body: recipe}); baseVersion = saved.version.version;
      assert.deepEqual(saved.version.body, recipe); assert.equal(saved.outcome, 'saved');
    }
    assert.equal(f.repo.recipeHistory(owner, f.workspace.id, f.project.id, f.asset.id).length, 3);
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
  } finally {await f.cleanup();}
});

test('Workspace recovery reconciliation reads deleted Asset and Project state with live delete permission only', async () => {
  const f = await fixture(); try {
    f.add('editor', 'EDITOR'); f.add('viewer', 'VIEWER'); f.add('admin', 'ADMIN');
    const second = f.assets.create(f.workspace.id, {name: 'second boundary', sha256, size: bytes.length});
    f.repo.registerAsset(owner, f.workspace.id, f.project.id, second.id);
    const states = () => new Map(f.repo.registeredAssetStates(owner, f.workspace.id, f.project.id).map(value => [value.assetId, value.trashed]));
    assert.deepEqual(states(), new Map([[f.asset.id, false], [second.id, false]]));
    for (const actor of [editor, viewer, other]) assert.throws(() => f.repo.registeredAssetStates(actor, f.workspace.id, f.project.id), /FORBIDDEN/);
    f.repo.trashAsset(owner, f.workspace.id, f.project.id, f.asset.id);
    assert.deepEqual(states(), new Map([[f.asset.id, true], [second.id, false]]));
    f.repo.trashProject(owner, f.workspace.id, f.project.id);
    const auditBeforeRead = f.repo.listAudit(owner, f.workspace.id).length;
    assert.deepEqual(states(), new Map([[f.asset.id, true], [second.id, true]]));
    assert.equal(f.repo.listAudit(owner, f.workspace.id).length, auditBeforeRead);
    assert.equal(f.repo.registeredAssetStates(admin, f.workspace.id, f.project.id).length, 2);
    const b = f.repo.createWorkspace(other, 'Other'), bp = f.repo.createProject(other, b.id, 'Other');
    assert.throws(() => f.repo.registeredAssetStates(owner, f.workspace.id, bp.id), /PROJECT_NOT_FOUND/);
    f.repo.removeMember(owner, f.workspace.id, 'admin');
    assert.throws(() => f.repo.registeredAssetStates(admin, f.workspace.id, f.project.id), /FORBIDDEN/);
    f.repo.restoreProject(owner, f.workspace.id, f.project.id);
    assert.deepEqual(states(), new Map([[f.asset.id, true], [second.id, false]]));
    f.repo.restoreAsset(owner, f.workspace.id, f.project.id, f.asset.id);
    assert.deepEqual(states(), new Map([[f.asset.id, false], [second.id, false]]));
    assert.equal((await f.storage.inspect(f.asset.originalKey)).sha256, sha256);
  } finally {await f.cleanup();}
});
