import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyVignette} from '../src/processing/vignette.mjs';
import {neutralRecipe} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {defaultCropSettings, resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const copy = value => structuredClone(value);
const render = (pixels, recipe, signal) => renderPixels(pixels, recipe, {validateRecipe, resolutionAssessment, signal});
const image = (width = 9, height = 9) => ({width, height,
  data: new Uint8ClampedArray(Array.from({length: width * height}, () => [160, 160, 160, 255]).flat())});
const rgba = (pixels, x, y) => Array.from(pixels.data.slice((y * pixels.width + x) * 4, (y * pixels.width + x) * 4 + 4));
function withPostCrop(base, amount) {
  const result = copy(base);
  result.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1', vignette: {amount},
  };
  return result;
}
function cropped() {
  const result = neutralRecipe();
  result.parameters.extendedParameters.crop = {...defaultCropSettings(),
    crop_rect: {x: 1 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3}};
  result.parameters.processingOrder.push('crop');
  return result;
}

test('VIGNETTE-RENDER01: Vignette is applied to cropped output, not pre-Crop source', () => {
  const pixels = image(), original = pixels.data.slice(), base = cropped();
  const recipe = withPostCrop(base, -100);
  assert.doesNotThrow(() => validateRecipe(recipe));
  assert.equal(recipe.parameters.processingOrder.at(-1), 'crop');
  assert.equal(recipe.parameters.processingOrder.includes('postCropAdjustments'), false);
  const plain = render(pixels, base), actual = render(pixels, recipe);
  const expected = applyVignette(plain, -100);
  assert.deepEqual(actual.data, expected.data);
  assert.deepEqual([actual.width, actual.height], [3, 3]);
  assert.ok(rgba(actual, 0, 0)[0] < rgba(plain, 0, 0)[0]);
  assert.deepEqual(rgba(actual, 1, 1), rgba(plain, 1, 1));
  assert.deepEqual(pixels.data, original);
});

test('VIGNETTE-RENDER02: no-Crop effect follows rotation/full-frame output; signed neutral is exact', () => {
  const pixels = image(5, 3), base = neutralRecipe();
  for (const amount of [-100, 0, 100]) {
    const recipe = withPostCrop(base, amount);
    const actual = render(pixels, recipe);
    assert.deepEqual(actual.data, applyVignette(render(pixels, base), amount).data);
    if (amount === 0) assert.deepEqual(actual.data, render(pixels, base).data);
  }
});

test('VIGNETTE-RENDER03: transparent hidden RGB and alpha survive post-Crop processing', () => {
  const pixels = image();
  pixels.data.set([255, 0, 128, 0], (4 * pixels.width + 4) * 4);
  pixels.data.set([20, 40, 60, 100], (3 * pixels.width + 3) * 4);
  const actual = render(pixels, withPostCrop(cropped(), 90));
  assert.deepEqual(rgba(actual, 1, 1), [255, 0, 128, 0]);
  assert.equal(rgba(actual, 0, 0)[3], 100);
});

test('VIGNETTE-RENDER04: existing color, Levels, Point Curves, Glow, Detail and Grain run before Crop/Vignette', () => {
  const pixels = image(), base = cropped();
  pixels.data.set([255, 255, 255, 255], (4 * pixels.width + 4) * 4);
  base.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {temperature: 10, levels: {master: {inputBlack: 5}},
      pointCurves: {red: [{x: 0, y: 0}, {x: 255, y: 255}]},
      glow: {intensity: 20, radius: 1, threshold: 180}},
    detail: {sharpness: 5, grain: {amount: 2, seed: 42}},
  };
  base.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  const recipe = withPostCrop(base, -35);
  const expected = applyVignette(render(pixels, base), -35);
  assert.deepEqual(render(pixels, recipe).data, expected.data);
});

test('VIGNETTE-RENDER05: old Recipe works; unsupported stage/payload and abort fail closed', () => {
  const pixels = image(), base = cropped();
  assert.doesNotThrow(() => render(pixels, base));
  const badStage = withPostCrop(base, 50);
  badStage.parameters.processingOrder.push('postCropAdjustments');
  assert.throws(() => render(pixels, badStage), /INVALID_PIPELINE/);
  const badPayload = withPostCrop(base, 50);
  badPayload.parameters.extendedParameters.postCropAdjustments.vignette.amount = 101;
  assert.throws(() => render(pixels, badPayload), /INVALID_POST_CROP_ADJUSTMENTS/);
  assert.throws(() => render(pixels, withPostCrop(base, 50), {aborted: true}), {name: 'AbortError'});
});
