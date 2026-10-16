import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';
import {applyLocalLevels} from '../src/processing/local-levels.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('CLOTHING-AUDIT-01: frozen seven controls and separate correction pen retain documented dependencies',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  for(const [id,name] of [[313,'De-wrinkle Clothing'],[314,'Remove Fine Wrinkles'],
    [315,'Remove Coarse Wrinkles'],[316,'De-Blemish Clothing'],
    [317,'Clothing Edge Smoothing'],[318,'Clothing Edge Refinement'],
    [319,'Objects Protection']])
    assert.match(master,new RegExp(`\\| EV3-${String(id).padStart(4,'0')} \\| Clothing \\| Clothing adjustments \\| Clothing adjustments \\| ${name} \\| DOCUMENTED`));
  assert.match(master,/\| EV3-0320 \| Clothing \| Clothing adjustments \| Clothing adjustments \| Manual Tuning brush\/erase \| DOCUMENTED/);
  const audit=await read('docs/CLOTHING_ADJUSTMENTS_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/clothing-adjustment/',
    'https://support.evoto.ai/clothing-adjustment-ipad/',
    'https://support.evoto.ai/clothing-accessories-adjustments-module/'])
    assert.ok(audit.includes(url));
  assert.match(audit,/0314\/0315が主De-wrinkleを有効にした後/u);
  assert.match(audit,/0318\/0319がEdge Smoothingと連動/u);
  assert.match(audit,/0\/44のまま/u);
});

test('CLOTHING-AUDIT-02: real Detail is luminance-only generic and rejects a clothing-specific alias',()=>{
  const pixels=syntheticPixels(4,4,96),before=Uint8ClampedArray.from(pixels.data);
  assert.throws(()=>applyDetailAdjustments(pixels,{clothingWrinkle:60}),/INVALID_DETAIL_PARAMETERS/);
  const valid=applyDetailAdjustments(pixels,{clarity:40,texture:20});
  assert.deepEqual(pixels.data,before);
  assert.equal(valid.detailProvenance.visualVerification,'NOT_RUN');
  assert.deepEqual(valid.detailProvenance.order,['denoise','clarity','texture','sharpness']);
  assert.equal(valid.detailProvenance.parameters.clarity,40);
  assert.equal(valid.detailProvenance.parameters.texture,20);
});

test('CLOTHING-AUDIT-03: Local Levels honors explicit coverage only, not cloth detection or defect removal',()=>{
  const pixels=syntheticPixels(2,1,96),before=Uint8ClampedArray.from(pixels.data);
  const mask={width:2,height:1,data:new Uint8Array([255,0])};
  const result=applyLocalLevels(pixels,mask,{master:{gamma:1.8}});
  assert.notDeepEqual(Array.from(result.data.slice(0,3)),[96,96,96]);
  assert.deepEqual(Array.from(result.data.slice(4,8)),[96,96,96,255]);
  assert.deepEqual(pixels.data,before);
});

test('CLOTHING-AUDIT-04: invented clothing Recipe cannot reach Worker renderer or portable Preset',()=>{
  const invented=recipe();invented.parameters.extendedParameters.clothingAdjustments={
    deWrinkle:50,objectsProtection:true};
  assert.throws(()=>renderPixels(syntheticPixels(4,4),invented,{validateRecipe}),
    /UNSUPPORTED_WEB_ADJUSTMENT|INVALID_/);
  assert.throws(()=>portablePresetRecipe(invented),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('CLOTHING-AUDIT-05: product UI/Session/pure have no garment-specific controls or effects',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs',
    'apps/web/src/processing/pure.mjs','apps/web/src/processing/worker.mjs']){
    const source=await read(path);
    assert.doesNotMatch(source,/clothingWrinkle|clothingAdjustments|clothingEdgeSmoothing|deBlemishClothing/i,path);
  }
  const [detail,local,subject]=await Promise.all([
    read('apps/web/src/processing/detail-adjustments.mjs'),
    read('apps/web/src/processing/local-levels.mjs'),
    read('apps/web/src/processing/subject-mask-authoring.mjs')]);
  assert.match(detail,/Distinct sRGB8 post-color stages/);
  assert.match(local,/mask is supplied by the caller: no person detection/);
  assert.match(subject,/Manual coverage authoring, not subject recognition or Local Levels masking/);
});
