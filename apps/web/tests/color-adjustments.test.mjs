import test from 'node:test';
import assert from 'node:assert/strict';
import {applyColorAdjustments as apply, validateColorAdjustments, HSL_COLORS, HUE_CENTERS, hueWeights, COLOR_ADJUSTMENT_ORDER} from '../src/processing/color-adjustments.mjs';

// Artificial straight-alpha sRGB samples only: no real RAW, face, visual quality or device PASS.
const pixels = (...rgb) => ({width: rgb.length, height: 1, data: new Uint8ClampedArray(rgb.flatMap(v => [...v.slice(0, 3), v[3] ?? 255]))});
const one = rgb => pixels(rgb);
const color = (p, index = 0) => Array.from(p.data.slice(index * 4, index * 4 + 3));
const grey = v => one([v, v, v]);
function hsl(rgb) {
  const [r, g, b] = rgb.map(v => v / 255), lo = Math.min(r, g, b), hi = Math.max(r, g, b), d = hi - lo, l = (lo + hi) / 2;
  if (!d) return {h: 0, s: 0, l};
  const sector = hi === r ? (g - b) / d : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return {h: (sector * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)), l};
}
const centers = [[192, 64, 64], [192, 128, 64], [192, 192, 64], [64, 192, 64], [64, 192, 192], [64, 64, 192], [128, 64, 192], [192, 64, 192]];

