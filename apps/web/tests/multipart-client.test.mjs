import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, basename} from 'node:path';
import {SitesClient} from '../src/sites-client.mjs';
import {TrialClient} from '../src/trial-client.mjs';

// Artificial bytes + fake HTTP only. No RAW decoder, browser Worker, R2, D1, or real identity.
const PART_SIZE = 8 * 1024 * 1024;
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCOPE = 'NONRAW_SYNTHETIC_FAKE_HTTP_MULTIPART_CLIENT_ONLY';
const observations = [];
const hash = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const clone = value => structuredClone(value);
function artificialBytes(size = 37) {
  const bytes = new Uint8Array(size);
  // Deliberately not a camera header; never interpret these as a RAW/image fixture.
  for (let i = 0; i < size; i++) bytes[i] = (i * 17 + 19) % 251;
  return bytes.buffer;
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
}
function fixture(body = artificialBytes(), options = {}) {
  const sha256 = hash(body), size = body.byteLength;
  const upload = {id: JOB_ID, assetID: ASSET_ID, sha256, size, partSize: PART_SIZE, partCount: Math.ceil(size / PART_SIZE)};
  const asset = {id: ASSET_ID, sha256, size, cloudSafe: true};
  const state = {upload: options.resume ? clone(upload) : null, parts: new Map(), requests: [], creates: 0, completes: 0, putNumbers: []};
  let lostPartAck = options.lostPartAck, lostCompleteAck = options.lostCompleteAck;
  function expectedPart(number) {return body.slice((number - 1) * PART_SIZE, Math.min(size, number * PART_SIZE));}
  function seed(number, overrides = {}) {
    const bytes = expectedPart(number);
    const record = {partNumber: number, sha256: hash(bytes), size: bytes.byteLength, etag: 'persisted-part-' + number, verified: true, ...overrides};
    state.parts.set(number, {record, bytes});
    return record;
  }
  async function fetcher(url, request = {}) {
    const path = new URL(url, 'https://synthetic.invalid').pathname;
    const method = request.method || 'GET', headers = new Headers(request.headers);
    state.requests.push({path, method, credentials: request.credentials, headers: Object.fromEntries(headers)});
    assert.equal(request.credentials, 'same-origin', 'credentials policy remains same-origin');
    assert.equal(headers.get('X-Suite-Trial'), '1');
    assert.equal(headers.has('X-Suite-QA'), false, 'no local QA identity fallback');
    const base = '/v1/assets/' + ASSET_ID + '/uploads';
    if (path === base && method === 'GET') return json({upload: state.upload && clone(state.upload), parts: [...state.parts.values()].map(p => clone(p.record))});
    if (path === base && method === 'POST') {
      assert.equal(headers.get('Content-Type'), 'application/json');
      assert.deepEqual(JSON.parse(request.body), {});
      state.creates++;
      state.upload = {...upload, ...options.uploadOverrides};
      return json(clone(state.upload), 201);
    }
    const partMatch = /^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/.exec(path);
    if (partMatch && method === 'PUT') {
      assert.equal(partMatch[1], JOB_ID, 'server job ID must survive retries');
      assert.ok(state.upload, 'upload must exist before a part');
      const number = Number(partMatch[2]), bytes = request.body;
      assert.ok(bytes instanceof ArrayBuffer, 'part is binary ArrayBuffer, not JSON/base64');
      if (options.requireOctet) assert.equal(headers.get('Content-Type'), 'application/octet-stream');
      assert.ok(number >= 1 && number <= upload.partCount);
      assert.ok(bytes.byteLength <= PART_SIZE, 'every request is bounded to 8MiB');
      const expected = expectedPart(number), partSHA = hash(bytes);
      assert.equal(headers.get('X-Suite-Part-SHA256'), partSHA, 'header hashes actual body');
      assert.deepEqual(new Uint8Array(bytes), new Uint8Array(expected), 'body uses exact source offset/length');
      state.putNumbers.push(number);
      if (options.httpPartReject === number) return json({error: 'PART_CHECKSUM_REJECTED'}, 422);
      const record = {partNumber: number, sha256: partSHA, size: bytes.byteLength, etag: 'stored-part-' + number, verified: true};
      state.parts.set(number, {record, bytes: bytes.slice(0)});
      if (lostPartAck === number) {lostPartAck = undefined; throw new TypeError('SYNTHETIC_NETWORK_ACK_LOST');}
      return json({...record, ...options.partResponseOverrides});
    }
    if (path === '/v1/uploads/' + JOB_ID + '/complete' && method === 'POST') {
      assert.equal(headers.get('Content-Type'), 'application/json');
      assert.deepEqual(JSON.parse(request.body), {});
      assert.equal(state.parts.size, upload.partCount, 'complete requires every part');
      const rebuilt = new Uint8Array(size);
      for (let number = 1; number <= upload.partCount; number++) {
        const part = state.parts.get(number);
        assert.ok(part?.record.verified);
        assert.equal(part.record.sha256, hash(part.bytes));
        assert.equal(part.record.size, expectedPart(number).byteLength);
        rebuilt.set(new Uint8Array(part.bytes), (number - 1) * PART_SIZE);
      }
      assert.equal(hash(rebuilt.buffer), sha256, 'synthetic fixture verifies complete bytes');
      state.completes++;
      if (lostCompleteAck) {lostCompleteAck = false; throw new TypeError('SYNTHETIC_COMPLETE_ACK_LOST');}
      return json({...asset, ...options.finalOverrides});
    }
    throw Error('UNEXPECTED_FAKE_HTTP_ROUTE: ' + method + ' ' + path);
  }
  const client = () => new SitesClient({baseURL: 'https://synthetic.invalid', fetcher});
  return {body, sha256, size, upload, asset, state, seed, client};
}
function caseTest(id, title, run) {
  test(id + ' / ' + SCOPE + ': ' + title, async () => {
    const startedAt = new Date().toISOString();
    try {await run(); observations.push({id, title, status: 'PASS', startedAt});}
    catch (error) {observations.push({id, title, status: 'FAIL', startedAt, error: {name: error.name, message: error.message}}); throw error;}
  });
}

