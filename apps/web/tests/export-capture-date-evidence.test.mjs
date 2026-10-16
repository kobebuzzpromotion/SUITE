import test from 'node:test';
import assert from 'node:assert/strict';
import {libRawTimestampEvidence} from '../src/processing/raw.mjs';
import {resolveExportNamingContext} from '../src/export-naming-context.mjs';

const state = metadata => ({asset: {id: 'asset-1', name: 'DSC_001.ARW',
  createdAt: '2024-09-02T00:00:00Z'}, recipe: {schemaVersion: 1, parameters: {}},
  revision: 2, dirty: false, metadata});

test('CAPTURE-NAME-01: LibRaw time_t evidence cannot assert camera-local calendar or timezone', () => {
  // A shooting instant near midnight has different civil dates at different
  // offsets. The wrapper exposes neither the original EXIF calendar nor offset.
  const evidence = libRawTimestampEvidence(1725150600n);
  assert.deepEqual(evidence, {libRawTimestampSeconds: '1725150600',
    libRawTimestampTimezone: 'UNVERIFIED'});
  assert.equal(Object.hasOwn(evidence, 'captureDate'), false);
  assert.equal(Object.hasOwn(evidence, 'captureCalendarDate'), false);
  assert.equal(Object.hasOwn(evidence, 'offsetTimeOriginal'), false);
  assert.equal(libRawTimestampEvidence('1725150600'), null);
});

test('CAPTURE-NAME-02: import time, numeric timestamp and unbound EXIF-looking fields cannot unlock filename', () => {
  const injected = state({libRawTimestampSeconds: '1725150600',
    libRawTimestampTimezone: 'UNVERIFIED', captureDate: '2024-09-01',
    dateTimeOriginal: '2024:08:31 23:30:00', offsetTimeOriginal: '-08:00'});
  assert.throws(() => resolveExportNamingContext({state: injected,
    method: 'capture-date-original', captureDate: '2024-09-01'}),
  /EXPORT_CAPTURE_DATE_UNAVAILABLE/);
  assert.throws(() => resolveExportNamingContext({state: state({}),
    method: 'capture-date-original'}), /EXPORT_CAPTURE_DATE_UNAVAILABLE/);
  assert.deepEqual(resolveExportNamingContext({state: injected, method: 'original'}),
    {originalFilename: 'DSC_001.ARW'});
});
