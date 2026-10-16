import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {AuthorStore} from '../author-store.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portableParameters, recipeFromParameters, checkParameters} from '../preset-policy.mjs';
import {EditorSession} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const settings = () => ({temperature: 65, tint: -30});
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Color Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
function sourceRecipe(values = settings()) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: values,
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  return {width: 4, height: 1, data: new Uint8ClampedArray([
    30, 80, 130, 255, 80, 120, 160, 255, 160, 100, 40, 255, 210, 180, 150, 255,
  ])};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-TEMP01: optional display-referred Temperature/Tint and old preset round-trip', () => {
  const old = {exposure: 0.25, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(old), old);
  for (const values of [settings(), {temperature: -100}, {tint: 100}, {temperature: 0, tint: 0}]) {
    const source = sourceRecipe(values), before = clone(source);
    const parameters = portableParameters(source);
    assert.deepEqual(parameters.postDecodeAdjustments.color, values);
    assert.deepEqual(checkParameters(parameters), parameters);
    assert.deepEqual(portablePresetRecipe(recipeFromParameters(parameters)).parameters
      .extendedParameters.postDecodeAdjustments.color, values);
    assert.deepEqual(source, before);
  }
  const combined = sourceRecipe();
  const branch = combined.parameters.extendedParameters.postDecodeAdjustments;
  branch.color.toneCurve = {shadows: 10};
  branch.color.pointCurves = {red: [{x: 0, y: 0}, {x: 255, y: 240}]};
  branch.color.levels = {master: {gamma: 1.2}};
  branch.color.glow = {intensity: 20};
  branch.color.calibration = {blue: {hue: -10}};
  branch.color.selectiveColor = {ranges: {reds: {cyan: 10}}};
  branch.detail = {denoise: 20, grain: {amount: 15, seed: 7}};
  assert.deepEqual(checkParameters(portableParameters(combined)).postDecodeAdjustments, branch);
});

test('PORTABLE-TEMP02: invalid, unknown, symbol and photo-local settings refuse', () => {
  for (const value of [-101, 101, NaN, Infinity, '10', null, {}, []]) {
    for (const field of ['temperature', 'tint']) {
      const candidate = sourceRecipe();
      candidate.parameters.extendedParameters.postDecodeAdjustments.color[field] = value;
      assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
    }
  }
  for (const edit of [
    color => {color.unknown = 1;}, color => {color[Symbol('hidden')] = 1;},
    color => {color.whiteBalanceKelvin = 5500;},
  ]) {
    const candidate = sourceRecipe();
    edit(candidate.parameters.extendedParameters.postDecodeAdjustments.color);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extension of ['portrait', 'crop', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-TEMP03: cross-realm plain JSON works; class color payload refuses', () => {
  const source = sourceRecipe();
  source.parameters.extendedParameters.postDecodeAdjustments.color =
    runInNewContext('({temperature: 65, tint: -30})');
  assert.deepEqual(portablePresetRecipe(source).parameters.extendedParameters
    .postDecodeAdjustments.color, settings());
  const bad = sourceRecipe();
  bad.parameters.extendedParameters.postDecodeAdjustments.color =
    new class Color {constructor() {this.temperature = 65; this.tint = -30;}}();
  assert.throws(() => portablePresetRecipe(bad), /INVALID_POST_DECODE_PRESET/);
});

test('PORTABLE-TEMP04: author draft, acceptance and SQLite reopen preserve both values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-temp-preset-'));
  const path = join(directory, 'author.sqlite'), expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Display color cast', recipe: sourceRecipe(),
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

test('PORTABLE-TEMP05: Editor apply/save/reopen drives display-referred Final color pixels', async () => {
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
      urlAPI: {createObjectURL: () => `blob:temp-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color, settings());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color, settings());
  const baseline = render(frame, recipe()), actual = render(frame, reopened.state.recipe);
  assert.deepEqual(actual.data, applyColorAdjustments(baseline, settings()).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual(frame.data, before);
});
