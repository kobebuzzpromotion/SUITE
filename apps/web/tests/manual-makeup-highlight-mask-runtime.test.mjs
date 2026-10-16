import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {rasterizeManualMakeupHighlightMask,MANUAL_MAKEUP_HIGHLIGHT_MASK_MAX_WORK} from
  '../src/processing/manual-makeup-highlight-mask-runtime.mjs';
import {applyManualMakeupHighlight,MANUAL_MAKEUP_HIGHLIGHT_VERSION} from
  '../src/processing/manual-makeup-highlight.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const stroke=(operation='ADD',path=[{u:.35,v:.5}])=>
  ({operation,path,radiusFraction:.04,hardness:.6});
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,
  sourceWidth:width,sourceHeight:height,personID:PERSON});
const document=(width,height,highlightStrokes=[stroke()])=>({
  schemaVersion:1,engineVersion:MANUAL_MAKEUP_HIGHLIGHT_VERSION,
  binding:binding(width,height),highlightStrokes,settings:{intensity:40},
});
const runtime=(width,height,changed={})=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,
  draftBaseRevision:3,savedRevision:3,ownerConfirmed:true,...changed});
const pixelContext=(width,height,target)=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,
  savedRevision:3,ownerConfirmed:true,target});
function pixels(width,height){
  const frame={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let index=0;index<frame.data.length;index+=4)
    frame.data.set([100,90,80,255],index);
  return frame;
}

test('MAKEUP-MASK-01: saved ADD/ERASE strokes make a role-specific source mask and real limited pixel effect',()=>{
  const frame=pixels(80,40),original=frame.data.slice();
  const saved=document(80,40,[
    stroke('ADD',[{u:.35,v:.5},{u:.65,v:.5}]),
    stroke('ERASE',[{u:.5,v:.5}]),
  ]),before=structuredClone(saved);
  const mask=rasterizeManualMakeupHighlightMask(frame,saved,runtime(80,40),
    {target:'source'});
  assert.deepEqual(saved,before);assert.deepEqual(frame.data,original);
  assert.deepEqual(Object.keys(mask.provenance),['kind','source','assetID',
    'originalSHA256','personID','savedRevision','sourceWidth','sourceHeight',
    'target','width','height']);
  assert.equal(mask.provenance.kind,'owner-manual-makeup-highlight-mask');
  assert.equal(mask.provenance.source,'owner-manual-makeup-highlight-strokes');
  assert.equal(mask.provenance.personID,PERSON);
  assert.equal(mask.data[20*80+4],0);
  assert.ok(mask.data[20*80+28]>0);
  assert.equal(mask.data[20*80+40],0);
  const rendered=applyManualMakeupHighlight(frame,mask,saved.settings,
    pixelContext(80,40,'source'));
  assert.notDeepEqual(rendered.data,original);
  assert.deepEqual([...rendered.data.slice((20*80+4)*4,(20*80+4)*4+4)],
    [100,90,80,255]);
  assert.deepEqual(frame.data,original);
});

test('MAKEUP-MASK-02: original and real 1600px Proxy rasterize one normalized stroke independently',()=>{
  const saved=document(2000,2,[stroke('ADD',[{u:.25,v:.5}])]);
  const authority=runtime(2000,2),source=pixels(2000,2);
  const proxy=makeProxyPixels(source),originalSource=source.data.slice();
  const originalProxy=proxy.data.slice();
  const sourceMask=rasterizeManualMakeupHighlightMask(source,saved,authority,
    {target:'source'});
  const proxyMask=rasterizeManualMakeupHighlightMask(proxy,saved,authority,
    {target:'proxy'});
  assert.deepEqual([proxy.width,proxy.height],[1600,2]);
  assert.equal(sourceMask.data.length,4000);assert.equal(proxyMask.data.length,3200);
  assert.ok(sourceMask.data[1*2000+500]>0);
  assert.ok(proxyMask.data[1*1600+400]>0);
  assert.equal(proxyMask.data[1*1600+500],0);
  assert.doesNotThrow(()=>applyManualMakeupHighlight(proxy,proxyMask,saved.settings,
    pixelContext(2000,2,'proxy')));
  assert.deepEqual(source.data,originalSource);assert.deepEqual(proxy.data,originalProxy);
});

