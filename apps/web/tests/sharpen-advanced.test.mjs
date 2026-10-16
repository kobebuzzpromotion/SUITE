import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {applyDetailAdjustments} from '../src/processing/detail-adjustments.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {EditorSession,checksum,neutralRecipe} from '../src/session.mjs';
import {portablePresetRecipe} from '../src/preset-author/preset-author-contract.mjs';
import {portableParameters,checkParameters,recipeFromParameters} from '../preset-policy.mjs';
import {AuthorStore} from '../author-store.mjs';

const clone=value=>structuredClone(value);
const id='69696969-6969-4969-8969-696969696969';
const author={id:'aaaaaaaa-1111-4111-8111-111111111111',authorName:'Sharpen Author',role:'author'};
const reviewer={id:'bbbbbbbb-2222-4222-8222-222222222222',authorName:'Reviewer',role:'admin'};
function frame(width=480,height=24){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,tone=(x<width/2?74:170)+((x*17+y*29)%13)-6;
    data.set([tone,tone+8,tone-9,255],at);
  }
  return {width,height,data};
}
function body(detail){
  const result=neutralRecipe();
  result.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',detail};
  result.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return result;
}
const render=(pixels,recipe)=>renderPixels(pixels,recipe,{validateRecipe,resolutionAssessment});
function changed(a,b){return a.some((value,index)=>value!==b[index]);}

test('SHARP-01 / SYNTHETIC: legacy Sharpness is bit-identical; Radius, Detail and Masking each alter real pixels',()=>{
  const input=frame(),base=input.data.slice(),legacy=applyDetailAdjustments(input,{sharpness:90});
  assert.deepEqual(legacy.data,applyDetailAdjustments(input,{sharpness:90}).data);
  assert.deepEqual(legacy.data,applyDetailAdjustments(input,{sharpness:90,sharpenRadius:50}).data);
  assert.deepEqual(legacy.data,applyDetailAdjustments(input,{sharpness:90,sharpenRadius:50,sharpenDetail:0,sharpenMasking:0}).data);
  const settings=[{sharpenRadius:100},{sharpenDetail:100},{sharpenMasking:100}];
  for(const value of settings){
    const output=applyDetailAdjustments(input,{sharpness:90,...value});
    assert.ok(changed(output.data,legacy.data),Object.keys(value)[0]);
    for(let i=3;i<output.data.length;i+=4)assert.equal(output.data[i],255);
  }
  assert.deepEqual(input.data,base);
});

test('SHARP-02 / SYNTHETIC: Masking suppresses small texture more than a strong edge, alpha and hidden RGB stay untouched',()=>{
  const input=frame(480,1),flat=120*4,edge=240*4;
  input.data.set([255,255,255,0],123*4);
  const unmasked=applyDetailAdjustments(input,{sharpness:100,sharpenMasking:0});
  const masked=applyDetailAdjustments(input,{sharpness:100,sharpenMasking:100});
  const flatDelta=Math.abs(unmasked.data[flat]-input.data[flat]);
  const maskedFlatDelta=Math.abs(masked.data[flat]-input.data[flat]);
  assert.ok(maskedFlatDelta<=flatDelta);
  assert.ok(Math.abs(masked.data[edge]-input.data[edge])>maskedFlatDelta);
  assert.equal(masked.data[123*4+3],0);
  assert.deepEqual(input.data.slice(123*4,123*4+4),new Uint8ClampedArray([255,255,255,0]));
});

test('SHARP-03 / STRICT: values, unknown keys and abort fail closed before source mutation',()=>{
  const pixels=frame(),before=pixels.data.slice();
  for(const key of ['sharpenRadius','sharpenDetail','sharpenMasking']){
    for(const value of [-1,101,NaN,Infinity,'50']){
      const detail={sharpness:50,[key]:value};
      assert.throws(()=>applyDetailAdjustments(pixels,detail));
      assert.throws(()=>validateRecipe(body(detail)));
      assert.throws(()=>portablePresetRecipe(body(detail)));
    }
  }
  assert.throws(()=>validateRecipe(body({sharpness:50,sharpenUnknown:1})));
  assert.throws(()=>applyDetailAdjustments(pixels,{sharpness:50,sharpenRadius:100},{signal:{aborted:true}}),{name:'AbortError'});
  assert.deepEqual(pixels.data,before);
});

