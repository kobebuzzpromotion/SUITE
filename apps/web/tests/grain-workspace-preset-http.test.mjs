import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspacePresetClient, WorkspacePresetHTTPError} from '../src/workspace-preset-client.mjs';

const grain = {amount: 47, seed: 0x12345678, shadows: 11, midtones: 22,
  highlights: 33, size: 44, roughness: 55, colorVariation: 66};
const oldGrain = {amount: 13, seed: 9, shadows: 1, midtones: 2,
  highlights: 3, size: 4, roughness: 5, colorVariation: 6};
const recipe = ({exposure = 0, contrast = 1, saturation = 1, grainValue = null} = {}) => ({
  schemaVersion: 1, parameters: {exposure, contrast, saturation, rotationDegrees: 0,
    extendedParameters: grainValue === null ? {} : {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
      detail: {grain: structuredClone(grainValue)}}},
    processingOrder: grainValue === null ? ['exposure', 'contrast', 'saturation', 'rotation'] :
      ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']}});
const grainOf = body => body.parameters.extendedParameters.postDecodeAdjustments.detail.grain;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-grain-ws-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'grain-ws-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'personal-a', 'owner-b': 'personal-b'};
  const token = (user, expiry = '5m') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'grain-ws-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path, {user = 'owner-a', method = 'GET', body} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const wid = (await request('/v1/workspaces', {method: 'POST', body: {name: 'Grain Workspace'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${wid}/projects`, {method: 'POST',
    body: {name: 'Synthetic'}})).body.project.id;
  const bytes = Buffer.from('SYNTHETIC_NON_RAW_GRAIN_WORKSPACE_PRESET');
  const originalSHA256 = createHash('sha256').update(bytes).digest('hex');
  const assetId = (await request(`/v1/workspaces/${wid}/projects/${projectId}/assets`, {method: 'POST',
    body: {name: 'synthetic.nonraw', size: bytes.length, sha256: originalSHA256}})).body.asset.id;
  const assetPath = `/v1/workspaces/${wid}/projects/${projectId}/assets/${assetId}`;
  const client = (user = 'owner-a', overrides = {}) => new WorkspacePresetClient({baseURL,
    workspaceId: wid, expectedSubject: user, expectedTenantId: tenants[user],
    tokenProvider: () => token(user), ...overrides});
  return {wid, projectId, assetId, assetPath, originalSHA256, request, client,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
    }};
}

const applyInput = (f, preset, baseVersion) => ({presetId: preset.id,
  expectedPresetVersion: preset.version, projectId: f.projectId, assetId: f.assetId,
  baseVersion, expectedOriginalSHA256: f.originalSHA256});
const status = (code, http) => error => error instanceof WorkspacePresetHTTPError &&
  error.status === http && error.code === code;

test('GRAIN-WS-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: Personal and Workspace full save/reload/apply retain seven controls plus seed', async () => {
  const f = await fixture();
  try {
    const client = f.client();
    let revision = 0;
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const created = (await client.createPreset({scope, name: `${scope} Grain`, body: recipe({grainValue: grain})})).preset;
      assert.deepEqual(grainOf(created.body), grain);
      const reloaded = (await client.getPreset(created.id)).preset;
      assert.deepEqual(grainOf(reloaded.body), grain);
      const applied = await client.applyPresetVersioned({...applyInput(f, reloaded, revision)});
      assert.deepEqual(grainOf(applied.version.body), grain);
      assert.deepEqual(grainOf(applied.version.presetSnapshot.body), grain);
      revision = applied.version.version;
      assert.deepEqual(grainOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body), grain);
    }
  } finally {await f.close();}
});

test('GRAIN-WS-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: Grain-only applies pinned values, preserving target global adjustments and history', async () => {
  const f = await fixture();
  try {
    const client = f.client();
    const target = recipe({exposure: .35, contrast: 1.2, saturation: .8, grainValue: oldGrain});
    const saved = await f.request(`${f.assetPath}/recipe`, {method: 'PUT', body: {baseVersion: 0, recipe: target}});
    assert.equal(saved.status, 200);
    let revision = saved.body.version.version;
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const preset = (await client.createPreset({scope, name: `${scope} Only Grain`,
        body: recipe({grainValue: grain})})).preset;
      const reloaded = (await client.getPreset(preset.id)).preset;
      assert.deepEqual(grainOf(reloaded.body), grain);
      const result = await client.applyGrainPresetVersioned(applyInput(f, reloaded, revision));
      assert.equal(result.outcome, 'saved');
      assert.equal(result.version.branch, false);
      assert.deepEqual(grainOf(result.version.body), grain);
      assert.deepEqual(grainOf(result.version.presetSnapshot.body), grain);
      assert.equal(result.version.body.parameters.exposure, .35);
      assert.equal(result.version.body.parameters.contrast, 1.2);
      assert.equal(result.version.body.parameters.saturation, .8);
      revision = result.version.version;
    }
    const loaded = (await f.request(`${f.assetPath}/recipe`)).body.recipe;
    assert.equal(loaded.version, 3);
    assert.deepEqual(grainOf(loaded.body), grain);
    const history = (await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.deepEqual(grainOf(history[0].body), oldGrain);
    assert.deepEqual(grainOf(history[1].body), grain);
    assert.deepEqual(grainOf(history[2].body), grain);
  } finally {await f.close();}
});

