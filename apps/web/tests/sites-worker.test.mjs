import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {handleRequest} from '../../sites/src/worker.mjs';
import {recipe, portrait} from './fixtures.mjs';

// Actual Worker handler + actual temporary SQLite SQL. D1 interface/R2/dispatch identity/digest are TEST DOUBLES.
// No deployed Sites, actual D1/R2, RAW decoder, real camera image or platform-header-authentication proof.
const digest = bytes => createHash('sha256').update(bytes).digest('hex'), PART = 8 * 1024 * 1024;
class SQLiteD1 {
  constructor(file) {this.db = new DatabaseSync(file); this.db.exec('PRAGMA foreign_keys=ON'); this.failBatch = false;}
  prepare(sql) {
    const owner = this;
    function prepared(args = []) {return {sql, args, bind(...next) {return prepared(next);},
      async first() {return owner.db.prepare(sql).get(...args) ?? null;},
      async all() {return {success: true, results: owner.db.prepare(sql).all(...args)};},
      async run() {return owner.run(this);}};}
    return prepared();
  }
  run(statement) {const r = this.db.prepare(statement.sql).run(...statement.args); return {success: true, results: [], meta: {changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid)}};}
  async batch(statements) {this.db.exec('BEGIN IMMEDIATE'); try {const out = [];
    for (const s of statements) {out.push(this.run(s)); if (this.failBatch) {this.failBatch = false; throw Error('INJECTED_D1_BATCH_FAILURE');}}
    this.db.exec('COMMIT'); return out;
  } catch (error) {this.db.exec('ROLLBACK'); throw error;}}
  close() {this.db.close();}
}
async function readBytes(input) {return input instanceof ReadableStream ? new Uint8Array(await new Response(input).arrayBuffer()) : new Uint8Array(input instanceof ArrayBuffer ? input.slice(0) : input);}
class MockR2 {
  objects = new Map(); puts = 0; assemblies = 0;
  object(key, stored) {if (!stored) return null; const bytes = stored.bytes.slice(); return {key, size: bytes.length,
    body: new ReadableStream({start(controller) {controller.enqueue(bytes); controller.close();}}),
    async arrayBuffer() {return bytes.slice().buffer;}, customMetadata: stored.metadata, etag: digest(bytes)};}
  async get(key) {return this.object(key, this.objects.get(key));}
  async put(key, bytes, options = {}) {if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    this.puts++; this.objects.set(key, {bytes: await readBytes(bytes), metadata: structuredClone(options.customMetadata || {})}); return this.get(key);}
  async createMultipartUpload(key) {this.assemblies++; const parts = new Map(), bucket = this;
    return {async uploadPart(number, body) {const bytes = await readBytes(body); parts.set(number, bytes); return {partNumber: number, etag: digest(bytes)};},
      async complete(completed) {assert.equal(bucket.objects.has(key), false, 'unique assembly must never overwrite prior Original');
        const arrays = completed.map(p => parts.get(p.partNumber)), bytes = new Uint8Array(arrays.reduce((n, b) => n + b.length, 0)); let offset = 0;
        for (const part of arrays) {bytes.set(part, offset); offset += part.length;}
        bucket.objects.set(key, {bytes, metadata: {}}); return bucket.get(key);}};
  }
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'suite-sites-worker-')), file = join(directory, 'd1.sqlite'), bucket = new MockR2();
  let db = new SQLiteD1(file);
  for (const migration of ['0000_suite_sites.sql', '0001_suite_sites.sql', '0002_suite_sites.sql']) db.db.exec(await readFile(new URL('../../sites/drizzle/' + migration, import.meta.url), 'utf8'));
  const env = {DB: db, BUCKET: bucket, SUITE_TRUST_SITES_DISPATCH: '1', SUITE_ALLOWED_ORIGIN: 'https://suite.test', __testNow: Date.parse('2026-10-03T09:00:00Z'),
    SUITE_TRIAL_STORAGE_LIMIT_BYTES: '2147483648', SUITE_TRIAL_R2_WRITE_LIMIT_MONTH: '10000',
    SUITE_TRIAL_R2_READ_LIMIT_MONTH: '100000', SUITE_TRIAL_REQUEST_LIMIT_DAY: '10000',
    __testDigest: async object => {const bytes = new Uint8Array(await object.arrayBuffer()); return {sha256: digest(bytes), size: bytes.length};}};
  function member(name, role = 'author') {const id = randomUUID(), email = name.toLowerCase() + '@example.test', user = 'platform-' + id;
    db.db.prepare('INSERT INTO site_members(id,email,credit_name,role,active,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,1,?,?,?)')
      .run(id, email, name, role, env.__testNow + 10000, new Date(env.__testNow).toISOString(), Date.parse('2026-11-03T09:00:00Z')); return {id, email, user};}
  const a = member('A'), b = member('B'), admin = member('Admin', 'admin');
  const adminTestPassword='SYNTHETIC_TEST_PASSWORD_NOT_A_PRODUCTION_SECRET';
  env.SUITE_ADMIN_USER_ID=admin.user;env.SUITE_ADMIN_PASSWORD=adminTestPassword;
  env.SUITE_ADMIN_SESSION_SECRET='SYNTHETIC_TEST_SESSION_SECRET_WITH_MORE_THAN_32_CHARACTERS';
  let adminCookie=null;
  async function call(path, {actor = a, method = 'GET', body, headers = {}} = {}) {
    const binary = body instanceof Uint8Array || body instanceof ArrayBuffer;
    const request = new Request('https://suite.test' + path, {method, headers: {'X-Suite-Trial': '1',
      ...(actor ? {'oai-authenticated-user-id': actor.user, 'oai-authenticated-user-email': actor.email} : {}),
      ...(!['GET', 'HEAD'].includes(method) ? {Origin: 'https://suite.test'} : {}),
      ...(body === undefined ? {} : {'Content-Type': binary ? 'application/octet-stream' : 'application/json'}),
      ...(actor===admin&&adminCookie?{Cookie:adminCookie}:{}), ...headers},
      ...(body === undefined ? {} : {body: binary ? body : JSON.stringify(body)})});
    const response = await handleRequest(request, env), data = new Uint8Array(await response.arrayBuffer()); let json;
    try {json = JSON.parse(new TextDecoder().decode(data));} catch {} return {status: response.status, data, json, headers:response.headers};
  }
  async function loginAdmin(){const result=await call('/trial/admin/login',{actor:admin,method:'POST',body:{password:adminTestPassword}});
    assert.equal(result.status,200);adminCookie=result.headers.get('set-cookie')?.split(';')[0];assert.ok(adminCookie);return adminCookie;}
  async function create(bytes = new TextEncoder().encode('NON_RAW worker fixture'), options = {}) {
    const r = await call('/v1/assets', {method: 'POST', actor: options.actor || a, body: {name: 'NON_RAW.bin', size: bytes.length, sha256: options.sha256 || digest(bytes)}});
    assert.equal(r.status, 201); return {asset: r.json, bytes};
  }
  async function begin(asset, actor = a) {const r = await call(`/v1/assets/${asset.id}/uploads`, {method: 'POST', actor}); assert.equal(r.status, 200); return r.json;}
  async function put(upload, number, bytes, options = {}) {return call(`/v1/uploads/${upload.id}/parts/${number}`, {method: 'PUT', body: bytes, headers: {'X-Suite-Part-SHA256': digest(bytes)}, ...options});}
  async function complete(upload, actor = a) {return call(`/v1/uploads/${upload.id}/complete`, {method: 'POST', actor});}
  async function ready() {const value = await create(), u = await begin(value.asset); assert.equal((await put(u, 1, value.bytes)).status, 200); assert.equal((await complete(u)).status, 200); return {...value, upload: u};}
  return {env, a, b, admin, bucket, call, loginAdmin, create, begin, put, complete, ready, get db() {return db;},
    restart() {db.close(); db = new SQLiteD1(file); env.DB = db;},
    async cleanup() {db.close(); await rm(directory, {recursive: true, force: true});}};
}

