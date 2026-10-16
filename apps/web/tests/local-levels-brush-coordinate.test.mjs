import test from 'node:test';
import assert from 'node:assert/strict';
import {mapAfterToLocalBrushPoint, mapAfterImagePointToLocalBrushPoint,
  mapLocalBrushPointToAfter} from '../src/local-levels-brush-coordinate.mjs';
import {rotateCropPixels} from '../src/processing/pure.mjs';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {expandCanvasPixels} from '../src/processing/canvas-expand.mjs';

const box = (left, top, width, height) => ({left, top, width, height});
function clientForPixel(afterRect, naturalWidth, naturalHeight, x, y) {
  const scale = Math.min(afterRect.width / naturalWidth, afterRect.height / naturalHeight);
  const left = afterRect.left + (afterRect.width - naturalWidth * scale) / 2;
  const top = afterRect.top + (afterRect.height - naturalHeight * scale) / 2;
  return {clientX: left + (x + .5) * scale, clientY: top + (y + .5) * scale};
}
function clientForFraction(afterRect, naturalWidth, naturalHeight, x, y) {
  const scale = Math.min(afterRect.width / naturalWidth, afterRect.height / naturalHeight);
  const left = afterRect.left + (afterRect.width - naturalWidth * scale) / 2;
  const top = afterRect.top + (afterRect.height - naturalHeight * scale) / 2;
  return {clientX: left + x * naturalWidth * scale,
    clientY: top + y * naturalHeight * scale};
}
function source(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    data.set([x, y, 100, 255], (y * width + x) * 4);
  return {width, height, data};
}
const cropFor = rotation => ({crop_rect: {x: .25, y: .25, width: .5, height: .5}, rotation});

test('LOCAL-COORD01: 0/90/180/270 inverse points address exactly the original pixel with Crop', () => {
  const upright = source(12, 8), afterRect = box(100, 50, 400, 300);
  for (const rotationDegrees of [0, 90, 180, 270]) {
    for (const crop of [undefined, cropFor(rotationDegrees)]) {
      const output = rotateCropPixels(upright, rotationDegrees, crop,
        {resolutionAssessment: () => {}});
      for (const [x, y] of [[0, 0], [Math.floor(output.width / 2), Math.floor(output.height / 2)],
        [output.width - 1, output.height - 1]]) {
        const pointer = clientForPixel(afterRect, output.width, output.height, x, y);
        const point = mapAfterToLocalBrushPoint({afterRect, ...pointer,
          naturalWidth: output.width, naturalHeight: output.height,
          uprightWidth: upright.width, uprightHeight: upright.height, rotationDegrees, crop});
        const originalX = Math.floor(point.x * upright.width);
        const originalY = Math.floor(point.y * upright.height);
        const from = (originalY * upright.width + originalX) * 4;
        const at = (y * output.width + x) * 4;
        assert.deepEqual(output.data.slice(at, at + 4), upright.data.slice(from, from + 4),
          `rotation=${rotationDegrees}, crop=${Boolean(crop)}, pixel=${x},${y}`);
      }
    }
  }
});

