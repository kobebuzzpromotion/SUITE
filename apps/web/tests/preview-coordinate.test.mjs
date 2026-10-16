import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPreviewClick} from '../src/preview-coordinate.mjs';
import {sampleLevelsEndpoint} from '../src/processing/levels-sampler.mjs';

const box = (left, top, width, height) => ({left, top, width, height});

test('PREVIEW-COORD01: contain landscape image in square box maps content edges and centre', () => {
  const base = {afterRect: box(100, 50, 400, 400), naturalWidth: 4000, naturalHeight: 2000};
  assert.deepEqual(mapPreviewClick({...base, clientX: 100, clientY: 150}), {x: 0, y: 0});
  assert.deepEqual(mapPreviewClick({...base, clientX: 300, clientY: 250}), {x: .5, y: .5});
  assert.deepEqual(mapPreviewClick({...base, clientX: 500, clientY: 350}), {x: 1, y: 1});
  for (const clientY of [149, 351, 50, 450])
    assert.throws(() => mapPreviewClick({...base, clientX: 300, clientY}), /PREVIEW_CONTAIN_LETTERBOX/);
});

test('PREVIEW-COORD02: portrait image letterboxes left/right without accidental sampling', () => {
  const base = {afterRect: box(20, 30, 400, 200), naturalWidth: 100, naturalHeight: 200};
  assert.deepEqual(mapPreviewClick({...base, clientX: 220, clientY: 130}), {x: .5, y: .5});
  assert.throws(() => mapPreviewClick({...base, clientX: 169, clientY: 130}), /PREVIEW_CONTAIN_LETTERBOX/);
  assert.throws(() => mapPreviewClick({...base, clientX: 271, clientY: 130}), /PREVIEW_CONTAIN_LETTERBOX/);
});

test('PREVIEW-COORD03: split comparison rejects Before pane and uses After geometry only', () => {
  const base = {view: 'split', beforeRect: box(0, 0, 300, 300), afterRect: box(320, 0, 300, 300),
    naturalWidth: 300, naturalHeight: 300};
  assert.throws(() => mapPreviewClick({...base, clientX: 150, clientY: 150}), /PREVIEW_BEFORE_REGION/);
  assert.deepEqual(mapPreviewClick({...base, clientX: 470, clientY: 150}), {x: .5, y: .5});
  assert.throws(() => mapPreviewClick({...base, clientX: 310, clientY: 150}), /PREVIEW_OUTSIDE_AFTER/);
  assert.throws(() => mapPreviewClick({...base, beforeRect: undefined,
    clientX: 470, clientY: 150}), /PREVIEW_RECT_INVALID/);
  assert.throws(() => mapPreviewClick({...base, view: 'before',
    clientX: 470, clientY: 150}), /PREVIEW_AFTER_REQUIRED/);
});

test('PREVIEW-COORD04: invalid client coordinates, boxes and unloaded dimensions fail closed', () => {
  const base = {afterRect: box(0, 0, 100, 100), naturalWidth: 100, naturalHeight: 100,
    clientX: 25, clientY: 25};
  for (const overrides of [
    {afterRect: box(0, 0, 0, 100)}, {afterRect: box(NaN, 0, 100, 100)},
    {naturalWidth: 0}, {naturalHeight: NaN}, {naturalWidth: 1.5},
    {clientX: NaN}, {clientY: Infinity}, {clientX: -1}, {clientY: 101},
  ]) assert.throws(() => mapPreviewClick({...base, ...overrides}));
});

test('PREVIEW-COORD05: decoded orientation dimensions map directly into RGB Levels sampler', () => {
  // The browser has already oriented this portrait RGBA8 frame. No second
  // EXIF rotation or raw width/height swap is part of this conversion.
  const pixels = {width: 2, height: 4, data: new Uint8ClampedArray([
    10, 10, 10, 255, 20, 20, 20, 255,
    30, 30, 30, 255, 40, 40, 40, 255,
    50, 50, 50, 255, 60, 60, 60, 255,
    70, 70, 70, 255, 80, 80, 80, 255,
  ])};
  const position = mapPreviewClick({afterRect: box(100, 100, 200, 200),
    naturalWidth: 2, naturalHeight: 4, clientX: 225, clientY: 225});
  const picked = sampleLevelsEndpoint(pixels, {...position, channel: 'red', endpoint: 'black'});
  assert.deepEqual(picked.pixel, {x: 1, y: 2});
  assert.equal(picked.value, 60);
});
