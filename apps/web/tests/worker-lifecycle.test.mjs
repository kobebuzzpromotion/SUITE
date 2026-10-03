import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessing} from '../src/processing/index.mjs';
import {syntheticPixels} from './fixtures.mjs';

// Fake Worker transport, real structuredClone transfer: not a browser/WASM/detector execution.
async function withWorker(body) {
  const previous = globalThis.Worker, workers = [];
  class FakeWorker {
    constructor(url) {this.url = url; this.terminated = false; workers.push(this);}
    postMessage(message, transfer) {this.message = structuredClone(message, {transfer});}
    terminate() {this.terminated = true;}
    reply(value, id = this.message.id) {this.onmessage?.({data: {id, result: value}});}
  }
  globalThis.Worker = FakeWorker;
  try {await body(workers);} finally {if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous;}
}

test('WEB-WK01 / MOCK_WORKER: transferred decoder input is an owned copy; Original remains readable', () => withWorker(async workers => {
  const p = createProcessing(), original = new Uint8Array([1, 2, 3, 4]).buffer;
  const operation = p.decodeRaw(original, {mode: 'proxy'}), worker = workers[0];
  assert.equal(original.byteLength, 4); new Uint8Array(worker.message.args[0]).fill(9);
  assert.deepEqual(Array.from(new Uint8Array(original)), [1, 2, 3, 4]);
  worker.reply({fixture: 'NON_RAW_TRANSPORT'}); await operation; assert.equal(worker.terminated, true); p.dispose();
}));

test('WEB-WK02 / MOCK_WORKER: pixel transfer never detaches or mutates unedited base', () => withWorker(async workers => {
  const p = createProcessing(), input = syntheticPixels(2, 2), before = input.data.slice();
  const operation = p.makeProxy(input, 1), worker = workers[0]; worker.message.args[0].data.fill(0);
  assert.deepEqual(input.data, before); worker.reply(syntheticPixels(1, 1)); await operation;
  assert.equal(worker.terminated, true); p.dispose();
}));

test('WEB-WK03 / MOCK_WORKER: cancellation terminates active worker and ignores late output', () => withWorker(async workers => {
  const p = createProcessing(), controller = new AbortController();
  const operation = p.detectPeople(syntheticPixels(2, 2), {signal: controller.signal});
  controller.abort(); workers[0].reply([{fakeLateOutput: true}]);
  await assert.rejects(operation, error => error.name === 'AbortError');
  assert.equal(workers[0].terminated, true); p.dispose();
}));

test('WEB-WK04 / MOCK_WORKER: timeout rejects and terminates, never returning partial success', () => withWorker(async workers => {
  const p = createProcessing({timeoutMs: 10});
  await assert.rejects(p.makeProxy(syntheticPixels(2, 2), 1), /PROCESSING_TIMEOUT/);
  assert.equal(workers[0].terminated, true); p.dispose();
}));

test('WEB-WK05 / MOCK_WORKER: dispose aborts every pending operation and prohibits reuse', () => withWorker(async workers => {
  const p = createProcessing(), first = p.makeProxy(syntheticPixels(2, 2), 1), second = p.makeProxy(syntheticPixels(2, 2), 1);
  p.dispose(); await assert.rejects(first, error => error.name === 'AbortError'); await assert.rejects(second, error => error.name === 'AbortError');
  assert.ok(workers.every(w => w.terminated)); await assert.rejects(p.makeProxy(syntheticPixels(2, 2), 1), /PROCESSING_DISPOSED/);
}));

test('WEB-WK06 / MOCK_WORKER: unrelated response ID cannot finish the pending operation', () => withWorker(async workers => {
  const p = createProcessing(); let finished = false;
  const operation = p.makeProxy(syntheticPixels(2, 2), 1).then(value => {finished = true; return value;});
  const worker = workers[0]; worker.reply({wrong: true}, worker.message.id + 1); await Promise.resolve();
  assert.equal(finished, false); assert.equal(worker.terminated, false);
  worker.reply({right: true}); assert.deepEqual(await operation, {right: true}); p.dispose();
}));
