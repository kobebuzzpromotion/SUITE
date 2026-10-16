import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {createTrialOriginalShadowManualHost} from
  '../src/original-shadow-manual-trial-host.mjs';
import {ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const neutral = () => ({schemaVersion: 1, parameters: {exposure: .2,
  contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {oldColor: {value: 3}},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-original-shadow-host-'));
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
    const bytes = Buffer.from(`SYNTHETIC_NONRAW_ORIGINAL_SHADOW_${label}_40x20`);
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
  async function ready(name = 'Owner') {
    const owner = await login(name);
    const target = await create(owner.client, `${name}-target`);
    const backdrop = await create(owner.client, `${name}-backdrop`);
    const saved = await owner.client.saveRecipe(target.id, 0, neutral());
    assert.equal(saved.revision, 1);
    const editor = {selectedAssetID: target.id,
      selectedBackdropID: backdrop.id, view: 'after', ready: true,
      dirty: false, busy: false, permissionExpired: false,
      rotationDegrees: 0, crop: null, canvasExpand: null};
    let dimensionReads = 0;
    const host = createTrialOriginalShadowManualHost({api: owner.client,
      targetAssetID: target.id, backdropAssetID: backdrop.id,
      getSourceDimensions(bytes, asset) {
        dimensionReads++;
        assert.equal(asset.id, target.id);
        assert.equal(sha(Buffer.from(bytes)), target.sha256);
        assert.match(Buffer.from(bytes).toString(), /_40x20$/u);
        return {width: 40, height: 20};
      }, getEditorState: () => editor});
    return {owner, target, backdrop, editor, host,
      get dimensionReads() {return dimensionReads;}};
  }
  return {context, login, create, assertOriginal, ready,
    async close() {
      await new Promise((done, reject) => context.server.close(error =>
        error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) ||
          !target.split(sep).at(-1).startsWith('suite-original-shadow-host-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(target, {recursive: true, force: true});
    }};
}

function manual(context) {
  return {schemaVersion: 1, engineVersion: ORIGINAL_SHADOW_VERSION,
    source: 'owner-manual-input-unverified',
    binding: {assetID: context.target.id,
      originalSHA256: context.target.sha256,
      sourceWidth: context.target.sourceWidth,
      sourceHeight: context.target.sourceHeight,
      backdropID: context.backdrop.id,
      backdropSHA256: context.backdrop.sha256},
    subjectStrokes: [{operation: 'ADD', path: [{u: .2, v: .3}],
      radiusFraction: .05, hardness: .7}],
    shadowStrokes: [{operation: 'ADD', path: [{u: .7, v: .8}],
      radiusFraction: .08, hardness: .6}],
    settings: {opacity: 72}};
}

function options(context, signal = new AbortController().signal) {
  return {target: {id: context.target.id, sha256: context.target.sha256,
    sourceWidth: context.target.sourceWidth,
    sourceHeight: context.target.sourceHeight},
    backdrop: {...context.backdrop},
    expectedRevision: context.target.savedRevision, signal};
}

test('ORIGINAL-SHADOW-HOST-01 / SQLITE_NON_RAW: fresh Trial scope, CAS save/readback and immutable Originals', async () => {
  const f = await fixture();
  try {
    const c = await f.ready();
    assert.equal(c.host.getContext().ready, false);
    await assert.rejects(c.host.onApply({}, {}),
      /ORIGINAL_SHADOW_HOST_APPLY_OPTIONS_INVALID/u);
    const context = await c.host.refresh();
    assert.equal(context.ready, true);
    assert.equal(context.target.savedRevision, 1);
    assert.equal(c.dimensionReads, 1);
    const response = await c.host.onApply(manual(context), options(context));
    assert.deepEqual(response, {accepted: true});
    const saved = await c.owner.client.getRecipe(c.target.id);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.body.parameters.extendedParameters.oldColor, {value: 3});
    assert.deepEqual(saved.body.parameters.extendedParameters.originalShadowManual,
      manual(context));
    assert.equal(c.host.getContext().target.savedRevision, 2);
    await f.assertOriginal(c.target);
    await f.assertOriginal(c.backdrop);
    c.host.dispose();
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HOST-02 / SQLITE_NON_RAW: changed selection, UI binding and saved revision fail closed', async () => {
  const f = await fixture();
  try {
    const c = await f.ready(), context = await c.host.refresh();
    c.editor.view = 'before';
    assert.equal(c.host.getContext().ready, false);
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /ORIGINAL_SHADOW_HOST_EDITOR_SCOPE_CHANGED/u);
    c.editor.view = 'after';
    await c.host.refresh();
    await assert.rejects(c.host.onApply(manual(context),
      {...options(context), backdrop: {...context.backdrop,
        sha256: 'f'.repeat(64)}}),
    /ORIGINAL_SHADOW_HOST_UI_SCOPE_MISMATCH/u);
    await c.owner.client.saveRecipe(c.target.id, 1, neutral());
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /ORIGINAL_SHADOW_HOST_FRESH_SCOPE_CHANGED/u);
    assert.equal(c.host.getContext().ready, false);
    assert.equal((await c.owner.client.getRecipe(c.target.id)).revision, 2);
    await f.assertOriginal(c.target); await f.assertOriginal(c.backdrop);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HOST-03 / SQLITE_NON_RAW: another tenant and revoked Trial cannot supply/save binding', async () => {
  const f = await fixture();
  try {
    const c = await f.ready(), intruder = await f.login('Intruder');
    const foreign = createTrialOriginalShadowManualHost({api: intruder.client,
      targetAssetID: c.target.id, backdropAssetID: c.backdrop.id,
      getSourceDimensions: () => ({width: 40, height: 20}),
      getEditorState: () => c.editor});
    await assert.rejects(foreign.refresh(),
      /ORIGINAL_SHADOW_HOST_ASSET_UNAVAILABLE/u);
    const context = await c.host.refresh();
    f.context.auth.revokeAuthor(c.owner.author.id);
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /TRIAL_REVOKED/u);
    assert.equal(c.host.getContext().ready, false);
    await f.assertOriginal(c.target); await f.assertOriginal(c.backdrop);
    assert.equal(f.context.repo.latestRecipe(c.target.tenantId, c.target.id).revision, 1);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HOST-04 / SQLITE_NON_RAW: cancel and uncertain post-commit response never report accepted', async () => {
  const f = await fixture();
  try {
    const c = await f.ready(), context = await c.host.refresh();
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(c.host.onApply(manual(context),
      options(context, cancelled.signal)), {name: 'AbortError'});
    assert.equal((await c.owner.client.getRecipe(c.target.id)).revision, 1);
    await c.host.refresh();
    // Simulate a transport losing the response only AFTER the SQLite commit.
    const fetcher = c.owner.client.fetcher;
    c.owner.client.fetcher = async (url, init) => {
      const response = await fetcher(url, init);
      if (url.endsWith(`/v1/assets/${c.target.id}/recipe`) &&
          init.method === 'PUT' && response.ok)
        throw Error('SYNTHETIC_POST_COMMIT_TRANSPORT_LOSS');
      return response;
    };
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /SYNTHETIC_POST_COMMIT_TRANSPORT_LOSS/u);
    assert.equal(c.host.getContext().ready, false);
    assert.equal((await c.owner.client.getRecipe(c.target.id)).revision, 2);
    await f.assertOriginal(c.target); await f.assertOriginal(c.backdrop);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HOST-05 / SQLITE_NON_RAW: deleted or SHA-changed backdrop cannot be applied', async () => {
  const f = await fixture();
  try {
    const c = await f.ready(), context = await c.host.refresh();
    f.context.repo.trash(c.backdrop.tenantId, c.backdrop.id);
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /ORIGINAL_SHADOW_HOST_ASSET_UNAVAILABLE/u);
    assert.equal(c.host.getContext().ready, false);
    assert.equal((await c.owner.client.getRecipe(c.target.id)).revision, 1);
    f.context.repo.restore(c.backdrop.tenantId, c.backdrop.id);
    await c.host.refresh();
    // Simulate the registry changing while the stored Original bytes do not.
    f.context.repo.db.prepare('UPDATE assets SET sha256=? WHERE id=?')
      .run('a'.repeat(64), c.backdrop.id);
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /ORIGINAL_SHADOW_HOST_ORIGINAL_CHANGED|VERIFICATION_FAILED|WAITING_FOR_ORIGINAL/u);
    assert.equal((await c.owner.client.getRecipe(c.target.id)).revision, 1);
    await f.assertOriginal(c.target); await f.assertOriginal(c.backdrop);
  } finally {await f.close();}
});

test('ORIGINAL-SHADOW-HOST-06 / SQLITE_NON_RAW: transaction CAS race does not save manual document or conflict branch', async () => {
  const f = await fixture();
  try {
    const c = await f.ready(), context = await c.host.refresh();
    const fetcher = c.owner.client.fetcher;
    let raced = false;
    c.owner.client.fetcher = async (url, init) => {
      if (!raced && url.endsWith(`/v1/assets/${c.target.id}/recipe`) &&
          init.method === 'PUT') {
        raced = true;
        const competing = await fetcher(url, {...init,
          body: JSON.stringify({expectedRevision: 1, recipe: neutral()})});
        assert.equal(competing.status, 200);
      }
      return fetcher(url, init);
    };
    await assert.rejects(c.host.onApply(manual(context), options(context)),
      /REVISION_CONFLICT/u);
    assert.equal(raced, true);
    assert.equal(c.host.getContext().ready, false);
    const latest = await c.owner.client.getRecipe(c.target.id);
    assert.equal(latest.revision, 2);
    assert.equal(Object.hasOwn(latest.body.parameters.extendedParameters,
      'originalShadowManual'), false);
    const count = f.context.repo.db.prepare(
      'SELECT COUNT(*) AS count FROM recipes WHERE asset_id=?').get(c.target.id);
    assert.equal(count.count, 2);
    await f.assertOriginal(c.target); await f.assertOriginal(c.backdrop);
  } finally {await f.close();}
});
