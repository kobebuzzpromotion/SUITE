import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {InviteAuth} from '../invite-auth.mjs';

// Real temporary SQLite and loopback HTTP. NON_RAW bytes only; not public-hosting certification.
const FUTURE_TRIAL_END = '2026-11-03T08:00:00.000Z'; // Explicit test fixture only, not a chosen business trial duration.
async function authFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'suite-trial-auth-')), file = join(directory, 'auth.sqlite');
  let now = Date.parse('2026-10-03T08:00:00.000Z'), auth = new InviteAuth(file, {clock: () => now, sessionTTL: 1000});
  return {directory, file, get auth() {return auth;}, advance(ms) {now += ms;},
    restart() {auth.close(); auth = new InviteAuth(file, {clock: () => now, sessionTTL: 1000});},
    async cleanup() {auth.close(); await rm(directory, {recursive: true, force: true});}};
}
function login(auth, principal) {return auth.redeem(auth.issueInvite(principal.id).inviteToken);}
function unresolved(auth, token) {try {assert.equal(auth.resolveSession(token), null);} catch (error) {if (error?.code === 'ERR_ASSERTION') throw error;}}

test('TRIAL-AUTH01 / SQLITE: invitation is single use across connections and sessions expose no secret principal fields', async () => {
  const f = await authFixture(); let other; try {
    const author = f.auth.createAuthor({authorName: 'Author A', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id);
    assert.ok(invite.inviteToken.length >= 32); other = new InviteAuth(f.file);
    const signed = f.auth.redeem(invite.inviteToken); assert.ok(signed.sessionToken.length >= 32);
    assert.notEqual(signed.sessionToken, invite.inviteToken); assert.equal(signed.principal.id, author.id);
    assert.throws(() => other.redeem(invite.inviteToken));
    assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
    assert.equal(JSON.stringify(signed.principal).includes(invite.inviteToken), false);
    assert.equal(JSON.stringify(signed.principal).includes(signed.sessionToken), false);
  } finally {other?.close(); await f.cleanup();}
});

test('TRIAL-AUTH02 / SQLITE_CLOCK: invitation and session expire at their fixed boundaries', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Expiry', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id, {ttlMs: 1000});
    f.advance(1000); assert.throws(() => f.auth.redeem(invite.inviteToken));
    const signed = login(f.auth, author); f.advance(999); assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
    f.advance(1); unresolved(f.auth, signed.sessionToken);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH03 / SQLITE: author revocation invalidates every current session and outstanding invite', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Revoked', trialEndsAt: FUTURE_TRIAL_END}), first = login(f.auth, author), second = login(f.auth, author);
    const unused = f.auth.issueInvite(author.id); f.auth.revokeAuthor(author.id);
    unresolved(f.auth, first.sessionToken); unresolved(f.auth, second.sessionToken);
    assert.throws(() => f.auth.redeem(unused.inviteToken)); assert.throws(() => f.auth.issueInvite(author.id));
    f.restart(); unresolved(f.auth, first.sessionToken); assert.throws(() => f.auth.redeem(unused.inviteToken));
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH04 / SQLITE: logout invalidates only the selected session and persists after reopen', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Sessions', trialEndsAt: FUTURE_TRIAL_END}), first = login(f.auth, author), second = login(f.auth, author);
    f.auth.logout(first.sessionToken); unresolved(f.auth, first.sessionToken);
    assert.equal(f.auth.resolveSession(second.sessionToken).id, author.id); f.restart();
    unresolved(f.auth, first.sessionToken); assert.equal(f.auth.resolveSession(second.sessionToken).id, author.id);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH05 / SQLITE: restart retains consumed invite and session without persisting plaintext secrets', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Persistent', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id), signed = f.auth.redeem(invite.inviteToken);
    f.restart(); assert.throws(() => f.auth.redeem(invite.inviteToken)); assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
    for (const name of await readdir(f.directory)) {
      const bytes = await readFile(join(f.directory, name));
      assert.equal(bytes.includes(Buffer.from(invite.inviteToken)), false, 'plaintext invite must not be stored');
      assert.equal(bytes.includes(Buffer.from(signed.sessionToken)), false, 'plaintext session must not be stored');
    }
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH06 / SQLITE: forged credentials and unauthorized role input cannot establish a session', async () => {
  const f = await authFixture(); try {
    assert.throws(() => f.auth.createAuthor({authorName: 'Invalid', role: 'superuser'}));
    assert.throws(() => f.auth.issueInvite('00000000-0000-4000-8000-000000000000'));
    for (const token of ['', 'forged', 'a'.repeat(64)]) {assert.throws(() => f.auth.redeem(token)); unresolved(f.auth, token);}
    const author = f.auth.createAuthor({authorName: 'Valid', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id);
    assert.throws(() => f.auth.redeem(invite.inviteToken + 'x'));
    assert.equal(f.auth.redeem(invite.inviteToken).principal.id, author.id);
  } finally {await f.cleanup();}
});

