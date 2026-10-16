import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {portrait, recipe} from './fixtures.mjs';

// All files are synthetic text and all Recipe data is numerical. Real Trial
// HTTP/SQLite authority is exercised; no RAW decoder, AI generation or Cloud.
const clock = () => Date.parse('2026-10-03T08:00:00.000Z');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const selected = (item, revision) => ({id: item.id, sha256: item.sha256, revision});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-batch-target-protect-'));
  const context = await createTrialServer({dataDir, port: 0, clock});
  await new Promise((resolve, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', resolve);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  const author = context.auth.createAuthor({authorName: 'Batch target protection owner',
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
  const create = async label => {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_TARGET_PROTECTION_${label}`);
    const sha256 = digest(bytes);
    const item = await client.createAsset({name: `${label}.nonraw`, sha256, size: bytes.length});
    await client.putOriginal(item.id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return {id: item.id, sha256, bytes};
  };
  return {client, create, async cleanup() {
    await new Promise((resolve, reject) => context.server.close(error => error ? reject(error) : resolve()));
    await rm(dataDir, {recursive: true, force: true});
  }};
}

test('BATCH-TARGET-HTTP01 / TRIAL_SQLITE_NON_RAW: protected Portrait target is rejected, independent target saves', async () => {
  const f = await fixture();
  try {
    const source = await f.create('source'), protectedAsset = await f.create('portrait'), safe = await f.create('safe');
    const sourceRecipe = recipe();sourceRecipe.parameters.exposure = 0.75;
    await f.client.saveRecipe(source.id, 0, sourceRecipe);
    const ownPortrait = portrait(protectedAsset.id);
    ownPortrait.originalSHA256 = protectedAsset.sha256;
    const protectedRecipe = recipe(ownPortrait);
    await f.client.saveRecipe(protectedAsset.id, 0, protectedRecipe);
    const protectedBefore = await f.client.getRecipe(protectedAsset.id);
    const result = await applyBatchRecipe({api: f.client, source: selected(source, 1),
      targets: [selected(protectedAsset, 1), selected(safe, 0)]});
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.results, [
      {assetId: protectedAsset.id, status: 'failed', reason: 'BATCH_PORTRAIT_PHOTO_BOUND_RECIPE'},
      {assetId: safe.id, status: 'saved', revision: 1},
    ]);
    assert.deepEqual(await f.client.getRecipe(protectedAsset.id), protectedBefore);
    assert.deepEqual((await f.client.getRecipe(safe.id)).body, sourceRecipe);
    assert.deepEqual((await f.client.getRecipe(source.id)).body, sourceRecipe);
    for (const item of [source, protectedAsset, safe])
      assert.equal(digest(Buffer.from(await f.client.getOriginal(item.id))), item.sha256);
  } finally {await f.cleanup();}
});
