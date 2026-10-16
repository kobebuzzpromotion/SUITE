import test from 'node:test';
import assert from 'node:assert/strict';
import {applyColorCalibration, validateColorCalibration,
  COLOR_CALIBRATION_ALGORITHM_VERSION, COLOR_CALIBRATION_PRIMARIES} from '../src/processing/color-calibration.mjs';
import {srgbToLinear} from '../src/processing/pure.mjs';

const image = (...samples) => ({width: samples.length, height: 1,
  data: new Uint8ClampedArray(samples.flatMap(sample => [sample[0], sample[1], sample[2], sample[3] ?? 255]))});
const sample = (pixels, index = 0) => [...pixels.data.slice(index * 4, index * 4 + 4)];
const linearY = rgb => [0.2126, 0.7152, 0.0722].reduce((sum, weight, channel) =>
  sum + weight * srgbToLinear(rgb[channel] / 255), 0);
const chromaRadius = rgb => {
  const r = srgbToLinear(rgb[0] / 255), g = srgbToLinear(rgb[1] / 255), b = srgbToLinear(rgb[2] / 255);
  const y = linearY(rgb);
  return Math.hypot((b - y) / (2 * (1 - 0.0722)), (r - y) / (2 * (1 - 0.2126)));
};

test('CALIBRATION01 / SYNTHETIC: neutral values return an exact detached copy and detached defaults', () => {
  assert.equal(COLOR_CALIBRATION_ALGORITHM_VERSION, 'suite-srgb8-primary-calibration-1');
  assert.deepEqual(COLOR_CALIBRATION_PRIMARIES, ['red', 'green', 'blue']);
  const pixels = image([0, 40, 255, 1], [80, 90, 100, 0], [255, 255, 255, 255]);
  pixels.sourceWidth = 8; pixels.sourceHeight = 4;
  const before = pixels.data.slice();
  const result = applyColorCalibration(pixels);
  assert.notStrictEqual(result.data, pixels.data);
  assert.deepEqual(result.data, before);
  assert.deepEqual(pixels.data, before);
  assert.deepEqual([result.sourceWidth, result.sourceHeight], [8, 4]);
  const defaults = validateColorCalibration();
  assert.deepEqual(defaults, {red: {hue: 0, saturation: 0}, green: {hue: 0, saturation: 0}, blue: {hue: 0, saturation: 0}});
  defaults.red.hue = 99;
  assert.equal(validateColorCalibration().red.hue, 0);
});

test('CALIBRATION02 / SYNTHETIC: primary hue changes chroma in opposite directions at constant linear luma', () => {
  const pixels = image([160, 90, 80], [80, 160, 90], [80, 90, 160]);
  const warm = applyColorCalibration(pixels, {red: {hue: 60}});
  const cool = applyColorCalibration(pixels, {red: {hue: -60}});
  assert.notDeepEqual(warm.data, cool.data);
  assert.ok(sample(warm)[2] < 80 && sample(cool)[2] > 80);
  assert.ok(sample(warm, 1)[2] > 90 && sample(cool, 1)[2] < 90);
  for (let n = 0; n < 3; n++) {
    assert.ok(Math.abs(linearY(sample(warm, n)) - linearY(sample(pixels, n))) < 0.007);
    assert.ok(Math.abs(linearY(sample(cool, n)) - linearY(sample(pixels, n))) < 0.007);
  }
});

test('CALIBRATION03 / SYNTHETIC: positive and negative red-primary saturation expand and contract chroma', () => {
  const pixels = image([160, 90, 80]);
  const saturated = applyColorCalibration(pixels, {red: {saturation: 60}});
  const muted = applyColorCalibration(pixels, {red: {saturation: -60}});
  assert.ok(chromaRadius(sample(saturated)) > chromaRadius(sample(pixels)));
  assert.ok(chromaRadius(sample(muted)) < chromaRadius(sample(pixels)));
  assert.ok(Math.abs(linearY(sample(saturated)) - linearY(sample(pixels))) < 0.007);
  assert.ok(Math.abs(linearY(sample(muted)) - linearY(sample(pixels))) < 0.007);
});

