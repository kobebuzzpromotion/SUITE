import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const identity = [{x: 0, y: 0}, {x: 255, y: 255}];
function recipe(color = {}, detail = {}) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color, detail,
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}
const workerJson = value => runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`);

test('POINT-GLOW-REALM01: plain JSON points and Glow validate after a Worker realm round-trip', () => {
  const value = recipe({
    pointCurves: {master: identity, red: [{x: 0, y: 4}, {x: 128, y: 150}, {x: 255, y: 245}]},
    glow: {intensity: 55.5, radius: 12, threshold: 190},
  }, {grain: {amount: 15, seed: 7, shadows: 20, colorVariation: 30}});
  const before = structuredClone(value);
  assert.doesNotThrow(() => validateRecipe(value));
  assert.deepEqual(value, before);
  const transported = workerJson(value);
  assert.doesNotThrow(() => validateRecipe(transported));
  assert.deepEqual(JSON.parse(JSON.stringify(transported)), value);
});

test('POINT-GLOW-REALM02: partial and neutral recipes still validate; no new pipeline stage is accepted', () => {
  for (const color of [{pointCurves: {}}, {pointCurves: {blue: identity}},
    {glow: {}}, {glow: {intensity: 0}},
    {pointCurves: {green: identity}, glow: {threshold: 255}}]) {
    assert.doesNotThrow(() => validateRecipe(workerJson(recipe(color))));
  }
  const legacy = {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {}, processingOrder: [],
  }};
  assert.doesNotThrow(() => validateRecipe(legacy));
  const extraStage = workerJson(recipe({pointCurves: {master: identity}, glow: {intensity: 10}}));
  extraStage.parameters.processingOrder.push('glow');
  assert.throws(() => validateRecipe(extraStage), /INVALID_PIPELINE/);
});

test('POINT-GLOW-REALM03: class instances and unknown/symbol keys remain prohibited at every nested level', () => {
  class Curves {constructor() {this.master = identity;}}
  class Point {constructor(x, y) {this.x = x; this.y = y;}}
  class Glow {constructor() {this.intensity = 10;}}
  const invalid = [
    {pointCurves: new Curves()},
    {pointCurves: {master: [new Point(0, 0), {x: 255, y: 255}]}},
    {pointCurves: {master: identity, cyan: identity}},
    {pointCurves: {master: identity, [Symbol('hidden')]: identity}},
    {pointCurves: {master: [{x: 0, y: 0, extra: 1}, {x: 255, y: 255}]}},
    {pointCurves: {master: [{x: 0, y: 0, [Symbol('hidden')]: 1}, {x: 255, y: 255}]}},
    {glow: new Glow()}, {glow: {intensity: 10, mode: 'HALATION'}},
    {glow: {intensity: 10, [Symbol('hidden')]: 1}},
  ];
  for (const color of invalid)
    assert.throws(() => validateRecipe(recipe(color)), /INVALID_POST_DECODE_ADJUSTMENTS/);
});

test('POINT-GLOW-REALM04: cross-realm acceptance does not relax point or Glow numerical constraints', () => {
  for (const color of [
    {pointCurves: {red: [{x: 0, y: 0}, {x: 0, y: 12}, {x: 255, y: 255}]}},
    {pointCurves: {blue: [{x: 0, y: 0}, {x: 255, y: 256}]}},
    {pointCurves: {master: [{x: 1, y: 0}, {x: 255, y: 255}]}},
    {glow: {radius: 0}}, {glow: {radius: 1.5}}, {glow: {threshold: 256}},
    {glow: {intensity: 101}},
  ]) assert.throws(() => validateRecipe(workerJson(recipe(color))), /INVALID_POST_DECODE_(ADJUSTMENTS|RANGE)/);
  for (const color of [{pointCurves: {red: [{x: 0, y: NaN}, {x: 255, y: 255}]}},
    {glow: {intensity: Infinity}}, {glow: {threshold: NaN}}])
    assert.throws(() => validateRecipe(recipe(color)), /INVALID_PARAMETER|INVALID_POST_DECODE_(ADJUSTMENTS|RANGE)/);
});
