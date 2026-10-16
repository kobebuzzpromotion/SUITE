import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mkdtemp, rm} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {validateRecipe} from '../src/photo-policy.js';
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
const binding = (assetID = '11111111-1111-4111-8111-111111111111',
  originalSHA256 = 'a'.repeat(64)) => ({assetID, originalSHA256,
  personID: '33333333-3333-4333-8333-333333333333',
  sourceWidth: 200, sourceHeight: 100});
const manual = (assetID?: string, sha?: string) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-lid-line-1',
  representation: 'normalized-continuous-lid-edge-v1',
  binding: binding(assetID, sha),
  eyeTargets: [{side: 'image-left', rect: {x: .1, y: .2, width: .3, height: .5},
    edge: [{u: .15, v: .4}, {u: .25, v: .3}, {u: .35, v: .4}],
    wing: [{u: .35, v: .4}, {u: .37, v: .3}]}],
  settings: {color: {r: 24, g: 19, b: 19}, opacity: .8,
    lineRadiusFraction: .012}});
const recipe = (document: unknown = manual()) => {
  const result = neutral();result.parameters.extendedParameters.eyelinerManual = document;
  return result;
};
const rejects = (documents: unknown[], expected = /INVALID_EYELINER_MANUAL/u) => {
  for (const document of documents)
    assert.throws(() => validateRecipe(recipe(document)), expected);
};

test('EYELINER-RECIPE-01: optional exact typed eye/wing JSON preserves old Recipe and unrelated edits', () => {
  const old = neutral(), current = recipe();
  current.parameters.extendedParameters.unrelatedSetting = {label: 'retained'};
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(current));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(current))));
  assert.doesNotThrow(() => validateRecipe(recipe(runInNewContext(
    `(${JSON.stringify(manual())})`) as unknown)));
  assert.deepEqual(current.parameters.processingOrder, old.parameters.processingOrder);
  assert.doesNotMatch(JSON.stringify(current),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|originalBytes/u);
});

test('EYELINER-RECIPE-02: binding, fake authority, bitmap, getter and alias are rejected', () => {
  const base = manual();
  rejects([{...base, savedRevision: 2}, {...base, ownerConfirmed: true},
    {...base, permissionEvidence: {allowed: true}}, {...base, bitmap: []},
    {...base, engineVersion: 'other'},
    {...base, binding: {...base.binding, assetID: 'not-uuid'}},
    {...base, binding: {...base.binding, originalSHA256: 'wrong'}},
    {...base, binding: {...base.binding, sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...base.binding, savedRevision: 2}}]);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_EYELINER_MANUAL/u);
  let invoked = 0;
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {invoked++;throw Error('getter');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_EYELINER_MANUAL/u);
  const extension = neutral();
  Object.defineProperty(extension.parameters.extendedParameters, 'eyelinerManual',
    {enumerable: true, get() {invoked++;throw Error('getter');}});
  assert.throws(() => validateRecipe(extension), /INVALID_EYELINER_MANUAL/u);
  assert.equal(invoked, 0);
  for (const key of ['eyeLiner', 'eyelinerStyle', 'lidLine', 'eyelidLine']) {
    const unknown = neutral();unknown.parameters.extendedParameters[key] = {style: 1};
    assert.throws(() => validateRecipe(unknown), /INVALID_EYELINER_MANUAL_ALIAS/u);
  }
});

