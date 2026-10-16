import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManualTeethWhitening,MANUAL_TEETH_MAX_PIXELS} from
  '../src/processing/manual-teeth-whitening.mjs';

const ASSET='00000000-0000-4000-8000-000000000001';
const OTHER_ASSET='00000000-0000-4000-8000-000000000002';
const PERSON='00000000-0000-4000-8000-000000000003';
const SHA='a'.repeat(64);

function pixels(width=3,height=2){
  return {width,height,data:new Uint8ClampedArray([
    40,80,120,255, 100,150,200,255, 25,75,125,255,
    80,40,20,255, 7,8,9,0, 220,120,80,255,
  ])};
}

function context(frame,{target='source',...overrides}={}){
  return {assetID:ASSET,originalSHA256:SHA,personID:PERSON,savedRevision:4,
    sourceWidth:frame.sourceWidth??frame.width,
    sourceHeight:frame.sourceHeight??frame.height,target,ownerConfirmed:true,
    ...overrides};
}

function mask(frame,bound,coverage=[0,255,128,0,0,0],overrides={}){
  return {width:frame.width,height:frame.height,data:Uint8Array.from(coverage),
    provenance:{kind:'owner-manual-teeth-mask',source:'owner-manual-teeth-strokes',
      assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      personID:bound.personID,savedRevision:bound.savedRevision,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
      target:bound.target,width:frame.width,height:frame.height,...overrides}};
}

const settings={brightness:30,desaturation:60};

test('TEETH-MANUAL-01: only explicit coverage changes sRGB8 RGB; feathering, alpha, hidden RGB and inputs stay untouched',()=>{
  const source=pixels(),bound=context(source),teeth=mask(source,bound);
  const sourceCopy=source.data.slice(),maskCopy=teeth.data.slice();
  const result=applyManualTeethWhitening(source,teeth,settings,bound);
  assert.notEqual(result,source);
  assert.notEqual(result.data,source.data);
  assert.deepEqual(source.data,sourceCopy);
  assert.deepEqual(teeth.data,maskCopy);
  for(const at of [0,3,4,5]){
    assert.deepEqual(Array.from(result.data.slice(at*4,at*4+4)),
      Array.from(sourceCopy.slice(at*4,at*4+4)));
  }
  assert.notDeepEqual(Array.from(result.data.slice(4,7)),
    Array.from(sourceCopy.slice(4,7)));
  assert.notDeepEqual(Array.from(result.data.slice(8,11)),
    Array.from(sourceCopy.slice(8,11)));
  for(let i=3;i<sourceCopy.length;i+=4)assert.equal(result.data[i],sourceCopy[i]);
  assert.deepEqual(Array.from(result.data.slice(16,20)),[7,8,9,0]);
});

test('TEETH-MANUAL-02: neutral, desaturation-only and signed brightness are deterministic',()=>{
  const source=pixels(),bound=context(source),teeth=mask(source,bound);
  const neutral=applyManualTeethWhitening(source,teeth,{brightness:0,desaturation:0},bound);
  assert.deepEqual(neutral,source);
  assert.notEqual(neutral.data,source.data);
  const gray=applyManualTeethWhitening(source,teeth,{brightness:0,desaturation:100},bound);
  assert.equal(gray.data[4],gray.data[5]);
  assert.equal(gray.data[5],gray.data[6]);
  const bright=applyManualTeethWhitening(source,teeth,{brightness:100,desaturation:0},bound);
  assert.deepEqual(Array.from(bright.data.slice(4,7)),[255,255,255]);
  const dark=applyManualTeethWhitening(source,teeth,{brightness:-100,desaturation:0},bound);
  assert.deepEqual(Array.from(dark.data.slice(4,7)),[0,0,0]);
  assert.deepEqual(applyManualTeethWhitening(source,teeth,settings,bound),
    applyManualTeethWhitening(source,teeth,settings,bound));
});

test('TEETH-MANUAL-03: separate Asset, Original SHA, person, revision, output role and dimensions fail closed',()=>{
  const source=pixels(),bound=context(source),teeth=mask(source,bound);
  for(const changed of [
    {assetID:OTHER_ASSET},{originalSHA256:'b'.repeat(64)},
    {personID:OTHER_ASSET},{savedRevision:5},{target:'proxy'},
    {sourceWidth:4},{sourceHeight:3},
  ])assert.throws(()=>applyManualTeethWhitening(source,teeth,settings,
    {...bound,...changed}),/MISMATCH|INVALID/);
  assert.throws(()=>applyManualTeethWhitening(source,teeth,settings,
    {...bound,ownerConfirmed:false}),/BINDING_INVALID/);
  assert.throws(()=>applyManualTeethWhitening(source,teeth,settings,
    {...bound,permissionEvidence:true}),/BINDING_INVALID/);
  assert.throws(()=>applyManualTeethWhitening(source,teeth,settings,bound,
    {signal:AbortSignal.abort()}),{name:'AbortError'});
  assert.deepEqual(Array.from(source.data.slice(16,20)),[7,8,9,0]);
});