test('SW01 / SQLITE_MOCK_R2: dispatch configuration invitation and Origin gates refuse before private operations', async () => {
  const f = await fixture(); try {
    delete f.env.SUITE_TRUST_SITES_DISPATCH; assert.equal((await f.call('/trial/session')).status, 503); f.env.SUITE_TRUST_SITES_DISPATCH = '1';
    assert.equal((await f.call('/trial/session', {actor: null})).json.principal, null);
    assert.equal((await f.call('/v1/assets', {actor: null})).status, 401);
    const uninvited=await f.call('/trial/session', {actor: {user: 'other', email: 'uninvited@example.test'}});
    assert.equal(uninvited.status,200);assert.equal(uninvited.json.principal,null);assert.equal(uninvited.json.endedReason,'INVITATION_REQUIRED');
    assert.equal((await f.call('/v1/assets', {actor: {user: 'other', email: 'uninvited@example.test'}})).status,403);
    assert.equal((await f.call('/v1/assets', {headers: {'X-Suite-Trial': '0'}})).status, 403);
    const body = {name: 'NON_RAW.bin', size: 1, sha256: 'a'.repeat(64)};
    assert.equal((await f.call('/v1/assets', {method: 'POST', body, headers: {Origin: 'https://attacker.test'}})).status, 403);
    assert.equal((await f.call('/v1/assets', {method: 'POST', body, headers: {Origin: ''}})).status, 403);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 0);
  } finally {await f.cleanup();}
});

test('SW02 / SQLITE_MOCK_R2: expired invitation cannot bind and bound email cannot switch platform user or elevate role', async () => {
  const f = await fixture(); try {
    f.db.db.prepare('UPDATE site_members SET invite_expires=? WHERE id=?').run(f.env.__testNow, f.b.id);
    const expiredInvite=await f.call('/trial/session', {actor: f.b});assert.equal(expiredInvite.json.principal,null);assert.equal(expiredInvite.json.endedReason,'INVITATION_REQUIRED');
    assert.equal((await f.call('/trial/session')).json.principal.id, f.a.id);
    const wrongSubject=await f.call('/trial/session', {actor: {...f.a, user: 'forged-other-user'}});assert.equal(wrongSubject.json.principal,null);assert.equal(wrongSubject.json.endedReason,'INVITATION_REQUIRED');
    assert.equal((await f.call('/trial/submissions', {headers: {'oai-authenticated-user-role': 'admin'}})).status, 403);
    f.db.db.prepare('UPDATE site_members SET active=0 WHERE id=?').run(f.a.id); f.restart();
    assert.equal((await f.call('/v1/assets')).status, 403);
  } finally {await f.cleanup();}
});

test('SW03 / SQLITE_MOCK_R2: another invited author cannot access asset recipe upload or part routes', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), u = await f.begin(asset);
    assert.deepEqual((await f.call('/v1/assets', {actor: f.b})).json.assets, []);
    for (const suffix of ['/recipe', '/original?purpose=high-precision', '/uploads']) assert.equal((await f.call(`/v1/assets/${asset.id}` + suffix, {actor: f.b})).status, 404);
    assert.equal((await f.put(u, 1, bytes, {actor: f.b})).status, 404);
    assert.equal((await f.complete(u, f.b)).status, 404); assert.equal(f.bucket.objects.size, 0);
  } finally {await f.cleanup();}
});

