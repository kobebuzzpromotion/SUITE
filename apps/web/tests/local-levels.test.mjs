import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLocalLevels, LOCAL_LEVELS_ALGORITHM_VERSION} from '../src/processing/local-levels.mjs';
import {applyLevels} from '../src/processing/levels.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

const pixels = () => ({width: 3, height: 1, sourceWidth: 5, sourceHeight: 2,
  data: new Uint8ClampedArray([40, 80, 120, 255, 100, 140, 180, 128, 7, 9, 11, 0])});
const coverage = (...values) => ({width: values.length, height: 1, data: new Uint8Array(values)});
const settings = {master: {inputBlack: 20, inputWhite: 220, gamma: 1.6},
  red: {outputBlack: 16, outputWhite: 240}};

test('LOCAL-LEVELS01: mask zero preserves every byte, metadata, source and mask', () => {
  assert.equal(LOCAL_LEVELS_ALGORITHM_VERSION, 'suite-srgb8-local-levels-coverage-1');
  const input = pixels(), mask = coverage(0, 0, 0);
  const original = input.data.slice(), maskOriginal = mask.data.slice();
  const result = applyLocalLevels(input, mask, settings);
  assert.notEqual(result, input);
  assert.notEqual(result.data, input.data);
  assert.deepEqual(result.data, original);
  assert.deepEqual([result.width, result.height, result.sourceWidth, result.sourceHeight], [3, 1, 5, 2]);
  assert.deepEqual(input.data, original);
  assert.deepEqual(mask.data, maskOriginal);
});

test('LOCAL-LEVELS02: full coverage exactly matches existing RGB Levels, including independent channels', () => {
  const input = pixels(), mask = coverage(255, 255, 255);
  const global = applyLevels(input, settings);
  const result = applyLocalLevels(input, mask, settings);
  assert.deepEqual(result, global);
  assert.deepEqual(Array.from(result.data.slice(8, 12)), [7, 9, 11, 0]);
});

test('LOCAL-LEVELS03: partial mask blends encoded RGB bytes once, preserves alpha and hidden RGB', () => {
  const input = pixels(), mask = coverage(0, 127, 255), global = applyLevels(input, settings);
  const result = applyLocalLevels(input, mask, settings);
  assert.deepEqual(Array.from(result.data.slice(0, 4)), [40, 80, 120, 255]);
  for (let c = 0; c < 3; c++)
    assert.equal(result.data[4 + c], Math.round(input.data[4 + c] +
      (global.data[4 + c] - input.data[4 + c]) * 127 / 255));
  assert.equal(result.data[7], 128);
  assert.deepEqual(Array.from(result.data.slice(8, 12)), [7, 9, 11, 0]);
  assert.deepEqual(input.data, pixels().data);
});

test('LOCAL-LEVELS04: wrong mask dimensions/type/length or invalid frame and controls reject before mutation', () => {
  const input = pixels(), before = input.data.slice();
  for (const mask of [null, [], {}, coverage(0, 0),
    {width: 3, height: 2, data: new Uint8Array(6)},
    {width: 3, height: 1, data: new Uint8Array(2)},
    {width: 3, height: 1, data: new Uint16Array(3)},
    {width: 3, height: 1, data: [0, 255, 0]},
  ]) assert.throws(() => applyLocalLevels(input, mask, settings), /LOCAL_LEVELS_MASK_INVALID/);
  assert.throws(() => applyLocalLevels(input, coverage(0, 0, 0), {master: {inputBlack: 255}}), /LEVELS_ENDPOINT_ORDER/);
  assert.throws(() => applyLocalLevels({width: MAX_PIXELS + 1, height: 1,
    data: new Uint8ClampedArray(4)}, coverage(0)), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.deepEqual(input.data, before);
});

test('LOCAL-LEVELS05: preflight and blend-phase abort provide no result or source mutation', () => {
  const width = 16385, input = {width, height: 1, data: new Uint8ClampedArray(width * 4).fill(128)};
  const mask = {width, height: 1, data: new Uint8ClampedArray(width).fill(127)};
  const before = input.data.slice(), maskBefore = mask.data.slice();
  assert.throws(() => applyLocalLevels(input, mask, {master: {gamma: 2}},
    {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  assert.throws(() => applyLocalLevels(input, mask, {master: {gamma: 2}},
    {signal: {get aborted() {return ++checks >= 8;}}}), {name: 'AbortError'});
  assert.ok(checks >= 8);
  assert.deepEqual(input.data, before);
  assert.deepEqual(mask.data, maskBefore);
});
