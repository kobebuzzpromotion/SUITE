import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment, defaultCropSettings} from '../../../dist/apps/backend/src/crop-export.js';
import {validateDetections, reconcileTargets, renderPixels, makeProxyPixels, rotateCropPixels, assertPixels} from '../src/processing/pure.mjs';
import {syntheticPixels, detection, portrait, recipe} from './fixtures.mjs';

// Independent synthetic RGBA only. No real RAW, image quality, face detection or Native PASS.
const render = (pixels, document, detections = [], signal) => renderPixels(pixels, document, {detections, signal, validateRecipe, resolutionAssessment});
const rgba = (p, x, y) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

test('WEB-PX01 / SYNTHETIC: complete inventory resolves by geometry, not detector order', () => {
  const p = portrait();
  assert.doesNotThrow(() => validateDetections([detection(), detection(0.6)]));
  const matches = reconcileTargets(p.targets, [detection(0.6), detection()]);
  assert.equal(matches.length, 2);
});

test('WEB-PX02 / SYNTHETIC: missing, extra, incomplete and overlapping detections fail closed', () => {
  const p = portrait();
  assert.throws(() => reconcileTargets(p.targets, [detection()]));
  assert.throws(() => reconcileTargets(p.targets.slice(0, 1), [detection(), detection(0.6)]));
  assert.throws(() => validateDetections([{...detection(), complete: false}]));
  assert.throws(() => validateDetections([detection(), detection(0.15)]));
});

test('WEB-PX03 / SYNTHETIC: malformed/out-of-frame/mismatched mask polygons are rejected', () => {
  for (const bad of [
    {...detection(), mask: []},
    {...detection(), mask: [{x: 0.1, y: NaN}, {x: 0.3, y: 0.5}, {x: 0.2, y: 0.8}]},
    {...detection(), mask: [{x: -0.1, y: 0.5}, {x: 0.3, y: 0.5}, {x: 0.2, y: 0.8}]},
    {...detection(), mask: detection(0.6).mask}
  ]) assert.throws(() => validateDetections([bad]));
});

test('WEB-PX04 / SYNTHETIC: neutral rendering preserves every base pixel and original input', () => {
  const input = syntheticPixels(), before = input.data.slice();
  const output = render(input, recipe());
  assert.deepEqual(output.data, before); assert.deepEqual(input.data, before);
  assert.equal(output.width, input.width); assert.equal(output.height, input.height);
});

test('WEB-PX05 / SYNTHETIC: selected face changes; unselected person and background remain byte-identical', () => {
  const input = syntheticPixels(), before = input.data.slice();
  const output = render(input, recipe(portrait()), [detection(), detection(0.6)]);
  assert.ok(rgba(output, 20, 65)[0] > rgba(input, 20, 65)[0]);
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    if (x < 10 || x >= 30 || y < 50 || y >= 80) assert.deepEqual(rgba(output, x, y), rgba(input, x, y), `${x},${y}`);
  }
  assert.deepEqual(input.data, before);
});

test('WEB-PX06 / SYNTHETIC: lower-left anchor maps to upper-left pixel polygon without vertical inversion', () => {
  const input = syntheticPixels(); const output = render(input, recipe(portrait()), [detection(), detection(0.6)]);
  assert.deepEqual(rgba(output, 20, 30), rgba(input, 20, 30));
  assert.ok(rgba(output, 20, 65)[0] > rgba(input, 20, 65)[0]);
});

test('WEB-PX07 / SYNTHETIC: rendering twice from base is deterministic and target/detection ordering cannot compound', () => {
  const input = syntheticPixels(), p = portrait(undefined, 1, -1), doc = recipe(p);
  const first = render(input, doc, [detection(), detection(0.6)]);
  const second = render(input, doc, [detection(), detection(0.6)]);
  const reversed = render(input, recipe({...p, targets: [...p.targets].reverse()}), [detection(0.6), detection()]);
  assert.deepEqual(first.data, second.data); assert.deepEqual(first.data, reversed.data);
  assert.ok(rgba(first, 70, 65)[0] < rgba(input, 70, 65)[0]);
});

test('WEB-PX08 / SYNTHETIC: zero person controls require valid inventory but do not modify pixels', () => {
  const input = syntheticPixels(), doc = recipe(portrait(undefined, 0, 0));
  assert.deepEqual(render(input, doc, [detection(), detection(0.6)]).data, input.data);
  assert.throws(() => render(input, doc, [detection()]));
});

test('WEB-PX09 / SYNTHETIC: pre-aborted render refuses output and preserves base bytes', () => {
  const input = syntheticPixels(), before = input.data.slice(), controller = new AbortController(); controller.abort();
  assert.throws(() => render(input, recipe(portrait()), [detection(), detection(0.6)], controller.signal));
  assert.deepEqual(input.data, before);
});

