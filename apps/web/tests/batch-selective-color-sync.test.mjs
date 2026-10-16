import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {mergeSavedSelectiveColor, applyBatchSelectiveColorSync} from '../src/batch-selective-color-sync.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

const clone = value => structuredClone(value);
function withSelective(body, selective) {
  const result = clone(body);
  const extra = result.parameters.extendedParameters;
  extra.postDecodeAdjustments ??= {schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1'};
  extra.postDecodeAdjustments.color ??= {};
  extra.postDecodeAdjustments.color.selectiveColor = clone(selective);
  if (!result.parameters.processingOrder.includes('postDecodeAdjustments'))
    result.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(result);
  return result;
}
const selection = (id, revision = 1) => ({id, sha256: SHA, revision});

test('SELECTIVE-SYNC-01 / merge only method and ranges, retaining target globals, other color/detail and portrait', () => {
  const source = withSelective(recipe(), {method: 'absolute', ranges: {
    reds: {cyan: 40, magenta: -20}, blacks: {black: 15},
  }});
  source.parameters.exposure = 1.25;
  const target = withSelective(recipe(portrait(ASSET_B)), {ranges: {blues: {yellow: -25}}});
  target.parameters.exposure = -0.5;
  target.parameters.extendedParameters.postDecodeAdjustments.color.temperature = 25;
  target.parameters.extendedParameters.postDecodeAdjustments.color.calibration = {green: {hue: -20}};
  target.parameters.extendedParameters.postDecodeAdjustments.detail = {grain: {amount: 12, seed: 9}};
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  target.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_B, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [clone(stroke)], correctionStrokes: [clone(stroke)]};
  validateRecipe(source);validateRecipe(target);
  const sourceBefore = clone(source), targetBefore = clone(target);
  const merged = mergeSavedSelectiveColor(source, target);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
    source.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor);
  assert.equal(merged.parameters.exposure, -0.5);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color.temperature, 25);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
    {green: {hue: -20}});
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.detail,
    {grain: {amount: 12, seed: 9}});
  assert.deepEqual(merged.parameters.extendedParameters.portrait, targetBefore.parameters.extendedParameters.portrait);
  assert.deepEqual(merged.parameters.extendedParameters.bwEdgeManual,
    targetBefore.parameters.extendedParameters.bwEdgeManual, 'target photo-bound mask must not move or disappear');
  assert.deepEqual(source, sourceBefore);assert.deepEqual(target, targetBefore);
  validateRecipe(merged);
});

test('SELECTIVE-SYNC-02 / absent source branch resets only Selective Color and cleans an otherwise empty stage', () => {
  const source = recipe();
  const target = withSelective(recipe(), {method: 'absolute', ranges: {cyans: {black: -10}}});
  assert.deepEqual(mergeSavedSelectiveColor(source, target), recipe());
  const other = withSelective(recipe(), {method: 'absolute', ranges: {reds: {cyan: 10}}});
  other.parameters.extendedParameters.postDecodeAdjustments.color.levels = {master: {gamma: 1.2}};
  validateRecipe(other);
  const cleared = mergeSavedSelectiveColor(source, other);
  assert.equal(cleared.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor, undefined);
  assert.deepEqual(cleared.parameters.extendedParameters.postDecodeAdjustments.color.levels, {master: {gamma: 1.2}});
  assert.ok(cleared.parameters.processingOrder.includes('postDecodeAdjustments'));
  const invalid = withSelective(recipe(), {ranges: {reds: {cyan: 10}}});
  invalid.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor.ranges.reds.cyan = 101;
  assert.throws(() => mergeSavedSelectiveColor(invalid, target), /INVALID_SELECTIVE_COLOR_RANGE/);
});

function mockAPI({sourceBody, targetBodies, onSave, permission = () => ({authorized: true})}) {
  const ids = [ASSET_A, ...targetBodies.keys()];
  const assets = ids.map(id => ({id, sha256: SHA, deletedAt: null}));
  const stored = new Map([[ASSET_A, {assetId: ASSET_A, revision: 1, body: clone(sourceBody)}],
    ...[...targetBodies].map(([id, body]) => [id, {assetId: id, revision: 1, body: clone(body)}])]);
  const calls = [];
  const api = {
    async listAssets() {return clone(assets);},
    async getRecipe(id) {return clone(stored.get(id));},
    async assertPermission(id, action) {calls.push(['permission', id, action]);return permission(id, action);},
    async saveRecipe(id, revision, body) {
      calls.push(['save', id, revision]);
      if (onSave) return onSave({id, revision, body, stored});
      const row = {assetId: id, revision: revision + 1, body: clone(body)};
      stored.set(id, row);return clone(row);
    },
  };
  return {api, assets, stored, calls};
}

