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
const bound = (assetID: string, originalSHA256: string) => {
  const value = plain();
  value.parameters.extendedParameters.contactsIrisManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-iris-color-1',
    binding: {assetID, originalSHA256, personID: '33333333-3333-4333-8333-333333333333',
      eye: 'left', sourceWidth: 400, sourceHeight: 300},
    irisRingStrokes: [{operation: 'ADD', path: [{u: .4, v: .5}],
      radiusFraction: .04, hardness: .6}],
    pupilExclusionStrokes: [{operation: 'ADD', path: [{u: .4, v: .5}],
      radiusFraction: .02, hardness: .6}],
    settings: {color: {r: 40, g: 90, b: 130}, amount: .5},
  };
  return value;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-contacts-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'contacts-preset-fixture';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const token = (user: string) => new SignJWT({tenant_id: 'personal',
    email: `${user}@example.com`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'contacts-preset-fixture'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const expect = async(path: string, user = 'owner', method = 'GET', data?: unknown, status = 200) => {
    const response = await fetch(base + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(data === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    const body = await response.json() as any;
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  };
  const wid = (await expect('/v1/workspaces', 'owner', 'POST', {name: 'Contacts Studio'}, 201)).workspace.id as string;
  const path = `/v1/workspaces/${wid}`;
  const pid = (await expect(`${path}/projects`, 'owner', 'POST', {name: 'Portraits'}, 201)).project.id as string;
  const project = `${path}/projects/${pid}`;
  const original = Buffer.from('Contacts source Asset fixture, not an image');
  const targetOriginal = Buffer.from('Contacts target Asset fixture, not an image');
  const asset = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'source.bin', sha256: createHash('sha256').update(original).digest('hex'),
    size: original.length}, 201)).asset;
  const target = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'target.bin', sha256: createHash('sha256').update(targetOriginal).digest('hex'),
    size: targetOriginal.length}, 201)).asset;
  const targetPath = `${project}/assets/${target.id}`;
  const close = async() => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    workspace.close(); assets.close();
    const absolute = resolve(root), tempRoot = resolve(tmpdir()) + sep;
    assert.ok(absolute.startsWith(tempRoot));
    await rm(absolute, {recursive: true, force: true});
  };
  return {root, expect, path, targetPath, asset, target, close};
}

test('CONTACTS-PRESET-HTTP-01 Personal/Workspace create and update refuse photo-bound eye data', async() => {
  const f = await fixture();
  try {
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const denied = await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: 'Bound', scope, body: bound(f.asset.id, f.asset.sha256)}, 403);
      assert.equal(denied.error, 'PHOTO_BOUND_CONTACTS_IRIS_PRESET_FORBIDDEN');
      const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: 'Safe', scope, body: plain()}, 201)).preset;
      const update = await f.expect(`${f.path}/presets/${safe.id}`, 'owner', 'PATCH',
        {baseVersion: 1, name: 'Bound update', body: bound(f.asset.id, f.asset.sha256)}, 403);
      assert.equal(update.error, 'PHOTO_BOUND_CONTACTS_IRIS_PRESET_FORBIDDEN');
      const after = (await f.expect(`${f.path}/presets/${safe.id}`)).preset;
      assert.equal(after.version, 1);
      assert.deepEqual(after.body, plain());
    }
  } finally { await f.close(); }
});

test('CONTACTS-PRESET-HTTP-02 legacy unsafe preset cannot cross photos; safe preset still applies', async() => {
  const f = await fixture();
  try {
    const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Safe', scope: 'WORKSPACE', body: plain()}, 201)).preset;
    const database = new DatabaseSync(join(f.root, 'workspace.sqlite'));
    try {
      database.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(safe.id, 2, 'Imported bound', JSON.stringify(bound(f.asset.id, f.asset.sha256)),
          'owner', new Date().toISOString());
      database.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(safe.id);
    } finally { database.close(); }
    const denied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: safe.id, expectedPresetVersion: 2,
        expectedOriginalSHA256: f.target.sha256}, 403);
    assert.equal(denied.error, 'PHOTO_BOUND_CONTACTS_IRIS_PRESET_FORBIDDEN');
    assert.equal((await f.expect(`${f.targetPath}/recipe`)).recipe, null);
    assert.deepEqual((await f.expect(`${f.targetPath}/versions`)).versions, []);
    const neutral = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Neutral', scope: 'WORKSPACE', body: plain()}, 201)).preset;
    const applied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: neutral.id, expectedPresetVersion: 1,
        expectedOriginalSHA256: f.target.sha256});
    assert.equal(applied.outcome, 'saved');
    assert.deepEqual(applied.version.body, plain());
  } finally { await f.close(); }
});
