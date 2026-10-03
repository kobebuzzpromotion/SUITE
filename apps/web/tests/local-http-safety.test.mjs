import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createLocalWebServer} from '../local-server.mjs';
import {recipe, portrait} from './fixtures.mjs';

// Real loopback HTTP + SQLite + immutable local bytes. Automatic QA cookie is NOT production/invite auth.
const bytes = Buffer.from('NON_RAW actual loopback storage fixture'), sha = createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-web-http-'));
  let server, port, cookie;
  function call(path, {method = 'GET', body, authenticated = true, headers = {}} = {}) {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = request({host: '127.0.0.1', port, path, method, headers: {
        Connection: 'close',
        ...(authenticated ? {'X-Suite-QA': '1', Cookie: cookie || ''} : {}),
        ...(payload ? {'Content-Length': payload.length, 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json'} : {}), ...headers
      }}, res => {const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
        const data = Buffer.concat(chunks); let json; try {json = JSON.parse(data.toString());} catch {}
        resolve({status: res.statusCode, headers: res.headers, data, json});
      }); res.on('error', reject);}); req.on('error', reject); req.end(payload);
    });
  }
  async function start() {
    ({server} = await createLocalWebServer({dataDir, port: 0}));
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    port = server.address().port;
    const page = await call('/', {authenticated: false}); assert.equal(page.status, 200, 'build Web assets before HTTP tests');
    cookie = page.headers['set-cookie'][0].split(';')[0];
  }
  async function stop() {if (server?.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));}
  await start();
  return {call, get port() {return port;}, get cookie() {return cookie;},
    async create() {const r = await call('/v1/assets', {method: 'POST', body: {name: 'NON_RAW.bin', sha256: sha, size: bytes.length}}); assert.equal(r.status, 201); return r.json;},
    async restart() {await stop(); await start();},
    async cleanup() {await stop(); await rm(dataDir, {recursive: true, force: true});}
  };
}

test('WEB-HTTP01 / LOCAL_QA: Host, Origin, QA header and cookie are required; no production auth claim', async () => {
  const f = await fixture(); try {
    assert.equal((await f.call('/v1/assets', {headers: {Host: 'attacker.invalid'}})).status, 403);
    assert.equal((await f.call('/v1/assets', {headers: {Origin: 'https://attacker.invalid'}})).status, 403);
    assert.equal((await f.call('/v1/assets', {authenticated: false})).status, 401);
    assert.equal((await f.call('/v1/assets', {headers: {'X-Suite-QA': '0'}})).status, 401);
    assert.equal((await f.call('/v1/assets', {headers: {Cookie: 'suite_qa=invalid'}})).status, 401);
    assert.equal((await f.call('/v1/assets')).status, 200);
  } finally {await f.cleanup();}
});

test('WEB-HTTP02 / LOCAL_QA: cross-origin mutation and preflight refuse without inserting an asset', async () => {
  const f = await fixture(); try {
    const body = {name: 'NON_RAW.bin', sha256: sha, size: bytes.length};
    assert.equal((await f.call('/v1/assets', {method: 'POST', body, headers: {Origin: 'http://localhost:1'}})).status, 403);
    assert.equal((await f.call('/v1/assets', {method: 'OPTIONS', authenticated: false, headers: {Origin: 'https://attacker.invalid', 'Access-Control-Request-Method': 'POST'}})).status, 403);
    assert.deepEqual((await f.call('/v1/assets')).json.assets, []);
  } finally {await f.cleanup();}
});

test('WEB-HTTP03 / NON_RAW: verified Original is immutable and explicit-purpose download returns exact bytes', async () => {
  const f = await fixture(); try {
    const asset = await f.create(), path = `/v1/assets/${asset.id}/original`;
    assert.equal((await f.call(path, {method: 'PUT', body: bytes})).status, 200);
    assert.notEqual((await f.call(path, {method: 'PUT', body: Buffer.alloc(bytes.length, 9)})).status, 200);
    assert.equal((await f.call(path)).status, 409);
    const downloaded = await f.call(path + '?purpose=high-precision'); assert.equal(downloaded.status, 200);
    assert.deepEqual(downloaded.data, bytes); assert.equal(createHash('sha256').update(downloaded.data).digest('hex'), sha);
  } finally {await f.cleanup();}
});

test('WEB-HTTP04 / NON_RAW: actual server/SQLite close and reopen retains saved revision and Original', async () => {
  const f = await fixture(); try {
    const asset = await f.create(), path = `/v1/assets/${asset.id}`;
    assert.equal((await f.call(path + '/original', {method: 'PUT', body: bytes})).status, 200);
    const body = recipe({...portrait(asset.id), originalSHA256: sha});
    assert.equal((await f.call(path + '/recipe', {method: 'PUT', body: {expectedRevision: 0, recipe: body}})).status, 200);
    const oldCookie = f.cookie; await f.restart();
    assert.equal((await f.call('/v1/assets', {headers: {Cookie: oldCookie}})).status, 401);
    const restored = (await f.call(path + '/recipe')).json.recipe;
    assert.equal(restored.revision, 1); assert.deepEqual(restored.body, body);
    assert.deepEqual((await f.call(path + '/original?purpose=high-precision')).data, bytes);
  } finally {await f.cleanup();}
});

test('WEB-HTTP05 / LOCAL_QA: CAS and person-geometry reassignment refusals preserve saved current body', async () => {
  const f = await fixture(); try {
    const asset = await f.create(), path = `/v1/assets/${asset.id}/recipe`, body = recipe({...portrait(asset.id), originalSHA256: sha});
    assert.equal((await f.call(path, {method: 'PUT', body: {expectedRevision: 0, recipe: body}})).status, 200);
    assert.equal((await f.call(path, {method: 'PUT', body: {expectedRevision: 0, recipe: body}})).status, 409);
    const altered = structuredClone(body), p = altered.parameters.extendedParameters.portrait;
    [p.targets[0].anchor, p.targets[1].anchor] = [p.targets[1].anchor, p.targets[0].anchor];
    assert.notEqual((await f.call(path, {method: 'PUT', body: {expectedRevision: 1, recipe: altered}})).status, 200);
    const restored = (await f.call(path)).json.recipe; assert.equal(restored.revision, 1); assert.deepEqual(restored.body, body);
  } finally {await f.cleanup();}
});

test('WEB-HTTP06 / NON_RAW: wrong first upload checksum never yields a downloadable verified Original', async () => {
  const f = await fixture(); try {
    const asset = await f.create(), path = `/v1/assets/${asset.id}/original`;
    assert.equal((await f.call(path, {method: 'PUT', body: Buffer.alloc(bytes.length, 9)})).status, 400);
    assert.equal((await f.call(path + '?purpose=high-precision')).status, 409);
    assert.equal((await f.call('/v1/assets')).json.assets[0].cloudSafe, false);
    assert.equal((await f.call(path, {method: 'PUT', body: bytes})).status, 200);
    assert.deepEqual((await f.call(path + '?purpose=high-precision')).data, bytes);
  } finally {await f.cleanup();}
});
