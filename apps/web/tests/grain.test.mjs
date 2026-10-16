import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGrain, GRAIN_ALGORITHM_VERSION} from '../src/processing/grain.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

function gray(width, height, value = 128) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 255], i);
  return {width, height, data};
}

test('GRAIN-01 / SYNTHETIC: neutral amount is a non-aliasing identity including alpha and source dimensions', () => {
  const input = {...gray(3, 2), sourceWidth: 6, sourceHeight: 4};
  input.data.set([201, 12, 99, 0], 4);
  const result = applyGrain(input, 0, {seed: 123});
  assert.equal(GRAIN_ALGORITHM_VERSION, 'suite-srgb8-monochrome-grain-1');
  assert.deepEqual(result, input);
  assert.notStrictEqual(result.data, input.data);
  result.data[0] = 0;
  assert.equal(input.data[0], 128);
});

test('GRAIN-02 / SYNTHETIC: same source and seed reproduce added grain; a different seed changes it', () => {
  const input = gray(120, 80);
  const before = input.data.slice();
  const one = applyGrain(input, 80, {seed: 87654321});
  const again = applyGrain(input, 80, {seed: 87654321});
  const different = applyGrain(input, 80, {seed: 87654322});
  assert.deepEqual(one.data, again.data);
  assert.notDeepEqual(one.data, different.data);
  assert.notDeepEqual(one.data, before);
  assert.deepEqual(input.data, before);
  const values = new Set(Array.from({length: input.width * input.height}, (_, i) => one.data[i * 4]));
  assert.ok(values.size > 20, 'added texture has varied luminance');
});

test('GRAIN-03 / SYNTHETIC: grain is monochrome, alpha is unchanged, transparent hidden RGB cannot leak', () => {
  const input = gray(3, 1);
  input.data.set([15, 45, 75, 255], 0);
  input.data.set([255, 0, 127, 0], 4);
  input.data.set([90, 90, 90, 1], 8);
  const result = applyGrain(input, 100, {seed: 99});
  assert.deepEqual([...result.data.slice(4, 8)], [255, 0, 127, 0]);
  assert.deepEqual([result.data[3], result.data[7], result.data[11]], [255, 0, 1]);
  assert.equal(result.data[0] - input.data[0], result.data[1] - input.data[1]);
  assert.equal(result.data[1] - input.data[1], result.data[2] - input.data[2]);
  const hiddenChanged = input.data.slice();
  hiddenChanged.set([1, 2, 3, 0], 4);
  const second = applyGrain({...input, data: hiddenChanged}, 100, {seed: 99});
  assert.deepEqual([...second.data.slice(0, 4)], [...result.data.slice(0, 4)]);
  assert.deepEqual([...second.data.slice(8, 12)], [...result.data.slice(8, 12)]);
});

test('GRAIN-04 / SYNTHETIC: one-pixel and thin rasters remain valid and clamp to RGBA8 bounds', () => {
  for (const input of [gray(1, 1, 0), gray(1, 100, 255), gray(100, 1, 128)]) {
    const result = applyGrain(input, 100, {seed: 0xffffffff});
    assert.equal(result.data.length, input.data.length);
    assert.equal(result.width, input.width);
    assert.equal(result.height, input.height);
    for (let i = 0; i < result.data.length; i += 4) {
      assert.ok(result.data[i] >= 0 && result.data[i] <= 255);
      assert.equal(result.data[i + 3], input.data[i + 3]);
    }
  }
});

test('GRAIN-05 / SYNTHETIC: invalid amount, seed, pixel layout, and source dimensions fail closed', () => {
  const input = gray(2, 2);
  for (const amount of [-1, 101, NaN, Infinity, '50']) {
    assert.throws(() => applyGrain(input, amount), /INVALID_GRAIN_AMOUNT/);
  }
  for (const seed of [-1, 0x100000000, 1.2, NaN, 'a']) {
    assert.throws(() => applyGrain(input, 50, {seed}), /INVALID_GRAIN_SEED/);
  }
  for (const invalid of [
    {width: 0, height: 1, data: new Uint8ClampedArray(0)},
    {width: 2, height: 2, data: new Uint8Array(16)},
    {width: MAX_PIXELS + 1, height: 1, data: new Uint8ClampedArray(4)},
  ]) assert.throws(() => applyGrain(invalid, 1), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyGrain({...input, sourceWidth: 1, sourceHeight: 2}, 1), /INVALID_SOURCE_FRAME/);
});

test('GRAIN-06 / SYNTHETIC: cancellation is checked before and during a linear scan', () => {
  const input = gray(2, 10);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => applyGrain(input, 50, {signal: controller.signal}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks > 5;}};
  assert.throws(() => applyGrain(input, 50, {signal}), {name: 'AbortError'});
  assert.ok(checks > 5);
  let wideChecks = 0;
  const wideSignal = {get aborted() {return ++wideChecks > 2;}};
  assert.throws(() => applyGrain(gray(40_000, 1), 50, {signal: wideSignal}), {name: 'AbortError'});
});

test('GRAIN-07 / SYNTHETIC: large raster uses bounded one-output-buffer memory and processes all rows', () => {
  const input = gray(1000, 200);
  const result = applyGrain(input, 50, {seed: 42});
  assert.equal(result.data.length, input.data.length);
  assert.notDeepEqual(result.data.subarray(0, 4000), input.data.subarray(0, 4000));
  assert.notDeepEqual(result.data.subarray(-4000), input.data.subarray(-4000));
  assert.ok(result.data.every((value, index) => index % 4 !== 3 || value === 255));
});
