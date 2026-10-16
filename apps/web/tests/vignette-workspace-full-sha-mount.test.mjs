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
import {mountVignetteWorkspacePreset} from '../src/vignette-workspace-preset-mount.mjs';

// Synthetic non-RAW only: this does not exercise an OIDC host, RAW decoder, Chrome or Cloud.
const FIVE = {amount: -35, midpoint: 37, roundness: -20, feather: 83, highlights: 19};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const vignetteOf = body => body.parameters.extendedParameters.postCropAdjustments.vignette;
function recipe({vignette, exposure = 0, mask} = {}) {
  const extendedParameters = vignette ? {postCropAdjustments: {schemaVersion: 1,
    engineVersion: 'suite-srgb8-manual-vignette-1', vignette}} : {};
  if (mask) extendedParameters.bwEdgeManual = mask;
  return {schemaVersion: 1, parameters: {exposure, contrast: 1, saturation: 1,
    rotationDegrees: 0, extendedParameters,
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
}
function maskFor(asset) {
  const stroke = {operation: 'ADD', path: [{u: .5, v: .5}], radiusFraction: .1,
    hardness: 1};
  return {schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: asset.id, originalSHA256: asset.sha256,
      sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [stroke], correctionStrokes: [stroke]};
}
function dom() {
  const controls = new Map();
  const node = () => ({value: '', textContent: '', disabled: false,
    addEventListener(type, fn) {this[`on${type}`] = fn;},
    replaceChildren() {this.children = [];},
    append(child) {(this.children ??= []).push(child);}});
  for (const key of ['scope', 'mode', 'name', 'list', 'status', 'save', 'refresh', 'apply'])
    controls.set(`[data-vignette-preset-${key}]`, node());
  controls.get('[data-vignette-preset-scope]').value = 'PERSONAL';
  controls.get('[data-vignette-preset-mode]').value = 'vignette-only';
  const panel = {className: '', innerHTML: '',
    querySelector: key => controls.get(key),
    querySelectorAll: selector => selector === 'button' ? ['save', 'refresh', 'apply']
      .map(key => controls.get(`[data-vignette-preset-${key}]`)) : []};
  const documentRef = {createElement: tag => tag === 'section' ? panel : node()};
  const container = {children: [], replaceChildren(...children) {this.children = children;}};
  return {documentRef, container, controls};
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-vignette-full-sha-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'vignette-full-sha-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user = 'owner-a') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'vignette-full-sha-test'})
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
    body: {name: 'Vignette Full SHA'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${workspaceId}/projects`,
    {method: 'POST', body: {name: 'Synthetic'}})).body.project.id;
  const path = id => `/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${id}`;
  async function asset(name, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_${name}`);
    const originalSHA256 = sha(bytes);
    const registered = (await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
      {method: 'POST', body: {name, size: bytes.length, sha256: originalSHA256}})).body.asset;
    const key = workspace.workspaces.getAsset({userId: 'owner-a'}, workspaceId,
      projectId, registered.id).originalKey;
    await storage.putImmutable(key, Readable.from([bytes]), {sha256: originalSHA256,
      size: bytes.length});
    const saved = await request(`${path(registered.id)}/recipe`, {method: 'PUT',
      body: {baseVersion: 0, recipe: body}});
    assert.equal(saved.status, 200);
    return {...registered, bytes, key};
  }
  const source = await asset('source.nonraw', recipe({vignette: FIVE, exposure: .28}));
  const target = await asset('target.nonraw', recipe({vignette: {amount: 12}, exposure: .65}));
  let selectedAssetId = source.id;
  const selectionProvider = () => ({workspaceId, projectId, assetId: selectedAssetId});
  const mount = (overrides = {}) => {
    const ui = dom();
    const instance = mountVignetteWorkspacePreset({...ui, baseURL, workspaceId, projectId,
      expectedSubject: 'owner-a', expectedTenantId: 'tenant-a',
      tokenProvider: () => token(), selectionProvider, ...overrides});
    return {instance, ui};
  };
  async function originalsUnchanged() {
    for (const asset of [source, target])
      assert.deepEqual(await storage.inspect(asset.key),
        {sha256: asset.sha256, size: asset.bytes.length, persisted: true});
  }
  return {request, token, workspaceId, projectId, source, target, path, mount,
    workspaceDBPath: join(root, 'workspace.sqlite'),
    select(id) {selectedAssetId = id;}, originalsUnchanged,
    async close() {await new Promise((resolve, reject) => server.close(error => error ?
      reject(error) : resolve())); workspace.close(); assets.close();
      await rm(root, {recursive: true, force: true});}};
}

