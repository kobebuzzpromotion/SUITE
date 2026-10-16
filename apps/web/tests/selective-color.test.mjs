import test from 'node:test';
import assert from 'node:assert/strict';
import {applySelectiveColor, validateSelectiveColor, SELECTIVE_COLOR_ALGORITHM_VERSION,
  SELECTIVE_COLOR_RANGES, SELECTIVE_COLOR_CONTROLS} from '../src/processing/selective-color.mjs';

const image = (...samples) => ({width: samples.length, height: 1,
  data: new Uint8ClampedArray(samples.flatMap(sample => [sample[0], sample[1], sample[2], sample[3] ?? 255]))});
const rgba = (pixels, index = 0) => [...pixels.data.slice(index * 4, index * 4 + 4)];
const settings = (range, controls, method = 'relative') => ({method, ranges: {[range]: controls}});

test('SELECTIVE01 / SYNTHETIC: neutral is detached byte identity with exact nine-family/four-control defaults', () => {
  assert.equal(SELECTIVE_COLOR_ALGORITHM_VERSION, 'suite-srgb8-selective-color-1');
  assert.deepEqual(SELECTIVE_COLOR_RANGES, ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks']);
  assert.deepEqual(SELECTIVE_COLOR_CONTROLS, ['cyan', 'magenta', 'yellow', 'black']);
  const pixels = image([0, 125, 255, 27], [255, 0, 100, 0]);
  pixels.sourceWidth = 8; pixels.sourceHeight = 4;
  const before = pixels.data.slice();
  for (const input of [undefined, {}, {method: 'absolute', ranges: {reds: {cyan: 0}}}]) {
    const result = applySelectiveColor(pixels, input);
    assert.notStrictEqual(result.data, pixels.data);
    assert.deepEqual(result.data, before);
    assert.deepEqual([result.sourceWidth, result.sourceHeight], [8, 4]);
  }
  assert.deepEqual(pixels.data, before);
  const normalized = validateSelectiveColor();
  assert.equal(Object.keys(normalized.ranges).length, 9);
  for (const group of Object.values(normalized.ranges)) assert.deepEqual(group, {cyan: 0, magenta: 0, yellow: 0, black: 0});
  normalized.ranges.reds.cyan = 100;
  assert.equal(validateSelectiveColor().ranges.reds.cyan, 0);
});

test('SELECTIVE02 / SYNTHETIC: six hue families affect their own pure hue, not a distant hue', () => {
  const colors = {
    reds: [255, 0, 0], yellows: [255, 255, 0], greens: [0, 255, 0],
    cyans: [0, 255, 255], blues: [0, 0, 255], magentas: [255, 0, 255],
  };
  const pixels = image(...Object.values(colors));
  for (let index = 0; index < 6; index++) {
    const range = SELECTIVE_COLOR_RANGES[index];
    const adjusted = applySelectiveColor(pixels, settings(range, {black: 20}, 'absolute'));
    assert.notDeepEqual(rgba(adjusted, index), rgba(pixels, index), range);
    assert.deepEqual(rgba(adjusted, (index + 3) % 6), rgba(pixels, (index + 3) % 6), `${range} opposite`);
  }
  const orange = image([255, 128, 0]);
  assert.notDeepEqual(rgba(applySelectiveColor(orange, settings('reds', {black: 20}, 'absolute'))), rgba(orange));
  assert.notDeepEqual(rgba(applySelectiveColor(orange, settings('yellows', {black: 20}, 'absolute'))), rgba(orange));
});

test('SELECTIVE03 / SYNTHETIC: whites, neutrals and blacks select distinct tone intervals', () => {
  const pixels = image([230, 230, 230], [128, 128, 128], [30, 30, 30]);
  for (const [index, range] of ['whites', 'neutrals', 'blacks'].entries()) {
    const out = applySelectiveColor(pixels, settings(range, {black: -20}, 'absolute'));
    for (let p = 0; p < 3; p++) {
      if (p === index) assert.notDeepEqual(rgba(out, p), rgba(pixels, p));
      else assert.deepEqual(rgba(out, p), rgba(pixels, p), `${range} must not leak to tone ${p}`);
    }
  }
  const gray = image([128, 128, 128]);
  assert.deepEqual(rgba(applySelectiveColor(gray, settings('reds', {black: -100}, 'absolute'))), rgba(gray));
});

test('SELECTIVE04 / SYNTHETIC: C/M/Y/K sign directions map to their documented RGB complements', () => {
  const pixels = image([128, 128, 128]);
  for (const [control, affected] of [['cyan', [0]], ['magenta', [1]], ['yellow', [2]], ['black', [0, 1, 2]]]) {
    const positive = rgba(applySelectiveColor(pixels, settings('neutrals', {[control]: 20}, 'absolute')));
    const negative = rgba(applySelectiveColor(pixels, settings('neutrals', {[control]: -20}, 'absolute')));
    for (let c = 0; c < 3; c++) {
      if (affected.includes(c)) assert.ok(positive[c] < 128 && negative[c] > 128, `${control}/${c}`);
      else assert.equal(positive[c], 128);
    }
  }
});

test('SELECTIVE05 / SYNTHETIC: Relative scales existing ink while Absolute moves a direct amount', () => {
  const pixels = image([128, 128, 128]);
  const relative = rgba(applySelectiveColor(pixels, settings('neutrals', {magenta: 10}, 'relative')));
  const absolute = rgba(applySelectiveColor(pixels, settings('neutrals', {magenta: 10}, 'absolute')));
  assert.ok(relative[1] < 128 && absolute[1] < relative[1]);
  assert.deepEqual(relative.slice(0, 3), [128, 115, 128]);
  assert.deepEqual(absolute.slice(0, 3), [128, 103, 128]);
  const white = image([255, 255, 255]);
  assert.deepEqual(rgba(applySelectiveColor(white, settings('whites', {cyan: 50}, 'relative'))), rgba(white));
  assert.deepEqual(rgba(applySelectiveColor(white, settings('whites', {cyan: 50}, 'absolute'))), [128, 255, 255, 255]);
});

test('SELECTIVE06 / SYNTHETIC: all nine CMYK groups can combine; extreme sliders clamp without wraparound', () => {
  const pixels = image([255, 0, 0], [128, 128, 128], [0, 0, 0]);
  const input = {method: 'absolute', ranges: Object.fromEntries(SELECTIVE_COLOR_RANGES.map(range =>
    [range, {cyan: 100, magenta: -100, yellow: 100, black: -100}]))};
  const out = applySelectiveColor(pixels, input);
  assert.equal(out.data.length, pixels.data.length);
  for (const value of out.data) assert.ok(value >= 0 && value <= 255);
  assert.notDeepEqual(out.data, pixels.data);
  assert.deepEqual(out.data, applySelectiveColor(pixels, input).data);
  assert.deepEqual(pixels.data, image([255, 0, 0], [128, 128, 128], [0, 0, 0]).data);
});

test('SELECTIVE07 / SYNTHETIC: alpha and fully transparent hidden RGB are unchanged and no adjacent pixel is sampled', () => {
  const pixels = image([5, 240, 90, 0], [128, 128, 128, 1], [128, 128, 128, 128], [128, 128, 128, 255]);
  const before = pixels.data.slice();
  const out = applySelectiveColor(pixels, settings('neutrals', {cyan: 40, black: -20}, 'absolute'));
  assert.deepEqual(rgba(out, 0), rgba(pixels, 0));
  assert.deepEqual(rgba(out, 1).slice(0, 3), rgba(out, 2).slice(0, 3));
  assert.deepEqual(rgba(out, 2).slice(0, 3), rgba(out, 3).slice(0, 3));
  assert.deepEqual([rgba(out, 0)[3], rgba(out, 1)[3], rgba(out, 2)[3], rgba(out, 3)[3]], [0, 1, 128, 255]);
  assert.deepEqual(pixels.data, before);
});

test('SELECTIVE08 / SYNTHETIC: strict shape, method and range boundaries reject before source mutation', () => {
  const pixels = image([128, 128, 128]), before = pixels.data.slice();
  for (const bad of [null, [], new Date(), {method: 'percent'}, {method: 'Relative'}, {scope: 'reds'},
    {ranges: null}, {ranges: []}, {ranges: {orange: {}}}, {ranges: {reds: null}},
    {ranges: {reds: {red: 10}}}, {ranges: {reds: {cyan: -101}}}, {ranges: {reds: {cyan: 101}}},
    {ranges: {blacks: {black: 0.5}}}, {ranges: {blacks: {black: NaN}}},
    {ranges: {blacks: {black: Infinity}}}, {ranges: {blacks: {black: '20'}}},
    {[Symbol('unsafe')]: 1}, {ranges: {reds: {[Symbol('unsafe')]: 1}}}, Object.create({ranges: {}})]) {
    assert.throws(() => applySelectiveColor(pixels, bad), /INVALID_SELECTIVE_COLOR|SELECTIVE_COLOR_RANGE/);
  }
  assert.deepEqual(pixels.data, before);
  assert.equal(validateSelectiveColor(settings('reds', {cyan: -100, magenta: 100})).ranges.reds.cyan, -100);
});

test('SELECTIVE09 / SYNTHETIC: abort, malformed and oversize buffers refuse with no source mutation', () => {
  const pixels = {width: 16385, height: 1, data: new Uint8ClampedArray(16385 * 4).fill(128)};
  const before = pixels.data.slice();
  const input = settings('neutrals', {cyan: 50}, 'absolute');
  assert.throws(() => applySelectiveColor(pixels, input, {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() { return ++checks >= 3; }};
  assert.throws(() => applySelectiveColor(pixels, input, {signal}), {name: 'AbortError'});
  assert.ok(checks >= 3);
  assert.deepEqual(pixels.data, before);
  assert.throws(() => applySelectiveColor({width: 1, height: 1, data: new Uint8Array(4)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applySelectiveColor({width: 1, height: 1, data: new Uint8ClampedArray(3)}), /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applySelectiveColor({width: 24_000_001, height: 1, data: new Uint8ClampedArray(0)}), /INVALID_OR_OVERSIZE_PIXELS/);
});
