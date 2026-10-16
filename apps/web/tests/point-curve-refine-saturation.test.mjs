import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPointCurves} from '../src/processing/point-curves.mjs';
import {EditorSession,checksum,neutralRecipe} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {portableParameters,recipeFromParameters,checkParameters} from '../preset-policy.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A,WHEN} from './fixtures.mjs';

const master=[{x:0,y:0},{x:128,y:180},{x:255,y:255}];
const input={width:2,height:1,data:new Uint8ClampedArray([230,110,35,255,20,80,150,127])};
const bytes=frame=>[...frame.data];

test('refine saturation changes real curve pixels while absent and 100 retain the legacy result',()=>{
  const original=bytes(input),legacy=applyPointCurves(input,{master});
  assert.deepEqual(bytes(applyPointCurves(input,{master,refineSaturation:100})),bytes(legacy));
  const reduced=applyPointCurves(input,{master,refineSaturation:0});
  assert.notDeepEqual(bytes(reduced),bytes(legacy));
  assert.deepEqual(bytes(input),original);
  assert.deepEqual([reduced.data[3],reduced.data[7]],[255,127]);
  assert.throws(()=>applyPointCurves(input,{master,refineSaturation:-1}),/INVALID_POINT_CURVE_REFINE_SATURATION/);
  assert.throws(()=>applyPointCurves(input,{master,refineSaturation:101}),/INVALID_POINT_CURVE_REFINE_SATURATION/);
  assert.throws(()=>applyPointCurves(input,{master,refineSaturation:10.5}),/INVALID_POINT_CURVE_REFINE_SATURATION/);
  assert.throws(()=>applyPointCurves(input,{master,refineSaturation:'0'}),/INVALID_POINT_CURVE_REFINE_SATURATION/);
});

function recipeWith(value){
  const recipe=neutralRecipe();
  recipe.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{pointCurves:{master,refineSaturation:value}}};
  recipe.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return recipe;
}

test('Recipe and Author Preset preserve the optional value and reject orphan or invalid values',()=>{
  const source=recipeWith(35);validateRecipe(source);
  const parameters=portableParameters(source);
  assert.equal(parameters.postDecodeAdjustments.color.pointCurves.refineSaturation,35);
  assert.deepEqual(checkParameters(parameters),parameters);
  const adopted=portablePresetRecipe(recipeFromParameters(parameters));
  assert.equal(adopted.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.refineSaturation,35);
  for(const value of [-1,101,12.5,'35']){
    const invalid=recipeWith(value);
    assert.throws(()=>validateRecipe(invalid),/INVALID_POST_DECODE_ADJUSTMENTS/);
    assert.throws(()=>portablePresetRecipe(invalid),/INVALID_POST_DECODE_PRESET/);
  }
  const orphan=recipeWith(35);delete orphan.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.master;
  assert.throws(()=>validateRecipe(orphan),/INVALID_POST_DECODE_ADJUSTMENTS/);
  assert.throws(()=>portablePresetRecipe(orphan),/INVALID_POST_DECODE_PRESET/);
});

async function fixture(){
  const original=new TextEncoder().encode('REFINE_SAT_NON_RAW').buffer,sha256=await checksum(original);
  const asset={id:ASSET_A,name:'color.raw',sha256,size:original.byteLength};
  const starting=neutralRecipe(),remote=new Map([[asset.id,{revision:1,body:structuredClone(starting)}]]);
  const cache=new Map([[asset.id,{asset,proxy:structuredClone(input),history:[starting],cursor:0,revision:1,reference:null,dirty:false}]]);
  const api={listAssets:async()=>[asset],getOriginal:async()=>original.slice(0),getRecipe:async id=>structuredClone(remote.get(id)),saveRecipe:async(id,version,body)=>{
    assert.equal(version,remote.get(id).revision);const saved={revision:version+1,body:structuredClone(body)};remote.set(id,saved);return structuredClone(saved);
  }};
  const storage={get:async id=>structuredClone(cache.get(id)),put:async(id,value)=>cache.set(id,structuredClone(value))};
  const processing={decodeRaw:async()=>({pixels:structuredClone(input),provenance:{fixture:'NON_RAW'},metadata:{fixture:true}}),
    render:async(frame,recipe,options)=>renderPixels(frame,recipe,{...options,validateRecipe,resolutionAssessment}),
    encode:async frame=>new Blob([frame.data],{type:'image/png'})};
  let nextURL=0;const urlAPI={createObjectURL:()=>`blob:refine-${++nextURL}`,revokeObjectURL(){}};
  const session=new EditorSession({api,storage,processing,urlAPI,clock:()=>WHEN});
  await session.initialize();await session.openAsset(asset.id);return {session,remote,original,sha256};
}

test('Editor set/Undo/Redo/Save/Reload/Final follows real refine value without changing Original',async()=>{
  const {session,remote,original,sha256}=await fixture();
  await assert.rejects(session.setPointCurveRefineSaturation(30),/POINT_CURVE_REQUIRED/);
  await session.setPointCurve('master',master);
  await session.save();
  const legacy=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setPointCurveRefineSaturation(0);
  const current=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves;
  assert.equal(current().refineSaturation,0);
  await session.save();
  const refined=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(refined,legacy);
  await session.undo();assert.equal(current().refineSaturation,undefined);
  await session.redo();assert.equal(current().refineSaturation,0);
  await session.save();await session.reload();
  assert.equal(remote.get(ASSET_A).body.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.refineSaturation,0);
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),refined);
  await session.setPointCurveRefineSaturation(100);assert.equal(current().refineSaturation,undefined);await session.save();
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),legacy);
  await session.setPointCurveRefineSaturation(20);await session.setPointCurve('master',null);
  assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments,undefined);
  assert.equal(await checksum(original),sha256);
});

test('Editor exposes a real accessible control that is gated by an existing curve',()=>{
  const source=readFileSync(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/editorial-editor.css',import.meta.url),'utf8');
  assert.match(source,/id="point-curve-refine-saturation" type="range"/);
  assert.match(source,/refine\.disabled=!active\|\|!\['master','red','green','blue'\]/);
  assert.match(source,/run\('setPointCurveRefineSaturation',Number\(input\.value\)\)/);
  assert.match(css,/\.point-curve-editor input \{ box-sizing: border-box; width: 100%; min-width: 0; margin-inline: 0/);
});