test('VIGNETTE-FULL-SHA-01 / REAL_JWT_HTTP_SQLITE_NON_RAW: explicit Personal/Workspace Full sends Original SHA, only keeps target mask and edits', async () => {
  const f = await fixture();
  try {
    const fullRequests = [];
    const {instance, ui} = f.mount({fetchImpl: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/preset'))
        fullRequests.push(JSON.parse(init.body));
      return fetch(url, init);
    }});
    assert.match(ui.container.children[0].innerHTML, /既存調整を置換/u);
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const full = await instance.save({kind, mode: 'full', name: `${kind} Full`});
      assert.deepEqual(vignetteOf(full.recipe), FIVE);
      assert.equal(full.recipe.parameters.exposure, .28);
      assert.equal((await instance.reload({kind, mode: 'full', id: full.id})).version,
        full.version);
      assert.ok((await instance.list({kind, mode: 'full'})).some(row => row.id === full.id));
      assert.ok(!(await instance.list({kind, mode: 'vignette-only'}))
        .some(row => row.id === full.id));
      f.select(f.target.id);
      const applied = await instance.apply({kind, mode: 'full', id: full.id,
        version: full.version});
      assert.equal(applied.mode, 'full');
      assert.equal(applied.recipe.parameters.exposure, .28,
        'Full replacement is explicit; it is not a Vignette-only merge');
      assert.deepEqual(vignetteOf(applied.recipe), FIVE);
      assert.deepEqual((await f.request(`${f.path(f.target.id)}/recipe`)).body.recipe.body,
        full.recipe);
    }
    assert.equal(fullRequests.length, 2);
    assert.ok(fullRequests.every(body => body.expectedOriginalSHA256 === f.target.sha256));

    const photoBound = maskFor(f.target);
    const current = (await f.request(`${f.path(f.target.id)}/recipe`)).body.recipe;
    const targetWithMask = recipe({vignette: {amount: 12}, exposure: .65,
      mask: photoBound});
    assert.equal((await f.request(`${f.path(f.target.id)}/recipe`, {method: 'PUT',
      body: {baseVersion: current.version, recipe: targetWithMask}})).status, 200);
    f.select(f.source.id);
    const only = await instance.save({kind: 'PERSONAL', name: 'Only'});
    f.select(f.target.id);
    const merged = await instance.apply({kind: 'PERSONAL', id: only.id,
      version: only.version});
    assert.equal(merged.mode, 'vignette-only');
    assert.equal(merged.recipe.parameters.exposure, .65);
    assert.deepEqual(merged.recipe.parameters.extendedParameters.bwEdgeManual, photoBound);
    assert.deepEqual(vignetteOf(merged.recipe), FIVE);
    await assert.rejects(instance.save({kind: 'PERSONAL', mode: 'full',
      name: 'Photo-bound must not enter Presets'}), error => error.status === 403);
    await f.originalsUnchanged();
  } finally {await f.close();}
});

test('VIGNETTE-FULL-SHA-02 / REAL_JWT_HTTP_SQLITE_NON_RAW: legacy sparse Full stays exact and partial five-value Full does not enter only mode', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    const sparse = {amount: -17};
    const partial = {amount: -24, midpoint: 51};
    for (const [name, values] of [['Amount-only', sparse], ['Partial legacy', partial]]) {
      const created = await f.request(`/v1/workspaces/${f.workspaceId}/presets`,
        {method: 'POST', body: {scope: 'PERSONAL', name,
          body: recipe({vignette: values, exposure: .31})}});
      assert.equal(created.status, 201);
      const saved = created.body.preset;
      const reloaded = await instance.reload({kind: 'PERSONAL', mode: 'full', id: saved.id});
      assert.deepEqual(vignetteOf(reloaded.recipe), values);
      assert.ok((await instance.list({kind: 'PERSONAL', mode: 'full'}))
        .some(item => item.id === saved.id));
      assert.ok(!(await instance.list({kind: 'PERSONAL', mode: 'vignette-only'}))
        .some(item => item.id === saved.id));
      f.select(f.target.id);
      const result = await instance.apply({kind: 'PERSONAL', mode: 'full', id: saved.id,
        version: saved.version});
      assert.deepEqual(vignetteOf(result.recipe), values);
      assert.equal(result.recipe.parameters.exposure, .31);
      f.select(f.source.id);
    }
    await f.originalsUnchanged();
  } finally {await f.close();}
});

