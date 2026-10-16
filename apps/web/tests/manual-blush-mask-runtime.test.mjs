import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {rasterizeManualBlushMask,MANUAL_BLUSH_MASK_RUNTIME_VERSION,
  MANUAL_BLUSH_MASK_MAX_WORK} from '../src/processing/manual-blush-mask-runtime.mjs';
import {applyManualBlushColor,MANUAL_BLUSH_COLOR_VERSION} from
  '../src/processing/manual-blush-color.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const stroke=(operation='ADD',path=[{u:.35,v:.5}])=>
  ({operation,path,radiusFraction:.04,hardness:.6});
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,
  sourceWidth:width,sourceHeight:height,personID:PERSON});
const document=(width,height,cheekStrokes=[stroke()])=>({
  schemaVersion:1,engineVersion:MANUAL_BLUSH_COLOR_VERSION,
  binding:binding(width,height),cheekStrokes,
  settings:{color:{r:200,g:30,b:90},opacity:.5},
});
const runtime=(width,height,changed={})=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,
  draftBaseRevision:3,savedRevision:3,ownerConfirmed:true,...changed});
const context=(width,height,target)=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,savedRevision:3,target});
function pixels(width,height){
  const frame={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let at=0;at<frame.data.length;at+=4)
    frame.data.set([100,90,80,255],at);
  return frame;
}

test('BLUSH-MASK-01: saved ADD/ERASE strokes produce cheek-only mask accepted by pure color processing',()=>{
  assert.equal(MANUAL_BLUSH_MASK_RUNTIME_VERSION,'suite-owner-manual-blush-mask-runtime-1');
  const frame=pixels(80,40),original=frame.data.slice();
  const saved=document(80,40,[
    stroke('ADD',[{u:.35,v:.5},{u:.65,v:.5}]),
    stroke('ERASE',[{u:.5,v:.5}]),
  ]),before=structuredClone(saved);
  const mask=rasterizeManualBlushMask(frame,saved,runtime(80,40),{target:'source'});
  assert.deepEqual(saved,before);assert.deepEqual(frame.data,original);
  assert.equal(mask.provenance.kind,'manual-blush-cheek-mask');
  assert.equal(mask.provenance.source,'caller-manual-cheek-strokes');
  assert.equal(mask.provenance.personID,PERSON);
  assert.equal(mask.data[20*80+4],0);
  assert.ok(mask.data[20*80+28]>0);
  assert.equal(mask.data[20*80+40],0);
  const rendered=applyManualBlushColor(frame,mask,saved.settings,context(80,40,'source'));
  assert.notDeepEqual(rendered.data,original);
  assert.deepEqual([...rendered.data.slice((20*80+4)*4,(20*80+4)*4+4)],
    [100,90,80,255]);
  assert.deepEqual(frame.data,original);
});

test('BLUSH-MASK-02: source and exact 1600px Proxy rerasterize one normalized point independently',()=>{
  const saved=document(2000,2,[stroke('ADD',[{u:.25,v:.5}])]);
  const authority=runtime(2000,2),source=pixels(2000,2);
  const proxy=makeProxyPixels(source),originalSource=source.data.slice();
  const originalProxy=proxy.data.slice();
  const sourceMask=rasterizeManualBlushMask(source,saved,authority,{target:'source'});
  const proxyMask=rasterizeManualBlushMask(proxy,saved,authority,{target:'proxy'});
  assert.deepEqual([proxy.width,proxy.height],[1600,2]);
  assert.equal(sourceMask.data.length,4000);assert.equal(proxyMask.data.length,3200);
  assert.ok(sourceMask.data[1*2000+500]>0);
  assert.ok(proxyMask.data[1*1600+400]>0);
  assert.equal(proxyMask.data[1*1600+500],0);
  assert.doesNotThrow(()=>applyManualBlushColor(proxy,proxyMask,saved.settings,
    context(2000,2,'proxy')));
  assert.deepEqual(source.data,originalSource);assert.deepEqual(proxy.data,originalProxy);
});

test('BLUSH-MASK-03: Asset, SHA, person, source/target size and saved revision bind each mask',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  for(const change of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'22222222-2222-4222-8222-222222222222'},
    {sourceWidth:81},{sourceHeight:41},{maskSource:'verified-cheek-detector'}])
    assert.throws(()=>rasterizeManualBlushMask(frame,saved,{...valid,...change},
      {target:'source'}),/RUNTIME_BINDING_MISMATCH/);
  for(const change of [{draftBaseRevision:2},{savedRevision:4},{savedRevision:0}])
    assert.throws(()=>rasterizeManualBlushMask(frame,saved,{...valid,...change},
      {target:'source'}),/REVISION_MISMATCH/);
  assert.throws(()=>rasterizeManualBlushMask(frame,saved,
    {...valid,ownerConfirmed:false},{target:'source'}),/OWNER_INTENT_REQUIRED/);
  assert.throws(()=>rasterizeManualBlushMask(frame,saved,valid,
    {target:'other'}),/TARGET_INVALID/);
  assert.throws(()=>rasterizeManualBlushMask(pixels(2000,2),
    document(2000,2),runtime(2000,2),{target:'proxy'}),
  /PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>rasterizeManualBlushMask(pixels(79,40),saved,valid,
    {target:'source'}),/SOURCE_DIMENSIONS_MISMATCH/);
  assert.throws(()=>rasterizeManualBlushMask({...frame,width:79},saved,valid,
    {target:'source'}),/INVALID_OR_OVERSIZE_PIXELS/);
});

