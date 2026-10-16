import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../src/photo-policy.js';

const binding = {assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), sourceWidth: 4000, sourceHeight: 2000};
const add = (path: unknown = [{u: .25, v: .5}]) => ({operation: 'ADD', path,
  radiusFraction: .12, hardness: 1});
const erase = () => ({operation: 'ERASE', path: [{u: .5, v: .5}],
  radiusFraction: .08, hardness: .5});
const manual = () => ({schemaVersion: 1,
  engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1', binding: {...binding},
  subjectStrokes: [add(), erase()], correctionStrokes: [add()]});
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {} as Record<string, unknown>,
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const recipe = (extension: unknown = manual()) => {
  const value = neutral();
  value.parameters.extendedParameters.bwEdgeManual = extension;
  return value;
};

test('BW-RECIPE-01: optional typed strokes preserve Recipe v1 and old processingOrder', () => {
  const legacy = neutral(), value = recipe();
  assert.doesNotThrow(() => validateRecipe(legacy));
  assert.doesNotThrow(() => validateRecipe(value));
  assert.deepEqual(value.parameters.processingOrder, legacy.parameters.processingOrder);
  assert.equal(value.parameters.processingOrder.includes('bwEdgeManual'), false);
  assert.doesNotThrow(() => validateRecipe(JSON.parse(JSON.stringify(value))));
  assert.equal(JSON.stringify(value).includes('savedRevision'), false);
  assert.equal(JSON.stringify(value).includes('permissionEvidence'), false);
});

test('BW-RECIPE-02: metadata is exact; runtime revision, permission and owner assertion cannot be saved', () => {
  const base = manual();
  const invalid = [{...base, schemaVersion: 2}, {...base, engineVersion: 'other'},
    {...base, savedRevision: 4}, {...base, permissionEvidence: {allowed: true}},
    {...base, confirmedSelections: {subject: true, correction: true}},
    {...base, binding: {...binding, extra: true}},
    {...base, binding: {...binding, originalSHA256: 'not-a-sha'}},
    {...base, binding: {...binding, assetID: 'wrong'}},
    {...base, binding: {...binding, sourceWidth: 8_000_001, sourceHeight: 1}},
    {...base, binding: {...binding, sourceWidth: 0}}];
  for (const item of invalid)
    assert.throws(() => validateRecipe(recipe(item)), /INVALID_BW_EDGE_MANUAL/);
  const undefinedField = neutral();
  undefinedField.parameters.extendedParameters.bwEdgeManual = undefined;
  assert.throws(() => validateRecipe(undefinedField), /INVALID_BW_EDGE_MANUAL/);
  const symbol = manual() as typeof base & {[key: symbol]: unknown};
  symbol[Symbol('hidden')] = true;
  assert.throws(() => validateRecipe(recipe(symbol)), /INVALID_BW_EDGE_MANUAL/);
});

test('BW-RECIPE-03: both selections require ADD and the existing normalized brush schema', () => {
  const base = manual();
  for (const key of ['subjectStrokes', 'correctionStrokes'] as const) {
    assert.throws(() => validateRecipe(recipe({...base, [key]: [erase()]})),
      /INVALID_BW_EDGE_MANUAL_ADD_REQUIRED/);
    assert.throws(() => validateRecipe(recipe({...base, [key]: []})),
      /INVALID_BW_EDGE_MANUAL_STROKES/);
  }
  for (const stroke of [{...add(), operation: 'add'}, {...add(), radiusFraction: 0},
    {...add(), radiusFraction: .26}, {...add(), radiusFraction: NaN},
    {...add(), hardness: Infinity}, {...add(), extra: true}])
    assert.throws(() => validateRecipe(recipe({...base, correctionStrokes: [stroke]})),
      /INVALID_BW_EDGE_MANUAL_STROKE/);
  for (const point of [{u: NaN, v: .5}, {u: -.01, v: .5},
    {u: .5, v: 1.01}, {x: .5, y: .5}, {u: .5, v: .5, extra: 1}])
    assert.throws(() => validateRecipe(recipe({...base,
      correctionStrokes: [add([point])]})), /INVALID_BW_EDGE_MANUAL_POINT/);
  const sparse = [add(), add()]; delete sparse[1];
  assert.throws(() => validateRecipe(recipe({...base, subjectStrokes: sparse})),
    /INVALID_BW_EDGE_MANUAL_STROKES/);
});

test('BW-RECIPE-04: 64 total strokes and 4096 total points are shared limits', () => {
  const base = manual();
  const subject = Array.from({length: 32}, () => add());
  const correction = Array.from({length: 32}, () => add());
  assert.doesNotThrow(() => validateRecipe(recipe({...base,
    subjectStrokes: subject, correctionStrokes: correction})));
  assert.throws(() => validateRecipe(recipe({...base, subjectStrokes: subject,
    correctionStrokes: [...correction, add()]})), /INVALID_BW_EDGE_MANUAL_CAPACITY/);
  const path = Array.from({length: 2048}, () => ({u: .5, v: .5}));
  assert.doesNotThrow(() => validateRecipe(recipe({...base,
    subjectStrokes: [add(path)], correctionStrokes: [add(path)]})));
  assert.throws(() => validateRecipe(recipe({...base,
    subjectStrokes: [add([...path, {u: .5, v: .5}])],
    correctionStrokes: [add(path)]})), /INVALID_BW_EDGE_MANUAL_CAPACITY/);
});

test('BW-RECIPE-05: 96 KiB JSON and malformed arrays fail before any saved-looking result', () => {
  const base = manual();
  const path = Array.from({length: 2048}, () =>
    ({u: .12345678901234566, v: .9876543210987654}));
  assert.throws(() => validateRecipe(recipe({...base,
    subjectStrokes: [add(path)], correctionStrokes: [add(path)]})),
  /INVALID_BW_EDGE_MANUAL_JSON_LIMIT/);
  const sparsePath = [{u: .1, v: .2}, {u: .3, v: .4}];
  delete sparsePath[1];
  assert.throws(() => validateRecipe(recipe({...base,
    correctionStrokes: [add(sparsePath)]})), /INVALID_BW_EDGE_MANUAL_STROKE/);
  const accessor = manual();
  Object.defineProperty(accessor, 'schemaVersion', {get() {throw Error('must not run');}});
  assert.throws(() => validateRecipe(recipe(accessor)), /INVALID_BW_EDGE_MANUAL/);
});

test('BW-RECIPE-06: a new pipeline stage is not accepted and old extensions survive', () => {
  const value = recipe();
  value.parameters.extendedParameters.canvasExpand = {schemaVersion: 1,
    margins: {left: 0, right: 0, top: 0, bottom: 0}};
  assert.doesNotThrow(() => validateRecipe(value));
  value.parameters.processingOrder.push('bwEdgeManual');
  assert.throws(() => validateRecipe(value), /INVALID_PIPELINE/);
});
