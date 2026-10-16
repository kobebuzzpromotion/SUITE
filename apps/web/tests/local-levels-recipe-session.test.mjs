import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, neutralRecipe} from '../src/session.mjs';
import {renderPixels, rotateCropPixels} from '../src/processing/pure.mjs';
import {rasterizeLocalBrushMask} from '../src/processing/local-mask-brush.mjs';
import {applyLocalLevels} from '../src/processing/local-levels.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A} from './fixtures.mjs';

const copy = value => structuredClone(value);
const strokes = () => [{points: [{x: .25, y: .5}, {x: .4, y: .5}], radius: .16,
  hardness: .5, mode: 'add'}];
const levels = () => ({master: {inputBlack: 30, inputWhite: 225, gamma: 1.3},
  red: {outputBlack: 12}});
const settings = () => ({strokes: strokes(), levels: levels()});
function recipe(local = settings()) {
  const body = neutralRecipe();
  if (local) body.parameters.extendedParameters.localLevels = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-local-levels-coverage-1',
    brushVersion: 'suite-normalized-coverage-brush-1', ...copy(local),
  };
  return body;
}
function pixels(width, height, sourceWidth = width, sourceHeight = height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    data.set([65 + x * 3, 105 + y * 2, 150, (x === width - 1 && y === 0) ? 0 : 220], offset);
  }
  return {width, height, sourceWidth, sourceHeight, data};
}
const render = (frame, body) => renderPixels(frame, body, {validateRecipe, resolutionAssessment});

test('LOCAL-RECIPE01: strict typed extension and no new processingOrder stage', () => {
  const body = recipe(), before = copy(body);
  assert.doesNotThrow(() => validateRecipe(body));
  assert.deepEqual(body.parameters.processingOrder, neutralRecipe().parameters.processingOrder);
  assert.deepEqual(body, before);
  for (const edit of [
    local => {local.schemaVersion = 2;}, local => {local.engineVersion = 'other';},
    local => {local.brushVersion = 'other';}, local => {local.unknown = 1;},
    local => {local[Symbol('hidden')] = 1;}, local => {local.strokes = [];},
    local => {local.strokes[0].radius = 0;}, local => {local.strokes[0].hardness = NaN;},
    local => {local.strokes[0].mode = 'detect-person';},
    local => {local.strokes[0].points[0].x = 1.01;},
    local => {local.strokes[0].points[0].unknown = 1;},
    local => {local.strokes[0].points[Symbol('hidden')] = 1;},
    local => {delete local.strokes[0].points[0];},
    local => {local.levels.master.gamma = 0;},
    local => {local.levels.red.outputWhite = 256;},
    local => {local.levels.unknown = {};},
  ]) {
    const invalid = recipe();
    edit(invalid.parameters.extendedParameters.localLevels);
    assert.throws(() => validateRecipe(invalid), /INVALID_LOCAL_LEVELS|INVALID_PARAMETER/);
  }
});

test('LOCAL-RECIPE02: Proxy and Final rasterize normalized strokes independently, only masked pixels change', () => {
  const body = recipe();
  for (const [width, height, sourceWidth, sourceHeight] of [[16, 12, 32, 24], [32, 24, 32, 24]]) {
    const frame = pixels(width, height, sourceWidth, sourceHeight), original = frame.data.slice();
    const baseline = render(frame, neutralRecipe());
    const mask = rasterizeLocalBrushMask({width, height, strokes: strokes()});
    const expected = applyLocalLevels(baseline, mask, levels());
    const actual = render(frame, body);
    assert.deepEqual(actual.data, expected.data);
    assert.notDeepEqual(actual.data, baseline.data);
    const outside = (height - 1) * width * 4;
    assert.deepEqual(actual.data.slice(outside, outside + 4), baseline.data.slice(outside, outside + 4));
    const hidden = (width - 1) * 4;
    assert.deepEqual(actual.data.slice(hidden, hidden + 4), original.slice(hidden, hidden + 4));
    assert.deepEqual(frame.data, original);
  }
  const oldFrame = pixels(16, 12), oldBody = neutralRecipe();
  assert.deepEqual(render(oldFrame, oldBody).data, render(oldFrame, recipe(null)).data);
});

