import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64),
  personID: '33333333-3333-4333-8333-333333333333',
  sourceWidth: 400, sourceHeight: 300});
const point = () => ({u: .4, v: .5, radiusFraction: .012,
  color: {r: 85, g: 65, b: 45}, opacity: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-freckles-1', binding: binding(),
  points: [point()]});
const recipe = (document?: unknown) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: document === undefined ? {} as Record<string, unknown> :
    {faceDecorationsManual: document} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const rejects = (documents: unknown[], pattern = /INVALID_FACE_DECORATIONS_MANUAL/u) => {
  for (const document of documents)
    assert.throws(() => validateRecipe(recipe(document)), pattern);
};

test('FRECKLES-RECIPE-01: typed dots preserve Recipe v1, neutral and unrelated extensions', () => {
  assert.doesNotThrow(() => validateRecipe(recipe()));
  assert.doesNotThrow(() => validateRecipe(recipe(manual())));
  assert.doesNotThrow(() => validateRecipe(recipe(runInNewContext(`(${JSON.stringify(manual())})`))));
  const mixed = recipe(manual());
  mixed.parameters.extendedParameters.unrelatedExistingExtension = {name: 'old'};
  assert.doesNotThrow(() => validateRecipe(mixed));
  assert.deepEqual(mixed.parameters.processingOrder, recipe().parameters.processingOrder);
});

test('FRECKLES-RECIPE-02: photo/person/source binding and authority/style claims reject', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'fake'},
    {...base, bitmap: []}, {...base, savedRevision: 1},
    {...base, permissionEvidence: {authenticated: true}},
    {...base, ownerConfirmed: true}, {...base, style: 'evoto-1'},
    {...base, binding: {...binding(), assetID: 'wrong'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), personID: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}]);
  const getter = manual();
  let called = 0;
  Object.defineProperty(getter, 'binding', {get() {called++; throw Error('GETTER_RAN');}});
  rejects([getter]);
  assert.equal(called, 0);
  const top = recipe(manual());
  Object.defineProperty(top.parameters.extendedParameters, 'faceDecorationsManual',
    {enumerable: true, get() {called++; throw Error('GETTER_RAN');}});
  assert.throws(() => validateRecipe(top), /INVALID_FACE_DECORATIONS_MANUAL/u);
  assert.equal(called, 0);
});

test('FRECKLES-RECIPE-03: one to 64 dense normalized finite dots only', () => {
  const base = manual(),p = point();
  rejects([{...base, points: []},
    {...base, points: Array.from({length: 65}, () => point())},
    {...base, points: [p, , point()]},
    {...base, points: [{...p, u: NaN}]},
    {...base, points: [{...p, u: -0}]},
    {...base, points: [{...p, v: 1.01}]},
    {...base, points: [{...p, radiusFraction: .051}]},
    {...base, points: [{...p, radiusFraction: Infinity}]},
    {...base, points: [{...p, opacity: -0}]},
    {...base, points: [{...p, opacity: '0.5'}]},
    {...base, points: [{...p, color: {r: 256, g: 0, b: 0}}]},
    {...base, points: [{...p, color: {r: 1.2, g: 0, b: 0}}]},
    {...base, points: [{...p, color: {...p.color, a: 255}}]},
    {...base, points: [{...p, assetID: binding().assetID}]}]);
  const maximum = {...base, points: Array.from({length: 64}, () => point())};
  assert.doesNotThrow(() => validateRecipe(recipe(maximum)));
});

test('FRECKLES-RECIPE-04: aliases cannot claim implementation via generic JSON', () => {
  for (const key of ['faceDecorations', 'faceDecorationStyle',
    'freckles', 'freckleFilter']) {
    const value = recipe();
    value.parameters.extendedParameters[key] = {style: 1, amount: 50};
    assert.throws(() => validateRecipe(value),
      /INVALID_FACE_DECORATIONS_MANUAL_ALIAS/u);
  }
});