test('CA01 / SYNTHETIC: absent/all-zero controls preserve every byte, alpha and source frame without aliasing', () => {
  const p = {width: 256, height: 1, data: new Uint8ClampedArray(Array.from({length: 256}, (_, n) => [n, 255 - n, n % 71, n]).flat()), sourceWidth: 512, sourceHeight: 2};
  const before = p.data.slice();
  for (const controls of [{}, validateColorAdjustments()]) {
    const out = apply(p, controls);
    assert.deepEqual(out.data, before); assert.notEqual(out.data, p.data);
    assert.equal(out.sourceWidth, 512); assert.equal(out.sourceHeight, 2);
  }
  assert.deepEqual(p.data, before);
});
test('CA02 / SYNTHETIC: validation defaults are detached and unknown controls including Kelvin WB refuse', () => {
  const input = {hsl: {red: {hue: 2}}}, normalized = validateColorAdjustments(input);
  normalized.hsl.red.hue = 90; assert.equal(input.hsl.red.hue, 2);
  assert.equal(normalized.shadows, 0); assert.equal(Object.keys(normalized.hsl).length, 8);
  for (const bad of [null, [], new Date(), {temperature: 5200}, {tint: 1}, {hsl: {skin: {hue: 1}}}, {hsl: {red: {lightness: 1}}}, {hsl: undefined}, {hsl: {red: null}}]) assert.throws(() => validateColorAdjustments(bad));
});
test('CA03 / SYNTHETIC: every scalar and all 24 HSL values reject illegal type/range before changing input', () => {
  const p = grey(128), before = p.data.slice();
  for (const bad of [-101, 101, NaN, Infinity, '2', null, undefined]) {
    for (const name of COLOR_ADJUSTMENT_ORDER.slice(0, -1)) assert.throws(() => apply(p, {[name]: bad}));
    for (const name of HSL_COLORS) for (const channel of ['hue', 'saturation', 'luminance']) assert.throws(() => apply(p, {hsl: {[name]: {[channel]: bad}}}));
  }
  assert.deepEqual(p.data, before);
});
for (const [name, sample, isolated] of [['highlights', 210, 70], ['shadows', 90, 240], ['whites', 250, 128], ['blacks', 20, 200]]) {
  test(`CA-TONE-${name} / SYNTHETIC: signed endpoints have intended direction and distant tonal range is unchanged`, () => {
    assert.ok(color(apply(grey(sample), {[name]: 100}))[0] > sample);
    assert.ok(color(apply(grey(sample), {[name]: -100}))[0] < sample);
    assert.deepEqual(color(apply(grey(isolated), {[name]: 100})), [isolated, isolated, isolated]);
  });
}
test('CA08 / SYNTHETIC: tone ramp remains monotone for all 16 endpoint combinations with in-gamut neutral channels', () => {
  const p = pixels(...Array.from({length: 256}, (_, n) => [n, n, n, n]));
  for (let bits = 0; bits < 16; bits++) {
    const controls = Object.fromEntries(['highlights', 'shadows', 'whites', 'blacks'].map((k, i) => [k, bits & (1 << i) ? 100 : -100]));
    const out = apply(p, controls); let previous = -1;
    for (let n = 0; n < 256; n++) {
      const [r, g, b] = color(out, n); assert.ok(r >= previous, `${bits}/${n}`); assert.equal(r, g); assert.equal(g, b); assert.equal(out.data[n * 4 + 3], n); previous = r;
    }
  }
});
test('CA09 / SYNTHETIC: Blacks lifts display black; negative Whites lowers display white, without recovered RAW detail claim', () => {
  assert.ok(color(apply(grey(0), {blacks: 100}))[0] > 0);
  assert.ok(color(apply(grey(255), {whites: -100}))[0] < 255);
  assert.deepEqual(color(apply(grey(0), {blacks: -100})), [0, 0, 0]);
  assert.deepEqual(color(apply(grey(255), {whites: 100})), [255, 255, 255]);
});
test('CA10 / SYNTHETIC: Vibrance boosts weak chroma more than high chroma, negative endpoint desaturates', () => {
  const low = [160, 96, 96], high = [224, 32, 32];
  const lowGain = hsl(color(apply(one(low), {vibrance: 100}))).s - hsl(low).s;
  const highGain = hsl(color(apply(one(high), {vibrance: 100}))).s - hsl(high).s;
  assert.ok(lowGain > highGain); assert.ok(highGain > 0);
  const out = color(apply(one(high), {vibrance: -100})); assert.equal(out[0], out[1]); assert.equal(out[1], out[2]);
  assert.deepEqual(color(apply(one([255, 0, 0]), {vibrance: 100})), [255, 0, 0]);
});
test('CA11 / SYNTHETIC: achromatic pixels are not tinted/reassigned to red by Vibrance or HSL', () => {
  const p = pixels(...[0, 25, 128, 255].map(v => [v, v, v]));
  const hsl = Object.fromEntries(HSL_COLORS.map(c => [c, {hue: 100, saturation: 100, luminance: 100}]));
  assert.deepEqual(apply(p, {vibrance: 100, hsl}).data, p.data);
});
test('CA12 / SYNTHETIC: hue bands have exact centers, smooth circular seam and partition of unity', () => {
  HUE_CENTERS.forEach((h, i) => assert.deepEqual(hueWeights(h), Array.from({length: 8}, (_, j) => +(i === j))));
  for (let h = -720; h < 720; h += 2.5) assert.ok(Math.abs(hueWeights(h).reduce((a, b) => a + b) - 1) < 1e-12);
  assert.deepEqual(hueWeights(360), hueWeights(0)); assert.deepEqual(hueWeights(-30), hueWeights(330));
  assert.ok(Math.abs(hueWeights(-.01)[0] - hueWeights(.01)[0]) < 1e-6);
  for (const bad of [NaN, Infinity, '0']) assert.throws(() => hueWeights(bad));
});
for (const [i, name] of HSL_COLORS.entries()) {
  test(`CA-HSL-${name} / SYNTHETIC: hue/saturation/lightness endpoints affect only the selected center`, () => {
    for (const channel of ['hue', 'saturation', 'luminance']) {
      for (const value of [-100, 100]) {
        const out = apply(pixels(...centers), {hsl: {[name]: {[channel]: value}}});
        for (let j = 0; j < 8; j++) if (j !== i) assert.deepEqual(color(out, j), centers[j], `${name}/${channel}/${value}/${j}`);
        const got = hsl(color(out, i)), original = hsl(centers[i]);
        if (channel === 'hue') {
          const delta = ((got.h - original.h + 540) % 360) - 180;
          assert.ok(Math.abs(delta - value * .3) < 1, `${name}/${value}/${delta}`);
        } else assert.ok(value > 0 ? got[channel === 'luminance' ? 'l' : 's'] > original[channel === 'luminance' ? 'l' : 's'] : got[channel === 'luminance' ? 'l' : 's'] < original[channel === 'luminance' ? 'l' : 's']);
      }
    }
  });
}
test('CA21 / SYNTHETIC: red-orange boundary interpolates both hue controls from original hue, not sequential reassignment', () => {
  const p = one([192, 96, 64]); // hue 15 degrees, equal red/orange weights.
  assert.deepEqual(color(apply(p, {hsl: {red: {hue: 100}, orange: {hue: -100}}})), color(p));
  assert.deepEqual(apply(p, {hsl: {red: {hue: 100}, orange: {hue: -100}}}).data, apply(p, {hsl: {orange: {hue: -100}, red: {hue: 100}}}).data);
});
test('CA22 / SYNTHETIC: combined endpoint pipeline is deterministic, bounded and never mutates source or alpha', () => {
  const p = pixels(...centers.map((v, i) => [...v, i * 31])), before = p.data.slice();
  const controls = {highlights: 100, shadows: -100, whites: -100, blacks: 100, vibrance: 100, hsl: Object.fromEntries(HSL_COLORS.map((c, i) => [c, {hue: i % 2 ? 100 : -100, saturation: i % 2 ? -100 : 100, luminance: i % 2 ? 100 : -100}]))};
  const a = apply(p, controls), b = apply(p, controls); assert.deepEqual(a.data, b.data); assert.deepEqual(p.data, before);
  for (let i = 0; i < centers.length; i++) assert.equal(a.data[i * 4 + 3], before[i * 4 + 3]);
});
test('CA23 / SYNTHETIC: cancellation and malformed pixel input refuse output', () => {
  const p = grey(120), before = p.data.slice(), controller = new AbortController(); controller.abort();
  assert.throws(() => apply(p, {shadows: 100}, {signal: controller.signal}), {name: 'AbortError'});
  for (const bad of [{width: 0, height: 1, data: p.data}, {width: 25_000_000, height: 1, data: p.data}, {...p, sourceWidth: 2}, {...p, data: new Uint8Array(p.data)}]) assert.throws(() => apply(bad));
  assert.deepEqual(p.data, before);
});
