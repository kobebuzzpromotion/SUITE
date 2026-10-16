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
import {applyPointCurves} from '../src/processing/point-curves.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Curve Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
function curves() {
  return {
    master: [{x: 0, y: 0}, {x: 128, y: 155}, {x: 255, y: 255}],
    red: [{x: 0, y: 5}, {x: 100, y: 115}, {x: 255, y: 250}],
    green: [{x: 0, y: 0}, {x: 140, y: 120}, {x: 255, y: 255}],
    blue: [{x: 0, y: 0}, {x: 180, y: 200}, {x: 255, y: 255}],
  };
}
function sourceRecipe(settings = curves()) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {pointCurves: settings},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  const values = [[15, 20, 25, 255], [70, 90, 110, 255], [130, 150, 170, 255],
    [210, 225, 240, 255], [99, 10, 240, 0]];
  return {width: values.length, height: 1, data: new Uint8ClampedArray(values.flat())};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-CURVE01: master/R/G/B points round-trip exactly; old and other portable branches remain valid', () => {
  const old = {exposure: 0.25, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(old), old);
  const source = sourceRecipe(), before = clone(source);
  const values = portableParameters(source);
  assert.deepEqual(values.postDecodeAdjustments.color.pointCurves, curves());
  assert.deepEqual(checkParameters(values), values);
  assert.deepEqual(portablePresetRecipe(recipeFromParameters(values)).parameters
    .extendedParameters.postDecodeAdjustments.color.pointCurves, curves());
  assert.deepEqual(source, before);
  assert.deepEqual(portableParameters(sourceRecipe({red: curves().red})).postDecodeAdjustments
    .color.pointCurves, {red: curves().red});
  const combined = sourceRecipe();
  const adjustment = combined.parameters.extendedParameters.postDecodeAdjustments;
  adjustment.color.levels = {master: {gamma: 1.2}};
  adjustment.color.glow = {intensity: 20, mode: 'whiteMist'};
  adjustment.color.selectiveColor = {ranges: {reds: {cyan: 10}}};
  adjustment.color.calibration = {red: {hue: 12}};
  adjustment.detail = {grain: {amount: 15, seed: 7}};
  assert.deepEqual(checkParameters(portableParameters(combined)).postDecodeAdjustments, adjustment);
});

test('PORTABLE-CURVE02: point count, endpoints, X order, integers, unknown/symbol and photo-local fields refuse', () => {
  const edits = [
    c => {c.master = [{x: 1, y: 0}, {x: 255, y: 255}];},
    c => {c.red = [{x: 0, y: 0}, {x: 254, y: 255}];},
    c => {c.green = [{x: 0, y: 0}];},
    c => {c.blue = Array.from({length: 33}, (_, x) => ({x: x * 7, y: x * 7}));},
    c => {c.master[1].x = 0;}, c => {c.red[1].y = 1.2;},
    c => {c.green[0].unknown = 1;}, c => {c.blue[0][Symbol('x')] = 1;},
    c => {c.unknown = curves().red;}, c => {c.master.extra = 1;},
    c => {delete c.master[1];},
  ];
  for (const edit of edits) {
    const candidate = sourceRecipe();
    edit(candidate.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extension of ['portrait', 'crop', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-CURVE03: plain JSON points from another realm are copied and validated', () => {
  const source = sourceRecipe();
  const otherRealm = runInNewContext(`(${JSON.stringify(curves())})`);
  source.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves = otherRealm;
  assert.deepEqual(portableParameters(source).postDecodeAdjustments.color.pointCurves, curves());
  const instance = sourceRecipe();
  instance.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.red[0] =
    new class Point {constructor() {this.x = 0; this.y = 5;}}();
  assert.throws(() => portablePresetRecipe(instance), /INVALID_POST_DECODE_PRESET/);
});

test('PORTABLE-CURVE04: accepted author snapshot survives SQLite reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-curve-preset-'));
  const path = join(directory, 'author.sqlite'), expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Point curve', recipe: sourceRecipe(),
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

test('PORTABLE-CURVE05: Editor applies, saves, reopens and Final renders the saved points', async () => {
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
      urlAPI: {createObjectURL: () => `blob:curve-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves,
    curves());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves,
    curves());
  const baseline = render(frame, recipe());
  const actual = render(frame, reopened.state.recipe);
  assert.deepEqual(actual.data, applyPointCurves(baseline, curves()).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual(frame.data, before);
});
