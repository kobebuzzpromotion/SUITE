import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readTrialDngCaptureDateEvidence} from '../src/export-capture-date-gate.mjs';
import {recipe} from './fixtures.mjs';

// This is a synthetic TIFF with DNG-signalling IFD0 tags, not a real DNG/RAW
// corpus and not proof that any pixel decoder could open these bytes.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const sha = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
function syntheticDng({date = '2024:02:29 23:59:58', dngVersion = true,
  offset = '+09:00'} = {}) {
  const bytes = new Uint8Array(384), view = new DataView(bytes.buffer);
  bytes[0] = bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 4, true);
  function entry(at, tag, type, count, value) {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  }
  entry(10, 0x0112, 3, 1, 1);
  entry(22, 0x8769, 4, 1, 120);
  entry(34, dngVersion ? 0xc612 : 0xc611, 1, 4, 0);
  bytes.set([1, 4, 0, 0], 42);
  entry(46, 0xc614, 2, 12, 300);
  view.setUint16(120, offset === null ? 1 : 2, true);
  entry(122, 0x9003, 2, 20, 200);
  if (offset !== null) entry(134, 0x9011, 2, 7, 240);
  bytes.set(new TextEncoder().encode(`${date}\0`), 200);
  if (offset !== null) bytes.set(new TextEncoder().encode(`${offset}\0`), 240);
  bytes.set(new TextEncoder().encode('Test Camera\0'), 300);
  return bytes.buffer;
}
const claim = asset => ({assetID: asset.id, originalSHA256: asset.sha256,
  savedRevision: 1});

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-dng-gate-'));
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
  async function create(client, name, original = syntheticDng()) {
    const asset = await client.createAsset({name: `${name}.dng`, sha256: sha(original),
      size: original.byteLength});
    await client.putOriginal(asset.id, original);
    const saved = await client.saveRecipe(asset.id, 0, recipe());
    assert.equal(saved.revision, 1);
    return {asset, original};
  }
  return {context, login, create, advance(milliseconds) {now += milliseconds;},
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-dng-gate-'))
        throw Error('DNG_GATE_FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}

test('DNG-GATE-HTTP01 / REAL_TRIAL_SQLITE_SYNTHETIC_DNG: verified Original, saved revision and export permission bind only date evidence', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const {asset, original} = await f.create(client, 'owner');
    const before = await client.getRecipe(asset.id);
    const result = await readTrialDngCaptureDateEvidence({api: client, binding: claim(asset)});
    assert.deepEqual(result.binding, claim(asset));
    assert.equal(result.evidence.sourceAssetID, asset.id);
    assert.equal(result.evidence.sourceSHA256, sha(original));
    assert.equal(result.evidence.calendarDateOriginal, '20240229');
    assert.equal(result.evidence.offsetTimeOriginal, '+09:00');
    assert.equal(result.verification, 'TRIAL_FRESH_EXPORT_READ_ONLY_NOT_NAMING_AUTHORITY');
    assert.equal(Object.hasOwn(result, 'captureDate'), false);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.evidence) &&
      Object.isFrozen(result.binding));
    assert.deepEqual(await client.getRecipe(asset.id), before);
    assert.equal(sha(await client.getOriginal(asset.id)), sha(original));
    const withoutOffset = await f.create(client, 'no-offset', syntheticDng({offset: null}));
    const offsetless = await readTrialDngCaptureDateEvidence({api: client,
      binding: claim(withoutOffset.asset)});
    assert.equal(offsetless.evidence.calendarDateOriginal, '20240229');
    assert.equal(offsetless.evidence.offsetTimeOriginal, null);
    assert.equal(offsetless.evidence.offsetEvidence, 'NOT_PRESENT');
    assert.equal(Object.hasOwn(offsetless, 'captureDate'), false);
  } finally {await f.cleanup();}
});

test('DNG-GATE-HTTP02: non-Trial adapter and caller-provided permission claims cannot authorize the read', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const {asset} = await f.create(client, 'owner');
    const input = {api: client, binding: claim(asset)};
    await assert.rejects(readTrialDngCaptureDateEvidence({...input,
      permissionEvidence: {authorized: true}}), /CAPTURE_DATE_GATE_INPUT_INVALID/);
    await assert.rejects(readTrialDngCaptureDateEvidence({...input,
      binding: {...claim(asset), allowed: true}}), /CAPTURE_DATE_GATE_INPUT_INVALID/);
    await assert.rejects(readTrialDngCaptureDateEvidence({...input,
      api: {getSession: async () => ({principal: {id: randomUUID()}}),
        listAssets: async () => [asset], getRecipe: async () => ({revision: 1, body: recipe()}),
        assertPermission: async () => ({authorized: true}),
        getOriginal: async () => syntheticDng()}}), /CAPTURE_DATE_GATE_INPUT_INVALID/);
  } finally {await f.cleanup();}
});

