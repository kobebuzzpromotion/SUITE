import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), personID: '33333333-3333-4333-8333-333333333333',
  sourceWidth: 400, sourceHeight: 300});
const stroke = (operation = 'ADD', path: unknown = [{u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .7});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-eyeshadow-color-1',
  representation: 'normalized-owner-manual-eye-area-protections-v1',
  binding: binding(), eye: 'image-left',
  strokes: {eyeArea: [stroke(), stroke('ERASE')],
    irisProtect: [stroke()], pupilProtect: [stroke()]},
  settings: {color: {r: 125, g: 78, b: 100}, opacity: .5}});
const recipe = (document?: unknown) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: document === undefined ? {} : {eyeshadowManual: document},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
function rejects(documents: unknown[], expected = /INVALID_EYESHADOW/u) {
  for (const document of documents)
    assert.throws(() => validateRecipe(recipe(document)), expected);
}

test('EYESHADOW-RECIPE-01: typed eye roles preserve Recipe v1 and old extensions', () => {
  assert.doesNotThrow(() => validateRecipe(recipe()));
  assert.doesNotThrow(() => validateRecipe(recipe(manual())));
  assert.doesNotThrow(() => validateRecipe(recipe({...manual(), eye: 'image-right'})));
  assert.doesNotThrow(() => validateRecipe(recipe(runInNewContext(`(${JSON.stringify(manual())})`))));
  const withOld = recipe(manual());
  Object.assign(withOld.parameters.extendedParameters, {oldEffect: {name: 'old'}});
  assert.doesNotThrow(() => validateRecipe(withOld));
  assert.deepEqual(withOld.parameters.processingOrder,
    recipe().parameters.processingOrder);
});

test('EYESHADOW-RECIPE-02: identity, representation and authority aliases fail closed', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'fake'},
    {...base, representation: 'bitmap'}, {...base, eye: 'both'},
    {...base, bitmap: []}, {...base, savedRevision: 1},
    {...base, permissionEvidence: {allowed: true}}, {...base, ownerConfirmed: true},
    {...base, binding: {...binding(), assetID: 'wrong'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), personID: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}]);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('authorized')] = true;
  rejects([symbol]);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter ran');}});
  rejects([getter]);
  const top = recipe(manual());
  Object.defineProperty(top.parameters.extendedParameters, 'eyeshadowManual',
    {enumerable: true, get() {throw Error('getter ran');}});
  assert.throws(() => validateRecipe(top), /INVALID_EYESHADOW_MANUAL/u);
});

test('EYESHADOW-RECIPE-03: three bounded stroke roles require ADD and dense normalized paths', () => {
  const base = manual();
  rejects([{...base, strokes: {...base.strokes, irisProtect: []}},
    {...base, strokes: {...base.strokes, pupilProtect: [stroke('ERASE')]}},
    {...base, strokes: {...base.strokes, eyeArea: [stroke('add')]}},
    {...base, strokes: {...base.strokes, eyeArea: [{...stroke(), radiusFraction: .3}]}},
    {...base, strokes: {...base.strokes, eyeArea: [{...stroke(), hardness: Infinity}]}},
    {...base, strokes: {...base.strokes, eyeArea: [stroke('ADD', [{u: NaN, v: .5}])]}},
    {...base, strokes: {...base.strokes, eyeArea: [stroke('ADD', [{u: 1.01, v: .5}])]}},
    {...base, strokes: {...base.strokes, eyeArea: [stroke('ADD', [{x: .2, y: .3}])]}},
    {...base, strokes: {...base.strokes, eyeArea: Array.from({length: 65}, () => stroke())}},
    {...base, strokes: {...base.strokes,
      eyeArea: [stroke('ADD', Array.from({length: 4097}, () => ({u: .5, v: .5})))]}},
    {...base, strokes: {...base.strokes, shadowStyle: [stroke()]}}]);
  rejects([{...base, strokes: {...base.strokes, eyeArea: [stroke(), , stroke()]}},
    {...base, strokes: {...base.strokes,
      pupilProtect: [stroke('ADD', [{u: .3, v: .4}, , {u: .5, v: .6}])]}}]);
});

test('EYESHADOW-RECIPE-04: finite color and opacity, no pretend 14/8 styles or aliases', () => {
  const base = manual();
  rejects([{...base, settings: {color: {r: 256, g: 0, b: 0}, opacity: .5}},
    {...base, settings: {color: {r: 1.5, g: 0, b: 0}, opacity: .5}},
    {...base, settings: {color: {r: 1, g: 0, b: 0, a: 255}, opacity: .5}},
    {...base, settings: {...base.settings, opacity: -0}},
    {...base, settings: {...base.settings, opacity: NaN}},
    {...base, settings: {...base.settings, opacity: Infinity}},
    {...base, settings: {...base.settings, opacity: 1.1}},
    {...base, settings: {...base.settings, opacity: '0.5'}},
    {...base, settings: {...base.settings, evotoStyle: 1}}]);
  for (const key of ['eyeshadow', 'eyeShadow', 'eye_shadow', 'eye-shadow',
    'makeupEyeshadow', 'shadowEye']) {
    const value = recipe();
    Object.assign(value.parameters.extendedParameters, {[key]: {style: 1}});
    assert.throws(() => validateRecipe(value), /INVALID_EYESHADOW_MANUAL_ALIAS/u);
  }
});

test('EYESHADOW-RECIPE-05: dedicated JSON byte limit prevents oversized role data', () => {
  const base = manual();
  const path = Array.from({length: 1300}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, strokes: {eyeArea: [stroke('ADD', path)],
    irisProtect: [stroke('ADD', path)], pupilProtect: [stroke('ADD', path)]}};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)),
    /INVALID_EYESHADOW_MANUAL_JSON_LIMIT/u);
});
