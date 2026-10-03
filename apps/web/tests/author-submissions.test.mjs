import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {AuthorStore} from '../author-store.mjs';
import {recipe, syntheticPixels, ASSET_A} from './fixtures.mjs';

// Real isolated SQLite for submission state. Injected source verifier is explicitly not a photo/backend proof.
const A = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Author A', role: 'author', tenantId: 'trial-a'};
const B = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Author B', role: 'author', tenantId: 'trial-b'};
const ADMIN = {id: 'cccccccc-3333-4333-8333-333333333333', authorName: 'Reviewer', role: 'admin', tenantId: 'trial-admin'};
const SOURCE = 'dddddddd-4444-4444-8444-444444444444';
function input(exposure = 0) {const r = recipe(); r.parameters.exposure = exposure; return {name: 'Portable trial preset', recipe: r, assetID: SOURCE, recipeRevision: 1};}
async function fixture({defaultVerifier = false} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'suite-author-test-')), file = join(directory, 'authors.sqlite'); let denySource = false;
  const verifySource = (actor, source) => {if (denySource || actor.id !== A.id || source.assetID !== SOURCE || source.recipeRevision !== 1) throw Error('TEST_SOURCE_NOT_OWNED_OR_CURRENT');};
  const options = defaultVerifier ? {} : {verifySource}; let store = new AuthorStore(file, options);
  return {get store() {return store;}, deny() {denySource = true;}, restart() {store.close(); store = new AuthorStore(file, options);},
    async cleanup() {store.close(); await rm(directory, {recursive: true, force: true});}};
}

