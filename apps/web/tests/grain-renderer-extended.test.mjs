import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyGrain} from '../src/processing/grain.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const render = (pixels, recipe, signal) =>
  renderPixels(pixels, recipe, {validateRecipe, resolutionAssessment, signal});

function source() {
  const width = 16, height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    data.set([20 + 12 * x, 20 + 12 * y, 50 + 5 * (x + y), 255], offset);
  }
  data.set([200, 30, 90, 0], 0);
  return {width, height, data};
}

function recipe(grain) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', detail: {grain},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

test('GRAIN-RENDER-EXT01: legacy Amount+Seed Recipes use numeric API bit-for-bit', () => {
  const pixels = source(), before = pixels.data.slice();
  for (const amount of [0, 30, 100]) {
    const grain = {amount, seed: 42};
    const actual = render(pixels, recipe(grain));
    const legacy = applyGrain(pixels, amount, {seed: grain.seed});
    assert.deepEqual(actual.data, legacy.data);
    assert.deepEqual([...actual.data.slice(0, 4)], [200, 30, 90, 0]);
  }
  assert.deepEqual(pixels.data, before);
});

test('GRAIN-RENDER-EXT02: all six tonal/texture controls reach object API without changing stage position', () => {
  const pixels = source(), before = pixels.data.slice();
  const grain = {amount: 85, seed: 99,
    shadows: 20, midtones: 70, highlights: 45,
    size: 40, roughness: 65, colorVariation: 80};
  const actual = render(pixels, recipe(grain));
  const {seed, ...settings} = grain;
  const expected = applyGrain(pixels, settings, {seed});
  assert.deepEqual(actual.data, expected.data);
  assert.notDeepEqual(actual.data, applyGrain(pixels, grain.amount, {seed}).data);
  assert.deepEqual(pixels.data, before);
});

test('GRAIN-RENDER-EXT03: every individual optional control projects through Recipe to pixels', () => {
  const pixels = source();
  const controls = {shadows: 0, midtones: 20, highlights: 50,
    size: 45, roughness: 70, colorVariation: 100};
  for (const [key, value] of Object.entries(controls)) {
    const grain = {amount: 90, seed: 7, [key]: value};
    const actual = render(pixels, recipe(grain));
    assert.deepEqual(actual.data, applyGrain(pixels, {amount: 90, [key]: value}, {seed: 7}).data,
      `Recipe control ${key} reaches applyGrain`);
  }
});

test('GRAIN-RENDER-EXT04: invalid control and abort reject without source mutation', () => {
  const pixels = source(), before = pixels.data.slice();
  assert.throws(() => render(pixels, recipe({amount: 50, seed: 1, roughness: 101})),
    /INVALID_POST_DECODE_RANGE|INVALID_GRAIN_SETTING_RANGE/);
  assert.throws(() => render(pixels, recipe({amount: 50, seed: 1, colorVariation: 20}),
    {aborted: true}), {name: 'AbortError'});
  assert.deepEqual(pixels.data, before);
});
