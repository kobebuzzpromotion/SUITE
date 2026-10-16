import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizeManualHandMask,MANUAL_HAND_MASK_RUNTIME_VERSION,
  MANUAL_HAND_MASK_MAX_WORK} from '../src/processing/manual-hand-mask-runtime.mjs';
import {applyManualHandTone} from '../src/processing/manual-hand-tone.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
const binding=(change={})=>({assetID:ASSET,originalSHA256:SHA,
  sourceWidth:20,sourceHeight:12,...change});
const stroke=(operation='ADD',change={})=>({operation,path:[{u:.5,v:.5}],
  radiusFraction:.2,hardness:1,...change});
const document=(change={})=>({schemaVersion:1,
  engineVersion:'suite-srgb8-owner-manual-hand-tone-1',binding:binding(),
  handStrokes:[stroke(),stroke('ERASE',{radiusFraction:.05})],
  settings:{strength:.7,radiusSourcePixels:3},...change});
const runtime=(change={})=>({...binding(),savedRevision:4,...change});
function frame(width=20,height=12,sourceWidth,sourceHeight){
  const data=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<width*height;pixel++)data.set([60,90,120,255],pixel*4);
  data.set([120,180,240,255],(Math.floor(height/2)*width+Math.floor(width/2))*4);
  data.set([13,17,19,0],0);
  return {width,height,data,...(sourceWidth===undefined?{}:{sourceWidth,sourceHeight})};
}
const raster=(pixels=frame(),saved=document(),context=runtime(),target='source',signal)=>
  rasterizeManualHandMask(pixels,saved,context,{target,signal});

test('HAND-MASK-01: saved ADD/ERASE geometry produces hand-specific source mask without changing inputs',()=>{
  assert.equal(MANUAL_HAND_MASK_RUNTIME_VERSION,'suite-owner-manual-hand-mask-runtime-1');
  const pixels=frame(),saved=document(),before=pixels.data.slice();
  const mask=raster(pixels,saved),copy=mask.data.slice();
  const center=6*20+10;
  assert.equal(mask.data[center],0,'ERASE removes the inner brush center');
  assert.ok(mask.data[6*20+8]>0,'ADD remains around the erased center');
  assert.equal(mask.data[0],0,'hidden RGB is not selected');
  assert.deepEqual(mask.provenance,{kind:'manual-hand-forearm-mask',
    source:'caller-explicit-hand-forearm-strokes',assetID:ASSET,
    originalSHA256:SHA,savedRevision:4,sourceWidth:20,sourceHeight:12,
    target:'source',width:20,height:12});
  assert.deepEqual(pixels.data,before);
  assert.deepEqual(saved,document());
  assert.deepEqual(raster(pixels,saved).data,copy);
  const changed=applyManualHandTone(pixels,mask,saved.settings,
    {...runtime(),target:'source'});
  assert.deepEqual(changed.data.slice(0,4),Uint8ClampedArray.from([13,17,19,0]));
  assert.deepEqual(pixels.data,before);
});

test('HAND-MASK-02: exact 1600px proxy is rerasterized separately from source',()=>{
  const bound=binding({sourceWidth:1700,sourceHeight:17});
  const saved=document({binding:bound,handStrokes:[stroke()]});
  const context=runtime({sourceWidth:1700,sourceHeight:17});
  const source=frame(1700,17),proxy=frame(1600,16,1700,17);
  const full=raster(source,saved,context,'source');
  const small=raster(proxy,saved,context,'proxy');
  assert.deepEqual([full.width,full.height,small.width,small.height],[1700,17,1600,16]);
  assert.equal(full.provenance.target,'source');assert.equal(small.provenance.target,'proxy');
  assert.ok(full.data[8*1700+850]>0);assert.ok(small.data[8*1600+800]>0);
  assert.notStrictEqual(full.data,small.data);
  assert.deepEqual(applyManualHandTone(proxy,small,saved.settings,
    {...context,target:'proxy'}).data.length,proxy.data.length);
  assert.throws(()=>raster(frame(1599,16,1700,17),saved,context,'proxy'),
    /TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>raster(frame(1600,16),saved,context,'proxy'),
    /SOURCE_DIMENSIONS_MISMATCH|PROXY_PROVENANCE_REQUIRED/);
});

