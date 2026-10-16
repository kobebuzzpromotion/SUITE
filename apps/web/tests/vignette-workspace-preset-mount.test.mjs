import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {build} from 'esbuild-wasm';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {mountVignetteWorkspacePreset} from '../src/vignette-workspace-preset-mount.mjs';

const FIVE = {amount: -35, midpoint: 37, roundness: -20, feather: 83, highlights: 19};
const vignetteOf = body => body.parameters.extendedParameters.postCropAdjustments.vignette;
function recipe({exposure = 0, vignette} = {}) {
  return {schemaVersion: 1, parameters: {exposure, contrast: 1, saturation: 1,
    rotationDegrees: 0, extendedParameters: vignette ? {postCropAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1', vignette}} : {},
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
}
function dom() {
  const controls = new Map();
  const node = () => ({value: '', textContent: '', disabled: false,
    addEventListener(type, handler) {this[`on${type}`] = handler;},
    replaceChildren() {this.children = [];},
    append(item) {(this.children ??= []).push(item);}});
  const buttons = ['save', 'refresh', 'apply'].map(key => {
    const button = node(); controls.set(`[data-vignette-preset-${key}]`, button); return button;
  });
  for (const key of ['scope', 'name', 'list', 'status'])
    controls.set(`[data-vignette-preset-${key}]`, node());
  controls.get('[data-vignette-preset-scope]').value = 'PERSONAL';
  const panel = {className: '', innerHTML: '', querySelector: key => controls.get(key),
    querySelectorAll: key => key === 'button' ? buttons : []};
  const documentRef = {createElement: tag => tag === 'section' ? panel : node()};
  const container = {children: [], replaceChildren(...items) {this.children = items;}};
  return {documentRef, container, controls};
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-vignette-ws-mount-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'vignette-mount-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolveServer, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolveServer);
  });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user, expiry = '5m') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'vignette-mount-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path, {method = 'GET', body, user = 'owner-a'} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const workspaceId = (await request('/v1/workspaces', {method: 'POST',
    body: {name: 'Vignette'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${workspaceId}/projects`,
    {method: 'POST', body: {name: 'Synthetic'}})).body.project.id;
  async function asset(name, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_${name}`);
    const registered = (await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
      {method: 'POST', body: {name, size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')}})).body.asset;
    const saved = await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${registered.id}/recipe`,
      {method: 'PUT', body: {baseVersion: 0, recipe: body}});
    assert.equal(saved.status, 200);
    return registered;
  }
  const source = await asset('source.nonraw', recipe({vignette: FIVE}));
  const target = await asset('target.nonraw', recipe({exposure: .65, vignette: {amount: 12}}));
  let selectedAssetId = source.id;
  const selectionProvider = () => ({workspaceId, projectId, assetId: selectedAssetId});
  const mount = (overrides = {}) => {
    const ui = dom();
    const instance = mountVignetteWorkspacePreset({...ui, baseURL, workspaceId, projectId,
      expectedSubject: 'owner-a', expectedTenantId: tenants['owner-a'],
      tokenProvider: () => token('owner-a'), selectionProvider, ...overrides});
    return {instance, ui};
  };
  return {request, token, workspaceId, projectId, source, target, mount,
    select(id) {selectedAssetId = id;},
    async close() {
      await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
      workspace.close(); assets.close();
      const targetPath = resolve(root), base = resolve(tmpdir()) + sep;
      if (!targetPath.startsWith(base) ||
          !targetPath.split(sep).at(-1).startsWith('suite-vignette-ws-mount-'))
        throw Error('VIGNETTE_TEST_CLEANUP_TARGET_INVALID');
      await rm(targetPath, {recursive: true, force: true});
    }};
}
const recipePath = (f, asset) => `/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets/${asset.id}/recipe`;

test('VIGNETTE-MOUNT-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: both scopes save/reload five controls and only-apply keeps other edits', async () => {
  const f = await fixture();
  try {
    const {instance, ui} = f.mount();
    assert.equal(ui.container.children.length, 1);
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const saved = await instance.save({kind, name: `${kind} Vignette`});
      assert.deepEqual(vignetteOf(saved.recipe), FIVE);
      assert.deepEqual(vignetteOf((await instance.reload({kind, id: saved.id})).recipe), FIVE);
      assert.ok((await instance.list({kind})).some(item => item.id === saved.id));
      f.select(f.target.id);
      const result = await instance.apply({kind, id: saved.id, version: saved.version});
      assert.equal(result.outcome, 'saved');
      assert.deepEqual(vignetteOf(result.recipe), FIVE);
      assert.equal(result.recipe.parameters.exposure, .65);
      const remote = (await f.request(recipePath(f, f.target))).body.recipe;
      assert.equal(remote.version, result.version);
      assert.deepEqual(vignetteOf(remote.body), FIVE);
      assert.equal(remote.body.parameters.exposure, .65);
    }
    const assets = (await f.request(`/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets`)).body.assets;
    assert.equal(assets.find(asset => asset.id === f.source.id).sha256, f.source.sha256);
    assert.equal(assets.find(asset => asset.id === f.target.id).sha256, f.target.sha256);
    instance.dispose();
    assert.equal(ui.container.children.length, 0);
    await assert.rejects(instance.list({kind: 'PERSONAL'}), /VIGNETTE_PRESET_MOUNT_DISPOSED/);
  } finally {await f.close();}
});

test('VIGNETTE-MOUNT-02 / REAL_JWT_HTTP_SQLITE: stale Preset, switched selection, wrong identity and revoked role refuse', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    const preset = await instance.save({kind: 'WORKSPACE', name: 'Pinned Vignette'});
    f.select(f.target.id);
    await assert.rejects(instance.apply({kind: 'WORKSPACE', id: preset.id,
      version: preset.version + 1}), /VIGNETTE_PRESET_VERSION_CONFLICT/);
    const updated = await f.request(`/v1/workspaces/${f.workspaceId}/presets/${preset.id}`,
      {method: 'PATCH', body: {baseVersion: preset.version, name: 'Updated', body: preset.recipe}});
    assert.equal(updated.status, 200);
    await assert.rejects(instance.apply({kind: 'WORKSPACE', id: preset.id,
      version: preset.version}), /VIGNETTE_PRESET_VERSION_CONFLICT/);
    const wrong = f.mount({expectedSubject: 'owner-b'}).instance;
    await assert.rejects(wrong.list({kind: 'WORKSPACE'}),
      /WORKSPACE_SESSION_IDENTITY_CHANGED|WORKSPACE_SESSION_EDIT_FORBIDDEN|HTTP_403/);
    const switched = f.mount({selectionProvider: () => ({workspaceId: f.workspaceId,
      projectId: crypto.randomUUID(), assetId: f.target.id})}).instance;
    await assert.rejects(switched.apply({kind: 'WORKSPACE', id: preset.id,
      version: updated.body.preset.version}), /VIGNETTE_PRESET_SELECTION_CHANGED/);
    const invite = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', id: preset.id,
      version: updated.body.preset.version}), /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.list({kind: 'WORKSPACE'}), error => error.status === 403);
    assert.equal((await f.request(recipePath(f, f.target))).body.recipe.version, 1);
  } finally {await f.close();}
});

test('VIGNETTE-MOUNT-03: full/partial Presets, unsupported scope and cancellation never start only-apply', async () => {
  const f = await fixture();
  try {
    const requests = [];
    const {instance} = f.mount({fetchImpl: (url, init) => {
      requests.push({url, init}); return fetch(url, init);
    }});
    await assert.rejects(instance.save({kind: 'COMMUNITY', name: 'No'}), /VIGNETTE_PRESET_SCOPE_INVALID/);
    assert.equal((await instance.list({kind: 'PERSONAL'})).length, 0);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Full', body: recipe({exposure: .2, vignette: FIVE})}})).status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Partial', body: recipe({vignette: {amount: 5, midpoint: 40}})}})).status, 201);
    assert.equal((await instance.list({kind: 'PERSONAL'})).length, 0);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(({url, init}) => !url.includes('eyJ') &&
      init.credentials === 'omit' && init.cache === 'no-store' &&
      /^Bearer /u.test(init.headers.Authorization)));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(instance.list({kind: 'PERSONAL', signal: cancelled.signal}),
      {name: 'AbortError'});
  } finally {await f.close();}
});

test('VIGNETTE-MOUNT-04 / REAL_JWT_HTTP_SQLITE: legacy Amount-only Preset remains usable', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    f.select(f.target.id);
    const saved = await instance.save({kind: 'PERSONAL', name: 'Legacy Amount'});
    assert.deepEqual(vignetteOf(saved.recipe), {amount: 12});
    f.select(f.source.id);
    const result = await instance.apply({kind: 'PERSONAL', id: saved.id, version: saved.version});
    assert.deepEqual(vignetteOf(result.recipe), {amount: 12});
  } finally {await f.close();}
});

test('VIGNETTE-MOUNT-05 / BROWSER_BUNDLE_ONLY: host mount bundles without product injection', async () => {
  const result = await build({entryPoints: ['apps/web/src/vignette-workspace-preset-mount.mjs'],
    absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  const source = new TextDecoder().decode(result.outputFiles[0].contents);
  assert.match(source, /mountVignetteWorkspacePreset/u);
  assert.match(source, /vignette-preset/u);
  assert.ok(source.length > 20_000);
});
