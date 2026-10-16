import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateGlow, GLOW_MODES, GLOW_LIMITS} from '../src/processing/glow.mjs';

function recipe(glow) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {glow},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}
const fromWorker = value => runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);

test('GLOW-RECIPE-EXT01: old 3-value and each new mode survive Recipe v1 unchanged', () => {
  const valid = [
    {}, {intensity: 0}, {intensity: 35, radius: 6, threshold: 200},
    ...GLOW_MODES.map(mode => ({mode, intensity: 70, radius: 12, threshold: 160,
      exposure: -25.5, diffusion: 80, tint: 21.5})),
    {mode: 'halation', exposure: 100, diffusion: 100, tint: -100},
  ];
  for (const glow of valid) {
    const value = recipe(glow), before = structuredClone(value);
    assert.doesNotThrow(() => validateGlow(glow));
    assert.doesNotThrow(() => validateRecipe(value));
    assert.deepEqual(value, before);
    assert.doesNotThrow(() => validateRecipe(fromWorker(value)));
  }
  assert.equal(recipe({}).parameters.processingOrder.includes('glow'), false);
});

test('GLOW-RECIPE-EXT02: exposure/diffusion/tint honor pixel-module finite inclusive ranges', () => {
  for (const key of ['exposure', 'diffusion', 'tint']) {
    const [min, max] = GLOW_LIMITS[key];
    for (const accepted of [min, (min + max) / 3, max]) {
      assert.doesNotThrow(() => validateGlow({[key]: accepted}));
      assert.doesNotThrow(() => validateRecipe(recipe({[key]: accepted})));
    }
    for (const rejected of [min - 0.1, max + 0.1, NaN, Infinity, -Infinity, '50', null, undefined, false]) {
      assert.throws(() => validateGlow({[key]: rejected}));
      assert.throws(() => validateRecipe(recipe({[key]: rejected})),
        /INVALID_PARAMETER|INVALID_POST_DECODE_RANGE/, `${key}=${String(rejected)}`);
    }
  }
});

test('GLOW-RECIPE-EXT03: invalid modes, unknown/symbol keys, and class instances reject', () => {
  class ModeObject {constructor() {this.mode = 'halation';}}
  const invalid = [null, [], new ModeObject(), {mode: 'AI'}, {mode: 'White Mist'},
    {mode: 'legacy'}, {mode: 1}, {mode: null}, {mode: undefined},
    {mode: 'halation', unknown: true}, {mode: 'whiteMist', [Symbol('hidden')]: 1},
    {intensity: -1}, {intensity: 101}, {radius: 0}, {radius: 65},
    {radius: 3.5}, {threshold: -1}, {threshold: 256}, {threshold: 120.5},
  ];
  for (const glow of invalid)
    assert.throws(() => validateRecipe(recipe(glow)), /INVALID_PARAMETER|INVALID_POST_DECODE_(ADJUSTMENTS|RANGE)/);
  const workerClass = runInNewContext('(class Glow { constructor() { this.mode = "halation"; } })');
  assert.throws(() => validateRecipe(recipe(new workerClass())), /INVALID_POST_DECODE_ADJUSTMENTS/);
});

test('GLOW-RECIPE-EXT04: existing Point Curves, Grain, Canvas, Vignette remain valid alongside extended Glow', () => {
  const value = recipe({mode: 'blackMist', intensity: 35, exposure: 10, diffusion: 30, tint: -20});
  const extra = value.parameters.extendedParameters;
  extra.postDecodeAdjustments.color.pointCurves = {master: [{x: 0, y: 0}, {x: 255, y: 255}]};
  extra.postDecodeAdjustments.detail = {grain: {amount: 40, seed: 12, shadows: 50, size: 20}};
  extra.postCropAdjustments = {schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1',
    vignette: {amount: -15, midpoint: 30}};
  extra.canvasExpand = {schemaVersion: 1, margins: {left: 0, right: 0.2, top: 0, bottom: 0}};
  assert.doesNotThrow(() => validateRecipe(value));
  assert.doesNotThrow(() => validateRecipe(fromWorker(value)));
  const invalidStage = fromWorker(value);
  invalidStage.parameters.processingOrder.push('glow');
  assert.throws(() => validateRecipe(invalidStage), /INVALID_PIPELINE/);
  const legacy = {schemaVersion: 1, parameters: {exposure: 0, contrast: 1, saturation: 1,
    rotationDegrees: 0, extendedParameters: {}, processingOrder: []}};
  assert.doesNotThrow(() => validateRecipe(legacy));
});
