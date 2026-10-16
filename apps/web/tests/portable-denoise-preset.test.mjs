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
import {applyDenoise} from '../src/processing/detail-adjustments.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Detail Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
function sourceRecipe(value = 90) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', detail: {denoise: value},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const offset = (y * 8 + x) * 4, value = (x + y) % 2 ? 20 : 235;
    data.set([value, value, value, 255], offset);
  }
  return {width: 8, height: 8, data};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-DENOISE01: optional signed Denoise round-trips and old preset remains identical', () => {
  const old = {exposure: 0.25, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(old), old);
  for (const value of [-100, 0, 90, 100]) {
    const source = sourceRecipe(value), before = clone(source);
    const parameters = portableParameters(source);
    assert.equal(parameters.postDecodeAdjustments.detail.denoise, value);
    assert.deepEqual(checkParameters(parameters), parameters);
    assert.equal(portablePresetRecipe(recipeFromParameters(parameters)).parameters
      .extendedParameters.postDecodeAdjustments.detail.denoise, value);
    assert.deepEqual(source, before);
  }
  const combined = sourceRecipe();
  const branch = combined.parameters.extendedParameters.postDecodeAdjustments;
  branch.detail.grain = {amount: 20, seed: 7};
  branch.color = {toneCurve: {shadows: 10}, pointCurves: {red: [{x: 0, y: 0}, {x: 255, y: 240}]},
    levels: {master: {gamma: 1.2}}, glow: {intensity: 20},
    selectiveColor: {ranges: {reds: {cyan: 10}}}, calibration: {blue: {hue: -10}}};
  assert.deepEqual(checkParameters(portableParameters(combined)).postDecodeAdjustments, branch);
});

test('PORTABLE-DENOISE02: invalid controls, symbols, unknown and photo-local fields refuse', () => {
  for (const value of [-101, 101, NaN, Infinity, '10', null, {}, []]) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters.postDecodeAdjustments.detail.denoise = value;
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const edit of [
    detail => {detail.unknown = 1;},
    detail => {detail[Symbol('hidden')] = 1;},
  ]) {
    const candidate = sourceRecipe();
    edit(candidate.parameters.extendedParameters.postDecodeAdjustments.detail);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extension of ['portrait', 'crop', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-DENOISE03: plain JSON from another realm works; class detail refuses', () => {
  const source = sourceRecipe();
  source.parameters.extendedParameters.postDecodeAdjustments.detail =
    runInNewContext('({denoise: 90})');
  assert.equal(portablePresetRecipe(source).parameters.extendedParameters
    .postDecodeAdjustments.detail.denoise, 90);
  const bad = sourceRecipe();
  bad.parameters.extendedParameters.postDecodeAdjustments.detail =
    new class Detail {constructor() {this.denoise = 90;}}();
  assert.throws(() => portablePresetRecipe(bad), /INVALID_POST_DECODE_PRESET/);
});

test('PORTABLE-DENOISE04: author draft, acceptance and SQLite reopen preserve Denoise', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-denoise-preset-'));
  const path = join(directory, 'author.sqlite'), expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Denoise', recipe: sourceRecipe(),
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

test('PORTABLE-DENOISE05: Editor applies, saves, reopens and Final renders saved Denoise', async () => {
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
      urlAPI: {createObjectURL: () => `blob:denoise-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.denoise, 90);
  await session.save();
  const reopened = await makeSession();
  assert.equal(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.denoise, 90);
  const baseline = render(frame, recipe()), actual = render(frame, reopened.state.recipe);
  assert.deepEqual(actual.data, applyDenoise(baseline, 90).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual(frame.data, before);
});