test('TRIAL-AUTHOR01 / SQLITE: default source verifier refuses draft creation and leaves no record', async () => {
  const f = await fixture({defaultVerifier: true}); try {
    assert.throws(() => f.store.createDraft(A, input())); assert.deepEqual(f.store.listDrafts(A), []);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR02 / SQLITE: another author cannot enumerate get edit submit or review a draft', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input()); assert.equal(draft.authorID, A.id); assert.equal(draft.authorName, A.authorName);
    assert.deepEqual(f.store.listDrafts(B), []);
    assert.throws(() => f.store.getDraft(B, draft.id));
    assert.throws(() => f.store.saveDraft(B, draft.id, {...input(1), expectedRevision: draft.revision}));
    assert.throws(() => f.store.submitDraft(B, draft.id, draft.revision));
    assert.throws(() => f.store.listSubmitted(B));
    assert.throws(() => f.store.reviewDraft(B, draft.id, draft.revision, 'ACCEPTED'));
    assert.deepEqual(f.store.getDraft(A, draft.id), draft);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR03 / SQLITE: draft CAS rejects stale updates and source failure retains the preceding draft', async () => {
  const f = await fixture(); try {
    const initial = f.store.createDraft(A, input()), updated = f.store.saveDraft(A, initial.id, {...input(1), expectedRevision: initial.revision});
    assert.equal(updated.revision, initial.revision + 1);
    assert.throws(() => f.store.saveDraft(A, initial.id, {...input(2), expectedRevision: initial.revision}));
    assert.deepEqual(f.store.getDraft(A, initial.id), updated);
    f.deny(); assert.throws(() => f.store.saveDraft(A, initial.id, {...input(2), expectedRevision: updated.revision}));
    assert.deepEqual(f.store.getDraft(A, initial.id), updated);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR04 / SQLITE: submit freezes version while newer draft cannot replace admin review snapshot', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input(1));
    assert.throws(() => f.store.submitDraft(A, draft.id, draft.revision + 1));
    const submitted = f.store.submitDraft(A, draft.id, draft.revision); assert.equal(submitted.status, 'SUBMITTED');
    const snapshot = structuredClone(f.store.listSubmitted(ADMIN));
    const newer = f.store.saveDraft(A, draft.id, {...input(2), expectedRevision: submitted.revision});
    assert.equal(newer.revision, submitted.revision + 1); assert.equal(newer.status, 'DRAFT');
    assert.deepEqual(f.store.listSubmitted(ADMIN), snapshot);
    assert.throws(() => f.store.reviewDraft(A, draft.id, submitted.revision, 'ACCEPTED'));
    assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, submitted.revision + 1, 'ACCEPTED'));
    assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'SILENT_AUTOAPPROVE'));
    assert.equal(f.store.listSubmitted(ADMIN).length, 1);
    const accepted = f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED');
    assert.equal(accepted.draft.status, 'ACCEPTED'); assert.deepEqual(accepted.preset.parameters, submitted.parameters);
    assert.deepEqual(f.store.getDraft(A, draft.id), newer);
    assert.equal(f.store.listPresets(A).length, 1); assert.deepEqual(f.store.listPresets(A), f.store.listPresets(B));
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR05 / SQLITE: accepted portable version is immutable, detached and excludes photo identity/data', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input(1)), submitted = f.store.submitDraft(A, draft.id, draft.revision);
    f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED');
    const before = structuredClone(f.store.listPresets(A)), final = f.store.getDraft(A, draft.id);
    const newer = f.store.saveDraft(A, draft.id, {...input(3), expectedRevision: final.revision});
    assert.equal(newer.revision, final.revision + 1); assert.equal(newer.parameters.exposure, 3);
    assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, final.revision, 'REJECTED'));
    const detached = f.store.listPresets(A); detached[0].name = 'mutated observer';
    assert.deepEqual(f.store.listPresets(A), before);
    assert.equal(JSON.stringify(before).includes(SOURCE), false);
    for (const forbidden of ['originalSHA256', 'originalURL', 'portrait', 'mask', 'proxy']) assert.equal(JSON.stringify(before).includes('"' + forbidden + '"'), false);
    f.restart(); assert.deepEqual(f.store.listPresets(A), before); assert.deepEqual(f.store.getDraft(A, draft.id), newer);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR06 / SQLITE: rejection cannot publish a preset and persists through store restart', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input()), submitted = f.store.submitDraft(A, draft.id, draft.revision);
    f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'REJECTED');
    assert.deepEqual(f.store.listPresets(A), []); f.restart();
    assert.equal(f.store.getDraft(A, draft.id).status, 'REJECTED'); assert.deepEqual(f.store.listPresets(A), []);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR07 / SQLITE_VALIDATION: strict portable recipe rejects photo fields unknown controls and nondefault rotation', async () => {
  const f = await fixture(); try {
    const mutations = [
      x => {x.recipe.assetID = SOURCE;}, x => {x.recipe.parameters.originalURL = '/private/original.raw';},
      x => {x.recipe.parameters.extendedParameters = {portrait: {targets: []}};},
      x => {x.recipe.parameters.extendedParameters = {crop: {}};},
      x => {x.recipe.parameters.extendedParameters = {export: {}};},
      x => {x.recipe.parameters.rotationDegrees = 90;},
      x => {x.recipe.parameters.processingOrder = ['contrast', 'exposure', 'saturation', 'rotation'];},
      x => {x.recipe.parameters.processingOrder.push('crop');},
      x => {x.recipe.parameters.exposure = 4.001;}, x => {x.recipe.parameters.contrast = 2.001;},
      x => {x.recipe.parameters.saturation = -0.001;}, x => {x.recipe.parameters.exposure = NaN;},
      x => {x.recipe.parameters.contrast = Infinity;}, x => {x.recipe.parameters.saturation = '1';}
    ];
    for (const mutate of mutations) {const candidate = input(); mutate(candidate); assert.throws(() => f.store.createDraft(A, candidate));}
    assert.deepEqual(f.store.listDrafts(A), []);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR08 / SQLITE_VALIDATION: allowed endpoint combinations remain exact and do not mutate input', async () => {
  const f = await fixture(); try {
    for (const exposure of [-4, 4]) for (const contrast of [0, 2]) for (const saturation of [0, 2]) {
      const candidate = input(exposure); Object.assign(candidate.recipe.parameters, {contrast, saturation});
      const before = structuredClone(candidate), draft = f.store.createDraft(A, candidate);
      assert.deepEqual(candidate, before); assert.equal(draft.parameters.exposure, exposure);
      assert.equal(draft.parameters.contrast, contrast); assert.equal(draft.parameters.saturation, saturation);
    }
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR09 / SQLITE: rejected source provenance cannot create a record and a valid draft survives restart', async () => {
  const f = await fixture(); try {
    for (const candidate of [{...input(), assetID: 'eeeeeeee-5555-4555-8555-555555555555'}, {...input(), recipeRevision: 2}]) {
      assert.throws(() => f.store.createDraft(A, candidate));
    }
    assert.throws(() => f.store.createDraft(B, input())); assert.deepEqual(f.store.listDrafts(A), []);
    const draft = f.store.createDraft(A, input()); f.restart(); assert.deepEqual(f.store.getDraft(A, draft.id), draft);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR10 / SQLITE: admin cannot approve own submitted version or re-review a terminal decision', async () => {
  const f = await fixture(); try {
    const authorAdmin = {...A, role: 'admin'}, draft = f.store.createDraft(authorAdmin, input());
    const submitted = f.store.submitDraft(authorAdmin, draft.id, draft.revision);
    assert.throws(() => f.store.reviewDraft(authorAdmin, draft.id, submitted.revision, 'ACCEPTED'));
    assert.equal(f.store.listSubmitted(ADMIN)[0].status, 'SUBMITTED'); assert.deepEqual(f.store.listPresets(A), []);
    f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'REJECTED');
    assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED'));
    assert.deepEqual(f.store.listPresets(A), []);
  } finally {await f.cleanup();}
});

