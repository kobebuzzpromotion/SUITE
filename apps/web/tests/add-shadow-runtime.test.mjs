import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareAddShadowWorkerRuntime, ADD_SHADOW_RUNTIME_VERSION} from
  '../src/processing/add-shadow-runtime.mjs';
import {applyBoundAddShadow} from '../src/processing/add-shadow.mjs';

const assetID = 'cc0e33a1-fcd5-4aa2-93e5-6612ed61b0b4';
const backdropID = 'd98bf832-cf49-4d7c-af5b-55b28c79be76';
const originalSHA256 = 'a'.repeat(64), backdropSHA256 = 'b'.repeat(64);
const sha = data => createHash('sha256').update(data).digest('hex');
const settings = () => ({mode: 'drop', opacity: 80, blur: 0, gradient: 0,
  blend: 'normal', offsetX: 2, offsetY: 1, shadowColor: [0, 0, 0]});
function fixture() {
  const width = 11, height = 7;
  const original = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const selectedBackground = {width, height,
    data: new Uint8ClampedArray(width * height * 4)};
  for (let pixel = 0; pixel < width * height; pixel++) {
    original.data.set([180, 80, 60, 255], pixel * 4);
    selectedBackground.data.set([200, 200, 200, 255], pixel * 4);
  }
  const subjectData = new Uint8Array(width * height);
  for (let y = 2; y <= 3; y++) for (let x = 2; x <= 4; x++)
    subjectData[y * width + x] = 255;
  selectedBackground.data.set([19, 29, 39, 0], (6 * width + 10) * 4);
  const binding = {assetID, originalSHA256, savedRevision: 2,
    sourceWidth: width, sourceHeight: height, backdropID, backdropSHA256};
  const subjectMask = {width, height, data: subjectData, provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    assetID, originalSHA256, savedRevision: 2, width, height
  }};
  const selectionEvidence = {kind: 'owner-selected-image-backdrop-frame',
    ...binding, target: 'source', width, height,
    pixelsSHA256: sha(selectedBackground.data)};
  return {original, selectedBackground, subjectMask, binding,
    selectionEvidence, settings: settings(), target: 'source'};
}
const at = (image, x, y) => [...image.data.slice((y * image.width + x) * 4,
  (y * image.width + x) * 4 + 4)];

test('SHADOW-RUNTIME-01: strict snapshots produce structured-cloneable future Worker arguments and real four-mode pixels', async () => {
  const input = fixture();
  const before = [input.original.data.slice(), input.selectedBackground.data.slice(),
    input.subjectMask.data.slice()];
  const runtime = await prepareAddShadowWorkerRuntime(input);
  assert.equal(ADD_SHADOW_RUNTIME_VERSION, 'suite-add-shadow-runtime-explicit-image-1');
  assert.equal(runtime.method, 'applyBoundAddShadow');
  assert.equal(runtime.target, 'source');
  assert.deepEqual([runtime.sourceWidth, runtime.sourceHeight], [11, 7]);
  const cloned = structuredClone(runtime);
  const [composite, mask, evidence, binding, controls] = cloned.args;
  assert.deepEqual(at(composite, 3, 2), [180, 80, 60, 255]);
  assert.deepEqual(at(composite, 0, 0), [200, 200, 200, 255]);
  assert.equal(evidence.compositeSHA256, sha(composite.data));
  assert.deepEqual(binding, {assetID, originalSHA256, savedRevision: 2,
    backdropID, backdropSHA256});
  const rendered = await applyBoundAddShadow(composite, mask, evidence, binding, controls);
  assert.ok(at(rendered, 5, 3)[0] < at(composite, 5, 3)[0]);
  assert.deepEqual(at(rendered, 3, 2), at(composite, 3, 2));
  assert.deepEqual(at(rendered, 10, 6), at(composite, 10, 6));
  for (let index = 3; index < rendered.data.length; index += 4)
    assert.equal(rendered.data[index], composite.data[index]);
  assert.deepEqual([input.original.data, input.selectedBackground.data,
    input.subjectMask.data], before);
});

test('SHADOW-RUNTIME-02: other Asset/SHA/stale revision, mask role and selected backdrop fail before a payload', async () => {
  const input = fixture();
  for (const [key, value] of [['assetID', '26f7ff08-d05d-4b0c-b8e8-ff2452c0c54e'],
    ['originalSHA256', 'c'.repeat(64)], ['savedRevision', 3]]) {
    await assert.rejects(prepareAddShadowWorkerRuntime({...input,
      selectionEvidence: {...input.selectionEvidence, [key]: value}}),
    /ADD_SHADOW_RUNTIME_SELECTION_MISMATCH/);
    await assert.rejects(prepareAddShadowWorkerRuntime({...input,
      subjectMask: {...input.subjectMask,
        provenance: {...input.subjectMask.provenance, [key]: value}}}),
    /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  }
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    subjectMask: {...input.subjectMask, provenance: {...input.subjectMask.provenance,
      kind: 'original-shadow-mask'}}}), /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    selectionEvidence: {...input.selectionEvidence,
      backdropID: '26f7ff08-d05d-4b0c-b8e8-ff2452c0c54e'}}),
  /ADD_SHADOW_RUNTIME_SELECTION_MISMATCH/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    selectionEvidence: {...input.selectionEvidence, backdropSHA256: 'c'.repeat(64)}}),
  /ADD_SHADOW_RUNTIME_SELECTION_MISMATCH/);
});

