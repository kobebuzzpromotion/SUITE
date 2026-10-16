import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAddShadow} from '../src/processing/add-shadow.mjs';
import {applyOriginalShadow, ORIGINAL_SHADOW_MAX_PIXELS, ORIGINAL_SHADOW_VERSION} from '../src/processing/original-shadow.mjs';

function frame(width = 5, height = 3, color = [200, 180, 160, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return {width, height, data};
}
function mask(width = 5, height = 3) { return {width, height, data: new Uint8Array(width * height)}; }
function at(image, x, y) { return [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)]; }
function put(image, x, y, value) { image.data.set(value, (y * image.width + x) * 4); }

test('ORIGINAL-SHADOW-01: explicit shadow transfers only original darkness; source, masks, alpha and foreground are unchanged', () => {
  const original = frame(), composite = frame(5, 3, [100, 120, 140, 255]);
  const subject = mask(), shadow = mask();
  put(original, 2, 1, [51, 51, 51, 255]); shadow.data[1 * 5 + 2] = 255;
  put(original, 3, 1, [10, 10, 10, 255]); shadow.data[1 * 5 + 3] = 255; subject.data[1 * 5 + 3] = 128;
  const before = [original.data.slice(), composite.data.slice(), subject.data.slice(), shadow.data.slice()];
  const result = applyOriginalShadow(original, composite, subject, shadow);
  assert.equal(ORIGINAL_SHADOW_VERSION, 'suite-srgb8-explicit-original-shadow-1');
  assert.notEqual(result.data, composite.data);
  assert.deepEqual(at(result, 2, 1), [20, 24, 28, 255]);
  assert.deepEqual(at(result, 3, 1), at(composite, 3, 1));
  assert.deepEqual(at(result, 0, 0), at(composite, 0, 0));
  for (let i = 3; i < result.data.length; i += 4) assert.equal(result.data[i], composite.data[i]);
  assert.deepEqual([original.data, composite.data, subject.data, shadow.data], before);
});

test('ORIGINAL-SHADOW-02: partial mask/opacity scale effect; white original, zero opacity, and empty mask are identities', () => {
  const original = frame(), composite = frame(5, 3, [100, 100, 100, 255]);
  const subject = mask(), shadow = mask();
  put(original, 1, 1, [0, 0, 0, 255]); shadow.data[6] = 128;
  const half = applyOriginalShadow(original, composite, subject, shadow, {opacity: 50});
  assert.deepEqual(at(half, 1, 1), [75, 75, 75, 255]);
  const zero = applyOriginalShadow(original, composite, subject, shadow, {opacity: 0});
  assert.deepEqual(zero.data, composite.data); assert.notEqual(zero.data, composite.data);
  const empty = applyOriginalShadow(original, composite, subject, mask());
  assert.deepEqual(empty.data, composite.data);
  put(original, 1, 1, [255, 255, 255, 255]);
  assert.deepEqual(applyOriginalShadow(original, composite, subject, shadow).data, composite.data);
});

test('ORIGINAL-SHADOW-03: hidden RGB and alpha-zero source are untouched; partial source alpha scales darkness', () => {
  const original = frame(), composite = frame();
  const subject = mask(), shadow = mask();
  shadow.data[0] = 255; shadow.data[1] = 255; shadow.data[2] = 255;
  put(original, 0, 0, [0, 0, 0, 255]); put(composite, 0, 0, [99, 88, 77, 0]);
  put(original, 1, 0, [0, 0, 0, 0]);
  put(original, 2, 0, [0, 0, 0, 128]);
  const result = applyOriginalShadow(original, composite, subject, shadow);
  assert.deepEqual(at(result, 0, 0), [99, 88, 77, 0]);
  assert.deepEqual(at(result, 1, 0), at(composite, 1, 0));
  assert.deepEqual(at(result, 2, 0), [100, 90, 80, 255]);
});

test('ORIGINAL-SHADOW-04: added shadow is retained where original mask is absent and can coexist where present', () => {
  const original = frame(7, 4), base = frame(7, 4, [200, 200, 200, 255]);
  const subject = mask(7, 4), shadow = mask(7, 4);
  subject.data[1 * 7 + 1] = 255;
  const added = applyAddShadow(base, subject, {
    mode: 'drop', opacity: 50, blur: 0, gradient: 0, blend: 'normal',
    offsetX: 1, offsetY: 0, shadowColor: [0, 0, 0]
  });
  put(original, 2, 1, [0, 0, 0, 255]); shadow.data[1 * 7 + 2] = 128;
  const retained = applyOriginalShadow(original, added, subject, shadow);
  assert.ok(at(retained, 2, 1)[0] < at(added, 2, 1)[0]);
  assert.deepEqual(at(retained, 1, 1), at(added, 1, 1));
  assert.deepEqual(at(retained, 4, 1), at(added, 4, 1));
  assert.deepEqual(base.data.slice(0, 4), new Uint8ClampedArray([200, 200, 200, 255]));
});

test('ORIGINAL-SHADOW-05: dimensions, types, extra options, and capacity fail closed', () => {
  const original = frame(), composite = frame(), subject = mask(), shadow = mask();
  for (const opacity of [-1, 101, 1.5, Infinity, NaN, '20'])
    assert.throws(() => applyOriginalShadow(original, composite, subject, shadow, {opacity}), /ORIGINAL_SHADOW_OPTIONS_INVALID/);
  assert.throws(() => applyOriginalShadow(original, composite, subject, shadow, {autoExtract: true}), /ORIGINAL_SHADOW_OPTIONS_INVALID/);
  assert.throws(() => applyOriginalShadow(original, frame(4, 3), subject, shadow), /ORIGINAL_SHADOW_DIMENSIONS_MISMATCH/);
  assert.throws(() => applyOriginalShadow(original, composite, {...subject, width: 4}, shadow), /ORIGINAL_SHADOW_SUBJECT_MASK_INVALID/);
  assert.throws(() => applyOriginalShadow(original, composite, subject, {...shadow, data: []}), /ORIGINAL_SHADOW_SHADOW_MASK_INVALID/);
  assert.throws(() => applyOriginalShadow(original, composite, subject, {...shadow, extra: true}), /ORIGINAL_SHADOW_SHADOW_MASK_INVALID/);
  assert.equal(ORIGINAL_SHADOW_MAX_PIXELS, 8_000_000);
  const large = frame(3000, 3000);
  assert.throws(() => applyOriginalShadow(large, large, mask(3000, 3000), mask(3000, 3000)), /ORIGINAL_SHADOW_CAPACITY/);
});

test('ORIGINAL-SHADOW-06: abort before/during a render publishes no result or input mutation', () => {
  const original = frame(2, 65, [0, 0, 0, 255]), composite = frame(2, 65);
  const subject = mask(2, 65), shadow = mask(2, 65); shadow.data.fill(255);
  const before = [original.data.slice(), composite.data.slice(), subject.data.slice(), shadow.data.slice()];
  assert.throws(() => applyOriginalShadow(original, composite, subject, shadow, {signal: {aborted: true}}), {name: 'AbortError'});
  let reads = 0;
  assert.throws(() => applyOriginalShadow(original, composite, subject, shadow,
    {signal: {get aborted() {return ++reads > 2;}}}), {name: 'AbortError'});
  assert.deepEqual([original.data, composite.data, subject.data, shadow.data], before);
});
