import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {build} from 'esbuild-wasm';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {mountGrainWorkspacePreset} from '../src/grain-workspace-preset-mount.mjs';

const grain = {amount: 47, seed: 0x12345678, shadows: 11, midtones: 22,
  highlights: 33, size: 44, roughness: 55, colorVariation: 66};
const recipe = ({exposure = 0, grainValue} = {}) => ({schemaVersion: 1,
  parameters: {exposure, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: grainValue ? {postDecodeAdjustments: {schemaVersion: 1,
      engineVersion: 'suite-srgb8-color-detail-1', detail: {grain: grainValue}}} : {},
    processingOrder: grainValue ? ['exposure', 'contrast', 'saturation',
      'postDecodeAdjustments', 'rotation'] : ['exposure', 'contrast', 'saturation', 'rotation']}});
const grainOf = body => body.parameters.extendedParameters.postDecodeAdjustments.detail.grain;

function dom() {
  const handlers = new Map();
  const node = () => ({value: '', textContent: '', disabled: false,
    addEventListener(type, handler) {this[`on${type}`] = handler;},
    replaceChildren() {this.children = [];}, append(item) {(this.children ??= []).push(item);}});
  const buttons = ['save', 'refresh', 'apply'].map(key => {
    const button = node(); handlers.set(`[data-grain-preset-${key}]`, button); return button;
  });
  for (const key of ['scope', 'name', 'list', 'status'])
    handlers.set(`[data-grain-preset-${key}]`, node());
  handlers.get('[data-grain-preset-scope]').value = 'PERSONAL';
  const panel = {className: '', innerHTML: '', querySelector: key => handlers.get(key),
    querySelectorAll: key => key === 'button' ? buttons : []};
  const documentRef = {createElement: tag => tag === 'section' ? panel : node()};
  const container = {children: [], replaceChildren(...items) {this.children = items;}};
  return {documentRef, container, controls: handlers};
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-grain-ws-mount-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'grain-mount-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenant = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user, expiry = '5m') => new SignJWT({tenant_id: tenant[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'grain-mount-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path, {method = 'GET', body, user = 'owner-a'} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const workspaceId = (await request('/v1/workspaces', {method: 'POST', body: {name: 'Grain'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${workspaceId}/projects`, {method: 'POST',
    body: {name: 'Synthetic'}})).body.project.id;
  assert.match(workspaceId, /^[0-9a-f-]{36}$/iu);
  assert.match(projectId, /^[0-9a-f-]{36}$/iu);
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
  const source = await asset('source.nonraw', recipe({grainValue: grain}));
  const target = await asset('target.nonraw', recipe({exposure: .65}));
  let selectedAssetId = source.id;
  const selectionProvider = () => ({workspaceId, projectId, assetId: selectedAssetId});
  const mount = (overrides = {}) => {
    const ui = dom();
    assert.equal(typeof ui.container.replaceChildren, 'function');
    assert.equal(typeof ui.documentRef.createElement, 'function');
    assert.equal(typeof selectionProvider, 'function');
    assert.match(workspaceId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
    assert.match(projectId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
    const instance = mountGrainWorkspacePreset({...ui, baseURL, workspaceId, projectId,
      expectedSubject: 'owner-a', expectedTenantId: tenant['owner-a'],
      tokenProvider: () => token('owner-a'), selectionProvider, ...overrides});
    return {instance, ui};
  };
  return {request, token, workspaceId, projectId, source, target, mount,
    select(id) {selectedAssetId = id;},
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
    }};
}

test('GRAIN-MOUNT-01 / REAL_JWT_HTTP_SQLITE_SYNTHETIC_NON_RAW: Personal/Workspace host Save, Reload, Grain-only Apply retain other edits', async () => {
  const f = await fixture();
  try {
    const {instance, ui} = f.mount();
    assert.equal(ui.container.children.length, 1);
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const saved = await instance.save({kind, name: `${kind} Grain`});
      assert.deepEqual(grainOf(saved.recipe), grain);
      assert.deepEqual(grainOf((await instance.reload({kind, id: saved.id})).recipe), grain);
      assert.ok((await instance.list({kind})).some(item => item.id === saved.id));
      f.select(f.target.id);
      const result = await instance.apply({kind, id: saved.id, version: saved.version});
      assert.equal(result.outcome, 'saved');
      assert.deepEqual(grainOf(result.recipe), grain);
      assert.equal(result.recipe.parameters.exposure, .65);
      const remote = (await f.request(`/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets/${f.target.id}/recipe`)).body.recipe;
      assert.equal(remote.version, result.version);
      assert.deepEqual(grainOf(remote.body), grain);
      assert.equal(remote.body.parameters.exposure, .65);
    }
    instance.dispose();
    assert.equal(ui.container.children.length, 0);
    await assert.rejects(instance.list({kind: 'PERSONAL'}), /GRAIN_PRESET_MOUNT_DISPOSED/);
  } finally {await f.close();}
});

test('GRAIN-MOUNT-02 / REAL_JWT_HTTP_SQLITE: selection swap, stale Preset, wrong identity and membership revoke fail closed', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    const preset = await instance.save({kind: 'PERSONAL', name: 'Pinned Grain'});
    f.select(f.target.id);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: preset.version + 1}), /GRAIN_PRESET_VERSION_CONFLICT/);
    const wrong = f.mount({expectedSubject: 'owner-b'}).instance;
    await assert.rejects(wrong.list({kind: 'WORKSPACE'}),
      /WORKSPACE_SESSION_IDENTITY_CHANGED|WORKSPACE_SESSION_EDIT_FORBIDDEN|HTTP_403/);
    const missing = f.mount({selectionProvider: () => ({workspaceId: f.workspaceId,
      projectId: crypto.randomUUID(), assetId: f.target.id})}).instance;
    await assert.rejects(missing.apply({kind: 'PERSONAL', id: preset.id, version: 1}),
      /GRAIN_PRESET_SELECTION_CHANGED/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets/${f.target.id}/recipe`)).body.recipe.version, 1);
    const invite = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', id: preset.id, version: 1}),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`, {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.list({kind: 'WORKSPACE'}), error => error.status === 403);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets/${f.target.id}/recipe`)).body.recipe.version, 1);
  } finally {await f.close();}
});

