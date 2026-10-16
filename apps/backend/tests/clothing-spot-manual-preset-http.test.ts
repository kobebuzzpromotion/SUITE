import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {AssetRepository} from '../src/repository.js';
import {LocalObjectStorage} from '../src/storage.js';
import {WorkspaceHTTP} from '../src/workspace-server.js';
import {suiteServer} from '../src/server.js';
import {jwtAuthenticator} from '../src/auth.js';

const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const bound = (assetID: string, originalSHA256: string) => {
  const value = neutral();
  value.parameters.extendedParameters.clothingSpotManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-clothing-spot-1',
    binding: {assetID, originalSHA256, sourceWidth: 400, sourceHeight: 300},
    targetRect: {x: .1, y: .2, width: .1, height: .1},
    referenceRect: {x: .5, y: .2, width: .1, height: .1},
    targetStrokes: [{operation: 'ADD', path: [{u: .4, v: .5}],
      radiusFraction: .04, hardness: .6}],
  };
  return value;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-clothing-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'clothing-preset-fixture';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const token = (user: string) => new SignJWT({tenant_id: 'personal',
    email: `${user}@example.com`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'clothing-preset-fixture'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = async(path: string, user = 'owner', method = 'GET', data?: unknown) => {
    const response = await fetch(base + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(data === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    return {status: response.status, body: await response.json() as any};
  };
  const expect = async(path: string, user = 'owner', method = 'GET',
    data?: unknown, status = 200) => {
    const result = await request(path, user, method, data);
    assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body;
  };
  const wid = (await expect('/v1/workspaces', 'owner', 'POST',
    {name: 'Clothing Studio'}, 201)).workspace.id as string;
  const path = `/v1/workspaces/${wid}`;
  const pid = (await expect(`${path}/projects`, 'owner', 'POST',
    {name: 'Garments'}, 201)).project.id as string;
  const project = `${path}/projects/${pid}`;
  const first = Buffer.from('Clothing source fixture; not an image');
  const second = Buffer.from('Clothing target fixture; not an image');
  const asset = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'source.bin', sha256: createHash('sha256').update(first).digest('hex'),
    size: first.length}, 201)).asset;
  const target = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'target.bin', sha256: createHash('sha256').update(second).digest('hex'),
    size: second.length}, 201)).asset;
  const targetPath = `${project}/assets/${target.id}`;
  const close = async() => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    workspace.close(); assets.close();
    const absolute = resolve(root), tempRoot = resolve(tmpdir()) + sep;
    assert.ok(absolute.startsWith(tempRoot), 'cleanup is limited to this temp fixture');
    await rm(absolute, {recursive: true, force: true});
  };
  return {root, request, expect, path, targetPath, asset, target, close};
}

test('CLOTHING-PRESET-HTTP-01: Personal/Workspace create and update reject bound spot without version changes', async() => {
  const f = await fixture();
  try {
    const spot = bound(f.asset.id, f.asset.sha256);
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const denied = await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Bound ${scope}`, scope, body: spot}, 403);
      assert.equal(denied.error, 'PHOTO_BOUND_CLOTHING_SPOT_PRESET_FORBIDDEN');
      const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Safe ${scope}`, scope, body: neutral()}, 201)).preset;
      const update = await f.expect(`${f.path}/presets/${safe.id}`, 'owner', 'PATCH',
        {baseVersion: 1, name: 'Unsafe', body: spot}, 403);
      assert.equal(update.error, 'PHOTO_BOUND_CLOTHING_SPOT_PRESET_FORBIDDEN');
      const readback = (await f.expect(`${f.path}/presets/${safe.id}`)).preset;
      assert.equal(readback.version, 1);
      assert.deepEqual(readback.body, neutral());
    }
    assert.equal((await f.expect(`${f.path}/presets`)).presets.length, 2);
    const stranger = await f.request(`${f.path}/presets`, 'stranger');
    assert.notEqual(stranger.status, 200);
  } finally { await f.close(); }
});

test('CLOTHING-PRESET-HTTP-02: legacy bound Preset cannot cross Asset, while neutral apply still saves', async() => {
  const f = await fixture();
  try {
    const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Neutral', scope: 'WORKSPACE', body: neutral()}, 201)).preset;
    const database = new DatabaseSync(join(f.root, 'workspace.sqlite'));
    try {
      database.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(safe.id, 2, 'Imported unsafe', JSON.stringify(bound(f.asset.id, f.asset.sha256)),
          'owner', new Date().toISOString());
      database.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(safe.id);
    } finally { database.close(); }
    const denied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: safe.id, expectedPresetVersion: 2,
        expectedOriginalSHA256: f.target.sha256}, 403);
    assert.equal(denied.error, 'PHOTO_BOUND_CLOTHING_SPOT_PRESET_FORBIDDEN');
    assert.equal((await f.expect(`${f.targetPath}/recipe`)).recipe, null);
    assert.deepEqual((await f.expect(`${f.targetPath}/versions`)).versions, []);
    const valid = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Safe', scope: 'WORKSPACE', body: neutral()}, 201)).preset;
    const applied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: valid.id, expectedPresetVersion: 1,
        expectedOriginalSHA256: f.target.sha256});
    assert.equal(applied.outcome, 'saved');
    assert.deepEqual(applied.version.body, neutral());
  } finally { await f.close(); }
});
