import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {applySelectiveColor, validateSelectiveColor} from '../src/processing/selective-color.mjs';

const pixels = () => ({width: 2, height: 1,
  data: new Uint8ClampedArray([160, 90, 80, 255, 10, 240, 40, 0])});

test('SELECTIVE-REALM-01 / WORKER_EQUIVALENT: foreign-realm plain JSON works at all three levels', () => {
  const foreign = runInNewContext('({method:"absolute",ranges:{reds:{cyan:40,magenta:-20},blues:{yellow:10}}})');
  assert.notStrictEqual(Object.getPrototypeOf(foreign), Object.prototype);
  assert.notStrictEqual(Object.getPrototypeOf(foreign.ranges), Object.prototype);
  assert.notStrictEqual(Object.getPrototypeOf(foreign.ranges.reds), Object.prototype);
  const local = {method: 'absolute', ranges: {reds: {cyan: 40, magenta: -20}, blues: {yellow: 10}}};
  assert.deepEqual(validateSelectiveColor(foreign), validateSelectiveColor(local));
  const input = pixels(), original = input.data.slice();
  const output = applySelectiveColor(input, foreign);
  assert.deepEqual(output.data, applySelectiveColor(input, local).data);
  assert.notDeepEqual([...output.data.slice(0, 3)], [...input.data.slice(0, 3)]);
  assert.deepEqual([...output.data.slice(4, 8)], [10, 240, 40, 0]);
  assert.deepEqual(input.data, original);
});

test('SELECTIVE-REALM-02 / WORKER_EQUIVALENT: foreign class instances reject at root, ranges, and group', () => {
  const invalid = [
    runInNewContext('new (class Settings { constructor(){this.method="absolute"} })'),
    {ranges: runInNewContext('new (class Ranges { constructor(){this.reds={cyan:1}} })')},
    {ranges: {reds: runInNewContext('new (class Sliders { constructor(){this.cyan=1} })')}},
    new (class LocalSettings { constructor(){this.method='absolute';} })(),
  ];
  for (const settings of invalid) {
    assert.throws(() => validateSelectiveColor(settings), /INVALID_SELECTIVE_COLOR/);
    assert.throws(() => applySelectiveColor(pixels(), settings), /INVALID_SELECTIVE_COLOR/);
  }
});

test('SELECTIVE-REALM-03 / WORKER_EQUIVALENT: foreign unknown and symbol keys still reject', () => {
  const invalid = [
    runInNewContext('({method:"relative",unknown:true})'),
    runInNewContext('({ranges:{oranges:{cyan:1}}})'),
    runInNewContext('({ranges:{reds:{cyan:1,unknown:2}}})'),
    runInNewContext('({[Symbol("root")]:1})'),
    runInNewContext('({ranges:{[Symbol("ranges")]:1}})'),
    runInNewContext('({ranges:{reds:{[Symbol("group")]:1}}})'),
  ];
  for (const settings of invalid) {
    assert.throws(() => validateSelectiveColor(settings), /INVALID_SELECTIVE_COLOR/);
    assert.throws(() => applySelectiveColor(pixels(), settings), /INVALID_SELECTIVE_COLOR/);
  }
});

test('SELECTIVE-REALM-04 / JSON_SHAPE: null-prototype plain records remain valid', () => {
  const group = Object.assign(Object.create(null), {cyan: 40});
  const ranges = Object.assign(Object.create(null), {reds: group});
  const input = Object.assign(Object.create(null), {method: 'absolute', ranges});
  assert.deepEqual(validateSelectiveColor(input), validateSelectiveColor({method: 'absolute', ranges: {reds: {cyan: 40}}}));
  assert.deepEqual(applySelectiveColor(pixels(), input).data,
    applySelectiveColor(pixels(), {method: 'absolute', ranges: {reds: {cyan: 40}}}).data);
});