test('SW04 / SQLITE_MOCK_R2: wrong part checksum size and number reject without adding durable part rows', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), u = await f.begin(asset);
    assert.equal((await f.put(u, 1, bytes, {headers: {'X-Suite-Part-SHA256': 'a'.repeat(64)}})).status, 400);
    assert.equal((await f.put(u, 1, bytes.slice(1))).status, 400); assert.equal((await f.put(u, 2, bytes)).status, 400);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_parts').get().n, 0); assert.equal(f.bucket.objects.size, 0);
    assert.equal((await f.complete(u)).status, 400);
  } finally {await f.cleanup();}
});

test('SW05 / SQLITE_MOCK_R2_NON_RAW: healthy parts skip and damaged part repairs to a new key without overwriting old bytes', async () => {
  const f = await fixture(); try {
    const bytes = new Uint8Array(PART + 17).fill(37), {asset} = await f.create(bytes), u = await f.begin(asset);
    const first = await f.put(u, 1, bytes.slice(0, PART)); assert.equal(first.status, 200);
    const second = await f.put(u, 2, bytes.slice(PART)); assert.equal(second.status, 200);
    const rows = f.db.db.prepare('SELECT * FROM site_parts ORDER BY part_number').all(), healthy = f.bucket.objects.get(rows[0].object_key).bytes.slice();
    const puts = f.bucket.puts; assert.equal((await f.put(u, 1, bytes.slice(0, PART))).json.etag, first.json.etag); assert.equal(f.bucket.puts, puts);
    f.bucket.objects.get(rows[1].object_key).bytes.fill(9); const damaged = f.bucket.objects.get(rows[1].object_key).bytes.slice();
    const status = await f.call(`/v1/assets/${asset.id}/uploads`); assert.equal(status.json.parts[1].verified, false);
    const repaired = await f.put(u, 2, bytes.slice(PART)); assert.equal(repaired.status, 200); assert.notEqual(repaired.json.etag, second.json.etag);
    assert.deepEqual(f.bucket.objects.get(rows[0].object_key).bytes, healthy); assert.deepEqual(f.bucket.objects.get(rows[1].object_key).bytes, damaged);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_parts').get().n, 3);
    assert.equal((await f.complete(u)).status, 200); assert.deepEqual((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).data, bytes);
  } finally {await f.cleanup();}
});

test('SW06 / SQLITE_MOCK_R2: whole Original checksum mismatch retains parts and leaves cloudSafe false', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(undefined, {sha256: '0'.repeat(64)}), u = await f.begin(asset);
    assert.equal((await f.put(u, 1, bytes)).status, 200); const keys = [...f.bucket.objects.keys()];
    assert.equal((await f.complete(u)).status, 400); assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false);
    assert.equal(f.db.db.prepare('SELECT status FROM site_uploads').get().status, 'UPLOADING');
    for (const key of keys) assert.deepEqual(f.bucket.objects.get(key).bytes, bytes);
    assert.equal((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).status, 409);
  } finally {await f.cleanup();}
});

test('SW07 / SQLITE_MOCK_R2: READY completion is idempotent and Original requires explicit purpose', async () => {
  const f = await fixture(); try {
    const {asset, bytes, upload} = await f.ready(), assemblies = f.bucket.assemblies;
    assert.equal((await f.complete(upload)).status, 200); assert.equal(f.bucket.assemblies, assemblies);
    assert.ok((await f.call(`/v1/assets/${asset.id}/original`)).status >= 400);
    assert.deepEqual((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).data, bytes);
    f.restart(); assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, true);
    assert.equal((await f.complete(upload)).status, 200); assert.equal(f.bucket.assemblies, assemblies);
  } finally {await f.cleanup();}
});

test('SW08 / SQLITE_MOCK_R2_FAULT: failed atomic completion cannot mark cloudSafe and retry preserves old objects', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), u = await f.begin(asset); assert.equal((await f.put(u, 1, bytes)).status, 200);
    f.db.failBatch = true; assert.equal((await f.complete(u)).status, 503);
    assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false); const old = new Map([...f.bucket.objects].map(([k, v]) => [k, v.bytes.slice()]));
    assert.equal(f.db.db.prepare('SELECT status FROM site_uploads').get().status, 'UPLOADING');
    assert.equal((await f.complete(u)).status, 200); for (const [key, bytes] of old) assert.deepEqual(f.bucket.objects.get(key).bytes, bytes);
  } finally {await f.cleanup();}
});

test('SW09 / SQLITE_CONCURRENT_HANDLER: identical concurrent recipe CAS creates one revision and one audit entry', async () => {
  const f = await fixture(); try {
    const {asset} = await f.create(), body = {expectedRevision: 0, recipe: recipe()};
    const results = await Promise.all([0, 1].map(() => f.call(`/v1/assets/${asset.id}/recipe`, {method: 'PUT', body})));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM recipes').get().n, 1);
    assert.equal(f.db.db.prepare("SELECT count(*) n FROM audit WHERE action='recipe-committed'").get().n, 1);
  } finally {await f.cleanup();}
});

test('SW10 / SQLITE_MOCK_R2: portrait save remains disabled and does not replace valid saved global recipe', async () => {
  const f = await fixture(); try {
    const {asset} = await f.create(), base = `/v1/assets/${asset.id}/recipe`, initial = recipe();
    assert.equal((await f.call(base, {method: 'PUT', body: {expectedRevision: 0, recipe: initial}})).status, 200);
    const p = portrait(asset.id); p.originalSHA256 = asset.sha256;
    const refused = await f.call(base, {method: 'PUT', body: {expectedRevision: 1, recipe: recipe(p)}});
    assert.equal(refused.status, 400); assert.equal(refused.json.error, 'PERSON_PROCESSING_DISABLED');
    const saved = (await f.call(base)).json.recipe; assert.equal(saved.revision, 1); assert.deepEqual(saved.body, initial);
  } finally {await f.cleanup();}
});

