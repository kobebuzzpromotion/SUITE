import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {POINT_CURVE_CONTRAST_PRESETS,pointCurveContrastPoints,selectedPointCurveContrast,canApplyPointCurveContrast} from '../src/editor-ui.mjs';
import {buildPointCurveLUT,applyPointCurves} from '../src/processing/point-curves.mjs';
import {EditorSession,checksum,neutralRecipe} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A,WHEN,syntheticPixels} from './fixtures.mjs';

function withMaster(master){
  return {parameters:{extendedParameters:{postDecodeAdjustments:{color:{pointCurves:{...(master?{master}:{}),red:[{x:0,y:0},{x:255,y:255}]}}}}}};
}

test('SUITE contrast presets are effective ordered Master curves, not third-party pixel claims',()=>{
  assert.deepEqual(Object.keys(POINT_CURVE_CONTRAST_PRESETS),['linear','medium','strong']);
  assert.equal(pointCurveContrastPoints('linear'),null);
  const medium=pointCurveContrastPoints('medium'),strong=pointCurveContrastPoints('strong');
  assert.deepEqual(medium.map(point=>point.x),[0,64,128,192,255]);
  assert.ok(strong[1].y<medium[1].y&&strong[3].y>medium[3].y);
  const mediumLUT=buildPointCurveLUT(medium),strongLUT=buildPointCurveLUT(strong);
  assert.equal(mediumLUT[64],54);assert.equal(strongLUT[64],42);
  assert.equal(mediumLUT[192],202);assert.equal(strongLUT[192],214);
  const source={width:2,height:1,data:new Uint8ClampedArray([64,64,64,255,192,192,192,117])};
  const mediumPixels=applyPointCurves(source,{master:medium}),strongPixels=applyPointCurves(source,{master:strong});
  assert.notDeepEqual([...mediumPixels.data],[...source.data]);
  assert.notDeepEqual([...strongPixels.data],[...mediumPixels.data]);
  assert.deepEqual([mediumPixels.data[3],mediumPixels.data[7],strongPixels.data[3],strongPixels.data[7]],[255,117,255,117]);
  assert.deepEqual([...source.data],[64,64,64,255,192,192,192,117]);
  medium[1].y=12;assert.equal(pointCurveContrastPoints('medium')[1].y,54);
  assert.throws(()=>pointCurveContrastPoints('adobe-medium'),/POINT_CURVE_CONTRAST_PRESET_UNKNOWN/);
});

test('UI identifies Linear, Medium, Strong and custom without mistaking RGB child curves for Master',()=>{
  assert.equal(selectedPointCurveContrast(null),'linear');
  assert.equal(selectedPointCurveContrast(withMaster(null)),'linear');
  assert.equal(selectedPointCurveContrast(withMaster([{x:0,y:0},{x:255,y:255}])),'linear');
  assert.equal(selectedPointCurveContrast(withMaster(pointCurveContrastPoints('medium'))),'medium');
  assert.equal(selectedPointCurveContrast(withMaster(pointCurveContrastPoints('medium').map(point=>({y:point.y,x:point.x})))),'medium');
  assert.equal(selectedPointCurveContrast(withMaster(pointCurveContrastPoints('strong'))),'strong');
  assert.equal(selectedPointCurveContrast(withMaster([{x:0,y:0},{x:128,y:190},{x:255,y:255}])),'custom');
});

test('contrast buttons fail closed for absent image, busy/export, expired permission or missing Session method',()=>{
  const session={setPointCurve(){}};const state={asset:{id:'a'},busy:null,exporting:false};
  assert.equal(canApplyPointCurveContrast(session,state),true);
  assert.equal(canApplyPointCurveContrast({},state),false);
  assert.equal(canApplyPointCurveContrast(session,{...state,asset:null}),false);
  assert.equal(canApplyPointCurveContrast(session,{...state,busy:'preview'}),false);
  assert.equal(canApplyPointCurveContrast(session,{...state,exporting:true}),false);
  assert.equal(canApplyPointCurveContrast(session,state,{pending:true}),false);
  assert.equal(canApplyPointCurveContrast(session,state,{blocked:true}),false);
});

test('contrast choices use focus-visible native buttons with pressed state for keyboard activation',()=>{
  const source=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  const style=readFileSync(new URL('../src/editorial-editor.css',import.meta.url),'utf8');
  for(const name of ['linear','medium','strong'])
    assert.match(source,new RegExp(`<button type="button" data-curve-preset="${name}" aria-pressed=`));
  assert.match(source,/pointCurvePresets\.addEventListener\('click'/);
  assert.match(style,/\.point-curve-preset-buttons button:focus-visible/);
});

async function fixture(){
  const bytes=new TextEncoder().encode('POINT_CURVE_PRESET_NON_RAW').buffer,sha256=await checksum(bytes);
  const asset={id:ASSET_A,name:'non-raw.raw',sha256,size:bytes.byteLength};
  const initial=neutralRecipe(),remote=new Map([[asset.id,{revision:1,body:structuredClone(initial)}]]);
  const pixels=syntheticPixels(4,4,64);
  const cache=new Map([[asset.id,{asset,proxy:structuredClone(pixels),history:[initial],cursor:0,revision:1,reference:null,dirty:false}]]);
  const api={listAssets:async()=>[asset],getOriginal:async()=>bytes.slice(0),getRecipe:async id=>structuredClone(remote.get(id)??null),saveRecipe:async(id,expected,body)=>{
    assert.equal(expected,remote.get(id).revision);const saved={revision:expected+1,body:structuredClone(body)};remote.set(id,saved);return structuredClone(saved);
  }};
  const storage={get:async id=>structuredClone(cache.get(id)),put:async(id,value)=>cache.set(id,structuredClone(value))};
  const processing={decodeRaw:async()=>({pixels:structuredClone(pixels),provenance:{fixture:'NON_RAW'},metadata:{fixture:true}}),
    render:async(input,recipe,options)=>renderPixels(input,recipe,{...options,validateRecipe,resolutionAssessment}),
    encode:async input=>new Blob([input.data],{type:'image/png'})};
  let url=0;const urlAPI={createObjectURL:()=>`blob:contrast-${++url}`,revokeObjectURL(){}};
  const session=new EditorSession({api,storage,processing,urlAPI,clock:()=>WHEN});
  await session.initialize();await session.openAsset(asset.id);return {session,remote,asset,bytes};
}

test('Master contrast Save/Undo/Redo/Reload/Final preserves independent Red curve and Original',async()=>{
  const {session,remote,asset,bytes}=await fixture();
  const red=[{x:0,y:0},{x:64,y:80},{x:255,y:255}];
  await session.setPointCurve('red',red);await session.save();
  const redOnly=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  const medium=pointCurveContrastPoints('medium');await session.setPointCurve('master',medium);
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.red,red);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.master,undefined);
  await session.redo();assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.master,medium);
  await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves,{red,master:medium});
  const mediumOutput=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());assert.notDeepEqual(mediumOutput,redOnly);
  await session.setPointCurve('master',pointCurveContrastPoints('strong'));await session.save();
  const strongOutput=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());assert.notDeepEqual(strongOutput,mediumOutput);
  await session.setPointCurve('master',pointCurveContrastPoints('linear'));await session.save();
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves,{red});
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),redOnly);
  assert.equal(await checksum(bytes),asset.sha256);
});