test('SHADOW-RUNTIME-03: target/source geometry, pixel integrity and unknown provenance keys fail closed', async () => {
  const input = fixture();
  await assert.rejects(prepareAddShadowWorkerRuntime({...input, target: 'other'}),
    /ADD_SHADOW_RUNTIME_TARGET_INVALID/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input, target: 'proxy'}),
    /ADD_SHADOW_RUNTIME_SELECTION_MISMATCH/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    binding: {...input.binding, sourceWidth: 12}}),
  /ADD_SHADOW_RUNTIME_TARGET_DIMENSIONS_MISMATCH/);
  const pixels = {width: input.selectedBackground.width,
    height: input.selectedBackground.height,
    data: new Uint8ClampedArray(input.selectedBackground.data)};
  pixels.data[0]++;
  await assert.rejects(prepareAddShadowWorkerRuntime({...input, selectedBackground: pixels}),
    /ADD_SHADOW_RUNTIME_BACKDROP_PIXELS_MISMATCH/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    selectionEvidence: {...input.selectionEvidence, trusted: true}}),
  /ADD_SHADOW_RUNTIME_SELECTION_MISMATCH/);
  await assert.rejects(prepareAddShadowWorkerRuntime({...input, claimedOwner: true}),
    /ADD_SHADOW_RUNTIME_INPUT_INVALID/);
});

test('SHADOW-RUNTIME-04: pending digest uses copied pixels/mask/evidence; abort publishes nothing', async () => {
  const input = fixture();
  const pending = prepareAddShadowWorkerRuntime(input);
  input.selectedBackground.data[0] = 1;
  input.subjectMask.data[2 * 11 + 2] = 0;
  input.selectionEvidence.pixelsSHA256 = 'f'.repeat(64);
  const runtime = await pending;
  assert.deepEqual(at(runtime.args[0], 0, 0), [200, 200, 200, 255]);
  assert.equal(runtime.args[1].data[2 * 11 + 2], 255);
  const pre = fixture(), preAbort = new AbortController(); preAbort.abort();
  await assert.rejects(prepareAddShadowWorkerRuntime({...pre, signal: preAbort.signal}),
    {name: 'AbortError'});
  const during = fixture(), controller = new AbortController();
  const waiting = prepareAddShadowWorkerRuntime({...during, signal: controller.signal});
  controller.abort();
  await assert.rejects(waiting, {name: 'AbortError'});
});

test('SHADOW-RUNTIME-05: proxy geometry is explicit and accessor-backed pixel claims are rejected', async () => {
  const width = 1600, height = 1, data = new Uint8ClampedArray(width * 4);
  for (let pixel = 0; pixel < width; pixel++) data.set([140, 150, 160, 255], pixel * 4);
  const original = {width, height, data: new Uint8ClampedArray(data)};
  const selectedBackground = {width, height, data};
  const binding = {assetID, originalSHA256, savedRevision: 2,
    sourceWidth: 1601, sourceHeight: 1, backdropID, backdropSHA256};
  const subjectMask = {width, height, data: new Uint8Array(width), provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    assetID, originalSHA256, savedRevision: 2, width, height
  }};
  subjectMask.data[50] = 255;
  const selectionEvidence = {kind: 'owner-selected-image-backdrop-frame',
    ...binding, target: 'proxy', width, height, pixelsSHA256: sha(data)};
  const input = {original, selectedBackground, subjectMask, binding,
    selectionEvidence, settings: settings(), target: 'proxy'};
  const runtime = await prepareAddShadowWorkerRuntime(input);
  assert.equal(runtime.target, 'proxy');
  assert.deepEqual([runtime.sourceWidth, runtime.sourceHeight], [1601, 1]);
  const accessorFrame = {width, height, get data() {return data;}};
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    selectedBackground: accessorFrame}), /ADD_SHADOW_RUNTIME_INPUT_INVALID/);
  const accessorMask = {...subjectMask, provenance: {...subjectMask.provenance}};
  Object.defineProperty(accessorMask.provenance, 'assetID', {get: () => assetID,
    enumerable: true});
  await assert.rejects(prepareAddShadowWorkerRuntime({...input,
    subjectMask: accessorMask}), /ADD_SHADOW_RUNTIME_INPUT_INVALID/);
});