test('LOCAL-RECIPE03: Local Levels runs before rotation and Crop, preserving alpha', () => {
  const frame = pixels(16, 12), original = frame.data.slice(), body = recipe();
  body.parameters.rotationDegrees = 90;
  body.parameters.extendedParameters.crop = {
    preset_id: 'ratio.free', preset_name: 'Free', orientation: 'portrait',
    crop_rect: {x: 0, y: .25, width: 1, height: .5}, rotation: 90,
    custom_size: false, requested_dpi: 96,
  };
  body.parameters.processingOrder.push('crop');
  validateRecipe(body);
  const baseline = render(frame, neutralRecipe());
  const mask = rasterizeLocalBrushMask({width: frame.width, height: frame.height, strokes: strokes()});
  const local = applyLocalLevels(baseline, mask, levels());
  const expected = rotateCropPixels(local, 90, body.parameters.extendedParameters.crop, {resolutionAssessment});
  const actual = render(frame, body);
  assert.deepEqual(actual.data, expected.data);
  assert.deepEqual([actual.width, actual.height], [expected.width, expected.height]);
  assert.deepEqual(frame.data, original);
});

test('LOCAL-RECIPE04: session save/reload and Undo/Redo preserve the original and exact selection', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)}, proxy = pixels(16, 12, 32, 24);
  const original = proxy.data.slice();
  let saved = {body: neutralRecipe(), revision: 1};
  let cached = {asset, proxy, history: [copy(saved.body)], cursor: 0, revision: 1, dirty: false};
  const permissions = [], api = {
    listAssets: async () => [asset], getRecipe: async () => copy(saved),
    assertPermission: async (_id, intent) => {permissions.push(intent); return true;},
    saveRecipe: async (_id, revision, body) => {
      assert.equal(revision, saved.revision);
      saved = {body: copy(body), revision: revision + 1}; return copy(saved);
    },
  };
  const storage = {get: async () => copy(cached), put: async (_id, value) => {cached = copy(value);}};
  const processing = {render: async (frame, body) => render(frame, body),
    encode: async frame => new Blob([frame.data])};
  const makeSession = async () => {
    const session = new EditorSession({api, storage, processing,
      urlAPI: {createObjectURL: () => 'blob:local', revokeObjectURL() {}}});
    await session.initialize(); await session.openAsset(ASSET_A); return session;
  };
  const session = await makeSession(), unchanged = session.state.recipe;
  await session.setLocalLevels(settings());
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.localLevels,
    recipe().parameters.extendedParameters.localLevels);
  assert.equal(session.state.canUndo, true);
  await session.undo(); assert.deepEqual(session.state.recipe, unchanged);
  await session.redo(); assert.deepEqual(session.state.recipe, recipe());
  await session.save();
  const reopened = await makeSession();
  assert.deepEqual(reopened.state.recipe, recipe());
  assert.deepEqual(render(proxy, reopened.state.recipe).data, render(proxy, recipe()).data);
  assert.deepEqual(proxy.data, original);
  assert.ok(permissions.filter(intent => intent === 'edit').length >= 4);
  await reopened.setLocalLevels(null);
  assert.deepEqual(reopened.state.recipe, neutralRecipe());
});

test('LOCAL-RECIPE05: oversize work, invalid input and revoked edit permission fail without draft mutation', async () => {
  const asset = {id: ASSET_A, sha256: 'a'.repeat(64)}, proxy = pixels(8, 8, 256, 256);
  let cached = {asset, proxy, history: [neutralRecipe()], cursor: 0, revision: 1, dirty: false};
  let revoked = false;
  const api = {listAssets: async () => [asset], getRecipe: async () => ({body: neutralRecipe(), revision: 1}),
    assertPermission: async () => {if (revoked) throw Error('EDIT_PERMISSION_REVOKED'); return true;}};
  const storage = {get: async () => copy(cached), put: async (_id, value) => {cached = copy(value);}};
  const processing = {render: async (frame, body) => render(frame, body),
    encode: async frame => new Blob([frame.data])};
  const session = new EditorSession({api, storage, processing,
    urlAPI: {createObjectURL: () => 'blob:local', revokeObjectURL() {}}});
  await session.initialize(); await session.openAsset(ASSET_A);
  const before = copy(session.state.recipe), storedBefore = copy(cached);
  await assert.rejects(session.setLocalLevels({strokes: [{points: [{x: -1, y: .5}],
    radius: .1, hardness: 1, mode: 'add'}], levels: levels()}), /INVALID_LOCAL_LEVELS/);
  assert.deepEqual(session.state.recipe, before);
  const huge = {strokes: [{points: Array.from({length: 4096}, () => ({x: .5, y: .5})),
    radius: .5, hardness: 1, mode: 'add'}], levels: levels()};
  await assert.rejects(session.setLocalLevels(huge), /LOCAL_BRUSH_WORK_LIMIT/);
  assert.deepEqual(session.state.recipe, before);
  assert.deepEqual(cached, storedBefore);
  revoked = true;
  await assert.rejects(session.setLocalLevels(settings()), /EDIT_PERMISSION_REVOKED/);
  assert.deepEqual(session.state.recipe, before);
  assert.deepEqual(cached, storedBefore);
});
