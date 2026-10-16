import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualNoseHorizontal,MANUAL_NOSE_HORIZONTAL_VERSION} from '../src/processing/manual-nose-horizontal.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
const binding=(width=100,height=60)=>({assetID:ASSET,originalSHA256:SHA,
  personID:PERSON,sourceWidth:width,sourceHeight:height});
const document=(width=100,height=60)=>({schemaVersion:1,
  engineVersion:MANUAL_NOSE_HORIZONTAL_VERSION,
  representation:'normalized-owner-marked-nose-roi-v1',
  binding:binding(width,height),roi:{x:.3,y:.25,width:.3,height:.3},
  settings:{displacementFraction:.02,featherFraction:.2}});
const context=(width=100,height=60,target='source')=>({...binding(width,height),
  savedRevision:7,target});
const pixels=(width=100,height=60)=>{
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    data[at]=x*2%256;data[at+1]=y*3%256;data[at+2]=80;data[at+3]=255;
  }
  return {width,height,data};
};
const at=(p,x,y)=>(y*p.width+x)*4;
const call=(p=pixels(),d=document(),c=context(),options)=>
  applyManualNoseHorizontal(p,d,c,options);
const fail=(p,d,c,expected)=>assert.throws(()=>call(p,d,c),expected);

test('NOSE-HORIZONTAL-01: bounded deterministic shift, untouched exterior/alpha/input',()=>{
  const p=pixels(),original=p.data.slice(),d=document(),c=context();
  const positive=call(p,d,c),repeat=call(p,d,c);
  const center=at(p,45,24),outside=at(p,5,5);
  assert.ok(positive.data[center]<p.data[center]);
  assert.deepEqual(positive.data,repeat.data);
  assert.deepEqual([...positive.data.slice(outside,outside+4)],
    [...p.data.slice(outside,outside+4)]);
  for(let i=3;i<p.data.length;i+=4)assert.equal(positive.data[i],p.data[i]);
  assert.deepEqual(p.data,original);
  const negative=call(p,{...d,settings:{...d.settings,displacementFraction:-.02}},c);
  assert.ok(negative.data[center]>p.data[center]);
  assert.notEqual(positive.data,p.data);
});

test('NOSE-HORIZONTAL-02: transparent destination and hidden source RGB cannot bleed',()=>{
  const p=pixels(),transparent=at(p,44,24),visible=at(p,45,24);
  p.data.set([255,0,200,0],transparent);
  const before=p.data.slice(),a=call(p);
  const second={...p,data:p.data.slice()};
  second.data.set([1,230,5,0],transparent);
  const b=call(second);
  assert.deepEqual([...a.data.slice(transparent,transparent+4)],
    [...before.slice(transparent,transparent+4)]);
  assert.deepEqual([...a.data.slice(visible,visible+4)],
    [...b.data.slice(visible,visible+4)]);
  assert.deepEqual(p.data,before);
});

test('NOSE-HORIZONTAL-03: exact full frame or 1600 long-edge proxy provenance',()=>{
  const d=document(2000,1000),c=context(2000,1000,'proxy');
  const p=pixels(1600,800);p.sourceWidth=2000;p.sourceHeight=1000;
  const result=call(p,d,c);
  assert.equal(result.width,1600);assert.equal(result.height,800);
  assert.equal(result.sourceWidth,2000);assert.equal(result.sourceHeight,1000);
  fail({...p,width:1599},d,c,/INVALID_OR_OVERSIZE_PIXELS/);
  const wrong=pixels(1599,800);wrong.sourceWidth=2000;wrong.sourceHeight=1000;
  fail(wrong,d,c,/MANUAL_NOSE_DIMENSIONS_MISMATCH/);
  fail(p,d,{...c,target:'source'},/MANUAL_NOSE_DIMENSIONS_MISMATCH/);
  fail({...p,sourceHeight:1001},d,c,/MANUAL_NOSE_DIMENSIONS_MISMATCH/);
  fail(p,d,{...c,sourceHeight:1001},/MANUAL_NOSE_BINDING_MISMATCH/);
});

test('NOSE-HORIZONTAL-04: Asset/SHA/person/revision and unknown fields fail closed',()=>{
  const p=pixels(),d=document(),c=context();
  fail(p,d,{...c,assetID:PERSON},/MANUAL_NOSE_BINDING_MISMATCH/);
  fail(p,d,{...c,personID:ASSET},/MANUAL_NOSE_BINDING_MISMATCH/);
  fail(p,d,{...c,originalSHA256:'b'.repeat(64)},/MANUAL_NOSE_BINDING_MISMATCH/);
  fail(p,d,{...c,savedRevision:0},/MANUAL_NOSE_BINDING_MISMATCH/);
  fail(p,d,{...c,permission:'owner'},/MANUAL_NOSE_BINDING_MISMATCH/);
  fail(p,{...d,permissionEvidence:{allowed:true}},c,/MANUAL_NOSE_DOCUMENT_INVALID/);
  fail(p,{...d,binding:{...d.binding,assetID:{toString(){throw Error('coercion');}}}},c,
    /MANUAL_NOSE_DOCUMENT_INVALID/);
});

test('NOSE-HORIZONTAL-05: bounded ROI/finite displacement/work and cancellation',()=>{
  const p=pixels(),d=document(),c=context();
  fail(p,{...d,roi:{...d.roi,width:.8}},c,/MANUAL_NOSE_ROI_INVALID/);
  fail(p,{...d,roi:{...d.roi,x:.9}},c,/MANUAL_NOSE_ROI_INVALID/);
  fail(p,{...d,settings:{...d.settings,displacementFraction:Infinity}},c,
    /MANUAL_NOSE_SETTINGS_INVALID/);
  fail(p,{...d,settings:{...d.settings,displacementFraction:.031}},c,
    /MANUAL_NOSE_SETTINGS_INVALID/);
  fail({width:4000,height:3000,data:new Uint8ClampedArray(4)},d,c,
    /MANUAL_NOSE_CAPACITY/);
  const controller=new AbortController();controller.abort();
  assert.throws(()=>call(p,d,c,{signal:controller.signal}),{name:'AbortError'});
  if(typeof SharedArrayBuffer==='function'){
    const shared={width:100,height:60,
      data:new Uint8ClampedArray(new SharedArrayBuffer(100*60*4))};
    fail(shared,d,c,/MANUAL_NOSE_SHARED_INPUT_INVALID/);
  }
});
