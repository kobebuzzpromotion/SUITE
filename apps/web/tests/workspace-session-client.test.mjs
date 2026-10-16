import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../../../dist/apps/backend/src/repository.js';
import {LocalObjectStorage} from '../../../dist/apps/backend/src/storage.js';
import {WorkspaceHTTP} from '../../../dist/apps/backend/src/workspace-server.js';
import {suiteServer} from '../../../dist/apps/backend/src/server.js';
import {jwtAuthenticator} from '../../../dist/apps/backend/src/auth.js';
import {WorkspaceSessionClient, WorkspaceSessionHTTPError} from '../src/workspace-session-client.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-workspace-session-client-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'web-session-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  const tenants = {'owner-a': 'personal-a', 'owner-b': 'personal-b'};
  const token = (user, expiry = '5m') => new SignJWT({tenant_id: tenants[user], email: `${user}@example.test`,
    email_verified: true}).setProtectedHeader({alg: 'RS256', kid: 'web-session-test'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const request = async (path, {user = 'owner-a', method = 'GET', body} = {}) => {
    const response = await fetch(baseURL + path, {method, headers: {authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'content-type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json()};
  };
  const a = (await request('/v1/workspaces', {method: 'POST', body: {name: 'Studio A'}})).body.workspace.id;
  const b = (await request('/v1/workspaces', {user: 'owner-b', method: 'POST', body: {name: 'Studio B'}})).body.workspace.id;
  return {a, b, baseURL, token, request, async close() {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
  }};
}

const scope = (workspaceId, subject = 'owner-a', tenantId = 'personal-a', access = 'read') =>
  ({workspaceId, expectedSubject: subject, expectedTenantId: tenantId, access});

test('WS-WEB01 / REAL_JWT_HTTP_SQLITE: fresh Node membership gates read/edit and rejects role loss, revoke and other Workspace', async () => {
  const f = await fixture();
  try {
    let tokenCalls = 0; const observed = [];
    const client = new WorkspaceSessionClient({baseURL: f.baseURL,
      tokenProvider: async () => {tokenCalls++; return f.token('owner-a');},
      fetchImpl: (url, init) => {observed.push({url, init}); return fetch(url, init);}});
    const own = await client.getFreshSession(scope(f.a));
    assert.equal(own.subject, 'owner-a'); assert.equal(own.tenantId, 'personal-a');
    assert.equal(own.workspaceId, f.a); assert.equal(own.membership.role, 'OWNER');
    assert.notEqual(own.tenantId, own.workspaceId);
    assert.ok(Object.isFrozen(own)); assert.ok(Object.isFrozen(own.membership));
    assert.equal((await client.getFreshSession(scope(f.a, 'owner-a', 'personal-a', 'edit'))).membership.role, 'OWNER');
    assert.equal(tokenCalls, 2);
    for (const item of observed) {
      assert.equal(item.url, `${f.baseURL}/v1/workspaces/${f.a}/session`);
      assert.ok(!item.url.includes('Bearer') && !item.url.includes('eyJ'));
      assert.equal(item.init.method, 'GET'); assert.equal(item.init.credentials, 'omit');
      assert.equal(item.init.cache, 'no-store'); assert.equal(item.init.redirect, 'error');
      assert.equal(item.init.referrerPolicy, 'no-referrer');
      assert.ok(item.init.headers.Authorization.startsWith('Bearer '));
    }
    await assert.rejects(client.getFreshSession(scope(f.b)),
      error => error instanceof WorkspaceSessionHTTPError && error.status === 403);
    const invite = await f.request(`/v1/workspaces/${f.a}/invitations`, {method: 'POST', body: {
      email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z',
    }});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${f.a}/invitations/accept`, {user: 'owner-b', method: 'POST',
      body: {token: invite.body.token}})).status, 200);
    const member = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-b')});
    const viewer = await member.getFreshSession(scope(f.a, 'owner-b', 'personal-b'));
    assert.equal(viewer.membership.role, 'VIEWER');
    await assert.rejects(member.getFreshSession(scope(f.a, 'owner-b', 'personal-b', 'edit')),
      /WORKSPACE_SESSION_EDIT_FORBIDDEN/u);
    assert.equal((await f.request(`/v1/workspaces/${f.a}/members/owner-b`, {method: 'PATCH', body: {role: 'EDITOR'}})).status, 200);
    assert.equal((await member.getFreshSession(scope(f.a, 'owner-b', 'personal-b', 'edit'))).membership.role, 'EDITOR');
    assert.equal((await f.request(`/v1/workspaces/${f.a}/members/owner-b`, {method: 'DELETE'})).status, 200);
    await assert.rejects(member.getFreshSession(scope(f.a, 'owner-b', 'personal-b')),
      error => error instanceof WorkspaceSessionHTTPError && error.status === 403);
    assert.equal((await member.getFreshSession(scope(f.b, 'owner-b', 'personal-b'))).membership.role, 'OWNER');
  } finally {await f.close();}
});

test('WS-WEB02 / REAL_JWT_HTTP_SQLITE: expired and swapped identity fail closed before Project/Asset/Culling callers', async () => {
  const f = await fixture();
  try {
    const expired = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-a', '0s')});
    await assert.rejects(expired.getFreshSession(scope(f.a)),
      error => error instanceof WorkspaceSessionHTTPError && error.status === 401);
    const bad = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => 'invalid'});
    await assert.rejects(bad.getFreshSession(scope(f.a)),
      error => error instanceof WorkspaceSessionHTTPError && error.status === 401);
    const swapped = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-b')});
    await assert.rejects(swapped.getFreshSession(scope(f.b)), /WORKSPACE_SESSION_IDENTITY_CHANGED/u);
    await assert.rejects(swapped.getFreshSession(scope(f.a)),
      error => error instanceof WorkspaceSessionHTTPError && error.status === 403);
    await assert.rejects(new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-a')})
      .getFreshSession(scope(f.a, 'owner-a', 'personal-b')), /WORKSPACE_SESSION_IDENTITY_CHANGED/u);
  } finally {await f.close();}
});

test('WS-WEB03: forged JSON, unsafe origin, abort and provider failures never yield authority or leak secrets', async () => {
  const f = await fixture();
  try {
    const valid = {session: {subject: 'owner-a', tenantId: 'personal-a', workspaceId: f.a,
      membership: {userId: 'owner-a', role: 'OWNER', joinedAt: '2026-10-04T00:00:00.000Z'}}};
    const fake = body => new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-a'),
      fetchImpl: async () => ({ok: true, status: 200, json: async () => body})});
    const forged = [
      {...valid, token: 'secret'},
      {session: {...valid.session, workspaceId: f.b}},
      {session: {...valid.session, subject: 'owner-b'}},
      {session: {...valid.session, tenantId: 'personal-b'}},
      {session: {...valid.session, membership: {...valid.session.membership, userId: 'owner-b'}}},
      {session: {...valid.session, membership: {...valid.session.membership, role: 'SUPERUSER'}}},
      {session: {...valid.session, membership: {...valid.session.membership, joinedAt: 'not-a-date'}}},
      {session: {...valid.session, membership: {...valid.session.membership, extra: true}}},
    ];
    for (const body of forged)
      await assert.rejects(fake(body).getFreshSession(scope(f.a)), /WORKSPACE_SESSION_RESPONSE_INVALID|WORKSPACE_SESSION_IDENTITY_CHANGED/u);
    for (const baseURL of ['http://example.com', 'https://user:secret@example.com', `${f.baseURL}/trial`, `${f.baseURL}/?token=x`])
      assert.throws(() => new WorkspaceSessionClient({baseURL, tokenProvider: () => 'x'}), /WORKSPACE_SESSION_CONFIG_INVALID/u);
    let calls = 0; const controller = new AbortController(); controller.abort();
    const client = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => {calls++; return 'secret-token';}});
    await assert.rejects(client.getFreshSession({...scope(f.a), signal: controller.signal}), {name: 'AbortError'});
    assert.equal(calls, 0);
    const duringJSON = new AbortController();
    const waiting = new WorkspaceSessionClient({baseURL: f.baseURL, tokenProvider: () => f.token('owner-a'),
      fetchImpl: async (_url, init) => ({ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), {once: true});
      })})});
    const pending = waiting.getFreshSession({...scope(f.a), signal: duringJSON.signal});
    setTimeout(() => duringJSON.abort(), 5);
    await assert.rejects(pending, {name: 'AbortError'});
    const unavailable = new WorkspaceSessionClient({baseURL: f.baseURL,
      tokenProvider: () => {throw Error('secret-token-in-provider-error');}});
    await assert.rejects(unavailable.getFreshSession(scope(f.a)), error =>
      error.message === 'WORKSPACE_SESSION_TOKEN_UNAVAILABLE' && !error.message.includes('secret-token'));
    await assert.rejects(client.getFreshSession({...scope(f.a), expectedTenantId: undefined}),
      /WORKSPACE_SESSION_SCOPE_INVALID/u);
  } finally {await f.close();}
});
