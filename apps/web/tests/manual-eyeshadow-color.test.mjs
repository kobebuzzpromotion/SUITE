import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualEyeshadowColor,MANUAL_EYESHADOW_MAX_PIXELS} from '../src/processing/manual-eyeshadow-color.mjs';
import {ASSET_A,PERSON_A,SHA,syntheticPixels} from './fixtures.mjs';

const context={assetID:ASSET_A,originalSHA256:SHA,personID:PERSON_A,
  eye:'image-left',savedRevision:2,sourceWidth:4,sourceHeight:1,target:'source'};
const specs={shadow:['manual-eyeshadow-eye-area-mask','owner-manual-eyeshadow-coverage'],
  iris:['manual-eyeshadow-iris-exclusion-mask','owner-manual-iris-exclusion-coverage'],
  pupil:['manual-eyeshadow-pupil-exclusion-mask','owner-manual-pupil-exclusion-coverage']};
const mask=(role,data,ctx=context,width=4,height=1)=>({width,height,
  data:new Uint8Array(data),provenance:{kind:specs[role][0],source:specs[role][1],
    ...ctx,width,height}});
const sample=()=>{
  const pixels=syntheticPixels(4,1,100);
  pixels.data.set([13,14,15,0],12);
  return pixels;
};
const settings={color:{r:200,g:50,b:25},opacity:.5};
const run=(pixels=sample(),area=mask('shadow',[255,255,255,0]),
  iris=mask('iris',[0,255,0,0]),pupil=mask('pupil',[0,0,255,0]),
  chosen=settings,ctx=context,options={})=>
  applyManualEyeshadowColor(pixels,area,iris,pupil,chosen,ctx,options);

test('EYESHADOW-01: only explicit eye-area coverage blends; iris/pupil, outside, alpha and hidden RGB stay intact',()=>{
  const pixels=sample(),before=Array.from(pixels.data);
  const area=mask('shadow',[255,255,255,0]),iris=mask('iris',[0,255,0,0]),
    pupil=mask('pupil',[0,0,255,0]);
  const savedMasks=[area,iris,pupil].map(item=>Array.from(item.data));
  const output=run(pixels,area,iris,pupil);
  assert.deepEqual(Array.from(output.data.slice(0,4)),[150,75,63,255]);
  assert.deepEqual(Array.from(output.data.slice(4,8)),[100,100,100,255]);
  assert.deepEqual(Array.from(output.data.slice(8,12)),[100,100,100,255]);
  assert.deepEqual(Array.from(output.data.slice(12,16)),[13,14,15,0]);
  assert.deepEqual(Array.from(pixels.data),before);
  assert.deepEqual([area,iris,pupil].map(item=>Array.from(item.data)),savedMasks);
  assert.notEqual(output.data,pixels.data);
});

test('EYESHADOW-02: partial coverage, zero opacity and deterministic pure output',()=>{
  const a=mask('shadow',[128,255,255,0]);
  const first=run(sample(),a),second=run(sample(),a);
  assert.deepEqual(Array.from(first.data),Array.from(second.data));
  assert.deepEqual(Array.from(first.data.slice(0,4)),[125,87,81,255]);
  assert.deepEqual(Array.from(run(sample(),a,undefined,undefined,
    {...settings,opacity:0}).data),Array.from(sample().data));
});

test('EYESHADOW-03: Asset, SHA, person, eye, saved revision, target and role provenance fail closed',()=>{
  for(const changed of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},{personID:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {eye:'image-right'},{savedRevision:3},{sourceWidth:5},{target:'proxy'}]){
    assert.throws(()=>run(sample(),undefined,undefined,undefined,settings,
      {...context,...changed}),/MANUAL_EYESHADOW_/);
  }
  const wrong=mask('shadow',[255,255,255,0]);wrong.provenance.kind=specs.iris[0];
  assert.throws(()=>run(sample(),wrong),/MANUAL_EYESHADOW_MASK_PROVENANCE_MISMATCH/);
  const alias=mask('pupil',[0,0,255,0]);alias.provenance.ownerConfirmed=true;
  assert.throws(()=>run(sample(),undefined,undefined,alias),
    /MANUAL_EYESHADOW_MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>run(sample(),undefined,undefined,undefined,settings,
    {...context,permissionEvidence:true}),/MANUAL_EYESHADOW_BINDING_INVALID/);
});

test('EYESHADOW-04: invalid shape, alpha-zero marked pixels, overscoped mask and no safe target reject',()=>{
  assert.throws(()=>run(sample(),mask('shadow',[0,0,0,0])),
    /MANUAL_EYESHADOW_MASK_AMBIGUOUS/);
  assert.throws(()=>run(sample(),mask('shadow',[255,255,255,255])),
    /MANUAL_EYESHADOW_MASK_TRANSPARENT/);
  assert.throws(()=>run(sample(),mask('shadow',[255,255,0,0]),
    mask('iris',[255,255,0,0]),mask('pupil',[0,0,0,0])),
    /MANUAL_EYESHADOW_NO_TARGET_PIXELS/);
  assert.throws(()=>run(sample(),mask('shadow',[255,0,0,0],context,5,1)),
    /MANUAL_EYESHADOW_MASK_INVALID/);
  assert.throws(()=>run(sample(),undefined,undefined,undefined,
    {...settings,style:1}),/MANUAL_EYESHADOW_SETTINGS_INVALID/);
  for(const opacity of [-1,1.1,NaN,Infinity,'0.5',-0])
    assert.throws(()=>run(sample(),undefined,undefined,undefined,
      {...settings,opacity}),/MANUAL_EYESHADOW_SETTINGS_INVALID/);
});

test('EYESHADOW-05: strict source/1600px proxy dimensions, capacity and abort',()=>{
  const ctx={...context,sourceWidth:3200,sourceHeight:1600,target:'proxy'};
  const width=1600,height=800,pixels={...syntheticPixels(width,height,100),
    sourceWidth:3200,sourceHeight:1600};
  const area=new Uint8Array(width*height);area[100]=255;
  const empty=new Uint8Array(area.length);
  const output=run(pixels,mask('shadow',area,ctx,width,height),
    mask('iris',empty,ctx,width,height),mask('pupil',empty,ctx,width,height),
    settings,ctx);
  assert.deepEqual([output.width,output.height,output.sourceWidth,output.sourceHeight],
    [1600,800,3200,1600]);
  assert.ok(output.data[100*4]!==pixels.data[100*4]);
  assert.throws(()=>run({...pixels,width:1599,data:new Uint8ClampedArray(1599*800*4)},
    mask('shadow',new Uint8Array(1599*800),ctx,1599,800),
    mask('iris',new Uint8Array(1599*800),ctx,1599,800),
    mask('pupil',new Uint8Array(1599*800),ctx,1599,800),settings,ctx),
    /MANUAL_EYESHADOW_TARGET_DIMENSIONS_MISMATCH/);
  const cancelled=new AbortController();cancelled.abort();
  assert.throws(()=>run(sample(),undefined,undefined,undefined,settings,context,
    {signal:cancelled.signal}),error=>error.name==='AbortError');
  assert.throws(()=>run({width:MANUAL_EYESHADOW_MAX_PIXELS+1,height:1,
    data:new Uint8ClampedArray(0)}),/MANUAL_EYESHADOW_CAPACITY/);
  const shared=new Uint8ClampedArray(new SharedArrayBuffer(4*4));
  assert.throws(()=>run({width:4,height:1,data:shared}),
    /MANUAL_EYESHADOW_SHARED_INPUT_INVALID/);
});
