import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {applyBatchCalibrationSync, mergeSavedCalibration} from '../src/batch-calibration-sync.mjs';
import {ASSET_A, ASSET_B, SHA, portrait, recipe} from './fixtures.mjs';

const copy = value => structuredClone(value);
const THIRD = '33333333-3333-4333-8333-333333333333';
const CALIBRATION = {red: {hue: 24, saturation: -30},
  green: {hue: -15, saturation: 45}, blue: {hue: 9, saturation: 60}};
const selected = (id, revision = 1) => ({id, sha256: SHA, revision});

function withCalibration(body, calibration) {
  const result = copy(body);
  const extra = result.parameters.extendedParameters;
  extra.postDecodeAdjustments ??= {schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1'};
  extra.postDecodeAdjustments.color ??= {};
  extra.postDecodeAdjustments.color.calibration = copy(calibration);
  if (!result.parameters.processingOrder.includes('postDecodeAdjustments'))
    result.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(result);
  return result;
}

function mockAPI(sourceBody, targetBodies, options = {}) {
  const assets = [ASSET_A, ...targetBodies.keys()].map(id => ({id, sha256: SHA, deletedAt: null}));
  const stored = new Map([[ASSET_A, {assetId: ASSET_A, revision: 1, body: copy(sourceBody)}],
    ...[...targetBodies].map(([id, body]) => [id, {assetId: id, revision: 1, body: copy(body)}])]);
  const calls = [];
  const api = {
    async listAssets() {return copy(assets);},
    async getRecipe(id) {return copy(stored.get(id));},
    async assertPermission(id, action) {
      calls.push(['permission', id, action]);
      return options.permission?.(id, action) ?? {authorized: true};
    },
    async saveRecipe(id, revision, body) {
      calls.push(['save', id, revision]);
      if (options.onSave) return options.onSave({id, revision, body, stored});
      const row = {assetId: id, revision: revision + 1, body: copy(body)};
      stored.set(id, row);
      return copy(row);
    },
  };
  return {api, assets, stored, calls};
}

test('CALIBRATION-SYNC-01 / six Hue/Saturation values merge without replacing other color, Detail, exposure, portrait or BW binding', () => {
  const source = withCalibration(recipe(), CALIBRATION);
  source.parameters.exposure = 1.25;
  const target = withCalibration(recipe(portrait(ASSET_B)), {red: {hue: -1}});
  target.parameters.exposure = -0.5;
  target.parameters.extendedParameters.postDecodeAdjustments.color.temperature = 26;
  target.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor = {method: 'relative',
    ranges: {reds: {cyan: 15}}};
  target.parameters.extendedParameters.postDecodeAdjustments.detail = {sharpness: 24, denoise: 18};
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  target.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_B, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [copy(stroke)], correctionStrokes: [copy(stroke)]};
  validateRecipe(target);
  const beforeSource = copy(source), beforeTarget = copy(target);
  const merged = mergeSavedCalibration(source, target);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.calibration, CALIBRATION);
  assert.equal(merged.parameters.exposure, -0.5);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color.temperature, 26);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
    beforeTarget.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor);
  assert.deepEqual(merged.parameters.extendedParameters.postDecodeAdjustments.detail,
    beforeTarget.parameters.extendedParameters.postDecodeAdjustments.detail);
  assert.deepEqual(merged.parameters.extendedParameters.portrait,
    beforeTarget.parameters.extendedParameters.portrait);
  assert.deepEqual(merged.parameters.extendedParameters.bwEdgeManual,
    beforeTarget.parameters.extendedParameters.bwEdgeManual);
  assert.deepEqual(source, beforeSource);assert.deepEqual(target, beforeTarget);
  validateRecipe(merged);
});

test('CALIBRATION-SYNC-02 / neutral source removes only calibration, and invalid six-value branch rejects', () => {
  assert.deepEqual(mergeSavedCalibration(recipe(), withCalibration(recipe(), CALIBRATION)), recipe());
  const target = withCalibration(recipe(), CALIBRATION);
  target.parameters.extendedParameters.postDecodeAdjustments.color.temperature = 21;
  validateRecipe(target);
  const merged = mergeSavedCalibration(recipe(), target);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color.calibration, undefined);
  assert.equal(merged.parameters.extendedParameters.postDecodeAdjustments.color.temperature, 21);
  assert.ok(merged.parameters.processingOrder.includes('postDecodeAdjustments'));
  const invalid = withCalibration(recipe(), CALIBRATION);
  invalid.parameters.extendedParameters.postDecodeAdjustments.color.calibration.red.hue = 101;
  assert.throws(() => mergeSavedCalibration(invalid, target), /INVALID_COLOR_CALIBRATION_RANGE/);
});

