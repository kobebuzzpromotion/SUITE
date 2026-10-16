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
const curve = () => ({shadows: 75, midtones: -30, highlights: 45});
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Tone Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};

function sourceRecipe(settings = curve()) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {toneCurve: settings},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  const values = [[20, 20, 20, 255], [85, 85, 85, 255], [135, 135, 135, 255],
    [205, 205, 205, 255]];
  return {width: values.length, height: 1, data: new Uint8ClampedArray(values.flat())};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-TONE01: all three controls, subset and old snapshot round-trip exactly', () => {
  const old = {exposure: 0.25, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(old), old);
  const source = sourceRecipe(), before = clone(source);
  const values = portableParameters(source);
  assert.deepEqual(values.postDecodeAdjustments.color.toneCurve, curve());
  assert.deepEqual(checkParameters(values), values);
  assert.deepEqual(portablePresetRecipe(recipeFromParameters(values)).parameters
    .extendedParameters.postDecodeAdjustments.color.toneCurve, curve());
  assert.deepEqual(source, before);
  assert.deepEqual(portableParameters(sourceRecipe({midtones: 25})).postDecodeAdjustments
    .color.toneCurve, {midtones: 25});
  const combined = sourceRecipe();
  const color = combined.parameters.extendedParameters.postDecodeAdjustments.color;
  color.pointCurves = {red: [{x: 0, y: 0}, {x: 255, y: 240}]};
  color.levels = {master: {gamma: 1.2}};
  color.glow = {intensity: 20};
  color.calibration = {blue: {hue: -10}};
  color.selectiveColor = {ranges: {reds: {cyan: 10}}};
  combined.parameters.extendedParameters.postDecodeAdjustments.detail = {grain: {amount: 15, seed: 7}};
  assert.deepEqual(checkParameters(portableParameters(combined)).postDecodeAdjustments,
    combined.parameters.extendedParameters.postDecodeAdjustments);
});

test('PORTABLE-TONE02: empty, non-finite, out-of-range, unknown, symbol and photo-local values refuse', () => {
  const edits = [
    () => ({}), () => ({shadows: 101}), () => ({midtones: -101}),
    () => ({highlights: NaN}), () => ({shadows: Infinity}),
    () => ({shadows: '10'}), () => ({shadows: 1, unknown: 2}),
    () => Object.assign({shadows: 1}, {[Symbol('hidden')]: 2}),
    () => new class Tone {constructor() {this.shadows = 10;}}(),
    () => [10, 20],
  ];
  for (const edit of edits) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve = edit();
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extension of ['portrait', 'crop', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-TONE03: plain JSON from another realm is accepted, class payload refused', () => {
  const source = sourceRecipe();
  source.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve =
    runInNewContext('({shadows: 75, midtones: -30, highlights: 45})');
  assert.deepEqual(portablePresetRecipe(source).parameters.extendedParameters
    .postDecodeAdjustments.color.toneCurve, curve());
  const bad = sourceRecipe();
  bad.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve =
    new class Curve {constructor() {this.shadows = 75;}}();
  assert.throws(() => portablePresetRecipe(bad), /INVALID_POST_DECODE_PRESET/);
});

test('PORTABLE-TONE04: author draft, acceptance and SQLite reopen preserve curve values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-tone-preset-'));
  const path = join(directory, 'author.sqlite'), expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Parametric curve', recipe: sourceRecipe(),
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

test('PORTABLE-TONE05: Editor applies, saves, reopens and Final renders saved curve', async () => {
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
      urlAPI: {createObjectURL: () => `blob:tone-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve, curve());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve, curve());
  const baseline = render(frame, recipe()), actual = render(frame, reopened.state.recipe);
  assert.deepEqual(actual.data, applyColorAdjustments(baseline, {toneCurve: curve()}).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual(frame.data, before);
});
