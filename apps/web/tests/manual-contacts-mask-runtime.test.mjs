import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizeManualContactsMasks} from
  '../src/processing/manual-contacts-mask-runtime.mjs';
import {applyManualContactsIrisColor} from
  '../src/processing/manual-contacts-iris-color.mjs';

const assetID='11111111-1111-4111-8111-111111111111';
const personID='33333333-3333-4333-8333-333333333333';
const originalSHA256='a'.repeat(64);
const stroke=(u,v,radiusFraction=.1,operation='ADD')=>({operation,
  path:[{u,v}],radiusFraction,hardness:1});
const document=(width=100,height=100)=>({schemaVersion:1,
  engineVersion:'suite-srgb8-manual-iris-color-1',
  binding:{assetID,originalSHA256,personID,eye:'left',
    sourceWidth:width,sourceHeight:height},
  irisRingStrokes:[stroke(.5,.5,.15)],
  pupilExclusionStrokes:[stroke(.5,.5,.04)],
  settings:{color:{r:40,g:90,b:130},amount:.5}});
const runtime=(width=100,height=100)=>({assetID,originalSHA256,personID,
  eye:'left',sourceWidth:width,sourceHeight:height,savedRevision:2});
const pixels=(width,height,sourceWidth,sourceHeight)=>{
  const data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<width*height;index++){
    data[index*4]=100;data[index*4+1]=100;data[index*4+2]=100;
    data[index*4+3]=255;
  }
  return sourceWidth===undefined?{width,height,data}:
    {width,height,data,sourceWidth,sourceHeight};
};
const selected=mask=>mask.data.reduce((count,value)=>count+(value>0),0);

test('CONTACTS-MASK-01 source masks are distinct and apply to real pixels outside pupil',()=>{
  const frame=pixels(100,100),before=new Uint8ClampedArray(frame.data);
  const doc=document(),ctx=runtime();
  const masks=rasterizeManualContactsMasks(frame,doc,ctx,{target:'source'});
  assert.equal(masks.irisRingMask.provenance.kind,'manual-contacts-iris-ring-mask');
  assert.equal(masks.pupilExclusionMask.provenance.kind,'manual-contacts-pupil-exclusion-mask');
  assert.ok(selected(masks.irisRingMask)>selected(masks.pupilExclusionMask));
  assert.equal(masks.irisRingMask.data[50*100+50]>0,true);
  assert.equal(masks.pupilExclusionMask.data[50*100+50]>0,true);
  const result=applyManualContactsIrisColor(frame,masks.irisRingMask,
    masks.pupilExclusionMask,doc.settings,{...ctx,target:'source'});
  assert.deepEqual(frame.data,before);
  assert.deepEqual(Array.from(result.data.slice((50*100+50)*4,(50*100+50)*4+4)),
    [100,100,100,255]);
  assert.notDeepEqual(Array.from(result.data.slice((50*100+59)*4,(50*100+59)*4+3)),
    [100,100,100]);
  assert.deepEqual(doc,document());
  assert.deepEqual(ctx,runtime());
});

test('CONTACTS-MASK-02 exact 1600px proxy and upright source have separate dimensions',()=>{
  const doc=document(2000,1000),ctx=runtime(2000,1000);
  const source=rasterizeManualContactsMasks(pixels(2000,1000),doc,ctx,{target:'source'});
  const proxy=rasterizeManualContactsMasks(pixels(1600,800,2000,1000),doc,ctx,{target:'proxy'});
  assert.equal(source.irisRingMask.width,2000);
  assert.equal(proxy.irisRingMask.width,1600);
  assert.equal(proxy.irisRingMask.height,800);
  assert.equal(proxy.irisRingMask.provenance.target,'proxy');
  assert.ok(selected(proxy.irisRingMask)>selected(proxy.pupilExclusionMask));
  assert.throws(()=>rasterizeManualContactsMasks(pixels(1599,800,2000,1000),doc,ctx,
    {target:'proxy'}),/MANUAL_CONTACTS_TARGET_DIMENSIONS_MISMATCH/u);
  assert.throws(()=>rasterizeManualContactsMasks(pixels(1600,800),doc,ctx,
    {target:'proxy'}),/MANUAL_CONTACTS_SOURCE_DIMENSIONS_MISMATCH|PROXY_PROVENANCE_REQUIRED/u);
});

