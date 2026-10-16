import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateColorCalibration} from '../src/processing/color-calibration.mjs';

function recipe(calibration) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {calibration},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

test('CALIBRATION-RECIPE01: optional primary/control inputs match pixel module defaults', () => {
  for (const settings of [
    {}, {red: {}}, {red: {hue: -100}}, {green: {saturation: 100}},
    {red: {hue: -100, saturation: 100}, green: {hue: 15, saturation: -30},
      blue: {hue: 100, saturation: -100}},
  ]) {
    const value = recipe(settings), before = structuredClone(value);
    assert.doesNotThrow(() => validateColorCalibration(settings));
    assert.doesNotThrow(() => validateRecipe(value));
    assert.deepEqual(value, before);
  }
});

test('CALIBRATION-RECIPE02: invalid primary and control structure fails closed', () => {
  class Primary {constructor() {this.hue = 10;}}
  const samples = [
    null, [], {cyan: {hue: 1}}, {red: null}, {red: []}, {red: new Primary()},
    {red: {hue: 0, unknown: 1}}, {blue: {saturation: 0, [Symbol('hidden')]: 1}},
    {green: {hue: 2}, [Symbol('hidden')]: 1},
  ];
  for (const settings of samples)
    assert.throws(() => validateRecipe(recipe(settings)), /INVALID_PARAMETER|INVALID_COLOR_CALIBRATION/);
});

test('CALIBRATION-RECIPE03: each of six values requires an integer in -100..100', () => {
  for (const primary of ['red', 'green', 'blue']) {
    for (const control of ['hue', 'saturation']) {
      for (const invalid of [-101, 101, -0.5, 0.5, NaN, Infinity, -Infinity, null, undefined, '50', false]) {
        const value = recipe({[primary]: {[control]: invalid}});
        assert.throws(() => validateRecipe(value), /INVALID_PARAMETER|INVALID_COLOR_CALIBRATION/,
          `${primary}.${control}=${String(invalid)}`);
      }
    }
  }
});

test('CALIBRATION-RECIPE04: existing color/detail and legacy Recipes remain valid', () => {
  const value = recipe({red: {hue: 20, saturation: -15}});
  const adjusted = value.parameters.extendedParameters.postDecodeAdjustments;
  adjusted.color.temperature = 3;
  adjusted.color.glow = {intensity: 12, radius: 4, threshold: 180};
  adjusted.color.pointCurves = {blue: [{x: 0, y: 0}, {x: 255, y: 255}]};
  adjusted.color.levels = {master: {gamma: 1.2}};
  adjusted.detail = {grain: {amount: 5, seed: 1}};
  assert.doesNotThrow(() => validateRecipe(value));
  delete adjusted.color.calibration;
  assert.doesNotThrow(() => validateRecipe(value));
  delete value.parameters.extendedParameters.postDecodeAdjustments;
  value.parameters.processingOrder.splice(3, 1);
  assert.doesNotThrow(() => validateRecipe(value));
});

test('CALIBRATION-RECIPE05: Worker-realm JSON and existing stage requirement', () => {
  const value = recipe({blue: {hue: 10, saturation: 20}});
  const workerValue = runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);
  assert.doesNotThrow(() => validateRecipe(workerValue));
  workerValue.parameters.processingOrder.splice(3, 1);
  assert.throws(() => validateRecipe(workerValue), /INVALID_PIPELINE/);
});
