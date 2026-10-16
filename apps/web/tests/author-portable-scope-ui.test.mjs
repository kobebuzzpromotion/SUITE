import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AUTHOR_PORTABLE_SCOPE_NOTE, globalPresetRecipe} from '../src/author-ui.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portableParameters, checkParameters} from '../preset-policy.mjs';
import {recipe} from './fixtures.mjs';

test('AUTHOR-SCOPE01: author safety note is rendered from one current portable scope copy', async () => {
  const source = await readFile(new URL('../src/author-ui.mjs', import.meta.url), 'utf8');
  assert.match(source, /<p class="safety-note">\$\{AUTHOR_PORTABLE_SCOPE_NOTE\}<\/p>/);
  assert.doesNotMatch(source, /保存対象は露出・コントラスト・彩度、および実画素処理に接続済みの局所トーン/);
  assert.equal(globalPresetRecipe, portablePresetRecipe);
  for (const label of ['露出', 'コントラスト', '彩度', 'Temperature/Tint',
    'Highlights/Shadows/Whites/Blacks/Vibrance', 'HSL', 'RGB Levels',
    'Point Curves', 'Parametric Tone Curve', 'Selective Color', 'Color Calibration',
    'Glow', 'Clarity/Texture/Sharpness/Denoise/Grain']) {
    assert.ok(AUTHOR_PORTABLE_SCOPE_NOTE.includes(label), label);
  }
  for (const refused of ['RAW段階WB', '人物', 'Mask', '回転', 'Crop', 'Export', '未知調整']) {
    assert.ok(AUTHOR_PORTABLE_SCOPE_NOTE.includes(refused), refused);
  }
  assert.match(AUTHOR_PORTABLE_SCOPE_NOTE, /保存済みRecipe/);
  assert.match(AUTHOR_PORTABLE_SCOPE_NOTE, /未接続項目を実装済みとは扱いません/);
});

test('AUTHOR-SCOPE02: every named portable branch is accepted together without silently dropping fields', () => {
  const body = recipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {
      temperature: 12, tint: -5, highlights: 1, shadows: 2, whites: 3, blacks: 4, vibrance: 5,
      hsl: {red: {hue: 6}}, levels: {master: {gamma: 1.2}},
      pointCurves: {master: [{x: 0, y: 0}, {x: 255, y: 255}]},
      toneCurve: {midtones: 7}, selectiveColor: {ranges: {reds: {cyan: 8}}},
      calibration: {red: {hue: 9}}, glow: {intensity: 10},
    },
    detail: {clarity: 11, texture: 12, sharpness: 13, denoise: 14,
      grain: {amount: 15, seed: 16}},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  const copy = structuredClone(body), portable = portableParameters(body);
  assert.deepEqual(portable.postDecodeAdjustments,
    body.parameters.extendedParameters.postDecodeAdjustments);
  assert.deepEqual(checkParameters(portable), portable);
  assert.deepEqual(body, copy);
});

test('AUTHOR-SCOPE03: excluded photo-local settings refuse rather than being stripped', () => {
  for (const field of ['crop', 'portrait', 'export', 'canvasExpand', 'postCropAdjustments']) {
    const body = recipe();
    body.parameters.extendedParameters[field] = {};
    assert.throws(() => globalPresetRecipe(body), /PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
  }
});
