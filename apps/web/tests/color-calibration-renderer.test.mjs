import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels, rotateCropPixels} from '../src/processing/pure.mjs';
import {applyColorAdjustments} from '../src/processing/color-adjustments.mjs';
import {applyColorCalibration} from '../src/processing/color-calibration.mjs';
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
    const offset = (y * width + x) * 4;
    data.set([40 + x * 17, 30 + y * 18, 130 + (x + y) * 5, 255], offset);
  }
  data.set([190, 20, 120, 0], 0);
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

test('CALIBRATION-RENDER01: real pixels change while neutral/legacy paths and source remain intact', () => {
  const pixels = source(), before = pixels.data.slice();
  const baseline = render(pixels, recipe({}));
  const neutral = render(pixels, recipe({calibration: {}}));
  const controls = {red: {hue: 80, saturation: 50}, blue: {hue: -40}};
  const actual = render(pixels, recipe({calibration: controls}));
  assert.deepEqual(neutral.data, baseline.data);
  assert.deepEqual(actual.data, applyColorCalibration(pixels, controls).data);
  assert.notDeepEqual(actual.data, baseline.data);
  assert.deepEqual([...actual.data.slice(0, 4)], [190, 20, 120, 0]);
  assert.deepEqual(pixels.data, before);
  const legacy = recipe({});
  delete legacy.parameters.extendedParameters.postDecodeAdjustments;
  legacy.parameters.processingOrder.splice(3, 1);
  assert.deepEqual(render(pixels, legacy).data, baseline.data);
});

test('CALIBRATION-RENDER02: global color -> calibration -> Levels/Curves/Glow/Detail/Grain -> rotation/Crop/Vignette', () => {
  const pixels = source(), before = pixels.data.slice();
  const calibration = {red: {hue: 75, saturation: 40}, green: {hue: -35}, blue: {saturation: 25}};
  const levels = {master: {inputBlack: 12, inputWhite: 235, gamma: 1.3}};
  const pointCurves = {blue: [{x: 0, y: 0}, {x: 160, y: 185}, {x: 255, y: 255}]};
  const glow = {intensity: 15, radius: 2, threshold: 170};
  const detail = {sharpness: 12, grain: {amount: 4, seed: 7}};
  const color = {temperature: 20, calibration, levels, pointCurves, glow};
  const value = recipe(color, detail);
  value.parameters.rotationDegrees = 90;
  value.parameters.extendedParameters.crop = {...defaultCropSettings(), rotation: 90,
    crop_rect: {x: 1 / 3, y: 1 / 3, width: 1 / 3, height: 1 / 3}};
  value.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-manual-vignette-1',
    vignette: {amount: -30, midpoint: 45, roundness: -15, feather: 60, highlights: 10},
  };
  value.parameters.processingOrder.push('crop');
  assert.doesNotThrow(() => validateRecipe(value));

  const afterColor = applyColorAdjustments(pixels, {temperature: color.temperature});
  const afterCalibration = applyColorCalibration(afterColor, calibration);
  const afterLevels = applyLevels(afterCalibration, levels);
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

  // Levels must grade calibrated pixels, not the other way around.
  assert.notDeepEqual(afterLevels.data,
    applyColorCalibration(applyLevels(afterColor, levels), calibration).data);
});

test('CALIBRATION-RENDER03: invalid settings and abort fail without mutating source', () => {
  const pixels = source(), before = pixels.data.slice();
  const bad = recipe({calibration: {red: {hue: 101}}});
  assert.throws(() => render(pixels, bad), /INVALID_COLOR_CALIBRATION_RANGE/);
  const active = recipe({calibration: {red: {hue: 25}}});
  assert.throws(() => render(pixels, active, {aborted: true}), {name: 'AbortError'});
  assert.deepEqual(pixels.data, before);
});
