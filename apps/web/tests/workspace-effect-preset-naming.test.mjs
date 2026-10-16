import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {readWorkspaceEffectPresetNamingInput} from '../src/workspace-effect-preset-naming.mjs';
import {buildExportFilenameFromForm} from '../src/export-naming-form.mjs';

// Real local JWT/HTTP/SQLite with synthetic non-RAW bytes, not Cloud or RAW.
const recipe = exposure => ({schemaVersion: 1, parameters: {exposure,
  contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'suite-effect-naming-'));
  const dbPath = join(dir, 'assets.sqlite');
  const assets = new AssetRepository(dbPath);
  const storage = new LocalObjectStorage(join(dir, 'objects'));
  const workspace = new WorkspaceHTTP(dir, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'effect-naming';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenant = {owner: 'tenant-owner', viewer: 'tenant-viewer', outsider: 'wrong-tenant'};
  const token = (subject = 'owner', expiration = '5m') => new SignJWT({
    tenant_id: tenant[subject], email: `${subject}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'effect-naming'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(subject)
    .setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  async function request(path, {subject = 'owner', method = 'GET', body} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(subject)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const wid = (await request('/v1/workspaces', {method: 'POST',
    body: {name: 'Effect naming'}})).body.workspace.id;
  const pid = (await request(`/v1/workspaces/${wid}/projects`, {method: 'POST',
    body: {name: 'Synthetic'}})).body.project.id;
  const bytes = Buffer.from('SYNTHETIC_NON_RAW_EFFECT_NAMING');
  const sha256 = digest(bytes);
  const asset = (await request(`/v1/workspaces/${wid}/projects/${pid}/assets`,
    {method: 'POST', body: {name: 'photo.nonraw', sha256, size: bytes.length}})).body.asset;
  const originalKey = workspace.workspaces.getAsset({userId: 'owner'}, wid, pid, asset.id).originalKey;
  await storage.putImmutable(originalKey, Readable.from([bytes]), {sha256, size: bytes.length});
  assets.markVerified(wid, asset.id, await storage.inspect(originalKey));
  const root = `/v1/workspaces/${wid}`;
  const assetPath = `${root}/projects/${pid}/assets/${asset.id}`;
  assert.equal((await request(`${assetPath}/recipe`, {method: 'PUT',
    body: {baseVersion: 0, recipe: recipe(.2)}})).status, 200);
  const preset = (await request(`${root}/presets`, {method: 'POST',
    body: {scope: 'WORKSPACE', name: 'Soft Light', body: recipe(.7)}})).body.preset;
  const readState = async () => {
    const saved = (await request(`${assetPath}/recipe`)).body.recipe;
    const current = (await request(`${root}/projects/${pid}/assets`)).body.assets.find(a => a.id === asset.id);
    return {asset: current, revision: saved.version, recipe: saved.body, dirty: false};
  };
  const options = (state, method = 'original-effect-preset', more = {}) => ({baseURL,
    workspaceId: wid, projectId: pid, expectedSubject: 'owner',
    expectedTenantId: tenant.owner, tokenProvider: () => token(), state, method, ...more});
  const apply = async (baseVersion = 1) => request(`${assetPath}/preset`, {method: 'POST',
    body: {baseVersion, presetId: preset.id, expectedPresetVersion: preset.version,
      expectedOriginalSHA256: sha256}});
  return {dir, dbPath, assets, storage, workspace, server, baseURL, token, request,
    wid, pid, asset, bytes, sha256, originalKey, root, assetPath, preset,
    readState, options, apply,
    async close() {await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(dir, {recursive: true, force: true});}};
}

test('EFFECT-NAMING-01 / real JWT HTTP SQLite: applied current preset supplies both safe name methods, catalogue alone cannot', async () => {
  const f = await fixture();
  try {
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(await f.readState())),
      /WORKSPACE_EFFECT_NAMING_SAVED_RECIPE_UNAVAILABLE/);
    assert.equal((await f.apply()).status, 200);
    const state = await f.readState();
    const original = await readWorkspaceEffectPresetNamingInput(f.options(state));
    assert.deepEqual(original.namingContext, {originalFilename: f.asset.name,
      effectPresetName: 'Soft Light'});
    assert.equal(original.binding.originalSHA256, f.sha256);
    assert.equal(original.binding.savedRevision, 2);
    assert.equal(original.verification, 'WORKSPACE_EFFECT_PRESET_NAME_NOT_FINAL_AUTHORITY');
    assert.equal(buildExportFilenameFromForm({...original.namingContext,
      method: 'original-effect-preset', format: 'png'}), 'photo_Soft Light.png');
    const custom = await readWorkspaceEffectPresetNamingInput(f.options(state, 'original-effect-custom'));
    assert.equal(buildExportFilenameFromForm({...custom.namingContext,
      method: 'original-effect-custom', format: 'jpeg', customText: 'Print'}),
    'photo_Soft Light_Print.jpg');
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256: f.sha256, size: f.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('EFFECT-NAMING-02 / clean saved version, branch and current Preset version are mandatory', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.apply()).status, 200);
    const state = await f.readState();
    for (const changed of [{...state, dirty: true}, {...state, revision: 1},
      {...state, asset: {...state.asset, sha256: 'a'.repeat(64)}},
      {...state, recipe: recipe(.9)}])
      await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(changed)));
    const branched = await f.request(`${f.assetPath}/recipe`, {method: 'PUT',
      body: {baseVersion: 1, recipe: recipe(.3)}});
    assert.equal(branched.status, 409);
    assert.equal(branched.body.version.branch, true);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options({...state,
      revision: branched.body.version.version, recipe: branched.body.version.body})),
    /WORKSPACE_EFFECT_NAMING_SAVED_RECIPE_UNAVAILABLE/);
    const updated = await f.request(`${f.root}/presets/${f.preset.id}`, {method: 'PATCH',
      body: {baseVersion: 1, name: 'Different', body: recipe(.8)}});
    assert.equal(updated.status, 200);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state)),
      /WORKSPACE_EFFECT_NAMING_PRESET_CHANGED/);
  } finally {await f.close();}
});

test('EFFECT-NAMING-03 / viewer, removed member, wrong tenant and expired JWT never mint evidence', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.apply()).status, 200);
    const state = await f.readState();
    const invite = await f.request(`${f.root}/invitations`, {method: 'POST', body: {
      email: 'viewer@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`${f.root}/invitations/accept`, {subject: 'viewer',
      method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.options(state, undefined, {expectedSubject: 'viewer',
      expectedTenantId: 'tenant-viewer', tokenProvider: () => f.token('viewer')});
    await assert.rejects(readWorkspaceEffectPresetNamingInput(viewer),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state, undefined,
      {expectedTenantId: 'wrong-tenant'})), /WORKSPACE_SESSION_IDENTITY_CHANGED/);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state, undefined,
      {tokenProvider: () => f.token('owner', '-10s')})));
    assert.equal((await f.request(`${f.root}/members/viewer`, {method: 'DELETE'})).status, 200);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(viewer));
  } finally {await f.close();}
});

test('EFFECT-NAMING-04 / live registry identity change and abort fail closed', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.apply()).status, 200);
    const state = await f.readState();
    const controller = new AbortController(); controller.abort();
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state, undefined,
      {signal: controller.signal})), {name: 'AbortError'});
    f.assets.invalidateVerification(f.wid, f.asset.id);
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state)),
      /WORKSPACE_EFFECT_NAMING_ASSET_CHANGED/);
    f.assets.markVerified(f.wid, f.asset.id, await f.storage.inspect(f.originalKey));
    const db = new DatabaseSync(f.dbPath);
    db.prepare('UPDATE assets SET sha256=? WHERE id=?').run('b'.repeat(64), f.asset.id);
    db.close();
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state)),
      /WORKSPACE_EFFECT_NAMING_AUTHORITY_UNAVAILABLE/);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256: f.sha256, size: f.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('EFFECT-NAMING-05 / a selection changed during the fresh reads cannot mint a stale name', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.apply()).status, 200);
    const state = await f.readState();
    let presetReads = 0;
    const fetchImpl = async (url, init) => {
      const response = await fetch(url, init);
      if (String(url).endsWith(`/presets/${f.preset.id}`) && ++presetReads === 2)
        state.dirty = true;
      return response;
    };
    await assert.rejects(readWorkspaceEffectPresetNamingInput(f.options(state, undefined,
      {fetchImpl})), /WORKSPACE_EFFECT_NAMING_STATE_CHANGED/);
    assert.equal(presetReads, 2);
  } finally {await f.close();}
});
