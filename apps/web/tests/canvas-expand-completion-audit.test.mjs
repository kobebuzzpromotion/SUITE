import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {neutralRecipe} from '../src/session.mjs';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {expandCanvasPixels, planCanvasExpansion} from '../src/processing/canvas-expand.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const here=dirname(fileURLToPath(import.meta.url));
const settings=(margins,background)=>({schemaVersion:1,margins,...(background?{background}:{})});
const zero={left:0,right:0,top:0,bottom:0};

test('CANVAS-AUDIT-01: four manual margins and flat fill affect a new RGBA frame, not the source',()=>{
  const source={width:4,height:3,data:new Uint8ClampedArray(4*3*4)};
  source.data.set([11,22,33,255],0);
  const original=source.data.slice();
  const recipe=settings({left:.25,right:.5,top:1/3,bottom:1/3},[128,128,128,255]);
  const projected=projectCanvasExpansion(source,recipe);
  assert.deepEqual(projected.margins,{left:1,right:2,top:1,bottom:1});
  const output=expandCanvasPixels(source,projected);
  assert.deepEqual([output.width,output.height],[7,5]);
  assert.deepEqual([...output.data.slice(0,4)],[128,128,128,255]);
  assert.deepEqual([...output.data.slice((1*7+1)*4,(1*7+2)*4)],[11,22,33,255]);
  assert.deepEqual(source.data,original);
});

test('CANVAS-AUDIT-02: current projection uses post-Crop frame, not Original dimensions',()=>{
  const cropped={width:60,height:100,sourceWidth:4000,sourceHeight:3000};
  const projected=projectCanvasExpansion(cropped,settings({left:.5,right:0,top:.2,bottom:0}));
  assert.deepEqual(projected.margins,{left:30,right:0,top:20,bottom:0});
  assert.notEqual(projected.margins.left,2000);
  assert.notEqual(projected.margins.top,600);
});

test('CANVAS-AUDIT-03: current Recipe/renderer limits exceed documented 200% and 13000px',()=>{
  const recipe=neutralRecipe();
  recipe.parameters.extendedParameters.canvasExpand=settings({...zero,left:2.01});
  assert.doesNotThrow(()=>validateRecipe(recipe));
  assert.equal(projectCanvasExpansion({width:10,height:1},recipe.parameters.extendedParameters.canvasExpand).margins.left,20);
  const plan=planCanvasExpansion({width:13000,height:1},{margins:{...zero,right:1}});
  assert.equal(plan.width,13001);
});

test('CANVAS-AUDIT-04: current UI is numeric post-Crop, white-first; Batch is Recipe copy, not AI crop inference',async()=>{
  const [ui,session,batch]=await Promise.all([
    readFile(resolve(here,'../src/editor-ui.mjs'),'utf8'),
    readFile(resolve(here,'../src/session.mjs'),'utf8'),
    readFile(resolve(here,'../src/batch-edit.mjs'),'utf8'),
  ]);
  assert.match(ui,/group:'canvas-expand'.*min:0,max:200/);
  assert.match(ui,/MANUAL EXPAND \/ POST-CROP/);
  assert.match(ui,/<option value="white">白<\/option><option value="gray">グレー<\/option>/);
  assert.match(ui,/切り抜き後の四辺に単色の余白/);
  assert.match(session,/current\?\.background\?\?\[255,255,255,255\]/);
  assert.match(session,/batchApplyCurrentRecipe\(targetIds\)/);
  assert.match(batch,/const fixedRecipe = structuredClone\(checkedBody\(sourceStored.body, selectedSource\)\)/);
  assert.doesNotMatch(ui,/Auto Expand During Sync|AI Locate/);
  assert.doesNotMatch(batch,/autoExpandDuringSync|inferCanvasExpansion|AI Locate/);
});