async function httpFixture() {
  const {createTrialServer} = await import('../trial-server.mjs');
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-trial-http-')); let context, port, now = Date.parse('2026-10-03T08:00:00.000Z');
  async function start() {context = await createTrialServer({dataDir, port: 0, clock: () => now});
    await new Promise((resolve, reject) => {context.server.once('error', reject); context.server.listen(0, '127.0.0.1', resolve);}); port = context.server.address().port;}
  async function stop() {if (context?.server.listening) await new Promise((resolve, reject) => context.server.close(e => e ? reject(e) : resolve()));}
  function call(path, {method = 'GET', body, cookie = '', headers = {}} = {}) {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {const req = request({host: '127.0.0.1', port, path, method, headers: {
      Connection: 'close', 'X-Suite-Trial': '1', Cookie: cookie,
      ...(payload ? {'Content-Length': payload.length, 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json'} : {}), ...headers
    }}, res => {const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {const data = Buffer.concat(chunks); let json;
      try {json = JSON.parse(data.toString());} catch {} resolve({status: res.statusCode, headers: res.headers, data, json});}); res.on('error', reject);}); req.on('error', reject); req.end(payload);});
  }
  await start();
  return {call, get auth() {return context.auth;}, get context() {return context;}, advance(ms) {now += ms;},
    async login(name = 'Author A') {const author = context.auth.createAuthor({authorName: name, trialEndsAt: FUTURE_TRIAL_END}), invite = context.auth.issueInvite(author.id);
      const response = await call('/trial/login', {method: 'POST', body: {inviteToken: invite.inviteToken}});
      assert.equal(response.status, 200); return {author, invite, response, cookie: response.headers['set-cookie'][0].split(';')[0]};},
    async restart() {await stop(); await start();}, async cleanup() {await stop(); await rm(dataDir, {recursive: true, force: true});}};
}

