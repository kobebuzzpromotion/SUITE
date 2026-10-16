import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {neutralRecipe, EditorSession} from '../src/session.mjs';
import {applySelectiveColor, validateSelectiveColor, SELECTIVE_COLOR_RANGES,
  SELECTIVE_COLOR_CONTROLS} from '../src/processing/selective-color.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {portableParameters, checkParameters} from '../preset-policy.mjs';
import {applyBatchRecipe} from '../src/batch-edit.mjs';

const clone = value => structuredClone(value);
const samples = {
  reds: [210, 50, 60], yellows: [200, 180, 40], greens: [40, 200, 80],
  cyans: [40, 180, 200], blues: [40, 75, 200], magentas: [180, 40, 200],
  whites: [220, 220, 220], neutrals: [125, 125, 125], blacks: [35, 35, 35],
};
const image = triples => ({width: triples.length, height: 1,
  data: new Uint8ClampedArray(triples.flatMap(rgb => [...rgb, 255]))});
function withSelectiveColor(settings) {
  const body = neutralRecipe();
  body.parameters.extendedParameters.postDecodeAdjustments = {
    schemaVersion: 1, engineVersion: 'suite-srgb8-color-detail-1',
    color: {selectiveColor: settings},
  };
  body.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(body);
  return body;
}

test('SELECTIVE-AUDIT-01 / each of nine ranges has four live CMYK operations and methods differ', () => {
  assert.deepEqual(SELECTIVE_COLOR_RANGES, Object.keys(samples));
  assert.deepEqual(SELECTIVE_COLOR_CONTROLS, ['cyan', 'magenta', 'yellow', 'black']);
  for (const range of SELECTIVE_COLOR_RANGES) {
    const source = image([samples[range]]), original = source.data.slice();
    for (const control of SELECTIVE_COLOR_CONTROLS) {
      const settings = {method: 'absolute', ranges: {[range]: {[control]: 30}}};
      assert.equal(validateSelectiveColor(settings).ranges[range][control], 30);
      const out = applySelectiveColor(source, settings);
      assert.notDeepEqual(out.data, original, `${range}.${control} must affect its matching color`);
      assert.deepEqual(source.data, original, 'source pixels must remain unchanged');
    }
  }
  const source = image([[125, 125, 125]]);
  const ranges = {neutrals: {magenta: 30}};
  assert.notDeepEqual(applySelectiveColor(source, {method: 'relative', ranges}).data,
    applySelectiveColor(source, {method: 'absolute', ranges}).data);
  assert.throws(() => validateSelectiveColor({method: 'Relative', ranges}), /INVALID_SELECTIVE_COLOR_METHOD/);
});

test('SELECTIVE-AUDIT-02 / typed Recipe and Author portable parameters carry nine groups and method into Final pixels', () => {
  const ranges = Object.fromEntries(SELECTIVE_COLOR_RANGES.map(name => [name,
    {cyan: 12, magenta: -11, yellow: 10, black: -9}]));
  const settings = {method: 'absolute', ranges};
  const body = withSelectiveColor(settings), before = clone(body);
  const portable = portableParameters(body);
  assert.deepEqual(portable.postDecodeAdjustments.color.selectiveColor, settings);
  assert.deepEqual(checkParameters(portable), portable);
  const source = image(Object.values(samples)), original = source.data.slice();
  const actual = renderPixels(source, body, {validateRecipe, resolutionAssessment});
  assert.deepEqual(actual.data, applySelectiveColor(source, settings).data);
  assert.notDeepEqual(actual.data, original);
  assert.deepEqual(source.data, original);
  assert.deepEqual(body, before);
});

test('SELECTIVE-AUDIT-03 / whole-Recipe Batch still replaces unrelated settings; separate Selective-only Sync exists', async () => {
  const sourceId = 'source', targetId = 'target', sourceSHA = 'a'.repeat(64), targetSHA = 'b'.repeat(64);
  const sourceBody = withSelectiveColor({method: 'absolute', ranges: {reds: {cyan: 30}}});
  sourceBody.parameters.exposure = 0.6;
  const targetBody = neutralRecipe(); targetBody.parameters.exposure = -0.4;
  const stored = new Map([[sourceId, {assetId: sourceId, revision: 2, body: clone(sourceBody)}],
    [targetId, {assetId: targetId, revision: 4, body: clone(targetBody)}]]);
  const assets = [{id: sourceId, sha256: sourceSHA}, {id: targetId, sha256: targetSHA}];
  const api = {
    async listAssets() {return clone(assets);},
    async getRecipe(id) {return clone(stored.get(id));},
    async assertPermission() {return {authorized: true};},
    async saveRecipe(id, revision, body) {
      assert.equal(id, targetId); assert.equal(revision, 4);
      const saved = {assetId: id, revision: 5, body: clone(body)};
      stored.set(id, saved); return clone(saved);
    },
  };
  const result = await applyBatchRecipe({api, source: {id: sourceId, sha256: sourceSHA, revision: 2},
    targets: [{id: targetId, sha256: targetSHA, revision: 4}]});
  assert.equal(result.status, 'complete');
  assert.deepEqual(stored.get(targetId).body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,
    {method: 'absolute', ranges: {reds: {cyan: 30}}});
  assert.equal(stored.get(targetId).body.parameters.exposure, 0.6,
    'whole-Recipe Batch changes unrelated target exposure too');
  assert.equal(typeof EditorSession.prototype.batchSyncSelectiveColor, 'function',
    'Selective-only operation is separate from legacy whole-Recipe Batch');
});
