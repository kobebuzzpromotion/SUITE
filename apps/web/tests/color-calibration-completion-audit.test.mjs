import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {neutralRecipe, EditorSession} from '../src/session.mjs';
import {applyColorCalibration, validateColorCalibration} from '../src/processing/color-calibration.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {portableParameters, checkParameters} from '../preset-policy.mjs';
import {applyBatchRecipe} from '../src/batch-edit.mjs';

const clone = value => structuredClone(value);
const controls = [
  ['red', 'hue'], ['red', 'saturation'],
  ['green', 'hue'], ['green', 'saturation'],
  ['blue', 'hue'], ['blue', 'saturation'],
];
const pixels = () => ({width: 6, height: 1, data: new Uint8ClampedArray([
  220, 80, 30, 255, 30, 215, 70, 255, 40, 70, 215, 255,
  180, 140, 70, 255, 90, 190, 175, 255, 200, 50, 140, 255,
])});
function withCalibration(values) {
  const recipe = neutralRecipe();
  recipe.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {calibration: values},
  };
  recipe.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(recipe);
  return recipe;
}

test('CALIBRATION-AUDIT-01 / six primary controls are separate real SUITE sRGB8 pixel operations', () => {
  const original = pixels(), savedBytes = original.data.slice();
  const outputs = [];
  for (const [primary, field] of controls) {
    const one = {[primary]: {[field]: 75}};
    assert.equal(validateColorCalibration(one)[primary][field], 75);
    const actual = applyColorCalibration(original, one);
    assert.notDeepEqual(actual.data, original.data, `${primary}.${field} must affect this color fixture`);
    outputs.push([...actual.data].join(','));
  }
  assert.equal(new Set(outputs).size, 6, 'each control must have its own output on this fixture');
  assert.deepEqual(original.data, savedBytes, 'Original pixels stay untouched');
  assert.throws(() => validateColorCalibration({red: {hue: 101}}), /COLOR_CALIBRATION_RANGE/);
  assert.throws(() => validateColorCalibration({red: {hue: 1, mask: 1}}), /INVALID_COLOR_CALIBRATION/);
});

test('CALIBRATION-AUDIT-02 / typed Recipe and Author portable parameters preserve all six through Final render', () => {
  const values = {red: {hue: 20, saturation: -30}, green: {hue: -40, saturation: 50},
    blue: {hue: 60, saturation: -70}};
  const recipe = withCalibration(values), before = clone(recipe), original = pixels();
  const portable = portableParameters(recipe);
  assert.deepEqual(portable.postDecodeAdjustments.color.calibration, values);
  assert.deepEqual(checkParameters(portable), portable);
  const actual = renderPixels(original, recipe, {validateRecipe, resolutionAssessment});
  assert.deepEqual(actual.data, applyColorCalibration(original, values).data);
  assert.deepEqual(recipe, before);
  assert.notDeepEqual(actual.data, original.data);
});

test('CALIBRATION-AUDIT-03 / full-Recipe Batch remains distinct from connected Calibration-only Sync', async () => {
  const sourceId = 'source', targetId = 'target', sourceSHA = 'a'.repeat(64), targetSHA = 'b'.repeat(64);
  const sourceBody = withCalibration({red: {hue: 35}});
  sourceBody.parameters.exposure = 0.75;
  validateRecipe(sourceBody);
  const targetBody = neutralRecipe(); targetBody.parameters.exposure = -0.5;
  const stored = new Map([[sourceId, {assetId: sourceId, revision: 2, body: clone(sourceBody)}],
    [targetId, {assetId: targetId, revision: 4, body: clone(targetBody)}]]);
  const assets = [{id: sourceId, sha256: sourceSHA}, {id: targetId, sha256: targetSHA}];
  const api = {
    async listAssets() {return clone(assets);},
    async getRecipe(id) {return clone(stored.get(id));},
    async assertPermission() {return {authorized: true};},
    async saveRecipe(id, revision, body) {
      assert.equal(id, targetId); assert.equal(revision, 4);
      const saved = {assetId: id, revision: 5, body: clone(body)};
      stored.set(id, saved);return clone(saved);
    },
  };
  const result = await applyBatchRecipe({api, source: {id: sourceId, sha256: sourceSHA, revision: 2},
    targets: [{id: targetId, sha256: targetSHA, revision: 4}]});
  assert.equal(result.status, 'complete');
  assert.deepEqual(stored.get(targetId).body.parameters.extendedParameters.postDecodeAdjustments.color.calibration,
    {red: {hue: 35}});
  assert.equal(stored.get(targetId).body.parameters.exposure, 0.75,
    'whole-Recipe Batch also replaces unrelated exposure; it is not Calibration-only Sync');
  assert.equal(typeof EditorSession.prototype.batchSyncCalibration, 'function',
    'separate saved-source Calibration-only product entry point is connected');
});
