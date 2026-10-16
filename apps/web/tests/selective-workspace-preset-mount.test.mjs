import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild-wasm';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {mountSelectiveWorkspacePreset} from '../src/selective-workspace-preset-mount.mjs';

// Synthetic non-RAW test data only. Product OIDC host, real Chrome and Cloud remain unmounted.
const families = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas',
  'whites', 'neutrals', 'blacks'];
const controls = ['cyan', 'magenta', 'yellow', 'black'];
const selective = method => ({method, ranges: Object.fromEntries(families.map((name, i) =>
  [name, Object.fromEntries(controls.map((control, j) => [control, (i * 11 + j * 17) % 101 - 50]))]))});
const selectionOf = body => body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor;
const glow = {mode: 'halation', intensity: 40, radius: 8, threshold: 112,
  exposure: 14, diffusion: 30, tint: -4};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function recipe({selectiveColor, exposure = 0, rich = false, boundAsset, boundSHA} = {}) {
  const extra = {};
  if (selectiveColor || rich) extra.postDecodeAdjustments = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1', color: {
      ...(selectiveColor ? {selectiveColor: structuredClone(selectiveColor)} : {}),
      ...(rich ? {glow: structuredClone(glow), temperature: 22} : {})},
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
function dom() {
  const controlsMap = new Map();
  const node = () => ({value: '', textContent: '', disabled: false,
    addEventListener(type, fn) {this[`on${type}`] = fn;},
    replaceChildren() {this.children = [];},
    append(item) {(this.children ??= []).push(item);}});
  for (const key of ['scope', 'mode', 'name', 'list', 'status', 'save', 'refresh', 'apply'])
    controlsMap.set(`[data-selective-preset-${key}]`, node());
  controlsMap.get('[data-selective-preset-scope]').value = 'PERSONAL';
  controlsMap.get('[data-selective-preset-mode]').value = 'selective-only';
  const panel = {className: '', innerHTML: '', querySelector: key => controlsMap.get(key),
    querySelectorAll: selector => selector === 'button' ? ['save', 'refresh', 'apply']
      .map(key => controlsMap.get(`[data-selective-preset-${key}]`)) : []};
  const documentRef = {createElement: tag => tag === 'section' ? panel : node()};
  const container = {children: [], replaceChildren(...items) {this.children = items;}};
  return {documentRef, container, controls: controlsMap, panel};
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-selective-ws-mount-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'selective-mount-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user = 'owner-a') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'selective-mount-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  async function request(path, {method = 'GET', body, user = 'owner-a'} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      Authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const workspaceId = (await request('/v1/workspaces', {method: 'POST',
    body: {name: 'Selective'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${workspaceId}/projects`, {method: 'POST',
    body: {name: 'Synthetic'}})).body.project.id;
  async function asset(name, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_${name}`);
    const sha256 = hash(bytes);
    const item = (await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
      {method: 'POST', body: {name, size: bytes.length, sha256}})).body.asset;
    const key = workspace.workspaces.getAsset({userId: 'owner-a'}, workspaceId,
      projectId, item.id).originalKey;
    await storage.putImmutable(key, Readable.from([bytes]), {sha256, size: bytes.length});
    assert.equal((await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${item.id}/recipe`,
      {method: 'PUT', body: {baseVersion: 0, recipe: body}})).status, 200);
    return {...item, bytes, key};
  }
  const source = await asset('source.nonraw', recipe({selectiveColor: selective('relative'), exposure: .3}));
  const target = await asset('target.nonraw', recipe({selectiveColor: selective('absolute'),
    exposure: .65, rich: true}));
  let selectedAssetId = source.id;
  const selectionProvider = () => ({workspaceId, projectId, assetId: selectedAssetId});
  const mount = (overrides = {}) => {
    const ui = dom();
    const instance = mountSelectiveWorkspacePreset({...ui, baseURL, workspaceId, projectId,
      expectedSubject: 'owner-a', expectedTenantId: 'tenant-a',
      tokenProvider: () => token(), selectionProvider, ...overrides});
    return {instance, ui};
  };
  const assetPath = id => `/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${id}`;
  return {request, token, workspaceId, projectId, source, target, storage, mount, assetPath,
    select(id) {selectedAssetId = id;},
    async close() {await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});}};
}

test('SELECTIVE-MOUNT-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: Personal/Workspace explicit full Save→Reload→Apply retains 9×CMYK/2 methods', async () => {
  const f = await fixture();
  try {
    const fullRequests = [];
    const {instance, ui} = f.mount({fetchImpl: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/preset'))
        fullRequests.push(JSON.parse(init.body));
      return fetch(url, init);
    }});
    assert.equal(ui.container.children.length, 1);
    let version = 1;
    for (const [kind, method] of [['PERSONAL', 'relative'], ['WORKSPACE', 'absolute']]) {
      f.select(f.source.id);
      if (method === 'absolute') assert.equal((await f.request(`${f.assetPath(f.source.id)}/recipe`,
        {method: 'PUT', body: {baseVersion: 1,
          recipe: recipe({selectiveColor: selective('absolute'), exposure: .3})}})).status, 200);
      const saved = await instance.save({kind, name: `${kind} Full`, mode: 'full'});
      assert.deepEqual(selectionOf(saved.recipe), selective(method));
      for (const family of families) assert.deepEqual(Object.keys(selectionOf(saved.recipe).ranges[family]), controls);
      assert.deepEqual((await instance.reload({kind, mode: 'full', id: saved.id})).recipe, saved.recipe);
      assert.ok((await instance.list({kind, mode: 'full'})).some(item => item.id === saved.id));
      f.select(f.target.id);
      const applied = await instance.apply({kind, mode: 'full', id: saved.id, version: saved.version});
      assert.equal(applied.outcome, 'saved');
      assert.equal(applied.recipe.parameters.exposure, .3, 'full mode intentionally replaces exposure');
      assert.deepEqual(selectionOf(applied.recipe), selective(method));
      assert.equal(applied.version, ++version);
      const remote = (await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe;
      assert.deepEqual(remote.body, saved.recipe);
    }
    for (const asset of [f.source, f.target])
      assert.deepEqual(await f.storage.inspect(asset.key),
        {sha256: asset.sha256, size: asset.bytes.length, persisted: true});
    assert.equal(fullRequests.length, 2);
    assert.ok(fullRequests.every(body => body.expectedOriginalSHA256 === f.target.sha256));
    instance.dispose();
    await assert.rejects(instance.list({kind: 'PERSONAL'}), /SELECTIVE_PRESET_MOUNT_DISPOSED/);
  } finally {await f.close();}
});

test('SELECTIVE-MOUNT-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: pure Selective-only Save→Reload→Apply preserves other edits and photo-bound target B/W', async () => {
  const f = await fixture();
  try {
    const targetBody = recipe({selectiveColor: selective('absolute'), exposure: .65, rich: true,
      boundAsset: f.target.id, boundSHA: f.target.sha256});
    assert.equal((await f.request(`${f.assetPath(f.target.id)}/recipe`,
      {method: 'PUT', body: {baseVersion: 1, recipe: targetBody}})).status, 200);
    const {instance} = f.mount();
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const saved = await instance.save({kind, name: `${kind} Selective`, mode: 'selective-only'});
      assert.equal(saved.recipe.parameters.exposure, 0);
      assert.equal(saved.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow, undefined);
      assert.deepEqual(selectionOf(saved.recipe), selective('relative'));
      assert.equal((await instance.reload({kind, id: saved.id})).version, saved.version);
      assert.ok((await instance.list({kind})).some(item => item.id === saved.id));
      f.select(f.target.id);
      const applied = await instance.apply({kind, id: saved.id, version: saved.version});
      assert.equal(applied.outcome, 'saved');
      const expected = structuredClone(targetBody);
      expected.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor = selective('relative');
      assert.deepEqual(applied.recipe, expected);
      assert.equal(applied.sha256, f.target.sha256);
      assert.deepEqual((await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe.body, expected);
    }
    assert.deepEqual(await f.storage.inspect(f.target.key),
      {sha256: f.target.sha256, size: f.target.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('SELECTIVE-MOUNT-03 / REAL_JWT_HTTP_SQLITE: impure/old Presets excluded from selective-only, stale version/identity/scope/viewer/revoke fail closed', async () => {
  const f = await fixture();
  try {
    const requests = [];
    const {instance} = f.mount({fetchImpl: (url, init) => {
      requests.push({url, init}); return fetch(url, init);}});
    const preset = await instance.save({kind: 'PERSONAL', name: 'Pinned', mode: 'selective-only'});
    const legacy = await f.request(`/v1/workspaces/${f.workspaceId}/presets`, {method: 'POST',
      body: {scope: 'PERSONAL', name: 'Old partial', body: recipe({selectiveColor: {
        ranges: {reds: {cyan: 5}}}})}});
    assert.equal(legacy.status, 201);
    assert.equal((await instance.list({kind: 'PERSONAL'})).length, 1);
    assert.equal((await instance.list({kind: 'PERSONAL', mode: 'full'})).length, 2);
    f.select(f.target.id);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: legacy.body.preset.id,
      version: 1}), /SELECTIVE_PRESET_NOT_PURE/);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: preset.version + 1}), /SELECTIVE_PRESET_VERSION_CONFLICT/);
    const patched = await f.request(`/v1/workspaces/${f.workspaceId}/presets/${preset.id}`,
      {method: 'PATCH', body: {baseVersion: 1, name: 'New', body: preset.recipe}});
    assert.equal(patched.status, 200);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: 1}), /SELECTIVE_PRESET_VERSION_CONFLICT/);
    const wrong = f.mount({expectedSubject: 'owner-b'}).instance;
    await assert.rejects(wrong.list({kind: 'PERSONAL'}),
      /WORKSPACE_SESSION_IDENTITY_CHANGED|WORKSPACE_SESSION_EDIT_FORBIDDEN|HTTP_403/);
    const swapped = f.mount({selectionProvider: () => ({workspaceId: f.workspaceId,
      projectId: randomUUID(), assetId: f.target.id})}).instance;
    await assert.rejects(swapped.apply({kind: 'PERSONAL', id: preset.id, version: 2}),
      /SELECTIVE_PRESET_SELECTION_CHANGED/);
    const invite = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', id: preset.id, version: 2}),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.list({kind: 'WORKSPACE'}), error => error.status === 403);
    assert.equal((await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe.version, 1);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(({url, init}) => !url.includes('eyJ') &&
      init.credentials === 'omit' && init.cache === 'no-store' &&
      /^Bearer /u.test(init.headers.Authorization)));
  } finally {await f.close();}
});

test('SELECTIVE-MOUNT-04 / REAL_JWT_HTTP_SQLITE: a racing target CAS cannot create a conflict branch or claim Selective-only success', async () => {
  const f = await fixture();
  try {
    const normal = f.mount().instance;
    const preset = await normal.save({kind: 'PERSONAL', name: 'Race', mode: 'selective-only'});
    f.select(f.target.id);
    let raced = false;
    const {instance} = f.mount({fetchImpl: async (url, init) => {
      if (!raced && init.method === 'POST' && url.endsWith('/selective-preset')) {
        raced = true;
        const changed = await f.request(`${f.assetPath(f.target.id)}/recipe`,
          {method: 'PUT', body: {baseVersion: 1, recipe: recipe({
            selectiveColor: selective('absolute'), exposure: .72, rich: true})}});
        assert.equal(changed.status, 200);
      }
      return fetch(url, init);
    }});
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: preset.version}), error => error.status === 409);
    assert.equal(raced, true);
    const versions = (await f.request(`${f.assetPath(f.target.id)}/versions`)).body.versions;
    assert.deepEqual(versions.map(row => row.version), [1, 2]);
    assert.ok(versions.every(row => row.branch === false));
    assert.equal(versions[1].body.parameters.exposure, .72);
    assert.deepEqual(selectionOf(versions[1].body), selective('absolute'));
  } finally {await f.close();}
});

test('SELECTIVE-MOUNT-05: explicit UI modes, scope reset, cancellation and browser bundle have no product auto-mount', async () => {
  const f = await fixture();
  try {
    const {instance, ui} = f.mount();
    assert.match(ui.panel.innerHTML, /既存調整を置換/u);
    assert.match(ui.panel.innerHTML, /他の調整を保持/u);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(instance.list({kind: 'PERSONAL', signal: cancelled.signal}),
      {name: 'AbortError'});
    await assert.rejects(instance.save({kind: 'COMMUNITY', name: 'No'}),
      /SELECTIVE_PRESET_SCOPE_INVALID/);
    await assert.rejects(instance.apply({kind: 'PERSONAL', mode: 'unknown'}),
      /SELECTIVE_PRESET_MODE_INVALID/);
    const preset = await instance.save({kind: 'PERSONAL', name: 'UI', mode: 'selective-only'});
    assert.equal(preset.mode, 'selective-only');
    ui.controls.get('[data-selective-preset-mode]').value = 'full';
    ui.controls.get('[data-selective-preset-mode]').onchange();
    assert.equal(ui.controls.get('[data-selective-preset-list]').children.length, 0);
    instance.dispose();
    assert.equal(ui.container.children.length, 0);
    const output = await build({entryPoints: ['apps/web/src/selective-workspace-preset-mount.mjs'],
      absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
      target: 'es2022', write: false, logLevel: 'silent'});
    assert.equal(output.outputFiles.length, 1);
    const source = new TextDecoder().decode(output.outputFiles[0].contents);
    assert.match(source, /mountSelectiveWorkspacePreset/u);
    assert.match(source, /selective-preset/u);
  } finally {await f.close();}
});
