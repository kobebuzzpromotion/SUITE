import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateHistogramToneDrag, HISTOGRAM_TONE_REGIONS} from '../src/histogram-tone-drag.mjs';

const drag = (region, startValue, deltaX, dragWidth = 200) =>
  calculateHistogramToneDrag({region, startValue, deltaX, dragWidth});

test('HIST-DRAG-01 / CONTRACT: five regions target existing session keys and ranges', () => {
  assert.deepEqual(Object.keys(HISTOGRAM_TONE_REGIONS), ['blacks', 'shadows', 'exposure', 'highlights', 'whites']);
  for (const [region, config] of Object.entries(HISTOGRAM_TONE_REGIONS)) {
    assert.deepEqual(drag(region, 0, 0), {key: config.key, value: 0});
    assert.deepEqual(drag(region, 0, 25), {key: config.key, value: region === 'exposure' ? 1 : 25});
    assert.deepEqual(drag(region, 0, -25), {key: config.key, value: region === 'exposure' ? -1 : -25});
    assert.deepEqual(drag(region.toUpperCase(), 0, 25), drag(region, 0, 25));
  }
});

test('HIST-DRAG-02 / CONTRACT: right increases, left decreases, values clamp at the existing endpoints', () => {
  for (const [region, config] of Object.entries(HISTOGRAM_TONE_REGIONS)) {
    assert.equal(drag(region, 0, 10_000).value, config.max);
    assert.equal(drag(region, 0, -10_000).value, config.min);
    assert.equal(drag(region, config.max, 1).value, config.max);
    assert.equal(drag(region, config.min, -1).value, config.min);
  }
});

test('HIST-DRAG-03 / CONTRACT: movement is normalized by caller-provided image or region width', () => {
  assert.deepEqual(drag('Exposure', 0, 20, 160), drag('Exposure', 0, 50, 400));
  assert.equal(drag('Shadows', 15, 10, 100).value, 35);
  assert.equal(drag('Shadows', 15, 10, 200).value, 25);
  assert.equal(drag('Exposure', 0, 1, 160).value, 0.1);
  assert.equal(drag('Exposure', 0, -1, 160).value, -0.1);
});

test('HIST-DRAG-04 / CONTRACT: zero movement preserves a valid starting value and repeated calls are deterministic', () => {
  const input = {region: 'exposure', startValue: 1.23, deltaX: 0, dragWidth: 150};
  assert.deepEqual(calculateHistogramToneDrag(input), {key: 'exposure', value: 1.23});
  const before = {...input};
  const first = calculateHistogramToneDrag({...input, deltaX: -20});
  const second = calculateHistogramToneDrag({...input, deltaX: -20});
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Number((first.value * 10).toFixed(8)) % 1, 0);
});

test('HIST-DRAG-05 / CONTRACT: invalid region, nonfinite, out-of-range start and zero/negative width reject', () => {
  for (const input of [
    undefined, {}, {region: 'midtones', startValue: 0, deltaX: 1, dragWidth: 100},
    {region: 'blacks', startValue: 101, deltaX: 1, dragWidth: 100},
    {region: 'exposure', startValue: -5, deltaX: 1, dragWidth: 100},
    {region: 'whites', startValue: NaN, deltaX: 1, dragWidth: 100},
    {region: 'whites', startValue: 0, deltaX: NaN, dragWidth: 100},
    {region: 'whites', startValue: 0, deltaX: Infinity, dragWidth: 100},
    {region: 'whites', startValue: 0, deltaX: 1, dragWidth: 0},
    {region: 'whites', startValue: 0, deltaX: 1, dragWidth: -1},
    {region: 'whites', startValue: 0, deltaX: 1, dragWidth: Infinity},
  ]) assert.throws(() => calculateHistogramToneDrag(input), /INVALID_HISTOGRAM_TONE_DRAG/);
});
