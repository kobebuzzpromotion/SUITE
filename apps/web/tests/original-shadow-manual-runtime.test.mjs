import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {renderTrialOriginalShadow} from '../src/processing/original-shadow-manual-runtime.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const manual = (target, backdrop) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-original-shadow-1',
  source: 'owner-manual-input-unverified',
  binding: {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: 8, sourceHeight: 4,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256},
  subjectStrokes: [{operation: 'ADD', path: [{u: .25, v: .5}],
    radiusFraction: .25, hardness: 1}],
  shadowStrokes: [{operation: 'ADD', path: [{u: .75, v: .5}],
    radiusFraction: .25, hardness: 1}], settings: {opacity: 100}});
const recipe = document => {
  const body = neutral(); body.parameters.extendedParameters.originalShadowManual = document;
  return body;
};
const image = (width, height, shade, source) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    data.set([shade, shade, shade, 255], pixel * 4);
  }
  return source ? {width, height, sourceWidth: 8, sourceHeight: 4, data} :
    {width, height, data};
};

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-original-shadow-runtime-'));
  const context = await createTrialServer({dataDir, port: 0,
    clock: () => Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', done);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name) {
    const author = context.auth.createAuthor({authorName: name,
      trialEndsAt: '2026-11-03T08:00:00.000Z'});
    const invite = context.auth.issueInvite(author.id);
    const response = await fetch(baseURL + '/trial/login', {method: 'POST',
      headers: {'X-Suite-Trial': '1', 'Content-Type': 'application/json'},
      body: JSON.stringify({inviteToken: invite.inviteToken})});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^suite_trial=/);
    return {author, client: new TrialClient({baseURL,
      fetcher: (url, init) => fetch(url,
        {...init, headers: {...init.headers, Cookie: cookie}})})};
  }
  async function create(client, name) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_ORIGINAL_SHADOW_${name}`);
    const asset = await client.createAsset({name: `${name}.nonraw`,
      sha256: sha(bytes), size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength));
    return {...asset, bytes};
  }
  async function prepare() {
    const owner = await login('Owner');
    const target = await create(owner.client, 'target');
    const backdrop = await create(owner.client, 'backdrop');
    await owner.client.saveRecipe(target.id, 0, neutral());
    await owner.client.saveRecipe(target.id, 1, recipe(manual(target, backdrop)));
    return {owner, target, backdrop};
  }
  return {context, dataDir, login, create, prepare, async close() {
    await new Promise((done, reject) => context.server.close(error =>
      error ? reject(error) : done()));
    const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
    if (!target.startsWith(base) ||
        !target.split(sep).at(-1).startsWith('suite-original-shadow-runtime-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target, {recursive: true, force: true});
  }};
}

test('ORIGINAL-SHADOW-RUNTIME-01 / TRIAL_SQLITE_NON_RAW: saved two-layer strokes render full frame without mutating inputs, subject, alpha or outside', async () => {
  const f = await fixture();
  try {
    const {owner, target, backdrop} = await f.prepare();
    const original = image(8, 4, 0), composite = image(8, 4, 200);
    const inputBefore = new Uint8ClampedArray(original.data);
    const compositeBefore = new Uint8ClampedArray(composite.data);
    const result = await renderTrialOriginalShadow({api: owner.client,
      assetID: target.id, backdropID: backdrop.id, savedRevision: 2,
      action: 'export', representation: 'original', original, composite});
    assert.equal(result.subjectMask.provenance.kind, 'subject-alpha-mask');
    assert.equal(result.shadowMask.provenance.kind, 'original-shadow-mask');
    assert.notDeepEqual(result.subjectMask.data, result.shadowMask.data);
    assert.ok(result.subjectMask.data[2 + 2 * 8] > 0);
    assert.ok(result.shadowMask.data[6 + 2 * 8] > 0);
    assert.deepEqual(original.data, inputBefore);
    assert.deepEqual(composite.data, compositeBefore);
    assert.deepEqual(Array.from(result.pixels.data.filter((_, index) => index % 4 === 3)),
      Array(32).fill(255));
    assert.equal(result.pixels.data[(2 + 2 * 8) * 4], 200);
    assert.ok(result.pixels.data[(6 + 2 * 8) * 4] < 200);
    assert.equal(result.pixels.data[0], 200);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-RUNTIME-02 / TRIAL_SQLITE_NON_RAW: Proxy raster is separate and version, background and forged evidence fail closed', async () => {
  const f = await fixture();
  try {
    const {owner, target, backdrop} = await f.prepare();
    const original = image(4, 2, 0, true), composite = image(4, 2, 200);
    const options = {api: owner.client, assetID: target.id, backdropID: backdrop.id,
      savedRevision: 2, action: 'edit', representation: 'proxy', original, composite};
    const result = await renderTrialOriginalShadow(options);
    assert.equal(result.subjectMask.width, 4);
    assert.equal(result.shadowMask.height, 2);
    assert.ok(result.pixels.data[(3 + 1 * 4) * 4] < 200);
    assert.equal(result.pixels.data[(1 + 1 * 4) * 4], 200);
    await assert.rejects(renderTrialOriginalShadow({...options, savedRevision: 1}),
      /ORIGINAL_SHADOW_RUNTIME_(DOCUMENT_MISSING|REVISION_CONFLICT)/u);
    await assert.rejects(renderTrialOriginalShadow({...options, backdropID: target.id}),
      /ORIGINAL_SHADOW_RUNTIME_INPUT_INVALID/u);
    const other = await f.login('Other');
    const foreign = await f.create(other.client, 'foreign');
    await assert.rejects(renderTrialOriginalShadow({...options, backdropID: foreign.id}),
      /ORIGINAL_SHADOW_RUNTIME_BINDING_MISMATCH/u);
    await assert.rejects(renderTrialOriginalShadow({...options, allowed: true}),
      /ORIGINAL_SHADOW_RUNTIME_INPUT_INVALID/u);
    await assert.rejects(renderTrialOriginalShadow({...options,
      original: image(5, 2, 0, true)}),
    /ORIGINAL_SHADOW_RUNTIME_DIMENSIONS_MISMATCH/u);
    await assert.rejects(renderTrialOriginalShadow({...options, api: other.client}),
      /NOT_FOUND|ORIGINAL_SHADOW_RUNTIME_SESSION_REQUIRED/u);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-RUNTIME-03 / TRIAL_SQLITE_NON_RAW: revocation, backdrop trash, digest drift and Abort never publish pixels', async () => {
  const f = await fixture();
  try {
    const {owner, target, backdrop} = await f.prepare();
    const options = {api: owner.client, assetID: target.id, backdropID: backdrop.id,
      savedRevision: 2, action: 'export', representation: 'original',
      original: image(8, 4, 0), composite: image(8, 4, 200)};
    const controller = new AbortController(); controller.abort();
    await assert.rejects(renderTrialOriginalShadow({...options,
      signal: controller.signal}), {name: 'AbortError'});
    await owner.client.request(`/v1/assets/${backdrop.id}/trash`, {method: 'POST'});
    await assert.rejects(renderTrialOriginalShadow(options),
      /INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP|ORIGINAL_SHADOW_RUNTIME_ASSET_UNAVAILABLE/u);
    await owner.client.request(`/v1/assets/${backdrop.id}/restore`, {method: 'POST'});
    const originalKey = f.context.repo.get(backdrop.tenantId, backdrop.id).originalKey;
    await writeFile(join(f.dataDir, 'objects', originalKey),
      Buffer.alloc(backdrop.bytes.length, 0x42));
    await assert.rejects(renderTrialOriginalShadow(options),
      /ORIGINAL_SHADOW_RUNTIME_ORIGINAL_CHANGED|CHECKSUM|VERIFICATION|WAITING_FOR_ORIGINAL/u);
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(renderTrialOriginalShadow(options), /TRIAL_REVOKED/u);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-RUNTIME-04 / TRIAL_SQLITE_NON_RAW: revocation after rasterization fails the second fresh Recipe read', async () => {
  const f = await fixture();
  try {
    const {owner, target, backdrop} = await f.prepare();
    const getRecipe = owner.client.getRecipe.bind(owner.client);
    let calls = 0;
    owner.client.getRecipe = (...args) => {
      if (++calls === 2) f.context.auth.revokeAuthor(owner.author.id);
      return getRecipe(...args);
    };
    const composite = image(8, 4, 200);
    const before = new Uint8ClampedArray(composite.data);
    await assert.rejects(renderTrialOriginalShadow({api: owner.client,
      assetID: target.id, backdropID: backdrop.id, savedRevision: 2,
      action: 'export', representation: 'original', original: image(8, 4, 0),
      composite}), /TRIAL_REVOKED/u);
    assert.equal(calls, 2);
    assert.deepEqual(composite.data, before);
  } finally {await f.close();}
});