test('DNG-GATE-HTTP03 / REAL_TRIAL_SQLITE: other owner, other Asset/SHA and stale saved revision reject', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const {asset} = await f.create(owner.client, 'owner');
    await assert.rejects(readTrialDngCaptureDateEvidence({api: other.client,
      binding: claim(asset)}), /CAPTURE_DATE_GATE_ASSET_UNAVAILABLE/);
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: {...claim(asset), assetID: randomUUID()}}),
    /CAPTURE_DATE_GATE_ASSET_UNAVAILABLE/);
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: {...claim(asset), originalSHA256: 'f'.repeat(64)}}),
    /CAPTURE_DATE_GATE_ORIGINAL_CHANGED/);
    await owner.client.saveRecipe(asset.id, 1, recipe());
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: claim(asset)}), /CAPTURE_DATE_GATE_REVISION_CONFLICT/);
  } finally {await f.cleanup();}
});

test('DNG-GATE-HTTP04 / REAL_TRIAL_SQLITE: altered GET bytes, fake DNG signal and mid-read CAS refuse evidence', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const {asset, original} = await f.create(owner.client, 'owner');
    let exportCalls = 0;
    owner.intercept((url, request, proceed) => {
      if (url.includes('/original?')) {
        const changed = original.slice(0);
        new Uint8Array(changed)[200] = '1'.charCodeAt(0);
        return new Response(changed, {status: 200});
      }
      if (url.endsWith('/trial/authorize')) exportCalls++;
      return proceed();
    });
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: claim(asset)}), /EXIF_CAPTURE_ORIGINAL_SHA_MISMATCH/);
    assert.equal(exportCalls, 1);
    owner.intercept(undefined);
    const fake = await f.create(owner.client, 'fake', syntheticDng({dngVersion: false}));
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: claim(fake.asset)}), /EXIF_CAPTURE_DNG_VERSION_INVALID/);
    let recipeReads = 0;
    owner.intercept(async (url, request, proceed) => {
      if (request.method === 'GET' && url.endsWith(`/v1/assets/${asset.id}/recipe`) &&
          ++recipeReads === 2)
        await owner.client.saveRecipe(asset.id, 1, recipe());
      return proceed();
    });
    await assert.rejects(readTrialDngCaptureDateEvidence({api: owner.client,
      binding: claim(asset)}), /CAPTURE_DATE_GATE_REVISION_CONFLICT/);
    assert.equal(recipeReads, 2);
  } finally {await f.cleanup();}
});

test('DNG-GATE-HTTP05 / REAL_TRIAL_SQLITE: expired and revoked Trial sessions fail without naming evidence', async () => {
  const f = await fixture();
  try {
    const expiring = await f.login('Expiring', '2026-10-04T08:00:00.000Z');
    const first = await f.create(expiring.client, 'expiring');
    f.advance(86400000);
    await assert.rejects(readTrialDngCaptureDateEvidence({api: expiring.client,
      binding: claim(first.asset)}), /TRIAL_EXPIRED/);
    const revoked = await f.login('Revoked');
    const second = await f.create(revoked.client, 'revoked');
    f.context.auth.revokeAuthor(revoked.author.id);
    await assert.rejects(readTrialDngCaptureDateEvidence({api: revoked.client,
      binding: claim(second.asset)}), /TRIAL_REVOKED/);
  } finally {await f.cleanup();}
});

test('DNG-GATE-HTTP06 / REAL_TRIAL_SQLITE: final revocation and abort during Original GET reject', async () => {
  const f = await fixture();
  try {
    const revocable = await f.login('Revocable');
    const first = await f.create(revocable.client, 'revocable');
    let authorizationCalls = 0;
    revocable.intercept((url, request, proceed) => {
      if (url.endsWith('/trial/authorize') && ++authorizationCalls === 2)
        f.context.auth.revokeAuthor(revocable.author.id);
      return proceed();
    });
    await assert.rejects(readTrialDngCaptureDateEvidence({api: revocable.client,
      binding: claim(first.asset)}), /TRIAL_REVOKED/);
    assert.equal(authorizationCalls, 2);
    const cancellable = await f.login('Cancellable');
    const second = await f.create(cancellable.client, 'cancellable');
    const controller = new AbortController();
    let originalReached = false, finalAuthorizationReached = false;
    cancellable.intercept((url, request, proceed) => {
      if (url.includes('/original?')) {
        originalReached = true;
        queueMicrotask(() => controller.abort());
        return new Promise((_, reject) => request.signal.addEventListener('abort',
          () => reject(new DOMException('Aborted', 'AbortError')), {once: true}));
      }
      if (url.endsWith('/trial/authorize') && originalReached)
        finalAuthorizationReached = true;
      return proceed();
    });
    await assert.rejects(readTrialDngCaptureDateEvidence({api: cancellable.client,
      binding: claim(second.asset), signal: controller.signal}), {name: 'AbortError'});
    assert.equal(originalReached, true);
    assert.equal(finalAuthorizationReached, false);
  } finally {await f.cleanup();}
});
