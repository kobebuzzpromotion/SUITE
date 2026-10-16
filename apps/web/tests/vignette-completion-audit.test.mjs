import test from 'node:test';
import assert from 'node:assert/strict';
import {neutralRecipe, EditorSession} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyVignette} from '../src/processing/vignette.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {defaultCropSettings, resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const frame = () => {
  const width = 27, height = 27, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const value = (x + y) % 3 === 0 ? 235 : 80;
    data.set([value, value, value, 255], offset);
  }
  return {width, height, data};
};
const render = (pixels, recipe) => renderPixels(pixels, recipe, {validateRecipe, resolutionAssessment});
const controls = {amount:-85, midpoint:80, roundness:-65, feather:75, highlights:90};

test('VIGNETTE-AUDIT01: all five controls survive typed Recipe and act after Crop without mutating source', () => {
  const pixels = frame(), before = pixels.data.slice();
  const base = neutralRecipe();
  base.parameters.extendedParameters.crop = {...defaultCropSettings(),
    crop_rect:{x:1/3,y:1/3,width:1/3,height:1/3}};
  base.parameters.processingOrder.push('crop');
  const edited = structuredClone(base);
  edited.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion:1, engineVersion:'suite-srgb8-manual-vignette-1', vignette:controls};
  assert.doesNotThrow(() => validateRecipe(edited));
  const cropped = render(pixels, base), actual = render(pixels, edited);
  assert.deepEqual([actual.width, actual.height], [9, 9]);
  assert.deepEqual(actual.data, applyVignette(cropped, controls).data);
  assert.notDeepEqual(actual.data, cropped.data);
  assert.deepEqual(pixels.data, before);
  assert.deepEqual(edited.parameters.extendedParameters.postCropAdjustments.vignette, controls);
});

test('VIGNETTE-AUDIT02: typed photo-independent Vignette is portable; photo-local or unknown fields fail closed', () => {
  const edited = neutralRecipe();
  edited.parameters.extendedParameters.postCropAdjustments = {
    schemaVersion:1, engineVersion:'suite-srgb8-manual-vignette-1', vignette:controls};
  assert.doesNotThrow(() => validateRecipe(edited));
  const portable = portablePresetRecipe(edited);
  assert.deepEqual(portable.parameters.extendedParameters.postCropAdjustments.vignette, controls);
  assert.deepEqual(edited.parameters.extendedParameters.postCropAdjustments.vignette, controls);
  const photoLocal = structuredClone(edited);
  photoLocal.parameters.extendedParameters.crop = defaultCropSettings();
  assert.throws(() => portablePresetRecipe(photoLocal), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  const unknown = structuredClone(edited);
  unknown.parameters.extendedParameters.postCropAdjustments.mask = {data:[1]};
  assert.throws(() => portablePresetRecipe(unknown), /INVALID_POST_CROP_PRESET/);
});

test('VIGNETTE-AUDIT03: Vignette-only Sync is separate from whole-Recipe Batch', () => {
  assert.equal(typeof EditorSession.prototype.batchApplyCurrentRecipe, 'function');
  assert.equal(typeof EditorSession.prototype.batchSyncVignette, 'function');
  assert.notEqual(EditorSession.prototype.batchSyncVignette, EditorSession.prototype.batchApplyCurrentRecipe);
});