function acceptedFixture(store) {
  const draft = store.createDraft(A, input(1)), submitted = store.submitDraft(A, draft.id, draft.revision);
  store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED');
  return store.db.prepare('SELECT * FROM trial_presets').get();
}

test('TRIAL-AUTHOR11 / SQLITE_CORRUPTION: accepted body checksum mismatch refuses read and retains damaged row after reopen', async () => {
  const f = await fixture(); try {
    const row = acceptedFixture(f.store), body = JSON.parse(row.body); body.parameters.exposure = 2;
    const damaged = JSON.stringify(body); f.store.db.prepare('UPDATE trial_presets SET body=? WHERE id=?').run(damaged, row.id);
    assert.throws(() => f.store.listPresets(A));
    assert.equal(f.store.db.prepare('SELECT body FROM trial_presets WHERE id=?').get(row.id).body, damaged);
    f.restart(); assert.throws(() => f.store.listPresets(A));
    assert.equal(f.store.db.prepare('SELECT body FROM trial_presets WHERE id=?').get(row.id).body, damaged);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR12 / SQLITE_CORRUPTION: matching checksum cannot authorize unsafe preset shape range or row identity', async () => {
  const f = await fixture(); try {
    const row = acceptedFixture(f.store), original = JSON.parse(row.body);
    for (const mutate of [b => {b.parameters.exposure = 99;}, b => {b.parameters.portrait = {targets: []};},
      b => {b.assetID = SOURCE;}, b => {b.formatVersion = 999;}, b => {b.id = SOURCE;}, b => {b.version += 1;}]) {
      const body = structuredClone(original); mutate(body); const damaged = JSON.stringify(body), hash = createHash('sha256').update(damaged).digest('hex');
      f.store.db.prepare('UPDATE trial_presets SET body=?,sha256=? WHERE id=?').run(damaged, hash, row.id);
      assert.throws(() => f.store.listPresets(A));
      assert.equal(f.store.db.prepare('SELECT body FROM trial_presets WHERE id=?').get(row.id).body, damaged);
    }
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR13 / SQLITE_CORRUPTION: parse-valid draft body cannot replace row author ID version or portable values', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input()), original = JSON.parse(f.store.db.prepare('SELECT body FROM trial_draft_versions WHERE draft_id=?').get(draft.id).body);
    for (const mutate of [b => {b.authorID = B.id;}, b => {b.id = SOURCE;}, b => {b.revision += 1;},
      b => {b.parameters.saturation = -1;}, b => {b.parameters.originalSHA256 = 'f'.repeat(64);}]) {
      const body = structuredClone(original); mutate(body); const damaged = JSON.stringify(body);
      f.store.db.prepare('UPDATE trial_draft_versions SET body=? WHERE draft_id=? AND revision=?').run(damaged, draft.id, draft.revision);
      assert.throws(() => f.store.getDraft(A, draft.id)); assert.throws(() => f.store.listDrafts(A));
      assert.equal(f.store.db.prepare('SELECT body FROM trial_draft_versions WHERE draft_id=?').get(draft.id).body, damaged);
    }
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR14 / SQLITE_CORRUPTION: damaged submitted JSON cannot be approved or publish a preset; row is preserved', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input()), submitted = f.store.submitDraft(A, draft.id, draft.revision);
    const row = f.store.db.prepare('SELECT * FROM trial_submissions WHERE draft_id=?').get(draft.id), body = JSON.parse(row.body);
    body.parameters.exposure = 99; const damaged = JSON.stringify(body);
    f.store.db.prepare('UPDATE trial_submissions SET body=? WHERE draft_id=?').run(damaged, draft.id);
    assert.throws(() => f.store.listSubmitted(ADMIN)); assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED'));
    assert.deepEqual(f.store.listPresets(A), []);
    const after = f.store.db.prepare('SELECT * FROM trial_submissions WHERE draft_id=?').get(draft.id);
    assert.equal(after.body, damaged); assert.equal(after.status, 'SUBMITTED'); assert.equal(after.reviewer, null);
    assert.equal(f.store.getDraft(A, draft.id).status, 'SUBMITTED');
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR15 / SQLITE_CORRUPTION: an in-range altered submission cannot replace its saved immutable version', async () => {
  const f = await fixture(); try {
    const draft = f.store.createDraft(A, input(0)), submitted = f.store.submitDraft(A, draft.id, draft.revision);
    const before = f.store.getDraft(A, draft.id), body = JSON.parse(f.store.db.prepare('SELECT body FROM trial_submissions WHERE draft_id=?').get(draft.id).body);
    body.parameters.exposure = 1; const damaged = JSON.stringify(body);
    f.store.db.prepare('UPDATE trial_submissions SET body=? WHERE draft_id=?').run(damaged, draft.id);
    assert.throws(() => f.store.listSubmitted(ADMIN)); assert.throws(() => f.store.reviewDraft(ADMIN, draft.id, submitted.revision, 'ACCEPTED'));
    assert.deepEqual(f.store.listPresets(A), []); assert.deepEqual(f.store.getDraft(A, draft.id), before);
    assert.equal(f.store.db.prepare('SELECT body FROM trial_submissions WHERE draft_id=?').get(draft.id).body, damaged);
  } finally {await f.cleanup();}
});

async function httpFixture() {
  const {createTrialServer} = await import('../trial-server.mjs'), dataDir = await mkdtemp(join(tmpdir(), 'suite-author-http-'));
  let context, port, now = Date.parse('2026-10-03T08:00:00.000Z');
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
  await start(); return {call, get context() {return context;}, advance(ms) {now += ms;},
    async login(authorName, role = 'author') {const author = context.auth.createAuthor({authorName, role, trialEndsAt: '2026-11-03T08:00:00.000Z'}), invite = context.auth.issueInvite(author.id);
      const response = await call('/trial/login', {method: 'POST', body: {inviteToken: invite.inviteToken}}); assert.equal(response.status, 200);
      return {author, cookie: response.headers['set-cookie'][0].split(';')[0]};},
    async source(signed, exposure = 0, upload = true) {
      const bytes = Buffer.from('NON_RAW author HTTP fixture ' + signed.author.id), sha256 = createHash('sha256').update(bytes).digest('hex');
      const registered = await call('/v1/assets', {method: 'POST', cookie: signed.cookie, body: {name: 'NON_RAW.bin', sha256, size: bytes.length}});
      assert.equal(registered.status, 201); const assetID = registered.json.id, r = recipe(); r.parameters.exposure = exposure;
      if (upload) assert.equal((await call(`/v1/assets/${assetID}/original`, {method: 'PUT', cookie: signed.cookie, body: bytes})).status, 200);
      assert.equal((await call(`/v1/assets/${assetID}/recipe`, {method: 'PUT', cookie: signed.cookie, body: {expectedRevision: 0, recipe: r}})).status, 200);
      return {assetID, recipe: r, recipeRevision: 1, bytes};
    },
    async restart() {await stop(); await start();}, async cleanup() {await stop(); await rm(dataDir, {recursive: true, force: true});}};
}
const draftInput = source => ({name: 'HTTP portable preset', recipe: source.recipe, assetID: source.assetID, recipeRevision: source.recipeRevision});

test('TRIAL-AUTHOR16 / HTTP_NON_RAW: source must be owned verified current and exactly match submitted global parameters', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('A'), b = await f.login('B'), source = await f.source(a, 1), notUploaded = await f.source(a, 0, false);
    assert.ok((await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: draftInput(notUploaded)})).status >= 400);
    assert.equal((await f.call('/trial/drafts', {method: 'POST', cookie: b.cookie, body: draftInput(source)})).status, 404);
    for (const invalid of [{...draftInput(source), recipeRevision: 2}, {...draftInput(source), recipe: recipe()},
      {...draftInput(source), authorID: b.author.id}, {...draftInput(source), role: 'admin'}]) {
      assert.equal((await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: invalid})).status, 400);
    }
    assert.deepEqual((await f.call('/trial/drafts', {cookie: a.cookie})).json.drafts, []);
    const created = await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: draftInput(source)});
    assert.equal(created.status, 201); assert.equal(created.json.authorID, a.author.id); assert.equal(created.json.parameters.exposure, 1);
    assert.deepEqual((await f.call(`/v1/assets/${source.assetID}/original?purpose=high-precision`, {cookie: a.cookie})).data, source.bytes);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR17 / HTTP_SQLITE: owner CAS submit admin adoption and shared immutable version survive restart', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('Author A'), b = await f.login('Author B'), admin = await f.login('Reviewer', 'admin');
    const source = await f.source(a, 1), other = await f.source(b, 0);
    const created = await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: draftInput(source)});
    assert.equal(created.status, 201); const id = created.json.id, path = `/trial/drafts/${id}`;
    assert.equal((await f.call(path, {cookie: b.cookie})).status, 404);
    assert.equal((await f.call(path, {method: 'PUT', cookie: b.cookie, body: {...draftInput(other), expectedRevision: 1}})).status, 404);
    assert.equal((await f.call(path + '/submit', {method: 'POST', cookie: b.cookie, body: {expectedRevision: 1}})).status, 404);
    assert.equal((await f.call('/trial/submissions', {cookie: a.cookie})).status, 403);
    const newerRecipe = structuredClone(source.recipe); newerRecipe.parameters.exposure = 2;
    assert.equal((await f.call(`/v1/assets/${source.assetID}/recipe`, {method: 'PUT', cookie: a.cookie, body: {expectedRevision: 1, recipe: newerRecipe}})).status, 200);
    assert.equal((await f.call(path + '/submit', {method: 'POST', cookie: a.cookie, body: {expectedRevision: 1}})).status, 400, 'stale source revision must refuse submission');
    const updatedInput = {name: 'Updated source-backed preset', recipe: newerRecipe, assetID: source.assetID, recipeRevision: 2};
    const updated = await f.call(path, {method: 'PUT', cookie: a.cookie, body: {...updatedInput, expectedRevision: 1}});
    assert.equal(updated.status, 200); assert.equal(updated.json.revision, 2);
    assert.equal((await f.call(path, {method: 'PUT', cookie: a.cookie, body: {...updatedInput, expectedRevision: 1}})).status, 409);
    assert.equal((await f.call(path + '/submit', {method: 'POST', cookie: a.cookie, body: {expectedRevision: 2}})).status, 200);
    const pending = await f.call('/trial/submissions', {cookie: admin.cookie}); assert.equal(pending.status, 200);
    assert.equal(pending.json.submissions.length, 1); assert.equal(pending.json.submissions[0].revision, 2);
    assert.equal((await f.call(path + '/review', {method: 'POST', cookie: a.cookie, body: {expectedRevision: 2, decision: 'ACCEPTED'}})).status, 403);
    const accepted = await f.call(path + '/review', {method: 'POST', cookie: admin.cookie, body: {expectedRevision: 2, decision: 'ACCEPTED'}});
    assert.equal(accepted.status, 200); assert.equal(accepted.json.preset.parameters.exposure, 2);
    const presets = (await f.call('/trial/presets', {cookie: b.cookie})).json.presets;
    assert.equal(presets.length, 1); assert.equal(JSON.stringify(presets).includes(source.assetID), false);
    assert.equal((await f.call(path, {method: 'PUT', cookie: a.cookie, body: {...updatedInput, name: 'Later draft', expectedRevision: 2}})).status, 200);
    await f.restart();
    assert.deepEqual((await f.call('/trial/presets', {cookie: a.cookie})).json.presets, presets);
    assert.deepEqual((await f.call('/trial/presets', {cookie: b.cookie})).json.presets, presets);
    assert.equal((await f.call(path, {cookie: a.cookie})).json.revision, 3);
    assert.equal((await f.call(path, {cookie: b.cookie})).status, 404);
    assert.deepEqual((await f.call('/trial/submissions', {cookie: admin.cookie})).json.submissions, []);
    assert.deepEqual((await f.call(`/v1/assets/${source.assetID}/original?purpose=high-precision`, {cookie: a.cookie})).data, source.bytes);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR18 / HTTP_INJECTED_STORAGE_FAULT: failed source inspection cannot overwrite durable draft or Original', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('A'), source = await f.source(a, 1);
    const created = await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: draftInput(source)}); assert.equal(created.status, 201);
    const path = `/trial/drafts/${created.json.id}`, inspect = f.context.storage.inspect;
    f.context.storage.inspect = async () => {throw Error('INJECTED_STORAGE_UNAVAILABLE');};
    const refused = await f.call(path, {method: 'PUT', cookie: a.cookie, body: {...draftInput(source), name: 'Must not persist', expectedRevision: 1}});
    assert.equal(refused.status, 503); f.context.storage.inspect = inspect;
    assert.deepEqual((await f.call(path, {cookie: a.cookie})).json, created.json);
    assert.deepEqual((await f.call(`/v1/assets/${source.assetID}/original?purpose=high-precision`, {cookie: a.cookie})).data, source.bytes);
  } finally {await f.cleanup();}
});

