import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {recipe as neutralRecipe} from './fixtures.mjs';

// Real loopback Trial HTTP + temporary SQLite/object files. All Originals are
// synthetic text, never RAW or photographs. This is not a Cloud deployment test.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const selected = (asset, revision) => ({id: asset.id, sha256: asset.sha256, revision});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-batch-http-'));
  let now = START;
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((resolve, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', resolve);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name, trialEndsAt = END) {
    const author = context.auth.createAuthor({authorName: name, trialEndsAt});
    const invite = context.auth.issueInvite(author.id);
    const response = await fetch(baseURL + '/trial/login', {method: 'POST',
      headers: {'X-Suite-Trial': '1', 'Content-Type': 'application/json'},
      body: JSON.stringify({inviteToken: invite.inviteToken})});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^suite_trial=/);
    let intercept = null;
    const client = new TrialClient({baseURL, fetcher: async (url, init) => {
      const request = {...init, headers: {...init.headers, Cookie: cookie}};
      if (intercept) return intercept(url, request, () => fetch(url, request));
      return fetch(url, request);
    }});
    return {author, client, intercept(fn) {intercept = fn;}};
  }
  async function create(client, label, body = null) {
    const bytes = Buffer.from(`NON_RAW batch integration ${label}`);
    const sha256 = hash(bytes);
    const asset = await client.createAsset({name: `NON_RAW_${label}.txt`, sha256, size: bytes.length});
    assert.equal(asset.sha256, sha256);
    const uploaded = await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(uploaded.cloudSafe, true);
    const initial = body ? await client.saveRecipe(asset.id, 0, body) : null;
    return {id: asset.id, sha256, bytes, revision: initial?.revision ?? 0};
  }
  return {context, baseURL, login, create, advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((resolve, reject) => context.server.close(error => error ? reject(error) : resolve()));
      await rm(dataDir, {recursive: true, force: true});
    }};
}

async function sourceAndTargets(f, client) {
  const body = neutralRecipe();
  body.parameters.exposure = 0.75;
  const source = await f.create(client, 'source', body);
  const first = await f.create(client, 'first');
  const second = await f.create(client, 'second');
  return {source, first, second, body};
}

async function originalHash(client, asset) {
  return hash(Buffer.from(await client.getOriginal(asset.id)));
}

test('BATCH-HTTP01 / TRIAL_SQLITE_NON_RAW: two assets save through authenticated CAS while Originals remain byte-identical', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const {source, first, second, body} = await sourceAndTargets(f, client);
    const result = await applyBatchRecipe({api: client, source: selected(source, 1),
      targets: [selected(first, 0), selected(second, 0)]});
    assert.equal(result.status, 'complete');
    assert.equal(result.saved, 2);
    assert.deepEqual(result.results, [
      {assetId: first.id, status: 'saved', revision: 1},
      {assetId: second.id, status: 'saved', revision: 1},
    ]);
    for (const asset of [first, second]) {
      assert.deepEqual((await client.getRecipe(asset.id)).body, body);
      assert.equal(await originalHash(client, asset), asset.sha256);
    }
    assert.equal(await originalHash(client, source), source.sha256);
    assert.equal((await client.getRecipe(source.id)).revision, 1);
  } finally {await f.cleanup();}
});

test('BATCH-HTTP02 / TRIAL_SQLITE_NON_RAW: another author cannot list or apply the owner source and targets', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const {source, first, second} = await sourceAndTargets(f, owner.client);
    assert.deepEqual(await other.client.listAssets(), []);
    await assert.rejects(other.client.assertPermission(first.id, 'edit'));
    await assert.rejects(applyBatchRecipe({api: other.client, source: selected(source, 1),
      targets: [selected(first, 0), selected(second, 0)]}), /BATCH_ASSET_NOT_FOUND/);
    assert.equal(await owner.client.getRecipe(first.id), null);
    assert.equal(await owner.client.getRecipe(second.id), null);
    for (const asset of [source, first, second]) assert.equal(await originalHash(owner.client, asset), asset.sha256);
  } finally {await f.cleanup();}
});

