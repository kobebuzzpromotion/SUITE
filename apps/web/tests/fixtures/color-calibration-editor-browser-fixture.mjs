import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Authenticated local Trial HTTP/SQLite + real Editor/Worker Preview and Final.
// Deliberately synthetic NON-RAW: this is not camera RAW, Cloud or Evoto equivalence.
const verdict = document.querySelector('#probe-verdict');
const report = document.querySelector('#probe-report');
const byID = id => document.querySelector(id);
const expect = (ok, message) => {if (!ok) throw Error(message);};
const waitFor = async (predicate, message) => {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw Error(`TIMED_OUT: ${message}`);
};
const clonePixels = pixels => new Uint8ClampedArray(pixels.data);
const different = (a, b) => a.length === b.length && a.some((value, i) => value !== b[i]);
function syntheticPixels() {
  const width = 20, height = 12, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data.set([36 + x * 10, 25 + y * 16, 105 + (x + y) * 5, 255], i);
  }
  return {width, height, data};
}
async function pngPixels(blob) {
  expect(blob instanceof Blob && blob.type === 'image/png' && blob.size > 0,
    'encoded PNG Final Blob exists');
  const bitmap = await createImageBitmap(blob);
  expect(bitmap.width === 20 && bitmap.height === 12, 'Final dimensions equal synthetic Original');
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bitmap, 0, 0);bitmap.close();
  return new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}
