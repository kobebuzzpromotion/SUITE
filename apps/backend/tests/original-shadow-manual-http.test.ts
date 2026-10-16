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

const neutral = () => ({schemaVersion: 1, parameters: {exposure: .2,
  contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {oldColor: {value: 3}},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
const manual = (target: {id: string; sha256: string}, backdrop: {id: string; sha256: string}) => ({
  schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-original-shadow-1',
  source: 'owner-manual-input-unverified',
  binding: {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: 40, sourceHeight: 20,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256},
  subjectStrokes: [{operation: 'ADD', path: [{u: .3, v: .4}],
    radiusFraction: .05, hardness: .8}],
  shadowStrokes: [{operation: 'ADD', path: [{u: .7, v: .8}],
    radiusFraction: .1, hardness: .6}], settings: {opacity: 72},
});
const boundRecipe = (target: {id: string; sha256: string}, backdrop: {id: string; sha256: string}) => {
  const body = neutral();
  (body.parameters.extendedParameters as Record<string, unknown>).originalShadowManual =
    manual(target, backdrop);
  return body;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-original-shadow-http-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'original-shadow-test';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example',
    audience: 'suite', jwks: createLocalJWKSet({keys: [jwk]})});
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  const token = (user: string) => new SignJWT({tenant_id: `personal-${user}`,
    email: `${user}@example.test`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'original-shadow-test'})
    .setIssuer('https://issuer.example').setAudience('suite')
    .setSubject(user).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const request = async (path: string, user = 'owner', method = 'GET', body?: unknown) => {
    const response = await fetch(baseURL + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {status: response.status, body: await response.json() as Record<string, any>};
  };
  return {request, async close() {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    workspace.close(); assets.close(); await rm(root, {recursive: true, force: true});
  }};
}

test('ORIGINAL-SHADOW-HTTP-01 / JWT_SQLITE_NON_RAW: two registered Assets, saved base, CAS and rollback', async () => {
  const f = await fixture();
  try {
    const created = await f.request('/v1/workspaces', 'owner', 'POST', {name: 'Studio'});
    assert.equal(created.status, 201);
    const ws = created.body.workspace.id as string;
    const project = (await f.request(`/v1/workspaces/${ws}/projects`, 'owner', 'POST',
      {name: 'Photos'})).body.project.id as string;
    const prefix = `/v1/workspaces/${ws}/projects/${project}`;
    const target = (await f.request(`${prefix}/assets`, 'owner', 'POST',
      {name: 'target.nonraw', sha256: 'a'.repeat(64), size: 32})).body.asset;
    const backdrop = (await f.request(`${prefix}/assets`, 'owner', 'POST',
      {name: 'backdrop.nonraw', sha256: 'b'.repeat(64), size: 33})).body.asset;
    const endpoint = `${prefix}/assets/${target.id}/recipe`;
    const body = boundRecipe(target, backdrop);
    assert.equal((await f.request(endpoint, 'owner', 'PUT', {baseVersion: 0,
      recipe: body})).status, 400);
    assert.equal((await f.request(endpoint, 'owner', 'PUT', {baseVersion: 0,
      recipe: neutral()})).status, 200);
    const saved = await f.request(endpoint, 'owner', 'PUT', {baseVersion: 1, recipe: body});
    assert.equal(saved.status, 200);
    assert.equal(saved.body.version.version, 2);
    assert.deepEqual((await f.request(endpoint)).body.recipe.body, body);
    const conflict = await f.request(endpoint, 'owner', 'PUT', {baseVersion: 1, recipe: body});
    assert.equal(conflict.status, 409);
    assert.match(JSON.stringify(conflict.body), /ORIGINAL_SHADOW_MANUAL_REVISION_CONFLICT/u);
    const versions = await f.request(`${prefix}/assets/${target.id}/versions`);
    assert.equal(versions.body.versions.length, 2);
    assert.equal(versions.body.versions.some((value: {branch: boolean}) => value.branch), false);
    const wrong = boundRecipe(target, backdrop);
    ((wrong.parameters.extendedParameters as Record<string, any>).originalShadowManual
      .binding as Record<string, unknown>).backdropSHA256 = 'c'.repeat(64);
    assert.equal((await f.request(endpoint, 'owner', 'PUT', {baseVersion: 2,
      recipe: wrong})).status, 409);
    assert.equal((await f.request(endpoint)).body.recipe.version, 2);
    assert.equal(target.sha256, 'a'.repeat(64));
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HTTP-02 / JWT_SQLITE_NON_RAW: photo-bound Preset and revoked Viewer cannot write', async () => {
  const f = await fixture();
  try {
    const ws = (await f.request('/v1/workspaces', 'owner', 'POST', {name: 'Studio'})).body.workspace.id as string;
    const project = (await f.request(`/v1/workspaces/${ws}/projects`, 'owner', 'POST',
      {name: 'Photos'})).body.project.id as string;
    const prefix = `/v1/workspaces/${ws}/projects/${project}`;
    const target = (await f.request(`${prefix}/assets`, 'owner', 'POST',
      {name: 'target.nonraw', sha256: 'a'.repeat(64), size: 32})).body.asset;
    const backdrop = (await f.request(`${prefix}/assets`, 'owner', 'POST',
      {name: 'backdrop.nonraw', sha256: 'b'.repeat(64), size: 33})).body.asset;
    const recipeBody = boundRecipe(target, backdrop);
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const result = await f.request(`/v1/workspaces/${ws}/presets`, 'owner', 'POST',
        {scope, name: 'Bound', body: recipeBody});
      assert.equal(result.status, 403);
    }
    const invite = await f.request(`/v1/workspaces/${ws}/invitations`, 'owner', 'POST',
      {email: 'viewer@example.test', role: 'VIEWER',
        expiresAt: new Date(Date.now() + 600000).toISOString()});
    assert.equal(invite.status, 201);
    assert.equal((await f.request(`/v1/workspaces/${ws}/invitations/accept`, 'viewer', 'POST',
      {token: invite.body.token})).status, 200);
    const endpoint = `${prefix}/assets/${target.id}/recipe`;
    assert.equal((await f.request(endpoint, 'viewer', 'PUT', {baseVersion: 0,
      recipe: recipeBody})).status, 403);
    assert.equal((await f.request(`/v1/workspaces/${ws}/members/viewer`, 'owner', 'DELETE')).status, 200);
    assert.equal((await f.request(endpoint, 'viewer', 'PUT', {baseVersion: 0,
      recipe: recipeBody})).status, 403);
    assert.equal((await f.request(`${prefix}/assets/${target.id}/versions`)).body.versions.length, 0);
  } finally {await f.close();}
});