test('LOCAL-COORD02: contain letterbox, Before pane, stale dimensions and malformed geometry refuse', () => {
  const base = {afterRect: box(320, 0, 300, 300), beforeRect: box(0, 0, 300, 300),
    view: 'split', naturalWidth: 12, naturalHeight: 8,
    uprightWidth: 12, uprightHeight: 8, rotationDegrees: 0};
  assert.throws(() => mapAfterToLocalBrushPoint({...base, clientX: 150, clientY: 150}),
    /PREVIEW_BEFORE_REGION/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, clientX: 470, clientY: 5}),
    /PREVIEW_CONTAIN_LETTERBOX/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, clientX: 310, clientY: 150}),
    /PREVIEW_OUTSIDE_AFTER/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, view: 'before',
    clientX: 470, clientY: 150}), /PREVIEW_AFTER_REQUIRED/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, naturalWidth: 11,
    clientX: 470, clientY: 150}), /LOCAL_BRUSH_AFTER_DIMENSIONS_MISMATCH/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, rotationDegrees: 45,
    clientX: 470, clientY: 150}), /LOCAL_BRUSH_ROTATION_INVALID/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, uprightWidth: 0,
    clientX: 470, clientY: 150}), /LOCAL_BRUSH_SOURCE_DIMENSIONS_INVALID/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, crop: cropFor(90),
    clientX: 470, clientY: 150}), /LOCAL_BRUSH_CROP_INVALID/);
  assert.throws(() => mapAfterToLocalBrushPoint({...base, crop: {rotation: 0,
    crop_rect: {x: .99, y: 0, width: .01, height: 1}},
    clientX: 470, clientY: 150}), /LOCAL_BRUSH_CROP_PROJECTION_INVALID/);
});

test('LOCAL-COORD03: Proxy and Final map the same displayed fraction to the same source region', () => {
  const afterRect = box(20, 30, 400, 300), rotationDegrees = 90;
  const crop = {rotation: 90, crop_rect: {x: .1, y: .2, width: .5, height: .5}};
  const map = (uprightWidth, uprightHeight) => {
    const naturalWidth = uprightHeight * .5, naturalHeight = uprightWidth * .5;
    const pointer = clientForFraction(afterRect, naturalWidth, naturalHeight, .32, .67);
    return mapAfterToLocalBrushPoint({afterRect, ...pointer, naturalWidth, naturalHeight,
      uprightWidth, uprightHeight, rotationDegrees, crop});
  };
  const proxy = map(120, 80), final = map(1200, 800);
  assert.ok(Math.abs(proxy.x - final.x) < 1e-12);
  assert.ok(Math.abs(proxy.y - final.y) < 1e-12);
  assert.ok(proxy.x >= 0 && proxy.x <= 1 && proxy.y >= 0 && proxy.y <= 1);
});

test('LOCAL-COORD04: mapping is pure and produces a frozen normalized point', () => {
  const input = {afterRect: box(0, 0, 100, 100), naturalWidth: 4, naturalHeight: 2,
    uprightWidth: 4, uprightHeight: 2, rotationDegrees: 0,
    clientX: 50, clientY: 50};
  const before = structuredClone(input), point = mapAfterToLocalBrushPoint(input);
  assert.deepEqual(point, {x: .5, y: .5});
  assert.equal(Object.isFrozen(point), true);
  assert.deepEqual(input, before);
});

test('LOCAL-COORD05: saved strokes round-trip through rotation/Crop/contain and keyboard After point', () => {
  const upright = source(120, 80), afterRect = box(100, 50, 401, 301);
  for (const rotationDegrees of [0, 90, 180, 270]) {
    for (const crop of [undefined, cropFor(rotationDegrees)]) {
      const output = rotateCropPixels(upright, rotationDegrees, crop,
        {resolutionAssessment: () => {}});
      const geometry = {afterRect, naturalWidth: output.width, naturalHeight: output.height,
        uprightWidth: upright.width, uprightHeight: upright.height, rotationDegrees, crop};
      const original = {x: .45, y: .6};
      const after = mapLocalBrushPointToAfter({...geometry, ...original});
      assert.equal(Object.isFrozen(after), true);
      const pointer = mapAfterToLocalBrushPoint({...geometry,
        clientX: after.clientX, clientY: after.clientY});
      const keyboard = mapAfterImagePointToLocalBrushPoint({...geometry,
        afterX: after.afterX, afterY: after.afterY});
      for (const result of [pointer, keyboard]) {
        assert.ok(Math.abs(result.x - original.x) < 1e-12, `x at ${rotationDegrees}`);
        assert.ok(Math.abs(result.y - original.y) < 1e-12, `y at ${rotationDegrees}`);
      }
    }
  }
});

