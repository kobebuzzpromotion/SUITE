import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {renderPixels, makeProxyPixels} from '../src/processing/pure.mjs';
import {expandCanvasPixels} from '../src/processing/canvas-expand.mjs';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {recipe as neutralRecipe} from './fixtures.mjs';

// Real loopback Trial HTTP, temporary SQLite and immutable Original objects.
// Original bytes and the injected decode/encode pixels are synthetic NON_RAW
// fixtures. This is neither AI crop inference nor a real-image/RAW visual QA.
const NOW = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pixels = (width, height, value) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value + 1, value + 2, 255], i);
  return {width, height, data};
};
const expansion = Object.freeze({schemaVersion: 1,
  margins: {left: 0.5, right: 0.25, top: 0.5, bottom: 0},
  background: [8, 9, 10, 255]});
function expandedRecipe() {
  const body = neutralRecipe();
  body.parameters.extendedParameters.canvasExpand = structuredClone(expansion);
  validateRecipe(body);
  return body;
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-canvas-sync-http-'));
  const context = await createTrialServer({dataDir, port: 0, clock: () => NOW});
  await new Promise((resolve, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', resolve);
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
    let intercept = null;
    const client = new TrialClient({baseURL, fetcher: async (url, init) => {
      const request = {...init, headers: {...init.headers, Cookie: cookie}};
      if (intercept) return intercept(url, request, () => fetch(url, request));
      return fetch(url, request);
    }});
    return {client, intercept(fn) {intercept = fn;}};
  }
  async function create(client, label, body) {
    const bytes = Buffer.from(`NON_RAW canvas-sync ${label}`);
    const asset = await client.createAsset({name: `${label}.txt`, sha256: hash(bytes), size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const stored = body ? await client.saveRecipe(asset.id, 0, body) : null;
    return {asset, bytes, revision: stored?.revision ?? 0};
  }
  return {context, login, create, async cleanup() {
    await new Promise((resolve, reject) => context.server.close(error => error ? reject(error) : resolve()));
    await rm(dataDir, {recursive: true, force: true});
  }};
}

function syntheticProcessing() {
  const calls = {decode: [], render: [], encode: [], detect: 0};
  const sizes = {source: {proxy: [4, 3], final: [8, 6]},
    first: {proxy: [4, 3], final: [8, 6]},
    second: {proxy: [6, 4], final: [12, 8]}};
  const processing = {
    async decodeRaw(buffer, {mode} = {}) {
      const label = new TextDecoder().decode(buffer).split(' ').at(-1);
      const dimensions = sizes[label]?.[mode];
      if (!dimensions) throw Error('SYNTHETIC_NON_RAW_ONLY');
      calls.decode.push([label, mode]);
      return {pixels: pixels(...dimensions, label === 'second' ? 60 : 30),
        provenance: {fixture: 'NON_RAW_SYNTHETIC'}, metadata: {fixture: true}};
    },
    async makeProxy(image, edge) {return makeProxyPixels(image, edge);},
    async render(image, body) {
      const base = renderPixels(image, body, {validateRecipe, resolutionAssessment});
      const canvas = body.parameters.extendedParameters.canvasExpand;
      const result = canvas ? expandCanvasPixels(base, projectCanvasExpansion(base, canvas)) : base;
      calls.render.push([image.width, image.height, result.width, result.height]);
      return result;
    },
    async encode(image, {format} = {}) {
      calls.encode.push([format, image.width, image.height]);
      return new Blob([image.data], {type: `image/${format}`});
    },
    async detectPeople() {calls.detect++;throw Error('AI_CROP_NOT_AVAILABLE');},
  };
  return {processing, calls};
}

async function originalHash(client, asset) {
  return hash(Buffer.from(await client.getOriginal(asset.id)));
}

test('CANVAS-SYNC-HTTP01 / NON_RAW: authorized saved manual margins batch-copy to two assets; each Proxy and Final projects its own size, Originals stay immutable', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Canvas owner');
    const body = expandedRecipe();
    const source = await f.create(client, 'source', body);
    const first = await f.create(client, 'first');
    const second = await f.create(client, 'second');
    const {processing, calls} = syntheticProcessing();
    const cache = new Map(), storage = {get: async id => structuredClone(cache.get(id)),
      put: async (id, value) => {cache.set(id, structuredClone(value));}};
    let nextURL = 0;
    const urlAPI = {createObjectURL: () => `blob:synthetic-${++nextURL}`, revokeObjectURL() {}};
    const session = new EditorSession({api: client, processing, storage, urlAPI});
    await session.initialize();
    await session.openAsset(source.asset.id);
    const batch = await session.batchApplyCurrentRecipe([first.asset.id, second.asset.id]);
    assert.equal(batch.status, 'complete');
    assert.equal(batch.saved, 2);
    assert.deepEqual(batch.results.map(row => row.status), ['saved', 'saved']);
    assert.deepEqual(batch.results.map(row => row.revision), [1, 1]);
    for (const target of [first, second]) {
      const stored = await client.getRecipe(target.asset.id);
      assert.equal(stored.revision, 1);
      assert.deepEqual(stored.body, body); // Copy, not target-specific inference.
      assert.equal(await originalHash(client, target.asset), target.asset.sha256);
    }
    assert.equal(await originalHash(client, source.asset), source.asset.sha256);
    assert.deepEqual((await client.getRecipe(source.asset.id)).body, body);

    for (const [target, proxy, final] of [
      [first, [7, 5], [14, 9]],
      [second, [11, 6], [21, 12]],
    ]) {
      await session.openAsset(target.asset.id);
      assert.deepEqual(calls.render.at(-1).slice(-2), proxy);
      const output = await session.exportFinal({format: 'png'});
      assert.equal(output.type, 'image/png');
      assert.deepEqual(calls.render.at(-1).slice(-2), final);
      assert.deepEqual(calls.encode.at(-1).slice(1), final);
      assert.equal(await originalHash(client, target.asset), target.asset.sha256);
    }
    assert.equal(calls.detect, 0); // No AI Locate or Auto Expand inference exists here.
  } finally {await f.cleanup();}
});

test('CANVAS-SYNC-HTTP02 / NON_RAW: CAS conflict on one target does not overwrite it or mislabel it saved', async () => {
  const f = await fixture();
  try {
    const {client, intercept} = await f.login('Canvas owner');
    const source = await f.create(client, 'source', expandedRecipe());
    const first = await f.create(client, 'first');
    const second = await f.create(client, 'second');
    const {processing} = syntheticProcessing();
    const session = new EditorSession({api: client, processing,
      urlAPI: {createObjectURL: () => 'blob:synthetic', revokeObjectURL() {}}});
    await session.initialize();await session.openAsset(source.asset.id);
    const competing = neutralRecipe();competing.parameters.exposure = -0.5;
    let raced = false;
    intercept(async (url, request, proceed) => {
      if (!raced && request.method === 'PUT' && url.endsWith(`/v1/assets/${first.asset.id}/recipe`)) {
        raced = true;
        const response = await fetch(url, {...request,
          body: JSON.stringify({expectedRevision: 0, recipe: competing})});
        assert.equal(response.status, 200);
      }
      return proceed();
    });
    const batch = await session.batchApplyCurrentRecipe([first.asset.id, second.asset.id]);
    assert.equal(raced, true);
    assert.equal(batch.status, 'partial');
    assert.deepEqual(batch.results.map(row => row.status), ['unverified', 'saved']);
    assert.deepEqual((await client.getRecipe(first.asset.id)).body, competing);
    assert.deepEqual((await client.getRecipe(second.asset.id)).body, expandedRecipe());
    for (const item of [source, first, second])
      assert.equal(await originalHash(client, item.asset), item.asset.sha256);
  } finally {await f.cleanup();}
});

test('CANVAS-SYNC-HTTP03 / NON_RAW: another author cannot access the source or target Recipes', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Canvas owner'), outsider = await f.login('Other author');
    const source = await f.create(owner.client, 'source', expandedRecipe());
    const first = await f.create(owner.client, 'first');
    const second = await f.create(owner.client, 'second');
    assert.deepEqual(await outsider.client.listAssets(), []);
    await assert.rejects(outsider.client.assertPermission(first.asset.id, 'edit'));
    await assert.rejects(outsider.client.getRecipe(source.asset.id));
    assert.equal(await owner.client.getRecipe(first.asset.id), null);
    assert.equal(await owner.client.getRecipe(second.asset.id), null);
    for (const item of [source, first, second])
      assert.equal(await originalHash(owner.client, item.asset), item.asset.sha256);
  } finally {await f.cleanup();}
});