test('SW11 / SQLITE_MOCK_R2: source-backed author adoption survives restart and checksum corruption refuses without deletion', async () => {
  const f = await fixture(); try {
    await f.loginAdmin();
    const {asset} = await f.ready(), r = recipe(); r.parameters.exposure = 1;
    assert.equal((await f.call(`/v1/assets/${asset.id}/recipe`, {method: 'PUT', body: {expectedRevision: 0, recipe: r}})).status, 200);
    const input = {name: 'Sites test preset', recipe: r, assetID: asset.id, recipeRevision: 1};
    assert.equal((await f.call('/trial/drafts', {method: 'POST', actor: f.b, body: input})).status, 404);
    const made = await f.call('/trial/drafts', {method: 'POST', body: input}); assert.equal(made.status, 201); const path = `/trial/drafts/${made.json.id}`;
    assert.equal((await f.call(path, {actor: f.b})).status, 404);
    assert.equal((await f.call(path + '/submit', {method: 'POST', body: {expectedRevision: 1}})).status, 200);
    assert.equal((await f.call(path + '/review', {method: 'POST', body: {expectedRevision: 1, decision: 'ACCEPTED'}})).status, 403);
    assert.equal((await f.call(path + '/review', {method: 'POST', actor: f.admin, body: {expectedRevision: 1, decision: 'ACCEPTED'}})).status, 200);
    const before = (await f.call('/trial/presets', {actor: f.b})).json.presets; assert.equal(before.length, 1); assert.equal(JSON.stringify(before).includes(asset.id), false);
    f.restart(); assert.deepEqual((await f.call('/trial/presets')).json.presets, before);
    const row = f.db.db.prepare('SELECT * FROM site_presets').get(), damaged = JSON.parse(row.body); damaged.parameters.exposure = 2;
    f.db.db.prepare('UPDATE site_presets SET body=? WHERE id=?').run(JSON.stringify(damaged), row.id);
    assert.equal((await f.call('/trial/presets')).status, 400); assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_presets').get().n, 1);
  } finally {await f.cleanup();}
});

test('SW12 / SQLITE_CONCURRENT_HANDLER: draft CAS writes exactly one new immutable version under concurrent updates', async () => {
  const f = await fixture(); try {
    const {asset} = await f.ready(), r = recipe();
    await f.call(`/v1/assets/${asset.id}/recipe`, {method: 'PUT', body: {expectedRevision: 0, recipe: r}});
    const input = {name: 'Initial', recipe: r, assetID: asset.id, recipeRevision: 1}, created = await f.call('/trial/drafts', {method: 'POST', body: input}); assert.equal(created.status, 201);
    const path = `/trial/drafts/${created.json.id}`, results = await Promise.all([0, 1].map(() => f.call(path, {method: 'PUT', body: {...input, name: 'Updated', expectedRevision: 1}})));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await f.call(path)).json.revision, 2);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_draft_versions').get().n, 2);
  } finally {await f.cleanup();}
});

test('SW13 / SQLITE_MOCK_R2: production streaming digest absence fails closed instead of full-buffer fallback', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), u = await f.begin(asset); assert.equal((await f.put(u, 1, bytes)).status, 200);
    delete f.env.__testDigest; assert.equal(typeof crypto.DigestStream, 'undefined', 'this is a Node-only negative runtime boundary');
    assert.equal((await f.complete(u)).status, 503); assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false);
    assert.equal(f.bucket.objects.size >= 1, true);
  } finally {await f.cleanup();}
});

test('SW14 / SQLITE_MOCK_R2_CORRUPTION: damaged READY object cannot remain cloudSafe or silently serve corrupted Original', async () => {
  const f = await fixture(); try {
    const {asset} = await f.ready(), row = f.db.db.prepare('SELECT * FROM site_uploads').get();
    const partRows = f.db.db.prepare('SELECT * FROM site_parts').all(), parts = partRows.map(p => [p.object_key, f.bucket.objects.get(p.object_key).bytes.slice()]);
    f.bucket.objects.get(row.object_key).bytes.fill(6); const damaged = f.bucket.objects.get(row.object_key).bytes.slice();
    assert.equal((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).status, 409);
    assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false);
    assert.deepEqual(f.bucket.objects.get(row.object_key).bytes, damaged); for (const [key, bytes] of parts) assert.deepEqual(f.bucket.objects.get(key).bytes, bytes);
    // Recovery/recomposition, actual R2 bitrot, and platform privacy are not established by this refusal test.
  } finally {await f.cleanup();}
});

test('SW15 / SQLITE_CONCURRENT_HANDLER: simultaneous distinct platform users cannot bind one invitation twice', async () => {
  const f = await fixture(); try {
    const results = await Promise.all([f.a, {...f.a, user: 'other-platform-subject'}].map(actor => f.call('/trial/session', {actor})));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 200]);
    assert.equal(results.filter(r=>r.json.principal?.id===f.a.id).length,1);
    assert.equal(results.filter(r=>r.json.endedReason==='INVITATION_REQUIRED').length,1);
    const row = f.db.db.prepare('SELECT user_id FROM site_members WHERE id=?').get(f.a.id);
    assert.equal(row.user_id, results[0].json.principal?f.a.user:'other-platform-subject');
  } finally {await f.cleanup();}
});