test('CALIBRATION-SYNC-03 / two explicit saved targets require fresh permissions, CAS, preflight twice and post-save verification', async () => {
  const source = withCalibration(recipe(), CALIBRATION);
  const first = withCalibration(recipe(portrait(ASSET_B)), {blue: {saturation: 8}});
  first.parameters.exposure = -0.5;
  const second = recipe();second.parameters.exposure = 0.6;
  const f = mockAPI(source, new Map([[ASSET_B, first], [THIRD, second]]));
  const preflights = [];
  const result = await applyBatchCalibrationSync({api: f.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)], expectedSourceRecipe: copy(source),
    preflightTarget: async target => preflights.push(target.id)});
  assert.equal(result.status, 'complete');assert.equal(result.saved, 2);
  assert.deepEqual(preflights, [ASSET_B, ASSET_B, THIRD, THIRD]);
  for (const [id, previous] of [[ASSET_B, first], [THIRD, second]]) {
    const saved = f.stored.get(id);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
      CALIBRATION);
    assert.equal(saved.body.parameters.exposure, previous.parameters.exposure);
    assert.deepEqual(saved.body.parameters.extendedParameters.portrait,
      previous.parameters.extendedParameters.portrait);
  }
  assert.deepEqual(f.stored.get(ASSET_A).body, source);
  assert.equal(f.calls.filter(call => call[0] === 'save').length, 2);
});

test('CALIBRATION-SYNC-04 / conflict, lost permission, dirty target and ambiguous write cannot report complete', async () => {
  const source = withCalibration(recipe(), CALIBRATION);
  const f = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]), {
    onSave: ({id, revision, body, stored}) => {
      if (id === ASSET_B) return {outcome: 'conflict', version: {version: revision + 1}};
      stored.set(id, {assetId: id, revision: revision + 1, body: copy(body)});
      throw Error('NETWORK_AFTER_COMMIT');
    },
  });
  const result = await applyBatchCalibrationSync({api: f.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)]});
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.results.map(row => row.status), ['conflict', 'unverified']);
  const denied = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]), {
    permission: id => ({authorized: id !== ASSET_B}),
  });
  const blocked = await applyBatchCalibrationSync({api: denied.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)],
    preflightTarget: async target => {if (target.id === THIRD) throw Error('TARGET_DIRTY_DRAFT');}});
  assert.deepEqual(blocked.results.map(row => row.status), ['failed', 'failed']);
  assert.equal(denied.calls.some(call => call[0] === 'save'), false);
  await assert.rejects(applyBatchCalibrationSync({api: denied.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)], expectedSourceRecipe: recipe()}),
  /CALIBRATION_SYNC_SOURCE_RECIPE_CHANGED/);
});

test('CALIBRATION-SYNC-05 / SHA, duplicate selection and foreign photo-bound mask fail closed', async () => {
  const source = withCalibration(recipe(), CALIBRATION);
  const f = mockAPI(source, new Map([[ASSET_B, recipe()], [THIRD, recipe()]]));
  const input = {api: f.api, source: selected(ASSET_A), targets: [selected(ASSET_B), selected(THIRD)]};
  await assert.rejects(applyBatchCalibrationSync({...input, targets: [selected(ASSET_B)]}),
    /CALIBRATION_SYNC_TWO_TARGETS_REQUIRED/);
  await assert.rejects(applyBatchCalibrationSync({...input, targets: [selected(ASSET_B), selected(ASSET_B)]}),
    /CALIBRATION_SYNC_SELECTION_INVALID/);
  f.assets[0].sha256 = 'f'.repeat(64);
  await assert.rejects(applyBatchCalibrationSync(input), /CALIBRATION_SYNC_ORIGINAL_CHANGED/);
  f.assets[0].sha256 = SHA;f.assets[1].sha256 = 'f'.repeat(64);
  const partial = await applyBatchCalibrationSync(input);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.results.map(row => row.status), ['failed', 'saved']);
  const wrong = recipe();
  const stroke = {operation: 'ADD', path: [{u: 0.5, v: 0.5}], radiusFraction: 0.12, hardness: 1};
  wrong.parameters.extendedParameters.bwEdgeManual = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
    binding: {assetID: ASSET_A, originalSHA256: SHA, sourceWidth: 16, sourceHeight: 16},
    subjectStrokes: [copy(stroke)], correctionStrokes: [copy(stroke)]};
  validateRecipe(wrong);
  const bound = mockAPI(source, new Map([[ASSET_B, wrong], [THIRD, recipe()]]));
  const guarded = await applyBatchCalibrationSync({api: bound.api, source: selected(ASSET_A),
    targets: [selected(ASSET_B), selected(THIRD)]});
  assert.deepEqual(guarded.results.map(row => row.status), ['failed', 'saved']);
  assert.equal(bound.calls.some(call => call[0] === 'save' && call[1] === ASSET_B), false);
});
