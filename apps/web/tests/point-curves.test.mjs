import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPointCurves, buildPointCurveLUT, POINT_CURVES_ALGORITHM_VERSION} from '../src/processing/point-curves.mjs';
import {MAX_PIXELS} from '../src/processing/pure.mjs';

const identity = [{x: 0, y: 0}, {x: 255, y: 255}];
const invert = [{x: 0, y: 255}, {x: 255, y: 0}];
const frame = (...rgba) => ({width: rgba.length, height: 1, data: new Uint8ClampedArray(rgba.flat())});

test('POINT-01 / SYNTHETIC: absent or explicit identity curves copy every byte without aliasing', () => {
  const source = {...frame([10, 20, 30, 255], [50, 60, 70, 0]), sourceWidth: 4, sourceHeight: 2};
  const expected = source.data.slice();
  assert.equal(POINT_CURVES_ALGORITHM_VERSION, 'suite-srgb8-rgb-point-curves-1');
  for (const curves of [{}, {master: identity, red: identity, green: identity, blue: identity}]) {
    const output = applyPointCurves(source, curves);
    assert.deepEqual(output, source);
    assert.notStrictEqual(output.data, source.data);
  }
  assert.deepEqual(source.data, expected);
  assert.deepEqual([...buildPointCurveLUT(identity)], Array.from({length: 256}, (_, value) => value));
});

test('POINT-02 / SYNTHETIC: monotone knots are exact and every segment stays bounded and ordered', () => {
  const points = [{x: 0, y: 0}, {x: 64, y: 24}, {x: 128, y: 190}, {x: 255, y: 255}];
  const lut = buildPointCurveLUT(points);
  for (const {x, y} of points) assert.equal(lut[x], y);
  for (let x = 1; x < lut.length; x++) assert.ok(lut[x] >= lut[x - 1]);
  for (let i = 0; i < points.length - 1; i++) {
    for (let x = points[i].x; x <= points[i + 1].x; x++) {
      assert.ok(lut[x] >= points[i].y && lut[x] <= points[i + 1].y);
    }
  }
});

test('POINT-03 / SYNTHETIC: non-monotone controls retain local reversals without overshoot', () => {
  const points = [{x: 0, y: 0}, {x: 64, y: 200}, {x: 128, y: 50}, {x: 192, y: 220}, {x: 255, y: 255}];
  const lut = buildPointCurveLUT(points);
  for (const {x, y} of points) assert.equal(lut[x], y);
  assert.ok(lut[32] < lut[64]);
  assert.ok(lut[96] < lut[64] && lut[96] > lut[128]);
  assert.ok(lut[160] > lut[128] && lut[160] < lut[192]);
  for (let i = 0; i < points.length - 1; i++) {
    const low = Math.min(points[i].y, points[i + 1].y), high = Math.max(points[i].y, points[i + 1].y);
    for (let x = points[i].x; x <= points[i + 1].x; x++) assert.ok(lut[x] >= low && lut[x] <= high);
  }
});

test('POINT-04 / SYNTHETIC: master is applied before individual RGB channels', () => {
  const source = frame([10, 50, 90, 255], [0, 128, 255, 255]);
  const output = applyPointCurves(source, {master: invert, red: invert});
  assert.deepEqual([...output.data], [10, 205, 165, 255, 0, 127, 0, 255]);
  assert.deepEqual([...source.data], [10, 50, 90, 255, 0, 128, 255, 255]);
});

test('POINT-05 / SYNTHETIC: alpha and fully transparent hidden RGB remain unchanged and independent', () => {
  const source = frame([30, 90, 120, 255], [255, 0, 128, 0], [30, 90, 120, 1]);
  const output = applyPointCurves(source, {red: invert, blue: invert});
  assert.deepEqual([...output.data.slice(4, 8)], [255, 0, 128, 0]);
  assert.deepEqual([output.data[3], output.data[7], output.data[11]], [255, 0, 1]);
  const changedHidden = source.data.slice();
  changedHidden.set([1, 2, 3, 0], 4);
  const again = applyPointCurves({...source, data: changedHidden}, {red: invert, blue: invert});
  assert.deepEqual([...output.data.slice(0, 4)], [...again.data.slice(0, 4)]);
  assert.deepEqual([...output.data.slice(8, 12)], [...again.data.slice(8, 12)]);
});

test('POINT-06 / SYNTHETIC: malformed curves, point order, duplicate X, range, and unknown fields fail closed', () => {
  for (const points of [
    [], [{x: 0, y: 0}], [{x: 1, y: 0}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 254, y: 255}],
    [{x: 0, y: 0}, {x: 80, y: 30}, {x: 80, y: 40}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 120, y: 40}, {x: 100, y: 50}, {x: 255, y: 255}],
    [{x: 0, y: 0}, {x: 255, y: 256}],
    [{x: 0, y: 0}, {x: 255, y: NaN}],
    [{x: 0, y: 0}, {x: 255, y: 255.5}],
    [{x: 0, y: 0, label: 'extra'}, {x: 255, y: 255}],
    Array.from({length: 33}, (_, i) => ({x: i === 32 ? 255 : i, y: i})),
  ]) assert.throws(() => buildPointCurveLUT(points), /INVALID_POINT_CURVE/);
  const source = frame([10, 20, 30, 255]);
  for (const curves of [null, [], {cyan: identity}, {master: null}, {blue: []}]) {
    assert.throws(() => applyPointCurves(source, curves), /INVALID_POINT_CURVE/);
  }
  for (const invalid of [
    {width: 0, height: 1, data: new Uint8ClampedArray(0)},
    {width: 1, height: 1, data: new Uint8Array(4)},
    {width: MAX_PIXELS + 1, height: 1, data: new Uint8ClampedArray(4)},
  ]) assert.throws(() => applyPointCurves(invalid), /INVALID_OR_OVERSIZE_PIXELS/);
});

test('POINT-07 / SYNTHETIC: same control set is deterministic and does not mutate inputs', () => {
  const source = frame(...Array.from({length: 512}, (_, i) => [i & 255, (i * 3) & 255, (i * 7) & 255, 255]));
  const before = source.data.slice();
  const curves = {master: [{x: 0, y: 10}, {x: 120, y: 180}, {x: 255, y: 245}], green: invert};
  const pointsBefore = structuredClone(curves);
  const first = applyPointCurves(source, curves), second = applyPointCurves(source, curves);
  assert.deepEqual(first.data, second.data);
  assert.deepEqual(source.data, before);
  assert.deepEqual(curves, pointsBefore);
});

test('POINT-08 / SYNTHETIC: cancellation works before scan and within a very wide row', () => {
  const source = frame([10, 20, 30, 255]);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => applyPointCurves(source, {master: invert}, {signal: controller.signal}), {name: 'AbortError'});
  const wide = {width: 40_000, height: 1, data: new Uint8ClampedArray(40_000 * 4).fill(128)};
  let reads = 0;
  const signal = {get aborted() {return ++reads > 3;}};
  assert.throws(() => applyPointCurves(wide, {master: invert}, {signal}), {name: 'AbortError'});
  assert.ok(reads > 3);
});
