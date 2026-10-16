import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizeManualTeethMask,MANUAL_TEETH_MASK_MAX_WORK} from
  '../src/processing/manual-teeth-mask-runtime.mjs';
import {applyManualTeethWhitening,MANUAL_TEETH_WHITENING_VERSION} from
  '../src/processing/manual-teeth-whitening.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='33333333-3333-4333-8333-333333333333';
const SHA='a'.repeat(64);
const stroke=(operation='ADD',path=[{u:.35,v:.5}])=>
  ({operation,path,radiusFraction:.04,hardness:.6});
const binding=(width,height)=>({assetID:ASSET,originalSHA256:SHA,
  sourceWidth:width,sourceHeight:height,personID:PERSON});
const document=(width,height,teethStrokes=[stroke()])=>({
  schemaVersion:1,engineVersion:MANUAL_TEETH_WHITENING_VERSION,
  binding:binding(width,height),teethStrokes,
  settings:{brightness:30,desaturation:60},
});
const runtime=(width,height,changed={})=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,
  draftBaseRevision:3,savedRevision:3,ownerConfirmed:true,...changed});
const pixelContext=(width,height,target)=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height,
  savedRevision:3,ownerConfirmed:true,target});
function pixels(width,height,{sourceWidth,sourceHeight}={}){
  const frame={width,height,data:new Uint8ClampedArray(width*height*4)};
  if(sourceWidth!==undefined){frame.sourceWidth=sourceWidth;frame.sourceHeight=sourceHeight;}
  for(let pixel=0;pixel<width*height;pixel++){
    const at=pixel*4;
    frame.data[at]=120;frame.data[at+1]=80;frame.data[at+2]=40;
    frame.data[at+3]=255;
  }
  return frame;
}

test('TEETH-MASK-01: saved ADD/ERASE strokes rasterize on source and feed the pure Teeth processor without source mutation',()=>{
  const frame=pixels(80,40),original=frame.data.slice();
  const saved=document(80,40,[
    stroke('ADD',[{u:.35,v:.5},{u:.65,v:.5}]),
    stroke('ERASE',[{u:.5,v:.5}]),
  ]);
  const before=structuredClone(saved);
  const mask=rasterizeManualTeethMask(frame,saved,runtime(80,40),{target:'source'});
  assert.deepEqual(saved,before);
  assert.deepEqual(frame.data,original);
  assert.equal(mask.width,80);
  assert.equal(mask.height,40);
  assert.deepEqual(Object.keys(mask.provenance),['kind','source','assetID',
    'originalSHA256','personID','savedRevision','sourceWidth','sourceHeight',
    'target','width','height']);
  assert.equal(mask.provenance.kind,'owner-manual-teeth-mask');
  assert.equal(mask.provenance.personID,PERSON);
  assert.equal(mask.data[20*80+4],0);
  assert.ok(mask.data[20*80+28]>0);
  assert.equal(mask.data[20*80+40],0);
  const rendered=applyManualTeethWhitening(frame,mask,saved.settings,
    pixelContext(80,40,'source'));
  assert.notDeepEqual(rendered.data,original);
  assert.deepEqual(Array.from(rendered.data.slice((20*80+4)*4,(20*80+4)*4+4)),
    [120,80,40,255]);
  assert.deepEqual(frame.data,original);
});

test('TEETH-MASK-02: source and exact 1600px Proxy independently rasterize the same normalized stroke',()=>{
  const saved=document(2000,2,[stroke('ADD',[{u:.25,v:.5}])]);
  const authority=runtime(2000,2);
  const source=pixels(2000,2),proxy=pixels(1600,2,
    {sourceWidth:2000,sourceHeight:2});
  const originalSource=source.data.slice(),originalProxy=proxy.data.slice();
  const sourceMask=rasterizeManualTeethMask(source,saved,authority,{target:'source'});
  const proxyMask=rasterizeManualTeethMask(proxy,saved,authority,{target:'proxy'});
  assert.equal(sourceMask.data.length,4000);
  assert.equal(proxyMask.data.length,3200);
  assert.equal(sourceMask.provenance.target,'source');
  assert.equal(proxyMask.provenance.target,'proxy');
  assert.ok(sourceMask.data[1*2000+500]>0);
  assert.ok(proxyMask.data[1*1600+400]>0);
  assert.equal(proxyMask.data[1*1600+500],0);
  assert.doesNotThrow(()=>applyManualTeethWhitening(proxy,proxyMask,saved.settings,
    pixelContext(2000,2,'proxy')));
  assert.deepEqual(source.data,originalSource);
  assert.deepEqual(proxy.data,originalProxy);
});

