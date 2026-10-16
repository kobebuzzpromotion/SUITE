import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualClothingSpot,MANUAL_CLOTHING_SPOT_VERSION,
  MANUAL_CLOTHING_MAX_PIXELS,MANUAL_CLOTHING_MAX_PATCH_PIXELS} from
  '../src/processing/manual-clothing-spot.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
const rects=()=>({target:{x:0,y:0,width:2,height:2},reference:{x:4,y:0,width:2,height:2}});
function pixels(){const width=6,height=3,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    data.set([20+x*12,40+y*15,60+x+y,255],at);
  }
  data.set([13,17,19,0],(2*width+3)*4);
  return {width,height,data};
}
const context=(change={})=>({assetID:ASSET,originalSHA256:SHA,savedRevision:4,
  sourceWidth:6,sourceHeight:3,target:'source',...change});
function mask(regions=rects(),bound=context(),coverage=[255,128,0,0],change={}){
  return {width:regions.target.width,height:regions.target.height,data:Uint8Array.from(coverage),
    provenance:{kind:'manual-clothing-target-coverage',source:'caller-explicit-target-and-reference',
      assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      savedRevision:bound.savedRevision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target:bound.target,
      targetRect:{...regions.target},referenceRect:{...regions.reference},...change}};
}
const apply=(frame=pixels(),selected=mask(),regions=rects(),bound=context(),options={})=>
  applyManualClothingSpot(frame,selected,regions,bound,options);

test('CLOTHING-SPOT-01: only explicit coverage copies same-image patch RGB; mask-out, alpha, hidden RGB and inputs remain unchanged',()=>{
  assert.equal(MANUAL_CLOTHING_SPOT_VERSION,'suite-srgb8-manual-clothing-spot-1');
  const input=pixels(),regions=rects(),selected=mask(),before=input.data.slice(),maskBefore=selected.data.slice();
  const output=apply(input,selected,regions);
  const at=(x,y)=>(y*input.width+x)*4;
  assert.deepEqual([...output.data.slice(at(0,0),at(0,0)+3)],
    [...before.slice(at(4,0),at(4,0)+3)]);
  for(let channel=0;channel<3;channel++)
    assert.equal(output.data[at(1,0)+channel],Math.round(before[at(1,0)+channel]*
      (1-128/255)+before[at(5,0)+channel]*128/255));
  for(let index=0;index<before.length;index+=4){
    if(index!==at(0,0)&&index!==at(1,0))
      assert.deepEqual([...output.data.slice(index,index+4)],[...before.slice(index,index+4)]);
    assert.equal(output.data[index+3],before[index+3]);
  }
  assert.deepEqual([...output.data.slice(at(3,2),at(3,2)+4)],[13,17,19,0]);
  assert.deepEqual(input.data,before);assert.deepEqual(selected.data,maskBefore);
  assert.notStrictEqual(output.data,input.data);assert.deepEqual(apply(input,selected,regions),output);
});

test('CLOTHING-SPOT-02: exact full-source and 1600px proxy roles are separately bound',()=>{
  const width=1600,height=2,sourceWidth=1700,sourceHeight=2;
  const input={width,height,sourceWidth,sourceHeight,data:new Uint8ClampedArray(width*height*4)};
  for(let at=0;at<input.data.length;at+=4)input.data.set([40,60,80,255],at);
  input.data.set([180,120,30,255],(4*4));
  const regions=rects(),bound=context({sourceWidth,sourceHeight,target:'proxy'});
  const chosen=mask(regions,bound),output=apply(input,chosen,regions,bound);
  assert.deepEqual([output.width,output.height,output.sourceWidth,output.sourceHeight],
    [width,height,sourceWidth,sourceHeight]);
  assert.deepEqual([...output.data.slice(0,4)],[180,120,30,255]);
  assert.throws(()=>apply({...input,sourceWidth:1701},chosen,regions,bound),
    /SOURCE_DIMENSIONS_MISMATCH/);
  assert.throws(()=>apply({width,height,data:input.data},chosen,regions,bound),
    /SOURCE_DIMENSIONS_MISMATCH|PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>apply({...input,width:1599,data:new Uint8ClampedArray(1599*height*4)},
    chosen,regions,bound),/TARGET_DIMENSIONS_MISMATCH/);
});

