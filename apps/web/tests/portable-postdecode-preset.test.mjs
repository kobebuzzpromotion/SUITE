import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthorStore} from '../author-store.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portableParameters, recipeFromParameters, checkParameters} from '../preset-policy.mjs';
import {EditorSession} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe, syntheticPixels} from './fixtures.mjs';

const clone = value => structuredClone(value);
const colors = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Postdecode Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
const engineVersion = 'suite-srgb8-color-detail-1';

function adjustments() {
  return {
    schemaVersion: 1,
    engineVersion,
    color: {
      highlights: 23, shadows: -34, whites: 45, blacks: -56, vibrance: 67,
      hsl: Object.fromEntries(colors.map((color, index) => [color, {
        hue: index + 1, saturation: -(index + 1), luminance: index + 11,
      }])),
    },
    detail: {clarity: -78, texture: 89, sharpness: 90},
  };
}

function sourceRecipe(postDecodeAdjustments = adjustments()) {
  const result = recipe();
  result.parameters.exposure = 0.5;
  result.parameters.contrast = 1.25;
  result.parameters.saturation = 0.75;
  result.parameters.extendedParameters.postDecodeAdjustments = clone(postDecodeAdjustments);
  result.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(result);
  return result;
}

test('PORTABLE-PD01: Recipe v1 round-trips every implemented postdecode field while old three-value presets stay exact', () => {
  const legacy = {exposure: 0.5, contrast: 1.25, saturation: 0.75};
  assert.deepEqual(checkParameters(legacy), legacy);
  assert.deepEqual(portableParameters(recipeFromParameters(legacy)), legacy);

  const source = sourceRecipe(), before = clone(source);
  const portable = portablePresetRecipe(source);
  const parameters = portableParameters(source);
  assert.deepEqual(source, before);
  assert.equal(portable.schemaVersion, 1);
  assert.deepEqual(parameters, {...legacy, postDecodeAdjustments: adjustments()});
  assert.deepEqual(portable.parameters.extendedParameters, {postDecodeAdjustments: adjustments()});
  assert.deepEqual(portable.parameters.processingOrder, ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments']);
  assert.deepEqual(checkParameters(parameters), parameters);
  assert.deepEqual(portableParameters(recipeFromParameters(parameters)), parameters);
  parameters.postDecodeAdjustments.color.hsl.red.hue = 99;
  assert.equal(source.parameters.extendedParameters.postDecodeAdjustments.color.hsl.red.hue, 1);
});

test('PORTABLE-PD02: nonportable photo data and invalid postdecode controls refuse without changing input', () => {
  const mutations = [
    r => {r.parameters.rotationDegrees = 90;},
    r => {r.parameters.extendedParameters.crop = {};},
    r => {r.parameters.extendedParameters.portrait = {};},
    r => {r.parameters.extendedParameters.export = {};},
    r => {r.parameters.extendedParameters.postDecodeAdjustments.color.whiteBalance = 10;},
    r => {r.parameters.extendedParameters.postDecodeAdjustments.color.hsl.pink = {hue: 1};},
    r => {r.parameters.extendedParameters.postDecodeAdjustments.color.hsl.red.hue = 101;},
    r => {r.parameters.extendedParameters.postDecodeAdjustments.detail.sharpness = -1;},
    r => {r.parameters.extendedParameters.postDecodeAdjustments.engineVersion = 'unknown';},
    r => {r.parameters.processingOrder = ['postDecodeAdjustments', 'exposure', 'contrast', 'saturation', 'rotation'];},
    r => {r.parameters.processingOrder = ['exposure', 'contrast', 'saturation', 'rotation'];},
  ];
  for (const mutate of mutations) {
    const candidate = sourceRecipe(), before = clone(candidate);
    mutate(candidate);
    const attempted = clone(candidate);
    assert.throws(() => portablePresetRecipe(candidate));
    assert.deepEqual(candidate, attempted);
    assert.notDeepEqual(candidate, before);
  }
  const valid = portableParameters(sourceRecipe());
  for (const extra of [{rotationDegrees: 90}, {assetID: ASSET_A}, {postDecodeAdjustments: {...adjustments(), detail: {sharpness: 101}}}]) {
    assert.throws(() => checkParameters({...valid, ...extra}));
  }
});

test('PORTABLE-PD03: accepted author version retains the exact portable branch and source stays separately verified', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-postdecode-preset-'));
  const path = join(directory, 'author.sqlite');
  const source = sourceRecipe(), expected = portableParameters(source);
  let store = new AuthorStore(path, {verifySource: (actor, supplied) => {
    if (actor.id !== author.id || supplied.assetID !== ASSET_A || supplied.recipeRevision !== 1 ||
      JSON.stringify(supplied.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const input = {name: 'Complete sRGB look', recipe: source, assetID: ASSET_A, recipeRevision: 1};
    const draft = store.createDraft(author, input);
    assert.deepEqual(draft.parameters, expected);
    const submitted = store.submitDraft(author, draft.id, 1);
    const accepted = store.reviewDraft(reviewer, draft.id, submitted.revision, 'ACCEPTED');
    assert.deepEqual(accepted.preset.parameters, expected);
    const published = clone(store.listPresets(author));
    assert.equal(JSON.stringify(published).includes(ASSET_A), false);
    assert.equal(JSON.stringify(published).includes('originalSHA256'), false);
    assert.equal(JSON.stringify(published).includes('portrait'), false);
    assert.equal(JSON.stringify(published).includes('crop'), false);

    const altered = sourceRecipe();
    altered.parameters.extendedParameters.postDecodeAdjustments.detail.texture = 88;
    assert.throws(() => store.saveDraft(author, draft.id, {...input, recipe: altered, expectedRevision: 1}), /SOURCE_RECIPE_MISMATCH/);
    const newer = store.saveDraft(author, draft.id, {...input, name: 'Later name', expectedRevision: 1});
    assert.equal(newer.revision, 2);
    assert.deepEqual(store.listPresets(author), published);
    store.close();
    store = new AuthorStore(path, {verifySource: () => {throw Error('UNEXPECTED_SOURCE_CHECK');}});
    assert.deepEqual(store.listPresets(author), published);
  } finally {
    store.close();
    await rm(directory, {recursive: true, force: true});
  }
});

async function editor(initial) {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)};
  const proxy = syntheticPixels(12, 8, 96);
  const persisted = [];
  let renders = 0, url = 0;
  const session = new EditorSession({
    api: {listAssets: async () => [asset], getRecipe: async () => ({body: clone(initial), revision: 1})},
    storage: {
      get: async () => ({asset, proxy, history: [clone(initial)], cursor: 0, revision: 1, dirty: false}),
      put: async (_id, value) => {persisted.push(clone(value));},
    },
    processing: {
      render: async (pixels, body) => {renders++; return renderPixels(pixels, body, {validateRecipe, resolutionAssessment});},
      encode: async pixels => new Blob([pixels.data]),
    },
    urlAPI: {createObjectURL: () => `blob:synthetic-${++url}`, revokeObjectURL() {}},
  });
  await session.initialize();
  await session.openAsset(ASSET_A);
  return {session, persisted, get renders() {return renders;}};
}

test('PORTABLE-PD04: new branch replaces prior controls in one undoable edit; legacy preset preserves them', async () => {
  const original = sourceRecipe({schemaVersion: 1, engineVersion, color: {whites: 20}, detail: {texture: 30}});
  original.parameters.rotationDegrees = 90;
  const f = await editor(original), before = f.session.state.recipe;
  const parameters = portableParameters(sourceRecipe());
  const renderCount = f.renders, persistCount = f.persisted.length;
  await f.session.applyPortablePreset(parameters);
  const applied = f.session.state.recipe;
  assert.deepEqual(applied.parameters.extendedParameters.postDecodeAdjustments, adjustments());
  assert.equal(applied.parameters.rotationDegrees, 90);
  assert.deepEqual(applied.parameters.processingOrder, ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']);
  assert.equal(f.session.history.length, 2);
  assert.equal(f.persisted.length, persistCount + 1);
  assert.equal(f.renders, renderCount + 1);
  assert.equal(f.session.state.dirty, true);
  await f.session.undo();
  assert.deepEqual(f.session.state.recipe, before);
  await f.session.redo();
  assert.deepEqual(f.session.state.recipe, applied);

  const priorBranch = clone(f.session.state.recipe.parameters.extendedParameters.postDecodeAdjustments);
  await f.session.applyPortablePreset({exposure: -1, contrast: 1, saturation: 1});
  assert.deepEqual(f.session.state.recipe.parameters.extendedParameters.postDecodeAdjustments, priorBranch);
  const snapshot = f.session.state.recipe, history = clone(f.session.history), writes = f.persisted.length;
  await assert.rejects(f.session.applyPortablePreset({...parameters, assetID: ASSET_A}));
  assert.deepEqual(f.session.state.recipe, snapshot);
  assert.deepEqual(f.session.history, history);
  assert.equal(f.persisted.length, writes);
});
