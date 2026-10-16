import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

function recipe(vignette) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postCropAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1', vignette,
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
  }};
}

test('VIGNETTE-CONTROLS-RECIPE01: amount-only and all four optional controls retain Recipe v1', () => {
  for (const vignette of [
    {amount: -100}, {amount: 0}, {amount: 100},
    {amount: -25.5, midpoint: 0, roundness: -100, feather: 0, highlights: 0},
    {amount: 37, midpoint: 100, roundness: 100, feather: 100, highlights: 100},
    {amount: 5, midpoint: 51.5, roundness: -12.5, feather: 45.5, highlights: 26.5},
  ]) {
    const value = recipe(vignette), before = structuredClone(value);
    assert.doesNotThrow(() => validateRecipe(value));
    assert.deepEqual(value, before);
    assert.equal(value.parameters.processingOrder.includes('postCropAdjustments'), false);
  }
});

test('VIGNETTE-CONTROLS-RECIPE02: each optional value rejects bad type, non-finite and range violations', () => {
  const ranges = {midpoint: [0, 100], roundness: [-100, 100], feather: [0, 100], highlights: [0, 100]};
  for (const [field, [min, max]] of Object.entries(ranges)) {
    for (const bad of [min - 0.01, max + 0.01, NaN, Infinity, -Infinity, '50', null, undefined, false]) {
      assert.throws(() => validateRecipe(recipe({amount: 10, [field]: bad})),
        /INVALID_PARAMETER|INVALID_POST_CROP_ADJUSTMENTS/, `${field}=${String(bad)}`);
    }
  }
});

test('VIGNETTE-CONTROLS-RECIPE03: unknown properties, missing amount and non-plain objects fail closed', () => {
  const examples = [
    {}, {amount: 10, unknown: 1}, {amount: 10, midpoint: 50, [Symbol('hidden')]: 1},
    [], null,
  ];
  class Controls {constructor() {this.amount = 10;}}
  examples.push(new Controls());
  for (const input of examples)
    assert.throws(() => validateRecipe(recipe(input)), /INVALID_PARAMETER|INVALID_POST_CROP_ADJUSTMENTS/);
});

test('VIGNETTE-CONTROLS-RECIPE04: Worker-realm JSON controls validate without changing legacy stage order', () => {
  const value = recipe({amount: -30, midpoint: 55, roundness: -20, feather: 70, highlights: 12});
  const workerValue = runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);
  assert.doesNotThrow(() => validateRecipe(workerValue));
  workerValue.parameters.processingOrder.push('postCropAdjustments');
  assert.throws(() => validateRecipe(workerValue), /INVALID_PIPELINE/);
});
