import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizeLocalBrushMask, LOCAL_BRUSH_VERSION, MAX_BRUSH_POINTS, MAX_BRUSH_STROKES} from '../src/processing/local-mask-brush.mjs';
import {applyLocalLevels} from '../src/processing/local-levels.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

const stroke = (points, overrides = {}) => ({points, radius: .06, hardness: 1, mode: 'add', ...overrides});
const at = (mask, x, y) => mask.data[y * mask.width + x];

test('LOCAL-BRUSH01: connected segment has no gaps, outside coverage remains transparent and input is unchanged', () => {
  assert.equal(LOCAL_BRUSH_VERSION, 'suite-normalized-coverage-brush-1');
  const strokes = [stroke([{x: .1, y: .5}, {x: .9, y: .5}])], before = structuredClone(strokes);
  const mask = rasterizeLocalBrushMask({width: 100, height: 100, strokes});
  assert.ok(mask.data instanceof Uint8Array);
  assert.equal(mask.data.length, 10000);
  for (let x = 10; x < 90; x++) assert.equal(at(mask, x, 49), 255, `gap at ${x}`);
  assert.equal(at(mask, 50, 0), 0);
  assert.deepEqual(strokes, before);
});

test('LOCAL-BRUSH02: normalized center remains stable on Proxy and Final sizes', () => {
  const strokes = [stroke([{x: .25, y: .75}], {radius: .1})];
  const proxy = rasterizeLocalBrushMask({width: 40, height: 20, strokes});
  const final = rasterizeLocalBrushMask({width: 400, height: 200, strokes});
  assert.equal(at(proxy, 10, 15), 255);
  assert.equal(at(final, 100, 150), 255);
  assert.equal(at(proxy, 30, 5), 0);
  assert.equal(at(final, 300, 50), 0);
  assert.deepEqual(rasterizeLocalBrushMask({width: 40, height: 20, strokes}).data, proxy.data);
});

test('LOCAL-BRUSH03: hardness creates partial coverage; erase removes only explicit regions', () => {
  const base = stroke([{x: .5, y: .5}], {radius: .3, hardness: 0});
  const first = rasterizeLocalBrushMask({width: 100, height: 100, strokes: [base]});
  assert.ok(at(first, 65, 50) > 0 && at(first, 65, 50) < 255);
  const erased = rasterizeLocalBrushMask({width: 100, height: 100, strokes: [base,
    stroke([{x: .5, y: .5}], {radius: .05, mode: 'erase'})]});
  assert.equal(at(erased, 50, 50), 0);
  assert.equal(at(erased, 65, 50), at(first, 65, 50));
  assert.equal(at(erased, 0, 0), 0);
});

test('LOCAL-BRUSH04: coverage integrates with Local Levels without changing transparent image bytes', () => {
  const mask = rasterizeLocalBrushMask({width: 3, height: 1,
    strokes: [stroke([{x: .5, y: .5}], {radius: .3})]});
  const pixels = {width: 3, height: 1,
    data: new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255, 7, 9, 11, 0])};
  const before = pixels.data.slice();
  const changed = applyLocalLevels(pixels, mask, {master: {gamma: 2}});
  assert.equal(changed.data[0], 100);
  assert.ok(changed.data[4] > 100);
  assert.deepEqual(Array.from(changed.data.slice(8, 12)), [7, 9, 11, 0]);
  assert.deepEqual(pixels.data, before);
});

test('LOCAL-BRUSH05: invalid dimensions, coordinates, controls, point/stroke counts and work budget fail closed', () => {
  const valid = stroke([{x: .5, y: .5}]);
  for (const input of [
    {width: 0, height: 1, strokes: []},
    {width: MAX_PIXELS + 1, height: 1, strokes: []},
    {width: 10, height: 10, strokes: null},
    {width: 10, height: 10, strokes: [stroke([])]},
    {width: 10, height: 10, strokes: [stroke([{x: NaN, y: .5}])]},
    {width: 10, height: 10, strokes: [stroke([{x: 1.01, y: .5}])]},
    {width: 10, height: 10, strokes: [stroke([{x: .5, y: .5}], {radius: 0})]},
    {width: 10, height: 10, strokes: [stroke([{x: .5, y: .5}], {hardness: 1.01})]},
    {width: 10, height: 10, strokes: [stroke([{x: .5, y: .5}], {mode: 'auto'})]},
    {width: 10, height: 10, strokes: Array(MAX_BRUSH_STROKES + 1).fill(valid)},
    {width: 10, height: 10, strokes: [stroke(Array(MAX_BRUSH_POINTS + 1).fill({x: .5, y: .5}))]},
    {width: 1000, height: 1000, strokes: [stroke(Array(128).fill({x: .5, y: .5}), {radius: .5})]},
  ]) assert.throws(() => rasterizeLocalBrushMask(input));
  assert.deepEqual(rasterizeLocalBrushMask({width: 2, height: 2, strokes: []}).data, new Uint8Array(4));
});

test('LOCAL-BRUSH06: abort before allocation and during rasterization has no output or input mutation', () => {
  const strokes = [stroke([{x: .1, y: .1}, {x: .9, y: .9}], {radius: .2})];
  const before = structuredClone(strokes);
  assert.throws(() => rasterizeLocalBrushMask({width: 100, height: 100, strokes,
    signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  assert.throws(() => rasterizeLocalBrushMask({width: 300, height: 300, strokes,
    signal: {get aborted() {return ++checks >= 50;}}}), {name: 'AbortError'});
  assert.ok(checks >= 50);
  assert.deepEqual(strokes, before);
});
