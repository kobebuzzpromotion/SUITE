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
import {applySelectiveColor, SELECTIVE_COLOR_RANGES} from '../src/processing/selective-color.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Selective Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
const controls = ['cyan', 'magenta', 'yellow', 'black'];
function selective(method = 'absolute') {
  return {method, ranges: Object.fromEntries(SELECTIVE_COLOR_RANGES.map((name, index) =>
    [name, Object.fromEntries(controls.map((field, channel) =>
      [field, (index + 1) * (channel + 2) * (channel % 2 ? -1 : 1)]))]))};
}
function sourceRecipe(settings = selective()) {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {selectiveColor: settings},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}
function pixels() {
  const values = [
    [200, 40, 40, 255], [200, 180, 20, 255], [40, 200, 40, 255],
    [30, 190, 200, 255], [40, 50, 220, 255], [200, 40, 190, 255],
    [230, 230, 230, 255], [110, 105, 100, 255], [30, 30, 30, 255],
    [255, 0, 0, 0],
  ];
  return {width: values.length, height: 1, data: new Uint8ClampedArray(values.flat())};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-SELECT01: all nine CMYK families and both methods retain explicit values and old shapes', () => {
  const legacy = {exposure: 0.5, contrast: 1.2, saturation: 0.8};
  assert.deepEqual(checkParameters(legacy), legacy);
  for (const method of ['relative', 'absolute']) {
    const source = sourceRecipe(selective(method)), before = clone(source);
    const saved = portableParameters(source);
    assert.deepEqual(saved.postDecodeAdjustments.color.selectiveColor, selective(method));
    assert.deepEqual(checkParameters(saved), saved);
    assert.deepEqual(portablePresetRecipe(recipeFromParameters(saved)).parameters
      .extendedParameters.postDecodeAdjustments.color.selectiveColor, selective(method));
    assert.deepEqual(source, before);
  }
  const implicitRelative = sourceRecipe({ranges: {reds: {cyan: 20}}});
  assert.deepEqual(portableParameters(implicitRelative).postDecodeAdjustments.color.selectiveColor,
    {ranges: {reds: {cyan: 20}}});
  const methodOnly = sourceRecipe({method: 'absolute'});
  assert.deepEqual(portableParameters(methodOnly).postDecodeAdjustments.color.selectiveColor,
    {method: 'absolute'});
});

test('PORTABLE-SELECT02: malformed method/range, unknown/symbol, Mask and photo-local fields refuse', () => {
  const edits = [
    entry => {entry.method = 'auto';}, entry => {entry.ranges.reds.cyan = 101;},
    entry => {entry.ranges.yellows.magenta = 0.5;},
    entry => {entry.ranges.unknown = {cyan: 1};},
    entry => {entry.ranges.blues.unknown = 1;},
    entry => {entry.ranges.greens = {};},
    entry => {entry.ranges.cyans.yellow = Infinity;},
    entry => {entry.mask = [1, 2];},
    entry => {entry.ranges.magentas[Symbol('unknown')] = 1;},
  ];
  for (const edit of edits) {
    const candidate = sourceRecipe();
    edit(candidate.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extension of ['crop', 'portrait', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extension] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});

test('PORTABLE-SELECT03: author adoption preserves Selective Color across SQLite restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-select-preset-'));
  const path = join(directory, 'author.sqlite');
  const expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Selective Color', recipe: sourceRecipe(),
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

test('PORTABLE-SELECT04: Editor apply/save/reload retains all controls and Final renders both modes', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)}, frame = pixels(), sourceBefore = frame.data.slice();
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
      urlAPI: {createObjectURL: () => `blob:selective-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
    selective());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
    selective());
  const baseline = render(frame, recipe());
  const absolute = render(frame, reopened.state.recipe);
  assert.deepEqual(absolute.data, applySelectiveColor(baseline, selective()).data);
  const relative = render(frame, recipeFromParameters(portableParameters(sourceRecipe(selective('relative')))));
  assert.deepEqual(relative.data, applySelectiveColor(baseline, selective('relative')).data);
  assert.notDeepEqual(absolute.data, relative.data);
  assert.deepEqual(frame.data, sourceBefore);
});
