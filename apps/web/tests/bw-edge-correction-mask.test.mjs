import test from 'node:test';
import assert from 'node:assert/strict';
import {BW_EDGE_REMOVAL_VERSION} from '../src/processing/bw-edge-removal.mjs';
import {validateSubjectMatte} from '../src/processing/background-composite.mjs';
import {applyBlackWhiteEdgeManualArea} from '../src/processing/bw-edge-manual-area.mjs';
import {rasterizeBWEdgeManualMasks, BW_EDGE_CORRECTION_MASK_VERSION} from
  '../src/processing/bw-edge-correction-mask.mjs';

const binding = {assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 32, sourceHeight: 16};
const stroke = (u, v = .5, operation = 'ADD', radiusFraction = .12, hardness = 1) =>
  ({operation, path: [{u, v}], radiusFraction, hardness});
const doc = (source = binding) => ({schemaVersion: 1,
  engineVersion: BW_EDGE_REMOVAL_VERSION, binding: {...source},
  subjectStrokes: [stroke(.25)], correctionStrokes: [stroke(.75)]});
const runtime = (source = binding, revision = 4) => ({...source,
  draftBaseRevision: revision, savedRevision: revision,
  confirmedSelections: {subject: true, correction: true},
  permissionEvidence: {...source, savedRevision: revision, action: 'edit', allowed: true}});
function frame(width = 32, height = 16) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++)
    data.set([110, 70, 50, 255], index * 4);
  return {width, height, data};
}
const at = (mask, x, y) => mask.data[y * mask.width + x];

test('BW-CORR-01: validated two-role strokes become distinct full-source coverage and strict provenance', () => {
  const pixels = frame(), input = doc(), proof = runtime();
  const before = pixels.data.slice(), documentBefore = structuredClone(input), runtimeBefore = structuredClone(proof);
  const result = rasterizeBWEdgeManualMasks(pixels, input, proof, {target: 'source'});
  const {subjectMask: subject, correctionMask: correction} = result;
  assert.equal(BW_EDGE_CORRECTION_MASK_VERSION, 'suite-owner-manual-bw-edge-two-role-masks-1');
  assert.equal(subject.provenance.kind, 'subject-alpha-mask');
  assert.equal(subject.provenance.source, 'verified-manual-subject-matte');
  assert.deepEqual(correction.provenance, {kind: 'bw-edge-correction-mask',
    source: 'owner-manual-bw-edge-correction-strokes',
    assetID: binding.assetID, originalSHA256: binding.originalSHA256,
    savedRevision: 4, sourceWidth: 32, sourceHeight: 16,
    target: 'source', width: 32, height: 16});
  assert.equal(at(subject, 8, 8), 255);
  assert.equal(at(subject, 24, 8), 0);
  assert.equal(at(correction, 8, 8), 0);
  assert.equal(at(correction, 24, 8), 255);
  assert.throws(() => validateSubjectMatte(correction,
    {assetID: binding.assetID, originalSHA256: binding.originalSHA256,
      savedRevision: 4}, 32, 16), /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  assert.throws(() => applyBlackWhiteEdgeManualArea(pixels, subject, correction),
    /BW_EDGE_MANUAL_MASK_INVALID/,
  'provenance-bearing masks must be verified and deliberately projected to the 3-key pixel adapter');
  assert.deepEqual(pixels.data, before);
  assert.deepEqual(input, documentBefore);
  assert.deepEqual(proof, runtimeBefore);
});

test('BW-CORR-02: normalized correction keeps position on exact 1600px Proxy; crop/rotated size is rejected', () => {
  const source = {...binding, sourceWidth: 4000, sourceHeight: 2000};
  const result = rasterizeBWEdgeManualMasks(frame(1600, 800), doc(source), runtime(source),
    {target: 'proxy'});
  assert.equal(result.correctionMask.provenance.sourceWidth, 4000);
  assert.equal(result.correctionMask.provenance.sourceHeight, 2000);
  assert.equal(result.correctionMask.provenance.width, 1600);
  assert.equal(result.correctionMask.provenance.height, 800);
  assert.equal(at(result.subjectMask, 400, 400), 255);
  assert.equal(at(result.correctionMask, 1200, 400), 255);
  assert.throws(() => rasterizeBWEdgeManualMasks(frame(1600, 800), doc(source), runtime(source),
    {target: 'source'}), /BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(() => rasterizeBWEdgeManualMasks(frame(800, 400), doc(source), runtime(source),
    {target: 'proxy'}), /BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(() => rasterizeBWEdgeManualMasks(frame(), doc(), runtime()),
    /BW_EDGE_MANUAL_TARGET_INVALID/);
});

test('BW-CORR-03: erase and alpha-zero suppress only their own painted coverage', () => {
  const pixels = frame(), input = doc();
  input.correctionStrokes.push(stroke(.75, .5, 'ERASE', .04));
  pixels.data[(8 * 32 + 25) * 4 + 3] = 0;
  const before = pixels.data.slice();
  const {subjectMask, correctionMask} = rasterizeBWEdgeManualMasks(pixels, input, runtime(),
    {target: 'source'});
  assert.equal(at(correctionMask, 24, 8), 0);
  assert.equal(at(correctionMask, 25, 8), 0);
  assert.ok(at(correctionMask, 22, 8) > 0);
  assert.equal(at(subjectMask, 8, 8), 255);
  assert.deepEqual(pixels.data, before);
});

test('BW-CORR-04: unconfirmed, stale, cross-Asset, forged-shape or wrong-role strokes fail closed', () => {
  const pixels = frame(), input = doc(), before = pixels.data.slice();
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels, input,
    {...runtime(), confirmedSelections: {subject: true, correction: false}},
    {target: 'source'}), /BW_EDGE_MANUAL_OWNER_CONFIRMATION_REQUIRED/);
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels, input,
    {...runtime(), savedRevision: 5}, {target: 'source'}), /BW_EDGE_MANUAL_REVISION_MISMATCH/);
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels, input,
    {...runtime(), assetID: '22222222-2222-4222-8222-222222222222'},
    {target: 'source'}), /BW_EDGE_MANUAL_BINDING_MISMATCH/);
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels,
    {...input, correctionStrokes: [{operation: 'ADD', path: [{x: .5, y: .5}], radiusFraction: .1, hardness: 1}]},
    runtime(), {target: 'source'}), /BW_EDGE_MANUAL_POINT_INVALID/);
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels,
    {...input, correctionStrokes: [stroke(.75, .5, 'ERASE')]},
    runtime(), {target: 'source'}), /BW_EDGE_MANUAL_ADD_REQUIRED/);
  assert.deepEqual(pixels.data, before);
});

