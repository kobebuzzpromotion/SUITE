import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../src/photo-policy.js';

// Structural-only Recipe v1 gate. These fields do not authenticate the author,
// prove a teeth region, or prove the Asset/person still exists at save time.
const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300,
  personID: '33333333-3333-4333-8333-333333333333'});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-teeth-whitening-1',
  binding: binding(), teethStrokes: [stroke(), stroke('ERASE')],
  settings: {brightness: 30, desaturation: 60}});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();
  value.parameters.extendedParameters.teethManual = extension;
  return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('TEETH-RECIPE-01: optional typed manual document keeps legacy Recipe v1, other extensions and order', () => {
  const old = neutral(), fresh = recipe();
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(fresh))));
  assert.deepEqual(fresh.parameters.processingOrder, old.parameters.processingOrder);
  assert.equal(fresh.parameters.processingOrder.includes('teethManual'), false);
  const bw = {schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: binding().assetID, originalSHA256: binding().originalSHA256,
      sourceWidth: 400, sourceHeight: 300},
    subjectStrokes: [stroke()], correctionStrokes: [stroke()]};
  fresh.parameters.extendedParameters.bwEdgeManual = bw;
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotMatch(JSON.stringify(fresh),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|originalBytes/u);
});

test('TEETH-RECIPE-02: exact typed binding rejects forged authority, bad identities and dimensions', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 3}, {...base, permissionEvidence: {allowed: true}},
    {...base, ownerConfirmed: true}, {...base, bitmap: []},
    {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), personID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), revision: 1}}], /INVALID_TEETH_MANUAL/u);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_TEETH_MANUAL/u);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter must not run');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_TEETH_MANUAL/u);
});

test('TEETH-RECIPE-03: only bounded normalized ADD/ERASE strokes without AI or bitmap claims', () => {
  const base = manual();
  rejects([{...base, teethStrokes: []},
    {...base, teethStrokes: [stroke('ERASE')]},
    {...base, teethStrokes: Array.from({length: 65}, () => stroke())},
    {...base, teethStrokes: [{...stroke(), operation: 'add'}]},
    {...base, teethStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, teethStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, teethStrokes: [{...stroke(), aiTeethMask: true}]},
    {...base, teethStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, teethStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, teethStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_TEETH_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, teethStrokes: sparse})),
    /INVALID_TEETH_MANUAL_STROKES/u);
  const path = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    teethStrokes: [stroke('ADD', path), stroke('ERASE', path)]})),
  /INVALID_TEETH_MANUAL_CAPACITY/u);
});

test('TEETH-RECIPE-04: actual brightness/desaturation settings and JSON capacity are strict', () => {
  const base = manual();
  rejects([{...base, settings: {brightness: 101, desaturation: 0}},
    {...base, settings: {brightness: -101, desaturation: 0}},
    {...base, settings: {brightness: 0, desaturation: -1}},
    {...base, settings: {brightness: 0, desaturation: 101}},
    {...base, settings: {brightness: NaN, desaturation: 0}},
    {...base, settings: {brightness: 0, desaturation: Infinity}},
    {...base, settings: {brightness: 0, desaturation: 0, aiRepair: true}}],
  /INVALID_TEETH_MANUAL_SETTINGS/u);
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, teethStrokes: [stroke('ADD', path), stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)), /INVALID_TEETH_MANUAL_JSON_LIMIT/u);
});

test('TEETH-RECIPE-05: unknown teeth aliases cannot masquerade as an implemented adjustment', () => {
  for (const key of ['teeth', 'teethAI', 'TeethWhitening']) {
    const value = neutral();
    value.parameters.extendedParameters[key] = {strength: 50};
    assert.throws(() => validateRecipe(value), /INVALID_TEETH_MANUAL_ALIAS/u);
  }
  const value = neutral();
  value.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    detail: {teeth: 50}};
  value.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  assert.throws(() => validateRecipe(value), /INVALID_POST_DECODE_ADJUSTMENTS/u);
});
