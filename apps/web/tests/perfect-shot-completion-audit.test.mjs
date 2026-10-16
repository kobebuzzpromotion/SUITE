import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createManualCullingProject, setManualCullingMark} from '../src/smart-culling-project.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {encode} from '../src/processing/encode.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {syntheticPixels, detection, portrait, recipe} from './fixtures.mjs';

// Source mapping and SUITE contract characterization only. These synthetic
// tests do not exercise same-person matching, expression ranking, TSQ copies,
// real RAW, device culling, Cloud, or cross-photo synthesis.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('PERFECT-AUDIT-01 / SOURCE: EV3-0921 is Auto Fix within a five-option Perfect Shot group', async () => {
  const source = JSON.parse(await readFile(resolve(root, 'docs/EVOTO_AUDIT/evoto-deep-audit.json'), 'utf8'));
  const entries = Array.isArray(source) ? source : Object.values(source).flatMap(value => Array.isArray(value) ? value : []);
  const options = ['Auto Fix', 'Custom Fix', 'Same-person face replacement', '±7photos search', 'New tsq copy'];
  for (let index = 0; index < options.length; index++) {
    const id = `EV3-${String(921 + index).padStart(4, '0')}`;
    const candidate = entries.find(entry => entry?.id === id);
    assert.ok(candidate, `original candidate ${index} must remain traceable`);
    assert.equal(candidate.feature, 'Perfect Shot');
    assert.equal(candidate.option, options[index]);
  }
});

test('PERFECT-AUDIT-02 / SYNTHETIC: manual culling only records user marks; it does not create an ideal group shot', () => {
  const assets = ['a', 'b', 'c'].map(id => ({id, tenantId: 'studio', deletedAt: null,
    sha256: id.repeat(64), name: `${id}.raw`}));
  const initial = createManualCullingProject({workspaceId: 'studio', projectId: 'shoot', assets});
  const marked = setManualCullingMark(initial, 'b', {selected: true, rating: 5});
  assert.equal(marked.revision, 1);
  assert.deepEqual(marked.assetIds, ['a', 'b', 'c']);
  assert.deepEqual(marked.marks.map(item => item.selected), [false, true, false]);
  assert.deepEqual(initial.marks.map(item => item.selected), [false, false, false]);
  assert.equal(Object.hasOwn(marked, 'pixels'), false);
  assert.equal(Object.hasOwn(marked, 'generatedAsset'), false);
});

test('PERFECT-AUDIT-03 / SYNTHETIC: existing portrait edit is one-frame local; TSQ Final is unsupported', async () => {
  const input = syntheticPixels(), originalBytes = input.data.slice();
  const result = renderPixels(input, recipe(portrait()), {
    detections: [detection(), detection(0.6)], validateRecipe, resolutionAssessment,
  });
  assert.equal(result.width, input.width);
  assert.equal(result.height, input.height);
  assert.notDeepEqual(result.data, input.data); // actual same-photo brightness correction
  assert.deepEqual(input.data, originalBytes);
  await assert.rejects(encode(result, {format: 'tsq'}), /UNSUPPORTED_WEB_ENCODING/);
});