test('SW16 / SQLITE_CORRUPTION: earlier wrong-asset portrait history blocks latest global reload and preserves rows', async () => {
  const f = await fixture(); try {
    const {asset} = await f.create(), path = `/v1/assets/${asset.id}/recipe`;
    for (const expectedRevision of [0, 1]) assert.equal((await f.call(path, {method: 'PUT', body: {expectedRevision, recipe: recipe()}})).status, 200);
    const wrong = portrait(randomUUID()); wrong.originalSHA256 = asset.sha256; const damaged = JSON.stringify(recipe(wrong));
    f.db.db.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=1').run(damaged, asset.id);
    assert.ok((await f.call(path)).status >= 400);
    assert.equal(f.db.db.prepare('SELECT body FROM recipes WHERE asset_id=? AND revision=1').get(asset.id).body, damaged);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM recipes').get().n, 2);
  } finally {await f.cleanup();}
});

test('SW17 / SQLITE_MOCK_R2_QUOTA: low storage quota denies only new import and preserves existing Original parts and recipe', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.ready(), path = `/v1/assets/${asset.id}/recipe`, saved = recipe(); saved.parameters.exposure = 1;
    assert.equal((await f.call(path, {method: 'PUT', body: {expectedRevision: 0, recipe: saved}})).status, 200);
    const retained = new Map([...f.bucket.objects].map(([key, value]) => [key, value.bytes.slice()]));
    const reserved = f.db.db.prepare('SELECT sum(bytes) n FROM site_storage_reservations').get().n;
    f.env.SUITE_TRIAL_STORAGE_LIMIT_BYTES = String(reserved);
    const rejected = await f.call('/v1/assets', {method: 'POST', body: {name: 'another-NON_RAW.bin', size: 1, sha256: digest(new Uint8Array([9]))}});
    assert.ok(rejected.status >= 400); assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 1);
    assert.equal(f.db.db.prepare('SELECT sum(bytes) n FROM site_storage_reservations').get().n, reserved);
    assert.deepEqual((await f.call(path)).json.recipe.body, saved);
    assert.deepEqual((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).data, bytes);
    for (const [key, value] of retained) assert.deepEqual(f.bucket.objects.get(key).bytes, value);
  } finally {await f.cleanup();}
});

test('SW18 / SQLITE_MOCK_R2_QUOTA: write operation limit stops new R2 calls and conservatively retains reservation', async () => {
  const f = await fixture(); try {
    const bytes = new Uint8Array(PART + 1).fill(7), {asset} = await f.create(bytes), u = await f.begin(asset);
    f.env.SUITE_TRIAL_R2_WRITE_LIMIT_MONTH = '1'; assert.equal((await f.put(u, 1, bytes.slice(0, PART))).status, 200);
    const before = [...f.bucket.objects].map(([key, value]) => [key, value.bytes.slice()]), puts = f.bucket.puts;
    assert.ok((await f.put(u, 2, bytes.slice(PART))).status >= 400); assert.equal(f.bucket.puts, puts);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_parts').get().n, 1);
    assert.ok(f.db.db.prepare("SELECT count(*) n FROM site_storage_objects WHERE state='RESERVED'").get().n >= 1);
    for (const [key, value] of before) assert.deepEqual(f.bucket.objects.get(key).bytes, value);
  } finally {await f.cleanup();}
});

test('SW19 / SQLITE_MOCK_R2_QUOTA: missing quota configuration and daily budget refuse without library mutation', async () => {
  const f = await fixture(); try {
    delete f.env.SUITE_TRIAL_REQUEST_LIMIT_DAY;
    assert.ok((await f.call('/v1/assets')).status >= 400); assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 0);
    f.env.SUITE_TRIAL_REQUEST_LIMIT_DAY = '1'; assert.equal((await f.call('/trial/session')).status, 200);
    assert.equal((await f.call('/v1/assets')).status, 429); assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 0);
    assert.equal(f.bucket.objects.size, 0);
  } finally {await f.cleanup();}
});

test('SW20 / SQLITE_MOCK_D1_METADATA: usage is admin-only and missing D1 measurement remains explicitly unknown', async () => {
  const f = await fixture(); try {
    await f.loginAdmin();
    await f.ready(); assert.equal((await f.call('/trial/usage')).status, 403);
    const report = await f.call('/trial/usage', {actor: f.admin}); assert.equal(report.status, 200);
    assert.equal(report.json.scope, 'THIS_SUITE_SITE_ONLY_NOT_ACCOUNT_FREE_BALANCE');
    assert.equal(report.json.cpuTime, 'NOT_AVAILABLE_WALL_TIME_IS_NOT_CPU');
    assert.ok(report.json.metrics.some(m => m.d1_metadata_unknown > 0));
    assert.ok(report.json.storage.reservedBytes > 0); assert.ok(report.json.operations.some(o => o.kind === 'A' && o.count > 0));
  } finally {await f.cleanup();}
});

test('SW21 / SQLITE_MOCK_R2_QUOTA: repair consuming retained-byte allowance cannot assemble beyond storage cap', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), u = await f.begin(asset); f.env.SUITE_TRIAL_STORAGE_LIMIT_BYTES = String(bytes.length * 2);
    assert.equal((await f.put(u, 1, bytes)).status, 200); const oldKey = f.db.db.prepare('SELECT object_key FROM site_parts').get().object_key;
    f.bucket.objects.get(oldKey).bytes.fill(8); const damaged = f.bucket.objects.get(oldKey).bytes.slice();
    assert.equal((await f.put(u, 1, bytes)).status, 200); const assemblies = f.bucket.assemblies;
    assert.ok((await f.complete(u)).status >= 400); assert.equal(f.bucket.assemblies, assemblies);
    assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false);
    assert.deepEqual(f.bucket.objects.get(oldKey).bytes, damaged); assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_parts').get().n, 2);
  } finally {await f.cleanup();}
});

