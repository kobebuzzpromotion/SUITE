import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300});
const targetRect = () => ({x: .1, y: .2, width: .1, height: .1});
const referenceRect = () => ({x: .5, y: .2, width: .1, height: .1});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1, engineVersion: 'suite-srgb8-manual-clothing-spot-1',
  binding: binding(), targetRect: targetRect(), referenceRect: referenceRect(),
  targetStrokes: [stroke(), stroke('ERASE')]});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();
  value.parameters.extendedParameters.clothingSpotManual = extension;
  return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('CLOTHING-RECIPE-01: optional typed document preserves old Recipe, order and other extensions', () => {
  const old = neutral(), fresh = recipe();
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(fresh))));
  assert.deepEqual(fresh.parameters.processingOrder, old.parameters.processingOrder);
  fresh.parameters.extendedParameters.unrelatedExistingExtension = {label: 'retained'};
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotMatch(JSON.stringify(fresh),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|originalBytes/u);
  const realm = runInNewContext(`(${JSON.stringify(manual())})`) as unknown;
  assert.doesNotThrow(() => validateRecipe(recipe(realm)));
});

test('CLOTHING-RECIPE-02: exact binding rejects photo substitution, authority claims and malicious shape', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 3}, {...base, permissionEvidence: {allowed: true}},
    {...base, ownerConfirmed: true}, {...base, bitmap: []},
    {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}], /INVALID_CLOTHING_SPOT_MANUAL/u);
  const hidden = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  hidden[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(hidden)), /INVALID_CLOTHING_SPOT_MANUAL/u);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('must not read document getter');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_CLOTHING_SPOT_MANUAL/u);
  const extensionGetter = neutral();
  Object.defineProperty(extensionGetter.parameters.extendedParameters, 'clothingSpotManual',
    {enumerable: true, get() {throw Error('must not read extension getter');}});
  assert.throws(() => validateRecipe(extensionGetter), /INVALID_CLOTHING_SPOT_MANUAL/u);
});

test('CLOTHING-RECIPE-03: normalized same-size non-overlap small patches are strict', () => {
  const base = manual();
  rejects([{...base, targetRect: {...targetRect(), width: .2}},
    {...base, referenceRect: {...referenceRect(), x: .15}},
    {...base, targetRect: {...targetRect(), x: .95}},
    {...base, targetRect: {...targetRect(), width: .001}},
    {...base, targetRect: {...targetRect(), width: .8}},
    {...base, targetRect: {...targetRect(), x: NaN}},
    {...base, referenceRect: {...referenceRect(), pixelX: 200}}],
  /INVALID_CLOTHING_SPOT_MANUAL_RECT|INVALID_CLOTHING_SPOT_MANUAL_REGIONS/u);
});

test('CLOTHING-RECIPE-04: local target ADD/ERASE strokes, capacity and JSON size are bounded', () => {
  const base = manual();
  rejects([{...base, targetStrokes: []},
    {...base, targetStrokes: [stroke('ERASE')]},
    {...base, targetStrokes: Array.from({length: 65}, () => stroke())},
    {...base, targetStrokes: [{...stroke(), operation: 'auto'}]},
    {...base, targetStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, targetStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, targetStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, targetStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, targetStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_CLOTHING_SPOT_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, targetStrokes: sparse})),
    /INVALID_CLOTHING_SPOT_MANUAL_STROKES/u);
  const largePath = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    targetStrokes: [stroke('ADD', largePath), stroke('ERASE', largePath)]})),
  /INVALID_CLOTHING_SPOT_MANUAL_CAPACITY/u);
  const verbose = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const jsonLarge = {...base, targetStrokes: [stroke('ADD', verbose), stroke('ERASE', verbose)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(jsonLarge)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(jsonLarge)),
    /INVALID_CLOTHING_SPOT_MANUAL_JSON_LIMIT/u);
});

test('CLOTHING-RECIPE-05: unknown clothing aliases do not masquerade as implementation', () => {
  for (const key of ['clothing', 'ClothingAI', 'garment', 'garmentBlemish']) {
    const value = neutral(); value.parameters.extendedParameters[key] = {style: 1};
    assert.throws(() => validateRecipe(value), /INVALID_CLOTHING_SPOT_MANUAL_ALIAS/u);
  }
});

test('BLUSH-RECIPE-GETTER-01: hostile settings.color getter is rejected without evaluation', () => {
  const value = neutral();
  const settings = {opacity: .5} as {opacity: number; color?: unknown};
  let reads = 0;
  Object.defineProperty(settings, 'color', {enumerable: true,
    get() {reads++; throw Error('hostile getter was evaluated');}});
  value.parameters.extendedParameters.blushManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-owner-manual-blush-color-1',
    binding: {...binding(), personID: '33333333-3333-4333-8333-333333333333'},
    cheekStrokes: [stroke()], settings,
  };
  assert.throws(() => validateRecipe(value), /INVALID_BLUSH_MANUAL_SETTINGS/u);
  assert.equal(reads, 0);
});