test('WEB-PX10 / SYNTHETIC: malformed dimensions and byte counts fail rather than reading partial image', () => {
  for (const p of [{width: 0, height: 1, data: new Uint8ClampedArray(0)},
    {width: 1.5, height: 1, data: new Uint8ClampedArray(4)},
    {width: 10, height: 10, data: new Uint8ClampedArray(4)}]) {
    assert.throws(() => render(p, recipe())); assert.throws(() => makeProxyPixels(p, 50));
  }
});

test('WEB-PX11 / SYNTHETIC: proxy is bounded and never enlarges the original base', () => {
  const input = syntheticPixels(100, 60), before = input.data.slice();
  const small = makeProxyPixels(input, 40);
  assert.equal(small.width, 40); assert.equal(small.height, 24);
  const same = makeProxyPixels(input, 200);
  assert.equal(same.width, 100); assert.equal(same.height, 60);
  assert.deepEqual(input.data, before);
});

test('WEB-PX12 / SYNTHETIC: rotation preserves all samples and a full turn restores original image', () => {
  const input = syntheticPixels(2, 3);
  for (let i = 0; i < 6; i++) input.data[i * 4] = i * 20;
  let result = input;
  for (let i = 0; i < 4; i++) result = rotateCropPixels(result, 90);
  assert.equal(result.width, input.width); assert.equal(result.height, input.height);
  assert.deepEqual(result.data, input.data);
});

test('WEB-PX13 / SYNTHETIC: saturated eight-face output cannot establish a complete inventory', () => {
  const faces = Array.from({length: 8}, (_, i) => {const x = i * 0.12, y = 0.1;
    return {complete: true, anchor: {x, y, width: 0.1, height: 0.1},
      mask: [{x, y: 0.8}, {x: x + 0.1, y: 0.8}, {x: x + 0.1, y: 0.9}, {x, y: 0.9}]};});
  assert.throws(() => validateDetections(faces), /SATURATED/);
});

test('WEB-PX14 / SYNTHETIC: self-intersecting polygon is rejected before numerical rendering', () => {
  const d = detection(), [a, b, c, e] = d.mask;
  assert.throws(() => validateDetections([{...d, mask: [a, c, b, e]}]));
});

test('WEB-PX15 / SYNTHETIC: crop uses upper-left coordinates after one counterclockwise rotation', () => {
  const input = syntheticPixels(2, 3); for (let i = 0; i < 6; i++) input.data[i * 4] = i * 20;
  const doc = recipe(); doc.parameters.rotationDegrees = 90;
  doc.parameters.processingOrder.push('crop');
  doc.parameters.extendedParameters.crop = {...defaultCropSettings(), rotation: 90, crop_rect: {x: 0, y: 0, width: 2 / 3, height: 1}};
  const result = render(input, doc);
  assert.equal(result.width, 2); assert.equal(result.height, 2);
  assert.deepEqual([rgba(result, 0, 0)[0], rgba(result, 1, 0)[0], rgba(result, 0, 1)[0], rgba(result, 1, 1)[0]], [20, 60, 0, 40]);
});

test('WEB-PX16 / SYNTHETIC: unsupported engine/control and global limits cannot silently render', () => {
  const input = syntheticPixels();
  const wrongEngine = portrait(); wrongEngine.engineVersion = 'apple-vision-face-exposure-1';
  assert.throws(() => render(input, recipe(wrongEngine), [detection(), detection(0.6)]));
  const wrongControl = portrait(); wrongControl.targets[0].adjustmentType = 'skin_smoothing';
  assert.throws(() => render(input, recipe(wrongControl), [detection(), detection(0.6)]));
  for (const [key, value] of [['exposure', 4.001], ['contrast', 4.001], ['saturation', 4.001]]) {
    const doc = recipe(); doc.parameters[key] = value; assert.throws(() => render(input, doc));
  }
});

test('WEB-PX17 / SYNTHETIC: physical print crop cannot silently succeed at an insufficient output resolution', () => {
  const doc = recipe(); doc.parameters.processingOrder.push('crop');
  doc.parameters.extendedParameters.crop = {...defaultCropSettings(), width_mm: 210, height_mm: 297,
    crop_ratio: {width: 210, height: 297}, orientation: 'portrait', crop_rect: {x: 0, y: 0, width: 210 / 297, height: 1}, custom_size: true};
  assert.doesNotThrow(() => validateRecipe(doc));
  assert.throws(() => render(syntheticPixels(100, 100), doc));
});

function referenceGlobal(rgb, exposure, contrast, saturation) {
  const linear = rgb.map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const adjusted = linear.map(v => (v * 2 ** exposure - 0.5) * contrast + 0.5);
  const gray = 0.2126 * adjusted[0] + 0.7152 * adjusted[1] + 0.0722 * adjusted[2];
  return adjusted.map(v => {const c = Math.max(0, Math.min(1, gray + (v - gray) * saturation));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));});
}

