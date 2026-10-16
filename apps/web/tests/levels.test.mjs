import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLevels, validateLevels, LEVELS_ALGORITHM_VERSION, LEVELS_CHANNELS} from '../src/processing/levels.mjs';

const image = (...samples) => ({width: samples.length, height: 1,
  data: new Uint8ClampedArray(samples.flatMap(sample => [sample[0], sample[1], sample[2], sample[3] ?? 255]))});
const rgba = (pixels, index = 0) => Array.from(pixels.data.slice(index * 4, index * 4 + 4));
const grey = value => image([value, value, value, 255]);

test('LEVELS01: neutral defaults are detached, byte-identical and preserve alpha/source metadata', () => {
  assert.equal(LEVELS_ALGORITHM_VERSION, 'suite-srgb8-rgb-levels-1');
  assert.deepEqual(LEVELS_CHANNELS, ['master', 'red', 'green', 'blue']);
  const p = image([0, 30, 255, 100], [17, 123, 240, 0], [255, 255, 255, 255]);
  p.sourceWidth = 8; p.sourceHeight = 4;
  const original = p.data.slice();
  const out = applyLevels(p);
  assert.notEqual(out, p); assert.notEqual(out.data, p.data);
  assert.deepEqual(out.data, original); assert.deepEqual(p.data, original);
  assert.deepEqual([out.sourceWidth, out.sourceHeight], [8, 4]);
  const normalized = validateLevels();
  normalized.red.gamma = 9;
  assert.equal(validateLevels().red.gamma, 1);
});

test('LEVELS02: master input endpoints clip black/white and gamma moves only midtones', () => {
  const p = image([0, 0, 0], [40, 40, 40], [128, 128, 128], [220, 220, 220], [255, 255, 255]);
  const clipped = applyLevels(p, {master: {inputBlack: 40, inputWhite: 220}});
  assert.deepEqual(rgba(clipped, 0), [0, 0, 0, 255]);
  assert.deepEqual(rgba(clipped, 1), [0, 0, 0, 255]);
  assert.deepEqual(rgba(clipped, 3), [255, 255, 255, 255]);
  assert.deepEqual(rgba(clipped, 4), [255, 255, 255, 255]);
  const brighter = rgba(applyLevels(grey(128), {master: {gamma: 2}}))[0];
  const darker = rgba(applyLevels(grey(128), {master: {gamma: 0.5}}))[0];
  assert.ok(brighter > 128 && darker < 128);
  for (const gamma of [0.1, 10]) {
    assert.equal(rgba(applyLevels(grey(0), {master: {gamma}}))[0], 0);
    assert.equal(rgba(applyLevels(grey(255), {master: {gamma}}))[0], 255);
  }
});

test('LEVELS03: output endpoints compress range without swapping direction', () => {
  const p = image([0, 0, 0], [128, 128, 128], [255, 255, 255]);
  const out = applyLevels(p, {master: {outputBlack: 32, outputWhite: 224}});
  assert.deepEqual(rgba(out, 0), [32, 32, 32, 255]);
  assert.deepEqual(rgba(out, 2), [224, 224, 224, 255]);
  assert.ok(rgba(out, 1)[0] > 32 && rgba(out, 1)[0] < 224);
  const flat = applyLevels(p, {master: {outputBlack: 70, outputWhite: 70}});
  for (let i = 0; i < p.width; i++) assert.deepEqual(rgba(flat, i), [70, 70, 70, 255]);
});

test('LEVELS04: master then RGB channel curves act independently and leave alpha/hidden RGB alone', () => {
  const p = image([64, 128, 192, 90], [10, 20, 30, 0]);
  const before = p.data.slice();
  const input = {master: {inputBlack: 32, inputWhite: 224}, red: {outputBlack: 20, outputWhite: 230},
    green: {gamma: 2}, blue: {gamma: 0.5}};
  const out = applyLevels(p, input);
  const intermediate = applyLevels(p, {master: input.master});
  const expected = applyLevels(intermediate, {red: input.red, green: input.green, blue: input.blue});
  assert.deepEqual(rgba(out), rgba(expected));
  assert.notEqual(rgba(out)[0], rgba(out)[1]);
  assert.notEqual(rgba(out)[1], rgba(out)[2]);
  assert.deepEqual(rgba(out, 1), [10, 20, 30, 0]);
  assert.equal(out.data[3], 90); assert.deepEqual(p.data, before);
});

test('LEVELS05: independently combined levels remain monotone across full RGBA8 ramp', () => {
  const p = {width: 256, height: 1, data: new Uint8ClampedArray(Array.from({length: 256}, (_, n) => [n, n, n, n]).flat())};
  const out = applyLevels(p, {master: {inputBlack: 20, inputWhite: 240, gamma: 1.7, outputBlack: 5, outputWhite: 250},
    red: {inputBlack: 10, inputWhite: 235, gamma: 0.6, outputBlack: 12, outputWhite: 220},
    green: {gamma: 2.3}, blue: {outputBlack: 33, outputWhite: 222}});
  const previous = [-1, -1, -1];
  for (let n = 0; n < 256; n++) {
    const pixel = rgba(out, n);
    assert.equal(pixel[3], n);
    for (let c = 0; c < 3; c++) {
      assert.ok(pixel[c] >= previous[c], `${n}/${c}`);
      previous[c] = pixel[c];
    }
  }
});

test('LEVELS06: unknown shape, invalid code values, gamma and endpoint order fail before touching source', () => {
  const p = grey(128), before = p.data.slice();
  for (const bad of [null, [], new Date(), {all: {}}, {red: null}, {red: {noise: 1}},
    {red: {inputBlack: -1}}, {red: {inputWhite: 256}}, {red: {outputBlack: 4.5}},
    {red: {gamma: 0}}, {red: {gamma: 10.1}}, {red: {gamma: NaN}}, {red: {gamma: Infinity}},
    {red: {inputBlack: 255}}, {red: {inputBlack: 128, inputWhite: 128}},
    {red: {outputBlack: 201, outputWhite: 200}}]) {
    assert.throws(() => applyLevels(p, bad), undefined, JSON.stringify(bad));
  }
  assert.deepEqual(p.data, before);
});

test('LEVELS07: preflight and mid-frame abort reject without mutation or partial result', () => {
  const p = {width: 16385, height: 1, data: new Uint8ClampedArray(16385 * 4).fill(128)};
  const before = p.data.slice();
  assert.throws(() => applyLevels(p, {red: {gamma: 2}}, {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks >= 4;}};
  assert.throws(() => applyLevels(p, {red: {gamma: 2}}, {signal}), {name: 'AbortError'});
  assert.ok(checks >= 4);
  assert.deepEqual(p.data, before);
});

test('LEVELS08: invalid RGBA frame is rejected even for neutral settings', () => {
  assert.throws(() => applyLevels({width: 1, height: 1, data: new Uint8Array(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyLevels({width: 1, height: 1, data: new Uint8ClampedArray(3)}), /INVALID_OR_OVERSIZE_PIXELS/);
});