test('CALIBRATION04 / SYNTHETIC: all three independently configured primaries affect colored pixels but leave grays exact', () => {
  const pixels = image([128, 128, 128], [160, 90, 80], [80, 160, 90], [80, 90, 160], [0, 0, 0], [255, 255, 255]);
  const red = applyColorCalibration(pixels, {red: {hue: 45}});
  const green = applyColorCalibration(pixels, {green: {hue: 45}});
  const blue = applyColorCalibration(pixels, {blue: {hue: 45}});
  assert.notDeepEqual(red.data, green.data);
  assert.notDeepEqual(red.data, blue.data);
  for (const result of [red, green, blue]) {
    for (const index of [0, 4, 5]) assert.deepEqual(sample(result, index), sample(pixels, index));
  }
  const combined = applyColorCalibration(pixels, {
    red: {hue: 45, saturation: 30}, green: {hue: -45, saturation: -25}, blue: {hue: 20, saturation: 60},
  });
  assert.notDeepEqual(sample(combined, 1), sample(red, 1));
  for (const index of [0, 4, 5]) assert.deepEqual(sample(combined, index), sample(pixels, index));
});

test('CALIBRATION05 / SYNTHETIC: alpha and fully transparent hidden RGB are preserved with no neighbor leakage', () => {
  const pixels = image([10, 230, 80, 0], [160, 90, 80, 1], [160, 90, 80, 128], [160, 90, 80, 255]);
  const before = pixels.data.slice();
  const settings = {red: {hue: 70}, green: {saturation: -70}, blue: {hue: -40}};
  const result = applyColorCalibration(pixels, settings);
  assert.deepEqual(sample(result, 0), sample(pixels, 0));
  assert.deepEqual(sample(result, 1).slice(0, 3), sample(result, 2).slice(0, 3));
  assert.deepEqual(sample(result, 2).slice(0, 3), sample(result, 3).slice(0, 3));
  assert.deepEqual([sample(result, 0)[3], sample(result, 1)[3], sample(result, 2)[3], sample(result, 3)[3]], [0, 1, 128, 255]);
  assert.notDeepEqual(sample(result, 1), sample(pixels, 1));
  assert.deepEqual(pixels.data, before);
});

test('CALIBRATION06 / SYNTHETIC: strict shape, integer ranges and unknown controls reject before source mutation', () => {
  const pixels = image([160, 90, 80]), before = pixels.data.slice();
  for (const bad of [null, [], new Date(), {master: {}}, {red: null}, {red: []},
    {red: {value: 1}}, {red: {hue: -101}}, {red: {hue: 101}},
    {green: {saturation: -101}}, {blue: {saturation: 101}},
    {red: {hue: 0.5}}, {red: {hue: NaN}}, {red: {hue: Infinity}},
    {blue: {saturation: '20'}}, {[Symbol('unsafe')]: 1},
    {red: {[Symbol('unsafe')]: 1}}, Object.create({red: {hue: 1}})]) {
    assert.throws(() => applyColorCalibration(pixels, bad), /INVALID_COLOR_CALIBRATION|COLOR_CALIBRATION_RANGE/);
  }
  assert.deepEqual(pixels.data, before);
  assert.deepEqual(validateColorCalibration({red: {hue: -100, saturation: 100}, green: {hue: 100, saturation: -100}}),
    {red: {hue: -100, saturation: 100}, green: {hue: 100, saturation: -100}, blue: {hue: 0, saturation: 0}});
});

test('CALIBRATION07 / SYNTHETIC: abort, invalid frame and oversize refuse without partial source edits', () => {
  const pixels = {width: 16385, height: 1, data: new Uint8ClampedArray(16385 * 4).fill(128)};
  const before = pixels.data.slice();
  assert.throws(() => applyColorCalibration(pixels, {red: {hue: 50}}, {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() { return ++checks >= 3; }};
  assert.throws(() => applyColorCalibration(pixels, {red: {hue: 50}}, {signal}), {name: 'AbortError'});
  assert.ok(checks >= 3);
  assert.deepEqual(pixels.data, before);
  assert.throws(() => applyColorCalibration({width: 1, height: 1, data: new Uint8Array(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyColorCalibration({width: 1, height: 1, data: new Uint8ClampedArray(3)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyColorCalibration({width: 24_000_001, height: 1, data: new Uint8ClampedArray(0)}), /INVALID_OR_OVERSIZE_PIXELS/);
});

test('CALIBRATION08 / SYNTHETIC: repeated processing is deterministic and leaves input untouched', () => {
  const pixels = image([160, 90, 80], [80, 160, 90], [80, 90, 160]);
  const before = pixels.data.slice(), input = {red: {hue: 80, saturation: -20}, blue: {hue: -50, saturation: 40}};
  const first = applyColorCalibration(pixels, input);
  const second = applyColorCalibration(pixels, input);
  assert.deepEqual(first.data, second.data);
  assert.notStrictEqual(first.data, second.data);
  assert.deepEqual(pixels.data, before);
  assert.deepEqual(input, {red: {hue: 80, saturation: -20}, blue: {hue: -50, saturation: 40}});
});
