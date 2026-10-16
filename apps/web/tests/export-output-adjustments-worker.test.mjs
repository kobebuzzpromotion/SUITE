import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext, runInContext, runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createProcessing} from '../src/processing/index.mjs';
import {applyExportOutputSharpening} from '../src/export-output-adjustments.mjs';

const manual = {kind: 'manual', gain: 1.5, radiusPx: 1, thresholdLuma: 0};
function frame() {
  const values = [100, 100, 100, 180, 180, 180];
  const data = new Uint8ClampedArray(values.length * 4);
  for (let i = 0; i < values.length; i++) data.set([values[i], values[i], values[i], 255], i * 4);
  return {width: values.length, height: 1, data};
}

async function withTransport(run) {
  const previous = globalThis.Worker, workers = [];
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(message, transfer) { this.message = structuredClone(message, {transfer}); }
    terminate() { this.terminated = true; }
    reply(result) { this.onmessage?.({data: {id: this.message.id, result}}); }
  }
  globalThis.Worker = FakeWorker;
  try { await run(workers); }
  finally { if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous; }
}

const bundle = await build({entryPoints: [fileURLToPath(new URL('../src/processing/worker.mjs', import.meta.url))],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022', external: ['module'], write: false, logLevel: 'silent'});
const workerCode = bundle.outputFiles[0].text;
function actualWorker() {
  const messages = [], self = {postMessage(message) { messages.push(message); }};
  const context = createContext({self, Uint8ClampedArray, Uint8Array, ArrayBuffer, DataView, DOMException,
    Blob, URL, structuredClone, crypto: globalThis.crypto, setTimeout, clearTimeout, fetch, console});
  runInContext(workerCode, context);
  return {self, messages};
}
async function request(runtime, id, method, args) {
  runtime.messages.length = 0;
  await runtime.self.onmessage({data: {id, method, args}});
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].id, id);
  return runtime.messages[0];
}

test('OUTPUT-WK-01 facade default none preserves legacy pixels and transfers only its own copy', () => withTransport(async workers => {
  const processing = createProcessing(), source = frame(), before = source.data.slice();
  const pending = processing.applyExportOutputSharpening(source);
  assert.equal(workers[0].message.method, 'applyExportOutputSharpening');
  assert.deepEqual(workers[0].message.args[1], {kind: 'none'});
  workers[0].message.args[0].data.fill(0);
  assert.deepEqual(source.data, before);
  workers[0].reply({...source, data: before.slice()});
  assert.deepEqual((await pending).data, before);
  assert.equal(workers[0].terminated, true);
  processing.dispose();
}));

test('OUTPUT-WK-02 facade copies foreign plain JSON; rejects unsupported official preset/class/symbol and aborts in flight', () => withTransport(async workers => {
  const processing = createProcessing(), source = frame(), before = source.data.slice();
  const foreign = runInNewContext('({kind:"manual",gain:1.5,radiusPx:1,thresholdLuma:0})');
  const pending = processing.applyExportOutputSharpening(source, foreign);
  assert.deepEqual(workers[0].message.args[1], manual);
  workers[0].reply(applyExportOutputSharpening(source, manual));
  assert.notDeepEqual((await pending).data, before);
  for (const invalid of [{kind: 'screen-low'}, runInNewContext('new (class Setting {constructor(){this.kind="none"}})') ,
    runInNewContext('({kind:"none",[Symbol("unexpected")]:1})')])
    await assert.rejects(processing.applyExportOutputSharpening(source, invalid), /OUTPUT_SHARPENING_/);
  assert.equal(workers.length, 1);
  const controller = new AbortController();
  const cancelled = processing.applyExportOutputSharpening(source, manual, {signal: controller.signal});
  controller.abort();
  workers[1].reply(applyExportOutputSharpening(source, manual));
  await assert.rejects(cancelled, {name: 'AbortError'});
  assert.equal(workers[1].terminated, true);
  assert.deepEqual(source.data, before);
  processing.dispose();
}));

test('OUTPUT-WK-03 bundled actual Worker applies manual pixels, alpha/hidden RGB stay intact, none remains exact', async () => {
  const runtime = actualWorker(), source = frame(), before = source.data.slice();
  source.data.set([240, 2, 99, 0], 0);
  const withHidden = source.data.slice();
  const neutral = await request(runtime, 1, 'applyExportOutputSharpening', [source, {kind: 'none'}]);
  assert.equal(neutral.error, undefined);
  assert.deepEqual(neutral.result.data, withHidden);
  const active = await request(runtime, 2, 'applyExportOutputSharpening', [source, runInNewContext('({kind:"manual",gain:1.5,radiusPx:1,thresholdLuma:0})')]);
  assert.equal(active.error, undefined);
  assert.deepEqual(active.result.data, applyExportOutputSharpening(source, manual).data);
  assert.deepEqual(active.result.data.slice(0, 4), withHidden.slice(0, 4));
  assert.notDeepEqual(active.result.data, neutral.result.data);
  assert.deepEqual(source.data, withHidden);
  assert.notDeepEqual(source.data, before);
});

test('OUTPUT-WK-04 actual Worker does not invent Screen/Print mappings or accept unknown settings', async () => {
  const runtime = actualWorker();
  for (const invalid of [{kind: 'print-high'}, {...manual, unknown: 1}, {...manual, radiusPx: 10}]) {
    const response = await request(runtime, 10, 'applyExportOutputSharpening', [frame(), invalid]);
    assert.equal(response.result, undefined);
    assert.match(response.error?.message ?? '', /OUTPUT_SHARPENING_/);
  }
});

test('OUTPUT-WK-05 actual Worker can run in explicit Final resize → sharpen order without changing the pre-resize frame', async () => {
  const runtime = actualWorker();
  const original = {width: 12, height: 2, data: new Uint8ClampedArray(12 * 2 * 4)};
  for (let y = 0; y < 2; y++) for (let x = 0; x < 12; x++) {
    const value = x < 6 ? 100 : 180;
    original.data.set([value, value, value, 255], (y * 12 + x) * 4);
  }
  const before = original.data.slice();
  const resized = await request(runtime, 11, 'resizeForExport', [original, {kind: 'width', value: 6}]);
  assert.equal(resized.error, undefined);
  assert.deepEqual([resized.result.width, resized.result.height], [6, 1]);
  const sharpened = await request(runtime, 12, 'applyExportOutputSharpening', [resized.result, manual]);
  assert.equal(sharpened.error, undefined);
  assert.deepEqual([sharpened.result.width, sharpened.result.height], [6, 1]);
  assert.notDeepEqual(sharpened.result.data, resized.result.data);
  assert.deepEqual(original.data, before);
});
