import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {applyExportOutputSharpening, MAX_OUTPUT_SHARPEN_PIXELS, OUTPUT_SHARPENING_VERSION, validateOutputSharpening} from '../src/export-output-adjustments.mjs';
import {resizeExportPixels} from '../src/export-size.mjs';

const manual = {kind: 'manual', gain: 1.4, radiusPx: 1, thresholdLuma: 0};

function row(values, alpha = values.map(() => 255)) {
  const data = new Uint8ClampedArray(values.length * 4);
  for (let x = 0; x < values.length; x++) data.set([values[x], values[x], values[x], alpha[x]], x * 4);
  return {width: values.length, height: 1, data};
}

test('OUTPUT-SHARP-01 documented no-additional-sharpening default and explicit zero are exact identities, with independent output', () => {
  const source = row([30, 90, 160, 220]);
  source.sourceWidth = 8; source.sourceHeight = 2;
  const before = source.data.slice();
  for (const result of [applyExportOutputSharpening(source), applyExportOutputSharpening(source, {...manual, gain: 0})]) {
    assert.deepEqual(result.data, before);
    assert.notStrictEqual(result.data, source.data);
    assert.equal(result.sourceWidth, 8);
    result.data[0] = 255;
    assert.deepEqual(source.data, before);
  }
  assert.match(OUTPUT_SHARPENING_VERSION, /suite-export-srgb8/);
});

test('OUTPUT-SHARP-02 explicit export-only adjustment changes actual edge pixels, retaining source and alpha', () => {
  const source = row([100, 100, 100, 180, 180, 180]);
  const before = source.data.slice();
  const result = applyExportOutputSharpening(source, manual);
  assert.ok(result.data[2 * 4] < source.data[2 * 4], 'dark side becomes darker');
  assert.ok(result.data[3 * 4] > source.data[3 * 4], 'bright side becomes brighter');
  assert.deepEqual([...result.data].filter((_, offset) => offset % 4 === 3), Array(6).fill(255));
  assert.deepEqual(source.data, before, 'Original rendered frame is never edited');
  assert.deepEqual(applyExportOutputSharpening(source, manual).data, result.data, 'deterministic');
});

test('OUTPUT-SHARP-03 threshold suppresses low-contrast detail, RGB receives only shared luminance delta', () => {
  const source = row([120, 122, 120]);
  assert.deepEqual(applyExportOutputSharpening(source, {...manual, thresholdLuma: 64}).data, source.data);
  const color = {width: 3, height: 1, data: new Uint8ClampedArray([
    100, 110, 120, 255, 140, 150, 160, 255, 100, 110, 120, 255,
  ])};
  const result = applyExportOutputSharpening(color, manual);
  assert.notDeepEqual(result.data, color.data);
  assert.equal(result.data[4] - color.data[4], result.data[5] - color.data[5]);
  assert.equal(result.data[5] - color.data[5], result.data[6] - color.data[6]);
});

test('OUTPUT-SHARP-04 hidden transparent RGB neither changes nor leaks; partial alpha is preserved', () => {
  const clean = row([80, 128, 180], [255, 0, 128]);
  const dirty = row([80, 255, 180], [255, 0, 128]);
  const cleanResult = applyExportOutputSharpening(clean, manual);
  const dirtyResult = applyExportOutputSharpening(dirty, manual);
  assert.deepEqual([...cleanResult.data.slice(0, 4)], [...dirtyResult.data.slice(0, 4)]);
  assert.deepEqual([...cleanResult.data.slice(8, 12)], [...dirtyResult.data.slice(8, 12)]);
  assert.deepEqual([...dirtyResult.data.slice(4, 8)], [...dirty.data.slice(4, 8)]);
  assert.equal(dirtyResult.data[11], 128);
  assert.deepEqual(dirty.data, row([80, 255, 180], [255, 0, 128]).data);
});

test('OUTPUT-SHARP-05 explicit settings only: no invented Screen/Print preset mapping or Editor adjustment reuse', () => {
  const foreign = vm.runInNewContext('({kind:"manual",gain:1,radiusPx:1,thresholdLuma:2})');
  assert.deepEqual({...validateOutputSharpening(foreign)}, {kind: 'manual', gain: 1, radiusPx: 1, thresholdLuma: 2});
  for (const settings of [
    {kind: 'screen-low'}, {kind: 'print-high'}, {kind: 'manual', gain: 1, radiusPx: 1},
    {...manual, sharpness: 80}, Object.assign(new Date(), manual),
    {...manual, [Symbol('secret')]: 1},
  ]) assert.throws(() => applyExportOutputSharpening(row([1, 2, 3]), settings), /OUTPUT_SHARPENING_/);
  for (const [key, invalid] of [['gain', NaN], ['gain', -1], ['gain', 2.1], ['radiusPx', 0], ['radiusPx', 4], ['thresholdLuma', -1], ['thresholdLuma', 65]])
    assert.throws(() => validateOutputSharpening({...manual, [key]: invalid}), new RegExp('OUTPUT_SHARPENING_RANGE_' + key.toUpperCase()));
});

test('OUTPUT-SHARP-06 abort and active memory cap fail closed before returning partial output', () => {
  const source = row(Array(256).fill(128));
  assert.throws(() => applyExportOutputSharpening(source, manual, {signal: {aborted: true}}), {name: 'AbortError'});
  let reads = 0;
  assert.throws(() => applyExportOutputSharpening(source, manual, {signal: {get aborted() { return ++reads > 3; }}}), {name: 'AbortError'});
  assert.equal(MAX_OUTPUT_SHARPEN_PIXELS, 12_000_000);
  const oversized = {width: MAX_OUTPUT_SHARPEN_PIXELS + 1, height: 1, data: new Uint8ClampedArray((MAX_OUTPUT_SHARPEN_PIXELS + 1) * 4)};
  assert.throws(() => applyExportOutputSharpening(oversized, manual), /OUTPUT_SHARPENING_MEMORY_LIMIT/);
  assert.throws(() => applyExportOutputSharpening({width: 0, height: 1, data: new Uint8ClampedArray()}, manual), /INVALID_OR_OVERSIZE_PIXELS/);
});

test('OUTPUT-SHARP-07 applies to an already-resized Final frame; resizing and sharpening are distinct operations', () => {
  const source = {width: 8, height: 2, data: new Uint8ClampedArray(8 * 2 * 4)};
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) source.data.set([x < 4 ? 70 : 180, x < 4 ? 70 : 180, x < 4 ? 70 : 180, 255], (y * 8 + x) * 4);
  const before = source.data.slice();
  const reduced = resizeExportPixels(source, {kind: 'width', value: 4});
  const sharpened = applyExportOutputSharpening(reduced, manual);
  assert.equal(sharpened.width, 4);
  assert.equal(sharpened.height, 1);
  assert.notDeepEqual(sharpened.data, reduced.data);
  assert.deepEqual(source.data, before);
});

test('OUTPUT-SHARP-08 one-pixel, flat, and border frames remain stable without invented detail', () => {
  for (const source of [row([17]), row([92, 92, 92]), {width: 1, height: 3, data: new Uint8ClampedArray([70, 80, 90, 255, 70, 80, 90, 255, 70, 80, 90, 255])}]) {
    const result = applyExportOutputSharpening(source, manual);
    assert.deepEqual(result.data, source.data);
  }
});
