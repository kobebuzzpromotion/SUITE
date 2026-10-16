import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateGrainSettings, GRAIN_SETTINGS_DEFAULTS} from '../src/processing/grain.mjs';

function recipe(grain) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', detail: {grain},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

test('GRAIN-RECIPE-EXT01: legacy Amount+Seed and six optional controls are accepted without changing Recipe v1', () => {
  const examples = [
    {amount: 0, seed: 0}, {amount: 100, seed: 0xffffffff},
    {amount: 41.5, seed: 17, shadows: 0, midtones: 100, highlights: 50.5,
      size: 1.5, roughness: 75, colorVariation: 100},
    {amount: 80, seed: 42, shadows: 100, midtones: 0, highlights: 0,
      size: 100, roughness: 0, colorVariation: 0},
  ];
  for (const grain of examples) {
    const value = recipe(grain), before = structuredClone(value);
    assert.doesNotThrow(() => validateRecipe(value));
    assert.deepEqual(value, before);
    const {seed, ...settings} = grain;
    assert.doesNotThrow(() => validateGrainSettings(settings));
    assert.equal(value.parameters.processingOrder.includes('grain'), false);
  }
  assert.deepEqual(validateGrainSettings({amount: 9}), {...GRAIN_SETTINGS_DEFAULTS, amount: 9});
});

test('GRAIN-RECIPE-EXT02: every optional setting matches pixel-module finite inclusive 0..100 range', () => {
  for (const field of ['shadows', 'midtones', 'highlights', 'size', 'roughness', 'colorVariation']) {
    for (const accepted of [0, 0.5, 42.75, 100]) {
      const grain = {amount: 10, seed: 1, [field]: accepted};
      assert.doesNotThrow(() => validateRecipe(recipe(grain)), `${field}=${accepted}`);
      const {seed, ...settings} = grain;
      assert.doesNotThrow(() => validateGrainSettings(settings));
    }
    for (const rejected of [-0.01, 100.01, NaN, Infinity, -Infinity, '50', null, undefined, false]) {
      const grain = {amount: 10, seed: 1, [field]: rejected};
      assert.throws(() => validateRecipe(recipe(grain)), /INVALID_PARAMETER|INVALID_POST_DECODE_RANGE/,
        `${field}=${String(rejected)}`);
      const {seed, ...settings} = grain;
      assert.throws(() => validateGrainSettings(settings), /INVALID_GRAIN_SETTING_RANGE/);
    }
  }
});

test('GRAIN-RECIPE-EXT03: required legacy fields, unknown/symbol fields and non-plain objects fail closed', () => {
  class Grain {constructor() {this.amount = 10; this.seed = 1;}}
  const invalid = [null, [], {}, {seed: 1}, {amount: 10},
    {amount: 10, seed: 1, extra: 1},
    {amount: 10, seed: 1, [Symbol('hidden')]: 1},
    new Grain(),
    {amount: 10, seed: -1}, {amount: 10, seed: 0x100000000},
    {amount: 10, seed: 1.5}, {amount: 10, seed: '1'},
    {amount: -1, seed: 1}, {amount: 101, seed: 1},
    {amount: NaN, seed: 1}, {amount: '10', seed: 1},
  ];
  for (const grain of invalid)
    assert.throws(() => validateRecipe(recipe(grain)), /INVALID_PARAMETER|INVALID_POST_DECODE_(ADJUSTMENTS|RANGE)/);
});

test('GRAIN-RECIPE-EXT04: Worker-realm JSON and existing sibling branches remain valid', () => {
  const value = recipe({amount: 60, seed: 22, shadows: 20, midtones: 40, highlights: 60,
    size: 35, roughness: 45, colorVariation: 55});
  const extra = value.parameters.extendedParameters;
  extra.postDecodeAdjustments.color = {
    calibration: {red: {hue: 10, saturation: -5}},
    selectiveColor: {method: 'absolute', ranges: {reds: {cyan: -20}}},
    glow: {intensity: 12, radius: 4, threshold: 170},
    pointCurves: {master: [{x: 0, y: 0}, {x: 255, y: 255}]},
  };
  extra.postCropAdjustments = {schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1',
    vignette: {amount: -20, midpoint: 60, roundness: 10, feather: 70, highlights: 20}};
  extra.canvasExpand = {schemaVersion: 1, margins: {left: 0.5, right: 0, top: 0, bottom: 0}};
  assert.doesNotThrow(() => validateRecipe(value));
  // Older Point Curves/Glow validators are not cross-realm-safe; isolate Grain
  // here so this test does not claim to repair unrelated shared contracts.
  const fromWorker = runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(recipe(
    value.parameters.extendedParameters.postDecodeAdjustments.detail.grain)))})`);
  assert.doesNotThrow(() => validateRecipe(fromWorker));
  fromWorker.parameters.processingOrder.push('grain');
  assert.throws(() => validateRecipe(fromWorker), /INVALID_PIPELINE/);
  delete value.parameters.extendedParameters.postDecodeAdjustments;
  value.parameters.processingOrder.splice(3, 1);
  assert.doesNotThrow(() => validateRecipe(value));
});
