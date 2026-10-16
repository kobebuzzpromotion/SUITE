import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGrain, validateGrainSettings, GRAIN_EXTENDED_ALGORITHM_VERSION} from '../src/processing/grain.mjs';

function gray(width, height, value = 128, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, alpha], i);
  return {width, height, data};
}

function regionError(result, source, yStart, yEnd) {
  let error = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      error += Math.abs(result.data[offset] - source.data[offset]);
    }
  }
  return error;
}

test('GRAIN-EXT01 / SYNTHETIC: object defaults retain legacy Amount+Seed exact pixels and a zero Amount is identity', () => {
  const input = gray(87, 61);
  input.data.set([16, 42, 99, 0], 4);
  const legacy = applyGrain(input, 76.5, {seed: 123});
  const extended = applyGrain(input, {amount: 76.5}, {seed: 123});
  assert.equal(GRAIN_EXTENDED_ALGORITHM_VERSION, 'suite-srgb8-tonal-film-grain-1');
  assert.deepEqual(extended, legacy);
  const zero = applyGrain(input, {amount: 0, shadows: 0, midtones: 0, highlights: 0,
    size: 100, roughness: 100, colorVariation: 100}, {seed: 123});
  assert.deepEqual(zero, input);
  assert.notStrictEqual(zero.data, input.data);
});

test('GRAIN-EXT02 / SYNTHETIC: Shadows/Midtones/Highlights independently attenuate their tonal regions', () => {
  const input = gray(60, 90);
  for (let y = 0; y < 90; y++) {
    const value = y < 30 ? 24 : y < 60 ? 128 : 235;
    for (let x = 0; x < 60; x++) input.data.fill(value, (y * 60 + x) * 4, (y * 60 + x) * 4 + 3);
  }
  const baseline = applyGrain(input, {amount: 85}, {seed: 404});
  const cases = [
    ['shadows', 0, 30], ['midtones', 30, 60], ['highlights', 60, 90],
  ];
  for (const [field, start, end] of cases) {
    const modified = applyGrain(input, {amount: 85, [field]: 0}, {seed: 404});
    assert.ok(regionError(baseline, input, start, end) > 1000, `${field} has baseline texture`);
    assert.ok(regionError(modified, input, start, end) < regionError(baseline, input, start, end) / 3,
      `${field} actually reduces grain in its own tonal region`);
    for (const [other, otherStart, otherEnd] of cases) {
      if (other !== field) assert.ok(regionError(modified, input, otherStart, otherEnd) > 0,
        `${other} remains textured when ${field} is zero`);
    }
  }
});

test('GRAIN-EXT03 / SYNTHETIC: Size changes particle scale, not merely a label', () => {
  const input = gray(100, 100);
  const fine = applyGrain(input, {amount: 90, size: 0}, {seed: 51});
  const coarse = applyGrain(input, {amount: 90, size: 100}, {seed: 51});
  assert.notDeepEqual(coarse.data, fine.data);
  const adjacentDifference = output => {
    let difference = 0;
    for (let y = 0; y < output.height; y++) for (let x = 1; x < output.width; x++) {
      const index = (y * output.width + x) * 4;
      difference += Math.abs(output.data[index] - output.data[index - 4]);
    }
    return difference;
  };
  assert.ok(adjacentDifference(coarse) < adjacentDifference(fine) / 2,
    'larger particles are spatially more correlated');
});

test('GRAIN-EXT04 / SYNTHETIC: Roughness changes pixel texture even at smallest Size', () => {
  const input = gray(100, 80);
  const smooth = applyGrain(input, {amount: 65, roughness: 0}, {seed: 17});
  const rough = applyGrain(input, {amount: 65, roughness: 100}, {seed: 17});
  assert.notDeepEqual(rough.data, smooth.data);
  assert.ok(regionError(rough, input, 0, input.height) > regionError(smooth, input, 0, input.height),
    'higher roughness increases fine texture contrast');
});

