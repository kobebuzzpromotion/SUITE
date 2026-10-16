import test from 'node:test';
import assert from 'node:assert/strict';
import {ADD_SHADOW_VERSION} from '../src/processing/add-shadow.mjs';
import {rasterizeAddShadowManualSubjectMask,
  ADD_SHADOW_MANUAL_MASK_VERSION} from '../src/processing/add-shadow-manual-mask.mjs';

const assetID='bc410d09-6a70-4225-97ad-82aee7a690a8';
const backdropID='e51be62f-7d98-493b-943e-d0b3146b74fb';
const binding={assetID,originalSHA256:'a'.repeat(64),sourceWidth:1700,
  sourceHeight:20,backdropID,backdropSHA256:'b'.repeat(64)};
function document(){return {schemaVersion:1,engineVersion:ADD_SHADOW_VERSION,
  binding:{...binding},subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
    radiusFraction:.25,hardness:1}],settings:{mode:'drop',opacity:80,blur:0,
    gradient:0,blend:'normal',offsetX:2,offsetY:1,shadowColor:[0,0,0]}};}
function pixels(width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<width*height;pixel++)data.set([150,100,50,255],pixel*4);
  return {width,height,data};
}
const at=(mask,x,y)=>mask.data[y*mask.width+x];
const options=(target='source')=>({target,savedRevision:3,currentRevision:3,
  ownerConfirmed:true});

test('SHADOW-MASK-01: normalized strokes rerasterize separately at source and proxy, with target provenance and no input mutation',()=>{
  const source=pixels(1700,20),proxy=pixels(1600,19),saved=document();
  source.data[(10*1700+850)*4+3]=0;
  const beforeSource=source.data.slice(),beforeProxy=proxy.data.slice();
  const beforeDocument=structuredClone(saved),beforeBinding=structuredClone(binding);
  const sourceMask=rasterizeAddShadowManualSubjectMask(source,saved,binding,options());
  const proxyMask=rasterizeAddShadowManualSubjectMask(proxy,saved,binding,options('proxy'));
  assert.equal(ADD_SHADOW_MANUAL_MASK_VERSION,'suite-add-shadow-manual-subject-raster-1');
  assert.deepEqual([sourceMask.width,sourceMask.height],[1700,20]);
  assert.deepEqual([proxyMask.width,proxyMask.height],[1600,19]);
  assert.equal(at(sourceMask,850,10),0,'transparent source cannot become a subject');
  assert.equal(at(sourceMask,849,10),255);
  assert.equal(at(proxyMask,800,9),255);
  assert.equal(at(sourceMask,0,0),0);assert.equal(at(proxyMask,0,0),0);
  assert.deepEqual(sourceMask.provenance,{kind:'subject-alpha-mask',
    source:'verified-manual-subject-matte',assetID,
    originalSHA256:binding.originalSHA256,savedRevision:3,width:1700,height:20});
  assert.deepEqual(proxyMask.provenance,{...sourceMask.provenance,width:1600,height:19});
  assert.deepEqual([source.data,proxy.data,saved,binding],
    [beforeSource,beforeProxy,beforeDocument,beforeBinding]);
});

test('SHADOW-MASK-02: Asset/SHA/backdrop/revision/target mismatch and self-declared options fail closed',()=>{
  const frame=pixels(1700,20),saved=document();
  for(const change of [
    {assetID:'00000000-0000-4000-8000-000000000000'},
    {originalSHA256:'c'.repeat(64)},
    {backdropID:'00000000-0000-4000-8000-000000000000'},
    {backdropSHA256:'c'.repeat(64)},
    {sourceWidth:1701}
  ])assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,
    {...binding,...change},options()),/ADD_SHADOW_MANUAL_BINDING_MISMATCH/);
  for(const bad of [{...options(),savedRevision:0},
    {...options(),savedRevision:1.5},{...options(),currentRevision:0},
    {...options(),ownerConfirmed:false},
    {...options(),target:'preview'},{...options(),extra:true}])
    assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,binding,bad),
      /ADD_SHADOW_MANUAL_MASK_RUNTIME_INVALID/);
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,binding,
    {...options(),currentRevision:4}),/ADD_SHADOW_MANUAL_MASK_STALE_REVISION/);
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(pixels(1699,20),saved,
    binding,options()),/ADD_SHADOW_MANUAL_MASK_TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,binding,
    options('proxy')),/ADD_SHADOW_MANUAL_MASK_TARGET_DIMENSIONS_MISMATCH/);
});

test('SHADOW-MASK-03: stroke capacity/work limit and abort reject without a bitmap result',()=>{
  const frame=pixels(1700,20),saved=document(),controller=new AbortController();
  controller.abort();
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,binding,
    {...options(),signal:controller.signal}),{name:'AbortError'});
  const midAbort={checks:0,get aborted(){return ++this.checks>25;}};
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,saved,binding,
    {...options(),signal:midAbort}),{name:'AbortError'});
  const tooMany=document();
  tooMany.subjectStrokes=Array.from({length:65},()=>({operation:'ADD',
    path:[{u:.5,v:.5}],radiusFraction:.25,hardness:1}));
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,tooMany,binding,
    options()),/ADD_SHADOW_MANUAL_STROKES_INVALID/);
  const largeBinding={...binding,sourceWidth:1000,sourceHeight:1000};
  const workDocument={...document(),binding:{...largeBinding},subjectStrokes:[{
    operation:'ADD',path:Array.from({length:4096},()=>({u:.5,v:.5})),
    radiusFraction:.25,hardness:1}]};
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(pixels(1000,1000),
    workDocument,largeBinding,options()),/SUBJECT_MASK_WORK_LIMIT/);
  const overLimit={...binding,sourceWidth:4000,sourceHeight:2001};
  const overDocument={...document(),binding:{...overLimit}};
  assert.throws(()=>rasterizeAddShadowManualSubjectMask(frame,overDocument,
    overLimit,options()),/ADD_SHADOW_MANUAL_BINDING_INVALID/);
});
