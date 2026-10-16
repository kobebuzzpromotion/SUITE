import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

// Structural syntax only: these fields do not authenticate a hand, user or Asset.
const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-hand-tone-1',
  binding: binding(), handStrokes: [stroke(), stroke('ERASE')],
  settings: {strength: .7, radiusSourcePixels: 3}});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();value.parameters.extendedParameters.handToneManual = extension;return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('HAND-TONE-RECIPE-01: optional typed strokes preserve old Recipe, other extensions and order', () => {
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

test('HAND-TONE-RECIPE-02: exact photo binding rejects false authority, bitmaps, dimensions and getters', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 3}, {...base, ownerConfirmed: true},
    {...base, permissionEvidence: {allowed: true}}, {...base, bitmap: []},
    {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}], /INVALID_HAND_TONE_MANUAL/u);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_HAND_TONE_MANUAL/u);
  let invoked = 0;
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {invoked++;throw Error('must not run');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_HAND_TONE_MANUAL/u);
  const extensionGetter = neutral();
  Object.defineProperty(extensionGetter.parameters.extendedParameters, 'handToneManual',
    {enumerable: true, get() {invoked++;throw Error('must not run');}});
  assert.throws(() => validateRecipe(extensionGetter), /INVALID_HAND_TONE_MANUAL/u);
  assert.equal(invoked, 0);
  const realm = runInNewContext(`(${JSON.stringify(manual())})`) as unknown;
  assert.doesNotThrow(() => validateRecipe(recipe(realm)));
});

test('HAND-TONE-RECIPE-03: normalized ADD/ERASE strokes and work bounds are strict', () => {
  const base = manual();
  rejects([{...base, handStrokes: []},
    {...base, handStrokes: [stroke('ERASE')]},
    {...base, handStrokes: Array.from({length: 65}, () => stroke())},
    {...base, handStrokes: [{...stroke(), operation: 'add'}]},
    {...base, handStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, handStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, handStrokes: [{...stroke(), automaticHandMask: true}]},
    {...base, handStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, handStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, handStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_HAND_TONE_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, handStrokes: sparse})),
    /INVALID_HAND_TONE_MANUAL_STROKES/u);
  const path = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    handStrokes: [stroke('ADD', path), stroke('ERASE', path)]})),
  /INVALID_HAND_TONE_MANUAL_CAPACITY/u);
});

test('HAND-TONE-RECIPE-04: finite strength/radius mirror the pure processor and JSON is bounded', () => {
  const base = manual();
  for (const strength of [-1, 1.1, -.0, NaN, Infinity, '0.5'])
    assert.throws(() => validateRecipe(recipe({...base,
      settings: {...base.settings, strength}})), /INVALID_HAND_TONE_MANUAL_SETTINGS/u);
  for (const radiusSourcePixels of [0, 7, 1.5, Infinity, '3'])
    assert.throws(() => validateRecipe(recipe({...base,
      settings: {...base.settings, radiusSourcePixels}})),
    /INVALID_HAND_TONE_MANUAL_SETTINGS/u);
  rejects([{...base, settings: {...base.settings, EvotoStyle: 1}},
    {...base, settings: {strength: .7, radiusSourcePixels: 3, permission: true}}],
  /INVALID_HAND_TONE_MANUAL_SETTINGS/u);
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {strength: 0,
    radiusSourcePixels: 1}})));
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {strength: 1,
    radiusSourcePixels: 6}})));
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, handStrokes: [stroke('ADD', path), stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)), /INVALID_HAND_TONE_MANUAL_JSON_LIMIT/u);
});

test('HAND-TONE-RECIPE-05: unknown hand aliases cannot masquerade as typed processing', () => {
  for (const key of ['hand', 'HandTone', 'handVein', 'handReshaping', 'evenHandDodgeBurn']) {
    const value = neutral();value.parameters.extendedParameters[key] = {style: 1};
    assert.throws(() => validateRecipe(value), /INVALID_HAND_TONE_MANUAL_ALIAS/u);
  }
  const hidden = neutral();
  Object.defineProperty(hidden.parameters.extendedParameters, 'handMask', {value: {style: 1}});
  assert.throws(() => validateRecipe(hidden), /INVALID_HAND_TONE_MANUAL_ALIAS/u);
});