test('MAKEUP-MASK-03: Asset, SHA, person, full dimensions, target and saved revision reject mismatches',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  for(const change of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'22222222-2222-4222-8222-222222222222'},
    {sourceWidth:81},{sourceHeight:41},
    {permissionEvidence:{allowed:true}}])
    assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,
      {...valid,...change},{target:'source'}),/RUNTIME_BINDING_MISMATCH/);
  for(const change of [{draftBaseRevision:2},{savedRevision:4},
    {savedRevision:0}])
    assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,
      {...valid,...change},{target:'source'}),/REVISION_MISMATCH/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,
    {...valid,ownerConfirmed:false},{target:'source'}),/OWNER_INTENT_REQUIRED/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,valid,
    {target:'other'}),/TARGET_INVALID/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(pixels(2000,2),
    document(2000,2),runtime(2000,2),{target:'proxy'}),
    /TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(
    pixels(79,40),saved,valid,{target:'source'}),/SOURCE_DIMENSIONS_MISMATCH/);
});

test('MAKEUP-MASK-04: typed document rejects bitmap, claims, malformed geometry and intensity',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const bad=[
    {...saved,bitmap:new Uint8Array(4)},
    {...saved,permissionEvidence:{allowed:true}},
    {...saved,savedRevision:3},
    {...saved,binding:{...saved.binding,personID:'wrong'}},
    {...saved,binding:{...saved.binding,originalSHA256:'wrong'}},
    {...saved,settings:{intensity:101}},
    {...saved,settings:{intensity:NaN}},
    {...saved,highlightStrokes:[stroke('ERASE')]},
    {...saved,highlightStrokes:[{...stroke(),aiFace:true}]},
    {...saved,highlightStrokes:[stroke('ADD',[{u:1.01,v:.5}])]},
  ];
  for(const value of bad)
    assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,value,valid,
      {target:'source'}),/MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,
    document(80,40,[stroke(),,stroke('ERASE')]),valid,{target:'source'}),
    /DOCUMENT_STROKES_INVALID/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,
    document(80,40,Array.from({length:65},()=>stroke())),valid,
    {target:'source'}),/DOCUMENT_STROKES_INVALID/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,
    document(80,40,[stroke('ADD',Array.from({length:4097},()=>({u:.5,v:.5})))]),
    valid,{target:'source'}),/DOCUMENT_STROKE_INVALID/);
});

test('MAKEUP-MASK-05: alpha-zero, ambiguous coverage, work/capacity and Abort refuse a result',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const original=frame.data.slice();
  assert.ok(MANUAL_MAKEUP_HIGHLIGHT_MASK_MAX_WORK>0);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,valid,
    {target:'source',signal:AbortSignal.abort()}),{name:'AbortError'});
  for(let index=3;index<frame.data.length;index+=4)frame.data[index]=0;
  const transparent=frame.data.slice();
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,valid,
    {target:'source'}),/SUBJECT_MASK_EMPTY/);
  assert.deepEqual(frame.data,transparent);
  frame.data.set(original);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(pixels(2,2),
    document(2,2,[{...stroke(),radiusFraction:.25,path:[{u:.5,v:.5}]}]),
    runtime(2,2),{target:'source'}),/MASK_AMBIGUOUS/);
  const heavy=pixels(1000,1000),heavyStroke={
    ...stroke('ADD',Array.from({length:64},()=>({u:.5,v:.5}))),
    radiusFraction:.25};
  assert.throws(()=>rasterizeManualMakeupHighlightMask(heavy,
    document(1000,1000,Array.from({length:64},()=>heavyStroke)),
    runtime(1000,1000),{target:'source'}),/SUBJECT_MASK_WORK_LIMIT/);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(
    {width:8_000_001,height:1,data:new Uint8ClampedArray(0)},
    saved,valid,{target:'source'}),/MANUAL_MAKEUP_HIGHLIGHT_CAPACITY/);
  let polls=0;const signal={get aborted(){return ++polls>=12;}};
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,saved,valid,
    {target:'source',signal}),{name:'AbortError'});
  assert.ok(polls>=12);assert.deepEqual(frame.data,original);
});

test('MAKEUP-MASK-06: cross-realm JSON is snapshotted; class and getter documents fail closed',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const fromRealm=runInNewContext(`(${JSON.stringify(saved)})`);
  const mask=rasterizeManualMakeupHighlightMask(frame,fromRealm,valid,
    {target:'source'});
  assert.equal(mask.data.length,80*40);
  const fake=Object.assign(new class Claim{}(),saved);
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,fake,valid,
    {target:'source'}),/DOCUMENT_INVALID/);
  const getter=document(80,40);
  Object.defineProperty(getter,'binding',{get(){throw Error('getter read');}});
  assert.throws(()=>rasterizeManualMakeupHighlightMask(frame,getter,valid,
    {target:'source'}),/DOCUMENT_INVALID/);
});
