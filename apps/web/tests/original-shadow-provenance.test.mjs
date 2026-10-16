import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBoundOriginalShadow,
  ORIGINAL_SHADOW_MASK_SOURCE,
  validateOriginalShadowMasks
} from '../src/processing/original-shadow.mjs';

const ID = 'a27fc10c-ec21-4c1c-839a-8e273d3f4f7d';
const OTHER_ID = '617421aa-fced-481f-82a9-1a0f501f4a7c';
const SHA = 'a'.repeat(64);
const context = () => ({assetID: ID, originalSHA256: SHA, savedRevision: 3});
const frame = (data, width = 3, height = 1) =>
  ({width, height, data: new Uint8ClampedArray(data)});
const subjectMask = (data = [0, 255, 0]) => ({
  width: 3, height: 1, data: new Uint8Array(data),
  provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    ...context(), width: 3, height: 1
  }
});
const shadowMask = (data = [255, 255, 0]) => ({
  width: 3, height: 1, data: new Uint8Array(data),
  provenance: {
    kind: 'original-shadow-mask', source: ORIGINAL_SHADOW_MASK_SOURCE,
    ...context(), width: 3, height: 1
  }
});
const original = () => frame([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
const composite = () => frame([100, 120, 140, 255, 90, 110, 130, 255, 80, 100, 120, 255]);

test('ORIGINAL-SHADOW-BOUND-01: bound manual mask changes only selected non-subject RGB, never alpha or inputs', () => {
  const source = original(), out = composite(), subject = subjectMask(), shadow = shadowMask();
  const before = [source.data.slice(), out.data.slice(), subject.data.slice(), shadow.data.slice()];
  const result = applyBoundOriginalShadow(source, out, subject, shadow, context());
  assert.deepEqual([...result.data], [0, 0, 0, 255, 90, 110, 130, 255, 80, 100, 120, 255]);
  assert.notEqual(result.data, out.data);
  assert.deepEqual([source.data, out.data, subject.data, shadow.data], before);
  const roles = validateOriginalShadowMasks(subject, shadow, context(), 3, 1);
  assert.equal(roles.subject.kind, 'subject-alpha-mask');
  assert.equal(roles.shadow.kind, 'original-shadow-mask');
});

test('ORIGINAL-SHADOW-BOUND-02: different Asset, SHA or saved revision is rejected on either role', () => {
  const source = original(), out = composite();
  for (const key of ['assetID', 'originalSHA256', 'savedRevision']) {
    const wrong = key === 'assetID' ? OTHER_ID : key === 'originalSHA256' ? 'b'.repeat(64) : 4;
    const subject = subjectMask(), shadow = shadowMask();
    subject.provenance[key] = wrong;
    assert.throws(() => applyBoundOriginalShadow(source, out, subject, shadow, context()),
      /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
    const goodSubject = subjectMask();
    shadow.provenance[key] = wrong;
    assert.throws(() => applyBoundOriginalShadow(source, out, goodSubject, shadow, context()),
      /ORIGINAL_SHADOW_PROVENANCE_MISMATCH/);
  }
});

test('ORIGINAL-SHADOW-BOUND-03: role, source, dimensions and unbound legacy mask are rejected', () => {
  const source = original(), out = composite(), subject = subjectMask(), shadow = shadowMask();
  assert.throws(() => applyBoundOriginalShadow(source, out, subject,
    {width: 3, height: 1, data: shadow.data}, context()),
  /ORIGINAL_SHADOW_SHADOW_MASK_INVALID/);
  for (const [key, value] of [['kind', 'subject-alpha-mask'],
    ['source', 'verified-manual-subject-matte'], ['width', 4], ['height', 2]]) {
    const bad = shadowMask(); bad.provenance[key] = value;
    assert.throws(() => applyBoundOriginalShadow(source, out, subject, bad, context()),
      /ORIGINAL_SHADOW_PROVENANCE_MISMATCH/);
  }
  const badSubject = subjectMask(); badSubject.provenance.kind = 'original-shadow-mask';
  assert.throws(() => applyBoundOriginalShadow(source, out, badSubject, shadow, context()),
    /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  assert.throws(() => applyBoundOriginalShadow(source, out, subject,
    {...shadow, width: 4}, context()), /ORIGINAL_SHADOW_SHADOW_MASK_INVALID/);
  assert.throws(() => applyBoundOriginalShadow(source, frame(out.data, 1, 3),
    subject, shadow, context()), /ORIGINAL_SHADOW_DIMENSIONS_MISMATCH/);
});

test('ORIGINAL-SHADOW-BOUND-04: unknown or symbol keys, forged context and invalid capacity fail closed', () => {
  const source = original(), out = composite(), subject = subjectMask(), shadow = shadowMask();
  assert.throws(() => applyBoundOriginalShadow(source, out, subject,
    {...shadow, extra: true}, context()), /ORIGINAL_SHADOW_SHADOW_MASK_INVALID/);
  const symbolProof = shadowMask(); symbolProof.provenance[Symbol('extra')] = true;
  assert.throws(() => applyBoundOriginalShadow(source, out, subject, symbolProof,
    context()), /ORIGINAL_SHADOW_PROVENANCE_MISMATCH/);
  assert.throws(() => applyBoundOriginalShadow(source, out, subject, shadow,
    {...context(), allowed: true}), /BACKGROUND_COMPOSITE_CONTEXT_INVALID/);
  assert.throws(() => validateOriginalShadowMasks(subject, shadow, context(), 3000, 3000),
    /ORIGINAL_SHADOW_DIMENSIONS_INVALID/);
});

test('ORIGINAL-SHADOW-BOUND-05: transparent output and zero-opacity preserve hidden RGB; abort produces no result', () => {
  const source = original(), out = composite(), subject = subjectMask(), shadow = shadowMask();
  out.data[3] = 0;
  const result = applyBoundOriginalShadow(source, out, subject, shadow, context());
  assert.deepEqual([...result.data], [...out.data]);
  assert.deepEqual(applyBoundOriginalShadow(source, out, subject, shadow,
    context(), {opacity: 0}).data, out.data);
  const before = out.data.slice();
  assert.throws(() => applyBoundOriginalShadow(source, out, subject, shadow,
    context(), {signal: {aborted: true}}), {name: 'AbortError'});
  assert.deepEqual(out.data, before);
});