test('GRAIN-WS-03 / REAL_JWT_HTTP_SQLITE: stale preset/Recipe/SHA and simultaneous CAS reject without a branch', async () => {
  const f = await fixture();
  try {
    const client = f.client();
    const preset = (await client.createPreset({scope: 'WORKSPACE', name: 'Grain v1',
      body: recipe({grainValue: grain})})).preset;
    const saved = await f.request(`${f.assetPath}/recipe`, {method: 'PUT',
      body: {baseVersion: 0, recipe: recipe({exposure: .6})}});
    assert.equal(saved.status, 200);
    const updated = (await client.updatePreset(preset.id, {baseVersion: 1, name: 'Grain v2',
      body: recipe({grainValue: {...grain, size: 77}})})).preset;
    const current = applyInput(f, updated, 1);
    await assert.rejects(client.applyGrainPresetVersioned({...current, expectedPresetVersion: 1}),
      status('PRESET_VERSION_CONFLICT', 409));
    await assert.rejects(client.applyGrainPresetVersioned({...current, expectedOriginalSHA256: 'a'.repeat(64)}),
      status('ORIGINAL_IDENTITY_CONFLICT', 409));
    await assert.rejects(client.applyGrainPresetVersioned({...current, baseVersion: 2}),
      status('RECIPE_VERSION_CONFLICT', 409));
    const results = await Promise.allSettled([
      client.applyGrainPresetVersioned(current), client.applyGrainPresetVersioned(current),
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter(item => item.status === 'rejected').length, 1);
    assert.deepEqual(grainOf((await f.request(`${f.assetPath}/recipe`)).body.recipe.body),
      {...grain, size: 77});
    const history = (await f.request(`${f.assetPath}/versions`)).body.versions;
    assert.equal(history.length, 2);
    assert.ok(history.every(item => item.branch === false));
  } finally {await f.close();}
});

test('GRAIN-WS-04 / REAL_JWT_HTTP_SQLITE: Viewer, revoked member, other Personal and missing grain reject', async () => {
  const f = await fixture();
  try {
    const owner = f.client();
    const preset = (await owner.createPreset({scope: 'WORKSPACE', name: 'Grain',
      body: recipe({grainValue: grain})})).preset;
    const personal = (await owner.createPreset({scope: 'PERSONAL', name: 'Private',
      body: recipe({grainValue: grain})})).preset;
    const invalid = (await owner.createPreset({scope: 'WORKSPACE', name: 'No Grain', body: recipe()})).preset;
    await f.request(`${f.assetPath}/recipe`, {method: 'PUT', body: {baseVersion: 0, recipe: recipe()}});
    const bad = applyInput(f, invalid, 1);
    await assert.rejects(owner.applyGrainPresetVersioned(bad), status('INVALID_GRAIN_ONLY_PRESET', 400));
    const invite = await f.request(`/v1/workspaces/${f.wid}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`, {user: 'owner-b',
      method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.client('owner-b');
    await assert.rejects(viewer.getPreset(personal.id), status('PRESET_NOT_FOUND', 404));
    await assert.rejects(viewer.applyGrainPresetVersioned(applyInput(f, preset, 1)),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`, {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.listPresets(), error => error.status === 403);
    assert.equal((await f.request(`${f.assetPath}/recipe`)).body.recipe.version, 1);
  } finally {await f.close();}
});

test('GRAIN-WS-05: legacy two-field full Preset stays valid; Grain-only demands all seven controls and seed', async () => {
  const f = await fixture();
  try {
    const client = f.client();
    const legacy = {amount: 23, seed: 17};
    const preset = (await client.createPreset({scope: 'PERSONAL', name: 'Legacy',
      body: recipe({grainValue: legacy})})).preset;
    assert.deepEqual(grainOf((await client.getPreset(preset.id)).preset.body), legacy);
    await f.request(`${f.assetPath}/recipe`, {method: 'PUT', body: {baseVersion: 0, recipe: recipe()}});
    await assert.rejects(client.applyGrainPresetVersioned(applyInput(f, preset, 1)),
      status('INVALID_GRAIN_ONLY_PRESET', 400));
    const full = await client.applyPresetVersioned({...applyInput(f, preset, 1)});
    assert.deepEqual(grainOf(full.version.body), legacy);
  } finally {await f.close();}
});