test('LOCAL-COORD06: Canvas Expand margins map post-Crop Proxy/Final and reject padding', () => {
  const canvasExpand = {schemaVersion: 1,
    margins: {left: .25, right: .5, top: .5, bottom: .25},
    background: [255, 255, 255, 255]};
  const original = {x: .45, y: .6}, afterRect = box(10, 20, 401, 301);
  for (const [uprightWidth, uprightHeight] of [[120, 80], [1200, 800]]) {
    const rotationDegrees = 90, crop = cropFor(rotationDegrees);
    const cropPixels = rotateCropPixels(source(uprightWidth, uprightHeight),
      rotationDegrees, crop, {resolutionAssessment: () => {}});
    const expanded = expandCanvasPixels(cropPixels,
      projectCanvasExpansion(cropPixels, canvasExpand));
    const geometry = {afterRect, naturalWidth: expanded.width, naturalHeight: expanded.height,
      uprightWidth, uprightHeight, rotationDegrees, crop, canvasExpand};
    const after = mapLocalBrushPointToAfter({...geometry, ...original});
    for (const result of [mapAfterToLocalBrushPoint({...geometry,
      clientX: after.clientX, clientY: after.clientY}),
    mapAfterImagePointToLocalBrushPoint({...geometry,
      afterX: after.afterX, afterY: after.afterY})]) {
      assert.ok(Math.abs(result.x - original.x) < 1e-12);
      assert.ok(Math.abs(result.y - original.y) < 1e-12);
    }
    assert.throws(() => mapAfterImagePointToLocalBrushPoint({...geometry,
      afterX: .01, afterY: .5}), /LOCAL_BRUSH_OUTSIDE_IMAGE_CONTENT/);
    const paddingPointer = clientForFraction(afterRect, expanded.width, expanded.height, .01, .5);
    assert.throws(() => mapAfterToLocalBrushPoint({...geometry, ...paddingPointer}),
      /LOCAL_BRUSH_OUTSIDE_IMAGE_CONTENT/);
    assert.throws(() => mapAfterToLocalBrushPoint({...geometry, canvasExpand: undefined,
      clientX: after.clientX, clientY: after.clientY}),
      /LOCAL_BRUSH_AFTER_DIMENSIONS_MISMATCH/);
  }
});

test('LOCAL-COORD07: forward/keyboard refuse Before, outside Crop, malformed geometry and mutated input', () => {
  const afterRect = box(320, 0, 300, 300), beforeRect = box(0, 0, 300, 300);
  const crop = cropFor(0);
  const base = {afterRect, beforeRect, view: 'split', naturalWidth: 6, naturalHeight: 4,
    uprightWidth: 12, uprightHeight: 8, rotationDegrees: 0, crop};
  assert.throws(() => mapLocalBrushPointToAfter({...base, x: .1, y: .5}),
    /LOCAL_BRUSH_OUTSIDE_CROP/);
  assert.throws(() => mapLocalBrushPointToAfter({...base, x: .5, y: .5,
    view: 'before'}), /PREVIEW_AFTER_REQUIRED/);
  assert.throws(() => mapAfterImagePointToLocalBrushPoint({...base,
    view: 'before', afterX: .5, afterY: .5}), /PREVIEW_AFTER_REQUIRED/);
  assert.throws(() => mapAfterImagePointToLocalBrushPoint({...base,
    afterX: -1, afterY: .5}), /LOCAL_BRUSH_AFTER_POINT_INVALID/);
  assert.throws(() => mapLocalBrushPointToAfter({...base, x: NaN, y: .5}),
    /LOCAL_BRUSH_SOURCE_POINT_INVALID/);
  assert.throws(() => mapLocalBrushPointToAfter({...base, x: .5, y: .5,
    naturalWidth: 7}), /LOCAL_BRUSH_AFTER_DIMENSIONS_MISMATCH/);
  const snapshot = structuredClone(base);
  mapLocalBrushPointToAfter({...base, x: .5, y: .5});
  assert.deepEqual(base, snapshot);
});
