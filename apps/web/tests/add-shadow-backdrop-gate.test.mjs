import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readTrialAddShadowBackdrop} from '../src/add-shadow-backdrop-gate.mjs';
import {recipe} from './fixtures.mjs';

// Distinct synthetic non-RAW Originals. They prove HTTP/SQLite identity,
// permission, SHA and fail-closed decoding; they cannot prove RAW RGBA success.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const bytes = value => Uint8Array.from({length: 32}, (_, i) => value + i).buffer;
const sha = value => createHash('sha256').update(new Uint8Array(value)).digest('hex');
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-shadow-gate-'));
  let now = START;
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((done, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', done);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  async function login(name, trialEndsAt = END) {
    const author = context.auth.createAuthor({authorName: name, trialEndsAt});
    const invitation = context.auth.issueInvite(author.id);
    const response = await fetch(baseURL + '/trial/login', {method: 'POST',
      headers: {'X-Suite-Trial': '1', 'Content-Type': 'application/json'},
      body: JSON.stringify({inviteToken: invitation.inviteToken})});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^suite_trial=/);
    let interceptor;
    const client = new TrialClient({baseURL, fetcher: (url, init) => {
      const request = {...init, headers: {...init.headers, Cookie: cookie}};
      return interceptor ? interceptor(url, request, () => fetch(url, request)) :
        fetch(url, request);
    }});
    return {author, client, intercept(fn) {interceptor = fn;}};
  }
  async function create(client, name, original) {
    const asset = await client.createAsset({name: `${name}.dng`, sha256: sha(original),
      size: original.byteLength});
    await client.putOriginal(asset.id, original);
    return asset;
  }
  return {context, login, create, advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-shadow-gate-'))
        throw Error('SHADOW_GATE_FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}
async function pair(f, client) {
  const source = await f.create(client, 'source', bytes(12));
  const backdrop = await f.create(client, 'backdrop', bytes(82));
  const saved = await client.saveRecipe(source.id, 0, recipe());
  assert.equal(saved.revision, 1);
  const binding = {assetID: source.id, originalSHA256: source.sha256,
    savedRevision: 1, sourceWidth: 4, sourceHeight: 4,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256};
  return {source, backdrop, binding,
    options: {api: client, binding, selectedBackdropID: backdrop.id, target: 'source'}};
}

test('SHADOW-BACKDROP-HTTP01: real Trial pair reaches only real Worker decode; synthetic non-RAW never yields authorized RGBA/evidence', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const p = await pair(f, client);
    let originalReads = 0, authorizations = 0;
    const sourceOriginal = client.getOriginal.bind(client);
    const sourcePermission = client.assertPermission.bind(client);
    client.getOriginal = (...args) => {originalReads++; return sourceOriginal(...args);};
    client.assertPermission = (...args) => {authorizations++; return sourcePermission(...args);};
    await assert.rejects(readTrialAddShadowBackdrop(p.options),
      /BROWSER_WORKER_UNAVAILABLE/);
    assert.equal(originalReads, 2);
    assert.equal(authorizations, 2);
  } finally {await f.cleanup();}
});

test('SHADOW-BACKDROP-HTTP02: claims, arbitrary API/decoder/pixels/digest, cross-owner Asset and altered SHA reject before decode', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const p = await pair(f, owner.client);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      selectedBackdropID: randomUUID()}), /INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      selectionEvidence: {pixelsSHA256: 'a'.repeat(64)}}), /INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      decode: () => ({width: 4, height: 4, data: new Uint8ClampedArray(64)})}),
    /INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      api: {getSession: () => owner.client.getSession()}}), /INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      api: other.client}), /ASSET_UNAVAILABLE/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      binding: {...p.binding, backdropSHA256: 'f'.repeat(64)}}),
    /ORIGINAL_CHANGED/);
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      binding: {...p.binding, sourceWidth: 9_000_000}}), /INPUT_INVALID/);
  } finally {await f.cleanup();}
});

test('SHADOW-BACKDROP-HTTP03: saved revision, changed Original response and revoked session cannot produce frame', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const p = await pair(f, owner.client);
    await owner.client.saveRecipe(p.source.id, 1, recipe());
    await assert.rejects(readTrialAddShadowBackdrop(p.options), /REVISION_CONFLICT/);
    const next = await pair(f, owner.client);
    owner.intercept((url, request, proceed) => {
      if (url.includes(`/v1/assets/${next.backdrop.id}/original?`))
        return new Response(bytes(91), {status: 200});
      return proceed();
    });
    await assert.rejects(readTrialAddShadowBackdrop(next.options), /ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(readTrialAddShadowBackdrop(next.options), /TRIAL_REVOKED/);
  } finally {await f.cleanup();}
});

test('SHADOW-BACKDROP-HTTP04: expired session and abort while fetching the backdrop Original fail closed', async () => {
  const f = await fixture();
  try {
    const expiring = await f.login('Expiring', '2026-10-04T08:00:00.000Z');
    const first = await pair(f, expiring.client);
    f.advance(86400000);
    await assert.rejects(readTrialAddShadowBackdrop(first.options), /TRIAL_EXPIRED/);
    const cancellable = await f.login('Cancellable');
    const p = await pair(f, cancellable.client);
    const controller = new AbortController();
    let reached = false;
    cancellable.intercept((url, request, proceed) => {
      if (url.includes(`/v1/assets/${p.backdrop.id}/original?`)) {
        reached = true;
        queueMicrotask(() => controller.abort());
        return new Promise((_, reject) => request.signal.addEventListener('abort',
          () => reject(new DOMException('Aborted', 'AbortError')), {once: true}));
      }
      return proceed();
    });
    await assert.rejects(readTrialAddShadowBackdrop({...p.options,
      signal: controller.signal}), {name: 'AbortError'});
    assert.equal(reached, true);
  } finally {await f.cleanup();}
});
