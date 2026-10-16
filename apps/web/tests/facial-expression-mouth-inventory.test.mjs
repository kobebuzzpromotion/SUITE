import test from 'node:test';
import assert from 'node:assert/strict';
import {FaceLandmarker} from '@mediapipe/tasks-vision';
import {build} from 'esbuild-wasm';
import {PERSON_MODEL_SHA256} from '../src/person-privacy.mjs';
import {inspectFacialExpressionMouthLandmarks,
  requireVerifiedFacialExpressionMouthInventory} from '../src/processing/facial-expression-mouth-inventory.mjs';

const assetID = '11111111-1111-4111-8111-111111111111';
const personID = '22222222-2222-4222-8222-222222222222';
const originalSHA256 = 'a'.repeat(64);
const upper = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];

function fixture() {
  const points = Array.from({length: 468}, () => ({x: .5, y: .5, z: 0}));
  const oval = [...new Set(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL
    .flatMap(edge => [edge.start, edge.end]))];
  oval.forEach((index, position) => {
    const angle = position * 2 * Math.PI / oval.length;
    points[index] = {x: .5 + .25 * Math.cos(angle), y: .5 + .34 * Math.sin(angle), z: 0};
  });
  upper.forEach((index, position) => {
    const t = position / (upper.length - 1);
    points[index] = {x: .38 + .24 * t, y: .57 - .04 * Math.sin(Math.PI * t), z: 0};
  });
  points[13] = {x: .5, y: .595, z: 0};
  const left = Math.min(...oval.map(index => points[index].x));
  const right = Math.max(...oval.map(index => points[index].x));
  const top = Math.min(...oval.map(index => points[index].y));
  const bottom = Math.max(...oval.map(index => points[index].y));
  return {assetID, personID, originalSHA256, modelSHA256: PERSON_MODEL_SHA256,
    sourceWidth: 1000, sourceHeight: 1000, frameWidth: 1000, frameHeight: 1000,
    personAnchor: {x: left, y: 1 - bottom, width: right - left, height: bottom - top},
    faceLandmarks: [points]};
}

test('EXPRESSION-MOUTH-01: installed official lips topology maps only read-only upper lip and bound full-frame data', () => {
  const input = fixture(), snapshot = structuredClone(input);
  const result = inspectFacialExpressionMouthLandmarks(input);
  assert.equal(result.status, 'TOPOLOGY_ONLY_POSE_OCCLUSION_UNVERIFIED');
  assert.deepEqual(result.binding, {assetID, personID, originalSHA256,
    modelSHA256: PERSON_MODEL_SHA256, sourceWidth: 1000, sourceHeight: 1000,
    frameWidth: 1000, frameHeight: 1000});
  assert.equal(result.corner61.x, input.faceLandmarks[0][61].x);
  assert.equal(result.corner291.x, input.faceLandmarks[0][291].x);
  assert.equal(result.upperOuter.length, 11);
  assert.equal(result.upperOuter[5].y, input.faceLandmarks[0][0].y);
  assert.equal(result.upperInnerCenter.y, input.faceLandmarks[0][13].y);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.upperOuter));
  assert.equal(result.provenance.orientationRequirement,
    'upright-unmirrored-upper-left-not-verified');
  assert.throws(() => {result.upperOuter[0].x = .1;}, TypeError);
  assert.deepEqual(input, snapshot, 'caller landmark bytes/objects are never rewritten');
});

test('EXPRESSION-MOUTH-02: missing or ambiguous face, other person, model drift and proxy geometry fail closed', () => {
  const base = fixture();
  for (const change of [
    {faceLandmarks: []}, {faceLandmarks: [base.faceLandmarks[0], base.faceLandmarks[0]]},
    {personAnchor: {...base.personAnchor, x: .01}},
    {modelSHA256: 'b'.repeat(64)}, {originalSHA256: 'not-a-sha'},
    {frameWidth: 800}, {personID: 'other'},
  ]) assert.throws(() => inspectFacialExpressionMouthLandmarks({...base, ...change}),
    /MOUTH_INVENTORY_/);
  const absent = fixture(); delete absent.faceLandmarks[0][13];
  assert.throws(() => inspectFacialExpressionMouthLandmarks(absent), /LANDMARKS_INVALID/);
  const skew = fixture(); skew.faceLandmarks[0][291].x = skew.faceLandmarks[0][61].x + .001;
  assert.throws(() => inspectFacialExpressionMouthLandmarks(skew), /MOUTH_GEOMETRY_AMBIGUOUS/);
});

test('EXPRESSION-MOUTH-03: current x/y/z landmarker cannot authorize frontal pose or unoccluded mouth', () => {
  const candidate = inspectFacialExpressionMouthLandmarks(fixture());
  assert.throws(() => requireVerifiedFacialExpressionMouthInventory(candidate),
    /MOUTH_INVENTORY_POSE_OCCLUSION_PROOF_UNAVAILABLE/);
  assert.throws(() => requireVerifiedFacialExpressionMouthInventory({status: 'VERIFIED'}),
    /MOUTH_INVENTORY_CANDIDATE_INVALID/);
  const stopped = new AbortController(); stopped.abort();
  assert.throws(() => inspectFacialExpressionMouthLandmarks({...fixture(), signal: stopped.signal}),
    {name: 'AbortError'});
});

test('EXPRESSION-MOUTH-04 / BROWSER_BUNDLE_ONLY: candidate bundles without product mount', async () => {
  const result = await build({entryPoints: ['apps/web/src/processing/facial-expression-mouth-inventory.mjs'],
    absWorkingDir: process.cwd(), bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', write: false, logLevel: 'silent'});
  assert.equal(result.outputFiles.length, 1);
  const source = new TextDecoder().decode(result.outputFiles[0].contents);
  assert.match(source, /inspectFacialExpressionMouthLandmarks/u);
  assert.match(source, /POSE_OCCLUSION_PROOF_UNAVAILABLE/u);
});
