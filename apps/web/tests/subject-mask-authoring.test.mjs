import test from 'node:test';
import assert from 'node:assert/strict';
import {authorSubjectMask, SUBJECT_MASK_AUTHORING_VERSION, SUBJECT_MASK_MAX_WORK} from
  '../src/processing/subject-mask-authoring.mjs';
import {applyBackgroundComposite} from '../src/processing/background-composite.mjs';

const context = Object.freeze({assetID: '11111111-1111-4111-8111-111111111111',
  originalSHA256: 'a'.repeat(64), savedRevision: 4});
const add = () => ({operation: 'ADD', path: [{u: .25, v: .5}, {u: .75, v: .5}],
  radiusFraction: .12, hardness: 1});
const erase = () => ({operation: 'ERASE', path: [{u: .5, v: .5}],
  radiusFraction: .08, hardness: 1});
function frame(width = 16, height = 16) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++)
    data.set([220, 60, 35, 255], pixel * 4);
  return {width, height, data};
}
const at = (mask, x, y) => mask.data[y * mask.width + x];

test('SUBJECT-MASK-01: owner-authored Add/Erase is deterministic and matches composite provenance', () => {
  const original = frame();
  const originalBefore = new Uint8ClampedArray(original.data);
  const strokes = [add(), erase()], strokesBefore = structuredClone(strokes);
  const options = {ownerConfirmed: true};
  const result = authorSubjectMask(original, strokes, context, options);
  const again = authorSubjectMask(original, strokes, context, options);
  assert.equal(SUBJECT_MASK_AUTHORING_VERSION, 'suite-explicit-owner-subject-strokes-1');
  assert.deepEqual(result.data, again.data);
  assert.deepEqual(result.provenance, again.provenance);
  assert.deepEqual(result.provenance, {kind: 'subject-alpha-mask',
    source: 'verified-manual-subject-matte', ...context, width: 16, height: 16});
  assert.equal(at(result, 4, 8), 255);
  assert.equal(at(result, 8, 8), 0);
  assert.equal(at(result, 0, 0), 0);
  assert.deepEqual(original.data, originalBefore);
  assert.deepEqual(strokes, strokesBefore);
  const replacement = frame();replacement.data.fill(0);
  for (let pixel = 0; pixel < 256; pixel++) replacement.data.set([10, 30, 200, 255], pixel * 4);
  const composed = applyBackgroundComposite(original, replacement, result, context);
  assert.deepEqual([...composed.data.slice((8 * 16 + 4) * 4, (8 * 16 + 4) * 4 + 4)],
    [220, 60, 35, 255]);
  assert.deepEqual([...composed.data.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4)],
    [10, 30, 200, 255]);
  assert.deepEqual(original.data, originalBefore);
});

test('SUBJECT-MASK-02: feather is partial coverage; source alpha remains byte-identical', () => {
  const original = frame();
  original.data[(8 * 16 + 4) * 4 + 3] = 0;
  original.data[(8 * 16 + 12) * 4 + 3] = 128;
  const before = new Uint8ClampedArray(original.data);
  const stroke = {operation: 'ADD', path: [{u: .5, v: .5}],
    radiusFraction: .18, hardness: 0};
  const mask = authorSubjectMask(original, [stroke], context, {ownerConfirmed: true});
  assert.equal(at(mask, 4, 8), 0);
  assert.ok(at(mask, 9, 8) > 0 && at(mask, 9, 8) < 255);
  assert.equal(at(mask, 12, 8), 0);
  assert.deepEqual(original.data, before);
});

