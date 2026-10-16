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
import {mountVerifiedWorkspaceCulling} from '../src/workspace-culling-verified-mount.mjs';

class Node {
  constructor(doc, tag) {this.ownerDocument = doc;this.tagName = tag;this.children = [];this.listeners = new Map();this.attributes = new Map();this.value = '';this.textContent = '';this.disabled = false;}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children = nodes;}
  setAttribute(key, value) {this.attributes.set(key, value);}
  addEventListener(type, fn) {this.listeners.set(type, fn);}
  dispatch(type, event = {}) {const fn = this.listeners.get(type);assert.ok(fn, `missing ${type}`);return fn({preventDefault() {}, ...event});}
  focus() {this.ownerDocument.focused = this;}
}
function dom() {
  const doc = {focused: null, createElement(tag) {return new Node(doc, tag);}};
  const container = new Node(doc, 'main');
  const find = predicate => {
    const walk = node => predicate(node) ? node : node.children.map(walk).find(Boolean);
    const found = walk(container);assert.ok(found, 'control not found');return found;
  };
  return {doc, container, find,
    label: name => find(node => node.attributes.get('aria-label') === name),
    button: name => find(node => node.tagName === 'button' && node.textContent === name),
    status: () => find(node => node.attributes.get('role') === 'status')};
}
async function until(predicate, message) {
  const start = Date.now();while (!predicate()) {
    if (Date.now() - start > 7000) throw Error(`timeout: ${typeof message === 'function' ? message() : message}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-culling-filter-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);jwk.kid = 'culling-filter';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite', jwks: createLocalJWKSet({keys: [jwk]})});
  const http = new WorkspaceHTTP(root, assets, storage);
  let server;
  try {
    const owner = {userId: 'owner'}, workspace = http.workspaces.createWorkspace(owner, 'Filter Studio');
    const project = http.workspaces.createProject(owner, workspace.id, 'Filter Project');
    const createAsset = index => {
      const bytes = Buffer.from(`synthetic-filter-${index}`);
      const asset = assets.create(workspace.id, {name: `image-${index}.bin`, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length});
      http.workspaces.registerAsset(owner, workspace.id, project.id, asset.id);return asset;
    };
    const images = Array.from({length: 205}, (_, i) => createAsset(i));
    const assetSetVersion = http.workspaces.getCullingVersion(owner, workspace.id, project.id);
    assert.equal(assetSetVersion, images.length);
    const segment = http.workspaces.createCullingSegment(owner, workspace.id, project.id,
      {baseVersion: assetSetVersion, id: 'keepers', name: 'Keepers'});
    assert.equal(segment.version, assetSetVersion + 1);
    http.workspaces.saveCullingMark(owner, workspace.id, project.id, images[0].id,
      {baseVersion: segment.version, rating: 4, flag: 'pick', colorLabel: 'Red', tags: [], segmentId: 'keepers'});
    http.workspaces.saveCullingMark(owner, workspace.id, project.id, images[1].id,
      {baseVersion: segment.version + 1, rating: 4, flag: 'pick', colorLabel: 'Blue', tags: [], segmentId: 'keepers'});
    server = suiteServer(assets, storage, authenticate, http);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();assert.ok(address && typeof address !== 'string');
    const token = async (user = 'owner', tenant = 'personal') => new SignJWT({tenant_id: tenant, email: `${user}@example.test`, email_verified: true})
      .setProtectedHeader({alg: 'RS256', kid: 'culling-filter'}).setIssuer('https://issuer.example').setAudience('suite')
      .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return {root, assets, http, owner, workspace, project, images, token, createAsset,
      baseURL: `http://127.0.0.1:${address.port}`,
      async close() {await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));http.close();assets.close();await rm(root, {recursive: true, force: true});}};
  } catch (error) {if (server?.listening) await new Promise(resolve => server.close(resolve));http.close();assets.close();await rm(root, {recursive: true, force: true});throw error;}
}
async function mount(f, ui, overrides = {}) {
  const assetId = f.images[0].id;
  return mountVerifiedWorkspaceCulling({container: ui.container, baseURL: f.baseURL,
    tokenProvider: () => f.token(), selectionProvider: () => ({workspaceId: f.workspace.id, projectId: f.project.id, assetId}),
    workspaceId: f.workspace.id, projectId: f.project.id, assetId, expectedSubject: 'owner', expectedTenantId: 'personal', ...overrides});
}

