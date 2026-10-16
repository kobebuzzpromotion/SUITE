import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {applyBatchCalibrationSync} from '../src/batch-calibration-sync.mjs';
import {recipe} from './fixtures.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);
const selected = asset => ({id: asset.id, sha256: asset.sha256, revision: asset.revision});
const CALIBRATION = {red: {hue: 24, saturation: -30},
  green: {hue: -15, saturation: 45}, blue: {hue: 9, saturation: 60}};

function adjustment(body, calibration, exposure, temperature, sharpness = 20) {
  const fixed = copy(body);
  fixed.parameters.exposure = exposure;
  fixed.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {temperature, ...(calibration ? {calibration: copy(calibration)} : {})},
    detail: {sharpness},
  };
  fixed.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  return fixed;
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-calibration-sync-http-'));
  let now = Date.parse('2026-10-03T08:00:00.000Z');
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((resolve, reject) => {
    context.server.once('error', reject);context.server.listen(0, '127.0.0.1', resolve);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name, trialEndsAt = '2026-11-03T08:00:00.000Z') {
    const author = context.auth.createAuthor({authorName: name, trialEndsAt});
    const invite = context.auth.issueInvite(author.id);
    const response = await fetch(baseURL + '/trial/login', {method: 'POST',
      headers: {'X-Suite-Trial': '1', 'Content-Type': 'application/json'},
      body: JSON.stringify({inviteToken: invite.inviteToken})});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    const client = new TrialClient({baseURL, fetcher: (url, init) => fetch(url,
      {...init, headers: {...init.headers, Cookie: cookie}})});
    return {author, client};
  }
  async function create(client, label, body) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_CALIBRATION_SYNC_${label}`);
    const sha256 = hash(bytes);
    const asset = await client.createAsset({name: `${label}.nonraw`, sha256, size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const saved = await client.saveRecipe(asset.id, 0, body);
    return {...asset, revision: saved.revision, bytes};
  }
  async function cleanup() {
    await new Promise(resolve => context.server.close(resolve));
    await rm(dataDir, {recursive: true, force: true});
  }
  return {context, login, create, cleanup, advance(ms) {now += ms;}};
}

test('CALIBRATION-SYNC-HTTP01 / TRIAL_SQLITE_NON_RAW: six controls merge into two targets; unrelated values and Originals stay', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Calibration Owner');
    const sourceBody = adjustment(recipe(), CALIBRATION, 1.2, 18, 15);
    const firstBody = adjustment(recipe(), {red: {hue: -20}}, -0.4, -22, 30);
    const secondBody = adjustment(recipe(), null, 0.75, 9, 42);
    const source = await f.create(client, 'source', sourceBody);
    const first = await f.create(client, 'first', firstBody);
    const second = await f.create(client, 'second', secondBody);
    const result = await applyBatchCalibrationSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)], expectedSourceRecipe: copy(sourceBody)});
    assert.equal(result.status, 'complete');assert.equal(result.saved, 2);
    assert.deepEqual(result.results.map(row => row.status), ['saved', 'saved']);
    for (const [asset, previous] of [[first, firstBody], [second, secondBody]]) {
      const saved = await client.getRecipe(asset.id);
      assert.equal(saved.revision, 2);
      assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
        CALIBRATION);
      assert.equal(saved.body.parameters.exposure, previous.parameters.exposure);
      assert.equal(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.temperature,
        previous.parameters.extendedParameters.postDecodeAdjustments.color.temperature);
      assert.equal(saved.body.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness,
        previous.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness);
      assert.equal(hash(Buffer.from(await client.getOriginal(asset.id))), asset.sha256);
    }
    assert.deepEqual((await client.getRecipe(source.id)).body, sourceBody);
    assert.equal(hash(Buffer.from(await client.getOriginal(source.id))), source.sha256);
  } finally {await f.cleanup();}
});

test('CALIBRATION-SYNC-HTTP02 / TRIAL_SQLITE: stale target is partial, other owner and expiration reject', async () => {
  const f = await fixture();
  try {
    const {client, author} = await f.login('Owner', '2026-10-04T08:00:00.000Z');
    const source = await f.create(client, 'source-stale', adjustment(recipe(), CALIBRATION, 0, 0));
    const first = await f.create(client, 'first-stale', recipe());
    const second = await f.create(client, 'second-stale', recipe());
    await client.saveRecipe(first.id, 1, recipe());
    const partial = await applyBatchCalibrationSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)]});
    assert.equal(partial.status, 'partial');
    assert.deepEqual(partial.results.map(row => row.status), ['failed', 'saved']);
    assert.equal(partial.results[0].reason, 'CALIBRATION_SYNC_REVISION_CONFLICT');
    assert.deepEqual((await client.getRecipe(first.id)).body, recipe());
    assert.equal(hash(Buffer.from(await client.getOriginal(first.id))), first.sha256);
    const {client: other} = await f.login('Other owner');
    await assert.rejects(applyBatchCalibrationSync({api: other, source: selected(source),
      targets: [selected(first), selected(second)]}), /CALIBRATION_SYNC_ASSET_UNAVAILABLE/);
    f.advance(86400000);
    await assert.rejects(applyBatchCalibrationSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)]}), /TRIAL_EXPIRED/);
    assert.equal(f.context.repo.latestRecipe('trial-' + author.id, source.id).revision, 1);
  } finally {await f.cleanup();}
});

test('CALIBRATION-SYNC-HTTP03 / TRIAL_SQLITE: mid-batch expiration reports partial and leaves remaining Recipe untouched', async () => {
  const f = await fixture();
  try {
    const {client, author} = await f.login('Short Trial', '2026-10-04T08:00:00.000Z');
    const source = await f.create(client, 'source-expiry', adjustment(recipe(), CALIBRATION, 0, 0));
    const first = await f.create(client, 'first-expiry', adjustment(recipe(), null, -0.4, 10));
    const secondBody = adjustment(recipe(), null, 0.5, -10);
    const second = await f.create(client, 'second-expiry', secondBody);
    let firstSaved = false, expired = false;
    const api = {
      listAssets: () => client.listAssets(),
      assertPermission: (id, action) => client.assertPermission(id, action),
      async getRecipe(id) {
        const stored = await client.getRecipe(id);
        if (id === source.id && firstSaved && !expired) {
          expired = true;
          f.advance(86400000);
        }
        return stored;
      },
      async saveRecipe(id, revision, body) {
        const result = await client.saveRecipe(id, revision, body);
        if (id === first.id) firstSaved = true;
        return result;
      },
    };
    const result = await applyBatchCalibrationSync({api, source: selected(source),
      targets: [selected(first), selected(second)]});
    assert.equal(expired, true);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.results.map(row => row.status), ['saved', 'failed']);
    assert.equal(result.results[1].reason, 'TRIAL_EXPIRED');
    const untouched = f.context.repo.latestRecipe('trial-' + author.id, second.id);
    assert.equal(untouched.revision, 1);
    assert.deepEqual(untouched.body, secondBody);
    assert.equal(hash(second.bytes), second.sha256);
  } finally {await f.cleanup();}
});
