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
import {applyGlow, createGlowMaskOverlay} from '../src/processing/glow.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe, syntheticPixels} from './fixtures.mjs';

const clone = value => structuredClone(value);
const author = {id: 'aaaaaaaa-1111-4111-8111-111111111111', authorName: 'Glow Author', role: 'author'};
const reviewer = {id: 'bbbbbbbb-2222-4222-8222-222222222222', authorName: 'Reviewer', role: 'admin'};
const legacy = {intensity: 35, radius: 3, threshold: 130};
const expanded = mode => ({...legacy, mode, exposure: 30, diffusion: 65, tint: 20});
function sourceRecipe(glow = expanded('halation')) {
  const value = recipe();
  value.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {glow},
  };
  value.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(value);
  return value;
}
const render = (pixels, body) => renderPixels(pixels, body, {validateRecipe, resolutionAssessment});

test('PORTABLE-GLOW01: old three-value snapshot and all three explicit modes round-trip without defaults added', () => {
  const old = sourceRecipe(legacy), oldBefore = clone(old);
  const savedOld = portableParameters(old);
  assert.deepEqual(savedOld.postDecodeAdjustments.color.glow, legacy);
  assert.deepEqual(checkParameters(savedOld), savedOld);
  assert.deepEqual(portablePresetRecipe(recipeFromParameters(savedOld)).parameters
    .extendedParameters.postDecodeAdjustments.color.glow, legacy);
  assert.deepEqual(old, oldBefore);
  for (const mode of ['whiteMist', 'blackMist', 'halation']) {
    const source = sourceRecipe(expanded(mode));
    const portable = portableParameters(source);
    assert.deepEqual(portable.postDecodeAdjustments.color.glow, expanded(mode));
    assert.deepEqual(checkParameters(portable), portable);
    assert.deepEqual(portableParameters(recipeFromParameters(portable)), portable);
  }
});

test('PORTABLE-GLOW02: unknown mode/control, Mask, invalid ranges and photo-local data fail closed', () => {
  const edits = [
    glow => {glow.mode = 'neon';}, glow => {glow.exposure = -101;},
    glow => {glow.diffusion = 101;}, glow => {glow.tint = Infinity;},
    glow => {glow.radius = 0;}, glow => {glow.threshold = 256;},
    glow => {glow.showGlowMask = true;}, glow => {glow.mask = [1, 2];},
    glow => {glow[Symbol('unknown')] = 1;},
  ];
  for (const edit of edits) {
    const candidate = sourceRecipe();
    edit(candidate.parameters.extendedParameters.postDecodeAdjustments.color.glow);
    assert.throws(() => portablePresetRecipe(candidate), /INVALID_POST_DECODE_PRESET/);
  }
  for (const extra of ['crop', 'portrait', 'export', 'postCropAdjustments', 'canvasExpand']) {
    const candidate = sourceRecipe();
    candidate.parameters.extendedParameters[extra] = {};
    assert.throws(() => portablePresetRecipe(candidate), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
  const empty = sourceRecipe();
  empty.parameters.extendedParameters.postDecodeAdjustments.color.glow = {};
  assert.throws(() => portablePresetRecipe(empty), /INVALID_POST_DECODE_PRESET/);
});

test('PORTABLE-GLOW03: approved author snapshot keeps Glow after SQLite reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'suite-glow-preset-'));
  const path = join(directory, 'author.sqlite');
  const expected = portableParameters(sourceRecipe());
  let store = new AuthorStore(path, {verifySource: (_actor, input) => {
    if (input.assetID !== ASSET_A || input.recipeRevision !== 1 ||
      JSON.stringify(input.parameters) !== JSON.stringify(expected)) throw Error('SOURCE_RECIPE_MISMATCH');
  }});
  try {
    const draft = store.createDraft(author, {name: 'Halation', recipe: sourceRecipe(),
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

test('PORTABLE-GLOW04: Editor apply/save/reopen retains Glow controls and old edit path', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)}, pixels = syntheticPixels(12, 8, 96);
  let saved = {body: recipe(), revision: 1};
  let cached = {asset, proxy: pixels, history: [clone(saved.body)], cursor: 0,
    revision: 1, dirty: false};
  let url = 0;
  const api = {listAssets: async () => [asset], getRecipe: async () => clone(saved),
    saveRecipe: async (_id, revision, body) => {
      assert.equal(revision, saved.revision);
      saved = {body: clone(body), revision: revision + 1}; return clone(saved);
    }};
  const storage = {get: async () => clone(cached), put: async (_id, value) => {cached = clone(value);}};
  const processing = {render: async (frame, body) => render(frame, body),
    encode: async frame => new Blob([frame.data])};
  const makeSession = async () => {
    const session = new EditorSession({api, storage, processing,
      urlAPI: {createObjectURL: () => `blob:glow-${++url}`, revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession();
  await session.applyPortablePreset(portableParameters(sourceRecipe()));
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow,
    expanded('halation'));
  assert.equal(session.state.dirty, true);
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow,
    expanded('halation'));
  assert.deepEqual(portableParameters(reopened.state.recipe).postDecodeAdjustments.color.glow,
    expanded('halation'));
});

test('PORTABLE-GLOW05: Final uses saved Glow settings; legacy bytes and Mask separation remain intact', () => {
  const pixels = syntheticPixels(12, 8, 96);
  pixels.data.set([250, 230, 210, 255], (4 * pixels.width + 6) * 4);
  const before = pixels.data.slice();
  const baseline = render(pixels, recipe());
  const oldFinal = render(pixels, recipeFromParameters(portableParameters(sourceRecipe(legacy))));
  assert.deepEqual(oldFinal.data, applyGlow(baseline, legacy).data);
  const extendedBody = recipeFromParameters(portableParameters(sourceRecipe()));
  const final = render(pixels, extendedBody);
  assert.deepEqual(final.data, applyGlow(baseline, expanded('halation')).data);
  createGlowMaskOverlay(baseline, expanded('halation'));
  assert.deepEqual(render(pixels, extendedBody).data, final.data);
  assert.notDeepEqual(final.data, oldFinal.data);
  assert.deepEqual(pixels.data, before);
});
