import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGlow, validateGlow, GLOW_ALGORITHM_VERSION} from '../src/processing/glow.mjs';

const image = (width, height, fill = [0, 0, 0, 255]) => ({width, height,
  data: new Uint8ClampedArray(Array.from({length: width * height}, () => fill).flat())});
const pixel = (frame, x, y) => Array.from(frame.data.slice((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 4));
const set = (frame, x, y, rgba) => frame.data.set(rgba, (y * frame.width + x) * 4);

test('GLOW01: intensity 0 is a detached byte identity; metadata, alpha and source frame remain exact', () => {
  assert.equal(GLOW_ALGORITHM_VERSION, 'suite-srgb8-highlight-glow-1');
  const frame = image(3, 2, [40, 80, 120, 80]);
  set(frame, 1, 1, [255, 240, 220, 0]);
  frame.sourceWidth = 12; frame.sourceHeight = 8;
  const before = frame.data.slice();
  for (const input of [{}, {intensity: 0, radius: 64, threshold: 0}]) {
    const result = applyGlow(frame, input);
    assert.deepEqual(result.data, before);
    assert.notEqual(result.data, frame.data);
    assert.deepEqual([result.sourceWidth, result.sourceHeight], [12, 8]);
  }
  assert.deepEqual(frame.data, before);
  const params = validateGlow(); params.intensity = 80;
  assert.equal(validateGlow().intensity, 0);
});

test('GLOW02: a visible highlight blooms into adjacent dark pixels but not far background', () => {
  const frame = image(9, 9);
  set(frame, 4, 4, [255, 255, 255, 255]);
  const result = applyGlow(frame, {intensity: 100, radius: 1, threshold: 180});
  assert.ok(pixel(result, 4, 3)[0] > 0);
  assert.ok(pixel(result, 3, 4)[0] > 0);
  assert.deepEqual(pixel(result, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(result, 4, 4), [255, 255, 255, 255]);
  assert.deepEqual(frame.data.slice((4 * 9 + 3) * 4, (4 * 9 + 3) * 4 + 4), new Uint8ClampedArray([0, 0, 0, 255]));
});

test('GLOW03: intensity and threshold alter halo predictably; below-threshold frame stays exact', () => {
  const frame = image(7, 7);
  set(frame, 3, 3, [255, 255, 255, 255]);
  const low = applyGlow(frame, {intensity: 20, radius: 1, threshold: 180});
  const high = applyGlow(frame, {intensity: 100, radius: 1, threshold: 180});
  assert.ok(pixel(high, 3, 2)[0] > pixel(low, 3, 2)[0]);
  assert.deepEqual(applyGlow(frame, {intensity: 100, radius: 1, threshold: 255}).data, frame.data);
  const dark = image(7, 7, [80, 80, 80, 255]);
  assert.deepEqual(applyGlow(dark, {intensity: 100, radius: 1, threshold: 200}).data, dark.data);
});

test('GLOW04: fully transparent hidden RGB never emits glow or changes; partial alpha scales contribution', () => {
  const hidden = image(7, 7);
  set(hidden, 3, 3, [255, 255, 255, 0]);
  const fromHidden = applyGlow(hidden, {intensity: 100, radius: 1, threshold: 180});
  assert.deepEqual(pixel(fromHidden, 3, 3), [255, 255, 255, 0]);
  assert.deepEqual(pixel(fromHidden, 3, 2), [0, 0, 0, 255]);
  const half = image(7, 7); set(half, 3, 3, [255, 255, 255, 128]);
  const full = image(7, 7); set(full, 3, 3, [255, 255, 255, 255]);
  const partial = applyGlow(half, {intensity: 100, radius: 1, threshold: 180});
  const opaque = applyGlow(full, {intensity: 100, radius: 1, threshold: 180});
  assert.ok(pixel(partial, 3, 2)[0] > 0);
  assert.ok(pixel(partial, 3, 2)[0] < pixel(opaque, 3, 2)[0]);
  assert.equal(pixel(partial, 3, 3)[3], 128);
});

test('GLOW05: radius changes spatial reach and processing is deterministic', () => {
  const frame = image(21, 21);
  set(frame, 10, 10, [255, 255, 255, 255]);
  const small = applyGlow(frame, {intensity: 100, radius: 1, threshold: 180});
  const wide = applyGlow(frame, {intensity: 100, radius: 3, threshold: 180});
  assert.equal(pixel(small, 10, 13)[0], 0);
  assert.ok(pixel(wide, 10, 13)[0] > 0);
  assert.deepEqual(applyGlow(frame, {intensity: 100, radius: 3, threshold: 180}).data, wide.data);
  for (let k = 3; k < wide.data.length; k += 4) assert.equal(wide.data[k], frame.data[k]);
});

test('GLOW06: invalid params and frames fail closed without editing input', () => {
  const frame = image(3, 3, [120, 130, 140, 220]); const before = frame.data.slice();
  for (const bad of [null, [], new Date(), {mode: 'AI'}, {intensity: -1}, {intensity: 101},
    {intensity: NaN}, {intensity: Infinity}, {intensity: '4'}, {radius: 0}, {radius: 65},
    {radius: 2.5}, {threshold: -1}, {threshold: 256}, {threshold: 4.5}])
    assert.throws(() => applyGlow(frame, bad), undefined, String(bad));
  assert.deepEqual(frame.data, before);
  assert.throws(() => applyGlow({width: 24_000_001, height: 1, data: new Uint8ClampedArray(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyGlow({width: 1, height: 1, data: new Uint8Array(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
});

test('GLOW07: thin boundary frame and moderate raster stay in-bounds and deterministic', () => {
  const thin = image(1, 9); set(thin, 0, 4, [255, 255, 255, 255]);
  const first = applyGlow(thin, {intensity: 100, radius: 64, threshold: 180});
  assert.equal(first.data.length, thin.data.length);
  assert.deepEqual(applyGlow(thin, {intensity: 100, radius: 64, threshold: 180}).data, first.data);
  const moderate = image(512, 128, [100, 100, 100, 180]);
  set(moderate, 256, 64, [255, 255, 255, 255]);
  const output = applyGlow(moderate, {intensity: 40, radius: 24, threshold: 150});
  assert.equal(output.data.length, moderate.data.length);
  assert.notEqual(output.data, moderate.data);
  assert.equal(pixel(output, 256, 64)[3], 255);
});

test('GLOW08: preflight and mid-frame cancellation leave original untouched', () => {
  const frame = image(16385, 1, [200, 200, 200, 255]); const before = frame.data.slice();
  assert.throws(() => applyGlow(frame, {intensity: 50}, {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks >= 4;}};
  assert.throws(() => applyGlow(frame, {intensity: 50}, {signal}), {name: 'AbortError'});
  assert.ok(checks >= 4);
  assert.deepEqual(frame.data, before);
});
