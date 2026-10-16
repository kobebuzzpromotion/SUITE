import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {recipe, portrait, syntheticPixels} from './fixtures.mjs';

// Real loopback Trial HTTP, SQLite, and immutable local object storage.
// Decoder/render/encoder and bytes are synthetic NON_RAW; no RAW or Cloud claim.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const clone = value => structuredClone(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-batch-final-http-'));
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
      return intercept ? intercept(url, request, () => fetch(url, request)) : fetch(url, request);
    }});
    return {author, client, intercept(fn) {intercept = fn;}};
  }
  async function create(client, label) {
    const bytes = Buffer.from(`NON_RAW Batch Final HTTP ${label}`);
    const sha256 = hash(bytes);
    const asset = await client.createAsset({name: `NON_RAW_${label}.txt`,
      sha256, size: bytes.length});
    const uploaded = await client.putOriginal(asset.id,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(uploaded.cloudSafe, true);
    const saved = await client.saveRecipe(asset.id, 0, recipe());
    assert.equal(saved.revision, 1);
    return {asset: uploaded, bytes, saved};
  }
  async function editor(client, records) {
    const cache = new Map(records.map(item => [item.asset.id, {asset: clone(item.asset),
      proxy: syntheticPixels(4, 4), history: [clone(item.saved.body)], cursor: 0,
      revision: item.saved.revision, reference: null, dirty: false}]));
    const storage = {async get(id) {return clone(cache.get(id));},
      async put() {throw Error('LOCAL_WRITE_FORBIDDEN');}};
    let finalEncodes = 0;
    const processing = {
      syntheticTestOnly: true,
      async decodeRaw() {return {pixels: syntheticPixels(4, 4), provenance: {fixture: 'NON_RAW'}};},
      async makeProxy(pixels) {return pixels;},
      async render(pixels) {return pixels;},
      async encode(pixels, {format}) {
        if (format !== 'png') finalEncodes++;
        return new Blob([pixels.data], {type: `image/${format}`});
      },
    };
    const urlAPI = {createObjectURL: () => 'blob:batch-final-http-mock', revokeObjectURL() {}};
    const session = new EditorSession({api: client, processing, storage, urlAPI,
      personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
    await session.initialize();
    await session.openAsset(records[0].asset.id);
    return {session, cache, processing, get finalEncodes() {return finalEncodes;}};
  }
  return {context, login, create, editor,
    objectPath(asset) {return join(dataDir, 'objects', asset.originalKey);},
    advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((resolve, reject) => context.server.close(error => error ? reject(error) : resolve()));
      await rm(dataDir, {recursive: true, force: true});
    }};
}

test('BATCH-FINAL-HTTP01 / TRIAL_SQLITE_NON_RAW: two saved Assets produce ordered Blobs; Originals and Recipes remain unchanged', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const first = await f.create(client, 'first'), second = await f.create(client, 'second');
    const {session} = await f.editor(client, [first, second]);
    const before = session.state;
    const result = await session.exportBatchFinal({orderedIds: [second.asset.id, first.asset.id],
      format: 'jpeg'});
    assert.equal(result.status, 'complete');
    assert.deepEqual(result.items.map(item => item.assetId), [second.asset.id, first.asset.id]);
    assert.deepEqual(result.plan.map(item => [item.sequence, item.total]), [[1, 2], [2, 2]]);
    assert.ok(result.items.every(item => item.blob.type === 'image/jpeg' && item.blob.size > 0));
    assert.equal(session.state.asset.id, before.asset.id);
    assert.equal(session.state.dirty, false);
    assert.deepEqual(session.state.recipe, before.recipe);
    for (const item of [first, second]) {
      assert.equal(hash(Buffer.from(await client.getOriginal(item.asset.id))), item.asset.sha256);
      assert.deepEqual(await client.getRecipe(item.asset.id), item.saved);
    }
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP02 / TRIAL_SQLITE_NON_RAW: another identity cannot use an owner session snapshot', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const {session, finalEncodes} = await f.editor(owner.client, [first, second]);
    assert.deepEqual(await other.client.listAssets(), []);
    await assert.rejects(other.client.assertPermission(first.asset.id, 'export'));
    session.api = other.client;
    await assert.rejects(session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}));
    assert.equal(finalEncodes, 0);
    assert.equal(session.state.exporting, false);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(first.asset.id))), first.asset.sha256);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP03 / TRIAL_SQLITE_CLOCK: expired owner cannot begin Final after opening saved Assets', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Expiring Owner', '2026-10-04T08:00:00.000Z');
    const first = await f.create(client, 'first'), second = await f.create(client, 'second');
    const {session} = await f.editor(client, [first, second]);
    f.advance(86400000);
    await assert.rejects(session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /TRIAL_EXPIRED/);
    assert.equal(session.state.exporting, false);
    assert.equal(session.state.asset.id, first.asset.id);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP04 / TRIAL_SQLITE_CAS: second Recipe revision changes after first Blob; whole batch rejects', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const editor = await f.editor(owner.client, [first, second]);
    let secondReads = 0, raced = false;
    owner.intercept(async (url, request, proceed) => {
      if (request.method === 'GET' && url.includes(`/v1/assets/${second.asset.id}/recipe`) &&
          ++secondReads === 2) {
        raced = true;
        const changed = recipe(); changed.parameters.exposure = 0.5;
        await owner.client.saveRecipe(second.asset.id, 1, changed);
      }
      return proceed();
    });
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /EXPORT_BATCH_FIXED_RECIPE_MISMATCH/);
    assert.equal(raced, true);
    assert.equal(editor.finalEncodes, 1);
    assert.equal(editor.session.state.exporting, false);
    assert.equal(editor.session.state.asset.id, first.asset.id);
    assert.equal((await owner.client.getRecipe(first.asset.id)).revision, 1);
    assert.equal((await owner.client.getRecipe(second.asset.id)).revision, 2);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP05 / TRIAL_SQLITE_TAMPERED_RESPONSE: changed second Original bytes reject every Blob', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const editor = await f.editor(owner.client, [first, second]);
    let tampered = false;
    owner.intercept(async (url, request, proceed) => {
      if (request.method === 'GET' && url.includes(`/v1/assets/${second.asset.id}/original?`)) {
        tampered = true;
        return new Response(new Uint8Array([1, 2, 3]), {status: 200,
          headers: {'Content-Type': 'application/octet-stream'}});
      }
      return proceed();
    });
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /RAW_CHECKSUM_MISMATCH/);
    assert.equal(tampered, true);
    assert.equal(editor.finalEncodes, 1);
    owner.intercept(null);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(second.asset.id))), second.asset.sha256);
    assert.equal(editor.session.state.asset.id, first.asset.id);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP06 / TRIAL_SQLITE_PORTRAIT: saved Portrait Recipe is refused before any batch Blob', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const first = await f.create(client, 'first'), second = await f.create(client, 'second');
    const portraitBody = recipe({...portrait(second.asset.id),
      originalSHA256: second.asset.sha256});
    const savedPortrait = await client.saveRecipe(second.asset.id, 1, portraitBody);
    assert.equal(savedPortrait.revision, 2);
    second.saved = savedPortrait;
    const editor = await f.editor(client, [first, second]);
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /EXPORT_BATCH_PERSON_REVIEW_REQUIRED/);
    assert.equal(editor.finalEncodes, 0);
    assert.equal(editor.session.state.asset.id, first.asset.id);
    assert.equal(hash(Buffer.from(await client.getOriginal(second.asset.id))), second.asset.sha256);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP07 / TRIAL_SQLITE_CLOCK: authorization expiring after the first Blob rejects the whole batch', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Expiring Owner', '2026-10-04T08:00:00.000Z');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const editor = await f.editor(owner.client, [first, second]);
    let firstPermissions = 0;
    owner.intercept(async (url, request, proceed) => {
      if (request.method === 'POST' && url.endsWith('/trial/authorize')) {
        const body = JSON.parse(request.body);
        if (body.assetID === first.asset.id && body.action === 'export') {
          const response = await proceed();
          if (++firstPermissions === 3) f.advance(86400000);
          return response;
        }
      }
      return proceed();
    });
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /TRIAL_EXPIRED/);
    assert.equal(firstPermissions, 3);
    assert.equal(editor.finalEncodes, 1);
    assert.equal(editor.session.state.exporting, false);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP08 / TRIAL_SQLITE_TOCTOU: remote Original changed after first GET must not yield completed Blobs', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const editor = await f.editor(owner.client, [first, second]);
    let corrupted = false;
    owner.intercept(async (url, request, proceed) => {
      if (!corrupted && request.method === 'GET' &&
          url.includes(`/v1/assets/${first.asset.id}/original?`)) {
        const response = await proceed();
        assert.equal(response.status, 200);
        const originalBody = await response.arrayBuffer();
        assert.equal(hash(Buffer.from(originalBody)), first.asset.sha256);
        await writeFile(f.objectPath(first.asset), Buffer.alloc(originalBody.byteLength, 0x58));
        corrupted = true;
        return new Response(originalBody, {status: 200,
          headers: {'Content-Type': 'application/octet-stream'}});
      }
      return proceed();
    });
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /RAW_CHECKSUM_CHANGED|RAW_CHECKSUM_MISMATCH|WAITING_FOR_ORIGINAL/);
    assert.equal(corrupted, true);
    assert.notEqual(hash(await readFile(f.objectPath(first.asset))), first.asset.sha256);
    assert.equal(editor.session.state.exporting, false);
  } finally {await f.cleanup();}
});

test('BATCH-FINAL-HTTP09 / TRIAL_SQLITE_TOCTOU: first Original changes during second item, before batch return', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const first = await f.create(owner.client, 'first'), second = await f.create(owner.client, 'second');
    const editor = await f.editor(owner.client, [first, second]);
    let corrupted = false;
    owner.intercept(async (url, request, proceed) => {
      if (!corrupted && request.method === 'GET' &&
          url.includes(`/v1/assets/${second.asset.id}/original?`)) {
        // The first item's own post-render checks have already completed.
        await writeFile(f.objectPath(first.asset), Buffer.alloc(first.bytes.length, 0x59));
        corrupted = true;
      }
      return proceed();
    });
    await assert.rejects(editor.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg'}), /RAW_CHECKSUM_CHANGED|RAW_CHECKSUM_MISMATCH|WAITING_FOR_ORIGINAL/);
    assert.equal(corrupted, true);
    assert.notEqual(hash(await readFile(f.objectPath(first.asset))), first.asset.sha256);
    assert.equal(editor.session.state.exporting, false);
  } finally {await f.cleanup();}
});
