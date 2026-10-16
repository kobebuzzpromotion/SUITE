import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {SELECTIVE_COLOR_RANGES, SELECTIVE_COLOR_CONTROLS,
  validateSelectiveColor} from '../src/processing/selective-color.mjs';

function recipe(selectiveColor) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {selectiveColor},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

test('SELECTIVE-RECIPE01: both methods and optional ranges/CMYK controls match pixel-module defaults', () => {
  const all = Object.fromEntries(SELECTIVE_COLOR_RANGES.map((name, index) =>
    [name, Object.fromEntries(SELECTIVE_COLOR_CONTROLS.map((control, offset) =>
      [control, (index + offset) % 2 ? 100 : -100]))]));
  for (const settings of [
    {}, {method: 'relative'}, {method: 'absolute', ranges: {}},
    {ranges: {reds: {cyan: -25}, neutrals: {black: 10}}},
    {method: 'absolute', ranges: all},
  ]) {
    const value = recipe(settings), before = structuredClone(value);
    assert.doesNotThrow(() => validateSelectiveColor(settings));
    assert.doesNotThrow(() => validateRecipe(value));
    assert.deepEqual(value, before);
  }
});

test('SELECTIVE-RECIPE02: unknown keys and invalid nested shapes fail closed', () => {
  class Sliders {constructor() {this.cyan = 5;}}
  const invalid = [null, [], {method: 'soft'}, {method: null}, {method: 1},
    {extra: 1}, {ranges: null}, {ranges: []}, {ranges: {oranges: {cyan: 1}}},
    {ranges: {reds: null}}, {ranges: {reds: []}},
    {ranges: {reds: {cyan: 1, hue: 1}}}, {ranges: {reds: new Sliders()}},
    {ranges: {reds: {cyan: 1, [Symbol('hidden')]: 1}}},
    {ranges: {reds: {}}, [Symbol('hidden')]: 1},
  ];
  for (const settings of invalid)
    assert.throws(() => validateRecipe(recipe(settings)), /INVALID_PARAMETER|INVALID_SELECTIVE_COLOR/);
});

test('SELECTIVE-RECIPE03: each of 36 CMYK controls rejects noninteger, nonfinite and out-of-range values', () => {
  for (const name of SELECTIVE_COLOR_RANGES) for (const control of SELECTIVE_COLOR_CONTROLS) {
    for (const bad of [-101, 101, -0.5, 0.5, NaN, Infinity, -Infinity, null, undefined, '10', false]) {
      const value = recipe({ranges: {[name]: {[control]: bad}}});
      assert.throws(() => validateRecipe(value), /INVALID_PARAMETER|INVALID_SELECTIVE_COLOR/,
        `${name}.${control}=${String(bad)}`);
    }
  }
});

test('SELECTIVE-RECIPE04: calibration and existing color/detail, Canvas and Vignette remain valid', () => {
  const value = recipe({method: 'absolute', ranges: {blues: {cyan: -10, magenta: 20}}});
  const extra = value.parameters.extendedParameters;
  extra.postDecodeAdjustments.color.calibration = {red: {hue: 15, saturation: -20}};
  extra.postDecodeAdjustments.color.levels = {master: {gamma: 1.1}};
  extra.postDecodeAdjustments.color.pointCurves = {blue: [{x: 0, y: 0}, {x: 255, y: 255}]};
  extra.postDecodeAdjustments.color.glow = {intensity: 4, radius: 2, threshold: 180};
  extra.postDecodeAdjustments.detail = {grain: {amount: 2, seed: 9}};
  extra.postCropAdjustments = {schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1',
    vignette: {amount: -12, midpoint: 45}};
  extra.canvasExpand = {schemaVersion: 1, margins: {left: 0.5, right: 0, top: 0, bottom: 0}};
  assert.doesNotThrow(() => validateRecipe(value));
  delete extra.postDecodeAdjustments.color.selectiveColor;
  assert.doesNotThrow(() => validateRecipe(value));
  delete extra.postDecodeAdjustments;
  value.parameters.processingOrder.splice(3, 1);
  assert.doesNotThrow(() => validateRecipe(value));
});

test('SELECTIVE-RECIPE05: Worker-realm JSON validates but no new processingOrder stage is allowed', () => {
  const value = recipe({method: 'relative', ranges: {whites: {black: 25}}});
  const workerValue = runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);
  assert.doesNotThrow(() => validateRecipe(workerValue));
  workerValue.parameters.processingOrder.push('selectiveColor');
  assert.throws(() => validateRecipe(workerValue), /INVALID_PIPELINE/);
});
