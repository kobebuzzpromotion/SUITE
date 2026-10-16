import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readBWEdgeManualRuntime} from '../src/bw-edge-manual-session-gate.mjs';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';
import {recipe} from './fixtures.mjs';

// Real loopback Trial HTTP/SQLite; all Originals are synthetic text, not RAW.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const add = () => ({operation: 'ADD', path: [{u: .5, v: .5}],
  radiusFraction: .04, hardness: .7});
const doc = asset => ({schemaVersion: 1, engineVersion: BW_EDGE_REMOVAL_VERSION,
  binding: {assetID: asset.id, originalSHA256: asset.sha256,
    sourceWidth: 40, sourceHeight: 20}, subjectStrokes: [add()],
  correctionStrokes: [add()]});
const options = (api, document, revision = 1, action = 'edit') => ({api, document,
  draftBaseRevision: revision, confirmedSelections: {subject: true, correction: true}, action});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-bw-gate-'));
  let now = START;
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((resolveListen, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', resolveListen);
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
    let interceptor;
    const client = new TrialClient({baseURL, fetcher: (url, init) => {
      const request = {...init, headers: {...init.headers, Cookie: cookie}};
      return interceptor ? interceptor(url, request, () => fetch(url, request)) : fetch(url, request);
    }});
    return {author, client, intercept(fn) {interceptor = fn;}};
  }
  async function create(client, label) {
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_BW_EDGE_${label}`);
    const sha256 = hash(bytes);
    const asset = await client.createAsset({name: `${label}.nonraw`, sha256, size: bytes.length});
    await client.putOriginal(asset.id, bytes.buffer.slice(bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength));
    const saved = await client.saveRecipe(asset.id, 0, recipe());
    return {...asset, revision: saved.revision, bytes};
  }
  return {context, login, create, advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-bw-gate-'))
        throw Error('FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}

test('BW-GATE-HTTP01 / TRIAL_SQLITE_NON_RAW: edit/export proof derives from fresh server permission and verified Original', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const asset = await f.create(client, 'owner');
    const document = doc(asset), beforeRecipe = await client.getRecipe(asset.id);
    const edited = await readBWEdgeManualRuntime(options(client, document));
    const exported = await readBWEdgeManualRuntime(options(client, document, 1, 'export'));
    assert.equal(edited.runtime.permissionEvidence.allowed, true);
    assert.equal(edited.runtime.permissionEvidence.action, 'edit');
    assert.equal(exported.runtime.permissionEvidence.action, 'export');
    assert.equal(edited.runtime.savedRevision, 1);
    assert.deepEqual(edited.document, document);
    assert.ok(Object.isFrozen(edited.runtime.permissionEvidence));
    assert.deepEqual(await client.getRecipe(asset.id), beforeRecipe);
    assert.equal(hash(Buffer.from(await client.getOriginal(asset.id))), asset.sha256);
  } finally {await f.cleanup();}
});

test('BW-GATE-HTTP02: UI allowed flag, forged adapter and unconfirmed selection cannot supply authority', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const asset = await f.create(client, 'input');
    const input = options(client, doc(asset));
    await assert.rejects(readBWEdgeManualRuntime({...input, allowed: true}), /BW_EDGE_GATE_INPUT_INVALID/);
    await assert.rejects(readBWEdgeManualRuntime({...input, permissionEvidence: {allowed: true}}),
      /BW_EDGE_GATE_INPUT_INVALID/);
    await assert.rejects(readBWEdgeManualRuntime({...input, api: {
      listAssets: async () => [asset], getRecipe: async () => ({revision: 1, body: recipe()}),
      assertPermission: async () => ({authorized: true})}}), /BW_EDGE_GATE_INPUT_INVALID/);
    await assert.rejects(readBWEdgeManualRuntime({...input,
      confirmedSelections: {subject: true, correction: false}}), /BW_EDGE_GATE_INPUT_INVALID/);
    assert.equal((await client.getRecipe(asset.id)).revision, 1);
  } finally {await f.cleanup();}
});

test('BW-GATE-HTTP03 / TRIAL_SQLITE: other owner, changed Asset binding and stale saved revision refuse before Worker', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const asset = await f.create(owner.client, 'owner');
    const original = doc(asset);
    await assert.rejects(readBWEdgeManualRuntime(options(other.client, original)),
      /BW_EDGE_GATE_ASSET_UNAVAILABLE/);
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, {...original,
      binding: {...original.binding, assetID: crypto.randomUUID()}})),
    /BW_EDGE_GATE_ASSET_UNAVAILABLE/);
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, {...original,
      binding: {...original.binding, originalSHA256: 'f'.repeat(64)}})),
    /BW_EDGE_GATE_ORIGINAL_CHANGED/);
    await owner.client.saveRecipe(asset.id, 1, recipe());
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, original, 1)),
      /BW_EDGE_GATE_REVISION_CONFLICT/);
    assert.equal((await owner.client.getRecipe(asset.id)).revision, 2);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(asset.id))), asset.sha256);
  } finally {await f.cleanup();}
});

test('BW-GATE-HTTP04 / TRIAL_SQLITE: corrupt GET bytes and in-flight CAS race fail before permission evidence', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const asset = await f.create(owner.client, 'race');
    const document = doc(asset);
    let authorizations = 0;
    owner.intercept(async (url, request, proceed) => {
      if (url.includes('/original?')) return new Response(Buffer.alloc(asset.bytes.length, 88),
        {status: 200, headers: {'Content-Type': 'application/octet-stream'}});
      if (url.endsWith('/trial/authorize')) authorizations++;
      return proceed();
    });
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, document)),
      /BW_EDGE_GATE_ORIGINAL_CHANGED/);
    assert.equal(authorizations, 0);
    owner.intercept(undefined);
    let reads = 0;
    owner.intercept(async (url, request, proceed) => {
      if (request.method === 'GET' && url.endsWith(`/v1/assets/${asset.id}/recipe`) && ++reads === 2)
        await owner.client.saveRecipe(asset.id, 1, recipe());
      return proceed();
    });
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, document)),
      /BW_EDGE_GATE_REVISION_CONFLICT/);
    assert.equal(reads, 2);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(asset.id))), asset.sha256);
  } finally {await f.cleanup();}
});

test('BW-GATE-HTTP05 / TRIAL_SQLITE: expired/revoked/aborted authority never reaches Worker', async () => {
  const f = await fixture();
  try {
    const expiring = await f.login('Expiring', '2026-10-04T08:00:00.000Z');
    const expiringAsset = await f.create(expiring.client, 'expiring');
    f.advance(86400000);
    await assert.rejects(readBWEdgeManualRuntime(options(expiring.client, doc(expiringAsset))),
      /TRIAL_EXPIRED/);
    const owner = await f.login('Revocable');
    const asset = await f.create(owner.client, 'revoke');
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(readBWEdgeManualRuntime(options(owner.client, doc(asset))),
      /TRIAL_REVOKED/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(readBWEdgeManualRuntime({...options(owner.client, doc(asset)),
      signal: controller.signal}), {name: 'AbortError'});
    assert.equal((await f.context.repo.latestRecipe('trial-' + owner.author.id, asset.id)).revision, 1);
  } finally {await f.cleanup();}
});

test('BW-GATE-HTTP06 / TRIAL_SQLITE: revocation at final authorize and abort during Original GET reject', async () => {
  const f = await fixture();
  try {
    const revoked = await f.login('Midflight Revocation');
    const first = await f.create(revoked.client, 'midflight');
    let authorizationReached = false;
    revoked.intercept(async (url, request, proceed) => {
      if (url.endsWith('/trial/authorize')) {
        authorizationReached = true;
        f.context.auth.revokeAuthor(revoked.author.id);
      }
      return proceed();
    });
    await assert.rejects(readBWEdgeManualRuntime(options(revoked.client, doc(first))),
      /TRIAL_REVOKED/);
    assert.equal(authorizationReached, true);
    const cancellable = await f.login('Cancellable');
    const second = await f.create(cancellable.client, 'cancel');
    const controller = new AbortController();
    let originalReached = false, authorizeAfterAbort = false;
    cancellable.intercept((url, request, proceed) => {
      if (url.includes('/original?')) {
        originalReached = true;
        queueMicrotask(() => controller.abort());
        return new Promise((_, reject) => request.signal.addEventListener('abort',
          () => reject(new DOMException('Aborted', 'AbortError')), {once: true}));
      }
      if (url.endsWith('/trial/authorize')) authorizeAfterAbort = true;
      return proceed();
    });
    await assert.rejects(readBWEdgeManualRuntime({...options(cancellable.client, doc(second)),
      signal: controller.signal}), {name: 'AbortError'});
    assert.equal(originalReached, true);
    assert.equal(authorizeAfterAbort, false);
    assert.equal((await f.context.repo.latestRecipe('trial-' + cancellable.author.id, second.id)).revision, 1);
  } finally {await f.cleanup();}
});
