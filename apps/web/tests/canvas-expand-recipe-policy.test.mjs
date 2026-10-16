import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {defaultCropSettings} from '../../../dist/apps/backend/src/crop-export.js';

const neutral = () => ({schemaVersion: 1, parameters: {
  exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
  extendedParameters: {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation'],
}});
const margins = () => ({left: 0, right: 0, top: 0, bottom: 0});
function expanded(settings) {
  const recipe = neutral();
  recipe.parameters.extendedParameters.canvasExpand = settings;
  return recipe;
}
const settings = (marginValues = margins(), background) => ({schemaVersion: 1, margins: marginValues,
  ...(background === undefined ? {} : {background})});

test('CANVAS-RECIPE01: finite ratio margins 0..4 and optional RGBA8 background are accepted without new stage', () => {
  for (const input of [settings(), settings({left: 4, right: 0.5, top: 2, bottom: 0}, [0, 1, 254, 255]),
    settings({left: 0.125, right: 4, top: 4, bottom: 1.75}, [255, 255, 255, 0])]) {
    const recipe = expanded(input), before = structuredClone(recipe);
    assert.doesNotThrow(() => validateRecipe(recipe));
    assert.deepEqual(recipe, before);
    assert.equal(recipe.parameters.processingOrder.includes('canvasExpand'), false);
  }
});

test('CANVAS-RECIPE02: typed envelope and exact margins reject missing, extra and malformed values', () => {
  const bad = [null, [], {margins: margins()}, {schemaVersion: 2, margins: margins()},
    {...settings(), unknown: 1}, settings({...margins(), extra: 1}),
    settings({left: 0, right: 0, top: 0}), settings(null), settings([]),
    settings({...margins(), left: -0.01}), settings({...margins(), right: 4.01}),
    settings({...margins(), top: NaN}), settings({...margins(), bottom: Infinity}),
    settings({...margins(), left: '1'}), settings({...margins(), top: undefined}),
    {...settings(), [Symbol('hidden')]: 1},
    settings({...margins(), [Symbol('hidden')]: 1}),
  ];
  for (const input of bad) assert.throws(() => validateRecipe(expanded(input)), /INVALID_PARAMETER|INVALID_CANVAS_EXPAND/);
});

test('CANVAS-RECIPE03: background must be a dense exact four-channel integer array', () => {
  const sparse = new Array(4); sparse[0] = 0; sparse[3] = 255;
  const extra = [0, 0, 0, 255]; extra.note = 'not a channel';
  const symbolic = [0, 0, 0, 255]; symbolic[Symbol('hidden')] = 1;
  for (const bad of [null, [], [0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, -1], [0, 0, 0, 256],
    [0, 0, 0, 0.5], [0, 0, 0, NaN], [0, 0, 0, Infinity], [0, 0, 0, '255'],
    new Uint8ClampedArray([0, 0, 0, 0]), sparse, extra, symbolic])
    assert.throws(() => validateRecipe(expanded(settings(margins(), bad))), /INVALID_PARAMETER|INVALID_CANVAS_EXPAND/);
});

test('CANVAS-RECIPE04: legacy Recipe, Crop and existing color/detail/post-Crop extensions remain valid', () => {
  assert.doesNotThrow(() => validateRecipe(neutral()));
  const recipe = expanded(settings({left: 0.25, right: 0.25, top: 0.5, bottom: 0}, [20, 40, 60, 255]));
  recipe.parameters.extendedParameters.crop = {...defaultCropSettings(), crop_rect: {x: 0.1, y: 0.1, width: 0.8, height: 0.8}};
  recipe.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1', vignette: {amount: 20},
  };
  recipe.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {levels: {master: {inputBlack: 10}},
      glow: {intensity: 10, radius: 3, threshold: 180},
      pointCurves: {red: [{x: 0, y: 0}, {x: 255, y: 255}]}},
    detail: {grain: {amount: 5, seed: 1}},
  };
  recipe.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  recipe.parameters.processingOrder.push('crop');
  assert.equal(recipe.parameters.processingOrder.at(-1), 'crop');
  assert.doesNotThrow(() => validateRecipe(recipe));
});

test('CANVAS-RECIPE05: processingOrder cannot acquire a canvasExpand stage', () => {
  const recipe = expanded(settings());
  recipe.parameters.processingOrder.push('canvasExpand');
  assert.throws(() => validateRecipe(recipe), /INVALID_PIPELINE/);
});

test('CANVAS-RECIPE06: Worker-realm JSON objects remain valid, class instances do not', () => {
  const workerRecipe = runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(expanded(settings())))})`);
  assert.doesNotThrow(() => validateRecipe(workerRecipe));
  const classRecipe = expanded(settings());
  class CanvasSettings {constructor() {Object.assign(this, settings());}}
  classRecipe.parameters.extendedParameters.canvasExpand = new CanvasSettings();
  assert.throws(() => validateRecipe(classRecipe), /INVALID_CANVAS_EXPAND/);
});
