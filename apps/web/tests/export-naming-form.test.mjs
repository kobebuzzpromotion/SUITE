import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExportFilename, EXPORT_NAMING_METHODS} from '../src/export-naming.mjs';
import {buildExportFilenameFromForm, normalizeExportNamingForm} from '../src/export-naming-form.mjs';

const base = Object.freeze({originalFilename: 'IMG_1234.CR3', format: 'jpeg'});

test('EXPORT-FORM01: all nine methods delegate to the existing filename planner', () => {
  const cases = [
    [{method: 'original'}, 'IMG_1234.jpg'],
    [{method: 'custom-count', customName: 'Session', sequence: '1', total: '10'}, 'Session (1 of 10).jpg'],
    [{method: 'capture-date-original', captureDate: '2024-07-30'}, '20240730_IMG_1234.jpg'],
    [{method: 'custom-sequence', customName: 'Session', sequence: '01', total: '10'}, 'Session_001.jpg'],
    [{method: 'original-custom', customText: 'Final'}, 'IMG_1234_Final.jpg'],
    [{method: 'original-effect-preset', effectPresetName: 'Portrait'}, 'IMG_1234_Portrait.jpg'],
    [{method: 'original-export-preset', exportPresetName: 'WebRes'}, 'IMG_1234_WebRes.jpg'],
    [{method: 'original-effect-export-preset', effectPresetName: 'Portrait', exportPresetName: 'WebRes'},
      'IMG_1234_Portrait_WebRes.jpg'],
    [{method: 'original-effect-custom', effectPresetName: 'Portrait', customText: 'Final'},
      'IMG_1234_Portrait_Final.jpg'],
  ];
  assert.deepEqual(cases.map(([input]) => input.method), EXPORT_NAMING_METHODS);
  for (const [input, filename] of cases) {
    const form = {...base, ...input}, before = structuredClone(form);
    const normalized = normalizeExportNamingForm(form);
    assert.equal(buildExportFilename(normalized), filename);
    assert.equal(buildExportFilenameFromForm(form), filename);
    assert.deepEqual(form, before);
  }
});

test('EXPORT-FORM02: required metadata and selected preset names are never fabricated', () => {
  const missing = [
    [{method: 'capture-date-original'}, /EXPORT_CAPTURE_DATE_REQUIRED/],
    [{method: 'capture-date-original', captureDate: '  '}, /EXPORT_CAPTURE_DATE_REQUIRED/],
    [{method: 'custom-count', sequence: '1', total: '2'}, /EXPORT_CUSTOM_NAME_REQUIRED/],
    [{method: 'custom-count', customName: 'Set', total: '2'}, /EXPORT_SEQUENCE_REQUIRED/],
    [{method: 'custom-sequence', customName: 'Set', sequence: '1'}, /EXPORT_TOTAL_REQUIRED/],
    [{method: 'original-custom'}, /EXPORT_CUSTOM_TEXT_REQUIRED/],
    [{method: 'original-effect-preset'}, /EXPORT_EFFECT_PRESET_NAME_REQUIRED/],
    [{method: 'original-export-preset'}, /EXPORT_EXPORT_PRESET_NAME_REQUIRED/],
    [{method: 'original-effect-export-preset', effectPresetName: 'Portrait'},
      /EXPORT_EXPORT_PRESET_NAME_REQUIRED/],
    [{method: 'original-effect-custom', effectPresetName: 'Portrait'}, /EXPORT_CUSTOM_TEXT_REQUIRED/],
  ];
  for (const [input, expected] of missing)
    assert.throws(() => buildExportFilenameFromForm({...base, ...input}), expected);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'custom-count',
    customName: 'Set', sequence: ' ', total: '2'}), /EXPORT_SEQUENCE_REQUIRED/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'capture-date-original',
    captureDate: '2024-02-30'}), /EXPORT_CAPTURE_DATE_INVALID/);
});

test('EXPORT-FORM03: browser number strings normalize without implicit queue positions', () => {
  const form = {...base, method: 'custom-sequence', customName: 'A/B', sequence: ' 02 ', total: '12'};
  const options = normalizeExportNamingForm(form);
  assert.equal(options.customName, 'A_B');
  assert.equal(options.sequence, 2);
  assert.equal(options.total, 12);
  assert.equal(buildExportFilenameFromForm(form), 'A_B_002.jpg');
  for (const sequence of ['0', '-1', '1.5', '1e2', 'x', 1.5, -1, Infinity])
    assert.throws(() => buildExportFilenameFromForm({...form, sequence}), /EXPORT_SEQUENCE_INVALID/);
  assert.throws(() => buildExportFilenameFromForm({...form, sequence: '13'}), /EXPORT_SEQUENCE_INVALID/);
});

test('EXPORT-FORM04: collision set and cross-platform safety remain delegated to planner', () => {
  const first = buildExportFilenameFromForm({...base, method: 'original'});
  const next = buildExportFilenameFromForm({...base, method: 'original',
    existingNames: new Set([first])});
  assert.equal(next, 'IMG_1234_01.jpg');
  assert.deepEqual(normalizeExportNamingForm({...base, method: 'original',
    existingNames: new Set([first])}).existingNames, [first]);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original',
    existingNames: ['ok.jpg', 42]}), /EXPORT_EXISTING_NAMES_INVALID/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original-custom',
    customText: 'x'.repeat(4097)}), /EXPORT_NAME_TOO_LONG/);
});

test('EXPORT-FORM05: unsupported forms, names and formats fail closed', () => {
  assert.throws(() => buildExportFilenameFromForm({...base}), /EXPORT_NAMING_METHOD_REQUIRED/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'unknown'}), /EXPORT_NAMING_METHOD_UNSUPPORTED/);
  assert.equal(buildExportFilenameFromForm({...base, method: 'original', format: 'tiff'}), 'IMG_1234.tif');
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original', format: 'bmp'}),
    /EXPORT_FORMAT_UNSUPPORTED/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original', originalFilename: ''}),
    /EXPORT_ORIGINAL_NAME_REQUIRED/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original', fakeMetadata: 'today'}),
    /EXPORT_NAMING_FORM_INVALID/);
  assert.throws(() => buildExportFilenameFromForm({...base, method: 'original', [Symbol('hidden')]: 1}),
    /EXPORT_NAMING_FORM_INVALID/);
});
