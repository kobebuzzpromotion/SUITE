import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';
import {planExportDimensions} from '../src/export-size.mjs';
import {FEATURE_CATALOG} from '../src/feature-catalog.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function syntheticLine() {
  const width = 3000, data = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) {
    const i = x * 4, value = x === 1500 ? 192 : 128;
    data.set([value, value, value, 255], i);
  }
  return {width, height: 1, data};
}

test('DETAIL-ENHANCE-AUDIT-01 / local scalar detail filters affect synthetic pixels but neither dimensions nor Original', () => {
  const source = syntheticLine(), original = source.data.slice();
  const center = output => output.data[1500 * 4];
  const outputs = new Map();
  for (const control of ['clarity', 'texture', 'sharpness', 'denoise']) {
    const output = applyDetailAdjustments(source, {[control]: 100});
    assert.deepEqual([output.width, output.height], [source.width, source.height]);
    assert.notEqual(center(output), center(source), `${control} must be a real local pixel operation`);
    assert.equal(output.detailProvenance.colorSpace, 'sRGB8 encoded luminance');
    outputs.set(control, center(output));
  }
  assert.equal(new Set(outputs.values()).size, 4, 'the four controls are not one shared dummy slider');
  assert.deepEqual(source.data, original);
});

test('DETAIL-ENHANCE-AUDIT-02 / current export sizing is reduction-only, not 2K/4K/6K enhancement', () => {
  assert.deepEqual([planExportDimensions({width: 1000, height: 600}, {kind: 'original'}).width,
    planExportDimensions({width: 1000, height: 600}, {kind: 'original'}).height], [1000, 600]);
  assert.throws(() => planExportDimensions({width: 1000, height: 600},
    {kind: 'width', value: 2000}), /EXPORT_SIZE_WIDTH_INVALID/);
  assert.throws(() => planExportDimensions({width: 1000, height: 600},
    {kind: '2K'}), /EXPORT_SIZE_MODE_UNSUPPORTED/);
  const upscale = FEATURE_CATALOG.flatMap(group => group.items)
    .find(([label]) => label === 'Upscale');
  assert.deepEqual(upscale, ['Upscale', 'NOT_CONNECTED']);
});

test('DETAIL-ENHANCE-AUDIT-03 / global filter has no hair, face or clothing target binding', () => {
  const pixels = syntheticLine();
  const faceTagged = {...pixels, subjectHint: 'face'};
  const clothingTagged = {...pixels, subjectHint: 'clothing'};
  const settings = {clarity: 60, texture: 80, sharpness: 45, denoise: 10};
  const face = applyDetailAdjustments(faceTagged, settings);
  const clothing = applyDetailAdjustments(clothingTagged, settings);
  assert.deepEqual(face.data, clothing.data);
  assert.deepEqual([face.width, face.height], [clothing.width, clothing.height]);
  // These labels are deliberately untrusted fixture metadata, not a product mask API.
});

test('DETAIL-ENHANCE-AUDIT-04 / documented source IDs and current Batch Recipe-copy boundary stay distinct', async () => {
  const [sourceMatrix, batch, editor, session] = await Promise.all([
    readFile(resolve(here, '../../../docs/EVOTO_AUDIT/EVOTO_AI_LAB_MATRIX.md'), 'utf8'),
    readFile(resolve(here, '../src/batch-edit.mjs'), 'utf8'),
    readFile(resolve(here, '../src/editor-ui.mjs'), 'utf8'),
    readFile(resolve(here, '../src/session.mjs'), 'utf8'),
  ]);
  for (const [id, operation] of [
    ['EV3-1058', 'No Upscale'], ['EV3-1059', '2K'], ['EV3-1060', '4K'],
    ['EV3-1061', '6K'], ['EV3-1062', 'Sharpness'], ['EV3-1063', 'Texture'],
    ['EV3-1064', 'Hair detail'], ['EV3-1065', 'Facial detail'],
    ['EV3-1066', 'Clothing patterns'], ['EV3-1067', 'Crop-dependentresolution'],
  ]) assert.ok(sourceMatrix.includes(`| ${id} | AI Lab | Detail Enhance | Detail Enhance | ${operation} |`));
  assert.match(batch, /const fixedRecipe = structuredClone\(checkedBody\(sourceStored\.body, selectedSource\)\)/);
  assert.match(editor, /key:'detail\.clarity'|\['clarity','明瞭度'/);
  assert.match(editor, /key:'detail\.denoise'/);
  assert.match(session, /const DETAIL_FIELDS=new Set\(\['clarity','texture','sharpness','denoise'/);
  assert.doesNotMatch(batch, /detailEnhance|AI Lab|No Upscale/);
  assert.doesNotMatch(session, /detailEnhance|noUpscale/);
});
