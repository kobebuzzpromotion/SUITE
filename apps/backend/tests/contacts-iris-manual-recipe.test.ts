import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), personID: '33333333-3333-4333-8333-333333333333',
  eye: 'left', sourceWidth: 400, sourceHeight: 300});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-manual-iris-color-1', binding: binding(),
  irisRingStrokes: [stroke(), stroke('ERASE')], pupilExclusionStrokes: [stroke()],
  settings: {color: {r: 40, g: 90, b: 130}, amount: .5}});
const recipe = (document?: unknown) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: document === undefined ? {} : {contactsIrisManual: document},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const rejects = (documents: unknown[], expected = /INVALID_CONTACTS_IRIS/u) => {
  for (const document of documents)
    assert.throws(() => validateRecipe(recipe(document)), expected);
};

test('CONTACTS-RECIPE-01 typed left/right eye documents keep Recipe v1 and old extensions', () => {
  assert.doesNotThrow(() => validateRecipe(recipe()));
  assert.doesNotThrow(() => validateRecipe(recipe(manual())));
  assert.doesNotThrow(() => validateRecipe(recipe({...manual(), binding: {...binding(), eye: 'right'}})));
  assert.doesNotThrow(() => validateRecipe(recipe(runInNewContext(`(${JSON.stringify(manual())})`))));
  const withOld = recipe(manual());
  Object.assign(withOld.parameters.extendedParameters, {unrelatedExistingExtension: {name: 'old'}});
  assert.doesNotThrow(() => validateRecipe(withOld));
  assert.deepEqual(withOld.parameters.processingOrder, recipe().parameters.processingOrder);
});

test('CONTACTS-RECIPE-02 bound identity and unknown/authority fields fail closed', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'fake'},
    {...base, bitmap: []}, {...base, savedRevision: 1},
    {...base, permissionEvidence: {authenticated: true}}, {...base, ownerConfirmed: true},
    {...base, binding: {...binding(), assetID: 'wrong'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), personID: 'wrong'}},
    {...base, binding: {...binding(), eye: 'both'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}]);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('authenticated')] = true;
  rejects([symbol]);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter ran');}});
  rejects([getter]);
  const top = recipe(manual());
  Object.defineProperty(top.parameters.extendedParameters, 'contactsIrisManual',
    {enumerable: true, get() {throw Error('getter ran');}});
  assert.throws(() => validateRecipe(top), /INVALID_CONTACTS_IRIS_MANUAL/u);
});

test('CONTACTS-RECIPE-03 both bounded stroke roles require ADD and normalized dense paths', () => {
  const base = manual();
  rejects([{...base, irisRingStrokes: []},
    {...base, irisRingStrokes: [stroke('ERASE')]},
    {...base, pupilExclusionStrokes: [stroke('ERASE')]},
    {...base, irisRingStrokes: [stroke('add')]},
    {...base, irisRingStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, irisRingStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, irisRingStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, irisRingStrokes: [stroke('ADD', [{u: 1.01, v: .5}])]},
    {...base, irisRingStrokes: [stroke('ADD', [{x: .2, y: .3}])]},
    {...base, irisRingStrokes: Array.from({length: 65}, () => stroke())},
    {...base, irisRingStrokes: [stroke('ADD', Array.from({length: 4097}, () => ({u: .5, v: .5})))]}]);
  rejects([{...base, irisRingStrokes: [stroke(), , stroke()]},
    {...base, pupilExclusionStrokes: [stroke('ADD', [{u: .3, v: .4}, , {u: .5, v: .6}])]}]);
});

test('CONTACTS-RECIPE-04 exact finite color and Amount; aliases cannot fake operation', () => {
  const base = manual();
  rejects([{...base, settings: {color: {r: 256, g: 0, b: 0}, amount: .5}},
    {...base, settings: {color: {r: 1.5, g: 0, b: 0}, amount: .5}},
    {...base, settings: {color: {r: 1, g: 0, b: 0, a: 255}, amount: .5}},
    {...base, settings: {...base.settings, amount: -0}},
    {...base, settings: {...base.settings, amount: NaN}},
    {...base, settings: {...base.settings, amount: Infinity}},
    {...base, settings: {...base.settings, amount: 1.1}},
    {...base, settings: {...base.settings, amount: '0.5'}},
    {...base, settings: {...base.settings, evotoStyle: 1}}]);
  for (const key of ['contacts', 'contactLens', 'coloredContacts', 'irisColor']) {
    const value = recipe();
    Object.assign(value.parameters.extendedParameters, {[key]: {style: 1}});
    assert.throws(() => validateRecipe(value), /INVALID_CONTACTS_IRIS_MANUAL_ALIAS/u);
  }
});

test('CONTACTS-RECIPE-05 serialized manual JSON stays under its dedicated byte cap', () => {
  const base = manual();
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, irisRingStrokes: [stroke('ADD', path)],
    pupilExclusionStrokes: [stroke('ADD', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)), /INVALID_CONTACTS_IRIS_MANUAL_JSON_LIMIT/u);
});
