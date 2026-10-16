import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualEyelashes,MANUAL_EYELASH_VERSION} from '../src/processing/manual-eyelash-render.mjs';
import {ASSET_A,PERSON_A,SHA,syntheticPixels} from './fixtures.mjs';

const clone=value=>structuredClone(value);
const binding={assetID:ASSET_A,originalSHA256:SHA,personID:PERSON_A,
  sourceWidth:64,sourceHeight:64};
const context={...binding,savedRevision:2,target:'source'};
const make=()=>({schemaVersion:1,engineVersion:MANUAL_EYELASH_VERSION,
  representation:'normalized-quadratic-root-control-tip-v1',binding:clone(binding),
  eyeTargets:[{side:'image-left',rect:{x:.1,y:.2,width:.4,height:.35},
    curves:[{root:{u:.15,v:.4},control:{u:.3,v:.3},tip:{u:.45,v:.25},rootRadiusFraction:.03}]}],
  settings:{color:{r:20,g:10,b:5},opacity:1}});
const at=(pixels,x,y)=>Array.from(pixels.data.slice((y*pixels.width+x)*4,(y*pixels.width+x)*4+4));

test('EYELASH-01: deterministic root-to-tip tapered curve changes only image-left eye RGB',()=>{
  const original=syntheticPixels(64,64,220),before=Array.from(original.data),doc=make();
  const a=applyManualEyelashes(original,doc,context);
  const b=applyManualEyelashes(original,doc,context);
  assert.deepEqual(Array.from(a.data),Array.from(b.data));
  assert.deepEqual(Array.from(original.data),before);
  assert.deepEqual(at(a,50,20),at(original,50,20));
  assert.deepEqual(at(a,5,5),at(original,5,5));
  assert.equal(at(a,10,26)[3],255);
  assert.ok(a.data.some((v,i)=>i%4!==3&&v!==original.data[i]));
  const changed=Array.from({length:64*64},(_,i)=>i).filter(i=>a.data[i*4]!==original.data[i*4]);
  assert.ok(changed.every(i=>{const x=i%64,y=Math.floor(i/64);return x>=6&&x<=32&&y>=12&&y<=36;}));
  const atRoot=changed.filter(i=>i%64>=8&&i%64<=12).length;
  const atTip=changed.filter(i=>i%64>=27&&i%64<=31).length;
  assert.ok(atRoot>atTip,`taper root=${atRoot}, tip=${atTip}`);
});

test('EYELASH-02: both image sides, opacity zero, alpha and transparent hidden RGB',()=>{
  const pixels=syntheticPixels(64,64,220),doc=make();
  doc.eyeTargets.push({side:'image-right',rect:{x:.55,y:.2,width:.4,height:.35},
    curves:[{root:{u:.6,v:.4},control:{u:.72,v:.3},tip:{u:.9,v:.25},rootRadiusFraction:.03}]});
  pixels.data.set([18,19,20,0],(26*64+10)*4);
  const output=applyManualEyelashes(pixels,doc,context);
  assert.ok(Array.from({length:64*64},(_,i)=>i).some(i=>i%64>35&&
    output.data[i*4]!==pixels.data[i*4]));
  assert.deepEqual(at(output,10,26),[18,19,20,0]);
  assert.ok(Array.from({length:64*64},(_,i)=>i).every(i=>output.data[i*4+3]===pixels.data[i*4+3]));
  doc.settings.opacity=0;
  assert.deepEqual(Array.from(applyManualEyelashes(pixels,doc,context).data),Array.from(pixels.data));
});