test('SHARP-04 / RECIPE: optional controls validate, old Recipe and portable Preset survive round-trip',()=>{
  const old=body({sharpness:70}),oldPixels=render(frame(),old).data;
  validateRecipe(old);
  assert.deepEqual(oldPixels,render(frame(),clone(old)).data);
  const advanced=body({sharpness:70,sharpenRadius:100,sharpenDetail:60,sharpenMasking:40});
  validateRecipe(advanced);
  const portable=portableParameters(advanced),restored=recipeFromParameters(checkParameters(portable));
  assert.deepEqual(portablePresetRecipe(advanced).parameters.extendedParameters.postDecodeAdjustments.detail,advanced.parameters.extendedParameters.postDecodeAdjustments.detail);
  assert.deepEqual(restored.parameters.extendedParameters.postDecodeAdjustments.detail,advanced.parameters.extendedParameters.postDecodeAdjustments.detail);
  assert.ok(changed(render(frame(),advanced).data,oldPixels));
});

test('SHARP-05 / SESSION: separate controls, Undo/Redo, CAS save, reopen, portable apply and Final keep Original immutable',async()=>{
  const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_SHARPEN_ORIGINAL').buffer,originalHash=await checksum(original);
  const asset={id,name:'sharp-test.NONRAW',sha256:originalHash,size:original.byteLength};
  const base=frame(),source=base.data.slice(),cache=new Map();
  let saved={assetId:id,revision:1,body:neutralRecipe()},urls=0;
  const api={listAssets:async()=>[clone(asset)],getRecipe:async()=>clone(saved),getOriginal:async()=>original.slice(0),
    assertPermission:async()=>({authorized:true}),saveRecipe:async(_id,revision,recipe)=>{
      assert.equal(revision,saved.revision);validateRecipe(recipe);saved={assetId:id,revision:revision+1,body:clone(recipe)};return clone(saved);
    }};
  const storage={get:async key=>clone(cache.get(key)),put:async(key,value)=>cache.set(key,clone(value))};
  cache.set(id,{asset:clone(asset),proxy:clone(base),history:[neutralRecipe()],cursor:0,revision:1,dirty:false});
  const processing={render:async(p,r)=>render(p,r),encode:async p=>new Blob([p.data]),decodeRaw:async()=>({pixels:clone(base)})};
  const create=async()=>{const session=new EditorSession({api,storage,processing,urlAPI:{createObjectURL:()=>`blob:sharp-${++urls}`,revokeObjectURL(){}}});await session.initialize();await session.openAsset(id);return session;};
  const session=await create();
  for(const [key,value] of [['sharpness',90],['sharpenRadius',100],['sharpenDetail',80],['sharpenMasking',70]])await session.setAdjustment(`detail.${key}`,value);
  const expected=clone(session.state.recipe);
  assert.deepEqual(expected.parameters.extendedParameters.postDecodeAdjustments.detail,{sharpness:90,sharpenRadius:100,sharpenDetail:80,sharpenMasking:70});
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.sharpenMasking,undefined);
  await session.redo();assert.deepEqual(session.state.recipe,expected);
  await session.save();const fresh=await create();assert.deepEqual(fresh.state.recipe,expected);
  const exported=await fresh.exportFinal({format:'png'});
  assert.deepEqual(new Uint8ClampedArray(await exported.arrayBuffer()),render(base,expected).data);
  assert.equal(await checksum(original),originalHash);assert.deepEqual(base.data,source);
  await fresh.applyPortablePreset(portableParameters(expected));
  assert.deepEqual(fresh.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail,expected.parameters.extendedParameters.postDecodeAdjustments.detail);
  await fresh.save();const reloaded=await create();assert.deepEqual(reloaded.state.recipe,expected);
});

test('SHARP-06 / SQLITE: author portable Preset save, publish, reopen and apply retain all three controls',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suite-sharpen-preset-')),path=join(directory,'author.sqlite');
  const recipe=body({sharpness:85,sharpenRadius:90,sharpenDetail:75,sharpenMasking:65}),expected=portableParameters(recipe);
  let store=new AuthorStore(path,{verifySource:(_actor,input)=>{
    assert.equal(input.assetID,id);assert.equal(input.recipeRevision,1);assert.deepEqual(input.parameters,expected);
  }});
  try{
    const draft=store.createDraft(author,{name:'Sharpen controls',recipe,assetID:id,recipeRevision:1});
    const submitted=store.submitDraft(author,draft.id,draft.revision);
    const accepted=store.reviewDraft(reviewer,draft.id,submitted.revision,'ACCEPTED');
    assert.deepEqual(accepted.preset.parameters,expected);
    store.close();store=new AuthorStore(path,{verifySource:()=>{throw Error('UNEXPECTED_SOURCE');}});
    const reopened=store.listPresets(author)[0];assert.deepEqual(checkParameters(reopened.parameters),expected);
    assert.deepEqual(recipeFromParameters(reopened.parameters).parameters.extendedParameters.postDecodeAdjustments.detail,recipe.parameters.extendedParameters.postDecodeAdjustments.detail);
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
