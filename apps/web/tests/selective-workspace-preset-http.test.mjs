import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspacePresetClient, WorkspacePresetHTTPError} from '../src/workspace-preset-client.mjs';

// Synthetic bytes only: no RAW decoder, production OIDC host, Chrome or Cloud.
const families = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas',
  'whites', 'neutrals', 'blacks'];
const controls = ['cyan', 'magenta', 'yellow', 'black'];
const selective = method => ({method, ranges: Object.fromEntries(families.map((name, i) =>
  [name, Object.fromEntries(controls.map((control, j) => [control, (i * 17 + j * 13) % 101 - 50]))]))});
const calibration = {red: {hue: 14, saturation: -25}, green: {hue: -8, saturation: 21},
  blue: {hue: 9, saturation: 30}};
const glow = {mode: 'halation', intensity: 40, radius: 8, threshold: 112,
  exposure: 14, diffusion: 30, tint: -4};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const selectOf = body => body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor;
const clone = value => structuredClone(value);

function recipe({selectiveColor, exposure = 0, rich = false, boundAsset, boundSHA} = {}) {
  const extra = {};
  if (selectiveColor || rich) extra.postDecodeAdjustments = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1', color: {
      ...(selectiveColor ? {selectiveColor: clone(selectiveColor)} : {}),
      ...(rich ? {calibration: clone(calibration), glow: clone(glow)} : {})},
    ...(rich ? {detail: {sharpness: 31}} : {})};
  if (boundAsset) extra.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: boundAsset, originalSHA256: boundSHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}],
    correctionStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1, hardness: 1}]};
  return {schemaVersion: 1, parameters: {exposure, contrast: rich ? 1.2 : 1,
    saturation: rich ? .8 : 1, rotationDegrees: 0, extendedParameters: extra,
    processingOrder: extra.postDecodeAdjustments ? ['exposure', 'contrast', 'saturation',
      'postDecodeAdjustments', 'rotation'] : ['exposure', 'contrast', 'saturation', 'rotation']}};
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-selective-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'selective-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user = 'owner-a') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'selective-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  async function request(path, {user = 'owner-a', method = 'GET', body} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const wid = (await request('/v1/workspaces', {method: 'POST',
    body: {name: 'Selective'}})).body.workspace.id;
  const pid = (await request(`/v1/workspaces/${wid}/projects`, {method: 'POST',
    body: {name: 'Synthetic'}})).body.project.id;
  async function asset(name, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_${name}`);
    const sha256 = hash(bytes);
    const created = (await request(`/v1/workspaces/${wid}/projects/${pid}/assets`,
      {method: 'POST', body: {name, size: bytes.length, sha256}})).body.asset;
    const originalKey = workspace.workspaces.getAsset({userId: 'owner-a'},
      wid, pid, created.id).originalKey;
    await storage.putImmutable(originalKey, Readable.from([bytes]),
      {sha256, size: bytes.length});
    if (body) assert.equal((await request(`/v1/workspaces/${wid}/projects/${pid}/assets/${created.id}/recipe`,
      {method: 'PUT', body: {baseVersion: 0, recipe: body}})).status, 200);
    return {...created, bytes, originalKey};
  }
  const source = await asset('source.nonraw', recipe({selectiveColor: selective('relative')}));
  const target = await asset('target.nonraw', null);
  const targetPath = `/v1/workspaces/${wid}/projects/${pid}/assets/${target.id}`;
  const client = (user = 'owner-a', overrides = {}) => new WorkspacePresetClient({baseURL,
    workspaceId: wid, expectedSubject: user, expectedTenantId: tenants[user],
    tokenProvider: () => token(user), ...overrides});
  const input = (preset, baseVersion, originalSHA = target.sha256) => ({presetId: preset.id,
    expectedPresetVersion: preset.version, projectId: pid, assetId: target.id,
    baseVersion, expectedOriginalSHA256: originalSHA});
  return {request, client, token, wid, pid, source, target, targetPath, input, storage,
    async close() {await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});}};
}
const rejects = (code, http) => error => error instanceof WorkspacePresetHTTPError &&
  error.status === http && error.code === code;

test('SELECTIVE-WS-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: both modes, nine CMYK families, Personal/Workspace Full Save→Reload→Apply', async () => {
  const f = await fixture();
  try {
    const client = f.client(); let revision = 0;
    for (const [scope, method] of [['PERSONAL', 'relative'], ['WORKSPACE', 'absolute']]) {
      const body = recipe({selectiveColor: selective(method)});
      const created = (await client.createPreset({scope, name: `${scope} ${method}`, body})).preset;
      const loaded = (await client.getPreset(created.id)).preset;
      assert.deepEqual(selectOf(loaded.body), selective(method));
      for (const family of families) assert.deepEqual(Object.keys(selectOf(loaded.body).ranges[family]), controls);
      const applied = await client.applyPresetVersioned(f.input(loaded, revision));
      assert.equal(applied.outcome, 'saved');
      assert.deepEqual(selectOf(applied.version.body), selective(method));
      assert.deepEqual(selectOf(applied.version.presetSnapshot.body), selective(method));
      revision = applied.version.version;
      assert.deepEqual(selectOf((await f.request(`${f.targetPath}/recipe`)).body.recipe.body), selective(method));
    }
    assert.deepEqual(await f.storage.inspect(f.target.originalKey),
      {sha256: f.target.sha256, size: f.target.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('SELECTIVE-WS-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: atomic Selective-only retains unrelated and photo-bound target edits', async () => {
  const f = await fixture();
  try {
    const targetBody = recipe({selectiveColor: selective('absolute'), exposure: .7,
      rich: true, boundAsset: f.target.id, boundSHA: f.target.sha256});
    assert.equal((await f.request(`${f.targetPath}/recipe`, {method: 'PUT',
      body: {baseVersion: 0, recipe: targetBody}})).status, 200);
    const pure = recipe({selectiveColor: selective('relative')});
    const preset = (await f.client().createPreset({scope: 'PERSONAL', name: 'Only Selective',
      body: pure})).preset;
    const applied = await f.client().applySelectivePresetVersioned(f.input(preset, 1));
    assert.equal(applied.outcome, 'saved');
    assert.equal(applied.version.branch, false);
    assert.deepEqual(selectOf(applied.version.body), selective('relative'));
    const expected = clone(targetBody);
    expected.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor = selective('relative');
    assert.deepEqual(applied.version.body, expected);
    const stored = (await f.request(`${f.targetPath}/recipe`)).body.recipe;
    assert.equal(stored.version, 2);
    assert.deepEqual(stored.body, expected);
    assert.deepEqual(await f.storage.inspect(f.target.originalKey),
      {sha256: f.target.sha256, size: f.target.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('SELECTIVE-WS-03 / REAL_JWT_HTTP_SQLITE: stale Recipe/Preset/SHA, racing CAS and impure/partial/photo-bound presets fail without branch', async () => {
  const f = await fixture();
  try {
    const api = f.client();
    const targetBody = recipe({exposure: .2});
    assert.equal((await f.request(`${f.targetPath}/recipe`, {method: 'PUT',
      body: {baseVersion: 0, recipe: targetBody}})).status, 200);
    const preset = (await api.createPreset({scope: 'PERSONAL', name: 'Pinned',
      body: recipe({selectiveColor: selective('relative')})})).preset;
    await assert.rejects(api.applySelectivePresetVersioned(f.input(preset, 0)),
      /WORKSPACE_SELECTIVE_PRESET_INPUT_INVALID/);
    await assert.rejects(api.applySelectivePresetVersioned(f.input(preset, 1, '0'.repeat(64))),
      rejects('ORIGINAL_IDENTITY_CONFLICT', 409));
    const stalePreset = {...f.input(preset, 1), expectedPresetVersion: preset.version + 1};
    await assert.rejects(api.applySelectivePresetVersioned(stalePreset),
      rejects('PRESET_VERSION_CONFLICT', 409));
    const first = await api.applySelectivePresetVersioned(f.input(preset, 1));
    assert.equal(first.version.version, 2);
    await assert.rejects(api.applySelectivePresetVersioned(f.input(preset, 1)),
      rejects('RECIPE_VERSION_CONFLICT', 409));
    const changed = (await api.updatePreset(preset.id, {baseVersion: 1,
      name: 'Updated', body: preset.body})).preset;
    assert.equal(changed.version, 2);
    await assert.rejects(api.applySelectivePresetVersioned(f.input(preset, 2)),
      rejects('PRESET_VERSION_CONFLICT', 409));
    for (const body of [recipe({selectiveColor: selective('relative'), exposure: .4}),
      recipe({selectiveColor: {ranges: {reds: {cyan: 5}}}})]) {
      const other = (await api.createPreset({scope: 'PERSONAL', name: 'Not pure', body})).preset;
      await assert.rejects(api.applySelectivePresetVersioned(f.input(other, 2)),
        rejects('INVALID_SELECTIVE_ONLY_PRESET', 400));
    }
    await assert.rejects(api.createPreset({scope: 'PERSONAL', name: 'Bound', body: recipe({
      selectiveColor: selective('relative'), boundAsset: f.target.id,
      boundSHA: f.target.sha256})}), /PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN/);
    const versions = (await f.request(`${f.targetPath}/versions`)).body.versions;
    assert.deepEqual(versions.map(row => row.version), [1, 2]);
    assert.ok(versions.every(row => row.branch === false));
  } finally {await f.close();}
});

test('SELECTIVE-WS-04 / REAL_JWT_HTTP_SQLITE: viewer/revocation, Personal isolation, unknown scope and missing JWT fail closed', async () => {
  const f = await fixture();
  try {
    const api = f.client();
    const body = recipe({selectiveColor: selective('absolute')});
    const personal = (await api.createPreset({scope: 'PERSONAL', name: 'Private', body})).preset;
    const shared = (await api.createPreset({scope: 'WORKSPACE', name: 'Shared', body})).preset;
    assert.equal((await f.request(`${f.targetPath}/recipe`, {method: 'PUT',
      body: {baseVersion: 0, recipe: recipe({})}})).status, 200);
    const invite = await f.request(`/v1/workspaces/${f.wid}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.client('owner-b');
    await assert.rejects(viewer.getPreset(personal.id), error => error.status === 404);
    await assert.rejects(viewer.applySelectivePresetVersioned(f.input(shared, 1)),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.listPresets(), error => error.status === 403);
    const badAsset = {...f.input(shared, 1), assetId: randomUUID()};
    await assert.rejects(api.applySelectivePresetVersioned(badAsset),
      error => error.status === 404);
    const invalid = f.client('owner-a', {tokenProvider: () => 'not-a-jwt'});
    await assert.rejects(invalid.applySelectivePresetVersioned(f.input(shared, 1)),
      error => error.status === 401);
    assert.equal((await f.request(`${f.targetPath}/recipe`)).body.recipe.version, 1);
  } finally {await f.close();}
});
