import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
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
import {mountLevelsWorkspacePreset} from '../src/levels-workspace-preset-mount.mjs';

// Synthetic non-RAW bytes only. No OIDC host, browser, RAW decoder or Cloud claim.
const sourceLevels = {master: {gamma: 1.4}, red: {inputBlack: 12},
  green: {outputWhite: 239}, blue: {inputWhite: 242}};
const fields = ['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite'];
const levelsOf = body => body.parameters.extendedParameters.postDecodeAdjustments.color.levels;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const recipe = ({levels, exposure = 0} = {}) => ({schemaVersion: 1, parameters: {
  exposure, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: levels ? {postDecodeAdjustments: {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1', color: {levels}}} : {},
  processingOrder: levels ? ['exposure', 'contrast', 'saturation',
    'postDecodeAdjustments', 'rotation'] : ['exposure', 'contrast', 'saturation', 'rotation']}});

function dom() {
  const controls = new Map();
  const node = () => ({value: '', textContent: '', disabled: false,
    addEventListener(type, fn) {this[`on${type}`] = fn;},
    replaceChildren() {this.children = [];},
    append(child) {(this.children ??= []).push(child);}});
  for (const key of ['scope', 'mode', 'name', 'list', 'status', 'save', 'refresh', 'apply'])
    controls.set(`[data-levels-preset-${key}]`, node());
  controls.get('[data-levels-preset-scope]').value = 'PERSONAL';
  controls.get('[data-levels-preset-mode]').value = 'levels-only';
  const panel = {className: '', innerHTML: '', querySelector: key => controls.get(key),
    querySelectorAll: selector => selector === 'button' ? ['save', 'refresh', 'apply']
      .map(key => controls.get(`[data-levels-preset-${key}]`)) : []};
  const documentRef = {createElement: tag => tag === 'section' ? panel : node()};
  const container = {children: [], replaceChildren(...children) {this.children = children;}};
  return {documentRef, container, controls};
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-levels-mount-'));
  const dbPath = join(root, 'assets.sqlite');
  const assets = new AssetRepository(dbPath);
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'levels-mount-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise((resolve, reject) => {server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);});
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenants = {'owner-a': 'tenant-a', 'owner-b': 'tenant-b'};
  const token = (user = 'owner-a') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'levels-mount-test'})
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
    body: {name: 'Levels'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${workspaceId}/projects`,
    {method: 'POST', body: {name: 'Synthetic'}})).body.project.id;
  async function asset(name, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_${name}`);
    const originalSHA256 = sha(bytes);
    const registered = (await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets`,
      {method: 'POST', body: {name, size: bytes.length, sha256: originalSHA256}})).body.asset;
    const key = workspace.workspaces.getAsset({userId: 'owner-a'}, workspaceId,
      projectId, registered.id).originalKey;
    await storage.putImmutable(key, Readable.from([bytes]), {sha256: originalSHA256,
      size: bytes.length});
    const saved = await request(`/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${registered.id}/recipe`,
      {method: 'PUT', body: {baseVersion: 0, recipe: body}});
    assert.equal(saved.status, 200);
    return {...registered, key, bytes};
  }
  const source = await asset('source.nonraw', recipe({levels: sourceLevels}));
  const target = await asset('target.nonraw', recipe({exposure: .65}));
  let selectedAssetId = source.id;
  const selectionProvider = () => ({workspaceId, projectId, assetId: selectedAssetId});
  const mount = (overrides = {}) => {
    const ui = dom();
    const instance = mountLevelsWorkspacePreset({...ui, baseURL, workspaceId, projectId,
      expectedSubject: 'owner-a', expectedTenantId: 'tenant-a',
      tokenProvider: () => token(), selectionProvider, ...overrides});
    return {instance, ui};
  };
  const assetPath = id => `/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${id}`;
  return {request, token, workspaceId, projectId, source, target, storage, mount, assetPath,
    dbPath, workspaceDBPath: join(root, 'workspace.sqlite'),
    select(id) {selectedAssetId = id;},
    async close() {await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});}};
}

test('LEVELS-MOUNT-01 / REAL_JWT_HTTP_SQLITE_SYNTHETIC_NON_RAW: Personal/Workspace 4×5 Save→Reload→atomic Apply preserves target edits and Originals', async () => {
  const f = await fixture();
  try {
    const {instance, ui} = f.mount();
    assert.equal(ui.container.children.length, 1);
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const saved = await instance.save({kind, name: `${kind} RGB Levels`});
      for (const channel of ['master', 'red', 'green', 'blue'])
        assert.deepEqual(Object.keys(levelsOf(saved.recipe)[channel]), fields);
      assert.deepEqual(levelsOf((await instance.reload({kind, id: saved.id})).recipe),
        levelsOf(saved.recipe));
      assert.ok((await instance.list({kind})).some(row => row.id === saved.id));
      f.select(f.target.id);
      const applied = await instance.apply({kind, id: saved.id, version: saved.version});
      assert.equal(applied.outcome, 'saved');
      assert.equal(applied.recipe.parameters.exposure, .65);
      assert.deepEqual(levelsOf(applied.recipe), levelsOf(saved.recipe));
      const stored = (await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe;
      assert.equal(stored.version, applied.version);
      assert.deepEqual(stored.body, applied.recipe);
    }
    const remoteAssets = (await f.request(`/v1/workspaces/${f.workspaceId}/projects/${f.projectId}/assets`)).body.assets;
    for (const asset of [f.source, f.target]) {
      assert.deepEqual(await f.storage.inspect(asset.key),
        {sha256: asset.sha256, size: asset.bytes.length, persisted: true});
      const fresh = remoteAssets.find(row => row.id === asset.id);
      assert.equal(fresh.sha256, asset.sha256);
    }
    instance.dispose();
    assert.equal(ui.container.children.length, 0);
    await assert.rejects(instance.list({kind: 'PERSONAL'}), /LEVELS_PRESET_MOUNT_DISPOSED/);
  } finally {await f.close();}
});

test('LEVELS-MOUNT-02 / REAL_JWT_HTTP_SQLITE: stale Preset, wrong identity, selection swap and revoked membership fail closed', async () => {
  const f = await fixture();
  try {
    const {instance} = f.mount();
    const preset = await instance.save({kind: 'PERSONAL', name: 'Pinned Levels'});
    f.select(f.target.id);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: preset.version + 1}), /LEVELS_PRESET_VERSION_CONFLICT/);
    const patched = await f.request(`/v1/workspaces/${f.workspaceId}/presets/${preset.id}`,
      {method: 'PATCH', body: {baseVersion: preset.version, name: 'Renamed', body: preset.recipe}});
    assert.equal(patched.status, 200);
    await assert.rejects(instance.apply({kind: 'PERSONAL', id: preset.id,
      version: preset.version}), /LEVELS_PRESET_VERSION_CONFLICT/);
    const wrong = f.mount({expectedSubject: 'owner-b'}).instance;
    await assert.rejects(wrong.list({kind: 'WORKSPACE'}),
      /WORKSPACE_SESSION_IDENTITY_CHANGED|WORKSPACE_SESSION_EDIT_FORBIDDEN|HTTP_403/);
    const swapped = f.mount({selectionProvider: () => ({workspaceId: f.workspaceId,
      projectId: randomUUID(), assetId: f.target.id})}).instance;
    await assert.rejects(swapped.apply({kind: 'PERSONAL', id: preset.id, version: 2}),
      /LEVELS_PRESET_SELECTION_CHANGED/);
    const invitation = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`,
      {method: 'POST', body: {email: 'owner-b@example.test', role: 'VIEWER',
        expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invitation.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {method: 'POST', user: 'owner-b', body: {token: invitation.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', id: preset.id,
      version: 2}), /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.list({kind: 'WORKSPACE'}), error => error.status === 403);
    assert.equal((await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe.version, 1);
  } finally {await f.close();}
});

test('LEVELS-MOUNT-03: only pure Levels Presets are offered; abort and credential handling fail closed', async () => {
  const f = await fixture();
  try {
    const requests = [];
    const {instance} = f.mount({fetchImpl: (url, init) => {
      requests.push({url, init}); return fetch(url, init);}});
    await assert.rejects(instance.save({kind: 'COMMUNITY', name: 'No'}),
      /LEVELS_PRESET_SCOPE_INVALID/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/presets`,
      {method: 'POST', body: {scope: 'PERSONAL', name: 'Full Recipe',
        body: recipe({levels: sourceLevels, exposure: .4})}})).status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/presets`,
      {method: 'POST', body: {scope: 'PERSONAL', name: 'Sparse Legacy',
        body: recipe({levels: {master: {gamma: 1.1}}})}})).status, 201);
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

test('LEVELS-MOUNT-04 / REAL_JWT_HTTP_SQLITE_NON_RAW: explicit Personal/Workspace Full Apply pins SHA and retains sparse legacy Levels', async () => {
  const f = await fixture();
  try {
    const fullBodies = [];
    const {instance, ui} = f.mount({fetchImpl: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/preset')) fullBodies.push(JSON.parse(init.body));
      return fetch(url, init);
    }});
    assert.match(ui.container.children[0].innerHTML, /既存調整を置換/u);
    let expectedVersion = 1;
    for (const kind of ['PERSONAL', 'WORKSPACE']) {
      f.select(f.source.id);
      const saved = await instance.save({kind, mode: 'full', name: `${kind} Sparse Full`});
      assert.deepEqual(levelsOf(saved.recipe), sourceLevels, 'full save does not rewrite sparse legacy values');
      assert.equal((await instance.reload({kind, mode: 'full', id: saved.id})).version, saved.version);
      assert.ok((await instance.list({kind, mode: 'full'})).some(row => row.id === saved.id));
      assert.ok(!(await instance.list({kind, mode: 'levels-only'})).some(row => row.id === saved.id));
      f.select(f.target.id);
      const applied = await instance.apply({kind, mode: 'full', id: saved.id,
        version: saved.version});
      assert.equal(applied.mode, 'full');
      assert.equal(applied.version, ++expectedVersion);
      assert.equal(applied.recipe.parameters.exposure, 0,
        'person explicitly chose full replacement of prior exposure');
      assert.deepEqual(levelsOf(applied.recipe), sourceLevels);
      assert.deepEqual((await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe.body,
        saved.recipe);
    }
    assert.equal(fullBodies.length, 2);
    assert.ok(fullBodies.every(body => body.expectedOriginalSHA256 === f.target.sha256));
    assert.deepEqual(await f.storage.inspect(f.target.key),
      {sha256: f.target.sha256, size: f.target.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('LEVELS-MOUNT-05 / REAL_JWT_HTTP_SQLITE: Full SHA mismatch and racing Recipe CAS fail without conflict branch', async () => {
  const f = await fixture();
  try {
    const saved = await f.mount().instance.save({kind: 'PERSONAL', mode: 'full', name: 'Full Race'});
    f.select(f.target.id);
    let staleSHA = false;
    const wrong = f.mount({fetchImpl: (url, init) => {
      if (init.method === 'POST' && url.endsWith('/preset')) {
        staleSHA = true;
        return fetch(url, {...init, body: JSON.stringify({...JSON.parse(init.body),
          expectedOriginalSHA256: '0'.repeat(64)})});
      }
      return fetch(url, init);
    }}).instance;
    await assert.rejects(wrong.apply({kind: 'PERSONAL', mode: 'full', id: saved.id,
      version: saved.version}), error => error.status === 409);
    assert.equal(staleSHA, true);
    assert.equal((await f.request(`${f.assetPath(f.target.id)}/recipe`)).body.recipe.version, 1);
    const patched = await f.request(`/v1/workspaces/${f.workspaceId}/presets/${saved.id}`,
      {method: 'PATCH', body: {baseVersion: saved.version, name: 'Full Race v2',
        body: saved.recipe}});
    assert.equal(patched.status, 200);
    await assert.rejects(f.mount().instance.apply({kind: 'PERSONAL', mode: 'full',
      id: saved.id, version: saved.version}), /LEVELS_PRESET_VERSION_CONFLICT/);
    let raced = false;
    const conflicting = f.mount({fetchImpl: async (url, init) => {
      if (!raced && init.method === 'POST' && url.endsWith('/preset')) {
        raced = true;
        const changed = await f.request(`${f.assetPath(f.target.id)}/recipe`,
          {method: 'PUT', body: {baseVersion: 1, recipe: recipe({exposure: .45})}});
        assert.equal(changed.status, 200);
      }
      return fetch(url, init);
    }}).instance;
    await assert.rejects(conflicting.apply({kind: 'PERSONAL', mode: 'full', id: saved.id,
      version: patched.body.preset.version}), error => error.status === 409);
    assert.equal(raced, true);
    const versions = (await f.request(`${f.assetPath(f.target.id)}/versions`)).body.versions;
    assert.deepEqual(versions.map(row => row.version), [1, 2]);
    assert.ok(versions.every(row => row.branch === false));
    assert.equal(versions[1].body.parameters.exposure, .45);
  } finally {await f.close();}
});

test('LEVELS-MOUNT-06 / REAL_JWT_HTTP_SQLITE: metadata change and lost edit role cannot claim Full Apply', async () => {
  const f = await fixture();
  try {
    const saved = await f.mount().instance.save({kind: 'WORKSPACE', mode: 'full', name: 'Pinned'});
    f.select(f.target.id);
    const invite = await f.request(`/v1/workspaces/${f.workspaceId}/invitations`,
      {method: 'POST', body: {email: 'owner-b@example.test', role: 'VIEWER',
        expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/invitations/accept`,
      {user: 'owner-b', method: 'POST', body: {token: invite.body.token}})).status, 200);
    const viewer = f.mount({expectedSubject: 'owner-b', expectedTenantId: 'tenant-b',
      tokenProvider: () => f.token('owner-b')}).instance;
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', mode: 'full',
      id: saved.id, version: saved.version}), /WORKSPACE_SESSION_EDIT_FORBIDDEN/);
    assert.equal((await f.request(`/v1/workspaces/${f.workspaceId}/members/owner-b`,
      {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.apply({kind: 'WORKSPACE', mode: 'full',
      id: saved.id, version: saved.version}), error => error.status === 403);
    let changed = false;
    const tampered = f.mount({fetchImpl: (url, init) => {
      if (!changed && init.method === 'POST' && url.endsWith('/preset')) {
        changed = true;
        const db = new DatabaseSync(f.dbPath);
        db.prepare('UPDATE assets SET sha256=? WHERE id=?').run('a'.repeat(64), f.target.id);
        db.close();
      }
      return fetch(url, init);
    }}).instance;
    await assert.rejects(tampered.apply({kind: 'WORKSPACE', mode: 'full',
      id: saved.id, version: saved.version}), error => error.status === 503);
    assert.equal(changed, true);
    const history = new DatabaseSync(f.workspaceDBPath);
    const rows = history.prepare('SELECT version,branch FROM ws_recipe_versions WHERE asset_id=? ORDER BY version')
      .all(f.target.id);
    history.close();
    assert.deepEqual(rows.map(row => ({version: row.version, branch: row.branch})),
      [{version: 1, branch: 0}]);
    assert.deepEqual(await f.storage.inspect(f.target.key),
      {sha256: f.target.sha256, size: f.target.bytes.length, persisted: true});
  } finally {await f.close();}
});

test('LEVELS-MOUNT-07 / BROWSER_BUNDLE_ONLY: host mount builds without production Bootstrap injection', async () => {
  const output = await build({entryPoints: ['apps/web/src/levels-workspace-preset-mount.mjs'],
    absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(output.outputFiles.length, 1);
  const source = new TextDecoder().decode(output.outputFiles[0].contents);
  assert.match(source, /mountLevelsWorkspacePreset/u);
  assert.match(source, /levels-preset/u);
  assert.ok(source.length > 20_000);
});
