import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBackgroundComposite, validateSubjectMatte, BACKGROUND_COMPOSITE_VERSION} from
  '../src/processing/background-composite.mjs';

const context = Object.freeze({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), savedRevision: 7});

function fixture(width = 2, height = 2) {
  const original = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const replacement = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const mask = {width, height, data: new Uint8Array(width * height), provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    ...context, width, height}};
  return {original, replacement, mask};
}

test('BG-COMP-01: explicit matte composites foreground, background and partial coverage non-destructively', () => {
  const {original, replacement, mask} = fixture();
  original.data.set([200, 40, 20, 255, 50, 180, 20, 255,
    200, 40, 20, 255, 98, 97, 96, 0]);
  replacement.data.set([20, 40, 200, 255, 20, 40, 200, 255,
    20, 40, 200, 255, 80, 70, 60, 0]);
  mask.data.set([255, 0, 128, 0]);
  original.provenance = {kind: 'original-decoded-only'};
  const sourceBefore = new Uint8ClampedArray(original.data);
  const backgroundBefore = new Uint8ClampedArray(replacement.data);
  const maskBefore = new Uint8Array(mask.data);
  const result = applyBackgroundComposite(original, replacement, mask, context);
  assert.equal(BACKGROUND_COMPOSITE_VERSION, 'suite-srgb8-explicit-subject-matte-1');
  assert.deepEqual([...result.data], [200, 40, 20, 255, 20, 40, 200, 255,
    110, 40, 110, 255, 0, 0, 0, 0]);
  assert.notEqual(result.data, original.data);
  assert.equal(Object.hasOwn(result, 'provenance'), false);
  assert.deepEqual(original.data, sourceBefore);
  assert.deepEqual(replacement.data, backgroundBefore);
  assert.deepEqual(mask.data, maskBefore);
});

test('BG-COMP-02: partial source/background alpha follows source-over and never leaks hidden RGB', () => {
  const {original, replacement, mask} = fixture(2, 1);
  original.data.set([240, 20, 40, 128, 250, 240, 230, 1]);
  replacement.data.set([20, 80, 220, 128, 180, 170, 160, 0]);
  mask.data.set([128, 1]);
  const output = applyBackgroundComposite(original, replacement, mask, context);
  const subjectAlpha = 128 / 255 * 128 / 255;
  const backAlpha = 128 / 255;
  const finalAlpha = subjectAlpha + backAlpha * (1 - subjectAlpha);
  assert.equal(output.data[3], Math.round(finalAlpha * 255));
  for (let channel = 0; channel < 3; channel++)
    assert.equal(output.data[channel], Math.round((original.data[channel] * subjectAlpha +
      replacement.data[channel] * backAlpha * (1 - subjectAlpha)) / finalAlpha));
  assert.deepEqual([...output.data.slice(4)], [0, 0, 0, 0]);
});

test('BG-COMP-03: mask provenance must bind same Asset, Original SHA, revision, size and accepted source', () => {
  const {original, replacement, mask} = fixture();
  assert.equal(validateSubjectMatte(mask, context, 2, 2), mask.provenance);
  const invalidProofs = [
    {assetID: '22222222-2222-4222-8222-222222222222'},
    {originalSHA256: 'b'.repeat(64)}, {savedRevision: 8}, {width: 3}, {height: 3},
    {kind: 'face-oval'}, {source: 'local-levels-brush'}, {source: 'face-oval'},
    {source: 'unverified-import'}, {unused: true}
  ];
  for (const changes of invalidProofs) {
    const modified = {...mask, provenance: {...mask.provenance, ...changes}};
    assert.throws(() => applyBackgroundComposite(original, replacement, modified, context),
      /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  }
  for (const changes of [{assetID: 'not-an-id'}, {originalSHA256: 'bad'},
    {savedRevision: 0}, {unused: true}])
    assert.throws(() => applyBackgroundComposite(original, replacement, mask,
      {...context, ...changes}), /BACKGROUND_COMPOSITE_CONTEXT_INVALID/);
});

test('BG-COMP-04: absent/ambiguous matte or mismatched replacement geometry is rejected', () => {
  const {original, replacement, mask} = fixture();
  assert.throws(() => applyBackgroundComposite(original, replacement, undefined, context),
    /BACKGROUND_COMPOSITE_MASK_INVALID/);
  for (const invalid of [{...mask, data: new Uint8Array(3)},
    {...mask, data: new Float32Array(4)}, {...mask, localBrush: true},
    {...mask, width: 1}])
    assert.throws(() => applyBackgroundComposite(original, replacement, invalid, context),
      /BACKGROUND_COMPOSITE_MASK_INVALID/);
  assert.throws(() => applyBackgroundComposite(original,
    {width: 1, height: 2, data: new Uint8ClampedArray(8)}, mask, context),
  /BACKGROUND_COMPOSITE_DIMENSION_MISMATCH/);
});

test('BG-COMP-05: abort before or during composition leaves every input byte unchanged', () => {
  const {original, replacement, mask} = fixture(2, 65);
  original.data.fill(90);replacement.data.fill(30);mask.data.fill(128);
  const originalBefore = new Uint8ClampedArray(original.data);
  const replacementBefore = new Uint8ClampedArray(replacement.data);
  const maskBefore = new Uint8Array(mask.data);
  const aborted = new AbortController();aborted.abort();
  assert.throws(() => applyBackgroundComposite(original, replacement, mask, context,
    {signal: aborted.signal}), error => error.name === 'AbortError');
  let reads = 0;
  const during = {get aborted() {return ++reads >= 3;}};
  assert.throws(() => applyBackgroundComposite(original, replacement, mask, context,
    {signal: during}), error => error.name === 'AbortError');
  assert.ok(reads >= 3);
  assert.deepEqual(original.data, originalBefore);
  assert.deepEqual(replacement.data, replacementBefore);
  assert.deepEqual(mask.data, maskBefore);
});
