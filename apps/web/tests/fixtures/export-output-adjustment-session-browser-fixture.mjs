import {EditorSession, checksum, neutralRecipe} from '../../src/session.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Test-only decode of two saved synthetic NON_RAW Originals. Everything from
// Session render through resize, output sharpening and encode uses real Workers.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const originals = new Map([[A, new TextEncoder().encode('OUTPUT_NON_RAW_A').buffer],
  [B, new TextEncoder().encode('OUTPUT_NON_RAW_B').buffer]]);
const assets = [];
for (const [id, bytes] of originals) assets.push({id, name: id === A ? 'first.NONRAW' : 'second.NONRAW',
  sha256: await checksum(bytes), size: bytes.byteLength, deletedAt: null, cloudSafe: true});
const recipes = new Map(assets.map(asset => [asset.id, {assetId: asset.id, revision: 2, body: neutralRecipe()}]));
const recipeSnapshots = new Map([...recipes].map(([id, saved]) => [id, JSON.stringify(saved.body)]));
const clone = value => structuredClone(value);
const manual = {kind: 'manual', gain: 1.5, radiusPx: 1, thresholdLuma: 0};
let scenario = 'success', encodeCount = 0, decodeCount = 0;
const stages = [], encodedFrames = [];
const assert = (condition, label) => { if (!condition) throw Error('OUTPUT_SESSION_BROWSER_ASSERTION: ' + label); };
const equalBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

function syntheticFrame(id) {
  const width = 12, height = 8, data = new Uint8ClampedArray(width * height * 4);
  const low = id === A ? 80 : 100, high = id === A ? 170 : 190;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = x < 6 ? low : high;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  return {width, height, data};
}

const api = {
  async listAssets() { return clone(assets); },
  async getRecipe(id) { return clone(recipes.get(id) ?? null); },
  async assertPermission(id, action) {
    if (!originals.has(id) || action !== 'export') throw Error('FIXTURE_PERMISSION_DENIED');
    return {authorized: true};
  },
  async getOriginal(id) {
    if (scenario === 'fail-second' && id === A && encodeCount >= 1) return new Uint8Array([9, 8, 7]).buffer;
    return originals.get(id)?.slice(0);
  },
  async saveRecipe() { throw Error('FIXTURE_WRITE_FORBIDDEN'); },
};
const caches = new Map(assets.map(asset => [asset.id, {asset: clone(asset), proxy: syntheticFrame(asset.id),
  history: [neutralRecipe()], cursor: 0, revision: 2, reference: null, dirty: false}]));