test('CONTACTS-MASK-03 runtime binding/revision/target and document claims fail closed',()=>{
  const frame=pixels(100,100),doc=document(),ctx=runtime();
  for(const wrong of [{...ctx,assetID:'44444444-4444-4444-8444-444444444444'},
    {...ctx,originalSHA256:'b'.repeat(64)},
    {...ctx,personID:'44444444-4444-4444-8444-444444444444'},
    {...ctx,eye:'right'}, {...ctx,sourceWidth:99}])
    assert.throws(()=>rasterizeManualContactsMasks(frame,doc,wrong,{target:'source'}),
      /MANUAL_CONTACTS_RUNTIME_BINDING_MISMATCH/u);
  assert.throws(()=>rasterizeManualContactsMasks(frame,doc,{...ctx,savedRevision:0},
    {target:'source'}),/MANUAL_CONTACTS_RUNTIME_REVISION_INVALID/u);
  assert.throws(()=>rasterizeManualContactsMasks(frame,doc,ctx,{target:'unknown'}),
    /MANUAL_CONTACTS_TARGET_INVALID/u);
  assert.throws(()=>rasterizeManualContactsMasks(frame,{...doc,savedRevision:2},ctx,
    {target:'source'}),/MANUAL_CONTACTS_DOCUMENT_INVALID/u);
  assert.throws(()=>rasterizeManualContactsMasks(frame,{...doc,
    binding:{...doc.binding,eye:'both'}},ctx,{target:'source'}),
    /MANUAL_CONTACTS_DOCUMENT_BINDING_INVALID/u);
});

test('CONTACTS-MASK-04 stroke roles are bounded, dense, finite and must ADD',()=>{
  const frame=pixels(100,100),doc=document(),ctx=runtime();
  const bad=[{...doc,irisRingStrokes:[stroke(.5,.5,.1,'ERASE')]},
    {...doc,pupilExclusionStrokes:[stroke(.5,.5,.1,'ERASE')]},
    {...doc,irisRingStrokes:[stroke(NaN,.5)]},
    {...doc,pupilExclusionStrokes:[{...stroke(.5,.5),hardness:Infinity}]},
    {...doc,irisRingStrokes:[{...stroke(.5,.5),radiusFraction:.3}]},
    {...doc,irisRingStrokes:[stroke(.5,.5),,stroke(.5,.5)]},
    {...doc,pupilExclusionStrokes:Array.from({length:64},()=>stroke(.5,.5))}];
  for(const item of bad)
    assert.throws(()=>rasterizeManualContactsMasks(frame,item,ctx,{target:'source'}),
      /MANUAL_CONTACTS_(?:RING|PUPIL|DOCUMENT)_/u);
  const largePath=Array.from({length:2048},(_,i)=>({
    u:i/4095,v:(i+.123456789)/4095}));
  assert.throws(()=>rasterizeManualContactsMasks(frame,{...doc,
    irisRingStrokes:[{...stroke(.5,.5),path:largePath}],
    pupilExclusionStrokes:[{...stroke(.5,.5),path:largePath}]},ctx,
  {target:'source'}),/MANUAL_CONTACTS_DOCUMENT_JSON_LIMIT/u);
});

test('CONTACTS-MASK-05 transparent pixels suppress both masks; abort and ambiguous coverage reject',()=>{
  const frame=pixels(100,100),doc=document(),ctx=runtime();
  frame.data[(50*100+50)*4+3]=0;
  const before=new Uint8ClampedArray(frame.data);
  const masks=rasterizeManualContactsMasks(frame,doc,ctx,{target:'source'});
  assert.equal(masks.irisRingMask.data[50*100+50],0);
  assert.equal(masks.pupilExclusionMask.data[50*100+50],0);
  const cancelled=new AbortController();cancelled.abort();
  assert.throws(()=>rasterizeManualContactsMasks(frame,doc,ctx,
    {target:'source',signal:cancelled.signal}),{name:'AbortError'});
  const noActive={...doc,irisRingStrokes:[stroke(.5,.5,.03)],
    pupilExclusionStrokes:[stroke(.5,.5,.1)]};
  assert.throws(()=>rasterizeManualContactsMasks(frame,noActive,ctx,{target:'source'}),
    /MANUAL_CONTACTS_MASK_AMBIGUOUS/u);
  assert.deepEqual(frame.data,before);
});
