import {createProcessing} from '../../src/processing/index.mjs';

const verdict = document.querySelector('#verdict');
const assert = (condition, label) => { if (!condition) throw Error('OUTPUT_BROWSER_ASSERTION: ' + label); };
const equalBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const manual = {kind: 'manual', gain: 1.5, radiusPx: 1, thresholdLuma: 0};

function source(hidden) {
  const width = 12, height = 2, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = x < 6 ? 100 : 180;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  data.set([hidden, hidden, hidden, 0], 0);
  return {width, height, data};
}

function tiffSamples(blobBytes) {
  const bytes = new Uint8Array(blobBytes), view = new DataView(bytes.buffer);
  assert(bytes[0] === 73 && bytes[1] === 73 && view.getUint16(2, true) === 42, 'TIFF little-endian header');
  const ifd = view.getUint32(4, true), count = view.getUint16(ifd, true), tags = new Map();
  for (let index = 0; index < count; index++) {
    const at = ifd + 2 + index * 12;
    tags.set(view.getUint16(at, true), {type: view.getUint16(at + 2, true), count: view.getUint32(at + 4, true), value: view.getUint32(at + 8, true)});
  }
  const width = tags.get(256)?.value, height = tags.get(257)?.value;
  const start = tags.get(273)?.value, length = tags.get(279)?.value;
  assert(width === 6 && height === 1 && tags.get(259)?.value === 1 && tags.get(277)?.value === 4,
    'post-resize uncompressed RGBA8 Final TIFF dimensions');
  assert(start + length <= bytes.length && length === width * height * 4, 'TIFF pixel bounds');
  assert(tags.get(296)?.value === 2, 'PPI metadata unit');
  const density = tags.get(282)?.value;
  assert(density + 8 <= bytes.length && view.getUint32(density, true) === 300 && view.getUint32(density + 4, true) === 1,
    'PPI metadata value');
  return bytes.slice(start, start + length);
}

async function run() {
  const processing = createProcessing({workerURL: '/processing-worker.js'});
  try {
    const frame = source(255), original = frame.data.slice();
    const resized = await processing.resizeForExport(frame, {kind: 'width', value: 6});
    assert(resized.width === 6 && resized.height === 1, 'real Worker resized Final frame first');
    const none = await processing.applyExportOutputSharpening(resized);
    assert(equalBytes(none.data, resized.data), 'default none exact pixel identity');
    const sharp = await processing.applyExportOutputSharpening(resized, manual);
    assert(!equalBytes(sharp.data, resized.data), 'manual output sharpening changes actual edge pixels');
    assert(equalBytes(frame.data, original) && equalBytes(resized.data, none.data), 'Original and resized input unchanged');
    for (let offset = 3; offset < sharp.data.length; offset += 4)
      assert(sharp.data[offset] === resized.data[offset], 'alpha unchanged');
    const clean = source(0);
    const cleanResized = await processing.resizeForExport(clean, {kind: 'width', value: 6});
    const cleanSharp = await processing.applyExportOutputSharpening(cleanResized, manual);
    assert(equalBytes(cleanSharp.data, sharp.data), 'transparent hidden RGB cannot contaminate result');
    const blob = await processing.encode(sharp, {format: 'tiff', resolution: {unit: 'ppi', value: 300}});
    assert(blob.type === 'image/tiff' && blob.size > 0, 'real Worker encoded TIFF Blob');
    assert(equalBytes(tiffSamples(await blob.arrayBuffer()), sharp.data), 'encoded Final pixels equal sharpened frame');
    let unsupported = false;
    try { await processing.applyExportOutputSharpening(resized, {kind: 'screen-high'}); }
    catch (error) { unsupported = String(error?.message).includes('OUTPUT_SHARPENING_PRESET_UNSUPPORTED'); }
    assert(unsupported, 'official preset has no invented numeric mapping');
    const controller = new AbortController();
    const pending = processing.applyExportOutputSharpening(resized, manual, {signal: controller.signal});
    controller.abort();
    let aborted = false;
    try { await pending; } catch (error) { aborted = error?.name === 'AbortError'; }
    assert(aborted, 'in-flight real Worker abort returns no pixels');
    assert(equalBytes(frame.data, original), 'Original remains unchanged after abort');
    verdict.textContent = JSON.stringify({status: 'PASS', boundary: 'real Chrome Final resize -> output sharpen -> TIFF encode',
      userAgent: navigator.userAgent, width: sharp.width, height: sharp.height, bytes: blob.size,
      none: 'pixel identity', manual: 'pixel difference', alpha: 'unchanged', hiddenRGB: 'excluded',
      preset: 'unsupported', abort: 'rejected', source: 'unchanged'});
  } finally { processing.dispose(); }
}

document.querySelector('#run').addEventListener('click', () => {
  verdict.textContent = 'RUNNING';
  void run().catch(error => { verdict.textContent = JSON.stringify({status: 'FAIL', error: String(error?.stack ?? error)}); });
});
