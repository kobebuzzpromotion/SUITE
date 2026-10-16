import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';
import {applyVignette} from '../../src/processing/vignette.mjs';

// Trial HTTP/SQLite + real Editor/Worker, but synthetic NON-RAW only.
// Evoto's pixel formula, camera RAW and Cloud are not verified here.
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
const clonePixels = pixels => ({width: pixels.width, height: pixels.height,
  data: new Uint8ClampedArray(pixels.data)});
const samePixels = (a, b) => a.width === b.width && a.height === b.height &&
  a.data.every((value, i) => value === b.data[i]);
const changedCount = (a, b) => a.data.reduce((count, value, i) =>
  count + Number(value !== b.data[i]), 0);
function syntheticPixels() {
  const width = 20, height = 12, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data.set([160 + x * 4, 155 + y * 7, 170 + (x + y) * 3, 255], i);
  }
  return {width, height, data};
}
async function pngPixels(blob, width, height) {
  expect(blob instanceof Blob && blob.type === 'image/png' && blob.size > 0,
    'actual encoded PNG Final Blob exists');
  const bitmap = await createImageBitmap(blob);
  expect(bitmap.width === width && bitmap.height === height,
    `Final dimensions ${width}x${height} after Crop`);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bitmap, 0, 0);bitmap.close();
  return {width, height, data: new Uint8ClampedArray(
    ctx.getImageData(0, 0, width, height).data)};
}
let ready = null;
async function setup() {
  const invitation = await (await fetch('/fixture/new')).json();
  const client = new TrialClient();await client.login(invitation.inviteToken);
  const original = new TextEncoder().encode('NON_RAW_VIGNETTE_' + Date.now());
  const sha256 = await checksum(original.buffer);
  const asset = await client.createAsset({name: `post-crop-${Date.now()}.NONRAW`,
    sha256, size: original.byteLength});
  await client.putOriginal(asset.id, original.buffer.slice(0));
  const saved = await client.saveRecipe(asset.id, 0, neutralRecipe());
  expect(saved.revision === 1, 'neutral Recipe initially saved via Trial HTTP');
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  const processing = {...worker, syntheticTestOnly: true,
    async decodeRaw(bytes, {mode} = {}) {
      if (!['proxy', 'final'].includes(mode) ||
          !new TextDecoder().decode(bytes).startsWith('NON_RAW_VIGNETTE_'))
        throw Error('SYNTHETIC_NON_RAW_ONLY');
      return {pixels: syntheticPixels(), provenance: {fixture: 'SYNTHETIC_NON_RAW'},
        metadata: {fixture: true}};
    }};
  const session = new EditorSession({api: client, processing,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(asset.id);
  expect(session.state.revision === 1 && !session.state.dirty && session.previewPixels,
    'authenticated saved asset and real Worker Preview ready');
  const blobs = new Map();
  const createURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {const url = createURL(blob);blobs.set(url, blob);return url;};
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.id === 'download-link') return; // Keep actual Final Blob link, avoid OS side effect.
    return nativeAnchorClick.apply(this, args);
  };
  const dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
  ready = {client, asset, sha256, session, worker, dispose, blobs};
  return ready;
}
async function exportViaUI(f, label, width, height) {
  const link = byID('#download-link'), oldHref = link.href;
  const button = byID('[data-action="export-png"]');
  expect(!button.disabled, `${label}: saved Recipe permits Final`);
  button.click();
  await waitFor(() => !link.hidden && link.href.startsWith('blob:') &&
    link.href !== oldHref && f.blobs.has(link.href), `${label}: actual Final Blob link`);
  return pngPixels(f.blobs.get(link.href), width, height);
}
const vignette = recipe => recipe?.parameters?.extendedParameters?.postCropAdjustments?.vignette;
async function moveSlider(f, field, value, croppedBase) {
  const id = `#vignette-${field}`, slider = byID(id);
  expect(slider instanceof HTMLInputElement && !slider.disabled,
    `${field}: actual enabled Editor slider`);
  const oldURL = f.session.state.afterURL;
  const previous = clonePixels(f.session.previewPixels);
  slider.value = String(value);
  slider.dispatchEvent(new Event('input', {bubbles: true}));
  slider.dispatchEvent(new Event('change', {bubbles: true}));
  await waitFor(() => vignette(f.session.state.recipe)?.[field] === value &&
    f.session.state.afterURL !== oldURL && !f.session.state.busy &&
    f.session.previewPixels, `${field}: Recipe and Worker Preview`);
  expect(slider.value === String(value) &&
    byID(`${id}-value`).textContent.includes(String(value)),
    `${field}: Editor control and value remain synchronized`);
  const next = clonePixels(f.session.previewPixels);
  expect(changedCount(previous, next) > 0, `${field}: Worker Preview pixels change`);
  const predicted = applyVignette(croppedBase, vignette(f.session.state.recipe));
  expect(samePixels(next, predicted),
    `${field}: Worker applied vignette to already cropped 12x12 pixels`);
  return {field, value, changedPixels: changedCount(previous, next)};
}
async function runChecks() {
  const f = await setup();
  const source = syntheticPixels(), sourceCopy = clonePixels(source);
  expect(samePixels(clonePixels(f.session.previewPixels), sourceCopy),
    'neutral Worker Preview preserves 20x12 synthetic source');
  const cropControl = byID('#crop-ratio'), oldURL = f.session.state.afterURL;
  expect(!cropControl.disabled, 'fixed-ratio Crop available in actual Editor');
  cropControl.value = '1:1';cropControl.dispatchEvent(new Event('change', {bubbles: true}));
  await waitFor(() => f.session.state.recipe.parameters.extendedParameters?.crop?.preset_name === '1:1' &&
    f.session.state.afterURL !== oldURL && f.session.previewPixels?.width === 12 &&
    f.session.previewPixels?.height === 12 && !f.session.state.busy,
  'Editor Crop changes Worker Preview geometry from 20x12 to 12x12');
  const croppedBase = clonePixels(f.session.previewPixels);
  expect(cropControl.value === '1:1' && croppedBase.width === 12 && croppedBase.height === 12,
    'Crop UI and Worker Preview geometry agree');
  byID('[data-action="save"]').click();
  await waitFor(() => f.session.state.revision === 2 && !f.session.state.dirty &&
    !f.session.state.busy, 'Crop-only Recipe saved as revision 2');
  const baselineFinal = await exportViaUI(f, 'crop-only', 12, 12);
  expect(samePixels(baselineFinal, croppedBase),
    'Crop-only Worker Final equals cropped Worker Preview');
  const section = byID('#vignette-section');section.open = true;
  expect(!section.hidden && section.open, 'post-crop vignette controls exposed in actual Editor');
  const operations = [['amount', -85], ['midpoint', 85], ['roundness', -75],
    ['feather', 85], ['highlights', 90]];
  const results = [];
  for (const [field, value] of operations)
    results.push(await moveSlider(f, field, value, croppedBase));
  const expected = {amount: -85, midpoint: 85, roundness: -75,
    feather: 85, highlights: 90};
  const adjustedPreview = clonePixels(f.session.previewPixels);
  expect(JSON.stringify(vignette(f.session.state.recipe)) === JSON.stringify(expected),
    'all five post-Crop controls encoded into Recipe');
  expect(f.session.state.dirty && f.session.state.canUndo,
    'five actual UI changes remain unsaved and undoable');
  byID('[data-action="undo"]').click();
  await waitFor(() => vignette(f.session.state.recipe)?.highlights === undefined &&
    !f.session.state.busy && f.session.state.canRedo,
    'Undo removes last Vignette operation');
  expect(byID('#vignette-highlights').value === '0', 'Undo updates Highlights slider');
  byID('[data-action="redo"]').click();
  await waitFor(() => vignette(f.session.state.recipe)?.highlights === 90 &&
    !f.session.state.busy && f.session.state.canUndo,
    'Redo restores Highlights');
  expect(samePixels(clonePixels(f.session.previewPixels), adjustedPreview),
    'Redo reproduces exact post-Crop Worker Preview pixels');
  byID('[data-action="save"]').click();
  await waitFor(() => f.session.state.revision === 3 && !f.session.state.dirty &&
    !f.session.state.busy, 'actual Editor Save writes revision 3');
  const stored = await f.client.getRecipe(f.asset.id);
  expect(stored.revision === 3 &&
    JSON.stringify(vignette(stored.body)) === JSON.stringify(expected) &&
    stored.body.parameters.extendedParameters.crop?.preset_name === '1:1',
    'Trial HTTP/SQLite Recipe stores Crop and all five vignette controls');
  const beforeReloadURL = f.session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(() => !f.session.state.busy && !f.session.state.dirty &&
    f.session.previewPixels && f.session.state.afterURL?.startsWith('blob:') &&
    f.session.state.afterURL !== beforeReloadURL,
  'actual Editor Reload re-renders Worker Preview');
  expect(JSON.stringify(vignette(f.session.state.recipe)) === JSON.stringify(expected) &&
    byID('#crop-ratio').value === '1:1', 'Reload restores Crop and all five values');
  for (const [field, value] of operations)
    expect(byID(`#vignette-${field}`).value === String(value),
      `${field} remains visible after reload`);
  expect(samePixels(clonePixels(f.session.previewPixels), adjustedPreview),
    'Reload reproduces exact Worker Preview pixels');
  const adjustedFinal = await exportViaUI(f, 'vignette', 12, 12);
  expect(changedCount(baselineFinal, adjustedFinal) > 0,
    'saved vignette changes actual Worker Final PNG pixels');
  expect(samePixels(adjustedFinal, adjustedPreview),
    'Final equals post-Crop vignette Worker Preview pixels');
  const stillOriginal = await f.client.getOriginal(f.asset.id);
  expect(await checksum(stillOriginal) === f.sha256 &&
    new TextDecoder().decode(stillOriginal).startsWith('NON_RAW_VIGNETTE_'),
    'Trial HTTP Original bytes and SHA remain unchanged');
  expect(samePixels(source, sourceCopy), 'synthetic decoded source pixels unchanged');
  verdict.textContent = JSON.stringify({result: 'VIGNETTE-EDITOR-BROWSER-PASS',
    boundary: 'authenticated synthetic NON_RAW Trial HTTP/SQLite → real Chrome Editor → Worker Crop/Preview/Final',
    realRAW: 'NOT_RUN', cloud: 'NOT_RUN', originalProductPixelEquivalence: 'NOT_CLAIMED',
    revision: stored.revision, crop: '1:1', controls: results.length});
  report.textContent = JSON.stringify({operations: results, originalSHA: f.sha256,
    cropDimensions: [croppedBase.width, croppedBase.height],
    finalChangedPixels: changedCount(baselineFinal, adjustedFinal)});
  f.dispose();f.worker.dispose();
}
byID('#probe-run').addEventListener('click', () => {
  void runChecks().catch(error => {
    verdict.textContent = JSON.stringify({result: 'VIGNETTE-EDITOR-BROWSER-FAIL',
      error: error?.message ?? String(error), stack: error?.stack});
    report.textContent = JSON.stringify({sessionError: ready?.session.state.error,
      revision: ready?.session.state.revision,
      vignette: vignette(ready?.session.state.recipe),
      crop: ready?.session.state.recipe?.parameters?.extendedParameters?.crop,
      uiError: byID('#error-banner')?.textContent});
  });
});