const storage = {async get(id) { return clone(caches.get(id)); }, async put() { throw Error('FIXTURE_WRITE_FORBIDDEN'); }};
const worker = createProcessing({workerURL: '/processing-worker.js'});
const processing = {...worker, syntheticTestOnly: true,
  async decodeRaw(bytes, {mode, signal} = {}) {
    assert(mode === 'final', 'only Final synthetic decode allowed');
    const original = new TextDecoder().decode(bytes);
    const id = original === 'OUTPUT_NON_RAW_A' ? A : original === 'OUTPUT_NON_RAW_B' ? B : null;
    assert(id, 'only synthetic non-RAW Original is accepted');
    decodeCount++;
    if (scenario === 'hold-single' || scenario === 'hold-second' && decodeCount === 2)
      await new Promise((_, reject) => {
        if (signal?.aborted) { reject(new DOMException('cancelled', 'AbortError')); return; }
        signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), {once: true});
      });
    return {pixels: syntheticFrame(id), provenance: {fixture: 'SYNTHETIC_NON_RAW'}};
  },
  async resizeForExport(pixels, settings, options) {
    stages.push('resize');
    const output = await worker.resizeForExport(pixels, settings, options);
    stages.push({resized: output.data.slice(), width: output.width, height: output.height});
    return output;
  },
  async applyExportOutputSharpening(pixels, settings, options) {
    stages.push('sharpen');
    const output = await worker.applyExportOutputSharpening(pixels, settings, options);
    stages.push({sharpened: output.data.slice(), width: output.width, height: output.height});
    return output;
  },
  async encode(pixels, options) {
    stages.push('encode'); encodeCount++;
    encodedFrames.push({format: options.format, width: pixels.width, height: pixels.height, data: pixels.data.slice()});
    return worker.encode(pixels, options);
  },
};
const session = new EditorSession({api, storage, processing, personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
await session.initialize(); await session.openAsset(A);

const verdict = document.querySelector('#verdict');
const size = {kind: 'width', value: 6};
function clearStages() { stages.length = 0; encodedFrames.length = 0; encodeCount = 0; decodeCount = 0; }
async function unchanged() {
  for (const asset of assets) {
    assert(await checksum(originals.get(asset.id)) === asset.sha256, asset.id + ' Original SHA unchanged');
    assert(JSON.stringify(recipes.get(asset.id).body) === recipeSnapshots.get(asset.id), asset.id + ' saved Recipe unchanged');
    assert(recipes.get(asset.id).revision === 2, asset.id + ' saved revision unchanged');
  }
  assert(session.state.asset?.id === A && session.state.revision === 2 && !session.state.dirty,
    'current selected Asset and saved state unchanged');
}

function tiffPixels(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer), u16 = at => view.getUint16(at, true), u32 = at => view.getUint32(at, true);
  assert(bytes[0] === 73 && bytes[1] === 73 && u16(2) === 42, 'TIFF header');
  const ifd = u32(4), count = u16(ifd), tags = new Map();
  for (let index = 0; index < count; index++) {
    const at = ifd + 2 + index * 12, type = u16(at + 2), length = u32(at + 4) * (type === 3 ? 2 : type === 5 ? 8 : 4);
    const address = length > 4 ? u32(at + 8) : at + 8;
    tags.set(u16(at), type === 3 ? u16(address) : u32(address));
  }
  const offset = tags.get(273), length = tags.get(279);
  assert(tags.get(256) === 6 && tags.get(257) === 4 && tags.get(258) === 8 && tags.get(259) === 1,
    'post-resize TIFF 6x4 RGBA8');
  assert(offset + length <= bytes.length && length === 6 * 4 * 4, 'TIFF pixel bounds');
  return bytes.slice(offset, offset + length);
}

async function pngPixels(blob) {
  const image = await createImageBitmap(blob);
  try {
    assert(image.width === 6 && image.height === 4, 'post-resize PNG 6x4');
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  } finally { image.close(); }
}

async function checkSingle(format) {
  scenario = 'success'; clearStages();
  const neutral = await session.exportFinal({format, size});
  assert(stages[0] === 'resize' && stages.at(-1) === 'encode' && !stages.includes('sharpen'),
    format + ' omitted setting stays legacy none');
  const neutralPixels = encodedFrames[0].data.slice();
  clearStages();
  const sharpened = await session.exportFinal({format, size, outputSharpening: manual});
  assert(JSON.stringify(stages.filter(value => typeof value === 'string')) === JSON.stringify(['resize', 'sharpen', 'encode']),
    format + ' Final order: resize -> sharpen -> encode');
  assert(stages[1].width === 6 && stages[1].height === 4 && stages[3].width === 6 && stages[3].height === 4,
    format + ' manual stage uses already resized Final dimensions');
  assert(!equalBytes(neutralPixels, encodedFrames[0].data), format + ' manual differs from none');
  assert(equalBytes(stages[3].sharpened, encodedFrames[0].data), format + ' sharpened pixels delivered to encoder');
  if (format === 'tiff') {
    assert(sharpened.type === 'image/tiff' && equalBytes(tiffPixels(await sharpened.arrayBuffer()), encodedFrames[0].data),
      'TIFF Blob contains actual sharpened pixels');
    assert(equalBytes(tiffPixels(await neutral.arrayBuffer()), neutralPixels), 'default TIFF Blob contains unsharpened pixels');
  } else {
    assert(sharpened.type === 'image/png' && equalBytes(await pngPixels(sharpened), encodedFrames[0].data),
      'PNG Blob decodes to actual sharpened pixels');
    assert(equalBytes(await pngPixels(neutral), neutralPixels), 'default PNG Blob decodes unsharpened pixels');
  }
  await unchanged();
  return {format, neutralBytes: neutral.size, manualBytes: sharpened.size, width: 6, height: 4};
}

async function waitFor(predicate, label) {
  const deadline = performance.now() + 15000;
  while (!predicate()) {
    if (performance.now() > deadline) throw Error('OUTPUT_BROWSER_TIMEOUT: ' + label);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function run() {
  const singles = [await checkSingle('tiff'), await checkSingle('png')];

  clearStages();
  for (const invalid of [{kind: 'screen-high'}, {...manual, gain: -1}, {...manual, radiusPx: Number.NaN}]) {
    let rejected = false;
    try { await session.exportFinal({format: 'tiff', size, outputSharpening: invalid}); }
    catch (error) { rejected = String(error?.message).includes('OUTPUT_SHARPENING_'); }
    assert(rejected && encodeCount === 0 && decodeCount === 0, 'invalid output setting rejected before Final');
  }
  await unchanged();

  scenario = 'hold-single'; clearStages();
  const cancelled = session.exportFinal({format: 'tiff', size, outputSharpening: manual});
  await waitFor(() => decodeCount === 1 && session.state.exporting, 'single Final decode hold');
  session.cancelExport();
  let singleCancelled = false;
  try { await cancelled; } catch { singleCancelled = true; }
  assert(singleCancelled && encodeCount === 0, 'cancelled single Final returns no Blob');
  await unchanged();

  scenario = 'success'; clearStages();
  const batch = await session.exportBatchFinal({orderedIds: [B, A], format: 'tiff', size, outputSharpening: manual});
  assert(batch.status === 'complete' && JSON.stringify(batch.items.map(item => item.assetId)) === JSON.stringify([B, A]),
    'explicit two-photo Batch order');
  assert(batch.items.length === 2 && encodeCount === 2 && stages.filter(value => value === 'sharpen').length === 2,
    'both Batch images sharpened before release');
  for (let index = 0; index < 2; index++)
    assert(batch.items[index].blob.type === 'image/tiff' &&
      equalBytes(tiffPixels(await batch.items[index].blob.arrayBuffer()), encodedFrames[index].data),
      'Batch TIFF ' + index + ' contains corresponding sharpened pixels');
  await unchanged();

  scenario = 'fail-second'; clearStages();
  let failedBatchResult, secondFailed = false;
  try { failedBatchResult = await session.exportBatchFinal({orderedIds: [B, A], format: 'tiff', size, outputSharpening: manual}); }
  catch (error) { secondFailed = String(error?.message).includes('RAW_CHECKSUM_'); }
  assert(secondFailed && failedBatchResult === undefined && encodeCount === 1,
    'second Original mismatch after first encode exposes no partial Batch result');
  await unchanged();

  scenario = 'hold-second'; clearStages();
  let cancelledBatchResult;
  const pendingBatch = session.exportBatchFinal({orderedIds: [B, A], format: 'tiff', size, outputSharpening: manual});
  await waitFor(() => decodeCount === 2 && encodeCount === 1 && session.state.exporting, 'second Batch decode hold');
  session.cancelExport();
  let batchCancelled = false;
  try { cancelledBatchResult = await pendingBatch; } catch { batchCancelled = true; }
  assert(batchCancelled && cancelledBatchResult === undefined && encodeCount === 1,
    'cancel after first internal Blob exposes no partial Batch result');
  await unchanged();

  verdict.textContent = JSON.stringify({status: 'PASS', boundary: 'synthetic saved non-RAW EditorSession -> real Worker Final resize -> manual output sharpen -> TIFF/PNG Blob',
    userAgent: navigator.userAgent, singles, invalid: 'pre-Final rejected', cancel: 'no Blob/result',
    batch: 'two ordered TIFFs; second failure and cancellation expose no partial result',
    originals: 'SHA unchanged', recipes: 'saved revision 2 unchanged'});
  worker.dispose();
}

document.querySelector('#run').addEventListener('click', () => {
  verdict.textContent = 'RUNNING';
  void run().catch(error => {
    verdict.textContent = JSON.stringify({status: 'FAIL', error: String(error?.stack ?? error),
      sessionError: session.state.error, scenario, encodeCount, decodeCount, stages: stages.filter(value => typeof value === 'string')});
    worker.dispose();
  });
});
