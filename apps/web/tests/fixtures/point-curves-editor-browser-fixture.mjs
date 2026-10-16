import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {mountEditor, pointCurveGraphPlotRect} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';
import {applyPointCurves} from '../../src/processing/point-curves.mjs';

// Actual Chrome Editor + Trial HTTP/SQLite + Worker, synthetic NON-RAW only.
// Synthetic PointerEvents exercise product handlers, not native pointer capture.
const verdict = document.querySelector('#probe-verdict');
const report = document.querySelector('#probe-report');
const byID = selector => document.querySelector(selector);
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
const curves = recipe => recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.pointCurves ?? {};
function syntheticPixels() {
  const width = 20, height = 12, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data.set([40 + x * 9, 35 + y * 16, 100 + (x + y) * 5, 255], i);
  }
  return {width, height, data};
}
async function pngPixels(blob) {
  expect(blob instanceof Blob && blob.type === 'image/png' && blob.size > 0,
    'actual encoded PNG Final Blob exists');
  const bitmap = await createImageBitmap(blob);
  expect(bitmap.width === 20 && bitmap.height === 12, 'Final preserves 20x12 geometry');
  const canvas = document.createElement('canvas');canvas.width = 20;canvas.height = 12;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bitmap, 0, 0);bitmap.close();
  return {width: 20, height: 12,
    data: new Uint8ClampedArray(ctx.getImageData(0, 0, 20, 12).data)};
}
let ready = null;
async function setup() {
  const invitation = await (await fetch('/fixture/new')).json();
  const client = new TrialClient();await client.login(invitation.inviteToken);
  const original = new TextEncoder().encode('NON_RAW_POINT_CURVES_' + Date.now());
  const sha256 = await checksum(original.buffer);
  const asset = await client.createAsset({name: `point-curves-${Date.now()}.NONRAW`,
    sha256, size: original.byteLength});
  await client.putOriginal(asset.id, original.buffer.slice(0));
  const saved = await client.saveRecipe(asset.id, 0, neutralRecipe());
  expect(saved.revision === 1, 'neutral Recipe initially saved via Trial HTTP');
  const worker = createProcessing({workerURL: '/processing-worker.js'});
  const processing = {...worker, syntheticTestOnly: true,
    async decodeRaw(bytes, {mode} = {}) {
      if (!['proxy', 'final'].includes(mode) ||
          !new TextDecoder().decode(bytes).startsWith('NON_RAW_POINT_CURVES_'))
        throw Error('SYNTHETIC_NON_RAW_ONLY');
      return {pixels: syntheticPixels(), provenance: {fixture: 'SYNTHETIC_NON_RAW'},
        metadata: {fixture: true}};
    }};
  const session = new EditorSession({api: client, processing,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(asset.id);
  expect(session.state.revision === 1 && !session.state.dirty && session.previewPixels,
    'authenticated saved asset and real Worker Preview ready');
  const blobs = new Map(), createURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {const url = createURL(blob);blobs.set(url, blob);return url;};
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.id === 'download-link') return;
    return nativeAnchorClick.apply(this, args);
  };
  const dispose = mountEditor(session, {trialSession: await client.getSession(), authorAPI: client});
  const svg = byID('#point-curve-preview');
  // Synthetic events have no active browser pointer. Leave trusted native events untouched.
  const nativeCapture = svg.setPointerCapture.bind(svg);
  svg.setPointerCapture = pointerID => {
    if (!window.__pointCurveSyntheticPointer) return nativeCapture(pointerID);
  };
  const nativeEvents = byID('#native-events'), nativeVerdict = byID('#native-verdict');
  const eventLog = [];
  for (const kind of ['pointerdown', 'pointerup', 'click', 'dblclick']) {
    svg.addEventListener(kind, event => {
      const bounds = svg.getBoundingClientRect();
      const channel = byID('#point-curve-channel').value;
      const before = curves(session.state.recipe)[channel]?.length ?? 2;
      eventLog.push({kind, trusted: event.isTrusted, detail: event.detail,
        pointerID: event.pointerId ?? null, x: event.clientX, y: event.clientY,
        target: event.target.tagName?.toLowerCase() ?? null,
        handle: event.target.closest?.('[data-curve-graph-index]')?.dataset.curveGraphIndex ?? null,
        channel, active: svg.getAttribute('aria-disabled') === 'false', busy: session.state.busy,
        svg: {left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height},
        points: curves(session.state.recipe)[channel] ?? null});
      if (eventLog.length > 12) eventLog.shift();
      nativeEvents.textContent = JSON.stringify(eventLog);
      if (kind === 'dblclick' && event.isTrusted) {
        nativeVerdict.textContent = 'TRUSTED_DBLCLICK_OBSERVED_CHECKING';
        void (async () => {
          const until = Date.now() + 3000;
          while (Date.now() < until &&
              (curves(session.state.recipe)[channel]?.length ?? 2) !== before - 1)
            await new Promise(resolve => setTimeout(resolve, 20));
          const after = curves(session.state.recipe)[channel]?.length ?? 2;
          const passed = after === before - 1;
          nativeVerdict.textContent = JSON.stringify({
            result: passed ? 'NATIVE_POINT_CURVE_DBLCLICK_PASS' :
              'NATIVE_POINT_CURVE_DBLCLICK_FAIL',
            assertion: 'trusted dblclick on interior point removes exactly one Recipe point',
            channel, before, after, target: event.target.tagName?.toLowerCase() ?? null,
            hitHandle: event.target.closest?.('[data-curve-graph-index]')?.dataset.curveGraphIndex ?? null,
            error: passed ? null : 'TRUSTED_DBLCLICK_DID_NOT_REMOVE_INTERIOR_POINT'});
        })();
      }
    }, {capture: true});
  }
  ready = {client, asset, sha256, session, worker, dispose, blobs, svg, eventLog};
  window.addEventListener('pagehide', () => {dispose();worker.dispose();}, {once: true});
  return ready;
}
async function exportViaUI(f, label) {
  const link = byID('#download-link'), oldHref = link.href;
  const button = byID('[data-action="export-png"]');
  expect(!button.disabled, `${label}: saved Recipe permits Final`);
  button.click();
  await waitFor(() => !link.hidden && link.href.startsWith('blob:') &&
    link.href !== oldHref && f.blobs.has(link.href), `${label}: actual Final Blob link`);
  return pngPixels(f.blobs.get(link.href));
}
const selectChannel = channel => {
  const select = byID('#point-curve-channel');
  expect(!select.disabled, `${channel}: channel select enabled`);
  select.value = channel;select.dispatchEvent(new Event('change', {bubbles: true}));
  expect(select.value === channel, `${channel}: selected`);
};
const graphXY = (svg, x, y) => {
  const rect = pointCurveGraphPlotRect(svg.getBoundingClientRect());
  return {clientX: rect.left + rect.width * x / 255,
    clientY: rect.top + rect.height * (255 - y) / 255};
};
function syntheticPointer(target, kind, point) {
  target.dispatchEvent(new PointerEvent(kind, {bubbles: true, cancelable: true,
    button: 0, buttons: kind === 'pointerup' ? 0 : 1, pointerId: 37, ...point}));
}
async function action(f, label, predicate, trigger) {
  const oldURL = f.session.state.afterURL;
  trigger();
  await waitFor(() => predicate() && !f.session.state.busy &&
    f.session.previewPixels && f.session.state.afterURL !== oldURL,
  `${label}: Recipe and Worker Preview`);
  expect(!f.session.state.error, `${label}: no Editor Session error`);
  return clonePixels(f.session.previewPixels);
}
async function pointerAdd(f, channel, x, y) {
  selectChannel(channel);
  const svg = f.svg, point = graphXY(svg, x, y);
  expect(svg.getBoundingClientRect().width > 0, `${channel}: graph has layout`);
  window.__pointCurveSyntheticPointer = true;
  try {
    return await action(f, `${channel} graph pointer add`,
      () => curves(f.session.state.recipe)[channel]?.length === 3, () => {
        syntheticPointer(svg, 'pointerdown', point);
        syntheticPointer(svg, 'pointerup', point);
      });
  } finally {window.__pointCurveSyntheticPointer = false;}
}
async function pointerMove(f, channel, x, y) {
  selectChannel(channel);
  const svg = f.svg, handle = byID('[data-curve-graph-index="1"]');
  expect(handle?.getAttribute('role') === 'button', `${channel}: actual SVG handle`);
  const original = curves(f.session.state.recipe)[channel][1];
  const start = graphXY(svg, original.x, original.y), end = graphXY(svg, x, y);
  window.__pointCurveSyntheticPointer = true;
  try {
    return await action(f, `${channel} graph pointer drag`,
      () => curves(f.session.state.recipe)[channel]?.[1]?.x > original.x + 10,
      () => {syntheticPointer(handle, 'pointerdown', start);
        syntheticPointer(svg, 'pointermove', end);syntheticPointer(svg, 'pointerup', end);});
  } finally {window.__pointCurveSyntheticPointer = false;}
}
async function doubleClickRemove(f, channel) {
  selectChannel(channel);
  const handle = byID('[data-curve-graph-index="1"]');
  expect(handle, `${channel}: interior handle before double click`);
  return action(f, `${channel} graph double-click delete`,
    () => curves(f.session.state.recipe)[channel]?.length === 2,
    () => handle.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true})));
}
async function runChecks() {
  const f = await setup(), source = syntheticPixels(), sourceCopy = clonePixels(source);
  expect(samePixels(clonePixels(f.session.previewPixels), sourceCopy),
    'neutral Worker Preview preserves source');
  const baselineFinal = await exportViaUI(f, 'neutral');
  expect(samePixels(baselineFinal, sourceCopy), 'neutral Final preserves source');
  const section = byID('.point-curve-editor');
  expect(section && !section.hidden, 'actual Point Curve Editor present');
  const results = [];
  for (const [channel, y] of [['master', 185], ['red', 205],
    ['green', 65], ['blue', 205]]) {
    const added = await pointerAdd(f, channel, 128, y);
    const moved = await pointerMove(f, channel, 150, y > 128 ? y + 20 : y - 20);
    expect(changedCount(added, moved) > 0, `${channel}: drag changes actual Worker pixels`);
    await doubleClickRemove(f, channel);
    await pointerAdd(f, channel, 128, y);
    results.push({channel, added: true, dragged: true, doubleClickDeleted: true});
  }
  selectChannel('master');
  const resetPreview = await action(f, 'master Reset',
    () => !curves(f.session.state.recipe).master,
    () => byID('[data-curve-action="reset"]').click());
  expect(changedCount(resetPreview, clonePixels(f.session.previewPixels)) === 0,
    'Reset Worker Preview stable');
  const undoPreview = await action(f, 'Undo Reset',
    () => curves(f.session.state.recipe).master?.length === 3,
    () => byID('[data-action="undo"]').click());
  await action(f, 'Redo Reset', () => !curves(f.session.state.recipe).master,
    () => byID('[data-action="redo"]').click());
  await action(f, 'Undo restores Master',
    () => curves(f.session.state.recipe).master?.length === 3,
    () => byID('[data-action="undo"]').click());
  expect(samePixels(clonePixels(f.session.previewPixels), undoPreview),
    'Undo restores exact Worker Preview pixels');
  const svg = f.svg;
  await action(f, 'graph keyboard Enter add',
    () => curves(f.session.state.recipe).master?.length === 4,
    () => {svg.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowRight'}));
      svg.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowUp'}));
      svg.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'Enter'}));});
  expect(byID('#point-curve-handles').children.length === 4,
    'keyboard-added point rendered as SVG handle');
  const handle = byID('[data-curve-graph-index="2"]');
  const beforeKey = curves(f.session.state.recipe).master[2].y;
  await action(f, 'handle keyboard ArrowUp',
    () => curves(f.session.state.recipe).master?.[2]?.y === beforeKey + 1,
    () => handle.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: 'ArrowUp'})));
  await action(f, 'handle keyboard Delete',
    () => curves(f.session.state.recipe).master?.length === 3,
    () => byID('[data-curve-graph-index="2"]').dispatchEvent(
      new KeyboardEvent('keydown', {bubbles: true, key: 'Delete'})));
  const expected = structuredClone(curves(f.session.state.recipe));
  expect(['master', 'red', 'green', 'blue'].every(channel => expected[channel]?.length === 3),
    'all four graph channels retain committed interior points');
  const adjustedPreview = clonePixels(f.session.previewPixels);
  const predicted = applyPointCurves(source, expected);
  expect(samePixels(adjustedPreview, predicted),
    'actual Worker Preview equals four-channel point curve pixel transform');
  expect(changedCount(sourceCopy, adjustedPreview) > 0,
    'four channels change actual Worker Preview pixels');
  byID('[data-action="save"]').click();
  await waitFor(() => f.session.state.revision === 2 && !f.session.state.dirty &&
    !f.session.state.busy, 'actual Editor Save writes revision 2');
  const stored = await f.client.getRecipe(f.asset.id);
  expect(stored.revision === 2 && JSON.stringify(curves(stored.body)) === JSON.stringify(expected),
    'Trial HTTP/SQLite Recipe stores all four channels');
  const beforeReloadURL = f.session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(() => !f.session.state.busy && !f.session.state.dirty &&
    f.session.previewPixels && f.session.state.afterURL?.startsWith('blob:') &&
    f.session.state.afterURL !== beforeReloadURL,
  'actual Editor Reload re-renders Worker Preview');
  expect(JSON.stringify(curves(f.session.state.recipe)) === JSON.stringify(expected) &&
    samePixels(clonePixels(f.session.previewPixels), adjustedPreview),
    'Reload restores exact Recipe and Worker Preview');
  for (const channel of ['master', 'red', 'green', 'blue']) {
    selectChannel(channel);
    expect(byID('#point-curve-handles').children.length === 3,
      `${channel}: graph handles restored after reload`);
  }
  const adjustedFinal = await exportViaUI(f, 'four-channel curves');
  expect(changedCount(baselineFinal, adjustedFinal) > 0,
    'saved curves change actual Worker Final PNG pixels');
  expect(samePixels(adjustedFinal, adjustedPreview),
    'Final equals actual Worker Preview pixels');
  const refine=byID('#point-curve-refine-saturation');
  expect(refine && !refine.disabled && refine.value==='100',
    'real Refine Saturation control is enabled for committed curves');
  const refinedPreview=await action(f,'Refine Saturation 0',
    ()=>curves(f.session.state.recipe).refineSaturation===0,
    ()=>{refine.value='0';refine.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(changedCount(refinedPreview,adjustedPreview)>0,
    'Refine Saturation changes real Worker Preview pixels');
  expect(samePixels(refinedPreview,applyPointCurves(source,{...expected,refineSaturation:0})),
    'Refine Preview matches pure curve math');
  await action(f,'Undo Refine Saturation',
    ()=>curves(f.session.state.recipe).refineSaturation===undefined,
    ()=>byID('[data-action="undo"]').click());
  expect(samePixels(clonePixels(f.session.previewPixels),adjustedPreview),
    'Undo restores the legacy curve pixels');
  await action(f,'Redo Refine Saturation',
    ()=>curves(f.session.state.recipe).refineSaturation===0,
    ()=>byID('[data-action="redo"]').click());
  expect(samePixels(clonePixels(f.session.previewPixels),refinedPreview),
    'Redo restores Refine pixels');
  byID('[data-action="save"]').click();
  await waitFor(()=>f.session.state.revision===3&&!f.session.state.dirty&&!f.session.state.busy,
    'Refine Recipe saved over Trial HTTP/SQLite');
  expect(curves((await f.client.getRecipe(f.asset.id)).body).refineSaturation===0,
    'persisted Refine value is 0');
  const beforeRefineReload=f.session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>!f.session.state.busy&&!f.session.state.dirty&&f.session.previewPixels&&
    f.session.state.afterURL!==beforeRefineReload,'Refine Reload');
  expect(curves(f.session.state.recipe).refineSaturation===0&&
    samePixels(clonePixels(f.session.previewPixels),refinedPreview)&&
    byID('#point-curve-refine-saturation').value==='0',
    'Reload restores Recipe, Worker Preview, and actual Slider');
  const refinedFinal=await exportViaUI(f,'Refine Saturation Final');
  expect(samePixels(refinedFinal,refinedPreview)&&changedCount(refinedFinal,adjustedFinal)>0,
    'Refine Saturation changes real Worker Final');
  const stillOriginal = await f.client.getOriginal(f.asset.id);
  expect(await checksum(stillOriginal) === f.sha256 &&
    new TextDecoder().decode(stillOriginal).startsWith('NON_RAW_POINT_CURVES_'),
    'Trial HTTP Original bytes and SHA remain unchanged');
  expect(samePixels(source, sourceCopy), 'synthetic decoded source pixels unchanged');
  verdict.textContent = JSON.stringify({result: 'POINT-CURVES-EDITOR-BROWSER-PASS',
    boundary: 'authenticated synthetic NON_RAW Trial HTTP/SQLite → real Chrome Editor → Worker Preview/Final',
    pointerEvents: 'synthetic handlers; native capture not verified',
    arbitraryContrastPreset: 'NOT_RUN', refineSaturation: 'REFINE_SATURATION_BROWSER_PASS',
    realRAW: 'NOT_RUN', cloud: 'NOT_RUN', originalProductPixelEquivalence: 'NOT_CLAIMED',
    revision: f.session.state.revision, graphChannels: results.length});
  report.textContent = JSON.stringify({results, originalSHA: f.sha256,
    finalChangedPixels: changedCount(baselineFinal, adjustedFinal),
    refinePreviewChangedPixels:changedCount(adjustedPreview,refinedPreview),
    refineFinalChangedPixels:changedCount(adjustedFinal,refinedFinal)});
  f.eventLog.length = 0;
  byID('#native-events').textContent = 'READY_FOR_TRUSTED_POINTER';
}
byID('#probe-run').addEventListener('click', () => {
  void runChecks().catch(error => {
    verdict.textContent = JSON.stringify({result: 'POINT-CURVES-EDITOR-BROWSER-FAIL',
      error: error?.message ?? String(error), stack: error?.stack});
    report.textContent = JSON.stringify({sessionError: ready?.session.state.error,
      revision: ready?.session.state.revision,
      pointCurves: curves(ready?.session.state.recipe),
      uiError: byID('#error-banner')?.textContent});
  });
});