test('CULLING-FILTER01 / JWT HTTP SQLite: all 205 saved marks, exact four filters and explicit IDs stay UI-only', async () => {
  const f = await fixture();try {
    const ui = dom(), panel = await mount(f, ui);
    await until(() => panel.getState().phase === 'ready', 'initial host read');
    ui.button('Project全件を取得').dispatch('click');
    await until(() => panel.getState().loadedMarkCount === 205 && panel.getState().phase === 'ready',
      () => `two full pages twice: ${JSON.stringify(panel.getState())} ${ui.status().textContent}`);
    assert.equal(ui.label('絞り込み結果から写真を明示選択').children.length, 205);
    ui.label('Starsで絞り込む').value = '4';ui.label('Starsで絞り込む').dispatch('change');
    assert.equal(ui.label('絞り込み結果から写真を明示選択').children.length, 2);
    ui.label('Flagで絞り込む').value = 'pick';ui.label('Flagで絞り込む').dispatch('change');
    ui.label('カラーラベルで絞り込む').value = 'value:Red';ui.label('カラーラベルで絞り込む').dispatch('change');
    ui.label('Segmentで絞り込む').value = 'value:keepers';ui.label('Segmentで絞り込む').dispatch('change');
    const results = ui.label('絞り込み結果から写真を明示選択');
    assert.equal(results.children.length, 1);
    assert.equal(results.children[0].children[0].attributes.get('aria-label'), `写真 ${f.images[0].id} を選択`);
    const checkbox = results.children[0].children[0];checkbox.checked = true;checkbox.dispatch('change');
    assert.equal(panel.getState().selectedCount, 1);
    assert.equal('selectedAssetIds' in panel.getState(), false);
    assert.equal('getVerifiedSelection' in panel, false);
    ui.button('選択を再確認').dispatch('click');
    await until(() => /1件の明示選択/u.test(ui.status().textContent), 'fresh confirmation');
    assert.match(ui.status().textContent, /Final出力には未接続/u);
    ui.label('カラーラベルで絞り込む').value = 'value:Blue';ui.label('カラーラベルで絞り込む').dispatch('change');
    assert.equal(panel.getState().selectedCount, 0);
    assert.equal(results.children.length, 1);
    assert.equal(results.children[0].children[0].attributes.get('aria-label'), `写真 ${f.images[1].id} を選択`);
    assert.equal(ui.button('選択を再確認').disabled, true);
    panel.dispose();
  } finally {await f.close();}
});

test('CULLING-FILTER02 / JWT HTTP SQLite: Asset-set version changes during traversal and fail closed', async () => {
  const f = await fixture();try {
    let traversals = 0, injected = false;
    const fetchImpl = (url, init) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/culling') && parsed.searchParams.get('limit') === '200' &&
          parsed.searchParams.get('after') === null && ++traversals === 2) {
        f.createAsset(206);injected = true;
      }
      return fetch(url, init);
    };
    const ui = dom(), panel = await mount(f, ui, {fetchImpl});
    await until(() => panel.getState().phase === 'ready', 'initial');
    const beforeVersion = f.http.workspaces.getCullingVersion(f.owner, f.workspace.id, f.project.id);
    ui.button('Project全件を取得').dispatch('click');
    await until(() => panel.getState().phase === 'conflict', 'two traversals disagree');
    assert.equal(injected, true);
    assert.equal(f.http.workspaces.getCullingVersion(f.owner, f.workspace.id, f.project.id), beforeVersion + 1);
    assert.equal(panel.getState().loadedMarkCount, null);
    assert.equal(panel.getState().selectedCount, 0);
    assert.equal(ui.button('選択を再確認').disabled, true);
    panel.dispose();
  } finally {await f.close();}
});

test('CULLING-FILTER03 / JWT HTTP SQLite: changed host Asset and tenant revoke candidate selection', async () => {
  const f = await fixture();try {
    let selectedAssetId = f.images[0].id, tenant = 'personal';
    const ui = dom(), panel = await mount(f, ui, {
      selectionProvider: () => ({workspaceId: f.workspace.id, projectId: f.project.id, assetId: selectedAssetId}),
      tokenProvider: () => f.token('owner', tenant),
    });
    await until(() => panel.getState().phase === 'ready', 'initial');
    ui.button('Project全件を取得').dispatch('click');
    await until(() => panel.getState().loadedMarkCount === 205,
      () => `all pages: ${JSON.stringify(panel.getState())} ${ui.status().textContent}`);
    const checkbox = ui.label('絞り込み結果から写真を明示選択').children[0].children[0];
    checkbox.checked = true;checkbox.dispatch('change');
    selectedAssetId = f.images[1].id;
    ui.button('選択を再確認').dispatch('click');
    await until(() => panel.getState().phase === 'denied', 'host Asset switched');
    assert.equal(panel.getState().selectedCount, 0);
    assert.equal(ui.button('選択を再確認').disabled, true);
    panel.dispose();

    const secondUI = dom(), second = await mount(f, secondUI, {tokenProvider: () => f.token('owner', tenant)});
    await until(() => second.getState().phase === 'ready', 'second initial');
    tenant = 'changed-tenant';
    secondUI.button('Project全件を取得').dispatch('click');
    await until(() => second.getState().phase === 'denied', 'tenant changed');
    assert.equal(second.getState().selectedCount, 0);
    second.dispose();
  } finally {await f.close();}
});

test('CULLING-FILTER04 / JWT HTTP SQLite: later Asset registration increments CAS and invalidates an already chosen list', async () => {
  const f = await fixture();try {
    const ui = dom(), panel = await mount(f, ui);
    await until(() => panel.getState().phase === 'ready', 'initial');
    ui.button('Project全件を取得').dispatch('click');
    await until(() => panel.getState().loadedMarkCount === 205, 'loaded');
    const checkbox = ui.label('絞り込み結果から写真を明示選択').children[0].children[0];
    checkbox.checked = true;checkbox.dispatch('change');
    const version = panel.getState().version;
    f.createAsset(207);
    assert.equal(f.http.workspaces.getCullingVersion(f.owner, f.workspace.id, f.project.id), version + 1);
    ui.button('選択を再確認').dispatch('click');
    await until(() => panel.getState().phase === 'conflict', 'changed Asset set');
    assert.equal(panel.getState().selectedCount, 0);
    assert.equal(panel.getState().loadedMarkCount, null);
    assert.equal(ui.button('選択を再確認').disabled, true);
    assert.doesNotMatch(ui.status().textContent, /再確認しました/u);
    panel.dispose();
  } finally {await f.close();}
});