test('VIGNETTE-FULL-SHA-03 / REAL_JWT_HTTP_SQLITE: wrong SHA, stale Preset and racing Recipe CAS refuse Full with no branch', async () => {
  const f = await fixture();
  try {
    const saved = await f.mount().instance.save({kind: 'PERSONAL', mode: 'full',
      name: 'Pinned Full'});
    f.select(f.target.id);
    let sawFull = false;
    const wrong = f.mount({fetchImpl: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/preset')) {
        sawFull = true;
        return fetch(url, {...init, body: JSON.stringify({...JSON.parse(init.body),
          expectedOriginalSHA256: '0'.repeat(64)})});
      }
      return fetch(url, init);
    }}).instance;
    await assert.rejects(wrong.apply({kind: 'PERSONAL', mode: 'full', id: saved.id,
      version: saved.version}), error => error.status === 409);
    assert.equal(sawFull, true);
    const updated = await f.request(`/v1/workspaces/${f.workspaceId}/presets/${saved.id}`,
      {method: 'PATCH', body: {baseVersion: saved.version, name: 'Pinned Full v2',
        body: saved.recipe}});
    assert.equal(updated.status, 200);
    await assert.rejects(f.mount().instance.apply({kind: 'PERSONAL', mode: 'full',
      id: saved.id, version: saved.version}), /VIGNETTE_PRESET_VERSION_CONFLICT/);
    let raced = false;
    const racing = f.mount({fetchImpl: async (url, init) => {
      if (!raced && init.method === 'POST' && url.endsWith('/preset')) {
        raced = true;
        const changed = await f.request(`${f.path(f.target.id)}/recipe`,
          {method: 'PUT', body: {baseVersion: 1, recipe: recipe({exposure: .45})}});
        assert.equal(changed.status, 200);
      }
      return fetch(url, init);
    }}).instance;
    await assert.rejects(racing.apply({kind: 'PERSONAL', mode: 'full', id: saved.id,
      version: updated.body.preset.version}), error => error.status === 409);
    assert.equal(raced, true);
    const versions = (await f.request(`${f.path(f.target.id)}/versions`)).body.versions;
    assert.deepEqual(versions.map(row => row.version), [1, 2]);
    assert.ok(versions.every(row => row.branch === false));
    assert.equal(versions[1].body.parameters.exposure, .45);
    await f.originalsUnchanged();
  } finally {await f.close();}
});

test('VIGNETTE-FULL-SHA-04 / REAL_JWT_HTTP_SQLITE: Viewer and revoked membership cannot Full Apply', async () => {
  const f = await fixture();
  try {
    const saved = await f.mount().instance.save({kind: 'WORKSPACE', mode: 'full',
      name: 'Workspace Full'});
    f.select(f.target.id);
    const invite = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`,
      {method: 'POST', body: {email: 'owner-b@example.test', role: 'VIEWER',
        expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {method: 'POST', user: 'owner-b', body: {token: invite.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', mode: 'full', id: saved.id,
      version: saved.version}), /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', mode: 'full', id: saved.id,
      version: saved.version}), error => error.status === 403);
    assert.equal((await f.request(`${f.path(f.target.id)}/recipe`)).body.recipe.version, 1);
    assert.ok((await f.request(`${f.path(f.target.id)}/versions`)).body.versions
      .every(row => row.branch === false));
    await f.originalsUnchanged();
  } finally {await f.close();}
});

test('VIGNETTE-FULL-SHA-05 / REAL_JWT_HTTP_SQLITE: legacy photo-bound Full Preset refuses Apply without a branch', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    const saved = await instance.save({kind: 'WORKSPACE', mode: 'full',
      name: 'Clean version'});
    const unsafe = recipe({vignette: FIVE, exposure: .28,
      mask: maskFor(f.source)});
    const db = new DatabaseSync(f.workspaceDBPath);
    try {
      db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(saved.id, saved.version + 1, 'Old unsafe version',
          JSON.stringify(unsafe), 'owner-a', new Date().toISOString());
      db.prepare('UPDATE ws_presets SET current_version=? WHERE id=?')
        .run(saved.version + 1, saved.id);
    } finally {db.close();}
    f.select(f.target.id);
    await assert.rejects(instance.apply({kind: 'WORKSPACE', mode: 'full',
      id: saved.id, version: saved.version + 1}), error => error.status === 403);
    const versions = (await f.request(`${f.path(f.target.id)}/versions`)).body.versions;
    assert.deepEqual(versions.map(row => row.version), [1]);
    assert.ok(versions.every(row => row.branch === false));
    await f.originalsUnchanged();
  } finally {await f.close();}
});
