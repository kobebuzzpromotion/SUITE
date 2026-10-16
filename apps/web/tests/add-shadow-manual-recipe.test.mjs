import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {buildAddShadowManualRecipe} from '../src/add-shadow-manual-recipe.mjs';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

const target = () => ({id: ASSET_A, sha256: SHA, sourceWidth: 160,
  sourceHeight: 120});
const backdrop = () => ({id: ASSET_B, sha256: 'b'.repeat(64)});
const binding = () => ({assetID: ASSET_A, originalSHA256: SHA,
  sourceWidth: 160, sourceHeight: 120, backdropID: ASSET_B,
  backdropSHA256: 'b'.repeat(64)});
const document = () => ({schemaVersion: 1, engineVersion: ADD_SHADOW_VERSION,
  binding: binding(), subjectStrokes: [{operation: 'ADD',
    path: [{u: .2, v: .3}, {u: .4, v: .5}], radiusFraction: .04,
    hardness: .75}], settings: {mode: 'soft', opacity: 70, blur: 12,
    gradient: 20, blend: 'normal', offsetX: 8, offsetY: -5,
    shadowColor: [0, 0, 0]}});
const build = (overrides = {}) => buildAddShadowManualRecipe({recipe: recipe(),
  document: document(), target: target(), backdrop: backdrop(), ...overrides});

test('SHADOW-RECIPE-01: typed manual document preserves every existing adjustment, order, portrait Original reference and inputs', () => {
  const original = recipe(portrait(ASSET_A));
  original.parameters.exposure = .3;
  original.parameters.contrast = 1.2;
  original.parameters.saturation = .8;
  original.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {vibrance: 20}};
  original.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  const before = structuredClone(original), draft = document();
  validateRecipe(original);
  const next = build({recipe: original, document: draft});
  validateRecipe(next);
  assert.deepEqual(original, before);
  assert.deepEqual(next.parameters.processingOrder,
    original.parameters.processingOrder);
  const {addShadowManual, ...unrelated} = next.parameters.extendedParameters;
  assert.deepEqual(unrelated, original.parameters.extendedParameters);
  assert.deepEqual(addShadowManual, draft);
  assert.notStrictEqual(addShadowManual, draft);
  assert.notStrictEqual(next.parameters.extendedParameters.portrait,
    original.parameters.extendedParameters.portrait);
  draft.subjectStrokes[0].path[0].u = .9;
  original.parameters.exposure = 9;
  assert.equal(addShadowManual.subjectStrokes[0].path[0].u, .2);
  assert.equal(next.parameters.exposure, .3);
  assert.doesNotMatch(JSON.stringify(next),
    /permissionEvidence|ownerConfirmed|savedRevision|pixelsSHA256|bitmap/);
});

test('SHADOW-RECIPE-02: independent target and backdrop identity, SHA and full size reject mismatched or forged document', () => {
  for (const [field, changed] of [
    ['target', {id: '44444444-4444-4444-8444-444444444444'}],
    ['target', {sha256: 'c'.repeat(64)}],
    ['target', {sourceWidth: 161}], ['target', {sourceHeight: 121}],
    ['backdrop', {id: '33333333-3333-4333-8333-333333333333'}],
    ['backdrop', {sha256: 'c'.repeat(64)}]]) {
    const value = field === 'target' ? {...target(), ...changed} :
      {...backdrop(), ...changed};
    assert.throws(() => build({[field]: value}), /BINDING_MISMATCH/);
  }
  assert.throws(() => build({target: {...target(), authorized: true}}),
    /BINDING_INVALID/);
  assert.throws(() => build({document: {...document(), savedRevision: 1}}),
    /DOCUMENT_INVALID/);
  assert.throws(() => build({ownerConfirmed: true}), /INPUT_INVALID/);
  assert.throws(() => build({document: {...document(), subjectStrokes: []}}),
    /STROKES_INVALID/);
});

test('SHADOW-RECIPE-03: same binding can update; conflicting old shadow refuses without deleting legitimate B/W or other extensions', () => {
  const initial = build();
  initial.parameters.extendedParameters.bwEdgeManual = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_A, originalSHA256: SHA,
      sourceWidth: 160, sourceHeight: 120},
    subjectStrokes: [{operation: 'ADD', path: [{u: .1, v: .1}],
      radiusFraction: .04, hardness: .7}],
    correctionStrokes: [{operation: 'ADD', path: [{u: .2, v: .2}],
      radiusFraction: .04, hardness: .7}]};
  validateRecipe(initial);
  const changed = document(); changed.settings.opacity = 45;
  const next = build({recipe: initial, document: changed});
  assert.equal(next.parameters.extendedParameters.addShadowManual.settings.opacity, 45);
  assert.deepEqual(next.parameters.extendedParameters.bwEdgeManual,
    initial.parameters.extendedParameters.bwEdgeManual);
  const conflict = structuredClone(initial);
  conflict.parameters.extendedParameters.addShadowManual.binding.originalSHA256 =
    'c'.repeat(64);
  validateRecipe(conflict);
  assert.throws(() => build({recipe: conflict}), /EXISTING_BINDING_CONFLICT/);
  assert.deepEqual(initial.parameters.extendedParameters.addShadowManual,
    document());
});

test('SHADOW-RECIPE-04: malformed old recipe, non-JSON values, accessor and abort fail closed', () => {
  const wrong = recipe(); wrong.parameters.processingOrder = ['exposure', 'exposure'];
  assert.throws(() => build({recipe: wrong}), /INVALID_PIPELINE/);
  const sparse = recipe(); sparse.parameters.processingOrder = ['exposure', , 'rotation'];
  assert.throws(() => build({recipe: sparse}), /JSON_INVALID/);
  const accessor = recipe(); Object.defineProperty(accessor.parameters,
    'exposure', {get() {throw Error('GETTER_EXECUTED');}, enumerable: true});
  assert.throws(() => build({recipe: accessor}), /JSON_INVALID/);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => build({signal: controller.signal}), {name: 'AbortError'});
});

test('SHADOW-RECIPE-05: only explicit Replace may change a background while target binding and other extensions survive', () => {
  const original = build();
  const nextBackdrop = {id: '33333333-3333-4333-8333-333333333333', sha256: 'c'.repeat(64)};
  const nextDocument = document();
  nextDocument.binding.backdropID = nextBackdrop.id;
  nextDocument.binding.backdropSHA256 = nextBackdrop.sha256;
  assert.throws(() => build({recipe: original, document: nextDocument,
    backdrop: nextBackdrop}), /EXISTING_BINDING_CONFLICT/);
  const replaced = build({recipe: original, document: nextDocument,
    backdrop: nextBackdrop, replaceBackdrop: true});
  assert.deepEqual(replaced.parameters.extendedParameters.addShadowManual,
    nextDocument);
  assert.deepEqual(original.parameters.extendedParameters.addShadowManual,
    document());
  const changedTarget = structuredClone(original);
  changedTarget.parameters.extendedParameters.addShadowManual.binding.originalSHA256 =
    'd'.repeat(64);
  assert.throws(() => build({recipe: changedTarget, document: nextDocument,
    backdrop: nextBackdrop, replaceBackdrop: true}), /EXISTING_BINDING_CONFLICT/);
});
