import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild-wasm';
import {createContext, runInContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {Worker as ThreadWorker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {prepareAddShadowWorkerRuntime} from '../src/processing/add-shadow-runtime.mjs';
import {recipe as neutralRecipe} from './fixtures.mjs';

const assetID = 'bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID = 'e51be62f-7d98-493b-943e-d0b3146b74fb';
const originalSHA256 = 'a'.repeat(64), backdropSHA256 = 'b'.repeat(64);
const sha = data => createHash('sha256').update(data).digest('hex');
function input() {
  const width = 11, height = 7;
  const original = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const selectedBackground = {width, height,
    data: new Uint8ClampedArray(width * height * 4)};
  for (let pixel = 0; pixel < width * height; pixel++) {
    original.data.set([180, 80, 60, 255], pixel * 4);
    selectedBackground.data.set([200, 200, 200, 255], pixel * 4);
  }
  const data = new Uint8Array(width * height);
  for (let y = 2; y <= 3; y++) for (let x = 2; x <= 4; x++) data[y * width + x] = 255;
  const binding = {assetID, originalSHA256, savedRevision: 2,
    sourceWidth: width, sourceHeight: height, backdropID, backdropSHA256};
  const subjectMask = {width, height, data, provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    assetID, originalSHA256, savedRevision: 2, width, height
  }};
  const selectionEvidence = {kind: 'owner-selected-image-backdrop-frame',
    ...binding, target: 'source', width, height,
    pixelsSHA256: sha(selectedBackground.data)};
  return {original, selectedBackground, subjectMask, binding,
    selectionEvidence, settings: {mode: 'drop', opacity: 80, blur: 0,
      gradient: 0, blend: 'normal', offsetX: 2, offsetY: 1,
      shadowColor: [0, 0, 0]}, target: 'source'};
}
const at = (frame, x, y) => [...frame.data.slice((y * frame.width + x) * 4,
  (y * frame.width + x) * 4 + 4)];
const bundle = await build({entryPoints: [fileURLToPath(new URL('../src/processing/worker.mjs',
  import.meta.url))], bundle: true, format: 'iife', platform: 'browser',
target: 'es2022', external: ['module'], write: false, logLevel: 'silent'});
function worker() {
  const messages = [], self = {postMessage(message) {messages.push(message);}};
  const context = createContext({self, Uint8Array, Uint8ClampedArray, ArrayBuffer,
    DataView, DOMException, TextEncoder, Blob, URL, structuredClone,
    crypto: globalThis.crypto, setTimeout, clearTimeout, fetch, console});
  runInContext(bundle.outputFiles[0].text, context);
  return {self, messages, context};
}
function inWorkerRealm(instance, payload) {
  const value = structuredClone(payload);
  value.args[0].data = [...value.args[0].data];
  value.args[1].data = [...value.args[1].data];
  instance.context.payloadJSON = JSON.stringify(value);
  return runInContext(`(() => {const p=JSON.parse(payloadJSON);
    p.args[0].data=new Uint8ClampedArray(p.args[0].data);
    p.args[1].data=new Uint8Array(p.args[1].data);return p;})()`,
  instance.context);
}
async function request(instance, id, payload) {
  instance.messages.length = 0;
  await instance.self.onmessage({data: {id, method: 'applyBoundAddShadow',
    args: [inWorkerRealm(instance, payload)]}});
  assert.equal(instance.messages.length, 1);
  assert.equal(instance.messages[0].id, id);
  return instance.messages[0];
}

test('SHADOW-WORKER-01: actual bundled Worker recomputes bound shadow from fresh RGBA and preserves inputs', async () => {
  const source = input(), original = source.original.data.slice();
  const selected = source.selectedBackground.data.slice();
  const matte = source.subjectMask.data.slice();
  const payload = await prepareAddShadowWorkerRuntime(source);
  const instance = worker();
  const result = await request(instance, 1, payload);
  assert.equal(result.error, undefined, result.error?.message);
  assert.ok(at(result.result, 5, 3)[0] < at(payload.args[0], 5, 3)[0]);
  assert.deepEqual(at(result.result, 3, 2), at(payload.args[0], 3, 2));
  assert.deepEqual(at(result.result, 0, 0), at(payload.args[0], 0, 0));
  for (let offset = 3; offset < result.result.data.length; offset += 4)
    assert.equal(result.result.data[offset], payload.args[0].data[offset]);
  assert.deepEqual([source.original.data, source.selectedBackground.data,
    source.subjectMask.data], [original, selected, matte]);
});

test('SHADOW-WORKER-02: other Asset/SHA/revision, swapped pixels and wrong source/target reject in Worker', async () => {
  const payload = await prepareAddShadowWorkerRuntime(input());
  const instance = worker();
  const variants = [
    [p => {p.args[1].provenance.assetID = '00112233-4455-4677-8899-aabbccddeeff';},
      /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/],
    [p => {p.args[2].originalSHA256 = 'c'.repeat(64);},
      /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/],
    [p => {p.args[3].savedRevision = 3;},
      /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/],
    [p => {p.args[0].data[0]++;}, /ADD_SHADOW_BACKGROUND_PIXELS_MISMATCH/],
    [p => {p.sourceWidth = 12;}, /ADD_SHADOW_WORKER_TARGET_DIMENSIONS_MISMATCH/],
    [p => {p.target = 'invalid';}, /ADD_SHADOW_WORKER_TARGET_INVALID/],
    [p => {p.args[1].data = new Uint8Array(1);}, /BACKGROUND_COMPOSITE_MASK_INVALID/],
    [p => {p.args[2].extra = true;}, /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/]
  ];
  for (let index = 0; index < variants.length; index++) {
    const [change, pattern] = variants[index];
    const bad = structuredClone(payload); change(bad);
    const response = await request(instance, index + 2, bad);
    assert.equal(response.result, undefined);
    assert.match(response.error?.message ?? '', pattern);
  }
});

test('SHADOW-WORKER-03: malformed runtime, no runtime and unsupported operation remain fail-closed', async () => {
  const payload = await prepareAddShadowWorkerRuntime(input());
  const instance = worker();
  for (const [index, bad] of [
    {...payload, extra: true},
    {...payload, method: 'render'},
    {...payload, args: payload.args.slice(0, 4)}
  ].entries()) {
    const response = await request(instance, 20 + index, bad);
    assert.match(response.error?.message ?? '', /ADD_SHADOW_WORKER_RUNTIME_INVALID/);
  }
  instance.messages.length = 0;
  await instance.self.onmessage({data: {id: 23, method: 'applyBoundAddShadow', args: []}});
  assert.match(instance.messages[0].error?.message ?? '', /ADD_SHADOW_WORKER_RUNTIME_INVALID/);
  instance.messages.length = 0;
  await instance.self.onmessage({data: {id: 24, method: 'addShadowAuto', args: []}});
  assert.match(instance.messages[0].error?.message ?? '', /UNKNOWN_PROCESSING_OPERATION/);
});

test('SHADOW-WORKER-04: legacy render without shadow runtime keeps neutral pixels and Recipe order', async () => {
  const instance = worker(), source = input().original, before = source.data.slice();
  instance.context.recipeJSON = JSON.stringify(neutralRecipe());
  const body = runInContext('JSON.parse(recipeJSON)', instance.context);
  instance.messages.length = 0;
  await instance.self.onmessage({data: {id: 30, method: 'render',
    args: [source, body, {detections: []}]}});
  const response = instance.messages[0];
  assert.equal(response.error, undefined, response.error?.message);
  assert.deepEqual(response.result.data, before);
  assert.deepEqual(Array.from(response.result.provenance.processingOrder),
    ['base', 'personEV', 'exposure', 'contrast', 'saturation', 'rotation', 'encode']);
  assert.deepEqual(source.data, before);
});

test('SHADOW-WORKER-05: abort before planning never posts a Worker operation', async () => {
  const source = input(), controller = new AbortController(); controller.abort();
  await assert.rejects(prepareAddShadowWorkerRuntime({...source,
    signal: controller.signal}), {name: 'AbortError'});
  const instance = worker();
  assert.equal(instance.messages.length, 0);
});

test('SHADOW-WORKER-06: terminating a live Worker while its digest is pending returns no partial pixels', async () => {
  const payload = await prepareAddShadowWorkerRuntime(input());
  // Delay only the platform digest, so termination happens after the real
  // bundled Worker has entered the bound-shadow operation, not before dispatch.
  const source = `const {parentPort}=require('node:worker_threads');
    const {webcrypto}=require('node:crypto');
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:async(...args)=>{
      parentPort.postMessage({type:'DIGEST_STARTED'});
      await new Promise(resolve=>setTimeout(resolve,2000));
      return webcrypto.subtle.digest(...args);
    }}}});
    globalThis.self={postMessage:message=>parentPort.postMessage({type:'RESULT',message})};
    ${bundle.outputFiles[0].text}
    parentPort.on('message',data=>self.onmessage({data}));`;
  const thread = new ThreadWorker(source, {eval: true});
  const results = [];
  thread.on('message', message => {if (message?.type === 'RESULT') results.push(message);});
  try {
    const started = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('ADD_SHADOW_WORKER_DIGEST_NOT_STARTED '+
        JSON.stringify(results.map(item => item.message?.error)))), 5000);
      const onMessage = message => {
        if (message?.type !== 'DIGEST_STARTED') return;
        clearTimeout(timer); thread.off('message', onMessage); resolve();
      };
      thread.on('message', onMessage);
    });
    thread.postMessage({id: 40, method: 'applyBoundAddShadow', args: [payload]});
    await started;
    await thread.terminate();
    assert.deepEqual(results, []);
  } finally {
    await thread.terminate();
  }
});

