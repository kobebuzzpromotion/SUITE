import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLevels} from '../src/processing/levels.mjs';
import {LEVELS_MIDPOINT_POSITION, levelsMidpointPositionToGamma,
  levelsGammaToMidpointPosition} from '../src/levels-control-mapping.mjs';

const image = () => ({width: 3, height: 1,
  data: new Uint8ClampedArray([32, 32, 32, 255, 128, 128, 128, 150, 224, 224, 224, 0])});

test('LEVELS-MAP01: visual midpoint has neutral center and reversed gamma endpoints', () => {
  assert.deepEqual(LEVELS_MIDPOINT_POSITION, {minimum: 0, neutral: 50, maximum: 100});
  for (const [position, gamma] of [[0, 10], [50, 1], [100, 0.1]]) {
    assert.equal(levelsMidpointPositionToGamma(position), gamma);
    assert.equal(levelsGammaToMidpointPosition(gamma), position);
  }
});

test('LEVELS-MAP02: moving right strictly darkens actual RGB midtones, never alpha/Original', () => {
  const source = image(), original = source.data.slice();
  const positions = [0, 10, 25, 40, 50, 60, 75, 90, 100];
  const gamma = positions.map(levelsMidpointPositionToGamma);
  const frames = gamma.map(value => applyLevels(source, {master: {gamma: value}}));
  for (let index = 1; index < frames.length; index++) {
    assert.ok(gamma[index - 1] > gamma[index]);
    assert.ok(frames[index - 1].data[4] > frames[index].data[4], `position ${positions[index]}`);
  }
  for (const frame of frames) {
    assert.equal(frame.data[7], 150);
    assert.deepEqual(Array.from(frame.data.slice(8, 12)), [224, 224, 224, 0]);
  }
  assert.deepEqual(source.data, original);
});

test('LEVELS-MAP03: inverse retains all legacy Recipe gamma values and their pixel output', () => {
  const source = image(), original = source.data.slice();
  for (const gamma of [0.1, 0.15, 0.25, 0.5, 0.9, 1, 1.2, 1.8, 2.2, 4, 10]) {
    const position = levelsGammaToMidpointPosition(gamma);
    assert.ok(position >= 0 && position <= 100);
    const restored = levelsMidpointPositionToGamma(position);
    assert.ok(Math.abs(restored - gamma) <= 1e-12 * gamma, `${gamma} -> ${position} -> ${restored}`);
    const recipe = {master: {gamma}}, before = structuredClone(recipe);
    assert.deepEqual(applyLevels(source, recipe).data,
      applyLevels(source, {master: {gamma: restored}}).data);
    assert.deepEqual(recipe, before);
  }
  assert.deepEqual(source.data, original);
});

test('LEVELS-MAP04: position and Recipe gamma reject invalid/non-finite values', () => {
  for (const bad of [-1, 101, NaN, Infinity, -Infinity, '50', null, undefined, {}, true])
    assert.throws(() => levelsMidpointPositionToGamma(bad), /LEVELS_MIDPOINT_VALUE_INVALID/);
  for (const bad of [0, 0.099, 10.01, NaN, Infinity, -Infinity, '1', null, undefined, {}, true])
    assert.throws(() => levelsGammaToMidpointPosition(bad), /LEVELS_MIDPOINT_VALUE_INVALID/);
});
