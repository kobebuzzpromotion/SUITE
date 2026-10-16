import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {applyGlow, createGlowMaskOverlay, validateGlow,
  GLOW_EXTENDED_ALGORITHM_VERSION, GLOW_MODES} from '../src/processing/glow.mjs';

function image(width, height, rgba = [0, 0, 0, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return {width, height, data};
}
const at = (frame, x, y) => [...frame.data.slice((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 4)];
const set = (frame, x, y, rgba) => frame.data.set(rgba, (y * frame.width + x) * 4);

test('GLOW-EXT01: old three-key frame stays byte-identical and new mode values are strict', () => {
  const frame = image(11, 11, [30, 30, 30, 255]);
  set(frame, 5, 5, [255, 255, 255, 255]);
  const legacy = applyGlow(frame, {intensity: 60, radius: 2, threshold: 180});
  assert.equal(GLOW_EXTENDED_ALGORITHM_VERSION, 'suite-srgb8-editorial-glow-1');
  assert.deepEqual(GLOW_MODES, ['whiteMist', 'blackMist', 'halation']);
  assert.deepEqual(applyGlow(frame, {threshold: 180, radius: 2, intensity: 60}).data, legacy.data);
  assert.deepEqual(at(legacy, 5, 4), [35, 35, 35, 255]);
  assert.equal(validateGlow({}).mode, 'blackMist');
  const fromWorker = runInNewContext('JSON.parse("{\\"mode\\":\\"halation\\",\\"intensity\\":45}")');
  assert.doesNotThrow(() => validateGlow(fromWorker));
});

test('GLOW-EXT02: White Mist, Black Mist and Halation produce distinct optical looks', () => {
  const frame = image(13, 13, [25, 25, 25, 255]);
  set(frame, 6, 6, [255, 255, 255, 255]);
  const common = {intensity: 100, radius: 2, threshold: 180};
  const white = applyGlow(frame, {...common, mode: 'whiteMist'});
  const black = applyGlow(frame, {...common, mode: 'blackMist'});
  const halation = applyGlow(frame, {...common, mode: 'halation'});
  assert.ok(at(white, 0, 0)[0] > at(frame, 0, 0)[0], 'White Mist softens even a dark field');
  assert.deepEqual(at(black, 0, 0), at(frame, 0, 0), 'Black Mist limits glow to light-source vicinity');
  assert.ok(at(white, 6, 5)[0] > at(black, 6, 5)[0], 'White Mist lifts shadows more');
  assert.ok(at(halation, 6, 5)[0] > at(halation, 6, 5)[2], 'Halation forms a warm source halo');
  assert.notDeepEqual(white.data, black.data);
  assert.notDeepEqual(halation.data, black.data);
});

test('GLOW-EXT03: Exposure and Diffusion alter brightness and spatial spread', () => {
  const frame = image(25, 25);
  set(frame, 12, 12, [255, 255, 255, 255]);
  const base = {mode: 'halation', intensity: 90, radius: 2, threshold: 160};
  const low = applyGlow(frame, {...base, exposure: -100});
  const high = applyGlow(frame, {...base, exposure: 100});
  assert.ok(at(high, 12, 11)[0] > at(low, 12, 11)[0]);
  const narrow = applyGlow(frame, {...base, diffusion: 0});
  const broad = applyGlow(frame, {...base, diffusion: 100});
  assert.equal(at(narrow, 12, 17)[0], 0);
  assert.ok(at(broad, 12, 17)[0] > 0, 'Diffusion spreads the halo beyond Radius');
});

test('GLOW-EXT04: Tint changes halo color without editing alpha or transparent hidden RGB', () => {
  const frame = image(9, 9);
  set(frame, 4, 4, [255, 255, 255, 255]);
  set(frame, 0, 0, [255, 0, 20, 0]);
  const common = {mode: 'whiteMist', intensity: 100, radius: 1, threshold: 180};
  const warm = applyGlow(frame, {...common, tint: 100});
  const cool = applyGlow(frame, {...common, tint: -100});
  assert.ok(at(warm, 4, 3)[0] > at(warm, 4, 3)[2]);
  assert.ok(at(cool, 4, 3)[2] > at(cool, 4, 3)[0]);
  assert.deepEqual(at(warm, 0, 0), [255, 0, 20, 0]);
  for (let i = 3; i < warm.data.length; i += 4) assert.equal(warm.data[i], frame.data[i]);
  const hiddenOnly = image(7, 7);
  set(hiddenOnly, 3, 3, [255, 255, 255, 0]);
  const hiddenInput = {mode: 'blackMist', intensity: 100, radius: 1, threshold: 180};
  assert.deepEqual(applyGlow(hiddenOnly, hiddenInput).data, hiddenOnly.data);
  assert.ok(createGlowMaskOverlay(hiddenOnly, hiddenInput).data.every(value => value === 0));
});

test('GLOW-EXT05: Glow Mask is preview-only and tracks the affected region without changing Final pixels', () => {
  const frame = image(13, 13);
  set(frame, 6, 6, [255, 255, 255, 255]);
  const input = {mode: 'halation', intensity: 80, radius: 2, threshold: 180, diffusion: 20};
  const source = frame.data.slice();
  const finalBefore = applyGlow(frame, input);
  const mask = createGlowMaskOverlay(frame, input);
  const finalAfter = applyGlow(frame, input);
  assert.deepEqual(finalAfter.data, finalBefore.data);
  assert.deepEqual(frame.data, source);
  assert.equal(mask.width, frame.width); assert.equal(mask.height, frame.height);
  assert.equal(at(mask, 0, 0)[3], 0);
  assert.ok(at(mask, 6, 5)[3] > 0);
  assert.deepEqual(at(mask, 6, 5).slice(0, 3), [255, 40, 70]);
  const zero = createGlowMaskOverlay(frame, {...input, intensity: 0});
  assert.ok(zero.data.every(value => value === 0));
});

test('GLOW-EXT06: determinism, partial alpha, tiny frames and source metadata are preserved', () => {
  const frame = {...image(1, 9, [50, 60, 70, 64]), sourceWidth: 2, sourceHeight: 18};
  set(frame, 0, 4, [255, 250, 245, 128]);
  const input = {mode: 'whiteMist', intensity: 90, radius: 64, threshold: 150,
    exposure: 20, diffusion: 100, tint: -30};
  const before = frame.data.slice();
  const first = applyGlow(frame, input);
  const second = applyGlow(frame, input);
  assert.deepEqual(first, second);
  assert.deepEqual(frame.data, before);
  assert.deepEqual([first.sourceWidth, first.sourceHeight], [2, 18]);
  for (let i = 3; i < first.data.length; i += 4) assert.equal(first.data[i], frame.data[i]);
  assert.equal(createGlowMaskOverlay(frame, input).data.length, frame.data.length);
});

test('GLOW-EXT07: unsupported controls, malformed values and non-plain settings fail closed', () => {
  class Glow {constructor() {this.mode = 'whiteMist';}}
  const frame = image(2, 2);
  const bad = [null, [], new Date(), new Glow(), {mode: 'AI'}, {mode: 'WHITE_MIST'},
    {intensity: 30, [Symbol('hidden')]: 1}, {mode: 'blackMist', extra: 1},
    {exposure: -101}, {exposure: 101}, {exposure: NaN}, {exposure: '20'},
    {diffusion: -1}, {diffusion: 101}, {diffusion: Infinity}, {diffusion: null},
    {tint: -101}, {tint: 101}, {tint: undefined}, {tint: false}];
  for (const input of bad) {
    assert.throws(() => applyGlow(frame, input));
    assert.throws(() => createGlowMaskOverlay(frame, input));
  }
  for (const control of ['exposure', 'diffusion', 'tint']) {
    const bounds = control === 'diffusion' ? [0, 100] : [-100, 100];
    for (const value of bounds) assert.doesNotThrow(() => validateGlow({[control]: value}));
  }
});

test('GLOW-EXT08: pre-abort and mid-pass abort do not modify source', () => {
  const frame = image(16385, 1, [200, 200, 200, 255]);
  const before = frame.data.slice();
  const input = {mode: 'whiteMist', intensity: 80, radius: 3, diffusion: 40};
  assert.throws(() => applyGlow(frame, input, {signal: {aborted: true}}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks > 6;}};
  assert.throws(() => applyGlow(frame, input, {signal}), {name: 'AbortError'});
  assert.ok(checks > 6);
  assert.throws(() => createGlowMaskOverlay(frame, input, {signal: {aborted: true}}), {name: 'AbortError'});
  assert.deepEqual(frame.data, before);
});