test('TEETH-MASK-03: Asset, SHA, person, full geometry and saved CAS revision are separate binding gates',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  for(const changed of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'22222222-2222-4222-8222-222222222222'},
    {sourceWidth:81},{sourceHeight:41}]){
    assert.throws(()=>rasterizeManualTeethMask(frame,saved,{...valid,...changed},
      {target:'source'}),/RUNTIME_BINDING_MISMATCH/);
  }
  for(const changed of [{draftBaseRevision:2},{savedRevision:4},
    {savedRevision:0}])assert.throws(()=>rasterizeManualTeethMask(frame,saved,
    {...valid,...changed},{target:'source'}),/REVISION_MISMATCH/);
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,
    {...valid,ownerConfirmed:false},{target:'source'}),/OWNER_INTENT_REQUIRED/);
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,
    {...valid,permissionEvidence:{allowed:true}},{target:'source'}),
  /RUNTIME_BINDING_MISMATCH/);
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,valid,{target:'wrong'}),
    /TARGET_INVALID/);
  assert.throws(()=>rasterizeManualTeethMask({...frame,width:79,
    data:new Uint8ClampedArray(79*40*4)},saved,valid,{target:'source'}),
  /SOURCE_DIMENSIONS_MISMATCH|TARGET_DIMENSIONS_MISMATCH/);
});

test('TEETH-MASK-04: document rejects bitmap, self-declared authority, unknown keys, bad points and settings',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const bad=[
    {...saved,bitmap:new Uint8Array(4)},
    {...saved,permissionEvidence:{allowed:true}},
    {...saved,savedRevision:3},
    {...saved,binding:{...saved.binding,personID:'wrong'}},
    {...saved,binding:{...saved.binding,originalSHA256:'wrong'}},
    {...saved,settings:{brightness:101,desaturation:60}},
    {...saved,settings:{brightness:0,desaturation:NaN}},
    {...saved,teethStrokes:[stroke('ERASE')]},
    {...saved,teethStrokes:[{...stroke(),aiDetected:true}]},
    {...saved,teethStrokes:[stroke('ADD',[{u:1.01,v:.5}])]},
  ];
  for(const value of bad)assert.throws(()=>rasterizeManualTeethMask(frame,value,
    valid,{target:'source'}),/MANUAL_TEETH_DOCUMENT_/);
  assert.throws(()=>rasterizeManualTeethMask(frame,
    document(80,40,[stroke('ADD',[{u:.5,v:.5}]),,
      stroke('ERASE',[{u:.6,v:.5}])]),valid,{target:'source'}),
  /DOCUMENT_STROKES_INVALID/);
  assert.throws(()=>rasterizeManualTeethMask(frame,
    document(80,40,Array.from({length:65},()=>stroke())),valid,{target:'source'}),
  /DOCUMENT_STROKES_INVALID/);
  assert.throws(()=>rasterizeManualTeethMask(frame,
    document(80,40,[stroke('ADD',Array.from({length:4097},()=>({u:.5,v:.5})))]),
    valid,{target:'source'}),/DOCUMENT_STROKE_INVALID/);
});

test('TEETH-MASK-05: alpha-zero suppression, empty/ambiguous coverage, work/capacity and abort fail closed',()=>{
  const frame=pixels(80,40),saved=document(80,40),valid=runtime(80,40);
  const original=frame.data.slice();
  assert.ok(MANUAL_TEETH_MASK_MAX_WORK>0);
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,valid,
    {target:'source',signal:AbortSignal.abort()}),{name:'AbortError'});
  for(let i=3;i<frame.data.length;i+=4)frame.data[i]=0;
  const transparent=frame.data.slice();
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,valid,{target:'source'}),
    /SUBJECT_MASK_EMPTY/);
  assert.deepEqual(frame.data,transparent);
  frame.data.set(original);
  const all=document(80,40,[{...stroke(),radiusFraction:.25,
    path:[{u:.5,v:.5}]}]);
  // The exact manual operation cannot claim the entire source as teeth.
  assert.throws(()=>rasterizeManualTeethMask(pixels(2,2),document(2,2,
    [{...stroke(),radiusFraction:.25,path:[{u:.5,v:.5}]}]),runtime(2,2),
  {target:'source'}),/MASK_AMBIGUOUS/);
  assert.doesNotThrow(()=>rasterizeManualTeethMask(frame,all,valid,{target:'source'}));
  const heavy=pixels(1000,1000);
  const heavyStroke={...stroke('ADD',Array.from({length:64},()=>({u:.5,v:.5}))),
    radiusFraction:.25};
  const heavyDoc=document(1000,1000,Array.from({length:64},()=>heavyStroke));
  assert.throws(()=>rasterizeManualTeethMask(heavy,heavyDoc,runtime(1000,1000),
    {target:'source'}),/SUBJECT_MASK_WORK_LIMIT/);
  assert.throws(()=>rasterizeManualTeethMask({width:8_000_001,height:1,
    data:new Uint8ClampedArray(0)},saved,valid,{target:'source'}),
  /MANUAL_TEETH_CAPACITY/);
  let polls=0;
  const signal={get aborted(){return ++polls>=12;}};
  assert.throws(()=>rasterizeManualTeethMask(frame,saved,valid,{target:'source',signal}),
    {name:'AbortError'});
  assert.ok(polls>=12);
  assert.deepEqual(frame.data,original);
});