test('TRIAL-AUTHOR19 / PURE_ADAPTER: author UI reuses strict external contract without silently stripping photo-local edits', async () => {
  const {globalPresetRecipe} = await import('../src/author-ui.mjs');
  const {portablePresetRecipe} = await import('../src/preset-author/preset-author-contract.mjs');
  assert.equal(globalPresetRecipe, portablePresetRecipe);
  const current = recipe(); current.parameters.exposure = 1; const before = structuredClone(current), output = globalPresetRecipe(current);
  assert.deepEqual(current, before); assert.equal(output.parameters.exposure, 1); assert.deepEqual(output.parameters.extendedParameters, {});
  for (const mutate of [p => {p.rotationDegrees = 90;}, p => {p.extendedParameters = {portrait: {}};},
    p => {p.extendedParameters = {crop: {}};}, p => {p.originalSHA256 = 'a'.repeat(64);}]) {
    const candidate = recipe(); mutate(candidate.parameters); const saved = structuredClone(candidate);
    assert.throws(() => globalPresetRecipe(candidate)); assert.deepEqual(candidate, saved);
  }
});

async function editorFixture(current = recipe()) {
  const {EditorSession, checksum} = await import('../src/session.mjs');
  const {renderPixels} = await import('../src/processing/pure.mjs');
  const {validateRecipe} = await import('../../../dist/apps/backend/src/photo-policy.js');
  const {resolutionAssessment} = await import('../../../dist/apps/backend/src/crop-export.js');
  const original = new TextEncoder().encode('NON_RAW preset application fixture').buffer, pixels = syntheticPixels(10, 10);
  const asset = {id: ASSET_A, name: 'NON_RAW.bin', sha256: await checksum(original), size: original.byteLength};
  const records = new Map([[ASSET_A, {asset, proxy: pixels, history: [structuredClone(current)], cursor: 0, revision: 1, reference: null, dirty: false}]]);
  const calls = {persist: 0, render: 0}; let rendered;
  const processing = {encode: async p => new Blob([p.data]), render: async (p, doc) => {calls.render++; rendered = renderPixels(p, doc, {validateRecipe, resolutionAssessment}); return rendered;}};
  const api = {listAssets: async () => [asset], getRecipe: async () => ({revision: 1, body: structuredClone(current)})};
  const storage = {get: async id => structuredClone(records.get(id)), put: async (id, value) => {calls.persist++; records.set(id, structuredClone(value));}};
  let id = 0; const session = new EditorSession({api, processing, storage, urlAPI: {createObjectURL: () => 'blob:synthetic-' + ++id, revokeObjectURL() {}}});
  await session.initialize(); await session.openAsset(ASSET_A);
  return {session, api, processing, calls, pixels, original, records, get rendered() {return rendered;}};
}

