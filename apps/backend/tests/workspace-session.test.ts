import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-workspace-session-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'workspace-session-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  const tenants: Record<string, string> = {'owner-a': 'personal-a', 'owner-b': 'personal-b'};
  const token = (user: string, expiry = '5m') => new SignJWT({tenant_id: tenants[user],
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'workspace-session-test'})
    .setIssuer('https://issuer.example').setAudience('suite')
    .setSubject(user).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const request = async (path: string, {user = 'owner-a', method = 'GET', body,
    bearer}: {user?: string; method?: string; body?: unknown; bearer?: string | null} = {}) => {
    const authorization = bearer === null ? undefined : `Bearer ${bearer ?? await token(user)}`;
    const response = await fetch(baseURL + path, {method, headers: {
      ...(authorization === undefined ? {} : {authorization}),
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, headers: response.headers, body: await response.json() as Record<string, any>};
  };
  return {workspace, request, token, async close() {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
  }};
}

test('WS-SESSION01 / REAL_JWT_HTTP_SQLITE: signed subject, tenant and current membership are scoped to two Workspaces', async () => {
  const f = await fixture();
  try {
    const a = (await f.request('/v1/workspaces', {method: 'POST', body: {name: 'Studio A'}})).body.workspace.id as string;
    const b = (await f.request('/v1/workspaces', {user: 'owner-b', method: 'POST', body: {name: 'Studio B'}})).body.workspace.id as string;
    const pathA = `/v1/workspaces/${a}`, pathB = `/v1/workspaces/${b}`;
    assert.notEqual(a, b);
    const ownerA = await f.request(`${pathA}/session`);
    assert.equal(ownerA.status, 200); assert.equal(ownerA.headers.get('cache-control'), 'no-store');
    assert.equal(ownerA.body.session.subject, 'owner-a');
    assert.equal(ownerA.body.session.tenantId, 'personal-a');
    assert.notEqual(ownerA.body.session.tenantId, a);
    assert.equal(ownerA.body.session.workspaceId, a);
    assert.deepEqual(Object.keys(ownerA.body.session.membership).sort(), ['joinedAt', 'role', 'userId']);
    assert.equal(ownerA.body.session.membership.userId, 'owner-a');
    assert.equal(ownerA.body.session.membership.role, 'OWNER');
    assert.equal(typeof ownerA.body.session.membership.joinedAt, 'string');
    assert.equal(JSON.stringify(ownerA.body).match(/token|secret|authorization/iu), null);
    assert.equal((await f.request(`${pathA}/session`, {user: 'owner-b'})).status, 403);
    assert.equal((await f.request(`${pathB}/session`)).status, 403);
    const ownerB = await f.request(`${pathB}/session`, {user: 'owner-b'});
    assert.equal(ownerB.status, 200);
    assert.equal(ownerB.body.session.subject, 'owner-b');
    assert.equal(ownerB.body.session.tenantId, 'personal-b');
    assert.equal(ownerB.body.session.membership.role, 'OWNER');

    const invite = await f.request(`${pathA}/invitations`, {method: 'POST', body: {
      email: 'owner-b@example.test', role: 'VIEWER', expiresAt: '2099-01-01T00:00:00.000Z',
    }});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`${pathA}/invitations/accept`, {user: 'owner-b', method: 'POST',
      body: {token: invite.body.token}})).status, 200);
    const viewer = await f.request(`${pathA}/session?subject=owner-a&tenantId=personal-a&role=OWNER`, {user: 'owner-b'});
    assert.equal(viewer.status, 200);
    assert.equal(viewer.body.session.subject, 'owner-b');
    assert.equal(viewer.body.session.tenantId, 'personal-b');
    assert.equal(viewer.body.session.workspaceId, a);
    assert.equal(viewer.body.session.membership.role, 'VIEWER');
    assert.equal((await f.request(`${pathA}/members/owner-b`, {method: 'PATCH', body: {role: 'EDITOR'}})).status, 200);
    assert.equal((await f.request(`${pathA}/session`, {user: 'owner-b'})).body.session.membership.role, 'EDITOR');
    assert.equal((await f.request(`${pathA}/members/owner-b`, {method: 'DELETE'})).status, 200);
    assert.equal((await f.request(`${pathA}/session`, {user: 'owner-b'})).status, 403);
    assert.equal((await f.request(`${pathB}/session`, {user: 'owner-b'})).status, 200);
  } finally {await f.close();}
});

test('WS-SESSION02 / REAL_JWT_HTTP_SQLITE: missing, expired or invalid token cannot read a member session', async () => {
  const f = await fixture();
  try {
    const workspaceId = (await f.request('/v1/workspaces', {method: 'POST', body: {name: 'Private Studio'}})).body.workspace.id as string;
    const path = `/v1/workspaces/${workspaceId}/session`;
    assert.equal((await f.request(path, {bearer: null})).status, 401);
    assert.equal((await f.request(path, {bearer: 'invalid'})).status, 401);
    assert.equal((await f.request(path, {bearer: await f.token('owner-a', '0s')})).status, 401);
    assert.equal((await f.request(path, {user: 'owner-b'})).status, 403);
    assert.equal((await f.request(path)).status, 200);
  } finally {await f.close();}
});
