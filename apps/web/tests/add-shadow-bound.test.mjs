import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  ADD_SHADOW_BACKGROUND_SOURCE, applyBoundAddShadow
} from '../src/processing/add-shadow.mjs';

const assetID = '5a64c1e1-9e0b-460a-acfa-e77c38c5e489';
const backdropID = '299f7820-fabc-4f22-879b-a57e7c9d597a';
const originalSHA256 = 'a'.repeat(64);
const backdropSHA256 = 'b'.repeat(64);
const bind = () => ({assetID, originalSHA256, savedRevision: 7, backdropID, backdropSHA256});
const settings = patch => ({
  mode: 'drop', opacity: 80, blur: 0, gradient: 0, blend: 'normal',
  offsetX: 2, offsetY: 1, shadowColor: [0, 0, 0], ...patch
});
function fixture() {
  const width = 11, height = 7;
  const background = {width, height, data: new Uint8ClampedArray(width * height * 4)};
  const data = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel++)
    background.data.set([200, 180, 160, 255], pixel * 4);
  for (let y = 2; y <= 3; y++) for (let x = 2; x <= 4; x++) data[y * width + x] = 255;
  background.data.set([77, 88, 99, 0], (6 * width + 10) * 4);
  const subject = {width, height, data, provenance: {
    kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    assetID, originalSHA256, savedRevision: 7, width, height
  }};
  const evidence = {kind: 'composited-replacement-background',
    source: ADD_SHADOW_BACKGROUND_SOURCE, ...bind(), width, height,
    compositeSHA256: createHash('sha256').update(background.data).digest('hex')};
  return {background, subject, evidence};
}
const pixel = (frame, x, y) => [...frame.data.slice((y * frame.width + x) * 4,
  (y * frame.width + x) * 4 + 4)];

test('SHADOW-BOUND-01: None/Soft/Hard/Drop use bound selected backdrop and matte; only eligible RGB changes', async () => {
  const {background, subject, evidence} = fixture();
  const before = [background.data.slice(), subject.data.slice()];
  const modes = new Map();
  for (const mode of ['none', 'soft', 'hard', 'drop']) {
    const result = await applyBoundAddShadow(background, subject, evidence, bind(),
      settings({mode, blur: 4}));
    modes.set(mode, result.data);
    assert.notEqual(result.data, background.data);
    assert.deepEqual(pixel(result, 3, 2), pixel(background, 3, 2));
    assert.deepEqual(pixel(result, 10, 6), [77, 88, 99, 0]);
    for (let index = 3; index < result.data.length; index += 4)
      assert.equal(result.data[index], background.data[index]);
  }
  assert.deepEqual(modes.get('none'), background.data);
  assert.notDeepEqual(modes.get('soft'), modes.get('hard'));
  assert.notDeepEqual(modes.get('hard'), modes.get('drop'));
  assert.notDeepEqual(modes.get('drop'), background.data);
  assert.deepEqual(pixel(background, 0, 0), [200, 180, 160, 255]);
  assert.deepEqual([background.data, subject.data], before);
});

test('SHADOW-BOUND-02: other Asset, changed Original SHA, stale revision or wrong matte role reject even for None', async () => {
  const {background, subject, evidence} = fixture();
  for (const [key, value] of [
    ['assetID', 'b0a640ea-99e5-4a44-b9db-df310a6862e4'],
    ['originalSHA256', 'c'.repeat(64)], ['savedRevision', 8]
  ]) {
    const changed = {...subject, provenance: {...subject.provenance, [key]: value}};
    await assert.rejects(applyBoundAddShadow(background, changed, evidence, bind(),
      settings({mode: 'none'})), /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
    await assert.rejects(applyBoundAddShadow(background, subject,
      {...evidence, [key]: value}, bind(), settings()),
    /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  }
  await assert.rejects(applyBoundAddShadow(background,
    {...subject, provenance: {...subject.provenance, kind: 'original-shadow-mask'}},
    evidence, bind(), settings()), /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
});

test('SHADOW-BOUND-03: selected backdrop ID/SHA, dimensions, provenance shape and composite bytes are checked', async () => {
  const {background, subject, evidence} = fixture();
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, backdropID: 'b0a640ea-99e5-4a44-b9db-df310a6862e4'}, bind(), settings()),
  /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, backdropSHA256: 'c'.repeat(64)}, bind(), settings()),
  /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, width: 12}, bind(), settings()), /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, autoDetect: true}, bind(), settings()),
  /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, source: 'unverified'}, bind(), settings()),
  /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject, evidence,
    {...bind(), savedRevision: 8}, settings()), /BACKGROUND_COMPOSITE_PROVENANCE_MISMATCH/);
  const tampered = {width: background.width, height: background.height,
    data: new Uint8ClampedArray(background.data)};
  tampered.data[0]++;
  await assert.rejects(applyBoundAddShadow(tampered, subject, evidence, bind(), settings()),
    /ADD_SHADOW_BACKGROUND_PIXELS_MISMATCH/);
  assert.deepEqual(background.data.slice(0, 4), new Uint8ClampedArray([200, 180, 160, 255]));
});

test('SHADOW-BOUND-04: abort before and after digest never returns pixels or mutates inputs', async () => {
  const {background, subject, evidence} = fixture();
  const before = [background.data.slice(), subject.data.slice()];
  const pre = new AbortController(); pre.abort();
  await assert.rejects(applyBoundAddShadow(background, subject, evidence, bind(),
    settings(), {signal: pre.signal}), {name: 'AbortError'});
  const during = new AbortController();
  const pending = applyBoundAddShadow(background, subject, evidence, bind(),
    settings(), {signal: during.signal});
  during.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.deepEqual([background.data, subject.data], before);
});

test('SHADOW-BOUND-05: evidence is fixed before the async digest; unsupported sources and malformed bindings refuse', async () => {
  const {background, subject, evidence} = fixture();
  const stale = {...evidence, compositeSHA256: 'c'.repeat(64)};
  const pending = applyBoundAddShadow(background, subject, stale, bind(), settings());
  stale.compositeSHA256 = evidence.compositeSHA256;
  await assert.rejects(pending, /ADD_SHADOW_BACKGROUND_PIXELS_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject,
    {...evidence, source: 'owner-selected-solid-color'}, bind(), settings()),
  /ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH/);
  await assert.rejects(applyBoundAddShadow(background, subject, evidence,
    {...bind(), backdropID: 'not-an-id'}, settings()), /ADD_SHADOW_BINDING_INVALID/);
  await assert.rejects(applyBoundAddShadow(background, subject, evidence,
    {...bind(), untrusted: true}, settings()), /ADD_SHADOW_BINDING_INVALID/);
});