test('SHADOW-WORKER-07: exact 1600px proxy succeeds and cannot be replayed as source', async () => {
  const width = 1600, height = 1, original = {width, height,
    data: new Uint8ClampedArray(width * 4)};
  const selectedBackground = {width, height,
    data: new Uint8ClampedArray(width * 4)};
  for (let pixel = 0; pixel < width; pixel++) {
    original.data.set([100, 80, 60, 255], pixel * 4);
    selectedBackground.data.set([200, 200, 200, 255], pixel * 4);
  }
  const binding = {assetID, originalSHA256, savedRevision: 2,
    sourceWidth: 1601, sourceHeight: 1, backdropID, backdropSHA256};
  const subjectMask = {width, height, data: new Uint8Array(width), provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    assetID, originalSHA256, savedRevision: 2, width, height
  }};
  subjectMask.data[50] = 255;
  const selectionEvidence = {kind: 'owner-selected-image-backdrop-frame',
    ...binding, target: 'proxy', width, height,
    pixelsSHA256: sha(selectedBackground.data)};
  const payload = await prepareAddShadowWorkerRuntime({original, selectedBackground,
    subjectMask, binding, selectionEvidence, target: 'proxy', settings: {
      mode: 'drop', opacity: 80, blur: 0, gradient: 0, blend: 'normal',
      offsetX: 1, offsetY: 0, shadowColor: [0, 0, 0]
    }});
  const instance = worker(), success = await request(instance, 50, payload);
  assert.equal(success.error, undefined, success.error?.message);
  assert.ok(at(success.result, 51, 0)[0] < at(payload.args[0], 51, 0)[0]);
  const wrong = await request(instance, 51, {...payload, target: 'source'});
  assert.match(wrong.error?.message ?? '', /ADD_SHADOW_WORKER_TARGET_DIMENSIONS_MISMATCH/);
});
