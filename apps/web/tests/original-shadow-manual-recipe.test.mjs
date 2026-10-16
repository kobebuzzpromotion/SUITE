import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';
import {ORIGINAL_SHADOW_MANUAL_SOURCE, ORIGINAL_SHADOW_MANUAL_MAX_STROKES,
  ORIGINAL_SHADOW_MANUAL_MAX_POINTS, validateOriginalShadowManualDocument,
  buildOriginalShadowManualRecipe} from '../src/original-shadow-manual-recipe.mjs';

const TARGET = {id: '11111111-1111-4111-8111-111111111111',
  sha256: 'a'.repeat(64), sourceWidth: 4000, sourceHeight: 2000,
  savedRevision: 3};
const BACKDROP = {id: '22222222-2222-4222-8222-222222222222', sha256: 'b'.repeat(64)};
const OTHER = {id: '33333333-3333-4333-8333-333333333333', sha256: 'c'.repeat(64)};
const stroke = (operation = 'ADD', point = {u: .25, v: .75}) =>
  ({operation, path: [point], radiusFraction: .05, hardness: .8});
const binding = (target = TARGET, backdrop = BACKDROP) =>
  ({assetID: target.id, originalSHA256: target.sha256,
    sourceWidth: target.sourceWidth, sourceHeight: target.sourceHeight,
    backdropID: backdrop.id, backdropSHA256: backdrop.sha256});
const document = (overrides = {}) => ({schemaVersion: 1,
  engineVersion: ORIGINAL_SHADOW_VERSION, source: ORIGINAL_SHADOW_MANUAL_SOURCE,
  binding: binding(), subjectStrokes: [stroke('ADD', {u: .4, v: .3})],
  shadowStrokes: [stroke('ADD', {u: .7, v: .8})], settings: {opacity: 72},
  ...overrides});
