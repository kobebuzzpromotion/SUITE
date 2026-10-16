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
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Portable Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};

function postDecode() {
  return {schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {levels: {
      master: {inputBlack: 4, inputWhite: 250, gamma: 1.2, outputBlack: 5, outputWhite: 245},
      red: {inputBlack: 6, inputWhite: 247, gamma: 0.9, outputBlack: 7, outputWhite: 240},
      green: {inputBlack: 8, inputWhite: 248, gamma: 1.1, outputBlack: 9, outputWhite: 241},
      blue: {inputBlack: 10, inputWhite: 249, gamma: 1.3, outputBlack: 11, outputWhite: 242},
    }, vibrance: 12},
    detail: {sharpness: 15, grain: {amount: 48, seed: 0x12345678,
      shadows: 75, midtones: 85, highlights: 65, size: 35, roughness: 25, colorVariation: 45}},
  };
}
function sourceRecipe() {
  const value = recipe();
  value.parameters.exposure = 0.5;
  value.parameters.extendedParameters.postDecodeAdjustments = postDecode();
  value.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(value);
  return value;
}

test('PORTABLE-LG01: four Levels channels and all seven Grain controls plus stable seed round-trip exactly', () => {
  const source = sourceRecipe(), original = clone(source);
  const parameters = portableParameters(source);
  assert.deepEqual(parameters.postDecodeAdjustments, postDecode());
  assert.deepEqual(checkParameters(parameters), parameters);
  const body = recipeFromParameters(parameters);
  assert.deepEqual(portablePresetRecipe(body).parameters.extendedParameters.postDecodeAdjustments, postDecode());
  assert.deepEqual(portableParameters(body), parameters);
  assert.deepEqual(source, original);
  parameters.postDecodeAdjustments.detail.grain.size = 90;
  assert.equal(source.parameters.extendedParameters.postDecodeAdjustments.detail.grain.size, 35);
});

test('PORTABLE-LG02: photo-local, unsupported, malformed and symbol controls refuse without stripping', () => {
  const mutations = [
    branch => {branch.color.levels.master.inputBlack = 251;},
    branch => {branch.color.levels.master.gamma = 0;},
    branch => {branch.color.levels.red.outputWhite = 256;},
    branch => {branch.color.levels.green.unknown = 1;},
    branch => {branch.color.levels.blue = {};},
    branch => {branch.detail.grain.amount = -1;},
    branch => {branch.detail.grain.seed = -1;},
    branch => {delete branch.detail.grain.seed;},
    branch => {branch.detail.grain.colorVariation = Infinity;},
    branch => {branch.detail.grain.unknown = 2;},
    branch => {branch.detail.denoise = 101;},
    branch => {branch.color.toneCurve = {shadows: 101};},
    branch => {branch.detail.grain[Symbol('hidden')] = 1;},
  ];
  for (const mutate of mutations) {
    const candidate = sourceRecipe();
    mutate(candidate.parameters.extendedParameters.postDecodeAdjustments);
    assert.throws(() => portablePresetRecipe(candidate));
  }
  for (const key of ['crop', 'portrait', 'export', 'canvasExpand', 'postCropAdjustments']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[key] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
  const invalid = portableParameters(sourceRecipe());
  invalid[Symbol('hidden')] = 1;
  assert.throws(() => checkParameters(invalid), /CORRUPT_PRESET_PARAMETERS/);
});

test('PORTABLE-LG03: old three-value and existing HSL/Detail snapshot shapes are unchanged', () => {
  const old = {exposure: 0.25, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(old), old);
  const candidate = sourceRecipe();
  candidate.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {hsl: {red: {hue: 12}}}, detail: {clarity: 14, texture: -15, sharpness: 16},
  };
  const expected = clone(candidate.parameters.extendedParameters.postDecodeAdjustments);
  assert.deepEqual(portableParameters(candidate).postDecodeAdjustments, expected);
});

test('PORTABLE-LG04: author draft/accepted preset persists both branches across SQLite reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-lg-preset-'));
  const path = join(directory, 'author.sqlite');
  const expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
        JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Tonal grain', recipe: sourceRecipe(),
      assetID: ASSET_A, recipeRevision: 1});
    assert.deepEqual(draft.parameters, expected);
    const submitted = store.submitDraft(author, draft.id, draft.revision);
    const accepted = store.reviewDraft(reviewer, draft.id, submitted.revision, 'ACCEPTED');
    assert.deepEqual(accepted.preset.parameters, expected);
    const published = clone(store.listPresets(author));
    store.close();
    store = new AuthorStore(path, {verifySource: () => {throw Error('UNEXPECTED_SOURCE_CHECK');}});
    assert.deepEqual(store.listPresets(author), published);
    assert.deepEqual(checkParameters(published[0].parameters), expected);
  } finally {
    store.close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('PORTABLE-LG05: Editor applies saved values and reopens them after real Recipe save', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)};
  const pixels = syntheticPixels(12, 8, 96);
  let saved = {body: recipe(), revision: 1};
  let cached = {asset, proxy: pixels, history: [clone(saved.body)], cursor: 0,
    revision: 1, dirty: false};
  let url = 0;
  const api = {listAssets: async () => [asset], getRecipe: async () => clone(saved),
    saveRecipe: async (_id, revision, body) => {
      assert.equal(revision, saved.revision);
      saved = {body: clone(body), revision: revision + 1};
      return clone(saved);
    }};
  const storage = {get: async () => clone(cached), put: async (_id, value) => {cached = clone(value);}};
  const processing = {render: async (frame, body) => renderPixels(frame, body,
    {validateRecipe, resolutionAssessment}), encode: async frame => new Blob([frame.data])};
  const makeSession = async () => {
    const session = new EditorSession({api, storage, processing,
      urlAPI: {createObjectURL: () => `blob:lg-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A);
    return session;
  };
  const session = await makeSession();
  const preset = portableParameters(sourceRecipe());
  await session.applyPortablePreset(preset);
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments, postDecode());
  assert.equal(session.state.dirty, true);
  await session.save();
  assert.equal(session.state.dirty, false);
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments, postDecode());
  assert.deepEqual(portableParameters(reopened.state.recipe).postDecodeAdjustments, postDecode());
});
