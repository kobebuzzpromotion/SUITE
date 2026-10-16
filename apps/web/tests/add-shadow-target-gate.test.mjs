import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {readTrialAddShadowTarget} from '../src/add-shadow-target-gate.mjs';
import {recipe} from './fixtures.mjs';

// Real loopback Trial HTTP/SQLite. The Original is synthetic non-RAW text.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-add-shadow-target-'));
  let now = START;
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((done, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', done);
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
    const bytes = Buffer.from(`SYNTHETIC_NON_RAW_ADD_SHADOW_TARGET_${label}`);
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
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-add-shadow-target-'))
        throw Error('FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}
const binding = (target, backdropID = crypto.randomUUID()) => ({
  assetID: target.id, originalSHA256: target.sha256, savedRevision: target.revision,
  sourceWidth: 40, sourceHeight: 20, backdropID,
  backdropSHA256: 'a'.repeat(64)});
const input = (api, target, action = 'edit') => ({api, binding: binding(target), action});

test('TARGET-HTTP01 / TRIAL_SQLITE_NON_RAW: edit and export verify fresh identity, saved Recipe and actual Original digest without mutation', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Target Owner');
    const target = await f.create(owner.client, 'owner');
    const before = await owner.client.getRecipe(target.id);
    for (const action of ['edit', 'export']) {
      const verified = await readTrialAddShadowTarget(input(owner.client, target, action));
      assert.equal(verified.action, action);
      assert.equal(verified.assetID, target.id);
      assert.equal(verified.originalSHA256, target.sha256);
      assert.equal(verified.savedRevision, 1);
      assert.equal(verified.originalByteLength, target.bytes.length);
      assert.equal(verified.principal.id, owner.author.id);
      assert.ok(Object.isFrozen(verified));
    }
    assert.deepEqual(await owner.client.getRecipe(target.id), before);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(target.id))), target.sha256);
  } finally {await f.cleanup();}
});

test('TARGET-HTTP02: forged UI authority, adapter, other owner and other Asset fail closed', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const target = await f.create(owner.client, 'target');
    const second = await f.create(owner.client, 'second');
    const request = input(owner.client, target);
    await assert.rejects(readTrialAddShadowTarget({...request, allowed: true}),
      /ADD_SHADOW_TARGET_INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowTarget({...request, permissionEvidence: {allowed: true}}),
      /ADD_SHADOW_TARGET_INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowTarget({...request, api: {
      getSession: async () => ({mode: 'INVITED_LOCAL_TRIAL'}),
      assertPermission: async () => ({authorized: true})}}), /ADD_SHADOW_TARGET_INPUT_INVALID/);
    await assert.rejects(readTrialAddShadowTarget(input(other.client, target)),
      /ADD_SHADOW_TARGET_ASSET_UNAVAILABLE/);
    await assert.rejects(readTrialAddShadowTarget({...request,
      binding: {...request.binding, assetID: second.id}}), /ADD_SHADOW_TARGET_ORIGINAL_CHANGED/);
    await assert.rejects(readTrialAddShadowTarget({...request,
      binding: {...request.binding, backdropID: target.id}}), /ADD_SHADOW_TARGET_INPUT_INVALID/);
  } finally {await f.cleanup();}
});

test('TARGET-HTTP03 / TRIAL_SQLITE: changed SHA, stale revision and changed Original response reject', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const target = await f.create(owner.client, 'stale');
    const request = input(owner.client, target);
    await assert.rejects(readTrialAddShadowTarget({...request,
      binding: {...request.binding, originalSHA256: 'f'.repeat(64)}}),
    /ADD_SHADOW_TARGET_ORIGINAL_CHANGED/);
    let authorizations = 0;
    owner.intercept((url, req, proceed) => {
      if (url.includes('/original?')) return new Response(Buffer.alloc(target.bytes.length, 88),
        {status: 200, headers: {'Content-Type': 'application/octet-stream'}});
      if (url.endsWith('/trial/authorize')) authorizations++;
      return proceed();
    });
    await assert.rejects(readTrialAddShadowTarget(request), /ADD_SHADOW_TARGET_ORIGINAL_CHANGED/);
    assert.equal(authorizations, 0);
    owner.intercept(undefined);
    await owner.client.saveRecipe(target.id, 1, recipe());
    await assert.rejects(readTrialAddShadowTarget(request), /ADD_SHADOW_TARGET_REVISION_CONFLICT/);
    assert.equal(hash(Buffer.from(await owner.client.getOriginal(target.id))), target.sha256);
  } finally {await f.cleanup();}
});

test('TARGET-HTTP04 / TRIAL_SQLITE: race at second Recipe read and revocation at final permission reject', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner');
    const target = await f.create(owner.client, 'race');
    const request = input(owner.client, target);
    let reads = 0;
    owner.intercept(async (url, req, proceed) => {
      if (req.method === 'GET' && url.endsWith(`/v1/assets/${target.id}/recipe`) && ++reads === 2)
        await owner.client.saveRecipe(target.id, 1, recipe());
      return proceed();
    });
    await assert.rejects(readTrialAddShadowTarget(request), /ADD_SHADOW_TARGET_REVISION_CONFLICT/);
    assert.equal(reads, 2);
    owner.intercept(undefined);
    const fresh = input(owner.client, {...target, revision: 2});
    let authorizationReached = false;
    owner.intercept((url, req, proceed) => {
      if (url.endsWith('/trial/authorize')) {
        authorizationReached = true;
        f.context.auth.revokeAuthor(owner.author.id);
      }
      return proceed();
    });
    await assert.rejects(readTrialAddShadowTarget(fresh), /TRIAL_REVOKED/);
    assert.equal(authorizationReached, true);
  } finally {await f.cleanup();}
});

test('TARGET-HTTP05 / TRIAL_SQLITE: expired session and abort never produce target evidence', async () => {
  const f = await fixture();
  try {
    const expiring = await f.login('Expiring', '2026-10-04T08:00:00.000Z');
    const target = await f.create(expiring.client, 'expiring');
    f.advance(86400000);
    await assert.rejects(readTrialAddShadowTarget(input(expiring.client, target)), /TRIAL_EXPIRED/);
    const owner = await f.login('Owner');
    const other = await f.create(owner.client, 'abort');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readTrialAddShadowTarget({...input(owner.client, other),
      signal: controller.signal}), {name: 'AbortError'});
    assert.equal((await owner.client.getRecipe(other.id)).revision, 1);
  } finally {await f.cleanup();}
});