test('TRIAL-AUTH07 / HTTP: login uses protected HttpOnly cookie and never accepts loopback QA fallback', async () => {
  const f = await httpFixture(); try {
    assert.equal((await f.call('/trial/session')).status, 200);
    assert.equal((await f.call('/v1/assets')).status, 401);
    assert.equal((await f.call('/v1/assets', {headers: {'X-Suite-QA': '1', Cookie: 'suite_qa=forged'}})).status, 401);
    const signed = await f.login(), cookieHeader = signed.response.headers['set-cookie'].join(';');
    assert.match(cookieHeader, /HttpOnly/i); assert.match(cookieHeader, /SameSite=(Strict|Lax)/i);
    assert.equal(signed.response.data.includes(Buffer.from(signed.invite.inviteToken)), false);
    assert.equal(signed.response.data.includes(Buffer.from(signed.cookie.split('=')[1])), false);
    assert.equal((await f.call('/v1/assets', {cookie: signed.cookie})).status, 200);
    assert.notEqual((await f.call('/v1/assets', {cookie: signed.cookie, headers: {'X-Suite-Trial': '0'}})).status, 200);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH08 / HTTP: rejected cross-origin or forged-Host login does not consume invitation', async () => {
  const f = await httpFixture(); try {
    const author = f.auth.createAuthor({authorName: 'CSRF', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id), body = {inviteToken: invite.inviteToken};
    for (const headers of [{Origin: 'https://attacker.invalid'}, {Host: 'attacker.invalid'}, {'X-Suite-Trial': '0'}]) {
      const refused = await f.call('/trial/login', {method: 'POST', body, headers}); assert.ok(refused.status >= 400);
    }
    assert.equal((await f.call('/trial/login', {method: 'POST', body})).status, 200);
    assert.ok((await f.call('/trial/login', {method: 'POST', body})).status >= 400);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH09 / HTTP_NON_RAW: authors cannot enumerate read or mutate another author Original or recipe', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('A'), b = await f.login('B'), bytes = Buffer.from('NON_RAW trial author A Original'), sha256 = createHash('sha256').update(bytes).digest('hex');
    const created = await f.call('/v1/assets', {cookie: a.cookie, method: 'POST', body: {name: 'NON_RAW.bin', sha256, size: bytes.length}});
    assert.equal(created.status, 201); const id = created.json.id, base = `/v1/assets/${id}`;
    assert.equal((await f.call(base + '/original', {cookie: a.cookie, method: 'PUT', body: bytes})).status, 200);
    assert.deepEqual((await f.call('/v1/assets', {cookie: b.cookie})).json.assets, []);
    for (const [path, options] of [[base + '/original?purpose=high-precision', {}], [base + '/recipe', {}],
      [base + '/original', {method: 'PUT', body: bytes}], [base + '/recipe', {method: 'PUT', body: {expectedRevision: 0, recipe: {}}}]]) {
      const refused = await f.call(path, {cookie: b.cookie, ...options}); assert.ok([403, 404].includes(refused.status));
    }
    assert.deepEqual((await f.call(base + '/original?purpose=high-precision', {cookie: a.cookie})).data, bytes);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH10 / HTTP: session survives server restart but logout and author revocation do not resurrect', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('Persist'), b = await f.login('Revoke'); await f.restart();
    assert.equal((await f.call('/v1/assets', {cookie: a.cookie})).status, 200);
    assert.equal((await f.call('/trial/logout', {method: 'POST', cookie: a.cookie})).status, 200);
    f.auth.revokeAuthor(b.author.id); await f.restart();
    assert.equal((await f.call('/v1/assets', {cookie: a.cookie})).status, 401);
    const revoked = await f.call('/v1/assets', {cookie: b.cookie});
    assert.equal(revoked.status, 403); assert.equal(revoked.json.error, 'TRIAL_REVOKED');
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH11 / HTTP_CLOCK: expired session cannot use assets or author API', async () => {
  const f = await httpFixture(); try {
    const a = await f.login(); f.advance(8 * 86400000);
    assert.equal((await f.call('/v1/assets', {cookie: a.cookie})).status, 401);
    assert.equal((await f.call('/trial/drafts', {cookie: a.cookie})).status, 401);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH12 / SQLITE_THREADS: simultaneous invitation redemption yields exactly one committed session', async () => {
  const f = await authFixture(), workers = []; try {
    const author = f.auth.createAuthor({authorName: 'Race', trialEndsAt: FUTURE_TRIAL_END}), invite = f.auth.issueInvite(author.id), barrier = new SharedArrayBuffer(4);
    const source = `const {parentPort,workerData}=require('node:worker_threads');
      (async()=>{const {InviteAuth}=await import(workerData.moduleURL);const auth=new InviteAuth(workerData.file,{clock:()=>workerData.now});
        parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.barrier),0,0);
        try {const signed=auth.redeem(workerData.token);parentPort.postMessage({accepted:true,id:signed.principal.id});}
        catch(error){parentPort.postMessage({accepted:false,error:error.message});}finally{auth.close();}
      })().catch(error=>{throw error;});`;
    const runs = [0, 1].map(() => {
      const worker = new Worker(source, {eval: true, workerData: {moduleURL: new URL('../invite-auth.mjs', import.meta.url).href,
        file: f.file, token: invite.inviteToken, barrier, now: Date.parse('2026-10-03T08:00:00.000Z')}}); workers.push(worker);
      let readyResolve, resultResolve, readyReject, resultReject;
      const ready = new Promise((resolve, reject) => {readyResolve = resolve; readyReject = reject;});
      const result = new Promise((resolve, reject) => {resultResolve = resolve; resultReject = reject;});
      worker.on('message', message => message.ready ? readyResolve() : resultResolve(message));
      worker.on('error', error => {readyReject(error); resultReject(error);}); return {ready, result};
    });
    await Promise.all(runs.map(r => r.ready)); Atomics.store(new Int32Array(barrier), 0, 1); Atomics.notify(new Int32Array(barrier), 0, 2);
    const results = await Promise.all(runs.map(r => r.result));
    assert.equal(results.filter(r => r.accepted).length, 1); assert.equal(results.find(r => r.accepted).id, author.id);
    assert.throws(() => f.auth.redeem(invite.inviteToken));
  } finally {await Promise.all(workers.map(worker => worker.terminate())); await f.cleanup();}
});

test('TRIAL-AUTH13 / SQLITE_TRIAL_CLOCK: missing explicit trial deadline denies access until administrator sets a future end', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'No inferred unlimited trial'});
    assert.throws(() => login(f.auth, author));
    f.auth.setTrialEnd(author.id, FUTURE_TRIAL_END);
    const signed = login(f.auth, author); assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
    for (const invalid of [null, '', 'not-a-date', '2026-10-02T08:00:00.000Z']) assert.throws(() => f.auth.setTrialEnd(author.id, invalid));
    assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH14 / SQLITE_TRIAL_CLOCK: shortened trial deadline stops an already signed-in session before security TTL', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Trial boundary', trialEndsAt: FUTURE_TRIAL_END}), signed = login(f.auth, author);
    f.auth.setTrialEnd(author.id, '2026-10-03T08:00:00.500Z');
    f.advance(499); assert.equal(f.auth.resolveSession(signed.sessionToken).id, author.id);
    f.advance(1); unresolved(f.auth, signed.sessionToken);
    assert.equal(f.auth.db.prepare('SELECT count(*) n FROM trial_sessions').get().n, 1);
    f.restart(); unresolved(f.auth, signed.sessionToken);
    assert.equal(f.auth.db.prepare('SELECT count(*) n FROM trial_authors').get().n, 1);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH15 / HTTP_TRIAL_CLOCK_NON_RAW: live edit export submit authorization expires without deleting saved data', async () => {
  const f = await httpFixture(); try {
    const signed = await f.login('Live deadline'), bytes = Buffer.from('NON_RAW retained past trial end'), sha256 = createHash('sha256').update(bytes).digest('hex');
    const created = await f.call('/v1/assets', {method: 'POST', cookie: signed.cookie, body: {name: 'NON_RAW.bin', size: bytes.length, sha256}});
    assert.equal(created.status, 201); const asset = created.json;
    assert.equal((await f.call(`/v1/assets/${asset.id}/original`, {method: 'PUT', cookie: signed.cookie, body: bytes})).status, 200);
    const r = {schemaVersion: 1, parameters: {exposure: 1, contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
    assert.equal((await f.call(`/v1/assets/${asset.id}/recipe`, {method: 'PUT', cookie: signed.cookie, body: {expectedRevision: 0, recipe: r}})).status, 200);
    for (const action of ['edit', 'export', 'submit']) assert.equal((await f.call('/trial/authorize', {method: 'POST', cookie: signed.cookie, body: {assetID: asset.id, action}})).status, 200);
    f.auth.setTrialEnd(signed.author.id, '2026-10-03T08:00:00.500Z'); f.advance(500);
    for (const action of ['edit', 'export', 'submit']) assert.ok([401, 403].includes((await f.call('/trial/authorize', {method: 'POST', cookie: signed.cookie, body: {assetID: asset.id, action}})).status));
    assert.ok([401, 403].includes((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`, {cookie: signed.cookie})).status));
    const stored = f.context.repo.get(signed.author.tenantId, asset.id); assert.equal(stored.sha256, sha256);
    assert.deepEqual(f.context.repo.latestRecipe(signed.author.tenantId, asset.id).body, r);
    const inspected = await f.context.storage.inspect(stored.originalKey); assert.equal(inspected.persisted, true); assert.equal(inspected.sha256, sha256);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH16 / SQLITE_INVITATION_CLOCK: separate invitations for one author retain independent live deadlines and revocation', async () => {
  const f = await authFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Independent grants', trialEndsAt: FUTURE_TRIAL_END});
    const first = f.auth.issueInvite(author.id), second = f.auth.issueInvite(author.id);
    const a = f.auth.redeem(first.inviteToken), b = f.auth.redeem(second.inviteToken);
    assert.notEqual(first.invitationID, second.invitationID);
    f.auth.setInviteTrialEnd(first.invitationID, '2026-10-03T08:00:00.500Z');
    f.advance(500); assert.throws(() => f.auth.resolveSession(a.sessionToken), /TRIAL_EXPIRED/);
    assert.equal(f.auth.resolveSession(b.sessionToken).invitationID, second.invitationID);
    f.auth.revokeInvite(second.invitationID); assert.throws(() => f.auth.resolveSession(b.sessionToken), /TRIAL_REVOKED/);
    const metadata = JSON.stringify(f.auth.listInvitations());
    for (const secret of [first.inviteToken, second.inviteToken, a.sessionToken, b.sessionToken]) assert.equal(metadata.includes(secret), false);
    f.restart(); assert.throws(() => f.auth.resolveSession(a.sessionToken), /TRIAL_EXPIRED/);
    assert.throws(() => f.auth.resolveSession(b.sessionToken), /TRIAL_REVOKED/);
    assert.equal(f.auth.db.prepare('SELECT count(*) n FROM trial_sessions').get().n, 2);
    assert.equal(f.auth.db.prepare('SELECT count(*) n FROM trial_authors').get().n, 1);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTH17 / HTTP_TRIAL_LOGIN: ended or revoked invitation returns explicit trial refusal without consuming grant', async () => {
  const f = await httpFixture(); try {
    const author = f.auth.createAuthor({authorName: 'Login boundary', trialEndsAt: FUTURE_TRIAL_END});
    const expired = f.auth.issueInvite(author.id, {trialEndsAt: '2026-10-03T08:00:00.500Z'}), revoked = f.auth.issueInvite(author.id);
    f.auth.revokeInvite(revoked.invitationID); f.advance(500);
    for (const [invite, reason] of [[expired, 'TRIAL_EXPIRED'], [revoked, 'TRIAL_REVOKED']]) {
      const refused = await f.call('/trial/login', {method: 'POST', body: {inviteToken: invite.inviteToken}});
      assert.equal(refused.status, 403); assert.equal(refused.json.error, reason);
      assert.equal(f.auth.db.prepare('SELECT used_at FROM trial_invites WHERE id=?').get(invite.invitationID).used_at, null);
    }
    assert.equal(f.auth.db.prepare('SELECT count(*) n FROM trial_sessions').get().n, 0);
  } finally {await f.cleanup();}
});