test('BW-CORR-05: combined 96M brush work limit rejects before rasterization', () => {
  const source = {...binding, sourceWidth: 1600, sourceHeight: 1600};
  const wide = {operation: 'ADD', path: [{u: .1, v: .5}, {u: .9, v: .5}],
    radiusFraction: .25, hardness: 1};
  const input = doc(source);
  input.subjectStrokes = Array.from({length: 32}, () => structuredClone(wide));
  input.correctionStrokes = Array.from({length: 32}, () => structuredClone(wide));
  assert.throws(() => rasterizeBWEdgeManualMasks(frame(1600, 1600), input, runtime(source),
    {target: 'source'}), /BW_EDGE_MANUAL_WORK_LIMIT/);
});

test('BW-CORR-06: abort before and during authoring never mutates source or document', () => {
  const pixels = frame(256, 256), source = {...binding, sourceWidth: 256, sourceHeight: 256};
  const input = doc(source), proof = runtime(source);
  const before = pixels.data.slice(), documentBefore = structuredClone(input);
  const controller = new AbortController();controller.abort();
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels, input, proof,
    {target: 'source', signal: controller.signal}), error => error.name === 'AbortError');
  let reads = 0;
  assert.throws(() => rasterizeBWEdgeManualMasks(pixels, input, proof,
    {target: 'source', signal: {get aborted() {return ++reads >= 20;}}}),
  error => error.name === 'AbortError');
  assert.ok(reads >= 20);
  assert.deepEqual(pixels.data, before);
  assert.deepEqual(input, documentBefore);
});
