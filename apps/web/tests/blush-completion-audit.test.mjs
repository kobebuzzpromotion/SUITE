import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitRecipe} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {renderPixels} from '../src/processing/pure.mjs';
import {applyLocalLevels} from '../src/processing/local-levels.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {recipe,portrait,syntheticPixels} from './fixtures.mjs';

const read=path=>readFile(new URL(`../../../${path}`,import.meta.url),'utf8');

test('BLUSH-AUDIT-01: frozen source documents style selection, not a confirmed blush Amount or pixel formula',async()=>{
  const master=await read('docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md');
  assert.match(master,/\| EV3-0030 \| Portrait \| Makeup components \/ Blush \| Blush \| Style selection \| DOCUMENTED/);
  assert.match(master,/\| EV3-0031 \| Portrait \| Makeup components \/ Blush \| Blush \| Amount \| NOT_CONFIRMED/);
  const audit=await read('docs/BLUSH_COMPLETION_AUDIT.md');
  for(const url of ['https://support.evoto.ai/makeup/','https://support.evoto.ai/makeup-ipad/',
    'https://support.evoto.ai/portrait-retouching-makeup/'])assert.ok(audit.includes(url));
  assert.match(audit,/12種類のスタイル/);
  assert.match(audit,/0\/44 のまま/);
});

test('BLUSH-AUDIT-02: selected face brightness and manual tonal coverage are not cheek makeup style processing',()=>{
  const bound=portrait();
  assert.doesNotThrow(()=>validatePortraitRecipe(bound));
  bound.targets[0].adjustmentType='blush';
  assert.throws(()=>validatePortraitRecipe(bound),/INVALID_PORTRAIT_TARGET/);
  const pixels=syntheticPixels(2,1,96);
  const mask={width:2,height:1,data:new Uint8Array([255,0])};
  const result=applyLocalLevels(pixels,mask,{master:{gamma:1.8}});
  assert.notDeepEqual(Array.from(result.data.slice(0,3)),[96,96,96]);
  assert.deepEqual(Array.from(result.data.slice(4,8)),[96,96,96,255]);
  assert.deepEqual(Array.from(pixels.data),[96,96,96,255,96,96,96,255]);
});

test('BLUSH-AUDIT-03: fake blush aliases fail; typed manual syntax is not render or portable Preset support',()=>{
  const candidate=recipe();candidate.parameters.extendedParameters.blush={style:1};
  assert.throws(()=>validateRecipe(candidate),/INVALID_BLUSH_MANUAL_ALIAS/);
  const typed=recipe();typed.parameters.extendedParameters.blushManual={
    schemaVersion:1,engineVersion:'suite-srgb8-owner-manual-blush-color-1',
    binding:{assetID:'11111111-1111-4111-8111-111111111111',originalSHA256:'a'.repeat(64),
      sourceWidth:4,sourceHeight:4,personID:'33333333-3333-4333-8333-333333333333'},
    cheekStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],radiusFraction:.04,hardness:.6}],
    settings:{color:{r:200,g:30,b:90},opacity:.5}};
  assert.doesNotThrow(()=>validateRecipe(typed),'typed syntax is not processing support');
  assert.throws(()=>renderPixels(syntheticPixels(4,4),typed,{validateRecipe}),
    /UNSUPPORTED_WEB_ADJUSTMENT/);
  assert.throws(()=>portablePresetRecipe(typed),/PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION/);
});

test('BLUSH-AUDIT-04: isolated Worker exists but product Editor/Session have no Blush mount',async()=>{
  for(const path of ['apps/web/src/editor-ui.mjs','apps/web/src/session.mjs']){
    const code=await read(path);
    assert.doesNotMatch(code,/\bblush\b/i,`${path} has no product Blush path yet`);
  }
  const facade=await read('apps/web/src/processing/index.mjs');
  const worker=await read('apps/web/src/processing/worker.mjs');
  assert.match(facade,/renderManualBlush/,'explicit isolated facade exists');
  assert.match(worker,/rasterizeManualBlushMask/,'Worker processes saved manual mask');
  const editor=await read('apps/web/src/editor-ui.mjs');
  assert.match(editor,/id="face-brightness"/);
  assert.match(editor,/id="local-brush-channel"/);
  assert.doesNotMatch(editor,/manual-makeup-highlight-ui\.mjs/);
});
