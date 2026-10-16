import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {buildPointCurveLUT} from '../src/processing/point-curves.mjs';

const identity = [{x: 0, y: 0}, {x: 255, y: 255}];
const invert = [{x: 0, y: 255}, {x: 255, y: 0}];
const recipe = (pointCurves, otherColor = {}, detail = {}) => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {postDecodeAdjustments: {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {...otherColor, ...(pointCurves === undefined ? {} : {pointCurves})}, detail,
  }},
  processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
}});

test('POINT-RECIPE01: optional master/RGB channels accept 2–32 integer points, reversals and empty neutral object', () => {
  const thirtyTwo = Array.from({length: 32}, (_, index) => ({x: index === 31 ? 255 : index * 8, y: index === 31 ? 0 : 255 - index * 8}));
  for (const curves of [{}, {master: identity}, {red: invert},
    {master: identity, red: invert, green: identity, blue: thirtyTwo},
    {blue: [{x: 0, y: 0}, {x: 64, y: 200}, {x: 128, y: 20}, {x: 255, y: 255}]}]) {
    assert.doesNotThrow(() => validateRecipe(recipe(curves)));
    for (const points of Object.values(curves)) assert.doesNotThrow(() => buildPointCurveLUT(points));
  }
});

test('POINT-RECIPE02: invalid channel collection and unknown channels fail closed', () => {
  for (const bad of [null, [], new Date(), {cyan: identity}, {master: null}, {red: []},
    {blue: [identity[0]]}, {[Symbol('hidden')]: identity}, {master: undefined}])
    assert.throws(() => validateRecipe(recipe(bad)), /INVALID_PARAMETER|INVALID_POST_DECODE/);
});

test('POINT-RECIPE03: integer bounds, strict X order and exact endpoints match pixel LUT contract', () => {
  const badPoints = [
    [{x: 1, y: 0}, {x: 255, y: 255}], [{x: 0, y: 0}, {x: 254, y: 255}],
    [{x: 0, y: 0}, {x: 80, y: 30}, {x: 80, y: 40}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 120, y: 40}, {x: 100, y: 50}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 255, y: 256}], [{x: -1, y: 0}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 255, y: -1}], [{x: 0, y: 0}, {x: 255, y: NaN}],
    [{x: 0.5, y: 0}, {x: 255, y: 255}], [{x: 0, y: 0}, {x: 255, y: 255.5}],
    [{x: 0, y: 0, label: 'extra'}, {x: 255, y: 255}],
    [{x: 0, y: 0, [Symbol('hidden')]: 2}, {x: 255, y: 255}],
    Array.from({length: 33}, (_, i) => ({x: i === 32 ? 255 : i, y: i})),
  ];
  for (const points of badPoints)
    assert.throws(() => validateRecipe(recipe({red: points})), /INVALID_PARAMETER|INVALID_POST_DECODE/);
});

test('POINT-RECIPE04: existing Glow, Grain, Levels and Recipe v1 remain valid', () => {
  const combined = recipe({master: identity, red: invert},
    {glow: {intensity: 30, radius: 8, threshold: 180},
      levels: {master: {inputBlack: 10, inputWhite: 245, gamma: 1.5, outputBlack: 2, outputWhite: 250}}},
    {grain: {amount: 12, seed: 10}});
  assert.doesNotThrow(() => validateRecipe(combined));
  assert.doesNotThrow(() => validateRecipe(recipe(undefined, {glow: {intensity: 0}})));
  const legacy = {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0, extendedParameters: {}, processingOrder: [],
  }};
  assert.doesNotThrow(() => validateRecipe(legacy));
});

test('POINT-RECIPE05: point curves require existing post-decode stage; no new top-level stage', () => {
  const missing = recipe({master: identity});
  missing.parameters.processingOrder = ['exposure', 'contrast', 'saturation', 'rotation'];
  assert.throws(() => validateRecipe(missing), /INVALID_PIPELINE/);
  const extraStage = recipe({master: identity});
  extraStage.parameters.processingOrder.push('pointCurves');
  assert.throws(() => validateRecipe(extraStage), /INVALID_PIPELINE/);
});