const recipe = (extra = {}) => ({schemaVersion: 1, parameters: {exposure: .25,
  contrast: 1.2, saturation: .85, rotationDegrees: 0,
  extendedParameters: {legacyLook: {strength: 12}, ...extra},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});
const build = (override = {}) => buildOriginalShadowManualRecipe({recipe: recipe(),
  document: document(), target: TARGET, backdrop: BACKDROP,
  draftBaseRevision: TARGET.savedRevision, ...override});

test('ORIGINAL-SHADOW-MANUAL-01: typed two-layer candidate keeps prior adjustments and never changes inputs', () => {
  const original = recipe({existingAdjustment: {legacyMarker: 1}});
  const manual = document();
  const originalJSON = JSON.stringify(original), manualJSON = JSON.stringify(manual);
  const next = build({recipe: original, document: manual});
  assert.notEqual(next, original);
  assert.equal(JSON.stringify(original), originalJSON);
  assert.equal(JSON.stringify(manual), manualJSON);
  assert.deepEqual(next.parameters.processingOrder, original.parameters.processingOrder);
  assert.equal(next.parameters.exposure, .25);
  assert.deepEqual(next.parameters.extendedParameters.legacyLook, {strength: 12});
  assert.deepEqual(next.parameters.extendedParameters.existingAdjustment, {legacyMarker: 1});
  const saved = next.parameters.extendedParameters.originalShadowManual;
  assert.deepEqual(saved.binding, binding());
  assert.equal(Object.hasOwn(saved.binding, 'savedRevision'), false);
  assert.equal(saved.source, ORIGINAL_SHADOW_MANUAL_SOURCE);
  assert.notDeepEqual(saved.subjectStrokes, saved.shadowStrokes);
  assert.deepEqual(saved.subjectStrokes[0].path[0], {u: .4, v: .3});
  assert.deepEqual(saved.shadowStrokes[0].path[0], {u: .7, v: .8});
  assert.deepEqual(saved.settings, {opacity: 72});
  assert.ok(!JSON.stringify(saved).includes('authenticated'));
  assert.ok(!JSON.stringify(saved).includes('bitmap'));
  validateRecipe(next); // Current generic Recipe shape accepts a candidate, not a save Gate.
});

test('ORIGINAL-SHADOW-MANUAL-02: false provenance, foreign Asset/SHA, old revision and wrong dimensions refuse', () => {
  const wrong = [
    document({source: 'verified-segmentation-subject-matte'}),
    document({source: 'ai-extracted-shadow'}),
    {...document(), issuer: 'trusted'},
    document({binding: {...binding(), assetID: OTHER.id}}),
    document({binding: {...binding(), originalSHA256: OTHER.sha256}}),
    document({binding: {...binding(), savedRevision: 2}}),
    document({binding: {...binding(), sourceWidth: 3999}}),
    document({binding: {...binding(), backdropID: OTHER.id}}),
    document({binding: {...binding(), backdropSHA256: OTHER.sha256}}),
  ];
  for (const candidate of wrong)
    assert.throws(() => build({document: candidate}), /ORIGINAL_SHADOW_MANUAL_/);
  assert.throws(() => build({target: {...TARGET, sourceWidth: 3999}}),
    /ORIGINAL_SHADOW_MANUAL_BINDING_MISMATCH/);
  assert.throws(() => build({target: {...TARGET, savedRevision: 4}}),
    /ORIGINAL_SHADOW_MANUAL_REVISION_MISMATCH/);
  assert.throws(() => build({draftBaseRevision: 2}),
    /ORIGINAL_SHADOW_MANUAL_REVISION_MISMATCH/);
  assert.throws(() => build({backdrop: OTHER}),
    /ORIGINAL_SHADOW_MANUAL_BINDING_MISMATCH/);
  assert.throws(() => build({target: {...TARGET, sourceWidth: 4001, sourceHeight: 2000}}),
    /ORIGINAL_SHADOW_MANUAL_BINDING_INVALID/);
  assert.throws(() => build({backdrop: {id: TARGET.id, sha256: TARGET.sha256}}),
    /ORIGINAL_SHADOW_MANUAL_BINDING_INVALID/);
});

test('ORIGINAL-SHADOW-MANUAL-03: both ADD layers, normalized points, bounded strokes/points/bytes and opacity are mandatory', () => {
  assert.throws(() => build({document: document({subjectStrokes: [stroke('ERASE')]})}),
    /ORIGINAL_SHADOW_MANUAL_ADD_REQUIRED/);
  assert.throws(() => build({document: document({shadowStrokes: [stroke('ERASE')]})}),
    /ORIGINAL_SHADOW_MANUAL_ADD_REQUIRED/);
  for (const bad of [stroke('ADD', {u: -1, v: .5}),
    {...stroke(), radiusFraction: 0}, {...stroke(), hardness: Infinity},
    {...stroke(), operation: 'AUTO'}])
    assert.throws(() => build({document: document({shadowStrokes: [bad]})}),
      /ORIGINAL_SHADOW_MANUAL_(POINT|STROKE)_INVALID/);
  const sparse = [stroke()]; sparse.length = 2;
  assert.throws(() => build({document: document({shadowStrokes: sparse})}),
    /ORIGINAL_SHADOW_MANUAL_STROKES_INVALID/);
  assert.throws(() => build({document: document({shadowStrokes:
    Array.from({length: ORIGINAL_SHADOW_MANUAL_MAX_STROKES}, () => stroke())})}),
  /ORIGINAL_SHADOW_MANUAL_CAPACITY/);
  const overPoints = Array.from({length: ORIGINAL_SHADOW_MANUAL_MAX_POINTS},
    () => ({u: .1, v: .2}));
  assert.throws(() => build({document: document({shadowStrokes:
    [{...stroke(), path: overPoints}]})}), /ORIGINAL_SHADOW_MANUAL_CAPACITY/);
  for (const opacity of [-1, 101, 2.5, Number.NaN])
    assert.throws(() => build({document: document({settings: {opacity}})}),
      /ORIGINAL_SHADOW_MANUAL_SETTINGS_INVALID/);
  const verbose = Array.from({length: ORIGINAL_SHADOW_MANUAL_MAX_POINTS - 1},
    () => ({u: 0.12345678901234566, v: 0.8765432109876543}));
  assert.throws(() => build({document: document({shadowStrokes:
    [{...stroke(), path: verbose}]})}), /ORIGINAL_SHADOW_MANUAL_JSON_LIMIT/);
});

test('ORIGINAL-SHADOW-MANUAL-04: existing photo binding and Add Shadow backdrop cannot be silently replaced', () => {
  const first = build();
  assert.deepEqual(build({recipe: first}).parameters.extendedParameters.originalShadowManual,
    first.parameters.extendedParameters.originalShadowManual);
  const foreign = recipe({originalShadowManual: document({binding:
    binding({...TARGET, id: OTHER.id})})});
  assert.throws(() => build({recipe: foreign}),
    /ORIGINAL_SHADOW_MANUAL_EXISTING_BINDING_CONFLICT/);
  const otherBackdrop = recipe({originalShadowManual: document({binding:
    binding(TARGET, OTHER)})});
  assert.throws(() => build({recipe: otherBackdrop}),
    /ORIGINAL_SHADOW_MANUAL_EXISTING_BINDING_CONFLICT/);
  assert.deepEqual(build({recipe: otherBackdrop, replaceBackdrop: true})
    .parameters.extendedParameters.originalShadowManual.binding, binding());
  const addShadow = recipe({addShadowManual: {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
    binding: {assetID: TARGET.id, originalSHA256: TARGET.sha256,
      sourceWidth: TARGET.sourceWidth, sourceHeight: TARGET.sourceHeight,
      backdropID: OTHER.id, backdropSHA256: OTHER.sha256},
    subjectStrokes: [stroke()], settings: {mode: 'drop', opacity: 80,
      blur: 0, gradient: 0, blend: 'normal', offsetX: 2, offsetY: 1,
      shadowColor: [0, 0, 0]}}});
  assert.throws(() => build({recipe: addShadow}),
    /ORIGINAL_SHADOW_MANUAL_ADD_SHADOW_BACKDROP_CONFLICT/);
});

test('ORIGINAL-SHADOW-MANUAL-05: cancellation, accessors, unknown fields and invalid Recipe fail before mutation', () => {
  const controller = new AbortController(); controller.abort();
  assert.throws(() => build({signal: controller.signal}), {name: 'AbortError'});
  assert.throws(() => validateOriginalShadowManualDocument(document(), binding(),
    {signal: controller.signal}), {name: 'AbortError'});
  const getter = Object.defineProperty(document(), 'source', {
    enumerable: true, get() {throw Error('MUST_NOT_READ');}});
  assert.throws(() => build({document: getter}), /ORIGINAL_SHADOW_MANUAL_DOCUMENT_INVALID/);
  assert.throws(() => build({document: document({verified: true})}),
    /ORIGINAL_SHADOW_MANUAL_DOCUMENT_INVALID/);
  const invalid = recipe(); invalid.parameters.exposure = Infinity;
  assert.throws(() => build({recipe: invalid}),
    /ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID/);
  const cyclic = recipe(); cyclic.parameters.extendedParameters.self = cyclic;
  assert.throws(() => build({recipe: cyclic}),
    /ORIGINAL_SHADOW_MANUAL_RECIPE_JSON_INVALID/);
});

test('ORIGINAL-SHADOW-MANUAL-06: CAS advancement does not persist a stale draft revision', () => {
  const built = build();
  const persisted = JSON.parse(JSON.stringify(built));
  const persistedManual = persisted.parameters.extendedParameters.originalShadowManual;
  assert.deepEqual(persistedManual.binding, binding());
  assert.equal(JSON.stringify(persistedManual).includes('savedRevision'), false);
  const freshTarget = {...TARGET, savedRevision: TARGET.savedRevision + 1};
  const next = build({recipe: persisted, document: persistedManual,
    target: freshTarget, draftBaseRevision: freshTarget.savedRevision});
  assert.deepEqual(next.parameters.extendedParameters.originalShadowManual.binding,
    persistedManual.binding);
  assert.throws(() => build({recipe: persisted, document: persistedManual,
    target: freshTarget, draftBaseRevision: TARGET.savedRevision}),
  /ORIGINAL_SHADOW_MANUAL_REVISION_MISMATCH/);
});
