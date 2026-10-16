import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../src/photo-policy.js';

// Same JSON grammar and limits as Web's add-shadow-manual-contract.mjs.
// Structural Recipe acceptance is NOT Asset lookup, permission or save CAS.
const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300,
  backdropID: '22222222-2222-4222-8222-222222222222',
  backdropSHA256: 'b'.repeat(64)});
const settings = () => ({mode: 'soft', opacity: 70, blur: 12, gradient: 20,
  blend: 'multiply', offsetX: 10, offsetY: -5, shadowColor: [10, 20, 30]});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
  binding: binding(), subjectStrokes: [stroke(), stroke('ERASE')], settings: settings()});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();
  value.parameters.extendedParameters.addShadowManual = extension;
  return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('SHADOW-RECIPE-01: optional typed document preserves old Recipe v1, B/W document and processing order', () => {
  const old = neutral(), fresh = recipe();
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(fresh))));
  assert.deepEqual(fresh.parameters.processingOrder, old.parameters.processingOrder);
  assert.equal(fresh.parameters.processingOrder.includes('addShadowManual'), false);
  const bw = {schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: binding().assetID, originalSHA256: binding().originalSHA256,
      sourceWidth: 400, sourceHeight: 300},
    subjectStrokes: [stroke()], correctionStrokes: [stroke()]};
  fresh.parameters.extendedParameters.bwEdgeManual = bw;
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotMatch(JSON.stringify(fresh), /savedRevision|permissionEvidence|originalBytes|bitmap/u);
});

test('SHADOW-RECIPE-02: exact document/binding reject authority claims, other Asset, SHA and oversized dimensions', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 4}, {...base, permissionEvidence: {allowed: true}},
    {...base, bitmap: []}, {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), backdropID: binding().assetID}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), bytes: 'forged'}}], /INVALID_ADD_SHADOW_MANUAL/u);
  const hidden = manual() as typeof base & {[key: symbol]: unknown};
  hidden[Symbol('authority')] = true;
  assert.throws(() => validateRecipe(recipe(hidden)), /INVALID_ADD_SHADOW_MANUAL/u);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter must not run');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_ADD_SHADOW_MANUAL/u);
});

test('SHADOW-RECIPE-03: normalized stroke, ADD, point and work limits match typed Web contract', () => {
  const base = manual();
  rejects([{...base, subjectStrokes: []},
    {...base, subjectStrokes: [stroke('ERASE')]},
    {...base, subjectStrokes: Array.from({length: 65}, () => stroke())},
    {...base, subjectStrokes: [{...stroke(), operation: 'add'}]},
    {...base, subjectStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, subjectStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, subjectStrokes: [{...stroke(), aiMask: true}]},
    {...base, subjectStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, subjectStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, subjectStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_ADD_SHADOW_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, subjectStrokes: sparse})),
    /INVALID_ADD_SHADOW_MANUAL_STROKES/u);
  const path = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    subjectStrokes: [stroke('ADD', path), stroke('ERASE', path)]})),
  /INVALID_ADD_SHADOW_MANUAL_CAPACITY/u);
});

test('SHADOW-RECIPE-04: exact settings and JSON-byte limit reject malformed or excessive documents', () => {
  const base = manual();
  rejects([{...base, settings: {...settings(), opacity: 101}},
    {...base, settings: {...settings(), opacity: NaN}},
    {...base, settings: {...settings(), offsetY: -257}},
    {...base, settings: {...settings(), mode: 'ai'}},
    {...base, settings: {...settings(), aiSubject: true}},
    {...base, settings: {...settings(), shadowColor: [1, , 3]}}],
  /INVALID_ADD_SHADOW_MANUAL_SETTINGS/u);
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, subjectStrokes: [stroke('ADD', path), stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)), /INVALID_ADD_SHADOW_MANUAL_JSON_LIMIT/u);
});