test('GRAIN-MOUNT-03: host rejects forged scope/selection and keeps credentials outside URL and state', async () => {
  const f = await fixture();
  try {
    const requests = [];
    const {instance} = f.mount({fetchImpl: (url, init) => {
      requests.push({url, init}); return fetch(url, init);
    }});
    await assert.rejects(instance.save({kind: 'COMMUNITY', name: 'No'}), /GRAIN_PRESET_SCOPE_INVALID/);
    assert.equal((await instance.list({kind: 'PERSONAL'})).length, 0);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Full Recipe',
        body: recipe({exposure: .4, grainValue: grain})}})).status, 201);
    assert.equal((await instance.list({kind: 'PERSONAL'})).length, 0,
      'full-Recipe presets are not shown as safe Grain-only candidates');
    assert.ok(requests.length > 0);
    assert.ok(requests.every(({url, init}) => !url.includes('eyJ') &&
      init.credentials === 'omit' && init.cache === 'no-store' &&
      /^Bearer /u.test(init.headers.Authorization)));
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(instance.list({kind: 'PERSONAL', signal: aborted.signal}),
      {name: 'AbortError'});
  } finally {await f.close();}
});

test('GRAIN-MOUNT-04 / BROWSER_BUNDLE_ONLY: host mount bundles without product Bootstrap injection', async () => {
  const result = await build({entryPoints: ['apps/web/src/grain-workspace-preset-mount.mjs'],
    absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  const source = new TextDecoder().decode(result.outputFiles[0].contents);
  assert.match(source, /mountGrainWorkspacePreset/u);
  assert.match(source, /grain-preset/u);
  assert.ok(source.length > 20_000);
});
