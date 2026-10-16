import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralRecipe} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=path=>readFile(resolve(root,path),'utf8');

test('MOIRE-AUDIT-01: frozen audit separates all ten candidate subitems from product implementation',async()=>{
  const matrix=await read('docs/EVOTO_AUDIT/SUITE_GAP_MATRIX.md');
  for(let id=993;id<=1002;id++)assert.match(matrix,new RegExp(`\\| EV3-${String(id).padStart(4,'0')} \\|[^\\n]*Clothing Moir`));
  const audit=await read('docs/CLOTHING_MOIRE_COMPLETION_AUDIT.md');
  assert.match(audit,/NOT_IMPLEMENTED in SUITE/);
  assert.match(audit,/https:\/\/support\.evoto\.ai\/ai-lab\//);
  assert.match(audit,/Amount.*Batch.*RAW\/JPEG/s);
  assert.match(audit,/no full-candidate completion claim/i);
});

test('MOIRE-AUDIT-02: fabricated Clothing Moiré Recipe or Detail setting fails closed',()=>{
  const body=neutralRecipe();
  body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',detail:{clothingMoire:50}};
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  assert.throws(()=>validateRecipe(body),/INVALID_POST_DECODE_ADJUSTMENTS/);
  const pixels={width:2,height:1,data:new Uint8ClampedArray([80,100,120,255,180,150,110,255])};
  assert.throws(()=>applyDetailAdjustments(pixels,{clothingMoire:50}),/INVALID_DETAIL_PARAMETERS/);
});

test('MOIRE-AUDIT-03: no Editor/Session/renderer Clothing Moiré action masquerades as generic Detail',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs',
    'apps/web/src/processing/pure.mjs','apps/web/src/processing/worker.mjs']){
    const source=await read(path);
    assert.doesNotMatch(source,/clothingMoire|clothingMoiré|moireRemoval|moiréRemoval/i,path);
  }
  const detail=await read('apps/web/src/processing/detail-adjustments.mjs');
  assert.match(detail,/NOT RAW sensor-noise reduction, chroma denoising, or AI restoration/);
  assert.match(detail,/export function applyDetailAdjustments\(pixels,parameters=/);
});
