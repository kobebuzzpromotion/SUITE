import test from 'node:test';
import assert from 'node:assert/strict';
import {createClippingOverlay, CLIPPING_OVERLAY_COLORS} from '../src/processing/clipping-overlay.mjs';
import {analyzeHistogram, CLIPPING_MASK} from '../src/processing/histogram.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

const pixels = (...rgba) => ({width: rgba.length, height: 1, data: new Uint8ClampedArray(rgba.flat())});
const rgba = (data, index) => [...data.slice(index * 4, index * 4 + 4)];

test('CLIP-OVERLAY-01 / SYNTHETIC: black blue, white red, simultaneous purple, other and alpha-zero transparent', () => {
  const source = pixels(
    [0, 40, 40, 255], [255, 40, 40, 255], [255, 0, 40, 255],
    [40, 40, 40, 255], [0, 255, 255, 0],
  );
  const sourceCopy = source.data.slice();
  const analysis = analyzeHistogram(source, {includeMask: true});
  const maskCopy = analysis.mask.slice();
  const result = createClippingOverlay(source, analysis);
  assert.deepEqual(rgba(result.data, 0), CLIPPING_OVERLAY_COLORS.shadow);
  assert.deepEqual(rgba(result.data, 1), CLIPPING_OVERLAY_COLORS.highlight);
  assert.deepEqual(rgba(result.data, 2), CLIPPING_OVERLAY_COLORS.both);
  assert.deepEqual(rgba(result.data, 3), [0, 0, 0, 0]);
  assert.deepEqual(rgba(result.data, 4), [0, 0, 0, 0]);
  assert.deepEqual([result.width, result.height], [source.width, source.height]);
  assert.notStrictEqual(result.data, source.data);
  assert.deepEqual(source.data, sourceCopy);
  assert.deepEqual(analysis.mask, maskCopy);
});

test('CLIP-OVERLAY-02 / SYNTHETIC: ALL bits use the same warning and partial source alpha attenuates overlay', () => {
  const source = pixels([0, 0, 0, 128], [255, 255, 255, 64], [0, 255, 0, 1]);
  const analysis = analyzeHistogram(source, {includeMask: true});
  assert.deepEqual([...analysis.mask], [
    CLIPPING_MASK.SHADOW_ANY | CLIPPING_MASK.SHADOW_ALL,
    CLIPPING_MASK.HIGHLIGHT_ANY | CLIPPING_MASK.HIGHLIGHT_ALL,
    CLIPPING_MASK.SHADOW_ANY | CLIPPING_MASK.HIGHLIGHT_ANY,
  ]);
  const result = createClippingOverlay(source, analysis);
  assert.deepEqual(rgba(result.data, 0), [24, 95, 255, Math.round(160 * 128 / 255)]);
  assert.deepEqual(rgba(result.data, 1), [255, 48, 48, Math.round(160 * 64 / 255)]);
  assert.deepEqual(rgba(result.data, 2), [199, 45, 232, 1]);
});

test('CLIP-OVERLAY-03 / CONTRACT: dimensions, mask type/length/bits and pixel cap reject without changing inputs', () => {
  const source = pixels([0, 0, 0, 255]);
  const original = source.data.slice();
  for (const invalid of [
    null, {}, {width: 2, height: 1, mask: new Uint8Array(1)},
    {width: 1, height: 2, mask: new Uint8Array(1)},
    {width: 1, height: 1, mask: new Uint8Array(0)},
    {width: 1, height: 1, mask: new Uint8ClampedArray(1)},
    {width: 1, height: 1, mask: [0]},
    ...[16, CLIPPING_MASK.SHADOW_ALL, CLIPPING_MASK.HIGHLIGHT_ALL].map(bits =>
      ({width: 1, height: 1, mask: new Uint8Array([bits])})),
  ]) assert.throws(() => createClippingOverlay(source, invalid), /INVALID_CLIPPING_OVERLAY_MASK/);
  assert.deepEqual(source.data, original);
  assert.throws(() => createClippingOverlay(
    {width: MAX_PIXELS + 1, height: 1, data: new Uint8ClampedArray(4)},
    {width: MAX_PIXELS + 1, height: 1, mask: new Uint8Array(1)},
  ), /INVALID_OR_OVERSIZE_PIXELS/);
});

test('CLIP-OVERLAY-04 / SYNTHETIC: cancellation is checked before and during the linear scan', () => {
  const width = 33_000;
  const source = {width, height: 1, data: new Uint8ClampedArray(width * 4)};
  const analysis = {width, height: 1, mask: new Uint8Array(width)};
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => createClippingOverlay(source, analysis, {signal: controller.signal}), {name: 'AbortError'});
  let reads = 0;
  const signal = {get aborted() {return ++reads > 2;}};
  assert.throws(() => createClippingOverlay(source, analysis, {signal}), {name: 'AbortError'});
  assert.ok(reads > 2);
});

test('CLIP-OVERLAY-05 / SYNTHETIC: output is bounded and one pixel maps to one position in a 2D frame', () => {
  const source = {width: 2, height: 2, data: new Uint8ClampedArray([
    128, 128, 128, 255, 0, 10, 10, 255,
    255, 10, 10, 255, 0, 255, 10, 255,
  ])};
  const analysis = analyzeHistogram(source, {includeMask: true});
  const result = createClippingOverlay(source, analysis);
  assert.equal(result.data.length, 16);
  assert.deepEqual(rgba(result.data, 0), [0, 0, 0, 0]);
  assert.deepEqual(rgba(result.data, 1), CLIPPING_OVERLAY_COLORS.shadow);
  assert.deepEqual(rgba(result.data, 2), CLIPPING_OVERLAY_COLORS.highlight);
  assert.deepEqual(rgba(result.data, 3), CLIPPING_OVERLAY_COLORS.both);
});
