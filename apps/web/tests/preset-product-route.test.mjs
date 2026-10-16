import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createTrialServer} from '../trial-server.mjs';
import {recipe} from './fixtures.mjs';

// Exercise the shipped loopback Trial server. In particular, do not inject
// WorkspaceHTTP into suiteServer: that would create a test-only product route.
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-preset-product-route-'));
  let now = Date.parse('2026-10-03T08:00:00Z');
  const context = await createTrialServer({dataDir, port: 0, clock: () => now});
  await new Promise((resolve, reject) => {
    context.server.once('error', reject);
    context.server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${context.server.address().port}`;
  async function call(path, {method = 'GET', cookie, body} = {}) {
    const headers = {'X-Suite-Trial': '1'};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = body instanceof Uint8Array ? 'application/octet-stream' : 'application/json';
    const response = await fetch(origin + path, {method, headers, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body)});
    const data = await response.arrayBuffer();
    let json;
    try { json = JSON.parse(Buffer.from(data).toString()); } catch {}
    return {status: response.status, json, cookie: response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function login(name, role = 'author') {
    const author = context.auth.createAuthor({authorName: name, role, trialEndsAt: '2026-11-03T08:00:00Z'});
    const invite = context.auth.issueInvite(author.id);
    const response = await call('/trial/login', {method: 'POST', body: {inviteToken: invite.inviteToken}});
    assert.equal(response.status, 200);
    return {author, cookie: response.cookie};
  }
  async function source(owner) {
    const bytes = Buffer.from(`non-RAW preset route source ${owner.author.id}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const created = await call('/v1/assets', {method: 'POST', cookie: owner.cookie, body: {name: 'source.bin', sha256, size: bytes.length}});
    assert.equal(created.status, 201);
    const assetID = created.json.id;
    assert.equal((await call(`/v1/assets/${assetID}/original`, {method: 'PUT', cookie: owner.cookie, body: bytes})).status, 200);
    const savedRecipe = recipe();
    savedRecipe.parameters.exposure = 1;
    assert.equal((await call(`/v1/assets/${assetID}/recipe`, {method: 'PUT', cookie: owner.cookie, body: {expectedRevision: 0, recipe: savedRecipe}})).status, 200);
    return {assetID, savedRecipe};
  }
  return {call, login, source, advance: ms => {now += ms;}, async close() {
    await new Promise((resolve, reject) => context.server.close(error => error ? reject(error) : resolve()));
    await rm(dataDir, {recursive: true, force: true});
  }};
}

test('PRESET-PRODUCT-ROUTE01 / shipped Trial HTTP has Author publication, not Workspace or Community preset mutation routes', async () => {
  const f = await fixture();
  try {
    const author = await f.login('Author');
    assert.deepEqual((await f.call('/trial/presets', {cookie: author.cookie})).json.presets, []);
    assert.equal((await f.call('/trial/presets', {method: 'POST', cookie: author.cookie, body: {scope: 'PERSONAL'}})).status, 404);
    assert.equal((await f.call('/v1/workspaces/example/presets', {cookie: author.cookie})).status, 404);
    assert.equal((await f.call('/v1/workspaces/example/presets', {method: 'POST', cookie: author.cookie, body: {scope: 'WORKSPACE'}})).status, 404);
    assert.equal((await f.call('/trial/presets', {cookie: 'suite_trial=invalid'})).status, 401);
  } finally {await f.close();}
});

test('PRESET-PRODUCT-ROUTE02 / real Trial HTTP+SQLite Author Save and Reload require own source, other reviewer, live session', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other'), admin = await f.login('Reviewer', 'admin');
    const {assetID, savedRecipe} = await f.source(owner);
    const input = {name: 'Route audit look', recipe: savedRecipe, assetID, recipeRevision: 1};
    assert.equal((await f.call('/trial/drafts', {method: 'POST', cookie: other.cookie, body: input})).status, 404);
    const created = await f.call('/trial/drafts', {method: 'POST', cookie: owner.cookie, body: input});
    assert.equal(created.status, 201);
    const id = created.json.id;
    assert.equal((await f.call(`/trial/drafts/${id}`, {cookie: other.cookie})).status, 404);
    assert.equal((await f.call(`/trial/drafts/${id}/submit`, {method: 'POST', cookie: owner.cookie, body: {expectedRevision: 1}})).status, 200);
    assert.equal((await f.call(`/trial/drafts/${id}/review`, {method: 'POST', cookie: owner.cookie, body: {decision: 'ACCEPTED', expectedRevision: 1}})).status, 403);
    const accepted = await f.call(`/trial/drafts/${id}/review`, {method: 'POST', cookie: admin.cookie, body: {decision: 'ACCEPTED', expectedRevision: 1}});
    assert.equal(accepted.status, 200);
    const list = await f.call('/trial/presets', {cookie: other.cookie});
    assert.equal(list.status, 200);
    assert.equal(list.json.presets.length, 1);
    assert.equal(list.json.presets[0].parameters.exposure, 1);
    assert.equal(JSON.stringify(list.json.presets).includes(assetID), false);
    f.advance(32 * 24 * 60 * 60 * 1000);
    assert.match(String((await f.call('/trial/presets', {cookie: other.cookie})).status), /^(401|403)$/, 'expired session or trial must lose preset access');
  } finally {await f.close();}
});
