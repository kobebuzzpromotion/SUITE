import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';

// Actual loopback Trial HTTP and SQLite; Originals are synthetic non-RAW bytes.
const END = '2026-11-03T08:00:00.000Z';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const manual = (target, backdrop) => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
  binding: {assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: 40, sourceHeight: 20, backdropID: backdrop.id,
    backdropSHA256: backdrop.sha256},
  subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}],
    radiusFraction: .04, hardness: .8}],
  settings: {mode: 'soft', opacity: 70, blur: 6, gradient: 20,
    blend: 'normal', offsetX: 2, offsetY: 3, shadowColor: [10, 20, 30]},
});
const recipe = document => {
  const value = neutral();
  value.parameters.extendedParameters.addShadowManual = document;
  return value;
};

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-add-shadow-trial-http-'));
  const context = await createTrialServer({dataDir, port: 0,
    clock: () => Date.parse('2026-10-03T08:00:00.000Z')});
  await new Promise((done, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', done);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name) {
    const author = context.auth.createAuthor({authorName: name, trialEndsAt: END});
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
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_ADD_SHADOW_${label}`);
    const asset = await client.createAsset({name: `${label}.nonraw`, sha256: sha(bytes), size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength));
    return {...asset, bytes};
  }
  async function assertOriginalUnchanged(asset) {
    const current = context.repo.get(asset.tenantId, asset.id);
    const evidence = await context.storage.inspect(current.originalKey);
    assert.equal(evidence.sha256, sha(asset.bytes));
    assert.equal(evidence.size, asset.bytes.length);
  }
  return {dataDir, context, login, create, assertOriginalUnchanged,
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-add-shadow-trial-http-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(target, {recursive: true, force: true});
    }};
}

test('SHADOW-TRIAL-HTTP01 / SQLITE_NON_RAW: owner saves/reloads bound manual Recipe with two real Assets and immutable Originals', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const target = await f.create(owner.client, 'target');
    const backdrop = await f.create(owner.client, 'backdrop');
    const first = await owner.client.saveRecipe(target.id, 0, neutral());
    assert.equal(first.revision, 1);
    const document = manual(target, backdrop);
    const saved = await owner.client.saveRecipe(target.id, 1, recipe(document));
    assert.equal(saved.revision, 2);
    assert.deepEqual((await owner.client.getRecipe(target.id)).body, recipe(document));
    assert.equal(sha(Buffer.from(await owner.client.getOriginal(target.id))), target.sha256);
    assert.equal(sha(Buffer.from(await owner.client.getOriginal(backdrop.id))), backdrop.sha256);
    await f.assertOriginalUnchanged(target);
    await f.assertOriginalUnchanged(backdrop);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-HTTP02 / SQLITE_NON_RAW: other tenant, wrong SHA, copied target and CAS conflict reject without partial save', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const target = await f.create(owner.client, 'target');
    const backdrop = await f.create(owner.client, 'backdrop');
    const foreign = await f.create(other.client, 'foreign');
    const first = await owner.client.saveRecipe(target.id, 0, neutral());
    assert.equal(first.revision, 1);
    const base = manual(target, backdrop);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe({...base,
      binding: {...base.binding, backdropID: foreign.id,
        backdropSHA256: foreign.sha256}})), /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe({...base,
      binding: {...base.binding, backdropSHA256: 'f'.repeat(64)}})),
    /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe({...base,
      binding: {...base.binding, assetID: backdrop.id}})),
    /INVALID_ADD_SHADOW_MANUAL_BINDING/u);
    await assert.rejects(other.client.saveRecipe(target.id, 1, recipe(base)), /NOT_FOUND/u);
    const accepted = await owner.client.saveRecipe(target.id, 1, recipe(base));
    assert.equal(accepted.revision, 2);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe(base)), /REVISION_CONFLICT/u);
    assert.equal((await owner.client.getRecipe(target.id)).revision, 2);
    await f.assertOriginalUnchanged(target);
    await f.assertOriginalUnchanged(backdrop);
    await f.assertOriginalUnchanged(foreign);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-HTTP03 / SQLITE_NON_RAW: deleted or metadata-drift backdrop invalidates read and new writes but preserves physical Originals', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const target = await f.create(owner.client, 'target');
    const backdrop = await f.create(owner.client, 'backdrop');
    const saved = await owner.client.saveRecipe(target.id, 0, recipe(manual(target, backdrop)));
    assert.equal(saved.revision, 1);
    await owner.client.request(`/v1/assets/${backdrop.id}/trash`, {method: 'POST'});
    await assert.rejects(owner.client.getRecipe(target.id), /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, neutral()),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    await f.assertOriginalUnchanged(target);
    // Trash is logical: object bytes remain on disk even though the API hides it.
    const deleted = f.context.repo.get(backdrop.tenantId, backdrop.id, true);
    assert.equal((await f.context.storage.inspect(deleted.originalKey)).sha256, backdrop.sha256);
    await owner.client.request(`/v1/assets/${backdrop.id}/restore`, {method: 'POST'});
    const db = new DatabaseSync(join(f.dataDir, 'suite.sqlite'));
    try {db.prepare('UPDATE assets SET sha256=? WHERE id=?').run('e'.repeat(64), backdrop.id);}
    finally {db.close();}
    await assert.rejects(owner.client.getRecipe(target.id), /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, neutral()),
      /INVALID_ADD_SHADOW_MANUAL_BACKDROP/u);
    const dbRestore = new DatabaseSync(join(f.dataDir, 'suite.sqlite'));
    try {dbRestore.prepare('UPDATE assets SET sha256=? WHERE id=?').run(backdrop.sha256, backdrop.id);}
    finally {dbRestore.close();}
    assert.equal((await owner.client.getRecipe(target.id)).revision, 1);
    await f.assertOriginalUnchanged(target);
    await f.assertOriginalUnchanged(backdrop);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-HTTP04 / SQLITE_NON_RAW: revoked Trial session cannot save or read and leaves Recipe/Original unchanged', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Revocable');
    const target = await f.create(owner.client, 'target');
    const backdrop = await f.create(owner.client, 'backdrop');
    const initial = await owner.client.saveRecipe(target.id, 0, neutral());
    assert.equal(initial.revision, 1);
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(owner.client.saveRecipe(target.id, 1, recipe(manual(target, backdrop))),
      /TRIAL_REVOKED/u);
    await assert.rejects(owner.client.getRecipe(target.id), /TRIAL_REVOKED/u);
    assert.equal(f.context.repo.latestRecipe(target.tenantId, target.id).revision, 1);
    await f.assertOriginalUnchanged(target);
    await f.assertOriginalUnchanged(backdrop);
  } finally {await f.cleanup();}
});
