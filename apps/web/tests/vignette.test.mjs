import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVignette, validateVignetteAmount} from '../src/processing/vignette.mjs';

// Synthetic display-referred RGBA only; not a RAW/lens-profile/device QA claim.
const field = (width = 5, height = 5, value = 128) => ({width, height,
  data: new Uint8ClampedArray(Array.from({length: width * height}, () => [value, value, value, 173]).flat())});
const pixel = (result, x, y) => [...result.data.slice((y * result.width + x) * 4, (y * result.width + x) * 4 + 4)];

test('VIG01 / SYNTHETIC: neutral effect copies data, preserves alpha/source dimensions and never aliases original', () => {
  const input = {...field(), sourceWidth: 10, sourceHeight: 10};
  const output = applyVignette(input, 0);
  assert.deepEqual(output.data, input.data);
  assert.notEqual(output.data, input.data);
  assert.equal(output.sourceWidth, 10);
  assert.equal(output.sourceHeight, 10);
});

test('VIG02 / SYNTHETIC: negative darkens and positive brightens corners, not center', () => {
  const input = field(), before = input.data.slice();
  const dark = applyVignette(input, -100), light = applyVignette(input, 100);
  assert.ok(pixel(dark, 0, 0)[0] < 128);
  assert.ok(pixel(light, 0, 0)[0] > 128);
  assert.deepEqual(pixel(dark, 2, 2), [128, 128, 128, 173]);
  assert.deepEqual(pixel(light, 2, 2), [128, 128, 128, 173]);
  assert.equal(pixel(dark, 0, 0)[3], 173);
  assert.deepEqual(input.data, before);
});

test('VIG03 / SYNTHETIC: radial symmetry, one-pixel identity and thin-image behavior', () => {
  const output = applyVignette(field(), -80);
  assert.deepEqual(pixel(output, 0, 0), pixel(output, 4, 0));
  assert.deepEqual(pixel(output, 0, 0), pixel(output, 0, 4));
  assert.deepEqual(pixel(output, 0, 0), pixel(output, 4, 4));
  assert.deepEqual(applyVignette(field(1, 1), 100).data, field(1, 1).data);
  assert.ok(pixel(applyVignette(field(1, 5), -100), 0, 0)[0] < 128);
});

test('VIG04 / SYNTHETIC: transparent hidden RGB does not influence visible neighboring pixels', () => {
  const left = field(3, 1), right = field(3, 1);
  left.data.set([255, 0, 0, 0], 0);
  right.data.set([0, 0, 255, 0], 0);
  const a = applyVignette(left, -100), b = applyVignette(right, -100);
  assert.deepEqual(pixel(a, 1, 0), pixel(b, 1, 0));
  assert.deepEqual(pixel(a, 0, 0), [255, 0, 0, 0]);
  assert.deepEqual(pixel(b, 0, 0), [0, 0, 255, 0]);
});

test('VIG05 / SYNTHETIC: rejects non-finite/out-of-range, oversize input, and aborts without source mutation', () => {
  const input = field(), before = input.data.slice();
  for (const bad of [-101, 101, NaN, Infinity, -Infinity, '10', null]) {
    assert.throws(() => validateVignetteAmount(bad));
    assert.throws(() => applyVignette(input, bad));
  }
  assert.throws(() => validateVignetteAmount(undefined));
  assert.throws(() => applyVignette({width: 24_000_001, height: 1, data: new Uint8ClampedArray(4)}, 10), /OVERSIZE/);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => applyVignette(input, 10, {signal: controller.signal}), {name: 'AbortError'});
  assert.deepEqual(input.data, before);
});
