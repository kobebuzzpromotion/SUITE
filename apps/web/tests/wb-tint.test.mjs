import test from 'node:test';
import assert from 'node:assert/strict';
import {applyColorAdjustments, validateColorAdjustments} from '../src/processing/color-adjustments.mjs';

// Artificial 8-bit display-referred sRGB only; no real RAW or camera WB evidence.
const source = () => ({width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 173])});
const rgb = output => [...output.data.slice(0, 3)];

test('WB01 / SYNTHETIC: neutral temperature and tint preserve source bytes without aliasing', () => {
  const input = source();
  const output = applyColorAdjustments(input, {temperature: 0, tint: 0});
  assert.deepEqual(output.data, input.data);
  assert.notEqual(output.data, input.data);
  assert.equal(output.data[3], 173);
});

test('WB02 / SYNTHETIC: positive temperature warms, negative temperature cools', () => {
  const warm = rgb(applyColorAdjustments(source(), {temperature: 100}));
  const cool = rgb(applyColorAdjustments(source(), {temperature: -100}));
  assert.ok(warm[0] > warm[1] && warm[1] > warm[2], `warm=${warm}`);
  assert.ok(cool[2] > cool[1] && cool[1] > cool[0], `cool=${cool}`);
});

test('WB03 / SYNTHETIC: positive tint adds magenta, negative tint adds green', () => {
  const magenta = rgb(applyColorAdjustments(source(), {tint: 100}));
  const green = rgb(applyColorAdjustments(source(), {tint: -100}));
  assert.equal(magenta[0], magenta[2]);
  assert.ok(magenta[0] > magenta[1], `magenta=${magenta}`);
  assert.equal(green[0], green[2]);
  assert.ok(green[1] > green[0], `green=${green}`);
});

test('WB04 / SYNTHETIC: combined endpoint is bounded, deterministic, preserves alpha and never edits original', () => {
  const input = source(), before = input.data.slice();
  const controls = {temperature: 100, tint: -100};
  const first = applyColorAdjustments(input, controls), second = applyColorAdjustments(input, controls);
  assert.deepEqual(first.data, second.data);
  assert.deepEqual(input.data, before);
  assert.equal(first.data[3], 173);
  for (const channel of rgb(first)) assert.ok(channel >= 0 && channel <= 255);
});

test('WB05 / SYNTHETIC: invalid controls reject before changing source and cancellation is honored', () => {
  const input = source(), before = input.data.slice();
  for (const key of ['temperature', 'tint']) {
    for (const bad of [-101, 101, NaN, Infinity, -Infinity, '25', null, undefined]) {
      assert.throws(() => validateColorAdjustments({[key]: bad}));
      assert.throws(() => applyColorAdjustments(input, {[key]: bad}));
    }
  }
  const controller = new AbortController(); controller.abort();
  assert.throws(() => applyColorAdjustments(input, {temperature: 100}, {signal: controller.signal}), {name: 'AbortError'});
  assert.deepEqual(input.data, before);
});
