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
import {mountWorkspaceCullingPanel} from '../src/workspace-culling-panel.mjs';

class Node {
  constructor(doc, tag) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.listeners = new Map(); this.attributes = new Map(); this.value = ''; this.textContent = ''; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  dispatch(type) { const fn = this.listeners.get(type); assert.ok(fn, `missing ${type} on ${this.tagName}`); return fn({preventDefault() {}, key: type}); }
  focus() { this.ownerDocument.focused = this; }
}
function dom() {
  const doc = {focused: null, createElement(tag) { return new Node(doc, tag); }};
  const container = new Node(doc, 'main');
  const find = predicate => {
    const walk = node => predicate(node) ? node : node.children.map(walk).find(Boolean);
    const found = walk(container);assert.ok(found, 'control not found');return found;
  };
  const label = value => find(node => node.attributes.get('aria-label') === value);
  const button = value => find(node => node.tagName === 'button' && node.textContent === value);
  return {doc, container, find, label, button};
}
async function until(predicate, message) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 4000) throw Error(`timeout: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-culling-controls-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);jwk.kid = 'culling-controls';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite', jwks: createLocalJWKSet({keys: [jwk]})});
  const http = new WorkspaceHTTP(root, assets, storage);
  let server;
  try {
    const owner = {userId: 'owner'}, viewer = {userId: 'viewer'};
    const workspace = http.workspaces.createWorkspace(owner, 'Manual Studio');
    const project = http.workspaces.createProject(owner, workspace.id, 'Manual Project');
    const bytes = Buffer.from('manual controls synthetic non-RAW');
    const asset = assets.create(workspace.id, {name: 'image.bin', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length});
    http.workspaces.registerAsset(owner, workspace.id, project.id, asset.id);
    const invite = http.workspaces.inviteMember(owner, workspace.id, {email: 'viewer@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'});
    http.workspaces.acceptInvitation(viewer, workspace.id, invite.token, 'viewer@example.test');
    server = suiteServer(assets, storage, authenticate, http);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();assert.ok(address && typeof address !== 'string');
    const token = async (user = 'owner') => new SignJWT({tenant_id: 'personal', email: `${user}@example.test`, email_verified: true})
      .setProtectedHeader({alg: 'RS256', kid: 'culling-controls'}).setIssuer('https://issuer.example').setAudience('suite')
      .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return {root, assets, http, owner, viewer, workspace, project, asset, token,
      baseURL: `http://127.0.0.1:${address.port}`,
      async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));http.close();assets.close();await rm(root, {recursive: true, force: true}); }};
  } catch (error) { if (server?.listening) await new Promise(resolve => server.close(resolve));http.close();assets.close();await rm(root, {recursive: true, force: true});throw error; }
}
function mount(f, ui, user = 'owner', fetchImpl) {
  return mountWorkspaceCullingPanel({container: ui.container, baseURL: f.baseURL, tokenProvider: () => f.token(user),
    workspaceId: f.workspace.id, projectId: f.project.id, assetId: f.asset.id, ...(fetchImpl ? {fetchImpl} : {})});
}

test('CULLING-CONTROLS01 / JWT HTTP SQLite: selected Asset color and Segment create/rename/reorder are verified after write', async () => {
  const f = await fixture();try {
    const ui = dom(), panel = mount(f, ui), original = f.assets.get(f.workspace.id, f.asset.id);
    await until(() => panel.getState().phase === 'ready', 'initial read');
    const initialVersion = f.http.workspaces.getCullingVersion(f.owner, f.workspace.id, f.project.id);
    assert.equal(panel.getState().version, initialVersion);
    const scope = {workspaceId: f.workspace.id, projectId: f.project.id, assetId: f.asset.id};
    const add = async (id, name, expected) => {
      ui.label('新規Segment ID').value = id;ui.label('新規Segment名').value = name;
      ui.find(node => node.tagName === 'form' && node.className === 'suite-culling-panel__segment').dispatch('submit');
      await until(() => panel.getState().version === expected && panel.getState().phase === 'ready', 'segment write');
    };
    await add('opening', 'Opening', initialVersion + 1);await add('closing', 'Closing', initialVersion + 2);
    assert.equal(ui.label('管理するSegment').value, 'closing');
    ui.label('変更後のSegment名').value = 'Delivery';ui.button('名前を変更').dispatch('click');
    await until(() => panel.getState().version === initialVersion + 3 && panel.getState().phase === 'ready', 'rename');
    ui.button('前へ移動').dispatch('click');
    await until(() => panel.getState().version === initialVersion + 4 && panel.getState().phase === 'ready', 'reorder');
    ui.label('手動カラーラベル').value = '確認待ち';ui.label('星の数').value = '4';
    ui.label('Story Segment').value = 'closing';
    ui.find(node => node.tagName === 'form' && !node.className).dispatch('submit');
    await until(() => panel.getState().version === initialVersion + 5 && panel.getState().phase === 'ready', 'mark');
    const read = f.http.workspaces.getCullingMark(f.owner, f.workspace.id, f.project.id, f.asset.id);
    assert.equal(read.colorLabel, '確認待ち');assert.equal(read.rating, 4);assert.equal(read.segmentId, 'closing');
    assert.equal(read.assetId, f.asset.id);
    const page = f.http.workspaces.getCullingPage(f.owner, f.workspace.id, f.project.id, 1);
    assert.deepEqual(page.segments.map(item => [item.id, item.name]), [['closing', 'Delivery'], ['opening', 'Opening']]);
    assert.equal(f.assets.get(f.workspace.id, f.asset.id).sha256, original.sha256);
    assert.equal(f.assets.get(f.workspace.id, f.asset.id).originalKey, original.originalKey);
    assert.match(ui.find(node => node.attributes.get('role') === 'status').textContent, /保存済み/u);
    assert.match(ui.find(node => node.tagName === 'style').textContent, /focus-visible/u);
    assert.match(ui.find(node => node.tagName === 'style').textContent, /max-width:600px/u);
    assert.match(ui.find(node => node.tagName === 'style').textContent, /min-height:44px/u);
    panel.dispose();
  } finally { await f.close(); }
});

