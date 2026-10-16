import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHistogram, CLIPPING_MASK} from '../src/processing/histogram.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

const pixels = (...rgba) => ({
  width: rgba.length,
  height: 1,
  data: new Uint8ClampedArray(rgba.flat()),
});
const sum = bins => bins.reduce((total, count) => total + count, 0);

test('HIST-01 / SYNTHETIC: RGB and display-luma bins exclude transparent hidden RGB', () => {
  const input = pixels([0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 0, 255, 0]);
  const before = input.data.slice();
  const result = analyzeHistogram(input);
  assert.equal(result.includedPixels, 3);
  assert.equal(result.ignoredTransparentPixels, 1);
  assert.equal(result.bins.red[0], 1);
  assert.equal(result.bins.red[255], 2);
  assert.equal(result.bins.green[0], 2);
  assert.equal(result.bins.green[255], 1);
  assert.equal(result.bins.blue[0], 2);
  assert.equal(result.bins.blue[255], 1);
  assert.equal(result.bins.luma[0], 1);
  assert.equal(result.bins.luma[54], 1);
  assert.equal(result.bins.luma[255], 1);
  for (const bins of Object.values(result.bins)) assert.equal(sum(bins), 3);
  assert.equal(Object.hasOwn(result, 'mask'), false);
  assert.deepEqual(input.data, before);
});

test('HIST-02 / SYNTHETIC: channel and whole-triplet clipping are distinct and mask is per pixel', () => {
  const result = analyzeHistogram(pixels(
    [0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 0, 255, 0],
  ), {includeMask: true});
  assert.deepEqual(result.clipping.shadow, {red: 1, green: 2, blue: 2, anyChannel: 2, allChannels: 1});
  assert.deepEqual(result.clipping.highlight, {red: 2, green: 1, blue: 1, anyChannel: 2, allChannels: 1});
  assert.deepEqual([...result.mask], [
    CLIPPING_MASK.SHADOW_ANY | CLIPPING_MASK.SHADOW_ALL,
    CLIPPING_MASK.HIGHLIGHT_ANY | CLIPPING_MASK.HIGHLIGHT_ALL,
    CLIPPING_MASK.SHADOW_ANY | CLIPPING_MASK.HIGHLIGHT_ANY,
    0,
  ]);
});

test('HIST-03 / SYNTHETIC: thresholds are inclusive; partly transparent pixels have one vote', () => {
  const result = analyzeHistogram(pixels([8, 9, 10, 1], [246, 247, 248, 128], [128, 128, 128, 0]), {
    shadowThreshold: 8,
    highlightThreshold: 247,
    includeMask: true,
  });
  assert.equal(result.includedPixels, 2);
  assert.deepEqual(result.clipping.shadow, {red: 1, green: 0, blue: 0, anyChannel: 1, allChannels: 0});
  assert.deepEqual(result.clipping.highlight, {red: 0, green: 1, blue: 1, anyChannel: 1, allChannels: 0});
  assert.deepEqual([...result.mask], [CLIPPING_MASK.SHADOW_ANY, CLIPPING_MASK.HIGHLIGHT_ANY, 0]);
});

test('HIST-04 / SYNTHETIC: all-transparent frame yields zero counts and no division by zero', () => {
  const result = analyzeHistogram(pixels([1, 2, 3, 0]));
  assert.equal(result.includedPixels, 0);
  assert.equal(result.ignoredTransparentPixels, 1);
  for (const bins of Object.values(result.bins)) assert.equal(sum(bins), 0);
  assert.equal(result.clipping.shadow.anyChannel, 0);
  assert.equal(result.clipping.highlight.anyChannel, 0);
});

test('HIST-05 / SYNTHETIC: malformed, oversized, and contradictory settings fail closed', () => {
  for (const invalid of [
    {width: 0, height: 1, data: new Uint8ClampedArray(0)},
    {width: 1, height: 1, data: new Uint8Array(4)},
    {width: 2, height: 1, data: new Uint8ClampedArray(4)},
    {width: MAX_PIXELS + 1, height: 1, data: new Uint8ClampedArray(4)},
  ]) assert.throws(() => analyzeHistogram(invalid), /INVALID_OR_OVERSIZE_PIXELS/);
  const input = pixels([128, 128, 128, 255]);
  for (const options of [
    {shadowThreshold: -1}, {highlightThreshold: 256},
    {shadowThreshold: 50, highlightThreshold: 50},
    {shadowThreshold: 255}, {shadowThreshold: 0.5},
  ]) assert.throws(() => analyzeHistogram(input, options), /INVALID_HISTOGRAM_CLIP_THRESHOLDS/);
  assert.throws(() => analyzeHistogram(input, {includeMask: 1}), /INVALID_HISTOGRAM_MASK_OPTION/);
});

test('HIST-06 / SYNTHETIC: cancellation is checked before and during the linear pixel scan', () => {
  const input = {width: 33000, height: 1, data: new Uint8ClampedArray(33000 * 4)};
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => analyzeHistogram(input, {signal: controller.signal}), {name: 'AbortError'});
  let reads = 0;
  const signal = {get aborted() {return ++reads > 2;}};
  assert.throws(() => analyzeHistogram(input, {signal}), {name: 'AbortError'});
  assert.ok(reads > 2);
});

test('HIST-07 / SYNTHETIC: large scan accounts for each nontransparent pixel without input copy', () => {
  const width = 100_000;
  const data = new Uint8ClampedArray(width * 4);
  for (let i = 0; i < width; i++) data.set([i & 255, (i * 3) & 255, 128, 255], i * 4);
  const result = analyzeHistogram({width, height: 1, data});
  assert.equal(result.includedPixels, width);
  assert.equal(result.ignoredTransparentPixels, 0);
  for (const bins of Object.values(result.bins)) assert.equal(sum(bins), width);
  assert.equal(result.bins.blue[128], width);
  assert.equal(Object.hasOwn(result, 'mask'), false);
});