test('TEETH-MANUAL-04: ambiguous, untrusted, transparent and malformed masks reject',()=>{
  const source=pixels(),bound=context(source),teeth=mask(source,bound);
  for(const changed of [
    {kind:'person-ai-mask'},{source:'third-party-claimed-teeth'},
    {originalSHA256:{toLowerCase(){throw Error('must not call');}}},
    {savedRevision:3},{width:4},{target:'proxy'},
  ])assert.throws(()=>applyManualTeethWhitening(source,
    {...teeth,provenance:{...teeth.provenance,...changed}},settings,bound),
  /MASK_PROVENANCE_MISMATCH/);
  for(const coverage of [new Uint8Array(6),new Uint8Array(6).fill(255),
    Uint8Array.from([0,0,0,0,255,0])]){
    assert.throws(()=>applyManualTeethWhitening(source,
      {...teeth,data:coverage},settings,bound),/MASK_AMBIGUOUS|MASK_TRANSPARENT/);
  }
  assert.throws(()=>applyManualTeethWhitening(source,
    {...teeth,width:4},settings,bound),/MASK_INVALID/);
  assert.throws(()=>applyManualTeethWhitening(source,
    {...teeth,data:new Uint8Array(5)},settings,bound),/MASK_INVALID/);
  assert.throws(()=>applyManualTeethWhitening(source,
    {...teeth,provenance:{...teeth.provenance,authenticated:true}},settings,bound),
  /MASK_PROVENANCE_MISMATCH/);
});

test('TEETH-MANUAL-05: settings are exact finite ranges and capacity is bounded',()=>{
  const source=pixels(),bound=context(source),teeth=mask(source,bound);
  for(const bad of [
    {brightness:101,desaturation:0},{brightness:-101,desaturation:0},
    {brightness:0,desaturation:-1},{brightness:0,desaturation:101},
    {brightness:NaN,desaturation:0},{brightness:0,desaturation:Infinity},
    {brightness:'20',desaturation:0},
    {brightness:0,desaturation:0,aiRepair:true},
  ])assert.throws(()=>applyManualTeethWhitening(source,teeth,bad,bound),
    /SETTINGS_INVALID/);
  const oversized={width:MANUAL_TEETH_MAX_PIXELS+1,height:1,
    data:new Uint8ClampedArray(0)};
  assert.throws(()=>applyManualTeethWhitening(oversized,teeth,settings,bound),
    /MANUAL_TEETH_CAPACITY/);
});

test('TEETH-MANUAL-06: exact source-to-1600px proxy binding works; other proxy dimensions reject',()=>{
  const sourceWidth=2000,sourceHeight=2,width=1600,height=2;
  const proxy={width,height,sourceWidth,sourceHeight,
    data:new Uint8ClampedArray(width*height*4)};
  for(let i=0;i<proxy.data.length;i+=4){
    proxy.data[i]=100;proxy.data[i+1]=50;proxy.data[i+2]=20;proxy.data[i+3]=255;
  }
  const bound=context(proxy,{target:'proxy'});
  const coverage=new Uint8Array(width*height);coverage[7]=255;
  const teeth=mask(proxy,bound,coverage);
  const output=applyManualTeethWhitening(proxy,teeth,settings,bound);
  assert.equal(output.sourceWidth,sourceWidth);
  assert.equal(output.sourceHeight,sourceHeight);
  assert.notDeepEqual(Array.from(output.data.slice(28,31)),
    Array.from(proxy.data.slice(28,31)));
  assert.deepEqual(Array.from(output.data.slice(0,4)),[100,50,20,255]);
  const wrong={...proxy,width:1599,data:new Uint8ClampedArray(1599*height*4)};
  assert.throws(()=>applyManualTeethWhitening(wrong,teeth,settings,bound),
    /TARGET_DIMENSIONS_MISMATCH/);
});

test('TEETH-MANUAL-07: in-progress abort is fail closed without mutating source or mask',()=>{
  const width=256,height=128,source={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let i=3;i<source.data.length;i+=4)source.data[i]=255;
  const bound=context(source),coverage=new Uint8Array(width*height);
  coverage[1]=255;
  const teeth=mask(source,bound,coverage);
  const original=source.data.slice(),oldMask=teeth.data.slice();
  let reads=0;
  const signal={get aborted(){return ++reads>=6;}};
  assert.throws(()=>applyManualTeethWhitening(source,teeth,settings,bound,{signal}),
    {name:'AbortError'});
  assert.ok(reads>=6);
  assert.deepEqual(source.data,original);
  assert.deepEqual(teeth.data,oldMask);
});
