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
import {WorkspacePresetClient} from '../src/workspace-preset-client.mjs';

// Synthetic non-RAW bytes: this proves the Node HTTP/SQLite contract, not RAW/Cloud.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const recipe = exposure => ({schemaVersion: 1, parameters: {exposure,
  contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'suite-full-preset-sha-'));
  const dbPath = join(dir, 'assets.sqlite');
  const assets = new AssetRepository(dbPath);
  const storage = new LocalObjectStorage(join(dir, 'objects'));
  const workspace = new WorkspaceHTTP(dir, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'full-sha-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user = 'owner-a') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'full-sha-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  async function request(path, {user = 'owner-a', method = 'GET', body} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const wid = (await request('/v1/workspaces', {method: 'POST', body: {name: 'Full SHA'}})).body.workspace.id;
  const pid = (await request(`/v1/workspaces/${wid}/projects`,
    {method: 'POST', body: {name: 'Synthetic'}})).body.project.id;
  const bytes = Buffer.from('SYNTHETIC_NON_RAW_FULL_PRESET_SHA');
  const digest = sha(bytes);
  const asset = (await request(`/v1/workspaces/${wid}/projects/${pid}/assets`,
    {method: 'POST', body: {name: 'photo.nonraw', sha256: digest, size: bytes.length}})).body.asset;
  const originalKey = workspace.workspaces.getAsset({userId: 'owner-a'}, wid,
    pid, asset.id).originalKey;
  await storage.putImmutable(originalKey, Readable.from([bytes]), {sha256: digest, size: bytes.length});
  const path = `/v1/workspaces/${wid}/projects/${pid}/assets/${asset.id}`;
  assert.equal((await request(`${path}/recipe`, {method: 'PUT',
    body: {baseVersion: 0, recipe: recipe(.2)}})).status, 200);
  const client = (user = 'owner-a') => new WorkspacePresetClient({baseURL,
    workspaceId: wid, expectedSubject: user, expectedTenantId: tenants[user],
    tokenProvider: () => token(user)});
  const preset = (await client().createPreset({scope: 'WORKSPACE', name: 'Full',
    body: recipe(.7)})).preset;
  const applyInput = (baseVersion = 1, extra = {}) => ({presetId: preset.id,
    expectedPresetVersion: preset.version, projectId: pid, assetId: asset.id,
    baseVersion, expectedOriginalSHA256: digest, ...extra});
  return {request, token, client, preset, applyInput, path, wid, pid, asset, bytes,
    digest, originalKey, storage, dbPath, workspaceDBPath: join(dir, 'workspace.sqlite'),
    async close() {await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(dir, {recursive: true, force: true});}};
}

test('FULL-SHA-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: optional pinned SHA, Preset version and Recipe CAS commit exactly one Full version', async () => {
  const f = await fixture();
  try {
    const result = await f.client().applyPresetVersioned(f.applyInput());
    assert.equal(result.outcome, 'saved');
    assert.equal(result.version.version, 2);
    assert.equal(result.version.branch, false);
    assert.equal(result.version.body.parameters.exposure, .7);
    assert.equal(result.version.presetSnapshot.version, f.preset.version);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256: f.digest, size: f.bytes.length, persisted: true});
    assert.equal((await f.request(`${f.path}/recipe`)).body.recipe.version, 2);
  } finally {await f.close();}
});