caseTest('MC01', 'real client sends bounded binary parts with octet type, SHA header, and preserves caller bytes', async () => {
  const f = fixture(artificialBytes(PART_SIZE + 37), {requireOctet: true}), before = hash(f.body);
  assert.ok(f.client() instanceof TrialClient);
  assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
  assert.deepEqual(f.state.putNumbers, [1, 2]);
  assert.equal(f.state.creates, 1); assert.equal(f.state.completes, 1);
  assert.equal(f.body.byteLength, PART_SIZE + 37); assert.equal(hash(f.body), before);
  assert.equal(f.state.requests.some(r => ['DELETE', 'PATCH'].includes(r.method)), false, 'no Original eviction request');
});

caseTest('MC02', 'verified checksum and size matching existing parts are skipped without changing old part bytes/etag', async () => {
  const f = fixture(artificialBytes(PART_SIZE + 29), {resume: true});
  const first = f.seed(1), second = f.seed(2), retained = [...f.state.parts.values()].map(p => hash(p.bytes));
  assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
  assert.deepEqual(f.state.putNumbers, []); assert.equal(f.state.creates, 0);
  assert.strictEqual(f.state.parts.get(1).record, first); assert.strictEqual(f.state.parts.get(2).record, second);
  assert.deepEqual([...f.state.parts.values()].map(p => hash(p.bytes)), retained);
});

caseTest('MC03', 'wrong checksum part alone is repaired, healthy part stays identical', async () => {
  const f = fixture(artificialBytes(PART_SIZE + 23), {resume: true}), healthy = f.seed(1), firstBytes = hash(f.state.parts.get(1).bytes);
  f.seed(2, {sha256: '0'.repeat(64)});
  assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
  assert.deepEqual(f.state.putNumbers, [2]); assert.strictEqual(f.state.parts.get(1).record, healthy);
  assert.equal(hash(f.state.parts.get(1).bytes), firstBytes);
});

caseTest('MC04', 'wrong size or unverified part is not skipped even when its checksum matches', async () => {
  for (const change of [{size: 22}, {verified: false}]) {
    const f = fixture(artificialBytes(PART_SIZE + 23), {resume: true}), healthy = f.seed(1);
    f.seed(2, change); await f.client().putOriginal(ASSET_ID, f.body);
    assert.deepEqual(f.state.putNumbers, [2]); assert.strictEqual(f.state.parts.get(1).record, healthy);
  }
});

caseTest('MC05', 'lost part acknowledgement leaves server job durable and a new client resumes same asset without re-PUT', async () => {
  const f = fixture(artificialBytes(PART_SIZE + 13), {lostPartAck: 1}), before = hash(f.body);
  await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /SYNTHETIC_NETWORK_ACK_LOST/);
  assert.equal(f.state.upload.id, JOB_ID); const stored = f.state.parts.get(1).record;
  assert.equal(f.state.completes, 0); assert.equal(hash(f.body), before);
  assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
  assert.equal(f.state.creates, 1); assert.deepEqual(f.state.putNumbers, [1, 2]);
  assert.strictEqual(f.state.parts.get(1).record, stored); assert.equal(hash(f.body), before);
});

caseTest('MC06', 'lost complete acknowledgement retries completion without changing healthy parts', async () => {
  const f = fixture(artificialBytes(), {lostCompleteAck: true});
  await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /SYNTHETIC_COMPLETE_ACK_LOST/);
  const stored = f.state.parts.get(1).record;
  assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
  assert.equal(f.state.creates, 1); assert.equal(f.state.completes, 2); assert.deepEqual(f.state.putNumbers, [1]);
  assert.strictEqual(f.state.parts.get(1).record, stored);
});