test('BATCH-HTTP03 / TRIAL_SQLITE_CLOCK: expired owner cannot start the batch or write a target', async () => {
  const f = await fixture();
  try {
    const {client, author} = await f.login('Expiring Owner', '2026-10-04T08:00:00.000Z');
    const {source, first, second} = await sourceAndTargets(f, client);
    f.advance(86400000); // Trial end precedes the security-session TTL.
    await assert.rejects(client.listAssets(), /TRIAL_EXPIRED/);
    await assert.rejects(applyBatchRecipe({api: client, source: selected(source, 1),
      targets: [selected(first, 0), selected(second, 0)]}), /TRIAL_EXPIRED/);
    assert.equal(f.context.repo.latestRecipe('trial-' + author.id, first.id), null);
    assert.equal(f.context.repo.latestRecipe('trial-' + author.id, second.id), null);
  } finally {await f.cleanup();}
});

test('BATCH-HTTP04 / TRIAL_SQLITE_CAS: stale revision is failed before write; live CAS race is unverified, never saved', async () => {
  const f = await fixture();
  try {
    const {client, intercept} = await f.login('Racing Owner');
    const {source, first, second} = await sourceAndTargets(f, client);
    const competing = neutralRecipe(); competing.parameters.exposure = -0.5;
    await client.saveRecipe(first.id, 0, competing);
    const stale = await applyBatchRecipe({api: client, source: selected(source, 1),
      targets: [selected(first, 0), selected(second, 0)]});
    assert.equal(stale.status, 'partial');
    assert.deepEqual(stale.results.map(row => row.status), ['failed', 'saved']);
    assert.equal(stale.results[0].reason, 'BATCH_REVISION_CONFLICT');
    assert.deepEqual((await client.getRecipe(first.id)).body, competing);

    const third = await f.create(client, 'third');
    let raced = false;
    intercept(async (url, request, proceed) => {
      if (!raced && request.method === 'PUT' && url.endsWith(`/v1/assets/${third.id}/recipe`)) {
        raced = true;
        const response = await fetch(url, {...request, body: JSON.stringify({expectedRevision: 0, recipe: competing})});
        assert.equal(response.status, 200);
      }
      return proceed();
    });
    const conflict = await applyBatchRecipe({api: client, source: selected(source, 1),
      targets: [selected(third, 0)]});
    assert.equal(raced, true);
    assert.equal(conflict.status, 'failed');
    assert.deepEqual(conflict.results, [{assetId: third.id, status: 'unverified', reason: 'REVISION_CONFLICT'}]);
    assert.deepEqual((await client.getRecipe(third.id)).body, competing);
    for (const asset of [source, first, second, third]) assert.equal(await originalHash(client, asset), asset.sha256);
  } finally {await f.cleanup();}
});

test('BATCH-HTTP05 / TRIAL_SQLITE_AMBIGUOUS: dropped response after real commit is unverified and later target succeeds', async () => {
  const f = await fixture();
  try {
    const {client, intercept} = await f.login('Owner');
    const {source, first, second, body} = await sourceAndTargets(f, client);
    let dropped = false;
    intercept(async (url, request, proceed) => {
      if (!dropped && request.method === 'PUT' && url.endsWith(`/v1/assets/${first.id}/recipe`)) {
        dropped = true;
        const response = await proceed();
        assert.equal(response.status, 200);
        throw Error('HTTP_RESPONSE_DROPPED_AFTER_COMMIT');
      }
      return proceed();
    });
    const result = await applyBatchRecipe({api: client, source: selected(source, 1),
      targets: [selected(first, 0), selected(second, 0)]});
    assert.equal(dropped, true);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.results, [
      {assetId: first.id, status: 'unverified', reason: 'HTTP_RESPONSE_DROPPED_AFTER_COMMIT'},
      {assetId: second.id, status: 'saved', revision: 1},
    ]);
    assert.deepEqual((await client.getRecipe(first.id)).body, body);
    assert.deepEqual((await client.getRecipe(second.id)).body, body);
    for (const asset of [source, first, second]) assert.equal(await originalHash(client, asset), asset.sha256);
  } finally {await f.cleanup();}
});
