import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels, rotateCropPixels} from '../src/processing/pure.mjs';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {applyColorCalibration} from '../src/processing/color-calibration.mjs';
import {applySelectiveColor} from '../src/processing/selective-color.mjs';
import {applyLevels} from '../src/processing/levels.mjs';
import {applyPointCurves} from '../src/processing/point-curves.mjs';
import {applyGlow} from '../src/processing/glow.mjs';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';
import {applyGrain} from '../src/processing/grain.mjs';
import {applyVignette} from '../src/processing/vignette.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {defaultCropSettings, resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const render = (pixels, recipe, signal) =>
  renderPixels(pixels, recipe, {validateRecipe, resolutionAssessment, signal});

function source(width = 9, height = 9) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data.set([80 + x * 15, 30 + y * 17, 105 + (x + y) * 7, 255], (y * width + x) * 4);
  }
  data.set([210, 20, 30, 255], 4);
  data.set([20, 40, 210, 255], 8);
  data.set([200, 15, 120, 0], 12);
  return {width, height, data};
}

function recipe(color, detail) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color,
      ...(detail ? {detail} : {}),
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

test('SELECTIVE-RENDER01: real pixels change; neutral, old Recipe and input data remain unchanged', () => {
  const pixels = source(), before = pixels.data.slice();
  const baseline = render(pixels, recipe({}));
  const neutral = render(pixels, recipe({selectiveColor: {}}));
  const controls = {method: 'absolute', ranges: {reds: {cyan: -60}, blues: {yellow: -45}}};
  const actual = render(pixels, recipe({selectiveColor: controls}));
  assert.deepEqual(neutral.data, baseline.data);
  assert.deepEqual(actual.data, applySelectiveColor(pixels, controls).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual([...actual.data.slice(12, 16)], [200, 15, 120, 0]);
  assert.deepEqual(pixels.data, before);
  const old = recipe({});
  delete old.parameters.extendedParameters.postDecodeAdjustments;
  old.parameters.processingOrder.splice(3, 1);
  assert.deepEqual(render(pixels, old).data, baseline.data);
});

test('SELECTIVE-RENDER02: global color -> Calibration -> Selective -> Levels/Curves/Glow/Detail/Grain -> Crop/Vignette', () => {
  const pixels = source(), before = pixels.data.slice();
  const calibration = {red: {hue: 40, saturation: 20}, blue: {hue: -25}};
  const selectiveColor = {method: 'relative', ranges: {reds: {cyan: -45, black: 20},
    blues: {yellow: -35}, neutrals: {magenta: 10}}};
  const levels = {master: {inputBlack: 8, inputWhite: 240, gamma: 1.25}};
  const pointCurves = {red: [{x: 0, y: 0}, {x: 150, y: 172}, {x: 255, y: 255}]};
  const glow = {intensity: 15, radius: 2, threshold: 180};
  const detail = {sharpness: 15, grain: {amount: 5, seed: 42}};
  const color = {temperature: 15, calibration, selectiveColor, levels, pointCurves, glow};
  const value = recipe(color, detail);
  value.parameters.rotationDegrees = 90;
  value.parameters.extendedParameters.crop = {...defaultCropSettings(), rotation: 90,
    crop_rect: {x: 1 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3}};
  value.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1',
    vignette: {amount: -35, midpoint: 45, roundness: -10, feather: 60},
  };
  value.parameters.processingOrder.push('crop');
  assert.doesNotThrow(() => validateRecipe(value));

  const afterColor = applyColorAdjustments(pixels, {temperature: color.temperature});
  const afterCalibration = applyColorCalibration(afterColor, calibration);
  const afterSelective = applySelectiveColor(afterCalibration, selectiveColor);
  const afterLevels = applyLevels(afterSelective, levels);
  const afterCurves = applyPointCurves(afterLevels, pointCurves);
  const afterGlow = applyGlow(afterCurves, glow);
  const afterDetail = applyDetailAdjustments(afterGlow, {sharpness: detail.sharpness});
  const afterGrain = applyGrain(afterDetail, detail.grain.amount, {seed: detail.grain.seed});
  const cropped = rotateCropPixels(afterGrain, 90, value.parameters.extendedParameters.crop,
    {resolutionAssessment});
  const expected = applyVignette(cropped, value.parameters.extendedParameters.postCropAdjustments.vignette);
  const actual = render(pixels, value);
  assert.deepEqual([actual.width, actual.height], [3, 3]);
  assert.deepEqual(actual.data, expected.data);
  assert.deepEqual(pixels.data, before);
  assert.notDeepEqual(afterLevels.data,
    applySelectiveColor(applyLevels(afterCalibration, levels), selectiveColor).data);
});

test('SELECTIVE-RENDER03: invalid settings and abort fail closed without source mutation', () => {
  const pixels = source(), before = pixels.data.slice();
  const invalid = recipe({selectiveColor: {ranges: {reds: {cyan: 101}}}});
  assert.throws(() => render(pixels, invalid), /INVALID_SELECTIVE_COLOR_RANGE/);
  const active = recipe({selectiveColor: {ranges: {reds: {cyan: 25}}}});
  assert.throws(() => render(pixels, active, {aborted: true}), {name: 'AbortError'});
  assert.deepEqual(pixels.data, before);
});