caseTest('MC07', 'upload metadata binds exact asset/checksum/size/8MiB geometry before any part', async () => {
  for (const change of [{assetID: 'different'}, {sha256: '0'.repeat(64)}, {size: 38}, {partSize: 4 * 1024 * 1024}, {partCount: 2}, {id: null}]) {
    const f = fixture(artificialBytes(), {uploadOverrides: change});
    await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /UPLOAD_BINDING_MISMATCH/);
    assert.deepEqual(f.state.putNumbers, []); assert.equal(f.state.completes, 0);
  }
});

caseTest('MC08', 'wrong part acknowledgement number/checksum/size/verified refuses completion and preserves source', async () => {
  for (const change of [{partNumber: 2}, {sha256: '0'.repeat(64)}, {size: 38}, {verified: false}]) {
    const f = fixture(artificialBytes(), {partResponseOverrides: change}), before = hash(f.body);
    await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /UPLOAD_PART_MISMATCH/);
    assert.equal(f.state.completes, 0); assert.equal(hash(f.body), before);
  }
});

caseTest('MC09', 'HTTP checksum rejection leaves server job and input available, does not complete/evict', async () => {
  const f = fixture(artificialBytes(), {httpPartReject: 1}), before = hash(f.body);
  await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /PART_CHECKSUM_REJECTED/);
  assert.equal(f.state.upload.id, JOB_ID); assert.equal(f.state.parts.size, 0); assert.equal(f.state.completes, 0);
  assert.equal(hash(f.body), before); assert.equal(f.body.byteLength, f.size);
  assert.equal(f.state.requests.some(r => r.method === 'DELETE'), false);
});

caseTest('MC10', 'completion checksum/asset/size/cloudSafe mismatch cannot be reported as upload success', async () => {
  for (const change of [{sha256: '0'.repeat(64)}, {id: 'different'}, {size: 38}, {cloudSafe: false}]) {
    const f = fixture(artificialBytes(), {finalOverrides: change}), before = hash(f.body);
    await assert.rejects(f.client().putOriginal(ASSET_ID, f.body), /UPLOAD_FINAL_MISMATCH/);
    assert.equal(f.state.completes, 1); assert.equal(hash(f.body), before);
  }
});

caseTest('MC11', 'zero bytes and non-ArrayBuffer input reject before HTTP without fake decoding', async () => {
  for (const input of [new ArrayBuffer(0), new Uint8Array(37), 'NON_RAW', null]) {
    const f = fixture(); await assert.rejects(f.client().putOriginal(ASSET_ID, input), /RAW_UPLOAD_SIZE/);
    assert.equal(f.state.requests.length, 0);
  }
});

caseTest('MC12', 'exact 8MiB boundary produces one part; small source produces one trailing part', async () => {
  for (const size of [1, PART_SIZE]) {
    const f = fixture(artificialBytes(size)); assert.deepEqual(await f.client().putOriginal(ASSET_ID, f.body), f.asset);
    assert.deepEqual(f.state.putNumbers, [1]); assert.equal(f.state.parts.get(1).record.size, size);
  }
});

after(async () => {
  if (!process.env.MULTIPART_CLIENT_REPORT) return;
  const directory = fileURLToPath(new URL('./results/', import.meta.url)), report = resolve(process.env.MULTIPART_CLIENT_REPORT);
  assert.equal(dirname(report), resolve(directory)); assert.match(basename(report), /^multipart-client-[\w-]+\.json$/);
  const source = await readFile(new URL('../src/sites-client.mjs', import.meta.url)), api = await readFile(new URL('../src/api-client.mjs', import.meta.url));
  await writeFile(report, JSON.stringify({schemaVersion: 1, observedAt: new Date().toISOString(), scope: SCOPE,
    command: 'node --test apps/web/tests/multipart-client.test.mjs', runtime: process.version,
    sourceSHA256: {sitesClient: hash(source), apiClient: hash(api)},
    input: {kind: 'ARTIFICIAL_ARRAYBUFFER_NOT_CAMERA_RAW', maximumTestedBytes: PART_SIZE + 37, rawDecodeExecuted: false},
    status: observations.length === 12 && observations.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
    tests: observations.length, pass: observations.filter(r => r.status === 'PASS').length, fail: observations.filter(r => r.status === 'FAIL').length,
    browser: 'NOT_RUN', Cloudflare: 'NOT_RUN', R2: 'NOT_RUN', D1: 'NOT_RUN', ChatGPTIdentity: 'NOT_RUN',
    realRAW: 'NOT_RUN', realPerson: 'BLOCKED_PRIVACY_REVIEW_REQUIRED', cloudSafeCertification: false,
    observations}, null, 2) + '\n', {flag: 'wx'});
});