test('SW22 / SQLITE_MOCK_R2_TRIAL_CLOCK: no deadline means no access and signed-in expiry retains Original recipe and published preset', async () => {
  const f = await fixture(); try {
    await f.loginAdmin();
    f.db.db.prepare('UPDATE site_members SET trial_ends_at=0 WHERE id=?').run(f.a.id);
    const missing = await f.call('/trial/session'); assert.equal(missing.status, 200); assert.equal(missing.json.endedReason, 'TRIAL_END_NOT_CONFIGURED');assert.equal(missing.json.principal,null);
    f.db.db.prepare('UPDATE site_members SET trial_ends_at=? WHERE id=?').run(f.env.__testNow + 500, f.a.id);
    const {asset} = await f.ready(), r = recipe(); r.parameters.exposure = 1;
    assert.equal((await f.call(`/v1/assets/${asset.id}/recipe`, {method: 'PUT', body: {expectedRevision: 0, recipe: r}})).status, 200);
    const made = await f.call('/trial/drafts', {method: 'POST', body: {name: 'Retained when trial ends', recipe: r, assetID: asset.id, recipeRevision: 1}});
    assert.equal(made.status, 201); const path = `/trial/drafts/${made.json.id}`;
    assert.equal((await f.call(path + '/submit', {method: 'POST', body: {expectedRevision: 1}})).status, 200);
    assert.equal((await f.call(path + '/review', {method: 'POST', actor: f.admin, body: {expectedRevision: 1, decision: 'ACCEPTED'}})).status, 200);
    const presets = (await f.call('/trial/presets')).json.presets, bytes = new Map([...f.bucket.objects].map(([key, value]) => [key, value.bytes.slice()]));
    f.env.__testNow += 500;
    const expired = await f.call('/trial/session'); assert.equal(expired.status, 200); assert.equal(expired.json.endedReason, 'TRIAL_EXPIRED');assert.equal(expired.json.principal,null);
    for (const action of ['edit', 'export', 'submit']) assert.equal((await f.call('/trial/authorize', {method: 'POST', body: {assetID: asset.id, action}})).status, 403);
    assert.equal((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).status, 403);
    assert.deepEqual((await f.call('/trial/presets', {actor: f.admin})).json.presets, presets);
    assert.equal(f.db.db.prepare('SELECT cloud_safe FROM assets WHERE id=?').get(asset.id).cloud_safe, 1);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM recipes').get().n, 1); assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_drafts').get().n, 1);
    for (const [key, value] of bytes) assert.deepEqual(f.bucket.objects.get(key).bytes, value);
  } finally {await f.cleanup();}
});

test('SW23 / SQLITE_MOCK_R2_TRIAL_ADMIN: revocation immediately blocks bound member and never deletes their Original', async () => {
  const f = await fixture(); try {
    await f.loginAdmin();
    const {asset} = await f.ready(), before = new Map([...f.bucket.objects].map(([key, value]) => [key, value.bytes.slice()]));
    assert.equal((await f.call(`/trial/members/${f.a.id}/revoke`, {method: 'POST', actor: f.admin, body: {}})).status, 200);
    const denied = await f.call('/v1/assets'); assert.equal(denied.status, 403); assert.equal(denied.json.error, 'TRIAL_REVOKED');
    assert.equal((await f.call('/trial/authorize', {method: 'POST', body: {assetID: asset.id, action: 'export'}})).status, 403);
    f.restart(); assert.equal((await f.call('/v1/assets')).status, 403);
    assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 1);
    for (const [key, value] of before) assert.deepEqual(f.bucket.objects.get(key).bytes, value);
  } finally {await f.cleanup();}
});

test('SW24 / SQLITE_TRIAL_ADMIN: member cannot extend own deadline and invalid admin changes preserve the prior grant', async () => {
  const f = await fixture(); try {
    await f.loginAdmin();
    const end = f.db.db.prepare('SELECT trial_ends_at FROM site_members WHERE id=?').get(f.a.id).trial_ends_at;
    assert.equal((await f.call(`/trial/members/${f.a.id}`, {method: 'POST', body: {trialEndsAt: '2026-12-03T09:00:00.000Z'}})).status, 403);
    for (const trialEndsAt of [null, '', 'bad-date', new Date(f.env.__testNow).toISOString()]) {
      assert.equal((await f.call(`/trial/members/${f.a.id}`, {method: 'POST', actor: f.admin, body: {trialEndsAt}})).status, 400);
      assert.equal(f.db.db.prepare('SELECT trial_ends_at FROM site_members WHERE id=?').get(f.a.id).trial_ends_at, end);
    }
    assert.equal((await f.call('/trial/session')).status, 200);
  } finally {await f.cleanup();}
});

test('SW25 / SQLITE_MOCK_R2_QUOTA_RECOVERY: read budget refusal preserves healthy READY Original and succeeds when quota is restored', async () => {
  const f = await fixture(); try {
    const {asset, bytes, upload} = await f.ready(), before = new Map([...f.bucket.objects].map(([k, v]) => [k, v.bytes.slice()]));
    const puts = f.bucket.puts, assemblies = f.bucket.assemblies;
    f.env.SUITE_TRIAL_R2_READ_LIMIT_MONTH = '1';
    assert.equal((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).status, 429);
    assert.equal((await f.complete(upload)).status, 429);
    assert.equal(f.db.db.prepare('SELECT cloud_safe FROM assets WHERE id=?').get(asset.id).cloud_safe, 1);
    assert.equal(f.db.db.prepare('SELECT status FROM site_uploads WHERE id=?').get(upload.id).status, 'READY');
    f.env.SUITE_TRIAL_R2_READ_LIMIT_MONTH = '100000';
    assert.equal((await f.complete(upload)).status, 200);
    assert.deepEqual((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).data, bytes);
    assert.equal(f.bucket.puts, puts); assert.equal(f.bucket.assemblies, assemblies);
    for (const [k, v] of before) assert.deepEqual(f.bucket.objects.get(k).bytes, v);
  } finally {await f.cleanup();}
});