test('SELECTIVE-SYNC-03 / saved source, two selected target revisions, permission and post-save read all agree', async () => {
  const third = '33333333-3333-4333-8333-333333333333';
  const source = withSelective(recipe(), {method: 'absolute', ranges: {reds: {cyan: 30}}});
  const first = withSelective(recipe(portrait(ASSET_B)), {ranges: {blues: {yellow: 20}}});
  first.parameters.exposure = -0.5;
  const second = recipe();second.parameters.exposure = 0.6;
  const f = mockAPI({sourceBody: source, targetBodies: new Map([[ASSET_B, first], [third, second]])});
  const result = await applyBatchSelectiveColorSync({api: f.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)], expectedSourceRecipe: clone(source),
    preflightTarget: async target => {assert.ok([ASSET_B, third].includes(target.id));}});
  assert.equal(result.status, 'complete');assert.equal(result.saved, 2);
  for (const [id, previous] of [[ASSET_B, first], [third, second]]) {
    const saved = f.stored.get(id);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
      source.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor);
    assert.equal(saved.body.parameters.exposure, previous.parameters.exposure);
    assert.deepEqual(saved.body.parameters.extendedParameters.portrait,
      previous.parameters.extendedParameters.portrait);
  }
  assert.deepEqual(f.stored.get(ASSET_A).body, source);
  assert.equal(f.calls.filter(call => call[0] === 'save').length, 2);
  assert.ok(f.calls.filter(call => call[0] === 'permission' && call[2] === 'edit').length >= 6);
});

test('SELECTIVE-SYNC-04 / stale target, dirty preflight, permission loss and ambiguous write are not success', async () => {
  const third = '33333333-3333-4333-8333-333333333333';
  const source = withSelective(recipe(), {ranges: {greens: {magenta: 35}}});
  const f = mockAPI({sourceBody: source, targetBodies: new Map([[ASSET_B, recipe()], [third, recipe()]]),
    onSave: ({id, revision, body, stored}) => {
      if (id === ASSET_B) return {outcome: 'conflict', version: {version: revision + 1}};
      const committed = {assetId: id, revision: revision + 1, body: clone(body)};
      stored.set(id, committed);throw Error('NETWORK_AFTER_COMMIT');
    }});
  const result = await applyBatchSelectiveColorSync({api: f.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)]});
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.results.map(row => row.status), ['conflict', 'unverified']);
  assert.equal(f.stored.get(third).revision, 2, 'ambiguous network error may follow a commit');
  const denied = mockAPI({sourceBody: source, targetBodies: new Map([[ASSET_B, recipe()], [third, recipe()]]),
    permission: id => ({authorized: id !== ASSET_B})});
  const partial = await applyBatchSelectiveColorSync({api: denied.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)], preflightTarget: async target => {
      if (target.id === third) throw Error('TARGET_DIRTY_DRAFT');
    }});
  assert.deepEqual(partial.results.map(row => row.status), ['failed', 'failed']);
  assert.equal(denied.calls.some(call => call[0] === 'save'), false);
  await assert.rejects(applyBatchSelectiveColorSync({api: denied.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)], expectedSourceRecipe: recipe()}),
  /SELECTIVE_SYNC_SOURCE_RECIPE_CHANGED/);
});

test('SELECTIVE-SYNC-05 / source and target Original SHA, selection count and identity fail before write', async () => {
  const third = '33333333-3333-4333-8333-333333333333';
  const source = withSelective(recipe(), {ranges: {magentas: {yellow: 25}}});
  const f = mockAPI({sourceBody: source, targetBodies: new Map([[ASSET_B, recipe()], [third, recipe()]])});
  const inputs = {api: f.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)]};
  await assert.rejects(applyBatchSelectiveColorSync({...inputs, targets: [selection(ASSET_B)]}),
    /SELECTIVE_SYNC_TWO_TARGETS_REQUIRED/);
  await assert.rejects(applyBatchSelectiveColorSync({...inputs,
    targets: [selection(ASSET_B), selection(ASSET_B)]}), /SELECTIVE_SYNC_SELECTION_INVALID/);
  f.assets[0].sha256 = 'f'.repeat(64);
  await assert.rejects(applyBatchSelectiveColorSync(inputs), /SELECTIVE_SYNC_ORIGINAL_CHANGED/);
  f.assets[0].sha256 = SHA;f.assets[1].sha256 = 'f'.repeat(64);
  const result = await applyBatchSelectiveColorSync(inputs);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'SELECTIVE_SYNC_ORIGINAL_CHANGED');
  assert.equal(f.calls.filter(call => call[0] === 'save').length, 1);
});

test('SELECTIVE-SYNC-06 / a target photo-bound mask for another Asset cannot be preserved as valid', async () => {
  const third = '33333333-3333-4333-8333-333333333333';
  const source = withSelective(recipe(), {ranges: {reds: {cyan: 20}}});
  const wrong = recipe();
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  wrong.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_A, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [clone(stroke)], correctionStrokes: [clone(stroke)]};
  validateRecipe(wrong);
  const f = mockAPI({sourceBody: source, targetBodies: new Map([[ASSET_B, wrong], [third, recipe()]])});
  const result = await applyBatchSelectiveColorSync({api: f.api, source: selection(ASSET_A),
    targets: [selection(ASSET_B), selection(third)]});
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(result.results[0].reason, 'SELECTIVE_SYNC_PHOTO_BOUND_MISMATCH');
  assert.deepEqual(f.stored.get(ASSET_B).body, wrong);
  assert.equal(f.calls.filter(call => call[0] === 'save' && call[1] === ASSET_B).length, 0);
});
