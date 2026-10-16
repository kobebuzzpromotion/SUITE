import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualHandTone,MANUAL_HAND_TONE_VERSION,MANUAL_HAND_TONE_MAX_PIXELS} from
  '../src/processing/manual-hand-tone.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
const context=(change={})=>({assetID:ASSET,originalSHA256:SHA,savedRevision:4,
  sourceWidth:5,sourceHeight:5,target:'source',...change});
const settings=(change={})=>({strength:1,radiusSourcePixels:1,...change});
function frame(){
  const width=5,height=5,data=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<width*height;pixel++)data.set([60,90,120,255],pixel*4);
  data.set([120,180,240,255],(2*width+2)*4);
  data.set([13,17,19,0],0);
  return {width,height,data};
}
function mask(bound=context(),width=5,height=5,change={}){
  const data=new Uint8Array(width*height);
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)data[y*width+x]=255;
  data[0]=255; // Deliberately covers hidden RGB: it must remain untouched.
  return {width,height,data,provenance:{kind:'manual-hand-forearm-mask',
    source:'caller-explicit-hand-forearm-strokes',assetID:bound.assetID,
    originalSHA256:bound.originalSHA256,savedRevision:bound.savedRevision,
    sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,target:bound.target,
    width,height,...change}};
}
const apply=(pixels=frame(),coverage=mask(),chosen=settings(),bound=context(),options={})=>
  applyManualHandTone(pixels,coverage,chosen,bound,options);

test('HAND-TONE-01: bounded local luminance deviation changes selected RGB only and is deterministic',()=>{
  assert.equal(MANUAL_HAND_TONE_VERSION,'suite-srgb8-owner-manual-hand-tone-1');
  const input=frame(),coverage=mask(),before=input.data.slice(),maskBefore=coverage.data.slice();
  const output=apply(input,coverage);
  const center=(2*input.width+2)*4;
  assert.ok(output.data[center]<before[center]);
  assert.ok(output.data[center+1]<before[center+1]);
  assert.ok(output.data[center+2]<before[center+2]);
  const ratios=[0,1,2].map(c=>output.data[center+c]/before[center+c]);
  assert.ok(Math.max(...ratios)-Math.min(...ratios)<.01,'common gain preserves RGB ratios pre-clipping');
  for(let pixel=0;pixel<input.width*input.height;pixel++){
    const at=pixel*4;
    if(coverage.data[pixel]===0||before[at+3]===0)
      assert.deepEqual([...output.data.slice(at,at+4)],[...before.slice(at,at+4)]);
    assert.equal(output.data[at+3],before[at+3]);
  }
  assert.deepEqual([...output.data.slice(0,4)],[13,17,19,0]);
  assert.deepEqual(input.data,before);assert.deepEqual(coverage.data,maskBefore);
  assert.notStrictEqual(output.data,input.data);
  assert.deepEqual(apply(input,coverage),output);
  assert.deepEqual(apply(input,coverage,settings({strength:0})).data,before);
});

test('HAND-TONE-02: mask boundary is not contaminated by unselected neighbors',()=>{
  const input=frame(),coverage=mask();
  input.data.set([255,255,255,255],(0*5+1)*4);
  input.data.set([0,0,0,255],(0*5+2)*4);
  const output=apply(input,coverage);
  const center=(2*5+2)*4;
  assert.ok(output.data[center]<input.data[center]);
  const outside=(0*5+1)*4;
  assert.deepEqual([...output.data.slice(outside,outside+4)],[255,255,255,255]);
  // A uniform selected area stays uniform despite extreme excluded pixels.
  const uniform=frame();
  for(let pixel=0;pixel<25;pixel++)if(coverage.data[pixel]&&uniform.data[pixel*4+3])
    uniform.data.set([70,100,130,255],pixel*4);
  assert.deepEqual(apply(uniform,coverage).data,uniform.data);
});

test('HAND-TONE-02B: fractional coverage follows the documented finite luminance/gain formula',()=>{
  const data=Uint8ClampedArray.from([
    100,120,140,255, 160,180,200,255, 80,100,120,255,
  ]);
  const input={width:3,height:1,data};
  const bound=context({sourceWidth:3,sourceHeight:1});
  const coverage=mask(bound,3,1);
  coverage.data.set([255,128,255]);
  const chosen=settings({strength:.5});
  const output=apply(input,coverage,chosen,bound);
  const y=(r,g,b)=>.2126*r+.7152*g+.0722*b;
  const current=y(160,180,200),weight=128/255;
  const mean=(y(100,120,140)+current*weight+y(80,100,120))/(2+weight);
  const delta=Math.max(-24,Math.min(24,(mean-current)*.5*weight));
  const gain=Math.max(.75,Math.min(1.25,(current+delta)/current));
  assert.deepEqual([...output.data.slice(4,7)],
    [160,180,200].map(channel=>Math.round(channel*gain)));
  assert.deepEqual([...output.data.filter((_,index)=>index%4===3)],[255,255,255]);
});

