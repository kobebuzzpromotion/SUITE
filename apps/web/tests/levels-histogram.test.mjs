import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLevelsHistogram, selectLevelsHistogramChannel} from '../src/processing/levels-histogram.mjs';
import {analyzeHistogram} from '../src/processing/histogram.mjs';

function image(width, height, values) {
  return {width, height, data: new Uint8ClampedArray(values.flat())};
}

test('LEVELS-HIST01: RGB channels and Master 256-bin sums include nonzero alpha exactly once', () => {
  const pixels = image(2, 2, [
    [0, 10, 20, 255], [10, 10, 30, 1],
    [200, 200, 200, 0], [255, 20, 30, 128],
  ]);
  const before = pixels.data.slice();
  const result = analyzeLevelsHistogram(pixels, {sample: {x: 1, y: 0}});
  assert.deepEqual([result.width, result.height], [2, 2]);
  assert.equal(result.includedPixels, 3);
  assert.equal(result.ignoredTransparentPixels, 1);
  assert.equal(result.bins.red[0], 1);
  assert.equal(result.bins.red[10], 1);
  assert.equal(result.bins.red[255], 1);
  assert.equal(result.bins.green[10], 2);
  assert.equal(result.bins.blue[30], 2);
  assert.equal(result.bins.master[10], 3);
  assert.equal(result.bins.master[200], 0);
  for (const channel of ['red', 'green', 'blue'])
    assert.equal(result.bins[channel].reduce((sum, count) => sum + count, 0), 3);
  assert.equal(result.bins.master.reduce((sum, count) => sum + count, 0), 9);
  assert.deepEqual(result.sample, {x: 1, y: 0, red: 10, green: 10, blue: 30,
    alpha: 1, included: true});
  assert.deepEqual(pixels.data, before);
});

test('LEVELS-HIST02: Master/Red/Green/Blue switch uses one analysis and correct sample values', () => {
  const result = analyzeLevelsHistogram(image(1, 1, [[17, 90, 240, 255]]),
    {sample: {x: 0, y: 0}});
  const master = selectLevelsHistogramChannel(result);
  assert.equal(master.channel, 'master');
  assert.equal(master.peakCount, 1);
  assert.equal(master.countBasis, 'RGB-channel-votes');
  assert.deepEqual(master.selectedSample, {red: 17, green: 90, blue: 240});
  for (const [channel, expected] of [['red', 17], ['green', 90], ['blue', 240]]) {
    const view = selectLevelsHistogramChannel(result, channel);
    assert.equal(view.bins[expected], 1);
    assert.equal(view.selectedSample, expected);
    assert.equal(view.countBasis, 'pixels');
    assert.strictEqual(view.bins, result.bins[channel]);
  }
});

test('LEVELS-HIST03: transparent preview and transparent sampled pixel have no displayed value', () => {
  const pixels = image(1, 1, [[250, 15, 100, 0]]);
  const result = analyzeLevelsHistogram(pixels, {sample: {x: 0, y: 0}});
  for (const channel of ['master', 'red', 'green', 'blue']) {
    const view = selectLevelsHistogramChannel(result, channel);
    assert.equal(view.peakCount, 0);
    assert.equal(view.selectedSample, null);
  }
  assert.equal(result.sample.included, false);
  assert.equal(result.includedPixels, 0);
  assert.equal(result.ignoredTransparentPixels, 1);
});

test('LEVELS-HIST04: invalid channel, point, RGBA8 frame, oversize and abort fail closed', () => {
  const pixels = image(1, 1, [[1, 2, 3, 255]]), before = pixels.data.slice();
  for (const sample of [{x: -1, y: 0}, {x: 0.5, y: 0}, {x: 0, y: 1},
    {x: 0, y: 0, extra: true}])
    assert.throws(() => analyzeLevelsHistogram(pixels, {sample}),
      /LEVELS_HISTOGRAM_SAMPLE_INVALID/);
  assert.throws(() => selectLevelsHistogramChannel(analyzeLevelsHistogram(pixels), 'luma'),
    /LEVELS_HISTOGRAM_CHANNEL_INVALID/);
  assert.throws(() => selectLevelsHistogramChannel({}, 'red'), /LEVELS_HISTOGRAM_INVALID/);
  assert.throws(() => analyzeLevelsHistogram({width: 5000, height: 5000,
    data: new Uint8ClampedArray(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => analyzeLevelsHistogram(pixels, {signal: {aborted: true}}),
    {name: 'AbortError'});
  assert.deepEqual(pixels.data, before);
});

test('LEVELS-HIST05: preview analysis can be reused without a second pixel scan', () => {
  const pixels=image(2,1,[[12,56,234,255],[200,10,90,0]]);
  const precomputed=analyzeHistogram(pixels,{includeMask:true});
  const reused=analyzeLevelsHistogram(pixels,{precomputed});
  const standalone=analyzeLevelsHistogram(pixels);
  for(const channel of ['master','red','green','blue'])
    assert.deepEqual(reused.bins[channel],standalone.bins[channel]);
  assert.equal(reused.includedPixels,1);
  assert.equal(Object.hasOwn(reused,'mask'),false);
  assert.throws(()=>analyzeLevelsHistogram(pixels,{precomputed:{...precomputed,width:3}}),/LEVELS_HISTOGRAM_PRECOMPUTED_INVALID/);
});