test('GRAIN-EXT05 / SYNTHETIC: Color Variation creates chroma texture while approximately preserving luma', () => {
  const input = gray(80, 60);
  const mono = applyGrain(input, {amount: 70, colorVariation: 0}, {seed: 92});
  const chroma = applyGrain(input, {amount: 70, colorVariation: 100}, {seed: 92});
  let colored = 0;
  for (let i = 0; i < chroma.data.length; i += 4) {
    assert.equal(mono.data[i], mono.data[i + 1]);
    assert.equal(mono.data[i + 1], mono.data[i + 2]);
    if (chroma.data[i] !== chroma.data[i + 1] || chroma.data[i + 1] !== chroma.data[i + 2]) colored++;
    const luminance = data => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    assert.ok(Math.abs(luminance(chroma.data) - luminance(mono.data)) <= 1.5);
  }
  assert.ok(colored > 2000, 'many pixels have visible color variation');
});

test('GRAIN-EXT06 / SYNTHETIC: deterministic seed, alpha/hidden RGB and original frame stay intact', () => {
  const input = {...gray(32, 8), sourceWidth: 64, sourceHeight: 16};
  input.data.set([20, 99, 180, 0], 4);
  input.data.set([80, 100, 120, 1], 8);
  const original = input.data.slice();
  const settings = {amount: 80, shadows: 25, midtones: 75, highlights: 40,
    size: 55, roughness: 65, colorVariation: 70};
  const a = applyGrain(input, settings, {seed: 333});
  const b = applyGrain(input, settings, {seed: 333});
  const c = applyGrain(input, settings, {seed: 334});
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.data, c.data);
  assert.deepEqual(input.data, original);
  assert.deepEqual([...a.data.slice(4, 8)], [20, 99, 180, 0]);
  assert.equal(a.data[11], 1);
  assert.equal(a.sourceWidth, 64);
  assert.equal(a.sourceHeight, 16);
  const hiddenAltered = input.data.slice();
  hiddenAltered.set([255, 0, 0, 0], 4);
  const changedHidden = applyGrain({...input, data: hiddenAltered}, settings, {seed: 333});
  assert.deepEqual([...changedHidden.data.slice(0, 4)], [...a.data.slice(0, 4)]);
  assert.deepEqual([...changedHidden.data.slice(8)], [...a.data.slice(8)]);
});

test('GRAIN-EXT07 / SYNTHETIC: finite control boundaries accepted; unknown or invalid values rejected', () => {
  const input = gray(1, 1);
  for (const field of ['amount', 'shadows', 'midtones', 'highlights', 'size', 'roughness', 'colorVariation']) {
    assert.equal(validateGrainSettings({[field]: 0})[field], 0);
    assert.equal(validateGrainSettings({[field]: 100})[field], 100);
    for (const value of [-0.1, 100.1, NaN, Infinity, '50', null])
      assert.throws(() => applyGrain(input, {[field]: value}), /INVALID_GRAIN_(AMOUNT|SETTING_RANGE)/);
  }
  for (const invalid of [{extra: 1}, [], new (class Grain {constructor() {this.amount = 3;}})(),
    {[Symbol('hidden')]: 1}]) assert.throws(() => applyGrain(input, invalid), /INVALID_GRAIN_SETTINGS/);
  for (const seed of [-1, 0x100000000, NaN, '1'])
    assert.throws(() => applyGrain(input, {amount: 20}, {seed}), /INVALID_GRAIN_SEED/);
});

test('GRAIN-EXT08 / SYNTHETIC: thin frames and cancellation remain bounded', () => {
  for (const input of [gray(1, 1), gray(1, 30), gray(30, 1)]) {
    const output = applyGrain(input, {amount: 100, size: 100, roughness: 100, colorVariation: 100}, {seed: 0xffffffff});
    assert.equal(output.data.length, input.data.length);
    assert.equal(output.width, input.width);
    assert.equal(output.height, input.height);
  }
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => applyGrain(gray(2, 2), {amount: 50}, {signal: controller.signal}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks > 5;}};
  assert.throws(() => applyGrain(gray(2, 12), {amount: 50, size: 80}, {signal}), {name: 'AbortError'});
  assert.ok(checks > 5);
});