test('EYELASH-03: source/proxy normalized geometry and strict binding/revision/representation',()=>{
  const doc=make();
  const source=applyManualEyelashes(syntheticPixels(64,64),doc,context);
  const proxy={...syntheticPixels(64,64),sourceWidth:64,sourceHeight:64};
  const projected=applyManualEyelashes(proxy,doc,{...context,target:'proxy'});
  assert.deepEqual(Array.from(source.data),Array.from(projected.data));
  assert.deepEqual([projected.sourceWidth,projected.sourceHeight],[64,64]);
  for(const bad of [{assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},{personID:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {savedRevision:0},{sourceWidth:65}]){
    assert.throws(()=>applyManualEyelashes(proxy,doc,{...context,target:'proxy',...bad}),
      /MANUAL_EYELASH_BINDING_MISMATCH/);
  }
  assert.throws(()=>applyManualEyelashes(syntheticPixels(64,64),
    {...doc,representation:'evoto-style-1'},context),/MANUAL_EYELASH_DOCUMENT_INVALID/);
  assert.throws(()=>applyManualEyelashes(syntheticPixels(64,64),doc,{...context,target:'proxy'}),
    /MANUAL_EYELASH_DIMENSIONS_MISMATCH/);
  const larger=make();larger.binding.sourceWidth=3200;larger.binding.sourceHeight=1600;
  const sourceContext={...context,sourceWidth:3200,sourceHeight:1600,target:'proxy'};
  const realProxy={...syntheticPixels(1600,800),sourceWidth:3200,sourceHeight:1600};
  const scaled=applyManualEyelashes(realProxy,larger,sourceContext);
  assert.deepEqual([scaled.width,scaled.height,scaled.sourceWidth,scaled.sourceHeight],
    [1600,800,3200,1600]);
  assert.ok(scaled.data.some((value,index)=>index%4!==3&&value!==realProxy.data[index]));
  assert.throws(()=>applyManualEyelashes({...realProxy,width:1599,
    data:new Uint8ClampedArray(1599*800*4)},larger,sourceContext),
    /MANUAL_EYELASH_DIMENSIONS_MISMATCH/);
});

test('EYELASH-04: reject malformed eyes, control points, duplicate sides, excessive curves and unknown keys',()=>{
  const pixels=syntheticPixels(64,64);
  const bad=[];
  const duplicate=make();duplicate.eyeTargets.push(clone(duplicate.eyeTargets[0]));bad.push(duplicate);
  const wrong=make();wrong.eyeTargets[0].curves[0].tip.u=.99;bad.push(wrong);
  const noCurve=make();noCurve.eyeTargets[0].curves=[];bad.push(noCurve);
  const fake=make();fake.permissionGranted=true;bad.push(fake);
  const multiple=make();multiple.eyeTargets[0].curves=Array.from({length:129},()=>clone(make().eyeTargets[0].curves[0]));bad.push(multiple);
  const overlap=make();overlap.eyeTargets.push({side:'image-right',rect:{x:.4,y:.2,width:.4,height:.3},
    curves:[{root:{u:.5,v:.4},control:{u:.6,v:.3},tip:{u:.7,v:.25},rootRadiusFraction:.02}]});bad.push(overlap);
  const nan=make();nan.eyeTargets[0].curves[0].root.u=NaN;bad.push(nan);
  for(const value of bad)assert.throws(()=>applyManualEyelashes(pixels,value,context),/MANUAL_EYELASH_/);
  assert.throws(()=>applyManualEyelashes(pixels,make(),{...context,ownerConfirmed:true}),
    /MANUAL_EYELASH_BINDING_MISMATCH/);
});

test('EYELASH-05: capacity, work budget and abort fail closed without changing source',()=>{
  const doc=make(),pixels=syntheticPixels(64,64),before=Array.from(pixels.data);
  const cancelled=new AbortController();cancelled.abort();
  assert.throws(()=>applyManualEyelashes(pixels,doc,context,{signal:cancelled.signal}),
    error=>error.name==='AbortError');
  assert.throws(()=>applyManualEyelashes({width:4000,height:4000,data:new Uint8ClampedArray(0)},
    doc,context),/MANUAL_EYELASH_CAPACITY/);
  const huge={...doc,binding:{...binding,sourceWidth:2800,sourceHeight:2800},
    eyeTargets:[{side:'image-left',rect:{x:.05,y:.05,width:.9,height:.9},curves:Array.from({length:128},()=>({
      root:{u:.05,v:.1},control:{u:.5,v:.5},tip:{u:.95,v:.9},rootRadiusFraction:.03}))}]};
  const large={width:2800,height:2800,data:new Uint8ClampedArray(2800*2800*4)};
  assert.throws(()=>applyManualEyelashes(large,huge,{...context,sourceWidth:2800,sourceHeight:2800}),
    /MANUAL_EYELASH_WORK_LIMIT/);
  assert.deepEqual(Array.from(pixels.data),before);
});
