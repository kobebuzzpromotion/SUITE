import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {applyBatchSelectiveColorSync} from '../src/batch-selective-color-sync.mjs';
import {recipe} from './fixtures.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const selected = asset => ({id: asset.id, sha256: asset.sha256, revision: asset.revision});
function adjustment(body, selective, exposure, temperature) {
  const fixed = clone(body);
  fixed.parameters.exposure = exposure;
  if (selective || temperature !== undefined) {
    fixed.parameters.extendedParameters.postDecodeAdjustments = {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
      color: {...(selective ? {selectiveColor: clone(selective)} : {}),
        ...(temperature !== undefined ? {temperature} : {})},
      detail: {grain: {amount: 10, seed: 7}},
    };
    fixed.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  }
  return fixed;
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-selective-sync-http-'));
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
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_SELECTIVE_SYNC_${label}`);
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

test('SELECTIVE-SYNC-HTTP01 / TRIAL_SQLITE_NON_RAW: two targets get only saved Selective Color and keep Originals', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Selective Owner');
    const selective = {method: 'absolute', ranges: {reds: {cyan: 35, magenta: -15},
      neutrals: {black: 20}}};
    const sourceBody = adjustment(recipe(), selective, 1.2, 18);
    const firstBody = adjustment(recipe(), {ranges: {blues: {yellow: -25}}}, -0.4, -22);
    const secondBody = adjustment(recipe(), null, 0.75);
    const source = await f.create(client, 'source', sourceBody);
    const first = await f.create(client, 'first', firstBody);
    const second = await f.create(client, 'second', secondBody);
    const result = await applyBatchSelectiveColorSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)], expectedSourceRecipe: clone(sourceBody)});
    assert.equal(result.status, 'complete');assert.equal(result.saved, 2);
    assert.deepEqual(result.results.map(row => row.status), ['saved', 'saved']);
    for (const [asset, previous] of [[first, firstBody], [second, secondBody]]) {
      const saved = await client.getRecipe(asset.id);
      assert.equal(saved.revision, 2);
      assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
        selective);
      assert.equal(saved.body.parameters.exposure, previous.parameters.exposure);
      assert.equal(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.temperature,
        previous.parameters.extendedParameters.postDecodeAdjustments?.color.temperature);
      assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.detail,
        previous.parameters.extendedParameters.postDecodeAdjustments?.detail);
      assert.equal(hash(Buffer.from(await client.getOriginal(asset.id))), asset.sha256);
    }
    assert.deepEqual((await client.getRecipe(source.id)).body, sourceBody);
    assert.equal(hash(Buffer.from(await client.getOriginal(source.id))), source.sha256);
  } finally {await f.cleanup();}
});

test('SELECTIVE-SYNC-HTTP02 / TRIAL_SQLITE: stale target CAS is partial, expiration and other author reject', async () => {
  const f = await fixture();
  try {
    const {client, author} = await f.login('Owner', '2026-10-04T08:00:00.000Z');
    const source = await f.create(client, 'source', adjustment(recipe(),
      {ranges: {greens: {magenta: 30}}}, 0));
    const first = await f.create(client, 'first', recipe());
    const second = await f.create(client, 'second', recipe());
    await client.saveRecipe(first.id, 1, recipe());
    const partial = await applyBatchSelectiveColorSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)]});
    assert.equal(partial.status, 'partial');
    assert.deepEqual(partial.results.map(row => row.status), ['failed', 'saved']);
    assert.equal(partial.results[0].reason, 'SELECTIVE_SYNC_REVISION_CONFLICT');
    const {client: other} = await f.login('Other author');
    await assert.rejects(applyBatchSelectiveColorSync({api: other, source: selected(source),
      targets: [selected(first), selected(second)]}), /SELECTIVE_SYNC_ASSET_UNAVAILABLE/);
    f.advance(86400000);
    await assert.rejects(applyBatchSelectiveColorSync({api: client, source: selected(source),
      targets: [selected(first), selected(second)]}), /TRIAL_EXPIRED/);
    assert.equal(f.context.repo.latestRecipe('trial-' + author.id, source.id).revision, 1);
  } finally {await f.cleanup();}
});