test('HAND-TONE-03: source and exact 1600px proxy are separately bound',()=>{
  const width=1600,height=2,sourceWidth=1700,sourceHeight=2;
  const data=new Uint8ClampedArray(width*height*4);
  for(let at=0;at<data.length;at+=4)data.set([70,100,130,255],at);
  data.set([160,190,220,255],(1*width+2)*4);
  const input={width,height,sourceWidth,sourceHeight,data};
  const bound=context({sourceWidth,sourceHeight,target:'proxy'});
  const coverage=mask(bound,width,height);
  coverage.data.fill(0);coverage.data[width+1]=255;coverage.data[width+2]=255;
  const output=apply(input,coverage,settings(),bound);
  assert.deepEqual([output.width,output.height,output.sourceWidth,output.sourceHeight],
    [width,height,sourceWidth,sourceHeight]);
  assert.notDeepEqual(output.data,input.data);
  assert.throws(()=>apply({width,height,data},coverage,settings(),bound),
    /SOURCE_DIMENSIONS_MISMATCH|PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>apply({...input,width:1599,
    data:new Uint8ClampedArray(1599*height*4)},coverage,settings(),bound),
    /TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>apply(input,coverage,settings(),{...bound,target:'source'}),
    /TARGET_DIMENSIONS_MISMATCH/);
});

test('HAND-TONE-04: separate Asset/SHA/revision/target/dimensions and forged provenance reject',()=>{
  const input=frame(),coverage=mask();
  for(const change of [{assetID:OTHER},{originalSHA256:'b'.repeat(64)},
    {savedRevision:5},{sourceWidth:6},{sourceHeight:6},{target:'proxy'}])
    assert.throws(()=>apply(input,coverage,settings(),context(change)),/MISMATCH|INVALID|REQUIRED/);
  for(const change of [{assetID:OTHER},{originalSHA256:'b'.repeat(64)},
    {savedRevision:5},{sourceWidth:6},{target:'proxy'},
    {kind:'generic-face-oval'},{source:'AI-hand-detector'},{width:4}])
    assert.throws(()=>apply(input,mask(context(),5,5,change)),/MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>apply(input,coverage,settings(),{...context(),authorized:true}),
    /BINDING_INVALID/);
  assert.throws(()=>apply(input,coverage,settings(),{...context(),personID:OTHER}),
    /BINDING_INVALID/);
});

test('HAND-TONE-05: invalid settings, mask shape, capacity and accessors fail closed',()=>{
  const input=frame(),coverage=mask();
  for(const change of [{strength:NaN},{strength:Infinity},{strength:-1},
    {strength:1.1},{strength:-0},{radiusSourcePixels:0},
    {radiusSourcePixels:7},{radiusSourcePixels:1.5},{unknown:true}])
    assert.throws(()=>apply(input,coverage,settings(change)),/SETTINGS_INVALID/);
  for(const invalid of [{...coverage,width:4},{...coverage,data:new Uint8Array(4)},
    {...coverage,data:new Float32Array(25)},
    {...coverage,provenance:{...coverage.provenance,authenticated:true}}])
    assert.throws(()=>apply(input,invalid),/MASK_INVALID|MASK_PROVENANCE_MISMATCH/);
  const empty=mask();empty.data.fill(0);
  assert.throws(()=>apply(input,empty),/MASK_EMPTY/);
  assert.equal(MANUAL_HAND_TONE_MAX_PIXELS,8_000_000);
  assert.throws(()=>apply({width:MANUAL_HAND_TONE_MAX_PIXELS+1,height:1,
    data:new Uint8ClampedArray(0)}),/MANUAL_HAND_CAPACITY/);
  let called=0;
  const malicious={...mask()};
  Object.defineProperty(malicious,'provenance',{get(){called++;return coverage.provenance;}});
  assert.throws(()=>apply(input,malicious),/MASK_INVALID/);
  assert.equal(called,0);
  if(typeof SharedArrayBuffer==='function'){
    const shared=new Uint8ClampedArray(new SharedArrayBuffer(input.data.byteLength));
    shared.set(input.data);
    assert.throws(()=>apply({...input,data:shared}),/SHARED_INPUT_INVALID/);
    const sharedMask=new Uint8Array(new SharedArrayBuffer(coverage.data.byteLength));
    sharedMask.set(coverage.data);
    assert.throws(()=>apply(input,{...coverage,data:sharedMask}),/MASK_INVALID/);
  }
});

test('HAND-TONE-06: pre- and in-progress Abort leave inputs unchanged',()=>{
  const input=frame(),coverage=mask(),before=input.data.slice(),maskBefore=coverage.data.slice();
  assert.throws(()=>apply(input,coverage,settings(),context(),
    {signal:AbortSignal.abort()}),{name:'AbortError'});
  let polls=0;
  const signal={get aborted(){return ++polls>12;}};
  assert.throws(()=>apply(input,coverage,settings(),context(),{signal}),{name:'AbortError'});
  assert.deepEqual(input.data,before);assert.deepEqual(coverage.data,maskBefore);
});
