import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../src/photo-policy.js';

// Recipe structure only. No caller-written IDs, strokes or owner flags prove
// authorization, a real facial region, person inventory or an existing Asset.
const binding = () => ({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 400, sourceHeight: 300,
  personID: '33333333-3333-4333-8333-333333333333'});
const stroke = (operation = 'ADD', path: unknown = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-owner-manual-makeup-highlight-1',
  binding: binding(), highlightStrokes: [stroke(), stroke('ERASE')],
  settings: {intensity: 40}});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();
  value.parameters.extendedParameters.makeupHighlightManual = extension;
  return value;
};
const rejects = (items: unknown[], code: RegExp) => {
  for (const item of items) assert.throws(() => validateRecipe(recipe(item)), code);
};

test('MAKEUP-RECIPE-01: optional typed document preserves Recipe v1 and other extensions', () => {
  const old = neutral(), fresh = recipe();
  assert.doesNotThrow(() => validateRecipe(old));
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(fresh))));
  assert.deepEqual(fresh.parameters.processingOrder, old.parameters.processingOrder);
  assert.equal(fresh.parameters.processingOrder.includes('makeupHighlightManual'), false);
  fresh.parameters.extendedParameters.unrelatedExistingExtension = {label: 'retained'};
  assert.doesNotThrow(() => validateRecipe(fresh));
  assert.doesNotMatch(JSON.stringify(fresh),
    /savedRevision|ownerConfirmed|permissionEvidence|bitmap|originalBytes/u);
});

test('MAKEUP-RECIPE-02: exact document/binding rejects extra authority and bad identity', () => {
  const base = manual();
  rejects([{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 3}, {...base, permissionEvidence: {allowed: true}},
    {...base, ownerConfirmed: true}, {...base, bitmap: []},
    {...base, binding: {...binding(), assetID: 'not-uuid'}},
    {...base, binding: {...binding(), personID: 'not-uuid'}},
    {...base, binding: {...binding(), originalSHA256: 'wrong'}},
    {...base, binding: {...binding(), sourceWidth: 9000, sourceHeight: 9000}},
    {...base, binding: {...binding(), savedRevision: 1}}],
  /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const symbol = manual() as ReturnType<typeof manual> & {[key: symbol]: unknown};
  symbol[Symbol('verified')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const getter = manual();
  Object.defineProperty(getter, 'schemaVersion', {get() {throw Error('getter must not run');}});
  assert.throws(() => validateRecipe(recipe(getter)), /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const extensionGetter = neutral();
  Object.defineProperty(extensionGetter.parameters.extendedParameters, 'makeupHighlightManual',
    {enumerable: true, get() {throw Error('top-level getter must not run');}});
  assert.throws(() => validateRecipe(extensionGetter), /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const classValue = Object.assign(new class Claim {}(), manual());
  assert.throws(() => validateRecipe(recipe(classValue)), /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const realm = runInNewContext(`(${JSON.stringify(manual())})`) as unknown;
  assert.doesNotThrow(() => validateRecipe(recipe(realm)));
});

test('MAKEUP-RECIPE-03: normalized ADD/ERASE stroke grammar and work bounds are strict', () => {
  const base = manual();
  rejects([{...base, highlightStrokes: []},
    {...base, highlightStrokes: [stroke('ERASE')]},
    {...base, highlightStrokes: Array.from({length: 65}, () => stroke())},
    {...base, highlightStrokes: [{...stroke(), operation: 'add'}]},
    {...base, highlightStrokes: [{...stroke(), radiusFraction: .3}]},
    {...base, highlightStrokes: [{...stroke(), hardness: Infinity}]},
    {...base, highlightStrokes: [{...stroke(), automaticFaceMask: true}]},
    {...base, highlightStrokes: [stroke('ADD', [{u: NaN, v: .5}])]},
    {...base, highlightStrokes: [stroke('ADD', [{u: 1.1, v: .5}])]},
    {...base, highlightStrokes: [stroke('ADD', [{x: .2, y: .3}])]}],
  /INVALID_MAKEUP_HIGHLIGHT_MANUAL/u);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => validateRecipe(recipe({...base, highlightStrokes: sparse})),
    /INVALID_MAKEUP_HIGHLIGHT_MANUAL_STROKES/u);
  const path = Array.from({length: 2049}, () => ({u: .5, v: .5}));
  assert.throws(() => validateRecipe(recipe({...base,
    highlightStrokes: [stroke('ADD', path), stroke('ERASE', path)]})),
  /INVALID_MAKEUP_HIGHLIGHT_MANUAL_CAPACITY/u);
});

test('MAKEUP-RECIPE-04: Intensity agrees with the pure module and JSON size is bounded', () => {
  const base = manual();
  for (const value of [-1, 101, .5, NaN, Infinity, '20'])
    assert.throws(() => validateRecipe(recipe({...base, settings: {intensity: value}})),
      /INVALID_MAKEUP_HIGHLIGHT_MANUAL_SETTINGS/u);
  rejects([{...base, settings: {intensity: 0, aiHighlight: true}},
    {...base, settings: {brightness: 50}}], /INVALID_MAKEUP_HIGHLIGHT_MANUAL_SETTINGS/u);
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {intensity: 0}})));
  assert.doesNotThrow(() => validateRecipe(recipe({...base, settings: {intensity: 100}})));
  const path = Array.from({length: 2048}, (_, index) => ({
    u: index / 4095, v: (index + .123456789) / 4095}));
  const large = {...base, highlightStrokes: [stroke('ADD', path), stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength > 96 * 1024);
  assert.throws(() => validateRecipe(recipe(large)),
    /INVALID_MAKEUP_HIGHLIGHT_MANUAL_JSON_LIMIT/u);
});

test('MAKEUP-RECIPE-05: untyped Highlight aliases cannot masquerade as this manual feature', () => {
  for (const key of ['makeupHighlight', 'MakeupHighlights', 'makeup_highlight',
    'makeupHighlightAI', 'highlightMakeup']) {
    const value = neutral();
    value.parameters.extendedParameters[key] = {intensity: 50};
    assert.throws(() => validateRecipe(value), /INVALID_MAKEUP_HIGHLIGHT_MANUAL_ALIAS/u);
  }
});