test('TRIAL-AUTHOR20 / SYNTHETIC_SESSION: portable application is one history edit, preserves local rotation and supports exact Undo/Redo', async () => {
  const current = recipe(); current.parameters.rotationDegrees = 90;
  const f = await editorFixture(current), {session, calls, pixels, original} = f, beforePixels = pixels.data.slice(), beforeOriginal = original.slice(0);
  const parameters = {exposure: 1, contrast: 1.5, saturation: 0.5}, before = session.state.recipe, count = session.history.length;
  calls.persist = 0; calls.render = 0; await session.applyPortablePreset(parameters);
  const applied = session.state.recipe, afterPixels = f.rendered.data.slice();
  assert.equal(session.history.length, count + 1); assert.equal(calls.persist, 1); assert.equal(calls.render, 1);
  assert.equal(applied.parameters.rotationDegrees, 90); assert.equal(applied.parameters.exposure, 1); assert.equal(session.state.dirty, true);
  assert.deepEqual(parameters, {exposure: 1, contrast: 1.5, saturation: 0.5});
  await session.undo(); assert.deepEqual(session.state.recipe, before);
  await session.redo(); assert.deepEqual(session.state.recipe, applied); assert.deepEqual(f.rendered.data, afterPixels);
  assert.deepEqual(pixels.data, beforePixels); assert.deepEqual(original, beforeOriginal);
});

