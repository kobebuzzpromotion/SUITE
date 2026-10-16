import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHDRFrame, toneMapSDRPreview, HDR_COLOR_SPACE, HDR_SOURCE_ENCODING,
  MAX_HDR_PIXELS, MAX_HDR_CHANNEL
} from '../src/processing/hdr-frame.mjs';

const options = (pixels, overrides = {}) => ({
  width: pixels.length / 3, height: 1, pixels,
  colorSpace: HDR_COLOR_SPACE, sourceEncoding: HDR_SOURCE_ENCODING,
  sdrWhiteNits: 203, headroomStops: 4, ...overrides
});

test('HDR-FRAME01 / linear Float32 values above reference white remain high precision and independent of source', () => {
  const source = new Float32Array([0.125, 1, 4, 16, 0.5, 0]);
  const original = source.slice();
  const frame = createHDRFrame(options(source));
  assert.equal(frame.hasHDRContent, true);
  assert.equal(frame.colorSpace, HDR_COLOR_SPACE);
  assert.equal(frame.sdrWhiteNits, 203);
  assert.equal(frame.headroomStops, 4);
  source[2] = 0;
  assert.deepEqual([...frame.pixels], [...original]);
  const detached = frame.pixels;
  detached[2] = 0;
  assert.equal(frame.pixels[2], 4);
  assert.equal(frame.pixels[3], 16);
  assert.equal(Object.isFrozen(frame), true);
});

test('HDR-FRAME02 / SDR-only floating frame is not falsely reported as having HDR content', () => {
  const frame = createHDRFrame(options(new Float32Array([0, 0.5, 1])));
  assert.equal(frame.hasHDRContent, false);
  assert.equal(toneMapSDRPreview(frame).format, 'SDR_SRGB_RGBA8_PREVIEW');
});

test('HDR-FRAME03 / SDR preview is deterministic, monotonic, finite, and has an explicit highlight shoulder', () => {
  const frame = createHDRFrame(options(new Float32Array([
    0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 2, 2, 2, 8, 8, 8, 16, 16, 16
  ])));
  const one = toneMapSDRPreview(frame), two = toneMapSDRPreview(frame);
  assert.equal(one.width, 6);
  assert.deepEqual(one.data, two.data);
  assert.equal(one.clippedPixels, 0);
  const values = [0, 4, 8, 12, 16, 20].map(i => one.data[i]);
  assert.deepEqual(values.slice(0, 2), [0, values[1]]);
  assert.ok(values.every((value, i) => i === 0 || value > values[i - 1]));
  assert.ok(values[2] < 255 && values[2] > values[1], 'SDR white leaves room for HDR highlights');
  assert.equal(values.at(-1), 255);
  assert.ok([3, 7, 11, 15, 19, 23].every(i => one.data[i] === 255));
});

test('HDR-FRAME04 / display headroom clamps preview only, not stored HDR pixels', () => {
  const frame = createHDRFrame(options(new Float32Array([32, 0, 0, 16, 0, 0])));
  const before = frame.pixels;
  const result = toneMapSDRPreview(frame);
  assert.equal(result.clippedPixels, 1);
  assert.equal(result.data[0], 255);
  assert.deepEqual(frame.pixels, before);
  assert.equal(frame.pixels[0], 32);
});

test('HDR-FRAME05 / 8-bit RGBA, false provenance, missing color space and inconsistent dimensions refuse', () => {
  assert.throws(() => createHDRFrame(options(new Uint8ClampedArray([255, 0, 0, 255]), {width: 1})), /INVALID_HDR_PIXELS/);
  assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {sourceEncoding: 'RGBA8'})), /UNSUPPORTED_HDR_ENCODING/);
  assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {colorSpace: 'LINEAR_P3'})), /UNSUPPORTED_HDR_ENCODING/);
  assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {width: 2})), /INVALID_HDR_PIXELS/);
  assert.throws(() => toneMapSDRPreview({width: 1, height: 1}), /INVALID_HDR_FRAME/);
});

test('HDR-FRAME06 / nonfinite, negative, excessive values and malformed metadata refuse', () => {
  for (const value of [NaN, Infinity, -0.01, MAX_HDR_CHANNEL + 1]) {
    assert.throws(() => createHDRFrame(options(new Float32Array([value, 1, 1]))), /INVALID_HDR_CHANNEL/);
  }
  for (const white of [0, 79, 501, Infinity, NaN])
    assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {sdrWhiteNits: white})), /INVALID_HDR_WHITE/);
  for (const stops of [0, 9, Infinity, NaN])
    assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {headroomStops: stops})), /INVALID_HDR_HEADROOM/);
  assert.throws(() => createHDRFrame({...options(new Float32Array([1, 1, 1])), unknown: 1}), /INVALID_HDR_FRAME_INPUT/);
  const symbol = options(new Float32Array([1, 1, 1]));
  symbol[Symbol('hidden')] = 1;
  assert.throws(() => createHDRFrame(symbol), /INVALID_HDR_FRAME_INPUT/);
});

test('HDR-FRAME07 / pixel capacity and abort fail before returning a frame or partial preview', () => {
  assert.throws(() => createHDRFrame(options(new Float32Array(3), {width: MAX_HDR_PIXELS + 1})), /INVALID_HDR_DIMENSIONS/);
  for (const [width, height] of [[0, 1], [1.5, 1], [1, Infinity]])
    assert.throws(() => createHDRFrame(options(new Float32Array(3), {width, height})), /INVALID_HDR_DIMENSIONS/);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => createHDRFrame(options(new Float32Array([1, 1, 1]), {signal: controller.signal})), {name: 'AbortError'});
  const frame = createHDRFrame(options(new Float32Array([2, 2, 2])));
  assert.throws(() => toneMapSDRPreview(frame, {signal: controller.signal}), {name: 'AbortError'});
  assert.deepEqual([...frame.pixels], [2, 2, 2]);
});