test('SW26 / SQLITE_MOCK_R2_TRANSIENT: temporary Original get failure does not mark verified bytes corrupt or clear Cloud Safe', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.ready(), get = f.bucket.get, before = f.db.db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id);
    f.bucket.get = async () => {throw Error('INJECTED_TRANSIENT_R2_GET');};
    assert.equal((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).status, 503);
    assert.deepEqual(f.db.db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id), before);
    f.bucket.get = get;
    assert.deepEqual((await f.call(`/v1/assets/${asset.id}/original?purpose=high-precision`)).data, bytes);
  } finally {await f.cleanup();}
});

test('SW27 / SQLITE_MOCK_R2_TRANSIENT: healthy part inspection failure cannot create replacement parts or extra R2 writes', async () => {
  const f = await fixture(); try {
    const {asset, bytes} = await f.create(), upload = await f.begin(asset);
    assert.equal((await f.put(upload, 1, bytes)).status, 200);
    const rows = f.db.db.prepare('SELECT * FROM site_parts').all(), puts = f.bucket.puts, get = f.bucket.get;
    const originalPart = f.bucket.objects.get(rows[0].object_key).bytes.slice();
    f.bucket.get = async () => {throw Error('INJECTED_TRANSIENT_PART_GET');};
    assert.equal((await f.put(upload, 1, bytes)).status, 503);
    assert.equal(f.bucket.puts, puts); assert.deepEqual(f.db.db.prepare('SELECT * FROM site_parts').all(), rows);
    assert.deepEqual(f.bucket.objects.get(rows[0].object_key).bytes, originalPart);
    f.bucket.get = get; assert.equal((await f.put(upload, 1, bytes)).status, 200); assert.equal(f.bucket.puts, puts);
  } finally {await f.cleanup();}
});

test('SW28 / SQLITE_CONFIGURATION: each missing quota configuration fails before membership binding or library writes', async () => {
  for (const key of ['SUITE_TRIAL_STORAGE_LIMIT_BYTES', 'SUITE_TRIAL_R2_WRITE_LIMIT_MONTH', 'SUITE_TRIAL_R2_READ_LIMIT_MONTH', 'SUITE_TRIAL_REQUEST_LIMIT_DAY']) {
    const f = await fixture(); try {
      delete f.env[key];
      const rejected = await f.call('/v1/assets', {method: 'POST', body: {name: 'NON_RAW.bin', size: 1, sha256: digest(new Uint8Array([1]))}});
      assert.equal(rejected.status, 503, key); assert.equal(f.bucket.objects.size, 0);
      assert.equal(f.db.db.prepare('SELECT count(*) n FROM assets').get().n, 0);
      assert.equal(f.db.db.prepare('SELECT count(*) n FROM site_storage_reservations').get().n, 0);
      assert.equal(f.db.db.prepare('SELECT user_id FROM site_members WHERE id=?').get(f.a.id).user_id, null);
    } finally {await f.cleanup();}
  }
});

test('SW29 / PUBLIC_LOCAL_ENTRY: anonymous static Editor and session do not spend private D1/R2 budget', async () => {
  const f=await fixture();try{
    f.env.ASSETS={fetch:async()=>new Response('PUBLIC_SUITE_EDITOR',{status:200,headers:{'Content-Type':'text/html'}})};
    const before=f.db.db.prepare('SELECT COUNT(*) n FROM site_operation_budget').get().n;
    const page=await f.call('/',{actor:null});assert.equal(page.status,200);assert.equal(new TextDecoder().decode(page.data),'PUBLIC_SUITE_EDITOR');
    const session=await f.call('/trial/session',{actor:null});assert.equal(session.status,200);assert.equal(session.json.principal,null);assert.equal(session.json.anonymousLocal,true);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM site_operation_budget').get().n,before);
    assert.equal((await f.call('/v1/assets',{actor:null})).status,401);
    assert.equal((await f.call('/trial/drafts',{actor:null})).status,401);
    const unknown=await f.call('/private-not-a-static-file',{actor:null});assert.equal(unknown.status,404);
  }finally{await f.cleanup();}
});

test('SW30 / ADMIN_PASSWORD_GATE: every management API rejects role-only access and owner password session expires', async () => {
  const f=await fixture();try{
    for(const route of ['/trial/members','/trial/submissions','/trial/usage'])assert.equal((await f.call(route,{actor:f.admin})).status,403,route);
    assert.equal((await f.call(`/trial/drafts/${randomUUID()}/review`,{actor:f.admin,method:'POST',body:{expectedRevision:1,decision:'ACCEPTED'}})).status,403);
    assert.equal((await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'incorrect-test-value'}})).status,403);
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,403);
    const cookie=await f.loginAdmin();assert.match(cookie,/^__Host-suite-admin=/);
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,200);
    assert.equal((await f.call('/trial/members',{actor:f.admin,headers:{Cookie:''}})).status,403);
    const create={email:'extra-admin@example.test',authorName:'Extra',role:'admin',trialEndsAt:'2026-11-04T09:00:00Z',inviteExpiresAt:'2026-11-02T09:00:00Z'};
    assert.equal((await f.call('/trial/members',{actor:f.admin,method:'POST',body:create})).status,400);
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM site_members WHERE role='admin'").get().n,1);
    f.env.__testNow+=16*60*1000;
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,403);
  }finally{await f.cleanup();}
});