test('SUBJECT-MASK-03: no owner assertion, bad identity or Local Levels/face oval shape is rejected', () => {
  const original = frame(), before = new Uint8ClampedArray(original.data);
  assert.throws(() => authorSubjectMask(original, [add()], context),
    /SUBJECT_MASK_OWNER_CONFIRMATION_REQUIRED/);
  for (const bad of [{...context, assetID: 'other'},
    {...context, originalSHA256: 'bad'}, {...context, savedRevision: 0},
    {...context, extra: true}])
    assert.throws(() => authorSubjectMask(original, [add()], bad,
      {ownerConfirmed: true}), /SUBJECT_MASK_CONTEXT_INVALID/);
  const localLevels = {mode: 'add', points: [{x: .5, y: .5}], radius: .1, hardness: 1};
  const faceOval = {operation: 'ADD', path: [{x: .5, y: .5}],
    radiusFraction: .1, hardness: 1};
  assert.throws(() => authorSubjectMask(original, [localLevels], context,
    {ownerConfirmed: true}), /SUBJECT_MASK_STROKE_INVALID/);
  assert.throws(() => authorSubjectMask(original, [faceOval], context,
    {ownerConfirmed: true}), /SUBJECT_MASK_POINT_INVALID/);
  assert.deepEqual(original.data, before);
});

test('SUBJECT-MASK-04: invalid, sparse and over-budget strokes fail closed', () => {
  const original = frame(), invalid = [
    {...add(), operation: 'add'}, {...add(), radiusFraction: 0},
    {...add(), radiusFraction: .26}, {...add(), radiusFraction: NaN},
    {...add(), hardness: 1.1}, {...add(), hidden: true},
    {...add(), path: [{u: 1.1, v: .5}]},
    {...add(), path: [{u: .5, v: .5, z: 0}]}
  ];
  for (const stroke of invalid)
    assert.throws(() => authorSubjectMask(original, [stroke], context,
      {ownerConfirmed: true}), /SUBJECT_MASK_(STROKE|POINT)_INVALID/);
  const sparse = [add(), add()];delete sparse[1];
  assert.throws(() => authorSubjectMask(original, sparse, context,
    {ownerConfirmed: true}), /SUBJECT_MASK_STROKES_INVALID/);
  assert.throws(() => authorSubjectMask(original, Array.from({length: 65}, add), context,
    {ownerConfirmed: true}), /SUBJECT_MASK_STROKES_INVALID/);
  const huge = frame(1000, 1000);
  const expensive = {operation: 'ADD', path: [{u: .1, v: .5}, {u: .9, v: .5}],
    radiusFraction: .25, hardness: 1};
  assert.ok(SUBJECT_MASK_MAX_WORK <= 96_000_000);
  assert.throws(() => authorSubjectMask(huge, Array.from({length: 64},
    () => structuredClone(expensive)), context, {ownerConfirmed: true}),
  /SUBJECT_MASK_WORK_LIMIT/);
});

test('SUBJECT-MASK-05: all-erased or alpha-zero matte is refused, not marked verified', () => {
  const original = frame();
  const removal = {operation: 'ERASE', path: [{u: .25, v: .5}, {u: .75, v: .5}],
    radiusFraction: .25, hardness: 1};
  assert.throws(() => authorSubjectMask(original, [add(), removal], context,
    {ownerConfirmed: true}), /SUBJECT_MASK_EMPTY/);
  original.data.forEach((_, i) => {if (i % 4 === 3) original.data[i] = 0;});
  assert.throws(() => authorSubjectMask(original, [add()], context,
    {ownerConfirmed: true}), /SUBJECT_MASK_EMPTY/);
});

test('SUBJECT-MASK-06: abort before and during authoring leaves source/strokes untouched', () => {
  const original = frame(256, 256), strokes = [add()];
  const source = new Uint8ClampedArray(original.data), commands = structuredClone(strokes);
  const abort = new AbortController();abort.abort();
  assert.throws(() => authorSubjectMask(original, strokes, context,
    {ownerConfirmed: true, signal: abort.signal}), error => error.name === 'AbortError');
  let reads = 0;
  const signal = {get aborted() {return ++reads >= 20;}};
  assert.throws(() => authorSubjectMask(original, strokes, context,
    {ownerConfirmed: true, signal}), error => error.name === 'AbortError');
  assert.ok(reads >= 20);
  assert.deepEqual(original.data, source);
  assert.deepEqual(strokes, commands);
});