test('TRIAL-AUTHOR21 / SYNTHETIC_SESSION: preset endpoints accepted but unknown photo fields refuse without partial history', async () => {
  const {session, calls} = await editorFixture();
  for (const exposure of [-4, 4]) for (const contrast of [0, 2]) for (const saturation of [0, 2]) {
    await session.applyPortablePreset({exposure, contrast, saturation});
    assert.equal(session.state.recipe.parameters.exposure, exposure); assert.equal(session.state.recipe.parameters.contrast, contrast);
    assert.equal(session.state.recipe.parameters.saturation, saturation);
  }
  for (const extra of [{rotationDegrees: 90}, {extendedParameters: {portrait: {targets: []}}}, {processingOrder: []},
    {assetID: ASSET_A}, {originalSHA256: 'a'.repeat(64)}, {exposure: 4.001}, {contrast: -1}, {saturation: NaN}]) {
    const before = session.state.recipe, history = structuredClone(session.history), persisted = calls.persist;
    await assert.rejects(session.applyPortablePreset({exposure: 0, contrast: 1, saturation: 1, ...extra}));
    assert.deepEqual(session.state.recipe, before); assert.deepEqual(session.history, history); assert.equal(calls.persist, persisted);
  }
});

test('TRIAL-AUTHOR22 / SYNTHETIC_SESSION: applying globals to ordered subset restores canonical order rather than reversing stages', async () => {
  for (const order of [[], ['rotation'], ['exposure', 'rotation'], ['contrast', 'rotation']]) {
    const current = recipe(); current.parameters.processingOrder = order; const {session} = await editorFixture(current);
    await session.applyPortablePreset({exposure: 1, contrast: 1.5, saturation: 0.5});
    assert.deepEqual(session.state.recipe.parameters.processingOrder, order.includes('rotation')
      ? ['exposure', 'contrast', 'saturation', 'rotation'] : ['exposure', 'contrast', 'saturation']);
    assert.ok(session.state.afterURL);
  }
});