test('WEB-PX18 / SYNTHETIC: all eight exposure/contrast/saturation endpoint combinations follow linear-sRGB oracle', () => {
  const input = syntheticPixels(2, 2); input.data.set([64, 96, 128, 73], 0); const before = input.data.slice();
  for (const exposure of [-4, 4]) for (const contrast of [0, 2]) for (const saturation of [0, 2]) {
    const doc = recipe(); Object.assign(doc.parameters, {exposure, contrast, saturation});
    const out = render(input, doc), expected = referenceGlobal([64, 96, 128], exposure, contrast, saturation);
    assert.deepEqual(rgba(out, 0, 0), [...expected, 73]); assert.deepEqual(input.data, before);
  }
});

test('WEB-PX19 / SYNTHETIC: combined person/global adjustments apply person exposure once before global stages', () => {
  const input = syntheticPixels();
  for (let i = 0; i < input.data.length; i += 4) input.data.set([64, 96, 128, 255], i);
  const before = input.data.slice(), doc = recipe(portrait());
  Object.assign(doc.parameters, {exposure: 1, contrast: 1.25, saturation: 0.5});
  const out = render(input, doc, [detection(), detection(0.6)]);
  assert.deepEqual(rgba(out, 20, 65), [...referenceGlobal([64, 96, 128], 2, 1.25, 0.5), 255]);
  assert.deepEqual(rgba(out, 70, 65), [...referenceGlobal([64, 96, 128], 1, 1.25, 0.5), 255]);
  assert.deepEqual(rgba(out, 5, 5), [...referenceGlobal([64, 96, 128], 1, 1.25, 0.5), 255]);
  assert.deepEqual(input.data, before);
});

test('WEB-PX20 / SYNTHETIC: unsupported reordered processing stages are rejected rather than silently interpreted', () => {
  const doc = recipe(); doc.parameters.processingOrder = ['contrast', 'exposure', 'saturation', 'rotation'];
  assert.doesNotThrow(() => validateRecipe(doc));
  assert.throws(() => render(syntheticPixels(2, 2), doc), /PROCESSING_ORDER/);
});

test('WEB-PX21 / SYNTHETIC: rounded Proxy and full base accept one canonical Crop recipe including rotation', () => {
  const full = syntheticPixels(17, 11), before = full.data.slice(), proxy = makeProxyPixels(full, 8);
  assert.equal(proxy.width, 8); assert.equal(proxy.height, 5);
  assert.equal(proxy.sourceWidth, 17); assert.equal(proxy.sourceHeight, 11);
  const proxyAgain = makeProxyPixels(proxy, 4); assert.equal(proxyAgain.sourceWidth, 17); assert.equal(proxyAgain.sourceHeight, 11);
  for (const rotation of [0, 90]) for (const [rw, rh] of [[1, 1], [3, 2]]) {
    const w = rotation ? 11 : 17, h = rotation ? 17 : 11, ratio = rw / rh;
    const width = w / h > ratio ? ratio * h / w : 1, height = w / h > ratio ? 1 : w / (h * ratio);
    const doc = recipe(); doc.parameters.rotationDegrees = rotation; doc.parameters.processingOrder.push('crop');
    doc.parameters.extendedParameters.crop = {...defaultCropSettings(), rotation, crop_ratio: {width: rw, height: rh},
      crop_rect: {x: (1 - width) / 2, y: (1 - height) / 2, width, height}};
    const frozen = structuredClone(doc), preview = render(proxy, doc), final = render(full, doc);
    assert.ok(preview.width > 0 && preview.height > 0); assert.ok(final.width > 0 && final.height > 0);
    assert.equal(preview.sourceWidth, undefined); assert.equal(final.sourceWidth, undefined);
    assert.deepEqual(doc, frozen); // No per-resolution recipe substitution.
  }
  assert.deepEqual(full.data, before);
});

test('WEB-PX22 / SYNTHETIC: canonical source frame cannot excuse a mathematically wrong Crop ratio', () => {
  const proxy = makeProxyPixels(syntheticPixels(17, 11), 8), doc = recipe(); doc.parameters.processingOrder.push('crop');
  doc.parameters.extendedParameters.crop = {...defaultCropSettings(), crop_ratio: {width: 1, height: 1}};
  assert.doesNotThrow(() => validateRecipe(doc));
  assert.throws(() => render(proxy, doc), /RATIO/);
});

test('WEB-PX23 / SYNTHETIC: source-frame metadata must be paired, integer, large enough and within cap', () => {
  const p = syntheticPixels(8, 5);
  for (const extra of [{sourceWidth: 17}, {sourceHeight: 11}, {sourceWidth: 17.5, sourceHeight: 11},
    {sourceWidth: 7, sourceHeight: 11}, {sourceWidth: 17, sourceHeight: 4},
    {sourceWidth: 17, sourceHeight: Infinity}, {sourceWidth: 24000001, sourceHeight: 11}]) {
    assert.throws(() => assertPixels({...p, ...extra}), /SOURCE_FRAME/);
    assert.throws(() => makeProxyPixels({...p, ...extra}, 4), /SOURCE_FRAME/);
  }
  assert.doesNotThrow(() => assertPixels({...p, sourceWidth: 17, sourceHeight: 11}));
});