test('CLOTHING-SPOT-03: other Asset/SHA/revision/representation or self-declared authority fails closed',()=>{
  const input=pixels(),chosen=mask(),regions=rects();
  for(const change of [
    {assetID:OTHER},{originalSHA256:'b'.repeat(64)},
    {savedRevision:5},{target:'proxy'},{sourceWidth:7},{sourceHeight:4},
  ])assert.throws(()=>apply(input,chosen,regions,context(change)),/MISMATCH|INVALID|REQUIRED/);
  for(const change of [{assetID:OTHER},{originalSHA256:'b'.repeat(64)},
    {savedRevision:5},{target:'proxy'},{kind:'third-party-clothing-mask'},
    {source:'auto-garment-detector'},
  ])assert.throws(()=>apply(input,mask(regions,context(),undefined,change)),
    /MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>apply(input,chosen,regions,{...context(),ownerConfirmed:true}),
    /BINDING_INVALID/);
  assert.throws(()=>apply(input,chosen,regions,{...context(),permissionEvidence:'claimed'}),
    /BINDING_INVALID/);
});

test('CLOTHING-SPOT-04: unequal/overlapping/outside/large/ambiguous target and reference are rejected',()=>{
  const input=pixels();
  for(const regions of [
    {target:{x:0,y:0,width:2,height:2},reference:{x:4,y:0,width:1,height:2}},
    {target:{x:0,y:0,width:2,height:2},reference:{x:1,y:1,width:2,height:2}},
    {target:{x:0,y:0,width:2,height:2},reference:{x:5,y:0,width:2,height:2}},
    {target:{x:0,y:0,width:257,height:2},reference:{x:4,y:0,width:257,height:2}},
    {target:{x:0,y:0,width:2.5,height:2},reference:{x:4,y:0,width:2.5,height:2}},
  ])assert.throws(()=>apply(input,mask(regions),regions),/REGION|INVALID/);
  assert.throws(()=>apply(input,mask(),{...rects(),unknown:true}),/REGIONS_INVALID/);
  assert.equal(MANUAL_CLOTHING_MAX_PATCH_PIXELS,65_536);
});

test('CLOTHING-SPOT-05: empty/transparent/wrong-shape coverage and forged provenance reject',()=>{
  const input=pixels(),regions=rects();
  assert.throws(()=>apply(input,mask(regions,context(),[0,0,0,0]),regions),/MASK_AMBIGUOUS/);
  const full=apply(input,mask(regions,context(),[255,255,255,255]),regions);
  assert.deepEqual([...full.data.slice(0,4)],[...input.data.slice(4*4,4*4+4)]);
  input.data[(0*input.width+0)*4+3]=0;
  assert.throws(()=>apply(input,mask(),regions),/MASK_TRANSPARENT/);
  input.data[(0*input.width+0)*4+3]=255;
  input.data[(0*input.width+4)*4+3]=0;
  assert.throws(()=>apply(input,mask(),regions),/MASK_TRANSPARENT/);
  input.data[(0*input.width+4)*4+3]=255;
  const chosen=mask();
  for(const invalid of [{...chosen,width:3},{...chosen,data:new Uint8Array(3)},
    {...chosen,data:new Float32Array(4)},
    {...chosen,provenance:{...chosen.provenance,authenticated:true}},
    {...chosen,provenance:{...chosen.provenance,targetRect:{...regions.target,x:1}}}])
    assert.throws(()=>apply(input,invalid,regions),/MASK_INVALID|MASK_PROVENANCE_MISMATCH/);
});

test('CLOTHING-SPOT-06: capacity and pre/in-progress Abort reject without input writes',()=>{
  assert.throws(()=>apply({width:MANUAL_CLOTHING_MAX_PIXELS+1,height:1,
    data:new Uint8ClampedArray(0)}),/MANUAL_CLOTHING_CAPACITY/);
  const input=pixels(),before=input.data.slice();
  assert.throws(()=>apply(input,mask(),rects(),context(),
    {signal:AbortSignal.abort()}),{name:'AbortError'});
  assert.deepEqual(input.data,before);
  if(typeof SharedArrayBuffer==='function'){
    const shared=new Uint8ClampedArray(new SharedArrayBuffer(before.byteLength));
    shared.set(before);
    assert.throws(()=>apply({...input,data:shared}),/SHARED_INPUT_INVALID/);
    assert.deepEqual(shared,new Uint8ClampedArray(before));
  }
  const width=512,height=256,large={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let at=3;at<large.data.length;at+=4)large.data[at]=255;
  const regions={target:{x:0,y:0,width:256,height:256},
    reference:{x:256,y:0,width:256,height:256}};
  const bound=context({sourceWidth:width,sourceHeight:height});
  const coverage=new Uint8Array(256*256);coverage[0]=255;
  const chosen=mask(regions,bound,coverage),largeBefore=large.data.slice();
  let polls=0;const signal={get aborted(){return ++polls>7;}};
  assert.throws(()=>apply(large,chosen,regions,bound,{signal}),{name:'AbortError'});
  assert.deepEqual(large.data,largeBefore);assert.deepEqual(chosen.data,coverage);
});
