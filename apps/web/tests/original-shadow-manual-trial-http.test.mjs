import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const neutral = () => ({schemaVersion: 1, parameters: {exposure: .2,
  contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {oldColor: {value: 3}},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
const manual = (target, backdrop) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-original-shadow-1',
  source: 'owner-manual-input-unverified',
  binding: {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: 40, sourceHeight: 20,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256},
  subjectStrokes: [{operation: 'ADD', path: [{u: .2, v: .3}],
    radiusFraction: .05, hardness: .7}],
  shadowStrokes: [{operation: 'ADD', path: [{u: .7, v: .8}],
    radiusFraction: .08, hardness: .6}], settings: {opacity: 72}});
const recipe = document => {
  const value = neutral();
  value.parameters.extendedParameters.originalShadowManual = document;
  return value;
};

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-original-shadow-trial-http-'));
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
    const client = new TrialClient({baseURL, fetcher: (url, init) => fetch(url,
      {...init, headers: {...init.headers, Cookie: cookie}})});
    return {author, client};
  }
  async function create(client, label) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_ORIGINAL_SHADOW_${label}`);
    const asset = await client.createAsset({name: `${label}.nonraw`,
      sha256: sha(bytes), size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength));
    return {...asset, bytes};
  }
  async function assertOriginal(asset) {
    const current = context.repo.get(asset.tenantId, asset.id);
    const evidence = await context.storage.inspect(current.originalKey);
    assert.equal(evidence.sha256, sha(asset.bytes));
    assert.equal(evidence.size, asset.bytes.length);
  }
  return {context, login, create, assertOriginal, async close() {
    await new Promise((done, reject) => context.server.close(error =>
      error ? reject(error) : done()));
    const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
    if (!target.startsWith(base) ||
        !target.split(sep).at(-1).startsWith('suite-original-shadow-trial-http-'))
      throw Error('UNSAFE_TEST_CLEANUP');
    await rm(target, {recursive: true, force: true});
  }};
}

test('ORIGINAL-SHADOW-TRIAL-HTTP-01 / SQLITE_NON_RAW: owner-only save/reload, CAS, revoked session and immutable Originals', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const target = await f.create(owner.client, 'target');
    const backdrop = await f.create(owner.client, 'backdrop');
    const foreign = await f.create(other.client, 'foreign');
    const valid = manual(target, backdrop);
    await assert.rejects(owner.client.saveRecipe(target.id, 0, recipe(valid)),
      /INVALID_ORIGINAL_SHADOW_MANUAL_SAVED_BASE/u);
    assert.equal((await owner.client.saveRecipe(target.id, 0, neutral())).revision, 1);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe({...valid,
      binding: {...valid.binding, backdropID: foreign.id,
        backdropSHA256: foreign.sha256}})),
    /INVALID_ORIGINAL_SHADOW_MANUAL_BACKDROP/u);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe({...valid,
      binding: {...valid.binding, originalSHA256: 'e'.repeat(64)}})),
    /INVALID_ORIGINAL_SHADOW_MANUAL_BINDING/u);
    await assert.rejects(other.client.saveRecipe(target.id, 1, recipe(valid)), /NOT_FOUND/u);
    const saved = await owner.client.saveRecipe(target.id, 1, recipe(valid));
    assert.equal(saved.revision, 2);
    assert.deepEqual((await owner.client.getRecipe(target.id)).body, recipe(valid));
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe(valid)),
      /REVISION_CONFLICT/u);
    assert.equal((await owner.client.getRecipe(target.id)).revision, 2);
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(owner.client.saveRecipe(target.id, 2, recipe(valid)),
      /TRIAL_REVOKED/u);
    await f.assertOriginal(target); await f.assertOriginal(backdrop);
    await f.assertOriginal(foreign);
  } finally {await f.close();}
});
