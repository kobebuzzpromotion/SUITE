import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {ADD_SHADOW_MANUAL_MAX_STROKES, ADD_SHADOW_MANUAL_MAX_POINTS,
  ADD_SHADOW_MANUAL_MAX_JSON_BYTES,
  validateAddShadowManualDocument} from '../src/processing/add-shadow-manual-contract.mjs';
import {recipe} from './fixtures.mjs';

const sourceID = randomUUID(), backdropID = randomUUID();
const binding = () => ({assetID: sourceID, originalSHA256: 'a'.repeat(64),
  sourceWidth: 400, sourceHeight: 300,
  backdropID, backdropSHA256: 'b'.repeat(64)});
const settings = () => ({mode: 'soft', opacity: 70, blur: 12, gradient: 20,
  blend: 'multiply', offsetX: 10, offsetY: -5, shadowColor: [10, 20, 30]});
const stroke = (operation = 'ADD', path = [{u: .2, v: .3}, {u: .4, v: .5}]) =>
  ({operation, path, radiusFraction: .04, hardness: .6});
const document = () => ({schemaVersion: 1, engineVersion: ADD_SHADOW_VERSION,
  binding: binding(), subjectStrokes: [stroke(), stroke('ERASE')],
  settings: settings()});
const verify = (value, expected = binding(), options) =>
  validateAddShadowManualDocument(value, expected, options);

test('SHADOW-MANUAL-01: typed JSON-only document snapshots both Asset bindings, manual strokes and actual Add Shadow settings', () => {
  const draft = document(), oldRecipe = recipe(), oldText = JSON.stringify(oldRecipe);
  const validated = verify(draft);
  assert.deepEqual(validated, draft);
  assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.binding) &&
    Object.isFrozen(validated.subjectStrokes) &&
    Object.isFrozen(validated.subjectStrokes[0].path[0]) &&
    Object.isFrozen(validated.settings.shadowColor));
  draft.binding.backdropSHA256 = 'c'.repeat(64);
  draft.subjectStrokes[0].path[0].u = .9;
  draft.settings.shadowColor[0] = 255;
  assert.equal(validated.binding.backdropSHA256, 'b'.repeat(64));
  assert.equal(validated.subjectStrokes[0].path[0].u, .2);
  assert.equal(validated.settings.shadowColor[0], 10);
  assert.deepEqual(Object.keys(validated), ['schemaVersion', 'engineVersion',
    'binding', 'subjectStrokes', 'settings']);
  assert.doesNotMatch(JSON.stringify(validated), /pixelsSHA256|digest|permissionEvidence|savedRevision|bitmap|data/);
  assert.equal(JSON.stringify(oldRecipe), oldText);
});

test('SHADOW-MANUAL-02: other Asset/backdrop/SHA/dimensions and extra authority or bitmap claims reject', () => {
  for (const changed of [
    {assetID: randomUUID()}, {originalSHA256: 'c'.repeat(64)},
    {sourceWidth: 401}, {sourceHeight: 301},
    {backdropID: randomUUID()}, {backdropSHA256: 'c'.repeat(64)}]) {
    assert.throws(() => verify(document(), {...binding(), ...changed}), /BINDING_MISMATCH/);
  }
  assert.throws(() => verify({...document(), pixelsSHA256: 'a'.repeat(64)}),
    /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), permissionEvidence: {allowed: true}}),
    /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), bitmap: new Uint8Array(4)}),
    /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), savedRevision: 1}), /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), engineVersion: 'other'}), /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), schemaVersion: 2}), /DOCUMENT_INVALID/);
  assert.throws(() => verify({...document(), binding: {...binding(), backdropID: sourceID}}),
    /BINDING_INVALID/);
  assert.throws(() => verify({...document(), binding: {...binding(), data: []}}),
    /BINDING_INVALID/);
  assert.throws(() => verify({...document(), binding: {...binding(), sourceWidth: 9000,
    sourceHeight: 9000}}), /BINDING_INVALID/);
});

test('SHADOW-MANUAL-03: B/W-compatible normalized brush grammar rejects fake, sparse, over-limit and all-erase strokes', () => {
  assert.throws(() => verify({...document(), subjectStrokes: [stroke('ERASE')]}),
    /ADD_REQUIRED/);
  assert.throws(() => verify({...document(), subjectStrokes: []}), /STROKES_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes:
    Array.from({length: ADD_SHADOW_MANUAL_MAX_STROKES + 1}, () => stroke())}),
  /STROKES_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes: [stroke('ADD',
    Array.from({length: ADD_SHADOW_MANUAL_MAX_POINTS + 1}, () => ({u: 0, v: 0})))]}),
  /STROKE_INVALID/);
  const overTotal = Array.from({length: 2}, () => stroke('ADD',
    Array.from({length: 2049}, () => ({u: 0, v: 0}))));
  assert.throws(() => verify({...document(), subjectStrokes: overTotal}), /CAPACITY/);
  const sparse = [stroke(), , stroke()];
  assert.throws(() => verify({...document(), subjectStrokes: sparse}), /STROKES_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes: [stroke('ADD', [,
    {u: 0, v: 0}])]}), /STROKE_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes: [stroke('ADD',
    [{u: Number.NaN, v: .2}])]}), /POINT_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes: [{...stroke(),
    radiusFraction: Infinity}]}), /STROKE_INVALID/);
  assert.throws(() => verify({...document(), subjectStrokes: [{...stroke(),
    maskKind: 'person-ai'}]}), /STROKE_INVALID/);
});

test('SHADOW-MANUAL-04: strict existing settings, 96KiB budget and abort are fail-closed', () => {
  assert.throws(() => verify({...document(), settings: {...settings(),
    opacity: 101}}), /SETTINGS_INVALID/);
  assert.throws(() => verify({...document(), settings: {...settings(),
    shadowColor: [0, , 2]}}), /SETTINGS_INVALID/);
  assert.throws(() => verify({...document(), settings: {...settings(),
    shadowColor: [1, 2, 3], opacity: Number.NaN}}), /SETTINGS_INVALID/);
  assert.throws(() => verify({...document(), settings: {...settings(),
    aiSubject: true}}), /SETTINGS_INVALID/);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => verify(document(), binding(), {signal: controller.signal}),
    {name: 'AbortError'});
  const path = Array.from({length: 2048}, (_, i) => ({
    u: i / 4095, v: (i + .123456789) / 4095}));
  const long = {...document(), subjectStrokes: [stroke('ADD', path),
    stroke('ERASE', path)]};
  assert.ok(new TextEncoder().encode(JSON.stringify(long)).byteLength >
    ADD_SHADOW_MANUAL_MAX_JSON_BYTES);
  assert.throws(() => verify(long), /JSON_LIMIT/);
});