test('TRIAL-AUTHOR23 / SYNTHETIC_PERMISSION: expired edit preserves dirty recipe history cache and Original without rendering', async () => {
  const f = await editorFixture(); await f.session.setAdjustment('exposure', 1);
  const state = f.session.state, history = structuredClone(f.session.history), cached = structuredClone(f.records.get(ASSET_A));
  const original = f.original.slice(0), calls = {...f.calls};
  f.api.assertPermission = async (id, action) => {assert.equal(id, ASSET_A); assert.equal(action, 'edit'); throw Error('TRIAL_EXPIRED');};
  await assert.rejects(f.session.setAdjustment('exposure', 2), /TRIAL_EXPIRED/);
  assert.deepEqual(f.session.state.recipe, state.recipe); assert.equal(f.session.state.dirty, true);
  assert.deepEqual(f.session.history, history); assert.deepEqual(f.records.get(ASSET_A), cached);
  assert.deepEqual(f.calls, calls); assert.deepEqual(f.original, original);
  assert.equal(f.session.state.afterURL, state.afterURL); assert.equal(f.session.state.busy, null);
  assert.equal(f.session.state.selectedPersonID, null); assert.deepEqual(f.session.state.people, []);
});

test('TRIAL-AUTHOR24 / SYNTHETIC_PERMISSION: pending live authorization blocks overlapping edits before persistence', async () => {
  const f = await editorFixture(); let release;
  f.api.assertPermission = () => new Promise(resolve => {release = resolve;});
  const count = f.session.history.length, first = f.session.setAdjustment('exposure', 1);
  assert.equal(f.session.state.busy, 'permission'); assert.equal(f.calls.persist, 0);
  await assert.rejects(f.session.setAdjustment('contrast', 1.5), /OPERATION_IN_PROGRESS/);
  release(); await first;
  assert.equal(f.session.history.length, count + 1); assert.equal(f.session.state.recipe.parameters.exposure, 1);
  assert.equal(f.session.state.recipe.parameters.contrast, 1); assert.equal(f.calls.persist, 1);
});