test('CULLING-CONTROLS02 / JWT HTTP SQLite: CAS conflict and viewer role fail closed without success text', async () => {
  const f = await fixture();try {
    const ui = dom(), panel = mount(f, ui);await until(() => panel.getState().phase === 'ready', 'owner read');
    const initialVersion = f.http.workspaces.getCullingVersion(f.owner, f.workspace.id, f.project.id);
    assert.equal(panel.getState().version, initialVersion);
    f.http.workspaces.createCullingSegment(f.owner, f.workspace.id, f.project.id, {baseVersion: initialVersion, id: 'external', name: 'External'});
    ui.label('手動カラーラベル').value = 'late';
    ui.find(node => node.tagName === 'form' && !node.className).dispatch('submit');
    await until(() => panel.getState().phase === 'conflict', 'stale CAS');
    assert.match(ui.find(node => node.attributes.get('role') === 'status').textContent, /409/u);
    assert.equal(ui.button('名前を変更').disabled, true);
    assert.equal(f.http.workspaces.getCullingMark(f.owner, f.workspace.id, f.project.id, f.asset.id).colorLabel, null);
    panel.dispose();
    const viewerUI = dom(), viewerPanel = mount(f, viewerUI, 'viewer');
    await until(() => viewerPanel.getState().phase === 'ready', 'viewer read');
    viewerUI.label('手動カラーラベル').value = 'forbidden';
    viewerUI.find(node => node.tagName === 'form' && !node.className).dispatch('submit');
    await until(() => viewerPanel.getState().phase === 'denied', 'viewer 403');
    assert.doesNotMatch(viewerUI.find(node => node.attributes.get('role') === 'status').textContent, /保存済み/u);
    assert.equal(viewerUI.button('この写真のマークを保存').disabled, true);
    viewerPanel.dispose();
  } finally { await f.close(); }
});

test('CULLING-CONTROLS03: cancelled write and revoked token cannot show a verified save', async () => {
  const f = await fixture();try {
    let pendingWrite;
    const fetchImpl = (url, init) => init.method === 'PUT' ? new Promise((resolve, reject) => {
      pendingWrite = true;
      init.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {once: true});
    }) : fetch(url, init);
    const ui = dom(), panel = mount(f, ui, 'owner', fetchImpl);
    await until(() => panel.getState().phase === 'ready', 'initial owner read');
    ui.label('手動カラーラベル').value = 'cancelled';
    ui.find(node => node.tagName === 'form' && !node.className).dispatch('submit');
    await until(() => pendingWrite === true, 'pending write');
    assert.doesNotMatch(ui.find(node => node.attributes.get('role') === 'status').textContent, /保存済み/u);
    ui.button('通信を取消').dispatch('click');
    await until(() => panel.getState().phase === 'uncertain', 'cancelled write');
    assert.equal(ui.button('この写真のマークを保存').disabled, true);
    assert.equal(f.http.workspaces.getCullingMark(f.owner, f.workspace.id, f.project.id, f.asset.id).colorLabel, null);
    panel.dispose();

    const deniedUI = dom();
    const denied = mountWorkspaceCullingPanel({container: deniedUI.container, baseURL: f.baseURL,
      tokenProvider: () => 'revoked.jwt', workspaceId: f.workspace.id, projectId: f.project.id, assetId: f.asset.id});
    await until(() => denied.getState().phase === 'denied', 'bad token 401');
    assert.equal(deniedUI.button('この写真のマークを保存').disabled, true);
    assert.doesNotMatch(deniedUI.find(node => node.attributes.get('role') === 'status').textContent, /保存済み/u);
    denied.dispose();
  } finally { await f.close(); }
});