test('FULL-SHA-02 / REAL_JWT_HTTP_SQLITE: changed Asset SHA metadata rejects pinned request without a branch or Original write', async () => {
  const f = await fixture();
  try {
    const wrongClaim = await f.request(`${f.path}/preset`, {method: 'POST', body: {
      baseVersion: 1, presetId: f.preset.id,
      expectedPresetVersion: f.preset.version, expectedOriginalSHA256: '0'.repeat(64)}});
    assert.equal(wrongClaim.status, 409);
    assert.equal(wrongClaim.body.error, 'ORIGINAL_IDENTITY_CONFLICT');
    // Simulates an external metadata corruption between the host's read and
    // Full Apply; the real Original object remains byte-for-byte untouched.
    const mutation = new DatabaseSync(f.dbPath);
    mutation.prepare('UPDATE assets SET sha256=? WHERE id=?').run('a'.repeat(64), f.asset.id);
    mutation.close();
    const response = await f.request(`${f.path}/preset`, {method: 'POST', body: {
      baseVersion: 1, presetId: f.preset.id,
      expectedPresetVersion: f.preset.version, expectedOriginalSHA256: f.digest}});
    assert.equal(response.status, 503, JSON.stringify(response.body));
    assert.equal(response.body.error, 'OPERATION_UNAVAILABLE',
      'existing Workspace registry identity gate refuses corrupted Asset metadata first');
    const historyDB = new DatabaseSync(f.workspaceDBPath);
    const versions = historyDB.prepare('SELECT version,branch FROM ws_recipe_versions WHERE asset_id=? ORDER BY version')
      .all(f.asset.id);
    historyDB.close();
    assert.deepEqual(versions.map(v => ({version: v.version, branch: v.branch})),
      [{version: 1, branch: 0}]);
    assert.deepEqual(await f.storage.inspect(f.originalKey),
      {sha256: f.digest, size: f.bytes.length, persisted: true});
    await assert.rejects(f.client().applyPresetVersioned(f.applyInput(1,
      {expectedOriginalSHA256: 'bad'})), /WORKSPACE_PRESET_ORIGINAL_SHA_INVALID/);
  } finally {await f.close();}
});

test('FULL-SHA-03 / REAL_JWT_HTTP_SQLITE: stale Preset, racing Recipe CAS and invalid role reject pinned Full without conflict branch', async () => {
  const f = await fixture();
  try {
    const updated = await f.request(`/v1/workspaces/${f.wid}/presets/${f.preset.id}`,
      {method: 'PATCH', body: {baseVersion: 1, name: 'Full v2', body: recipe(.8)}});
    assert.equal(updated.status, 200);
    const stale = await f.request(`${f.path}/preset`, {method: 'POST', body: {
      baseVersion: 1, presetId: f.preset.id, expectedPresetVersion: 1,
      expectedOriginalSHA256: f.digest}});
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'PRESET_VERSION_CONFLICT');
    const pinned = {...f.applyInput(), expectedPresetVersion: 2};
    const [first, second] = await Promise.allSettled([
      f.client().applyPresetVersioned(pinned), f.client().applyPresetVersioned(pinned)]);
    assert.equal([first, second].filter(item => item.status === 'fulfilled').length, 1);
    assert.equal([first, second].filter(item => item.status === 'rejected').length, 1);
    assert.deepEqual((await f.request(`${f.path}/versions`)).body.versions.map(v => v.version), [1, 2]);
    assert.ok((await f.request(`${f.path}/versions`)).body.versions.every(v => v.branch === false));
    const invite = await f.request(`/v1/workspaces/${f.wid}/invitations`,
      {method: 'POST', body: {email: 'owner-b@example.test', role: 'VIEWER',
        expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    await assert.rejects(f.client('owner-b').applyPresetVersioned({...pinned, baseVersion: 2}),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(f.client('owner-b').applyPresetVersioned({...pinned, baseVersion: 2}),
      error => error.status === 403);
    assert.deepEqual((await f.request(`${f.path}/versions`)).body.versions.map(v => v.version), [1, 2]);
  } finally {await f.close();}
});

test('FULL-SHA-04 / LEGACY_REAL_JWT_HTTP_SQLITE: omitted SHA remains accepted but has no new atomic SHA guarantee', async () => {
  const f = await fixture();
  try {
    const legacy = await f.client().applyPresetVersioned({presetId: f.preset.id,
      expectedPresetVersion: f.preset.version, projectId: f.pid, assetId: f.asset.id,
      baseVersion: 1});
    assert.equal(legacy.outcome, 'saved');
    assert.equal(legacy.version.version, 2);
    assert.equal(legacy.version.branch, false);
    const conflict = await f.request(`${f.path}/preset`, {method: 'POST', body: {
      baseVersion: 1, presetId: f.preset.id, expectedPresetVersion: f.preset.version}});
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.outcome, 'conflict', 'legacy branch behavior intentionally unchanged');
    assert.equal(conflict.body.version.branch, true);
    assert.equal((await f.request(`${f.path}/recipe`)).body.recipe.version, 2);
  } finally {await f.close();}
});