test('TRIAL-AUTHOR25 / SYNTHETIC_FINAL_PERMISSION: expiry after fake encoding prevents output release and preserves saved data', async () => {
  const f = await editorFixture(), before = structuredClone(f.records.get(ASSET_A)), original = f.original.slice(0);
  let permissionCalls = 0, fetches = 0, encodes = 0, expired = false;
  f.api.assertPermission = async (id, action) => {assert.equal(id, ASSET_A); assert.equal(action, 'export'); permissionCalls++; if (expired) throw Error('TRIAL_EXPIRED');};
  f.api.getOriginal = async () => {fetches++; return f.original.slice(0);};
  // Explicit NON_RAW fake decoder/encoder: only session control flow is exercised.
  f.processing.decodeRaw = async () => ({pixels: structuredClone(f.pixels), provenance: 'SYNTHETIC_NON_RAW_TEST_ONLY'});
  f.processing.encode = async p => {encodes++; expired = true; return new Blob([p.data]);};
  await assert.rejects(f.session.exportFinal(), /TRIAL_EXPIRED/);
  assert.equal(permissionCalls, 2); assert.equal(fetches, 1); assert.equal(encodes, 1);
  assert.equal(f.session.state.exporting, false); assert.deepEqual(f.records.get(ASSET_A), before);
  assert.deepEqual(f.original, original); assert.equal(f.session.state.dirty, false);
  assert.equal(f.session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status.startsWith('PASS')), false);
  assert.ok(f.session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status === 'REJECT' && e.reason === 'TRIAL_EXPIRED'));
});

test('TRIAL-AUTHOR26 / HTTP_SQLITE_TRIAL_CLOCK_NON_RAW: expired author loses access while Original draft and submission remain intact after restart', async () => {
  const f = await httpFixture(); try {
    const a = await f.login('Expiring author'), admin = await f.login('Active reviewer', 'admin'), source = await f.source(a, 1);
    const created = await f.call('/trial/drafts', {method: 'POST', cookie: a.cookie, body: draftInput(source)});
    assert.equal(created.status, 201); const id = created.json.id, path = `/trial/drafts/${id}`;
    assert.equal((await f.call(path + '/submit', {method: 'POST', cookie: a.cookie, body: {expectedRevision: 1}})).status, 200);
    const draft = f.context.authors.getDraft(a.author, id), submissions = f.context.authors.listSubmitted(admin.author);
    const asset = f.context.repo.get(a.author.tenantId, source.assetID), recipeBefore = f.context.repo.latestRecipe(a.author.tenantId, source.assetID);
    f.context.auth.setTrialEnd(a.author.id, '2026-10-03T08:00:00.500Z'); f.advance(500);
    for (const [endpoint, options] of [[path, {}], [path + '/submit', {method: 'POST', body: {expectedRevision: 1}}],
      [`/v1/assets/${source.assetID}/original?purpose=high-precision`, {}]]) {
      const denied = await f.call(endpoint, {cookie: a.cookie, ...options}); assert.equal(denied.status, 403); assert.equal(denied.json.error, 'TRIAL_EXPIRED');
    }
    await f.restart();
    assert.deepEqual(f.context.authors.getDraft(a.author, id), draft);
    assert.deepEqual(f.context.authors.listSubmitted(admin.author), submissions);
    assert.deepEqual(f.context.repo.latestRecipe(a.author.tenantId, source.assetID), recipeBefore);
    const retained = await f.context.storage.inspect(asset.originalKey);
    assert.equal(retained.persisted, true); assert.equal(retained.sha256, createHash('sha256').update(source.bytes).digest('hex'));
    assert.equal((await f.call(path, {cookie: a.cookie})).status, 403);
  } finally {await f.cleanup();}
});
