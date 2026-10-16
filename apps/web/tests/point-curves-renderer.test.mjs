import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyPointCurves} from '../src/processing/point-curves.mjs';
import {applyLevels} from '../src/processing/levels.mjs';
import {applyGrain} from '../src/processing/grain.mjs';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const identity = [{x: 0, y: 0}, {x: 255, y: 255}];
const invert = [{x: 0, y: 255}, {x: 255, y: 0}];
const render = (pixels, recipe, options = {}) =>
  renderPixels(pixels, recipe, {validateRecipe, resolutionAssessment, ...options});
function source() {
  return {width: 3, height: 1, data: new Uint8ClampedArray([
    10, 50, 90, 255,
    130, 140, 150, 255,
    255, 0, 128, 0,
  ])};
}
function withAdjustments(color, detail = undefined) {
  const recipe = neutralRecipe();
  recipe.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1',
    color,
    ...(detail ? {detail} : {}),
  };
  recipe.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  return recipe;
}

test('POINT-RENDER-01 / SYNTHETIC: strict Recipe and renderer apply RGB master then per-channel point curves', () => {
  const pixels = source(), before = pixels.data.slice();
  const curves = {master: invert, red: invert};
  const recipe = withAdjustments({pointCurves: curves});
  assert.doesNotThrow(() => validateRecipe(recipe));
  const result = render(pixels, recipe);
  assert.deepEqual([...result.data], [10, 205, 165, 255, 130, 115, 105, 255, 255, 0, 128, 0]);
  assert.deepEqual(pixels.data, before);
});

test('POINT-RENDER-02 / SYNTHETIC: neutral point curves preserve pixels and existing no-curve path', () => {
  const pixels = source();
  const plain = render(pixels, neutralRecipe());
  const explicit = render(pixels, withAdjustments({pointCurves: {master: identity, red: identity, green: identity, blue: identity}}));
  assert.deepEqual(explicit.data, plain.data);
  assert.notStrictEqual(explicit.data, pixels.data);
});

test('POINT-RENDER-03 / SYNTHETIC: color, Levels, Point Curves, Detail, Grain retain the specified order', () => {
  const pixels = source();
  const original = pixels.data.slice();
  const color = {temperature: 20, levels: {master: {inputBlack: 10, inputWhite: 230}},
    pointCurves: {red: invert, green: [{x: 0, y: 0}, {x: 100, y: 140}, {x: 255, y: 255}]}};
  const detail = {sharpness: 60, grain: {amount: 35, seed: 42}};
  const recipe = withAdjustments(color, detail);
  assert.doesNotThrow(() => validateRecipe(recipe));
  const actual = render(pixels, recipe);
  const base = applyColorAdjustments(pixels, {temperature: color.temperature});
  const afterLevels = applyLevels(base, color.levels);
  const afterPoints = applyPointCurves(afterLevels, color.pointCurves);
  const afterDetail = applyDetailAdjustments(afterPoints, {sharpness: detail.sharpness});
  const expected = applyGrain(afterDetail, detail.grain.amount, {seed: detail.grain.seed});
  assert.deepEqual(actual.data, expected.data);
  // Temperature adjusts hidden blue 128 -> 126; later stages preserve it and alpha.
  assert.deepEqual([...actual.data.slice(8, 12)], [255, 0, 126, 0]);
  assert.deepEqual(pixels.data, original);
});

test('POINT-RENDER-04 / SYNTHETIC: malformed point shape is rejected by shared Recipe validator and renderer', () => {
  const bad = withAdjustments({pointCurves: {red: [{x: 0, y: 0}, {x: 100, y: 20}, {x: 100, y: 30}, {x: 255, y: 255}]}});
  assert.throws(() => validateRecipe(bad), /INVALID_POST_DECODE_ADJUSTMENTS/);
  assert.throws(() => render(source(), bad), /INVALID_POST_DECODE_ADJUSTMENTS/);
  const unknown = withAdjustments({pointCurves: {yellow: identity}});
  assert.throws(() => validateRecipe(unknown), /INVALID_POST_DECODE_ADJUSTMENTS/);
  assert.throws(() => render(source(), unknown), /INVALID_POST_DECODE_ADJUSTMENTS/);
});

test('POINT-RENDER-05 / SYNTHETIC: abort and invalid source reject without editing input', () => {
  const pixels = source(), before = pixels.data.slice();
  const recipe = withAdjustments({pointCurves: {master: invert}});
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => render(pixels, recipe, {signal: controller.signal}), {name: 'AbortError'});
  assert.deepEqual(pixels.data, before);
  assert.throws(() => render({width: 3, height: 1, data: new Uint8ClampedArray(4)}, recipe), /INVALID_OR_OVERSIZE_PIXELS/);
});
