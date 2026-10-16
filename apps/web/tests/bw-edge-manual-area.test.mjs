import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBlackWhiteEdgeRemoval} from '../src/processing/bw-edge-removal.mjs';
import {applyBlackWhiteEdgeManualArea, BW_EDGE_MANUAL_AREA_VERSION} from
  '../src/processing/bw-edge-manual-area.mjs';

const offset = (width, x, y) => (y * width + x) * 4;
const at = (frame, x, y) => [...frame.data.slice(offset(frame.width, x, y), offset(frame.width, x, y) + 4)];
function fixture(width = 9, height = 9) {
  const data = new Uint8ClampedArray(width * height * 4);
  const subject = new Uint8Array(width * height);
  const correction = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= 1 && x < width - 1 && y >= 1 && y < height - 1;
    subject[y * width + x] = inside ? 255 : 0;
    data.set(inside ? [110, 70, 50, 255] : [15, 35, 60, 255], offset(width, x, y));
  }
  return {frame: {width, height, data}, subject: {width, height, data: subject},
    correction: {width, height, data: correction}};
}

test('BWEDGE-MANUAL-01: positive user area adopts only existing extreme edge result; excluded edge and alpha remain exact', () => {
  const {frame, subject, correction} = fixture();
  frame.data.set([2, 3, 4, 187], offset(9, 1, 4));
  frame.data.set([251, 250, 249, 211], offset(9, 7, 4));
  correction.data[4 * 9 + 1] = 1; // Positive coverage is a binary permit, not a blend strength.
  const source = frame.data.slice(), subjectBefore = subject.data.slice(), correctionBefore = correction.data.slice();
  const unrestricted = applyBlackWhiteEdgeRemoval(frame, subject);
  const out = applyBlackWhiteEdgeManualArea(frame, subject, correction);
  assert.equal(BW_EDGE_MANUAL_AREA_VERSION, 'suite-srgb8-explicit-subject-and-correction-area-1');
  assert.deepEqual(at(out, 1, 4), at(unrestricted, 1, 4));
  assert.deepEqual(at(out, 1, 4), [110, 70, 50, 187]);
  assert.deepEqual(at(out, 7, 4), [251, 250, 249, 211]);
  assert.deepEqual(frame.data, source);
  assert.deepEqual(subject.data, subjectBefore);
  assert.deepEqual(correction.data, correctionBefore);
  assert.notEqual(out.data, frame.data);
});

test('BWEDGE-MANUAL-02: all-zero permit is identity; all-on matches existing pure result', () => {
  const {frame, subject, correction} = fixture();
  frame.data.set([2, 3, 4, 187], offset(9, 1, 4));
  frame.data.set([251, 250, 249, 211], offset(9, 7, 4));
  assert.deepEqual(applyBlackWhiteEdgeManualArea(frame, subject, correction).data, frame.data);
  correction.data.fill(255);
  assert.deepEqual(applyBlackWhiteEdgeManualArea(frame, subject, correction).data,
    applyBlackWhiteEdgeRemoval(frame, subject).data);
});

test('BWEDGE-MANUAL-03: permit alone cannot edit background, interior, chromatic or transparent hidden RGB', () => {
  const {frame, subject, correction} = fixture();
  correction.data.fill(255);
  frame.data.set([1, 1, 1, 255], offset(9, 0, 4)); // Explicit background.
  frame.data.set([2, 3, 4, 255], offset(9, 4, 4)); // Interior, not boundary.
  frame.data.set([50, 3, 2, 255], offset(9, 1, 5)); // Chromatic, not neutral halo.
  frame.data.set([251, 250, 249, 0], offset(9, 1, 2)); // Hidden RGB.
  const out = applyBlackWhiteEdgeManualArea(frame, subject, correction);
  for (const [x, y] of [[0, 4], [4, 4], [1, 5], [1, 2]])
    assert.deepEqual(at(out, x, y), at(frame, x, y));
  for (let pixel = 0; pixel < frame.width * frame.height; pixel++)
    assert.equal(out.data[pixel * 4 + 3], frame.data[pixel * 4 + 3]);
});

test('BWEDGE-MANUAL-04: exact same-size three-key masks, pixel type and capacity fail closed', () => {
  const {frame, subject, correction} = fixture();
  const before = frame.data.slice();
  for (const bad of [null, {...correction, width: 8},
    {...correction, data: new Uint8Array(80)},
    {...correction, data: new Float32Array(81)},
    {...correction, guessedByAI: true},
    Object.assign({...correction}, {[Symbol('extra')]: true})])
    assert.throws(() => applyBlackWhiteEdgeManualArea(frame, subject, bad),
      /BW_EDGE_MANUAL_MASK_INVALID/);
  assert.throws(() => applyBlackWhiteEdgeManualArea(frame, {...subject, height: 8}, correction),
    /BW_EDGE_MANUAL_MASK_INVALID/);
  assert.throws(() => applyBlackWhiteEdgeManualArea({...frame, width: NaN}, subject, correction),
    /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyBlackWhiteEdgeManualArea({...frame, data: new Uint8Array(frame.data.length)}, subject, correction),
    /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(() => applyBlackWhiteEdgeManualArea({width: 8_000_001, height: 1, data: new Uint8ClampedArray(0)}, subject, correction),
    /BW_EDGE_MANUAL_CAPACITY/);
  assert.deepEqual(frame.data, before);
});

test('BWEDGE-MANUAL-05: cancellation before or after pure candidate leaves all inputs unchanged', () => {
  const {frame, subject, correction} = fixture(9, 65);
  frame.data.set([2, 3, 4, 187], offset(9, 1, 30));
  correction.data.fill(255);
  const before = frame.data.slice(), subjectBefore = subject.data.slice(), correctionBefore = correction.data.slice();
  const cancelled = new AbortController(); cancelled.abort();
  assert.throws(() => applyBlackWhiteEdgeManualArea(frame, subject, correction, {signal: cancelled.signal}),
    error => error.name === 'AbortError');
  let reads = 0;
  assert.throws(() => applyBlackWhiteEdgeManualArea(frame, subject, correction,
    {signal: {get aborted() {return ++reads >= 7;}}}), error => error.name === 'AbortError');
  assert.ok(reads >= 7, 'abort is rechecked while applying the permit after pure processing');
  assert.deepEqual(frame.data, before);
  assert.deepEqual(subject.data, subjectBefore);
  assert.deepEqual(correction.data, correctionBefore);
});
