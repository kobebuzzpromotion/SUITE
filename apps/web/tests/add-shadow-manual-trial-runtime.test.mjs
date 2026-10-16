import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {runTrialManualAddShadow,
  prepareTrialManualAddShadowRender} from '../src/add-shadow-manual-trial-runtime.mjs';
import {recipe} from './fixtures.mjs';

// Synthetic non-RAW HTTP/SQLite Originals. This test cannot claim real
// LibRaw decode, successful matte/Worker pixels, RAW quality or Cloud Final.
const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const bytes = n => Uint8Array.from({length: 32}, (_, i) => (n + i) % 256).buffer;
const sha = input => createHash('sha256').update(new Uint8Array(input)).digest('hex');
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-shadow-trial-run-'));
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
    let intercept;
    const client = new TrialClient({baseURL, fetcher: (url, init) => {
      const request = {...init, headers: {...init.headers, Cookie: cookie}};
      return intercept ? intercept(url, request, () => fetch(url, request)) :
        fetch(url, request);
    }});
    return {client, author, intercept(fn) {intercept = fn;}};
  }
  async function create(client, name, original) {
    const asset = await client.createAsset({name: `${name}.dng`, sha256: sha(original),
      size: original.byteLength});
    await client.putOriginal(asset.id, original);
    return asset;
  }
  return {context, login, create, advance(ms) {now += ms;},
    async cleanup() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) || !target.split(sep).at(-1).startsWith('suite-shadow-trial-run-'))
        throw Error('SHADOW_TRIAL_FIXTURE_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}
function manual(source, backdrop) {
  return {schemaVersion: 1, engineVersion: ADD_SHADOW_VERSION,
    binding: {assetID: source.id, originalSHA256: source.sha256,
      sourceWidth: 4, sourceHeight: 4,
      backdropID: backdrop.id, backdropSHA256: backdrop.sha256},
    subjectStrokes: [{operation: 'ADD', path: [{u: .5, v: .5}],
      radiusFraction: .2, hardness: 1}],
    settings: {mode: 'drop', opacity: 70, blur: 1, gradient: 0,
      blend: 'normal', offsetX: 2, offsetY: 1, shadowColor: [0, 0, 0]}};
}
async function pair(f, client) {
  const source = await f.create(client, 'source', bytes(11));
  const backdrop = await f.create(client, 'backdrop', bytes(91));
  const document = manual(source, backdrop);
  const saved = recipe();
  saved.parameters.extendedParameters.addShadowManual = document;
  const result = await client.saveRecipe(source.id, 0, saved);
  assert.equal(result.revision, 1);
  return {source, backdrop, document,
    options: {api: client, document, selectedBackdropID: backdrop.id,
      savedRevision: 1, target: 'proxy', ownerConfirmed: true}};
}

test('SHADOW-TRIAL-RUN01 / REAL_HTTP_SQLITE_SYNTHETIC_NON_RAW: saved typed document and fresh two-Asset gates reach only real decoder', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const p = await pair(f, client);
    let reads = 0, permissions = 0;
    const original = client.getOriginal.bind(client), authorize = client.assertPermission.bind(client);
    client.getOriginal = (...args) => {reads++; return original(...args);};
    client.assertPermission = (...args) => {permissions++; return authorize(...args);};
    await assert.rejects(runTrialManualAddShadow(p.options), /BROWSER_WORKER_UNAVAILABLE/);
    assert.ok(reads >= 3, 'target Gate plus two-Asset backdrop Gate read real Originals');
    assert.ok(permissions >= 3, 'fresh target edit and both-Asset permissions ran');
    assert.deepEqual((await client.getRecipe(p.source.id)).body.parameters.extendedParameters.addShadowManual,
      p.document);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-RENDER01 / REAL_HTTP_SQLITE_SYNTHETIC_NON_RAW: draft Preview pins base revision while Final requires the exact saved document', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const p = await pair(f, client);
    const changed = {...p.document, settings: {...p.document.settings, opacity: 15}};
    await assert.rejects(prepareTrialManualAddShadowRender({...p.options,
      document: changed, mode: 'saved'}), /SAVED_DOCUMENT_CHANGED/);
    await assert.rejects(prepareTrialManualAddShadowRender({...p.options,
      document: changed, mode: 'draft'}), /BROWSER_WORKER_UNAVAILABLE/);
    await assert.rejects(prepareTrialManualAddShadowRender({...p.options,
      document: changed, mode: 'draft', target: 'source'}), /RENDER_INPUT_INVALID/);
    await assert.rejects(prepareTrialManualAddShadowRender({...p.options,
      document: changed, mode: 'draft', savedRevision: 2}), /REVISION_CONFLICT/);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-RUN02: forged authority, other selection and unconfirmed owner refuse before external processing', async () => {
  const f = await fixture();
  try {
    const {client} = await f.login('Owner');
    const p = await pair(f, client);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      selectedBackdropID: randomUUID()}), /BACKDROP_SELECTION_MISMATCH/);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      ownerConfirmed: false}), /INPUT_INVALID/);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      pixelsSHA256: 'a'.repeat(64)}), /INPUT_INVALID/);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      binding: {...p.document.binding, savedRevision: 1}}), /INPUT_INVALID/);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      document: {...p.document, subjectStrokes: []}}), /STROKES_INVALID/);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-RUN03: unsaved changes, stale revision, other author, swapped Original and revoked Trial fail closed', async () => {
  const f = await fixture();
  try {
    const owner = await f.login('Owner'), other = await f.login('Other');
    const p = await pair(f, owner.client);
    await assert.rejects(runTrialManualAddShadow({...p.options,
      document: {...p.document, settings: {...p.document.settings, opacity: 15}}}),
    /SAVED_DOCUMENT_CHANGED/);
    await assert.rejects(runTrialManualAddShadow({...p.options, savedRevision: 2}),
      /REVISION_CONFLICT/);
    await assert.rejects(runTrialManualAddShadow({...p.options, api: other.client}),
      /ASSET_UNAVAILABLE/);
    owner.intercept((url, request, proceed) => {
      if (url.includes(`/v1/assets/${p.backdrop.id}/original?`))
        return new Response(bytes(92), {status: 200});
      return proceed();
    });
    await assert.rejects(runTrialManualAddShadow(p.options), /ORIGINAL_CHANGED/);
    owner.intercept(undefined);
    f.context.auth.revokeAuthor(owner.author.id);
    await assert.rejects(runTrialManualAddShadow(p.options), /TRIAL_REVOKED/);
  } finally {await f.cleanup();}
});

test('SHADOW-TRIAL-RUN04: expired or aborted request cannot publish partial pixels', async () => {
  const f = await fixture();
  try {
    const expiring = await f.login('Expiring', '2026-10-04T08:00:00.000Z');
    const old = await pair(f, expiring.client);
    f.advance(86400000);
    await assert.rejects(runTrialManualAddShadow(old.options), /TRIAL_EXPIRED/);
    const current = await f.login('Current');
    const p = await pair(f, current.client);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(runTrialManualAddShadow({...p.options,
      signal: controller.signal}), {name: 'AbortError'});
  } finally {await f.cleanup();}
});
