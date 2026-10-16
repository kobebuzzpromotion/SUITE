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

const plain = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const handTone = (assetID: string, originalSHA256: string) => {
  const value = plain();
  value.parameters.extendedParameters.handToneManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-owner-manual-hand-tone-1',
    binding: {assetID, originalSHA256, sourceWidth: 400, sourceHeight: 300},
    handStrokes: [{operation: 'ADD', path: [{u: .4, v: .5}],
      radiusFraction: .04, hardness: .6},
    {operation: 'ERASE', path: [{u: .5, v: .5}],
      radiusFraction: .01, hardness: .8}],
    settings: {strength: .7, radiusSourcePixels: 3},
  };
  return value;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-hand-tone-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'hand-tone-fixture';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const token = (user: string) => new SignJWT({tenant_id: 'personal',
    email: `${user}@example.com`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'hand-tone-fixture'})
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
    {name: 'Hand Studio'}, 201)).workspace.id as string;
  const path = `/v1/workspaces/${wid}`;
  const pid = (await expect(`${path}/projects`, 'owner', 'POST',
    {name: 'Hands'}, 201)).project.id as string;
  const project = `${path}/projects/${pid}`;
  const first = Buffer.from('Hand source Asset fixture, not decoded pixels');
  const second = Buffer.from('Hand target Asset fixture, not decoded pixels');
  const asset = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'source.bin', sha256: createHash('sha256').update(first).digest('hex'),
    size: first.length}, 201)).asset;
  const target = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'target.bin', sha256: createHash('sha256').update(second).digest('hex'),
    size: second.length}, 201)).asset;
  const sourcePath = `${project}/assets/${asset.id}`;
  const targetPath = `${project}/assets/${target.id}`;
  const close = async() => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    workspace.close(); assets.close();
    const absolute = resolve(root), tempRoot = resolve(tmpdir()) + sep;
    assert.ok(absolute.startsWith(tempRoot), 'fixture cleanup must stay in system temp');
    await rm(absolute, {recursive: true, force: true});
  };
  return {root, expect, path, sourcePath, targetPath, asset, target, close};
}

test('HAND-TONE-PRESET-HTTP-01: typed photo-local document round-trips as Recipe, not reusable Preset', async() => {
  const f = await fixture();
  try {
    const bound = handTone(f.asset.id, f.asset.sha256);
    const saved = await f.expect(`${f.sourcePath}/recipe`, 'owner', 'PUT',
      {baseVersion: 0, recipe: bound});
    assert.equal(saved.outcome, 'saved');
    assert.deepEqual((await f.expect(`${f.sourcePath}/recipe`)).recipe.body, bound);
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const create = await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Bound ${scope}`, scope, body: bound}, 403);
      assert.equal(create.error, 'PHOTO_BOUND_HAND_TONE_PRESET_FORBIDDEN');
      const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Safe ${scope}`, scope, body: plain()}, 201)).preset;
      const update = await f.expect(`${f.path}/presets/${safe.id}`, 'owner', 'PATCH',
        {baseVersion: 1, name: 'Unsafe', body: bound}, 403);
      assert.equal(update.error, 'PHOTO_BOUND_HAND_TONE_PRESET_FORBIDDEN');
      const readback = (await f.expect(`${f.path}/presets/${safe.id}`)).preset;
      assert.equal(readback.version, 1);assert.deepEqual(readback.body, plain());
    }
    assert.equal((await f.expect(`${f.path}/presets`)).presets.length, 2);
    assert.deepEqual((await f.expect(`${f.targetPath}/recipe`)).recipe, null);
  } finally { await f.close(); }
});

test('HAND-TONE-PRESET-HTTP-02: legacy imported bound Preset cannot copy mask; safe sparse apply survives', async() => {
  const f = await fixture();
  try {
    const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Neutral', scope: 'WORKSPACE', body: plain()}, 201)).preset;
    const database = new DatabaseSync(join(f.root, 'workspace.sqlite'));
    try {
      database.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(safe.id, 2, 'Imported unsafe',
          JSON.stringify(handTone(f.asset.id, f.asset.sha256)),
          'owner', new Date().toISOString());
      database.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(safe.id);
    } finally { database.close(); }
    const denied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: safe.id, expectedPresetVersion: 2,
        expectedOriginalSHA256: f.target.sha256}, 403);
    assert.equal(denied.error, 'PHOTO_BOUND_HAND_TONE_PRESET_FORBIDDEN');
    assert.equal((await f.expect(`${f.targetPath}/recipe`)).recipe, null);
    assert.deepEqual((await f.expect(`${f.targetPath}/versions`)).versions, []);
    const normal = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Safe', scope: 'WORKSPACE', body: plain()}, 201)).preset;
    const applied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: normal.id, expectedPresetVersion: 1,
        expectedOriginalSHA256: f.target.sha256});
    assert.equal(applied.outcome, 'saved');
    assert.deepEqual(applied.version.body, plain());
  } finally { await f.close(); }
});
