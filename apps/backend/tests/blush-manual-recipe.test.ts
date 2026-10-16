import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

// Syntax only. No ID, stroke or provenance string grants photo/person access.
const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300,
  personID: '33333333-3333-4333-8333-333333333333'});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-blush-color-1',
  binding: binding(), cheekStrokes: [stroke(), stroke('ERASE')],
  settings: {color: {r: 200, g: 30, b: 90}, opacity: .5}});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();value.parameters.extendedParameters.blushManual = extension;return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('BLUSH-RECIPE-01: optional typed strokes preserve old Recipe v1, other extensions and order', () => {
  const old = neutral(), fresh = recipe();
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(fresh))));
  assert.deepEqual(fresh.parameters.processingOrder, old.parameters.processingOrder);
  fresh.parameters.extendedParameters.unrelatedExistingExtension = {label: 'retained'};
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotMatch(JSON.stringify(fresh),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|originalBytes/u);
});

test('BLUSH-RECIPE-02: exact document/binding rejects authority claims, invalid IDs and dimensions', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 3}, {...base, permissionEvidence: {allowed: true}},
    {...base, ownerConfirmed: true}, {...base, bitmap: []},
    {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), personID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}], /INVALID_BLUSH_MANUAL/u);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_BLUSH_MANUAL/u);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter must not run');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_BLUSH_MANUAL/u);
  const extensionGetter = neutral();
  Object.defineProperty(extensionGetter.parameters.extendedParameters, 'blushManual',
    {enumerable: true, get() {throw Error('top-level getter must not run');}});
  assert.throws(() => validateRecipe(extensionGetter), /INVALID_BLUSH_MANUAL/u);
  assert.throws(() => validateRecipe(recipe(Object.assign(new class Claim {}(), manual()))),
    /INVALID_BLUSH_MANUAL/u);
  const realm = runInNewContext(`(${JSON.stringify(manual())})`) as unknown;
  assert.doesNotThrow(() => validateRecipe(recipe(realm)));
});

test('BLUSH-RECIPE-03: normalized ADD/ERASE strokes and work bounds are strict', () => {
  const base = manual();
  rejects([{...base, cheekStrokes: []},
    {...base, cheekStrokes: [stroke('ERASE')]},
    {...base, cheekStrokes: Array.from({length: 65}, () => stroke())},
    {...base, cheekStrokes: [{...stroke(), operation: 'add'}]},
    {...base, cheekStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, cheekStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, cheekStrokes: [{...stroke(), automaticCheekMask: true}]},
    {...base, cheekStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, cheekStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, cheekStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_BLUSH_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, cheekStrokes: sparse})),
    /INVALID_BLUSH_MANUAL_STROKES/u);
  const path = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    cheekStrokes: [stroke('ADD', path), stroke('ERASE', path)]})),
  /INVALID_BLUSH_MANUAL_CAPACITY/u);
});

test('BLUSH-RECIPE-04: exact finite color/opacity match pure algorithm and JSON is bounded', () => {
  const base = manual();
  for (const opacity of [-1, 1.1, -.0, NaN, Infinity, '0.5'])
    assert.throws(() => validateRecipe(recipe({...base,
      settings: {...base.settings, opacity}})), /INVALID_BLUSH_MANUAL_SETTINGS/u);
  rejects([{...base, settings: {color: {r: 256, g: 30, b: 90}, opacity: .5}},
    {...base, settings: {color: {r: 1.5, g: 30, b: 90}, opacity: .5}},
    {...base, settings: {color: {r: 200, g: 30, b: 90, a: 255}, opacity: .5}},
    {...base, settings: {...base.settings, style: 'Evoto-1'}}],
  /INVALID_BLUSH_MANUAL_SETTINGS/u);
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {...base.settings, opacity: 0}})));
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {...base.settings, opacity: 1}})));
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, cheekStrokes: [stroke('ADD', path), stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)), /INVALID_BLUSH_MANUAL_JSON_LIMIT/u);
});

test('BLUSH-RECIPE-05: unknown Blush aliases cannot masquerade as typed manual processing', () => {
  for (const key of ['blush', 'Blush', 'blushAI', 'makeupBlush', 'cheekBlush']) {
    const value = neutral();value.parameters.extendedParameters[key] = {style: 1};
    assert.throws(() => validateRecipe(value), /INVALID_BLUSH_MANUAL_ALIAS/u);
  }
  const hidden = neutral();
  Object.defineProperty(hidden.parameters.extendedParameters, 'blush', {value: {style: 1}});
  assert.throws(() => validateRecipe(hidden), /INVALID_BLUSH_MANUAL_ALIAS/u);
});
