import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBlackWhiteEdgeRemoval, BW_EDGE_REMOVAL_VERSION} from
  '../src/processing/bw-edge-removal.mjs';

const index = (width, x, y) => (y * width + x) * 4;
function fixture(width = 9, height = 9) {
  const data = new Uint8ClampedArray(width * height * 4);
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const subject = x >= 1 && x < width - 1 && y >= 1 && y < height - 1;
    coverage[y * width + x] = subject ? 255 : 0;
    data.set(subject ? [110, 70, 50, 255] : [15, 35, 60, 255], index(width, x, y));
  }
  return {frame: {width, height, data}, mask: {width, height, data: coverage}};
}
const rgba = (frame, x, y) => [...frame.data.slice(index(frame.width, x, y), index(frame.width, x, y) + 4)];

test('BWEDGE-01: explicit mask corrects black and white fringe at subject boundary only', () => {
  const {frame, mask} = fixture();
  frame.data.set([2, 3, 4, 187], index(9, 1, 4));
  frame.data.set([251, 250, 249, 211], index(9, 7, 4));
  const source = new Uint8ClampedArray(frame.data), coverage = new Uint8Array(mask.data);
  const out = applyBlackWhiteEdgeRemoval(frame, mask);
  assert.equal(BW_EDGE_REMOVAL_VERSION, 'suite-srgb8-explicit-mask-bw-edge-1');
  assert.deepEqual(rgba(out, 1, 4), [110, 70, 50, 187]);
  assert.deepEqual(rgba(out, 7, 4), [110, 70, 50, 211]);
  assert.deepEqual(rgba(out, 4, 4), [110, 70, 50, 255]);
  assert.deepEqual(rgba(out, 0, 4), [15, 35, 60, 255]);
  assert.notEqual(out.data, frame.data);
  assert.deepEqual(frame.data, source);
  assert.deepEqual(mask.data, coverage);
});

test('BWEDGE-02: no broad blur, no alpha edit, no hidden RGB edit or interior skin edit', () => {
  const {frame, mask} = fixture();
  frame.data.set([250, 251, 252, 0], index(9, 1, 2));
  frame.data.set([120, 50, 40, 255], index(9, 4, 4));
  frame.data.set([5, 5, 5, 255], index(9, 0, 4));
  frame.data.set([50, 3, 2, 255], index(9, 1, 5)); // chromatic edge, not a neutral black halo
  const out = applyBlackWhiteEdgeRemoval(frame, mask);
  assert.deepEqual(rgba(out, 1, 2), [250, 251, 252, 0]);
  assert.deepEqual(rgba(out, 4, 4), [120, 50, 40, 255]);
  assert.deepEqual(rgba(out, 0, 4), [5, 5, 5, 255]);
  assert.deepEqual(rgba(out, 1, 5), [50, 3, 2, 255]);
});

test('BWEDGE-03: genuine matching dark/white edges and unresolvable thin subject stay unchanged', () => {
  for (const color of [3, 250]) {
    const {frame, mask} = fixture();
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++)
      frame.data.set([color, color, color, 255], index(9, x, y));
    assert.deepEqual(applyBlackWhiteEdgeRemoval(frame, mask).data, frame.data);
  }
  const {frame, mask} = fixture(5, 5);
  mask.data.fill(0);mask.data[2 * 5 + 2] = 255;
  frame.data.set([1, 1, 1, 255], index(5, 2, 2));
  assert.deepEqual(applyBlackWhiteEdgeRemoval(frame, mask).data, frame.data);
});

test('BWEDGE-04: missing, mismatched or malformed explicit mask rejects before modification', () => {
  const {frame, mask} = fixture();
  const before = new Uint8ClampedArray(frame.data);
  for (const invalid of [undefined, {...mask, width: 8},
    {...mask, data: new Uint8Array(80)}, {...mask, data: new Float32Array(81)},
    {...mask, guessedByAI: true}])
    assert.throws(() => applyBlackWhiteEdgeRemoval(frame, invalid), /BW_EDGE_MASK_INVALID/);
  assert.deepEqual(frame.data, before);
});

test('BWEDGE-05: abort before or during processing never changes frame or mask', () => {
  const {frame, mask} = fixture(9, 65);
  frame.data.set([1, 1, 1, 255], index(9, 1, 30));
  const before = new Uint8ClampedArray(frame.data), maskBefore = new Uint8Array(mask.data);
  const cancelled = new AbortController();cancelled.abort();
  assert.throws(() => applyBlackWhiteEdgeRemoval(frame, mask, {signal: cancelled.signal}),
    error => error.name === 'AbortError');
  let reads = 0;
  const during = {get aborted() {return ++reads >= 3;}};
  assert.throws(() => applyBlackWhiteEdgeRemoval(frame, mask, {signal: during}),
    error => error.name === 'AbortError');
  assert.ok(reads >= 3);
  assert.deepEqual(frame.data, before);
  assert.deepEqual(mask.data, maskBefore);
});
