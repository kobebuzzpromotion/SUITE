import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleLevelsEndpoint, LEVELS_SAMPLE_VERSION} from '../src/processing/levels-sampler.mjs';
import {applyLevels, validateLevels} from '../src/processing/levels.mjs';

const frame = (width, height, samples) => ({width, height,
  data: new Uint8ClampedArray(samples.flat())});
const image = frame(2, 2, [
  [10, 20, 30, 255], [100, 150, 200, 128],
  [220, 210, 200, 255], [1, 2, 3, 0],
]);

test('LEVELS-SAMPLE01: normalized edge coordinates select exact pixels and return session keys', () => {
  assert.equal(LEVELS_SAMPLE_VERSION, 'suite-srgb8-levels-endpoint-sample-1');
  const before = image.data.slice();
  const red = sampleLevelsEndpoint(image, {x: .5, y: 0, channel: 'red', endpoint: 'black'});
  assert.deepEqual(red, {key: 'levels.red.inputBlack', value: 100,
    pixel: {x: 1, y: 0}, sample: {red: 100, green: 150, blue: 200, alpha: 128}});
  const white = sampleLevelsEndpoint(image, {x: 0, y: 1, channel: 'blue', endpoint: 'white'});
  assert.deepEqual(white.pixel, {x: 0, y: 1});
  assert.equal(white.value, 200);
  assert.equal(white.key, 'levels.blue.inputWhite');
  assert.deepEqual(image.data, before);
});

test('LEVELS-SAMPLE02: master uses encoded Rec.709 Y-prime; RGB channels use their own bytes', () => {
  const master = sampleLevelsEndpoint(image, {x: 0, y: 0, endpoint: 'black'});
  assert.equal(master.key, 'levels.master.inputBlack');
  assert.equal(master.value, Math.round(.2126 * 10 + .7152 * 20 + .0722 * 30));
  const green = sampleLevelsEndpoint(image, {x: 0, y: 0, channel: 'green', endpoint: 'white'});
  assert.equal(green.value, 20);
});

test('LEVELS-SAMPLE03: picked endpoint is valid in existing Levels while Gamma/Output/other channels stay unchanged', () => {
  const existing = {red: {inputBlack: 4, inputWhite: 230, gamma: 2,
    outputBlack: 12, outputWhite: 220}, green: {gamma: .7}};
  const unchanged = structuredClone(existing);
  const picked = sampleLevelsEndpoint(image, {x: .5, y: 0, channel: 'red', endpoint: 'black', levels: existing});
  const updated = structuredClone(existing);
  updated.red.inputBlack = picked.value;
  const normalized = validateLevels(updated);
  assert.equal(normalized.red.inputBlack, 100);
  assert.deepEqual(normalized.red.gamma, 2);
  assert.deepEqual([normalized.red.outputBlack, normalized.red.outputWhite], [12, 220]);
  assert.equal(normalized.green.gamma, .7);
  assert.deepEqual(existing, unchanged);
  assert.notDeepEqual(applyLevels(image, updated).data, applyLevels(image, existing).data);
});

test('LEVELS-SAMPLE04: transparent, invalid coordinate/channel/endpoint/frame/options and aborted requests reject', () => {
  const before = image.data.slice();
  for (const options of [
    {x: 1, y: 1, endpoint: 'black'}, // alpha zero
    {x: -.01, y: 0, endpoint: 'black'}, {x: 1.01, y: 0, endpoint: 'black'},
    {x: NaN, y: 0, endpoint: 'black'}, {x: 0, y: Infinity, endpoint: 'black'},
    {x: 0, y: 0, endpoint: 'black', channel: 'cyan'},
    {x: 0, y: 0, endpoint: 'middle'},
    {x: 0, y: 0, endpoint: 'black', surprise: true},
  ]) assert.throws(() => sampleLevelsEndpoint(image, options));
  const symbol = {[Symbol('hidden')]: true, x: 0, y: 0, endpoint: 'black'};
  assert.throws(() => sampleLevelsEndpoint(image, symbol));
  assert.throws(() => sampleLevelsEndpoint(image, {x: 0, y: 0, endpoint: 'black', signal: {aborted: true}}), {name: 'AbortError'});
  assert.throws(() => sampleLevelsEndpoint({width: 1, height: 1, data: new Uint8Array(4)},
    {x: 0, y: 0, endpoint: 'black'}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.deepEqual(image.data, before);
});

test('LEVELS-SAMPLE05: black/white inversion is refused without changing existing controls', () => {
  assert.throws(() => sampleLevelsEndpoint(image, {x: .5, y: 0, channel: 'red', endpoint: 'black',
    levels: {red: {inputWhite: 100}}}), /LEVELS_ENDPOINT_ORDER/);
  assert.throws(() => sampleLevelsEndpoint(image, {x: 0, y: 0, channel: 'blue', endpoint: 'white',
    levels: {blue: {inputBlack: 30}}}), /LEVELS_ENDPOINT_ORDER/);
  assert.throws(() => sampleLevelsEndpoint(frame(1, 1, [[255, 255, 255, 255]]),
    {x: 0, y: 0, endpoint: 'black'}), /LEVELS_ENDPOINT_ORDER/);
  assert.throws(() => sampleLevelsEndpoint(frame(1, 1, [[0, 0, 0, 255]]),
    {x: 0, y: 0, endpoint: 'white'}), /LEVELS_ENDPOINT_ORDER/);
});