test('BLUSH-MASK-04: document geometry/settings reject bitmap, authority claims and fake style',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  for(const bad of [
    {...saved,bitmap:new Uint8Array(4)},
    {...saved,permissionEvidence:{allowed:true}},
    {...saved,savedRevision:3},
    {...saved,binding:{...saved.binding,personID:'wrong'}},
    {...saved,binding:{...saved.binding,originalSHA256:'wrong'}},
    {...saved,settings:{...saved.settings,opacity:-0}},
    {...saved,settings:{...saved.settings,color:{r:1.5,g:30,b:90}}},
    {...saved,settings:{...saved.settings,style:1}},
    {...saved,cheekStrokes:[stroke('ERASE')]},
    {...saved,cheekStrokes:[{...stroke(),aiCheek:true}]},
    {...saved,cheekStrokes:[stroke('ADD',[{u:1.01,v:.5}])]},
  ])assert.throws(()=>rasterizeManualBlushMask(frame,bad,valid,{target:'source'}),
    /MANUAL_BLUSH_DOCUMENT_/);
  assert.throws(()=>rasterizeManualBlushMask(frame,
    document(80,40,[stroke(),,stroke('ERASE')]),valid,{target:'source'}),
  /DOCUMENT_STROKES_INVALID/);
  assert.throws(()=>rasterizeManualBlushMask(frame,
    document(80,40,Array.from({length:65},()=>stroke())),valid,{target:'source'}),
  /DOCUMENT_STROKES_INVALID/);
});

test('BLUSH-MASK-05: transparent/ambiguous coverage, work/capacity and abort produce no result',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const original=frame.data.slice();
  assert.ok(MANUAL_BLUSH_MASK_MAX_WORK>0);
  assert.throws(()=>rasterizeManualBlushMask(frame,saved,valid,
    {target:'source',signal:AbortSignal.abort()}),{name:'AbortError'});
  for(let at=3;at<frame.data.length;at+=4)frame.data[at]=0;
  const transparent=frame.data.slice();
  assert.throws(()=>rasterizeManualBlushMask(frame,saved,valid,{target:'source'}),
    /SUBJECT_MASK_EMPTY/);
  assert.deepEqual(frame.data,transparent);
  frame.data.set(original);
  const sparse=rasterizeManualBlushMask(frame,saved,valid,{target:'source'});
  const hidden=20*80+28;frame.data[hidden*4+3]=0;
  const withHidden=rasterizeManualBlushMask(frame,saved,valid,{target:'source'});
  assert.ok(sparse.data[hidden]>0);assert.equal(withHidden.data[hidden],0);
  assert.throws(()=>rasterizeManualBlushMask(pixels(2,2),
    document(2,2,[{...stroke(),radiusFraction:.25,path:[{u:.5,v:.5}]}]),
    runtime(2,2),{target:'source'}),/MASK_AMBIGUOUS/);
  const heavy=pixels(1000,1000),heavyStroke={
    ...stroke('ADD',Array.from({length:64},()=>({u:.5,v:.5}))),
    radiusFraction:.25};
  assert.throws(()=>rasterizeManualBlushMask(heavy,
    document(1000,1000,Array.from({length:64},()=>heavyStroke)),
    runtime(1000,1000),{target:'source'}),/SUBJECT_MASK_WORK_LIMIT/);
  assert.throws(()=>rasterizeManualBlushMask(
    {width:8_000_001,height:1,data:new Uint8ClampedArray(0)},saved,valid,
    {target:'source'}),/MANUAL_BLUSH_CAPACITY/);
  let polls=0;const signal={get aborted(){return ++polls>=12;}};
  assert.throws(()=>rasterizeManualBlushMask(pixels(80,40),saved,valid,
    {target:'source',signal}),{name:'AbortError'});
  assert.ok(polls>=12);
});

test('BLUSH-MASK-06: cross-realm saved JSON is snapshotted; class/getter and fake provenance fail',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const fromRealm=runInNewContext(`(${JSON.stringify(saved)})`);
  const mask=rasterizeManualBlushMask(frame,fromRealm,valid,{target:'source'});
  assert.equal(mask.data.length,80*40);
  assert.throws(()=>applyManualBlushColor(frame,{...mask,
    provenance:{...mask.provenance,source:'automatic-face-detector'}},
  saved.settings,context(80,40,'source')),/MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>rasterizeManualBlushMask(frame,
    Object.assign(new class Claim{}(),saved),valid,{target:'source'}),/DOCUMENT_INVALID/);
  const getter=document(80,40);
  Object.defineProperty(getter,'binding',{get(){throw Error('getter read');}});
  assert.throws(()=>rasterizeManualBlushMask(frame,getter,valid,{target:'source'}),
    /DOCUMENT_INVALID/);
  const settingsGetter=document(80,40);
  Object.defineProperty(settingsGetter.settings,'color',
    {get(){throw Error('settings getter must not run');}});
  assert.throws(()=>rasterizeManualBlushMask(frame,settingsGetter,valid,
    {target:'source'}),/DOCUMENT_SETTINGS_INVALID/);
});
