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
import {createPresetFacade} from '../src/preset-facade.mjs';

const recipe = (exposure = .2) => ({schemaVersion: 1,
  parameters: {exposure, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
const bytes = Buffer.from('SYNTHETIC_NON_RAW_WORKSPACE_PRESET_CLIENT');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-workspace-preset-client-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'workspace-preset-client-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tenant = {'owner-a': 'personal-a', 'owner-b': 'personal-b'};
  const token = (user, expiry = '5m') => new SignJWT({tenant_id: tenant[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'workspace-preset-client-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  async function request(path, {user = 'owner-a', method = 'GET', body} = {}) {
    const response = await fetch(baseURL + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  }
  const wid = (await request('/v1/workspaces', {method: 'POST', body: {name: 'A'}})).body.workspace.id;
  const otherWid = (await request('/v1/workspaces', {user: 'owner-b', method: 'POST', body: {name: 'B'}})).body.workspace.id;
  const projectId = (await request(`/v1/workspaces/${wid}/projects`, {method: 'POST', body: {name: 'Project'}})).body.project.id;
  const assetId = (await request(`/v1/workspaces/${wid}/projects/${projectId}/assets`, {method: 'POST',
    body: {name: 'synthetic.nonraw', size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')}})).body.asset.id;
  const client = (user = 'owner-a', overrides = {}) => new WorkspacePresetClient({baseURL,
    workspaceId: wid, expectedSubject: user, expectedTenantId: tenant[user],
    tokenProvider: () => token(user), ...overrides});
  return {wid, otherWid, projectId, assetId, baseURL, token, request, client,
    async close() {
      await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
      workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
    }};
}

test('WS-PRESET-WEB01 / REAL_JWT_HTTP_SQLITE_NON_RAW: facade-compatible Personal and Workspace list/get/create/update/delete/apply preserve pinned version', async () => {
  const f = await fixture();
  try {
    let tokenCalls = 0; const requests = [];
    const adapter = f.client('owner-a', {tokenProvider: () => {tokenCalls++; return f.token('owner-a');},
      fetchImpl: (url, init) => {requests.push({url, init}); return fetch(url, init);}});
    const facade = createPresetFacade({workspace: adapter});
    const personal = await facade.save({kind: 'PERSONAL', name: 'Mine', recipe: recipe()});
    assert.equal(personal.kind, 'PERSONAL'); assert.equal(personal.version, 1);
    const shared = await facade.save({kind: 'WORKSPACE', name: 'Team', recipe: recipe(.4)});
    assert.equal(shared.kind, 'WORKSPACE');
    assert.deepEqual((await facade.list({kind: 'PERSONAL'})).map(p => p.id), [personal.id]);
    assert.equal((await facade.reload({kind: 'WORKSPACE', id: shared.id})).version, 1);
    const updated = await facade.save({kind: 'PERSONAL', id: personal.id, expectedVersion: 1,
      name: 'Mine v2', recipe: recipe(.5)});
    assert.equal(updated.version, 2);
    const applied = await facade.apply({kind: 'PERSONAL', id: personal.id, version: 2,
      context: {projectId: f.projectId, assetId: f.assetId, baseVersion: 0}});
    assert.equal(applied.outcome, 'saved');
    assert.equal(applied.result.version.presetSnapshot.version, 2);
    assert.equal(applied.result.version.presetSnapshot.id, personal.id);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/projects/${f.projectId}/assets/${f.assetId}/recipe`)).body.recipe.version, 1);
    assert.deepEqual(await adapter.deletePreset(shared.id), {deleted: true, recipeSnapshotsRetained: true});
    assert.ok(!(await adapter.listPresets()).presets.some(p => p.id === shared.id));
    assert.equal(tokenCalls, requests.length / 2);
    for (const {url, init} of requests) {
      assert.ok(url.startsWith(`${f.baseURL}/v1/workspaces/${f.wid}/`));
      assert.ok(!url.includes('eyJ') && !url.includes('Bearer'));
      assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
      assert.equal(init.redirect, 'error'); assert.equal(init.referrerPolicy, 'no-referrer');
      assert.match(init.headers.Authorization, /^Bearer /u);
    }
    const applyRequest = requests.find(item => item.url.endsWith(`/assets/${f.assetId}/preset`));
    assert.deepEqual(JSON.parse(applyRequest.init.body), {baseVersion: 0,
      presetId: personal.id, expectedPresetVersion: 2});
  } finally {await f.close();}
});

test('WS-PRESET-WEB02 / REAL_JWT_HTTP_SQLITE: stale version, Viewer, revoked member, other Workspace and swapped identity fail closed', async () => {
  const f = await fixture();
  try {
    const owner = f.client();
    const first = (await owner.createPreset({scope: 'WORKSPACE', name: 'Shared', body: recipe()})).preset;
    await owner.updatePreset(first.id, {baseVersion: 1, name: 'Shared v2', body: recipe(.3)});
    await assert.rejects(owner.applyPresetVersioned({presetId: first.id, expectedPresetVersion: 1,
      projectId: f.projectId, assetId: f.assetId, baseVersion: 0}),
    error => error instanceof WorkspacePresetHTTPError && error.status === 409 && error.code === 'PRESET_VERSION_CONFLICT');
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/projects/${f.projectId}/assets/${f.assetId}/recipe`)).body.recipe, null);
    const invite = await f.request(`/v1/workspaces/${f.wid}/invitations`, {method: 'POST',
      body: {email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z'}});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/invitations/accept`, {user: 'owner-b', method: 'POST',
      body: {token: invite.body.token}})).status, 200);
    const viewer = f.client('owner-b');
    assert.equal((await viewer.listPresets()).presets.length, 1);
    await assert.rejects(viewer.createPreset({scope: 'PERSONAL', name: 'Denied', body: recipe()}),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/u);
    await assert.rejects(viewer.applyPresetVersioned({presetId: first.id, expectedPresetVersion: 2,
      projectId: f.projectId, assetId: f.assetId, baseVersion: 0}), /WORKSPACE_SESSION_EDIT_FORBIDDEN/u);
    assert.equal((await f.request(`/v1/workspaces/${f.wid}/members/owner-b`, {method: 'DELETE'})).status, 200);
    await assert.rejects(viewer.listPresets(), error => error.status === 403);
    const wrongScope = f.client('owner-a', {workspaceId: f.otherWid});
    await assert.rejects(wrongScope.listPresets(), error => error.status === 403);
    const swapped = f.client('owner-a', {tokenProvider: () => f.token('owner-b')});
    await assert.rejects(swapped.listPresets(), error => error.status === 403 ||
      error.message === 'WORKSPACE_SESSION_IDENTITY_CHANGED');
  } finally {await f.close();}
});

test('WS-PRESET-WEB03: no token persistence, forged response, missing version and abort are fail-closed', async () => {
  const f = await fixture();
  try {
    const base = f.client();
    assert.ok(!Object.values(base).some(value => typeof value === 'string' && value.startsWith('eyJ')));
    assert.throws(() => f.client('owner-a', {baseURL: 'http://example.com'}), /WORKSPACE_SESSION_CONFIG_INVALID/u);
    assert.throws(() => f.client('owner-a', {baseURL: `${f.baseURL}/trial`}), /WORKSPACE_SESSION_CONFIG_INVALID/u);
    await assert.rejects(base.applyPresetVersioned({presetId: crypto.randomUUID(),
      projectId: f.projectId, assetId: f.assetId, baseVersion: 0}), /WORKSPACE_PRESET_VERSION_INVALID/u);
    const controller = new AbortController(); controller.abort();
    let calls = 0;
    const aborted = f.client('owner-a', {tokenProvider: () => {calls++; return f.token('owner-a');}});
    await assert.rejects(aborted.listPresets({signal: controller.signal}), {name: 'AbortError'});
    assert.equal(calls, 0);
    const forged = f.client('owner-a', {fetchImpl: (url, init) => url.endsWith('/presets')
      ? Promise.resolve({ok: true, status: 200, redirected: false, json: async () => ({presets: [
        {id: crypto.randomUUID(), workspaceId: f.otherWid, scope: 'WORKSPACE',
          ownerUserId: 'owner-a', name: 'Wrong', version: 1, body: recipe(),
          createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z', deletedAt: null},
      ]})}) : fetch(url, init)});
    await assert.rejects(forged.listPresets(), /WORKSPACE_PRESET_RESPONSE_INVALID/u);
    const unavailable = f.client('owner-a', {tokenProvider: () => {throw Error('sensitive-token');}});
    await assert.rejects(unavailable.listPresets(), error =>
      error.message === 'WORKSPACE_PRESET_TOKEN_UNAVAILABLE' && !error.message.includes('sensitive-token'));
  } finally {await f.close();}
});
