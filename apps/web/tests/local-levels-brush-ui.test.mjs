import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canPaintLocalLevels,localLevelsStrokeSettings} from '../src/editor-ui.mjs';

const session={setLocalLevels(){}};
const state={asset:{id:'photo-1'},revision:1,afterURL:'blob:after',beforeURL:'blob:before',dirty:false,busy:null,exporting:false};

test('Local Levels brush refuses dirty, busy, missing images, Before, permission and missing session method',()=>{
  assert.equal(canPaintLocalLevels(session,state,{geometryReady:true}),true);
  for(const change of [{dirty:true},{revision:0},{busy:'processing'},{exporting:true},{afterURL:null},{beforeURL:null},{asset:null}])
    assert.equal(canPaintLocalLevels(session,{...state,...change},{geometryReady:true}),false);
  for(const options of [{geometryReady:false},{view:'before',geometryReady:true},{pending:true,geometryReady:true},{blocked:true,geometryReady:true}])
    assert.equal(canPaintLocalLevels(session,state,options),false);
  assert.equal(canPaintLocalLevels({},state,{geometryReady:true}),false);
});

test('stroke settings preserve saved strokes/channels and reject invalid or excessive input',()=>{
  const existing={parameters:{extendedParameters:{localLevels:{strokes:[{points:[{x:.1,y:.2}],radius:.08,hardness:.7,mode:'add'}],levels:{red:{gamma:1.4}}}}}};
  const input={points:[{x:.3,y:.4}],mode:'erase',radius:.09,hardness:.4,channel:'master',controls:{inputBlack:2,inputWhite:240,gamma:1.2,outputBlack:0,outputWhite:250}};
  const settings=localLevelsStrokeSettings(existing,input);
  assert.equal(settings.strokes.length,2);assert.deepEqual(settings.strokes[0],existing.parameters.extendedParameters.localLevels.strokes[0]);
  assert.deepEqual(settings.levels.red,{gamma:1.4});assert.deepEqual(settings.levels.master,input.controls);
  settings.strokes[0].points[0].x=.9;assert.equal(existing.parameters.extendedParameters.localLevels.strokes[0].points[0].x,.1);
  for(const bad of [{...input,points:[{x:-.1,y:.2}]},{...input,mode:'auto'},{...input,radius:.51},{...input,hardness:NaN},{...input,controls:{...input.controls,inputBlack:241}},{...input,controls:{...input.controls,gamma:Infinity}}])
    assert.throws(()=>localLevelsStrokeSettings(existing,bad));
  const full={parameters:{extendedParameters:{localLevels:{strokes:Array.from({length:64},()=>existing.parameters.extendedParameters.localLevels.strokes[0]),levels:{}}}}};
  assert.throws(()=>localLevelsStrokeSettings(full,input),/LOCAL_BRUSH_LIMIT/);
});

test('Editor uses real Session stroke commit, pointer cancellation, and no automatic subject selection',async()=>{
  const source=await readFile(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  assert.match(source,/mapAfterToLocalBrushPoint\(/);
  assert.match(source,/mapAfterImagePointToLocalBrushPoint\(/);
  assert.match(source,/mapLocalBrushPointToAfter\(/);
  assert.match(source,/canvasExpand:params\?\.extendedParameters\?\.canvasExpand/);
  assert.match(source,/run\('setLocalLevels',settings\)/);
  assert.match(source,/run\('setLocalLevels',null\)/);
  assert.match(source,/pointercancel/);
  assert.match(source,/localBrushMode!==drawing\.mode/);
  assert.match(source,/brushImage\.addEventListener\('keydown'/);
  assert.match(source,/localBrushOverlay\.append\(line\)/);
  assert.match(source,/localBrushMode='off'/);
  assert.match(source,/人物の自動選択ではありません/);
});
