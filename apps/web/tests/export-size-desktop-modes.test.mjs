import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportDimensions, resizeExportPixels, MAX_EXPORT_EDGE, MAX_EXPORT_PIXELS} from '../src/export-size.mjs';

const size = (source, settings) => {
  const plan = planExportDimensions(source, settings);
  return [plan.width, plan.height];
};

test('EXPORT-DESKTOP-01 / DIMENSIONS: long/short edge preserve orientation and ratio within integer rounding', () => {
  const landscape = {width: 4000, height: 3000};
  const portrait = {width: 3000, height: 4000};
  assert.deepEqual(size(landscape, {kind: 'long-edge', value: 1000}), [1000, 750]);
  assert.deepEqual(size(landscape, {kind: 'short-edge', value: 1000}), [1333, 1000]);
  assert.deepEqual(size(portrait, {kind: 'long-edge', value: 1000}), [750, 1000]);
  assert.deepEqual(size(portrait, {kind: 'short-edge', value: 1000}), [1000, 1333]);
  assert.deepEqual(size({width: 800, height: 800}, {kind: 'short-edge', value: 400}), [400, 400]);
  assert.deepEqual(size({width: 3, height: 2}, {kind: 'short-edge', value: 1}), [2, 1]);
});

test('EXPORT-DESKTOP-02 / DIMENSIONS: explicit box mode is a bounded fit alias, never a distortion', () => {
  const source = {width: 4000, height: 3000};
  for (const box of [{width: 900, height: 500}, {width: 6000, height: 6000}, {width: 1, height: 1}]) {
    const dimensions = planExportDimensions(source, {kind: 'dimensions', ...box});
    const fit = planExportDimensions(source, {kind: 'fit', ...box});
    assert.deepEqual([dimensions.width, dimensions.height], [fit.width, fit.height]);
    assert.ok(dimensions.width <= box.width && dimensions.height <= box.height);
    assert.ok(dimensions.width <= source.width && dimensions.height <= source.height);
    assert.equal(dimensions.kind, 'dimensions');
  }
  assert.deepEqual(size(source, {kind: 'dimensions', width: 900, height: 500}), [667, 500]);
});

test('EXPORT-DESKTOP-03 / COMPATIBILITY: original five modes retain their existing plans', () => {
  const source = {width: 4000, height: 3000};
  assert.deepEqual(size(source, {kind: 'original'}), [4000, 3000]);
  assert.deepEqual(size(source, {kind: 'percentage', value: 25}), [1000, 750]);
  assert.deepEqual(size(source, {kind: 'width', value: 800}), [800, 600]);
  assert.deepEqual(size(source, {kind: 'height', value: 1200}), [1600, 1200]);
  assert.deepEqual(size(source, {kind: 'fit', width: 900, height: 500}), [667, 500]);
});

test('EXPORT-DESKTOP-04 / VALIDATION: no implicit enlargement or malformed edge/box; output limits still apply', () => {
  const source = {width: 100, height: 80};
  for (const settings of [
    {kind: 'long-edge', value: 101}, {kind: 'short-edge', value: 81},
    {kind: 'long-edge', value: 0}, {kind: 'short-edge', value: -1},
    {kind: 'long-edge', value: 12.5}, {kind: 'short-edge', value: NaN},
    {kind: 'dimensions', width: 0, height: 80},
    {kind: 'dimensions', width: 100, height: Infinity},
  ]) assert.throws(() => planExportDimensions(source, settings));
  assert.throws(() => planExportDimensions({width: MAX_EXPORT_EDGE + 1, height: 1},
    {kind: 'long-edge', value: MAX_EXPORT_EDGE + 1}), /EXPORT_SIZE_LIMIT/);
  assert.throws(() => planExportDimensions({width: MAX_EXPORT_PIXELS + 1, height: 1},
    {kind: 'short-edge', value: 1}), /EXPORT_SOURCE_DIMENSIONS_INVALID/);
});

test('EXPORT-DESKTOP-05 / RGBA8: all three new modes use existing linear-light alpha-correct reducer', () => {
  const source = {width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255])};
  const before = source.data.slice();
  for (const settings of [
    {kind: 'long-edge', value: 1},
    {kind: 'dimensions', width: 1, height: 1},
  ]) {
    const result = resizeExportPixels(source, settings);
    assert.deepEqual([result.width, result.height, ...result.data], [1, 1, 0, 0, 255, 128]);
    assert.notStrictEqual(result.data, source.data);
  }
  const tall = {width: 1, height: 2, data: source.data.slice()};
  const short = resizeExportPixels(tall, {kind: 'short-edge', value: 1});
  assert.deepEqual(short.data, tall.data);
  assert.notStrictEqual(short.data, tall.data);
  assert.deepEqual(source.data, before);
});

test('EXPORT-DESKTOP-06 / ABORT: new modes cancel before output and during reduction without mutating source', () => {
  const source = {width: 8192, height: 1, data: new Uint8ClampedArray(8192 * 4).fill(64)};
  const before = source.data.slice();
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => resizeExportPixels(source, {kind: 'long-edge', value: 1},
    {signal: controller.signal}), {name: 'AbortError'});
  let reads = 0;
  const signal = {get aborted() {return ++reads >= 3;}};
  assert.throws(() => resizeExportPixels(source, {kind: 'dimensions', width: 1, height: 1},
    {signal}), {name: 'AbortError'});
  assert.ok(reads >= 3);
  assert.deepEqual(source.data, before);
});