test('HAND-MASK-03: wrong Asset/SHA/revision/dimensions/target and authority aliases fail closed',()=>{
  const saved=document();
  for(const change of [{assetID:OTHER},{originalSHA256:'b'.repeat(64)},
    {sourceWidth:21},{sourceHeight:13}])
    assert.throws(()=>raster(frame(),saved,runtime(change)),/RUNTIME_BINDING_MISMATCH/);
  for(const savedRevision of [0,-1,1.5,NaN])
    assert.throws(()=>raster(frame(),saved,runtime({savedRevision})),/REVISION_INVALID/);
  assert.throws(()=>raster(frame(),saved,{...runtime(),authenticated:true}),
    /RUNTIME_BINDING_MISMATCH/);
  assert.throws(()=>raster(frame(),saved,runtime(),'AI_HAND'),/TARGET_INVALID/);
  assert.throws(()=>raster(frame(),saved,runtime(),'proxy'),
    /PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>raster(frame(),document({binding:binding({assetID:OTHER})})),
    /RUNTIME_BINDING_MISMATCH/);
});

test('HAND-MASK-04: typed document refuses malformed strokes/settings/bitmap/getters',()=>{
  for(const invalid of [document({handStrokes:[]}),
    document({handStrokes:[stroke('ERASE')]}),
    document({handStrokes:[stroke('ADD',{hardness:Infinity})]}),
    document({handStrokes:[stroke('ADD',{path:[{u:2,v:.5}]})]}),
    document({handStrokes:[stroke('ADD',{bitmap:[255]})]}),
    document({settings:{strength:Infinity,radiusSourcePixels:3}}),
    document({settings:{strength:.7,radiusSourcePixels:7}}),
    document({savedRevision:4}),document({permissionEvidence:true})])
    assert.throws(()=>raster(frame(),invalid),/DOCUMENT_/);
  let called=0;const evil=document();
  Object.defineProperty(evil,'binding',{get(){called++;throw Error('getter must not run');}});
  assert.throws(()=>raster(frame(),evil),/DOCUMENT_INVALID/);
  assert.equal(called,0);
});

test('HAND-MASK-05: bounded 8MP/96M work, SharedArrayBuffer and empty mask reject',()=>{
  assert.equal(MANUAL_HAND_MASK_MAX_WORK,96_000_000);
  assert.throws(()=>raster({width:8_000_001,height:1,data:new Uint8ClampedArray(0)}),
    /CAPACITY/);
  const data=new Uint8ClampedArray(new SharedArrayBuffer(20*12*4));
  assert.throws(()=>raster({width:20,height:12,data}),/SHARED_INPUT_INVALID/);
  const tooMany=document({handStrokes:Array.from({length:65},()=>stroke())});
  assert.throws(()=>raster(frame(),tooMany),/DOCUMENT_STROKES_INVALID/);
  const manyPoints=Array.from({length:4096},()=>({u:.5,v:.5}));
  const work=document({binding:binding({sourceWidth:400,sourceHeight:400}),
    handStrokes:[stroke('ADD',{path:manyPoints,radiusFraction:.25})]});
  assert.throws(()=>raster(frame(400,400),work,
    runtime({sourceWidth:400,sourceHeight:400})),/SUBJECT_MASK_WORK_LIMIT/);
  const erased=document({handStrokes:[stroke(),stroke('ERASE')]});
  assert.throws(()=>raster(frame(),erased),/SUBJECT_MASK_EMPTY/);
});

test('HAND-MASK-06: pre-/in-progress Abort leaves saved document and pixels unchanged',()=>{
  const pixels=frame(),saved=document(),before=pixels.data.slice(),json=JSON.stringify(saved);
  assert.throws(()=>raster(pixels,saved,runtime(),'source',AbortSignal.abort()),
    {name:'AbortError'});
  let polls=0;const signal={get aborted(){return ++polls>12;}};
  assert.throws(()=>raster(pixels,saved,runtime(),'source',signal),{name:'AbortError'});
  assert.deepEqual(pixels.data,before);assert.equal(JSON.stringify(saved),json);
});
