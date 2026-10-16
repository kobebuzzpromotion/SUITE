import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {build} from 'esbuild-wasm';
import {createTrialServer} from '../trial-server.mjs';
import {TrialClient} from '../src/trial-client.mjs';
import {EditorSession} from '../src/session.mjs';
import {verifiedBatchFinalManifest, validateBatchFinalNames} from '../src/editor-ui.mjs';
import {planBatchDownloadManifest} from '../src/export-batch-manifest.mjs';
import {planExportQueue} from '../src/export-queue.mjs';
import {recipe, syntheticPixels} from './fixtures.mjs';

const START = Date.parse('2026-10-03T08:00:00.000Z');
const END = '2026-11-03T08:00:00.000Z';
const sha = buffer => createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
// TIFF-shaped Exif Gate fixture, deliberately not a decodable camera RAW.
function syntheticDng({day = '2024:02:29', offset = '+09:00', dng = true} = {}) {
  const bytes = new Uint8Array(384), view = new DataView(bytes.buffer);
  bytes[0] = bytes[1] = 0x49; view.setUint16(2, 42, true); view.setUint32(4, 8, true);
  view.setUint16(8, 4, true);
  const entry = (at, tag, type, count, value) => {
    view.setUint16(at, tag, true); view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true); view.setUint32(at + 8, value, true);
  };
  entry(10, 0x0112, 3, 1, 1); entry(22, 0x8769, 4, 1, 120);
  entry(34, dng ? 0xc612 : 0xc611, 1, 4, 0); bytes.set([1, 4, 0, 0], 42);
  entry(46, 0xc614, 2, 12, 300);
  view.setUint16(120, offset === null ? 1 : 2, true);
  entry(122, 0x9003, 2, 20, 200);
  if (offset !== null) entry(134, 0x9011, 2, 7, 240);
  bytes.set(new TextEncoder().encode(`${day} 23:59:58\0`), 200);
  if (offset !== null) bytes.set(new TextEncoder().encode(`${offset}\0`), 240);
  bytes.set(new TextEncoder().encode('Test Camera\0'), 300);
  return bytes.buffer;
}