test('SW31 / ADMIN_LOGIN_RATE: wrong passwords are bounded and do not mutate assets or author submissions', async () => {
  const f=await fixture();try{
    for(let n=0;n<5;n++)assert.equal((await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'wrong'}})).status,403);
    assert.equal((await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'wrong'}})).status,429);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM assets').get().n,0);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM site_submissions').get().n,0);
  }finally{await f.cleanup();}
});

test('SW32 / FIRST_OWNER_BOOTSTRAP: configured Sites owner alone can create the first admin row after password verification', async () => {
  const f=await fixture();try{
    f.db.db.prepare('DELETE FROM site_members WHERE id=?').run(f.admin.id);
    const candidate=await f.call('/trial/session',{actor:f.admin});
    assert.equal(candidate.status,200);assert.equal(candidate.json.principal,null);assert.equal(candidate.json.adminCandidate,true);
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,403);
    assert.equal((await f.call('/trial/admin/login',{actor:f.b,method:'POST',body:{password:'SYNTHETIC_TEST_PASSWORD_NOT_A_PRODUCTION_SECRET'}})).status,403);
    assert.equal((await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'incorrect-test-value'}})).status,403);
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM site_members WHERE role='admin'").get().n,0);
    await f.loginAdmin();
    const live=await f.call('/trial/session',{actor:f.admin});
    assert.equal(live.json.principal.role,'admin');assert.equal(live.json.principal.trialEndsAt,null);
    assert.equal(live.json.adminPasswordAuthenticated,true);
    const row=f.db.db.prepare('SELECT id,user_id,email,active,trial_ends_at FROM site_members WHERE role=?').get('admin');
    assert.equal(row.user_id,f.admin.user);assert.equal(row.email,f.admin.email);assert.equal(row.active,1);assert.equal(row.trial_ends_at,0);
    assert.equal((await f.call(`/trial/members/${row.id}/revoke`,{actor:f.admin,method:'POST',body:{}})).status,403);
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,200);
    f.restart();assert.equal((await f.call('/trial/members',{actor:f.admin})).status,200);
    assert.equal((await f.call('/trial/members',{actor:f.b})).status,403);
  }finally{await f.cleanup();}
});

test('SW33 / MISSING_ADMIN_SECRETS: public browser-local entry remains available while every management route fails closed', async () => {
  const f=await fixture();try{
    f.env.ASSETS={fetch:async()=>new Response('PUBLIC_SUITE_EDITOR',{status:200,headers:{'Content-Type':'text/html'}})};
    delete f.env.SUITE_ADMIN_PASSWORD;delete f.env.SUITE_ADMIN_SESSION_SECRET;
    const page=await f.call('/',{actor:null});assert.equal(page.status,200);
    assert.equal(new TextDecoder().decode(page.data),'PUBLIC_SUITE_EDITOR');
    const session=await f.call('/trial/session',{actor:null});assert.equal(session.status,200);
    assert.equal(session.json.principal,null);assert.equal(session.json.anonymousLocal,true);
    for(const path of ['/trial/members','/trial/submissions','/trial/usage'])assert.equal((await f.call(path,{actor:f.admin})).status,503,path);
    assert.equal((await f.call(`/trial/drafts/${randomUUID()}/review`,{actor:f.admin,method:'POST',body:{expectedRevision:1,decision:'ACCEPTED'}})).status,503);
    assert.equal((await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'synthetic-test-value'}})).status,503);
    assert.equal((await f.call('/trial/members',{actor:null})).status,401);
    assert.equal((await f.call('/v1/assets',{actor:null})).status,401);
    assert.equal((await f.call('/trial/drafts',{actor:null})).status,401);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM assets').get().n,0);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM site_submissions').get().n,0);
  }finally{await f.cleanup();}
});

test('SW34 / UNTRUSTED_DISPATCH: first-owner bootstrap refuses before password use or membership mutation', async () => {
  const f=await fixture();try{
    f.db.db.prepare('DELETE FROM site_members WHERE id=?').run(f.admin.id);
    delete f.env.SUITE_TRUST_SITES_DISPATCH;
    const result=await f.call('/trial/admin/login',{actor:f.admin,method:'POST',body:{password:'SYNTHETIC_TEST_PASSWORD_NOT_A_PRODUCTION_SECRET'}});
    assert.equal(result.status,503);
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM site_members WHERE role='admin'").get().n,0);
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM site_operation_budget WHERE kind LIKE 'ADMIN_LOGIN:%'").get().n,0);
  }finally{await f.cleanup();}
});

test('SW35 / PUBLIC_BEFORE_BINDINGS: anonymous static Editor and session remain available without D1, R2 or admin Secrets', async () => {
  const f=await fixture();try{
    f.env.ASSETS={fetch:async()=>new Response('PUBLIC_SUITE_EDITOR',{status:200,headers:{'Content-Type':'text/html'}})};
    delete f.env.DB;delete f.env.BUCKET;delete f.env.SUITE_ADMIN_PASSWORD;delete f.env.SUITE_ADMIN_SESSION_SECRET;
    assert.equal((await f.call('/',{actor:null})).status,200);
    const session=await f.call('/trial/session',{actor:null});
    assert.equal(session.status,200);assert.equal(session.json.anonymousLocal,true);assert.equal(session.json.principal,null);
    assert.equal((await f.call('/v1/assets',{actor:null})).status,401);
    assert.equal((await f.call('/trial/members',{actor:f.admin})).status,503);
  }finally{await f.cleanup();}
});
