import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {build} from 'esbuild-wasm';
import {createContext, runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {recipe as neutralRecipe} from './fixtures.mjs';

// Real Trial HTTP/SQLite and the bundled normal rendering Worker. The RAW
// decoder and encoded image bytes below are synthetic mechanics fixtures only.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const clone = value => structuredClone(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stroke = (u, v, radiusFraction) => ({operation: 'ADD', path: [{u, v}],
  radiusFraction, hardness: 1});
const strokes = () => ({subjectStrokes: [stroke(.5, .5, .25)],
  correctionStrokes: [stroke(.5, .28, .1)]});
const fringe = pixels => Array.from(pixels.data.slice((9 * pixels.width + 16) * 4,
  (9 * pixels.width + 16) * 4 + 4));

const workerBundle = await build({entryPoints: [fileURLToPath(new URL('../src/processing/worker.mjs', import.meta.url))],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', external: ['module'],
  write: false, logLevel: 'silent'});
function normalWorker() {
  const messages = [], self = {postMessage(message) {messages.push(message);}};
  const context = createContext({self, Uint8Array, Uint8ClampedArray, ArrayBuffer,
    DataView, DOMException, TextEncoder, Blob, URL, structuredClone,
    crypto: globalThis.crypto, setTimeout, clearTimeout, fetch, console});
  runInContext(workerBundle.outputFiles[0].text, context);
  let next = 0;
  return async (pixels, body, options = {}) => {
    messages.length = 0;
    context.inputJSON = JSON.stringify([body, options]);
    const [workerBody, workerOptions] = runInContext('JSON.parse(inputJSON)', context);
    const id = ++next;
    await self.onmessage({data: {id, method: 'render',
      args: [pixels, workerBody, workerOptions]}});
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, id);
    if (messages[0].error) throw Error(messages[0].error.message);
    const output = messages[0].result;
    return {...output, data: new Uint8ClampedArray(output.data)};
  };
}
function frame() {
  const width = 32, height = 32, data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++)
    data.set([110, 70, 50, 255], index * 4);
  data.set([2, 3, 4, 187], (9 * width + 16) * 4);
  data.set([245, 2, 99, 0], 0);
  return {width, height, sourceWidth: width, sourceHeight: height, data};
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-bw-session-http-'));
  let now = START;
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((done, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', done);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  const cache = new Map();
  const storage = {async get(id) {return clone(cache.get(id));},
    async put(id, value) {cache.set(id, clone(value));}};
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
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_BW_SESSION_${label}`);
    const asset = await client.createAsset({name: `${label}.nonraw`,
      sha256: sha(bytes), size: bytes.length});
    const original = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const uploaded = await client.putOriginal(asset.id, original);
    const saved = await client.saveRecipe(asset.id, 0, neutralRecipe());
    assert.equal(saved.revision, 1);
    return {asset: uploaded, saved, bytes};
  }
  async function editor(client, assetId) {
    const actualRender = normalWorker(), calls = [], encodes = [];
    const processing = {syntheticTestOnly: true,
      async decodeRaw() {return {pixels: frame(), provenance: {kind: 'SYNTHETIC_NON_RAW'}};},
      async makeProxy(pixels) {return clone(pixels);},
      async render(pixels, body, options = {}) {
        const rendered = await actualRender(pixels, body, options);
        calls.push({target: options.bwEdgeTarget ?? null, pixels: clone(rendered)});
        return rendered;
      },
      async encode(pixels, {format}) {
        encodes.push(format);
        return new Blob([pixels.data], {type: `image/${format}`});
      },
    };
    const session = new EditorSession({api: client, processing, storage,
      urlAPI: {createObjectURL: () => 'blob:synthetic-bw', revokeObjectURL() {}},
      personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
    await session.initialize();
    await session.openAsset(assetId);
    return {session, calls, encodes};
  }
  return {context, cache, login, create, editor, advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1)?.startsWith('suite-bw-session-http-'))
        throw Error('UNSAFE_TEST_CLEANUP');
      await rm(target, {recursive: true, force: true});
    }};
}

test('BW-SESSION-HTTP01 / SQLITE_NON_RAW: manual strokes reach Proxy, CAS save, reload and single Final source', async () => {
  const f = await fixture(); try {
    const {client} = await f.login('Owner');
    const item = await f.create(client, 'first');
    const {session, calls} = await f.editor(client, item.asset.id);
    const before = fringe(calls.at(-1).pixels);
    await session.setBWEdgeManualStrokes(strokes());
    assert.equal(session.state.dirty, true);
    assert.equal(calls.at(-1).target, 'proxy');
    assert.notDeepEqual(fringe(calls.at(-1).pixels), before);
    assert.equal(fringe(calls.at(-1).pixels)[3], 187);
    const document = session.state.recipe.parameters.extendedParameters.bwEdgeManual;
    assert.equal(document.binding.assetID, item.asset.id);
    assert.equal(document.binding.originalSHA256, item.asset.sha256);
    await session.undo();
    assert.equal(session.state.recipe.parameters.extendedParameters.bwEdgeManual, undefined);
    assert.deepEqual(fringe(calls.at(-1).pixels), before);
    await session.redo();
    assert.deepEqual(session.state.recipe.parameters.extendedParameters.bwEdgeManual, document);
    assert.equal(calls.at(-1).target, 'proxy');
    assert.notDeepEqual(fringe(calls.at(-1).pixels), before);
    await session.save();
    assert.equal(session.state.revision, 2);
    assert.equal(session.state.dirty, false);
    assert.deepEqual((await client.getRecipe(item.asset.id)).body, session.state.recipe);
    const reopened = await f.editor(client, item.asset.id);
    assert.equal(reopened.session.state.revision, 2);
    assert.deepEqual(reopened.session.state.recipe, session.state.recipe);
    assert.equal(reopened.calls.at(-1).target, 'proxy');
    const final = await reopened.session.exportFinal({format: 'png'});
    assert.equal(final.type, 'image/png');
    assert.equal(reopened.calls.at(-1).target, 'source');
    const finalBytes = new Uint8Array(await final.arrayBuffer());
    const offset = (9 * 32 + 16) * 4;
    assert.notDeepEqual(Array.from(finalBytes.slice(offset, offset + 4)), before);
    assert.equal(finalBytes[offset + 3], 187);
    assert.equal(sha(Buffer.from(await client.getOriginal(item.asset.id))), item.asset.sha256);
  } finally {await f.cleanup();}
});

test('BW-SESSION-HTTP02: foreign Asset/SHA and revoked authorization never create a manual draft', async () => {
  const f = await fixture(); try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const item = await f.create(owner.client, 'first');
    const {session, calls} = await f.editor(owner.client, item.asset.id);
    const foreign = neutralRecipe();
    foreign.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
      binding: {assetID: crypto.randomUUID(), originalSHA256: item.asset.sha256,
        sourceWidth: 32, sourceHeight: 32}, ...strokes()};
    assert.throws(() => session.bind(foreign), /BW_EDGE_ASSET_BINDING_MISMATCH/);
    foreign.parameters.extendedParameters.bwEdgeManual.binding.assetID = item.asset.id;
    foreign.parameters.extendedParameters.bwEdgeManual.binding.originalSHA256 = 'f'.repeat(64);
    assert.throws(() => session.bind(foreign), /BW_EDGE_ASSET_BINDING_MISMATCH/);
    const count = calls.length;
    session.api = other.client;
    await assert.rejects(session.setBWEdgeManualStrokes(strokes()));
    assert.equal(calls.length, count);
    assert.equal(session.state.dirty, false);
    session.api = owner.client;
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(session.setBWEdgeManualStrokes(strokes()), /TRIAL_REVOKED/);
    assert.equal(calls.length, count);
    assert.equal(session.state.dirty, false);
    assert.equal((await f.context.repo.latestRecipe(`trial-${owner.author.id}`, item.asset.id)).revision, 1);
  } finally {await f.cleanup();}
});

test('BW-SESSION-HTTP03 / SQLITE_CAS: stale saved revision rejects before Proxy and cannot overwrite remote', async () => {
  const f = await fixture(); try {
    const {client} = await f.login('Owner');
    const item = await f.create(client, 'first');
    const {session, calls} = await f.editor(client, item.asset.id);
    await client.saveRecipe(item.asset.id, 1, neutralRecipe());
    const before = calls.length;
    await assert.rejects(session.setBWEdgeManualStrokes(strokes()),
      /BW_EDGE_GATE_REVISION_CONFLICT/);
    assert.equal(calls.length, before);
    assert.equal(session.state.dirty, false);
    assert.equal((await client.getRecipe(item.asset.id)).revision, 2);
  } finally {await f.cleanup();}
});

test('BW-SESSION-HTTP03B / SQLITE_CAS: remote revision arriving after draft blocks Save', async () => {
  const f = await fixture(); try {
    const {client} = await f.login('Owner');
    const item = await f.create(client, 'first');
    const {session} = await f.editor(client, item.asset.id);
    await session.setBWEdgeManualStrokes(strokes());
    assert.equal(session.state.dirty, true);
    await client.saveRecipe(item.asset.id, 1, neutralRecipe());
    await assert.rejects(session.save(), /BW_EDGE_GATE_REVISION_CONFLICT/);
    assert.equal(session.state.dirty, true);
    assert.equal(session.state.revision, 1);
    assert.equal((await client.getRecipe(item.asset.id)).revision, 2);
  } finally {await f.cleanup();}
});

test('BW-SESSION-HTTP04 / SQLITE_NON_RAW: a masked Batch Final rejects before any individual Blob', async () => {
  const f = await fixture(); try {
    const {client} = await f.login('Owner');
    const first = await f.create(client, 'first'), second = await f.create(client, 'second');
    const {session, calls, encodes} = await f.editor(client, first.asset.id);
    await session.setBWEdgeManualStrokes(strokes());
    await session.save();
    const before = calls.length, encodedBefore = encodes.length;
    await assert.rejects(session.exportBatchFinal({orderedIds: [second.asset.id, first.asset.id],
      format: 'png'}), /EXPORT_BATCH_BW_EDGE_REVIEW_REQUIRED/);
    assert.equal(calls.length, before);
    assert.equal(encodes.length, encodedBefore);
    assert.equal(session.state.exporting, false);
    assert.equal((await client.getRecipe(first.asset.id)).revision, 2);
    assert.equal((await client.getRecipe(second.asset.id)).revision, 1);
  } finally {await f.cleanup();}
});
