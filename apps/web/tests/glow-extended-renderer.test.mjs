import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyGlow, createGlowMaskOverlay} from '../src/processing/glow.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

function frame() {
  const width = 21, height = 21;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data.set([33 + x, 38 + y, 45 + (x + y) % 17, 255], i);
  }
  data.set([240, 230, 220, 255], (10 * width + 10) * 4);
  data.set([220, 210, 190, 255], (6 * width + 15) * 4);
  data.set([250, 40, 180, 0], 0); // Hidden RGB must not illuminate neighbors.
  return {width, height, data};
}

function recipe(glow) {
  return {schemaVersion: 1, parameters: {
    exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: {postDecodeAdjustments: {
      schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1', color: {glow},
    }},
    processingOrder: ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation'],
  }};
}

const render = (pixels, glow, signal) => renderPixels(pixels, recipe(glow),
  {validateRecipe, resolutionAssessment, signal});

test('GLOW-RENDER01: old three-control Recipe remains byte-identical to the legacy Glow path', () => {
  const source = frame(), original = source.data.slice();
  const legacy = {intensity: 75, radius: 3, threshold: 140};
  const baseline = render(source, {intensity: 0});
  const expected = applyGlow(baseline, legacy);
  const actual = render(source, legacy);
  assert.deepEqual(actual.data, expected.data);
  assert.deepEqual(actual.data.slice(0, 4), original.slice(0, 4));
  assert.deepEqual(source.data, original);
});

test('GLOW-RENDER02: each mode and Exposure/Diffusion/Tint reaches Final pixels', () => {
  const source = frame(), original = source.data.slice();
  const common = {intensity: 95, radius: 2, threshold: 115,
    mode: 'whiteMist', exposure: 0, diffusion: 0, tint: 0};
  const baseline = render(source, common);
  for (const change of [
    {mode: 'blackMist'}, {mode: 'halation'},
    {exposure: -100}, {exposure: 100}, {diffusion: 100}, {tint: -100}, {tint: 100},
  ]) {
    const settings = {...common, ...change};
    const actual = render(source, settings);
    assert.deepEqual(actual.data, applyGlow(source, settings).data,
      `${Object.keys(change)[0]} must use the complete saved object`);
    assert.notDeepEqual(actual.data, baseline.data,
      `${Object.keys(change)[0]} must have a visible Final result`);
    assert.deepEqual([actual.width, actual.height], [source.width, source.height]);
    assert.deepEqual(actual.data.slice(0, 4), original.slice(0, 4));
  }
  assert.deepEqual(source.data, original);
});

test('GLOW-RENDER03: preview-only Glow Mask never enters Final or mutates source', () => {
  const source = frame(), original = source.data.slice();
  const settings = {intensity: 95, radius: 2, threshold: 100,
    mode: 'halation', exposure: 35, diffusion: 30, tint: 40};
  const beforeMask = render(source, settings);
  const mask = createGlowMaskOverlay(source, settings);
  assert.ok(mask.data.some((value, i) => i % 4 === 3 && value > 0));
  assert.deepEqual(render(source, settings).data, beforeMask.data);
  assert.deepEqual(source.data, original);
  assert.throws(() => render(source, {...settings, showGlowMask: true}),
    /INVALID_POST_DECODE_ADJUSTMENTS/);
});

test('GLOW-RENDER04: invalid extended Recipe and aborted render leave source intact', () => {
  const source = frame(), original = source.data.slice();
  const glow = {intensity: 50, mode: 'whiteMist', diffusion: 50};
  assert.throws(() => render(source, {...glow, tint: 101}), /INVALID_POST_DECODE_RANGE/);
  assert.throws(() => render(source, glow, {aborted: true}), {name: 'AbortError'});
  assert.deepEqual(source.data, original);
});