let ready = null;
async function setup() {
  const invitation = await (await fetch('/fixture/new')).json();
  const client = new TrialClient();await client.login(invitation.inviteToken);
  const original = new TextEncoder().encode('NON_RAW_CALIBRATION_' + Date.now());
  const sha256 = await checksum(original.buffer);
  const asset = await client.createAsset({name: `calibration-${Date.now()}.NONRAW`,
    sha256, size: original.byteLength});
  await client.putOriginal(asset.id, original.buffer.slice(0));
  const saved = await client.saveRecipe(asset.id, 0, neutralRecipe());
  expect(saved.revision === 1, 'neutral Recipe initially saved via Trial HTTP');
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  const processing = {...worker, syntheticTestOnly: true,
    async decodeRaw(bytes, {mode} = {}) {
      if (!['proxy', 'final'].includes(mode) ||
          !new TextDecoder().decode(bytes).startsWith('NON_RAW_CALIBRATION_'))
        throw Error('SYNTHETIC_NON_RAW_ONLY');
      return {pixels: syntheticPixels(), provenance: {fixture: 'SYNTHETIC_NON_RAW'},
        metadata: {fixture: true}};
    }};
  const session = new EditorSession({api: client, processing,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(asset.id);
  expect(session.state.revision === 1 && !session.state.dirty && session.previewPixels,
    'authenticated saved asset and rendered Worker Preview ready');
  const blobs = new Map();
  const createURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {const url = createURL(blob);blobs.set(url, blob);return url;};
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.id === 'download-link') return; // Keep the generated Blob link; avoid OS download side effect.
    return nativeAnchorClick.apply(this, args);
  };
  const dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
  ready = {client, asset, sha256, session, worker, dispose, blobs};
  return ready;
}
async function exportViaUI(f, label) {
  const link = byID('#download-link');
  const oldHref = link.href;
  const button = byID('[data-action="export-png"]');
  expect(!button.disabled, `${label}: saved Recipe permits Final`);
  button.click();
  await waitFor(() => !link.hidden && link.href.startsWith('blob:') &&
    link.href !== oldHref && f.blobs.has(link.href), `${label}: actual Final Blob link`);
  return pngPixels(f.blobs.get(link.href));
}
function calibration(recipe) {
  return recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.calibration ?? {};
}
async function moveSlider(f, primary, field, value) {
  const id = `#calibration-${primary}-${field}`, slider = byID(id);
  expect(slider instanceof HTMLInputElement && !slider.disabled,
    `${primary}.${field} actual enabled Editor slider`);
  const oldURL = f.session.state.afterURL;
  const previous = clonePixels(f.session.previewPixels);
  slider.value = String(value);
  slider.dispatchEvent(new Event('input', {bubbles: true}));
  slider.dispatchEvent(new Event('change', {bubbles: true}));
  await waitFor(() => calibration(f.session.state.recipe)?.[primary]?.[field] === value &&
    f.session.state.afterURL !== oldURL && !f.session.state.busy &&
    f.session.previewPixels, `${primary}.${field} Recipe and Worker Preview`);
  expect(slider.value === String(value) &&
    byID(`${id}-value`).textContent.includes(String(value)),
    `${primary}.${field} Editor control and value remain synchronized`);
  const next = clonePixels(f.session.previewPixels);
  expect(different(previous, next), `${primary}.${field} changes Worker Preview pixels`);
  return {control: `${primary}.${field}`, value, changedPixels:
    next.reduce((count, pixel, i) => count + Number(pixel !== previous[i]), 0)};
}
async function runChecks() {
  const f = await setup();
  const section = byID('#calibration-section');section.open = true;
  expect(!section.hidden && section.open, 'RGB primary calibration is exposed in actual Editor');
  const source = syntheticPixels(), sourceCopy = clonePixels(source);
  const baselinePreview = clonePixels(f.session.previewPixels);
  expect(baselinePreview.every((value, i) => value === sourceCopy[i]),
    'neutral Worker Preview preserves synthetic pixels');
  const baselineFinal = await exportViaUI(f, 'neutral');
  expect(baselineFinal.every((value, i) => value === sourceCopy[i]),
    'neutral Final Blob preserves synthetic pixels');
  const operations = [
    ['red', 'hue', 80], ['red', 'saturation', 55],
    ['green', 'hue', -70], ['green', 'saturation', 60],
    ['blue', 'hue', 45], ['blue', 'saturation', -55],
  ];
  const result = [];
  for (const args of operations) result.push(await moveSlider(f, ...args));
  const adjustedPreview = clonePixels(f.session.previewPixels);
  const expected = {red: {hue: 80, saturation: 55},
    green: {hue: -70, saturation: 60}, blue: {hue: 45, saturation: -55}};
  expect(JSON.stringify(calibration(f.session.state.recipe)) === JSON.stringify(expected),
    'all six controls are encoded into Recipe');
  expect(f.session.state.dirty && f.session.state.canUndo,
    'six actual UI changes remain unsaved and undoable');
  byID('[data-action="undo"]').click();
  await waitFor(() => calibration(f.session.state.recipe)?.blue?.saturation === undefined &&
    !f.session.state.busy && f.session.state.canRedo,
    'Undo removes last calibration operation');
  expect(byID('#calibration-blue-saturation').value === '0',
    'Undo updates actual blue saturation slider');
  byID('[data-action="redo"]').click();
  await waitFor(() => calibration(f.session.state.recipe)?.blue?.saturation === -55 &&
    !f.session.state.busy && f.session.state.canUndo,
    'Redo restores last calibration operation');
  expect(clonePixels(f.session.previewPixels).every((value, i) =>
    value === adjustedPreview[i]), 'Redo reproduces exact Worker Preview pixels');
  byID('[data-action="save"]').click();
  await waitFor(() => f.session.state.revision === 2 && !f.session.state.dirty &&
    !f.session.state.busy, 'actual Editor Save writes revision 2');
  const stored = await f.client.getRecipe(f.asset.id);
  expect(stored.revision === 2 &&
    JSON.stringify(calibration(stored.body)) === JSON.stringify(expected),
    'Trial HTTP/SQLite Recipe stores all six calibration values');
  const beforeReloadURL = f.session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(() => !f.session.state.busy && !f.session.state.dirty &&
    f.session.previewPixels && f.session.state.afterURL?.startsWith('blob:') &&
    f.session.state.afterURL !== beforeReloadURL, 'actual Editor Reload re-renders Worker Preview');
  expect(JSON.stringify(calibration(f.session.state.recipe)) === JSON.stringify(expected),
    'Reload reads all six values from saved Recipe');
  for (const [primary, field, value] of operations)
    expect(byID(`#calibration-${primary}-${field}`).value === String(value),
      `${primary}.${field} remains visible after reload`);
  expect(clonePixels(f.session.previewPixels).every((value, i) =>
    value === adjustedPreview[i]), 'Reload reproduces exact Worker Preview pixels');
  const adjustedFinal = await exportViaUI(f, 'calibrated');
  expect(different(baselineFinal, adjustedFinal),
    'saved RGB calibration changes actual Worker Final PNG pixels');
  expect(adjustedFinal.every((value, i) => value === adjustedPreview[i]),
    'Final and Preview encode the same calibrated synthetic pixels');
  const stillOriginal = await f.client.getOriginal(f.asset.id);
  expect(await checksum(stillOriginal) === f.sha256 &&
    new TextDecoder().decode(stillOriginal).startsWith('NON_RAW_CALIBRATION_'),
    'Trial HTTP Original bytes and SHA remain unchanged');
  expect(source.data.every((value, i) => value === sourceCopy[i]),
    'synthetic decoded source pixels remain unchanged');
  verdict.textContent = JSON.stringify({result: 'CALIBRATION-EDITOR-BROWSER-PASS',
    boundary: 'authenticated synthetic NON_RAW Trial HTTP/SQLite → real Chrome Editor → Worker Preview/Final',
    realRAW: 'NOT_RUN', cloud: 'NOT_RUN', originalProductEquivalence: 'NOT_CLAIMED',
    revision: stored.revision, controls: result.length});
  report.textContent = JSON.stringify({operations: result, originalSHA: f.sha256,
    baselineFinalBytes: baselineFinal.length, calibratedFinalBytes: adjustedFinal.length});
  f.dispose();f.worker.dispose();
}
byID('#probe-run').addEventListener('click', () => {
  void runChecks().catch(error => {
    verdict.textContent = JSON.stringify({result: 'CALIBRATION-EDITOR-BROWSER-FAIL',
      error: error?.message ?? String(error), stack: error?.stack});
    report.textContent = JSON.stringify({sessionError: ready?.session.state.error,
      revision: ready?.session.state.revision,
      calibration: calibration(ready?.session.state.recipe),
      uiError: byID('#error-banner')?.textContent});
  });
});
