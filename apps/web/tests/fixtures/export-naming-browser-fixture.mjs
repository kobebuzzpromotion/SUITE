import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Real Editor UI, Trial cookie/HTTP/SQLite, Worker rendering and JPEG/PNG encode.
// Synthetic NON-RAW input only: not a camera RAW, Cloud or production-auth test.
const verdict = document.querySelector('#probe-verdict');
const report = document.querySelector('#probe-report');
const expect = (condition, message) => {if (!condition) throw Error(message);};
const waitFor = async (predicate, message) => {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error(`TIMED_OUT: ${message}`);
};
const syntheticPixels = () => {
  const width = 20, height = 12, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([90, 130, 170, 255], i);
  return {width, height, data};
};
const byID = id => document.querySelector(id);
const setMethod = method => {
  const input = byID('#export-name-method');input.value = method;
  input.dispatchEvent(new Event('change', {bubbles: true}));
};
const setCustom = text => {
  const input = byID('#export-name-custom');input.value = text;
  input.dispatchEvent(new Event('input', {bubbles: true}));
};
let ready = null;
async function setup() {
  const invitation = await (await fetch('/fixture/new')).json();
  const client = new TrialClient();
  await client.login(invitation.inviteToken);
  const original = new TextEncoder().encode('NON_RAW_EXPORT_NAMING_' + Date.now());
  const sha256 = await checksum(original.buffer);
  const asset = await client.createAsset({name: `portrait-${Date.now()}.NONRAW`,
    sha256, size: original.byteLength});
  await client.putOriginal(asset.id, original.buffer.slice(0));
  const recipe = neutralRecipe();recipe.parameters.exposure = 0.6;
  await client.saveRecipe(asset.id, 0, recipe);
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  const processing = {...worker, syntheticTestOnly: true,
    async decodeRaw(bytes, {mode} = {}) {
      if (!['proxy', 'final'].includes(mode) ||
          !new TextDecoder().decode(bytes).startsWith('NON_RAW_EXPORT_NAMING_'))
        throw Error('SYNTHETIC_NON_RAW_ONLY');
      return {pixels: syntheticPixels(), provenance: {fixture: 'SYNTHETIC_NON_RAW'},
        metadata: {fixture: true}};
    }};
  const session = new EditorSession({api: client, processing,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(asset.id);
  const calls = [];
  const actualExport = session.exportFinal.bind(session);
  session.exportFinal = async args => {calls.push(structuredClone(args));return actualExport(args);};
  const blobs = new Map(),clicks = [];
  const createURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {const url = createURL(blob);blobs.set(url, blob);return url;};
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.id === 'download-link' && this.download && this.href.startsWith('blob:')) {
      clicks.push({name: this.download, href: this.href, nativeClickInvoked: true});
    }
    return nativeAnchorClick.apply(this, args); // Actual browser download, not a stub.
  };
  const dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
  ready = {client, asset, original, sha256, recipe, session, worker, dispose, calls, blobs, clicks};
  return ready;
}
async function unchanged(f) {
  const bytes = await f.client.getOriginal(f.asset.id);
  expect(await checksum(bytes) === f.sha256, 'Trial HTTP Original SHA is unchanged');
  const stored = await f.client.getRecipe(f.asset.id);
  expect(stored.revision === 1 && JSON.stringify(stored.body) === JSON.stringify(f.recipe),
    'Trial HTTP Recipe revision/body unchanged');
}
function visibleDownload(f, expected) {
  const link = byID('#download-link');
  expect(!link.hidden && link.download === expected && link.textContent.includes(expected),
    `visible Final link uses ${expected}`);
  const blob = f.blobs.get(link.href);
  expect(blob instanceof Blob && blob.size > 0 &&
    ['image/jpeg', 'image/png'].includes(blob.type), 'linked actual encoded Final Blob');
  expect(f.clicks.at(-1)?.name === expected && f.clicks.at(-1)?.href === link.href &&
    f.clicks.at(-1)?.nativeClickInvoked, 'native anchor click carries same suggested download name');
  return {link, blob};
}
async function exportAndCheck(f, format, expected) {
  const before = f.calls.length, clicks = f.clicks.length;
  const button = byID(`[data-action="export-${format}"]`);
  expect(!button.disabled, `${format} enabled for saved authenticated asset`);
  button.click();
  await waitFor(() => f.calls.length === before + 1 && f.clicks.length === clicks + 1,
    `${expected} actual Final and native anchor click invocation`);
  const {blob} = visibleDownload(f, expected);
  expect(blob.type === `image/${format}`, `${format} Final MIME`);
  const bitmap = await createImageBitmap(blob);
  expect(bitmap.width === 20 && bitmap.height === 12, 'real encoded Final dimensions');
  bitmap.close();
  await unchanged(f);
  return {name: expected, mime: blob.type, bytes: blob.size};
}

async function runChecks() {
  const f = await setup(), stem = f.asset.name.replace(/\.[^.]+$/, ''), results = [];
  expect(f.session.state.revision === 1 && !f.session.state.dirty &&
    f.session.state.asset.id === f.asset.id, 'authenticated saved Editor source ready');
  setMethod('original');
  results.push(await exportAndCheck(f, 'png', `${stem}.png`));
  results.push(await exportAndCheck(f, 'png', `${stem}_01.png`));
  setMethod('original-custom');
  expect(!byID('#export-name-custom-label').hidden, 'Custom input visible in actual Editor');
  setCustom('safe/../portrait');
  results.push(await exportAndCheck(f, 'jpeg', `${stem}_safe_.._portrait.jpg`));
  for (const unsafe of ['', '///']) {
    setCustom(unsafe);
    const before = f.calls.length, clicks = f.clicks.length;
    byID('[data-action="export-jpeg"]').click();
    await waitFor(() => byID('#local-error')?.textContent.includes('EXPORT_CUSTOM_TEXT_REQUIRED') ||
      byID('#export-note')?.textContent.includes('EXPORT_CUSTOM_TEXT_REQUIRED') ||
      document.body.textContent.includes('EXPORT_CUSTOM_TEXT_REQUIRED'),
    `invalid Custom ${JSON.stringify(unsafe)} refused`);
    expect(f.calls.length === before && f.clicks.length === clicks,
      'empty/path-only Custom rejected before Final render or download');
    await unchanged(f);
  }
  expect(f.calls.length === 3 && f.clicks.length === 3 && results.length === 3,
    'three real Final exports and no invalid extra output');
  verdict.textContent = JSON.stringify({result: 'EXPORT-NAMING-BROWSER-LINK-PASS',
    boundary: 'authenticated synthetic NON_RAW Trial HTTP/SQLite → actual Editor/Worker/Blob/download attribute/native anchor click',
    savedOSFilename: 'NOT_VERIFIED: chrome://downloads access denied by browser policy',
    results, invalid: ['empty', 'path-only']});
  report.textContent = JSON.stringify({asset: f.asset.name, links: f.clicks,
    originalSHA: f.sha256, savedRevision: 1});
  f.dispose();f.worker.dispose();
}
byID('#probe-run').addEventListener('click', () => {
  void runChecks().catch(error => {
    verdict.textContent = JSON.stringify({result: 'EXPORT-NAMING-BROWSER-FAIL',
      error: error?.message ?? String(error), stack: error?.stack});
    report.textContent = JSON.stringify({calls: ready?.calls, clicks: ready?.clicks,
      note: byID('#export-note')?.textContent, sessionError: ready?.session.state.error});
  });
});