test('EYELINER-RECIPE-03: continuous in-rect paths, wing attachment, capacities and settings stay strict', () => {
  const base = manual(), eye = base.eyeTargets[0]!;
  rejects([{...base, eyeTargets: []},
    {...base, eyeTargets: [{...eye, edge: []}]},
    {...base, eyeTargets: [{...eye, wing: [{u: .34, v: .4}, {u: .37, v: .3}]}]},
    {...base, eyeTargets: [{...eye, edge: [...eye.edge, {u: .9, v: .4}]}]},
    {...base, eyeTargets: [{...eye, edge: [eye.edge[0], eye.edge[0]]}]},
    {...base, eyeTargets: [eye, eye]},
    {...base, eyeTargets: [{...eye, ownerConfirmed: true}]},
    {...base, eyeTargets: [{...eye, edge: Array.from({length: 129}, (_, i) =>
      ({u: .12 + i * .001, v: .4}))}]},
    {...base, settings: {...base.settings, opacity: NaN}},
    {...base, settings: {...base.settings, lineRadiusFraction: .04}},
    {...base, settings: {...base.settings, evotoStyle: 1}}]);
  const sparse = [eye.edge[0], , eye.edge[2]];
  rejects([{...base, eyeTargets: [{...eye, edge: sparse}]}]);
  const farRight = {...eye, side: 'image-right',
    rect: {x: .14, y: .2, width: .3, height: .5}};
  rejects([{...base, eyeTargets: [eye, farRight]}],
    /INVALID_EYELINER_MANUAL_EYES_OVERLAP/u);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'suite-eyeliner-preset-'));
  const assets = new AssetRepository(join(root, 'assets.sqlite'));
  const storage = new LocalObjectStorage(join(root, 'objects'));
  const workspace = new WorkspaceHTTP(root, assets, storage);
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);jwk.kid = 'eyeliner-fixture';
  const authenticate = jwtAuthenticator({issuer: 'https://issuer.example', audience: 'suite',
    jwks: createLocalJWKSet({keys: [jwk]})});
  const token = (user: string) => new SignJWT({tenant_id: 'personal',
    email: `${user}@example.com`, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid: 'eyeliner-fixture'})
    .setIssuer('https://issuer.example').setAudience('suite').setSubject(user)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const server = suiteServer(assets, storage, authenticate, workspace);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const expect = async(path: string, user = 'owner', method = 'GET',
    data?: unknown, status = 200) => {
    const response = await fetch(base + path, {method, headers: {
      authorization: `Bearer ${await token(user)}`,
      ...(data === undefined ? {} : {'content-type': 'application/json'}),
    }, ...(data === undefined ? {} : {body: JSON.stringify(data)})});
    const body = await response.json() as any;
    assert.equal(response.status, status, JSON.stringify(body));return body;
  };
  const wid = (await expect('/v1/workspaces', 'owner', 'POST',
    {name: 'Eyeliner Studio'}, 201)).workspace.id as string;
  const path = `/v1/workspaces/${wid}`;
  const pid = (await expect(`${path}/projects`, 'owner', 'POST',
    {name: 'Faces'}, 201)).project.id as string;
  const project = `${path}/projects/${pid}`;
  const original = Buffer.from('Eyeliner fixture is metadata, not decoded pixels');
  const asset = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'source.bin', sha256: createHash('sha256').update(original).digest('hex'),
    size: original.length}, 201)).asset;
  const target = (await expect(`${project}/assets`, 'owner', 'POST', {
    name: 'target.bin', sha256: 'b'.repeat(64), size: original.length}, 201)).asset;
  const targetPath = `${project}/assets/${target.id}`;
  const close = async() => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    workspace.close();assets.close();
    const absolute = resolve(root), tempRoot = resolve(tmpdir()) + sep;
    assert.ok(absolute.startsWith(tempRoot));
    await rm(absolute, {recursive: true, force: true});
  };
  return {root, expect, path, targetPath, asset, target, close};
}

test('EYELINER-PRESET-HTTP-01: JWT/SQLite Personal and Workspace create/update reject photo-bound line', async() => {
  const f = await fixture();
  try {
    for (const scope of ['PERSONAL', 'WORKSPACE']) {
      const denied = await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Bound ${scope}`, scope,
          body: recipe(manual(f.asset.id, f.asset.sha256))}, 403);
      assert.equal(denied.error, 'PHOTO_BOUND_EYELINER_PRESET_FORBIDDEN');
      const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
        {name: `Safe ${scope}`, scope, body: neutral()}, 201)).preset;
      const update = await f.expect(`${f.path}/presets/${safe.id}`, 'owner', 'PATCH',
        {baseVersion: 1, name: 'Unsafe',
          body: recipe(manual(f.asset.id, f.asset.sha256))}, 403);
      assert.equal(update.error, 'PHOTO_BOUND_EYELINER_PRESET_FORBIDDEN');
      const unchanged = (await f.expect(`${f.path}/presets/${safe.id}`)).preset;
      assert.equal(unchanged.version, 1);assert.deepEqual(unchanged.body, neutral());
    }
    assert.equal((await f.expect(`${f.path}/presets`)).presets.length, 2);
  } finally {await f.close();}
});

test('EYELINER-PRESET-HTTP-02: imported bound Preset cannot apply; old neutral apply still works', async() => {
  const f = await fixture();
  try {
    const safe = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Safe', scope: 'WORKSPACE', body: neutral()}, 201)).preset;
    const db = new DatabaseSync(join(f.root, 'workspace.sqlite'));
    try {
      db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(safe.id, 2, 'Imported bound',
          JSON.stringify(recipe(manual(f.asset.id, f.asset.sha256))),
          'owner', new Date().toISOString());
      db.prepare('UPDATE ws_presets SET current_version=2 WHERE id=?').run(safe.id);
    } finally {db.close();}
    const denied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: safe.id, expectedPresetVersion: 2,
        expectedOriginalSHA256: f.target.sha256}, 403);
    assert.equal(denied.error, 'PHOTO_BOUND_EYELINER_PRESET_FORBIDDEN');
    assert.equal((await f.expect(`${f.targetPath}/recipe`)).recipe, null);
    assert.deepEqual((await f.expect(`${f.targetPath}/versions`)).versions, []);
    const normal = (await f.expect(`${f.path}/presets`, 'owner', 'POST',
      {name: 'Still safe', scope: 'WORKSPACE', body: neutral()}, 201)).preset;
    const applied = await f.expect(`${f.targetPath}/preset`, 'owner', 'POST',
      {baseVersion: 0, presetId: normal.id, expectedPresetVersion: 1,
        expectedOriginalSHA256: f.target.sha256});
    assert.equal(applied.outcome, 'saved');
    assert.deepEqual(applied.version.body, neutral());
  } finally {await f.close();}
});