async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'suite-dng-batch-product-'));
  const context = await createTrialServer({dataDir, port: 0, clock: () => START});
  await new Promise((done, reject) => {
    context.server.once('error', reject); context.server.listen(0, '127.0.0.1', done);
  });
  const baseURL = `http://127.0.0.1:${context.server.address().port}`;
  const author = context.auth.createAuthor({authorName: 'Owner', trialEndsAt: END});
  const invitation = context.auth.issueInvite(author.id);
  const response = await fetch(baseURL + '/trial/login', {method: 'POST',
    headers: {'X-Suite-Trial': '1', 'Content-Type': 'application/json'},
    body: JSON.stringify({inviteToken: invitation.inviteToken})});
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie, /^suite_trial=/u);
  const api = new TrialClient({baseURL, fetcher: (url, init) => fetch(url,
    {...init, headers: {...init.headers, Cookie: cookie}})});
  async function add(name, original) {
    const created = await api.createAsset({name, sha256: sha(original), size: original.byteLength});
    const asset = await api.putOriginal(created.id, original);
    const saved = await api.saveRecipe(asset.id, 0, recipe());
    assert.equal(saved.revision, 1);
    return {asset, original, saved};
  }
  let encoded = 0, onEncode;
  const processing = {syntheticTestOnly: true,
    async decodeRaw() {return {pixels: syntheticPixels(4, 4),
      provenance: {fixture: 'SYNTHETIC_DNG_DECODE_NOT_RAW'}};},
    async makeProxy(pixels) {return pixels;},
    async render(pixels) {return pixels;},
    async encode(pixels, {format}) {
      encoded++;
      if (onEncode) await onEncode(encoded);
      return new Blob([pixels.data], {type: `image/${format}`});
    }};
  const session = new EditorSession({api, processing,
    storage: {get: async () => undefined, put: async () => {}},
    urlAPI: {createObjectURL: () => 'blob:synthetic', revokeObjectURL() {}},
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  return {api, session, add, setOnEncode(fn) {onEncode = fn;},
    get encoded() {return encoded;},
    async close() {
      await new Promise((done, reject) => context.server.close(error => error ? reject(error) : done()));
      const target = resolve(dataDir), base = resolve(tmpdir()) + sep;
      if (!target.startsWith(base) ||
          !target.split(sep).at(-1).startsWith('suite-dng-batch-product-'))
        throw Error('DNG_BATCH_TEST_CLEANUP_TARGET_INVALID');
      await rm(target, {recursive: true, force: true});
    }};
}

test('DNG-BATCH-PRODUCT01 / REAL_TRIAL_SQLITE_SYNTHETIC_DNG: two saved Final Blobs get individually bound dates, no download', async () => {
  const f = await fixture();
  try {
    const first = await f.add('IMG_A.dng', syntheticDng({day: '2024:02:29'}));
    const second = await f.add('IMG_B.dng', syntheticDng({day: '2023:12:31'}));
    await f.session.initialize(); await f.session.openAsset(first.asset.id);
    const previousEncodes = f.encoded;
    const before = await Promise.all([f.api.getRecipe(first.asset.id), f.api.getRecipe(second.asset.id)]);
    const result = await f.session.exportBatchFinal({orderedIds: [second.asset.id, first.asset.id],
      format: 'jpeg', namingMethod: 'capture-date-original'});
    const manifest = verifiedBatchFinalManifest(result, [second.asset.id, first.asset.id],
      {format: 'jpeg', method: 'capture-date-original'});
    assert.deepEqual(manifest.files.map(file => file.name),
      ['20231231_IMG_B.jpg', '20240229_IMG_A.jpg']);
    assert.equal(result.items.length, 2);
    assert.equal(f.encoded - previousEncodes, 2);
    assert.equal(manifest.status, 'download-manifest-only');
    assert.ok(manifest.files.every(file => file.blob instanceof Blob));
    assert.deepEqual(await Promise.all([f.api.getRecipe(first.asset.id),
      f.api.getRecipe(second.asset.id)]), before);
    assert.equal(sha(await f.api.getOriginal(first.asset.id)), sha(first.original));
    assert.equal(sha(await f.api.getOriginal(second.asset.id)), sha(second.original));
  } finally {await f.close();}
});

test('DNG-BATCH-PRODUCT02: missing offset, fake DNG and partial/fake evidence return no manifest', async () => {
  const f = await fixture();
  try {
    const good = await f.add('good.dng', syntheticDng());
    const bad = await f.add('offsetless.dng', syntheticDng({offset: null}));
    const fake = await f.add('fake.dng', syntheticDng({dng: false}));
    await f.session.initialize(); await f.session.openAsset(good.asset.id);
    const previousEncodes = f.encoded;
    await assert.rejects(f.session.exportBatchFinal({orderedIds: [good.asset.id, bad.asset.id],
      format: 'jpeg', namingMethod: 'capture-date-original'}),
    /CAPTURE_DATE_NAMING_EVIDENCE_UNAVAILABLE/);
    assert.equal(f.encoded, previousEncodes);
    await assert.rejects(f.session.exportBatchFinal({orderedIds: [good.asset.id, fake.asset.id],
      format: 'jpeg', namingMethod: 'capture-date-original'}),
    /EXIF_CAPTURE_DNG_VERSION_INVALID/);
    assert.equal(f.encoded, previousEncodes);
    assert.deepEqual(validateBatchFinalNames({assets: [good.asset, bad.asset],
      orderedIds: [good.asset.id, bad.asset.id], format: 'jpeg',
      method: 'capture-date-original'}), ['good.jpg', 'offsetless.jpg']);
    const plan = planExportQueue({orderedIds: [good.asset.id, bad.asset.id],
      assets: [good.asset, bad.asset]});
    const items = plan.map(row => ({assetId: row.assetId,
      blob: new Blob(['synthetic'], {type: 'image/jpeg'})}));
    assert.throws(() => planBatchDownloadManifest({plan, items, format: 'jpeg',
      method: 'capture-date-original', captureDateEvidence: {captureDate: '2024-02-29'}}),
    /EXPORT_BATCH_CAPTURE_DATE_EVIDENCE_REQUIRED/);
    assert.throws(() => planBatchDownloadManifest({plan, items: items.slice(0, 1),
      format: 'jpeg', method: 'capture-date-original'}), /EXPORT_BATCH_RESULT_INCOMPLETE/);
  } finally {await f.close();}
});

test('DNG-BATCH-PRODUCT03: logout after encoding yields no partial result or named manifest', async () => {
  const f = await fixture();
  try {
    const first = await f.add('A.dng', syntheticDng());
    const second = await f.add('B.dng', syntheticDng({day: '2024:03:01'}));
    await f.session.initialize(); await f.session.openAsset(first.asset.id);
    const previousEncodes = f.encoded;
    f.setOnEncode(async count => {if (count === previousEncodes + 2) await f.api.logout();});
    await assert.rejects(f.session.exportBatchFinal({orderedIds: [first.asset.id, second.asset.id],
      format: 'jpeg', namingMethod: 'capture-date-original'}),
    /UNAUTHORIZED|SESSION_REQUIRED|EXPORT_BATCH_PERMISSION_DENIED/u);
    assert.equal(f.encoded - previousEncodes, 2);
  } finally {await f.close();}
});

test('DNG-BATCH-PRODUCT04 / BUNDLE_ONLY: explicit UI choices include capture date and new path does not auto-click', async () => {
  const result = await build({entryPoints: ['apps/web/src/editor-ui.mjs'],
    absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', write: false, logLevel: 'silent'});
  const source = new TextDecoder().decode(result.outputFiles[0].contents);
  assert.match(source, /capture-date-original/u);
  assert.match(source, /autoDownload: false/u);
  assert.match(source, /if \(autoDownload\) link\.click\(\)/u);
});
