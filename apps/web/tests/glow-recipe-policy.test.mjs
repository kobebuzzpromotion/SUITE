import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateGlow} from '../src/processing/glow.mjs';

const recipe = (glow, color = {}, detail = {}) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {postDecodeAdjustments: {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1', color: {...color, ...(glow === undefined ? {} : {glow})}, detail}},
  processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
}});

test('GLOW-RECIPE01: valid Glow bounds and partial defaults retain Recipe v1 and match pixel validator', () => {
  for (const glow of [{}, {intensity: 0}, {intensity: 100, radius: 1, threshold: 0},
    {intensity: 50.5, radius: 64, threshold: 255}, {radius: 8, threshold: 180}]) {
    assert.doesNotThrow(() => validateGlow(glow));
    assert.doesNotThrow(() => validateRecipe(recipe(glow)));
  }
  assert.equal(recipe({intensity: 20}).schemaVersion, 1);
});

test('GLOW-RECIPE02: null, unknown, symbol and non-plain controls are rejected', () => {
  const symbol = {[Symbol('hidden')]: 2};
  for (const bad of [null, [], new Date(), {mode: 'HALATION'}, {ai: true}, symbol,
    {intensity: null}, {radius: null}, {threshold: null}, {intensity: undefined},
    {radius: '8'}, {threshold: false}])
    assert.throws(() => validateRecipe(recipe(bad)), /INVALID_PARAMETER|INVALID_POST_DECODE/);
});

test('GLOW-RECIPE03: all three controls reject non-finite, out-of-range and noninteger violations', () => {
  for (const bad of [{intensity: -0.1}, {intensity: 100.1}, {intensity: NaN}, {intensity: Infinity},
    {radius: 0}, {radius: 65}, {radius: 1.5}, {radius: NaN},
    {threshold: -1}, {threshold: 256}, {threshold: 128.5}, {threshold: Infinity}]) {
    assert.throws(() => validateRecipe(recipe(bad)), /INVALID_PARAMETER|INVALID_POST_DECODE/);
    assert.throws(() => validateGlow(bad));
  }
});

test('GLOW-RECIPE04: existing Grain, Levels and neutral legacy Recipe remain valid alongside Glow', () => {
  const combined = recipe({intensity: 30, radius: 6, threshold: 200},
    {levels: {master: {inputBlack: 12, inputWhite: 245, gamma: 1.1, outputBlack: 2, outputWhite: 250}}},
    {grain: {amount: 12, seed: 48}});
  assert.doesNotThrow(() => validateRecipe(combined));
  const withoutGlow = recipe(undefined, {levels: {red: {gamma: 2}}}, {grain: {amount: 0, seed: 0}});
  assert.doesNotThrow(() => validateRecipe(withoutGlow));
  const legacy = {schemaVersion: 1, parameters: {exposure: 0, contrast: 1, saturation: 1,
    rotationDegrees: 0, extendedParameters: {}, processingOrder: []}};
  assert.doesNotThrow(() => validateRecipe(legacy));
  assert.deepEqual(Object.keys(combined.parameters.extendedParameters.postDecodeAdjustments.color).sort(), ['glow', 'levels']);
});

test('GLOW-RECIPE05: wrong stage placement and unknown stage still fail closed', () => {
  const missingStage = recipe({intensity: 1});
  missingStage.parameters.processingOrder = ['exposure', 'contrast', 'saturation', 'rotation'];
  assert.throws(() => validateRecipe(missingStage), /INVALID_PIPELINE/);
  const unknownStage = recipe({intensity: 1});
  unknownStage.parameters.processingOrder.push('glow');
  assert.throws(() => validateRecipe(unknownStage), /INVALID_PIPELINE/);
});
