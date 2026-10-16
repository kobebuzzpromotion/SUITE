import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {defaultCropSettings} from '../../../dist/apps/backend/src/crop-export.js';
import {validateVignetteAmount} from '../src/processing/vignette.mjs';

const copy = value => structuredClone(value);
const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const postCrop = amount => ({schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1', vignette: {amount}});
function withVignette(amount, crop = false) {
  const value = neutral();
  if (crop) {
    value.parameters.extendedParameters.crop = {...defaultCropSettings(), crop_rect: {x: 0.1, y: 0.1, width: 0.8, height: 0.8}};
    value.parameters.processingOrder.push('crop');
  }
  value.parameters.extendedParameters.postCropAdjustments = postCrop(amount);
  return value;
}

test('VIGNETTE-RECIPE01: signed endpoints and neutral typed extension preserve Recipe v1', () => {
  for (const amount of [-100, -12.5, 0, 35.2, 100]) {
    assert.equal(validateVignetteAmount(amount), amount);
    const withoutCrop = withVignette(amount);
    assert.doesNotThrow(() => validateRecipe(withoutCrop));
    assert.equal(withoutCrop.schemaVersion, 1);
    assert.doesNotThrow(() => validateRecipe(withVignette(amount, true)));
  }
});

test('VIGNETTE-RECIPE02: Crop remains the final listed stage; old Crop-last Recipe still works', () => {
  const modern = withVignette(40, true);
  assert.equal(modern.parameters.processingOrder.at(-1), 'crop');
  assert.equal(modern.parameters.processingOrder.includes('postCropAdjustments'), false);
  assert.doesNotThrow(() => validateRecipe(modern));
  const legacy = copy(modern);
  delete legacy.parameters.extendedParameters.postCropAdjustments;
  assert.equal(legacy.parameters.processingOrder.at(-1), 'crop');
  assert.doesNotThrow(() => validateRecipe(legacy));
  assert.doesNotThrow(() => validateRecipe(neutral()));
});

test('VIGNETTE-RECIPE03: existing Glow, Point Curves, Grain and Levels remain compatible', () => {
  const combined = withVignette(-25, true);
  combined.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {glow: {intensity: 30, radius: 8, threshold: 180},
      pointCurves: {master: [{x: 0, y: 0}, {x: 255, y: 255}]},
      levels: {red: {gamma: 1.2}}}, detail: {grain: {amount: 7, seed: 42}},
  };
  combined.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  assert.doesNotThrow(() => validateRecipe(combined));
});

test('VIGNETTE-RECIPE04: invalid amount, shape, engine and unknown fields fail closed', () => {
  for (const bad of [-101, 101, NaN, Infinity, '10', null, undefined]) {
    const value = withVignette(10);
    value.parameters.extendedParameters.postCropAdjustments.vignette.amount = bad;
    assert.throws(() => validateRecipe(value), /INVALID_PARAMETER|INVALID_POST_CROP/);
  }
  const mutations = [
    value => {value.parameters.extendedParameters.postCropAdjustments.engineVersion = 'wrong';},
    value => {value.parameters.extendedParameters.postCropAdjustments.schemaVersion = 2;},
    value => {value.parameters.extendedParameters.postCropAdjustments.unknown = 1;},
    value => {value.parameters.extendedParameters.postCropAdjustments.vignette.unknown = 1;},
    value => {value.parameters.extendedParameters.postCropAdjustments.vignette = {};},
    value => {value.parameters.extendedParameters.postCropAdjustments.vignette = null;},
    value => {value.parameters.extendedParameters.postCropAdjustments = [];},
    value => {value.parameters.extendedParameters.postCropAdjustments[Symbol('hidden')] = 1;},
  ];
  for (const mutate of mutations) {
    const value = withVignette(10);
    mutate(value);
    assert.throws(() => validateRecipe(value), /INVALID_PARAMETER|INVALID_POST_CROP/);
  }
});

test('VIGNETTE-RECIPE05: schema-incompatible new stage is rejected; existing Crop order is unchanged', () => {
  const unexpectedStage = withVignette(20);
  unexpectedStage.parameters.processingOrder.push('postCropAdjustments');
  assert.throws(() => validateRecipe(unexpectedStage), /INVALID_PIPELINE/);
  const withoutPayload = withVignette(20);
  delete withoutPayload.parameters.extendedParameters.postCropAdjustments;
  assert.doesNotThrow(() => validateRecipe(withoutPayload));
  const cropNotLast = withVignette(20, true);
  cropNotLast.parameters.processingOrder = ['exposure', 'contrast', 'saturation', 'crop', 'rotation'];
  assert.throws(() => validateRecipe(cropNotLast), /INVALID_CROP_ROTATION_OR_ORDER/);
});
