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
import {applyColorCalibration} from '../src/processing/color-calibration.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Calibration Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
const calibration = () => ({red: {hue: 55, saturation: -35},
  green: {hue: -65, saturation: 40}, blue: {hue: 25, saturation: -50}});
function sourceRecipe(values = calibration()) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {calibration: values},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  const values = [[190, 60, 35, 255], [50, 185, 65, 255], [55, 65, 210, 255],
    [200, 180, 40, 255], [110, 110, 110, 255], [240, 20, 130, 0]];
  return {width: values.length, height: 1, data: new Uint8ClampedArray(values.flat())};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-CAL01: six explicit primary controls round-trip without rewriting old snapshots', () => {
  const legacy = {exposure: 0.5, contrast: 1.25, saturation: 0.8};
  assert.deepEqual(checkParameters(legacy), legacy);
  const source = sourceRecipe(), original = clone(source);
  const parameters = portableParameters(source);
  assert.deepEqual(parameters.postDecodeAdjustments.color.calibration, calibration());
  assert.deepEqual(checkParameters(parameters), parameters);
  assert.deepEqual(portablePresetRecipe(recipeFromParameters(parameters)).parameters
    .extendedParameters.postDecodeAdjustments.color.calibration, calibration());
  assert.deepEqual(source, original);
  const partial = sourceRecipe({red: {hue: 10}});
  assert.deepEqual(portableParameters(partial).postDecodeAdjustments.color.calibration,
    {red: {hue: 10}});
  const combined = sourceRecipe();
  const color = combined.parameters.extendedParameters.postDecodeAdjustments.color;
  color.levels = {master: {gamma: 1.2}};
  color.glow = {intensity: 20, mode: 'whiteMist'};
  color.selectiveColor = {ranges: {reds: {cyan: 10}}};
  combined.parameters.extendedParameters.postDecodeAdjustments.detail = {
    grain: {amount: 15, seed: 7, size: 10},
  };
  assert.deepEqual(checkParameters(portableParameters(combined)).postDecodeAdjustments,
    combined.parameters.extendedParameters.postDecodeAdjustments);
});

test('PORTABLE-CAL02: invalid integer/range/shape, Mask and photo-specific fields refuse', () => {
  const mutations = [
    value => {value.red.hue = 101;}, value => {value.green.saturation = -101;},
    value => {value.blue.hue = 0.5;}, value => {value.red.unknown = 4;},
    value => {value.green = {};}, value => {value.purple = {hue: 5};},
    value => {value.blue[Symbol('hidden')] = 1;},
  ];
  for (const change of mutations) {
    const candidate = sourceRecipe();
    change(candidate.parameters.extendedParameters.postDecodeAdjustments.color.calibration);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  const mask = sourceRecipe();
  mask.parameters.extendedParameters.postDecodeAdjustments.color.calibration.mask = [1];
  assert.throws(() => portablePresetRecipe(mask), /INVALID_POST_DECODE_PRESET/);
  for (const extension of ['portrait', 'crop', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-CAL03: accepted author preset retains Calibration after SQLite reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-cal-preset-'));
  const path = join(directory, 'author.sqlite');
  const expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Primary Calibration', recipe: sourceRecipe(),
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

test('PORTABLE-CAL04: Editor apply/save/reload retains six values and Final composes actual pixels', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)}, frame = pixels(), before = frame.data.slice();
  let saved = {body: recipe(), revision: 1};
  let cached = {asset, proxy: frame, history: [clone(saved.body)], cursor: 0,
    revision: 1, dirty: false};
  let url = 0;
  const api = {listAssets: async () => [asset], getRecipe: async () => clone(saved),
    saveRecipe: async (_id, revision, body) => {
      assert.equal(revision, saved.revision);
      saved = {body: clone(body), revision: revision + 1}; return clone(saved);
    }};
  const storage = {get: async () => clone(cached), put: async (_id, value) => {cached = clone(value);}};
  const processing = {render: async (input, body) => render(input, body),
    encode: async input => new Blob([input.data])};
  const makeSession = async () => {
    const session = new EditorSession({api, storage, processing,
      urlAPI: {createObjectURL: () => `blob:cal-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
    calibration());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
    calibration());
  const baseline = render(frame, recipe());
  const actual = render(frame, reopened.state.recipe);
  assert.deepEqual(actual.data, applyColorCalibration(baseline, calibration()).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual(frame.data, before);
});
