import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {handleRequest} from '../src/worker.mjs';

// Executable Worker + SQLite D1 double, not deployed Cloudflare/D1/R2 or RAW QA.
class D1Double {
  constructor() {this.db = new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');}
  prepare(sql) {const owner = this;return {bind(...args) {return {
    first: async () => owner.db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: owner.db.prepare(sql).all(...args)}),
    run: async () => ({meta: {changes: Number(owner.db.prepare(sql).run(...args).changes)}}),
  };}};}
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {const result = [];for (const statement of statements) result.push(await statement.run());
      this.db.exec('COMMIT');return result;}
    catch (error) {this.db.exec('ROLLBACK');throw error;}
  }
  close() {this.db.close();}
}

const sha = 'a'.repeat(64);
const add = () => ({operation: 'ADD', path: [{u: .5, v: .5}],
  radiusFraction: .12, hardness: 1});
const recipe = (assetID, originalSHA256 = sha) => ({schemaVersion: 1,
  parameters: {exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
    extendedParameters: {bwEdgeManual: {schemaVersion: 1,
      engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
      binding: {assetID, originalSHA256, sourceWidth: 16, sourceHeight: 16},
      subjectStrokes: [add()], correctionStrokes: [add()]}}}});

async function setup() {
  const DB = new D1Double();
  for (const file of (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter(name => /^\d{4}_.*\.sql$/.test(name)).sort())
    DB.db.exec(await readFile(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const now = Date.parse('2026-10-03T09:00:00Z');
  const member = name => {
    const id = randomUUID(), user = 'platform-' + id, email = name + '@example.test';
    DB.db.prepare('INSERT INTO site_members(id,user_id,email,credit_name,role,active,invite_expires,created_at,trial_ends_at) VALUES(?,?,?,?,?,1,?,?,?)')
      .run(id, user, email, name, 'author', now + 60_000, new Date(now).toISOString(),
        now + 86_400_000);
    return {id, user, email};
  };
  const alice = member('alice'), bob = member('bob'), assetID = randomUUID();
  DB.db.prepare('INSERT INTO assets(id,tenant_id,name,original_key,sha256,size) VALUES(?,?,?,?,?,?)')
    .run(assetID, 'trial-' + alice.id, 'synthetic.bin', 'original-' + assetID, sha, 16);
  const env = {DB, BUCKET: {}, SUITE_TRUST_SITES_DISPATCH: '1',
    SUITE_ALLOWED_ORIGIN: 'https://suite.test', __testNow: now,
    SUITE_TRIAL_STORAGE_LIMIT_BYTES: '2147483648',
    SUITE_TRIAL_R2_WRITE_LIMIT_MONTH: '10000', SUITE_TRIAL_R2_READ_LIMIT_MONTH: '100000',
    SUITE_TRIAL_REQUEST_LIMIT_DAY: '10000'};
  async function call({actor = alice, method = 'GET', body} = {}) {
    const request = new Request(`https://suite.test/v1/assets/${assetID}/recipe`,
      {method, headers: {'X-Suite-Trial': '1',
        'oai-authenticated-user-id': actor.user,
        'oai-authenticated-user-email': actor.email,
        ...(method === 'GET' ? {} : {Origin: 'https://suite.test',
          'Content-Type': 'application/json'})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const response = await handleRequest(request, env);
    return {status: response.status, body: await response.json()};
  }
  return {DB, alice, bob, assetID, call, close: () => DB.close()};
}

test('BW-CLOUD-01: tenant, Asset/SHA binding and CAS guard the Worker save and reload', async () => {
  const f = await setup();
  try {
    const good = recipe(f.assetID);
    assert.equal((await f.call({actor: f.bob})).status, 404);
    assert.equal((await f.call({actor: f.bob, method: 'PUT',
      body: {expectedRevision: 0, recipe: good}})).status, 404);
    for (const bad of [recipe(randomUUID()), recipe(f.assetID, 'b'.repeat(64))]) {
      const refused = await f.call({method: 'PUT', body: {expectedRevision: 0, recipe: bad}});
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error, 'INVALID_BW_EDGE_MANUAL_BINDING');
    }
    assert.equal((await f.call()).body.recipe, null);
    const saved = await f.call({method: 'PUT', body: {expectedRevision: 0, recipe: good}});
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.deepEqual((await f.call()).body.recipe.body, good);
    assert.equal((await f.call({method: 'PUT',
      body: {expectedRevision: 0, recipe: good}})).status, 409);
  } finally {f.close();}
});

test('BW-CLOUD-02: RAW SHA exchange and damaged earlier history fail closed', async () => {
  const f = await setup();
  try {
    const good = recipe(f.assetID);
    assert.equal((await f.call({method: 'PUT',
      body: {expectedRevision: 0, recipe: good}})).status, 200);
    assert.equal((await f.call({method: 'PUT',
      body: {expectedRevision: 1, recipe: good}})).status, 200);
    f.DB.db.prepare('UPDATE assets SET sha256=? WHERE id=?').run('b'.repeat(64), f.assetID);
    assert.equal((await f.call()).status, 400);
    assert.equal((await f.call({method: 'PUT',
      body: {expectedRevision: 2, recipe: good}})).status, 400);
    assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM recipes WHERE asset_id=?')
      .get(f.assetID).n, 2);
    f.DB.db.prepare('UPDATE assets SET sha256=? WHERE id=?').run(sha, f.assetID);
    f.DB.db.prepare('UPDATE recipes SET body=? WHERE asset_id=? AND revision=1')
      .run(JSON.stringify(recipe(randomUUID())), f.assetID);
    assert.equal((await f.call()).status, 400);
    assert.equal((await f.call({method: 'PUT',
      body: {expectedRevision: 2, recipe: good}})).status, 400);
  } finally {f.close();}
});
