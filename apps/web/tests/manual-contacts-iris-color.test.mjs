import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {applyManualContactsIrisColor,
  MANUAL_CONTACTS_IRIS_COLOR_VERSION} from
  '../src/processing/manual-contacts-iris-color.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
const settings={color:{r:55,g:125,b:205},amount:.8};
function fixture(width=8,height=8){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)data.set([100,95,90,255],i*4);
  data.set([23,31,47,0],0);
  const pixels={width,height,data};
  const context={assetID:ASSET,originalSHA256:SHA,personID:PERSON,
    eye:'left',savedRevision:3,sourceWidth:width,sourceHeight:height,
    target:'source'};
  const mask=(role,coverage=new Uint8Array(width*height))=>({width,height,
    data:coverage,provenance:{kind:role==='ring'?
      'manual-contacts-iris-ring-mask':'manual-contacts-pupil-exclusion-mask',
      source:role==='ring'?'owner-manual-iris-ring-coverage':
        'owner-manual-pupil-exclusion-coverage',...context,width,height}});
  const ring=mask('ring');ring.data[27]=255;ring.data[28]=255;
  const pupil=mask('pupil');pupil.data[28]=255;
  return {pixels,context,ring,pupil,mask};
}
const apply=f=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
  settings,f.context);

test('CONTACTS-IRIS-01: explicit ring minus pupil changes only opaque iris RGB; all inputs and alpha remain immutable',()=>{
  assert.match(MANUAL_CONTACTS_IRIS_COLOR_VERSION,/suite-srgb8-manual-iris-color-1/);
  const f=fixture(),original=f.pixels.data.slice(),ring=f.ring.data.slice(),
    pupil=f.pupil.data.slice();
  const result=apply(f),second=apply(f);
  assert.notDeepEqual([...result.data.slice(27*4,27*4+3)],
    [...original.slice(27*4,27*4+3)]);
  assert.deepEqual([...result.data.slice(28*4,28*4+4)],
    [...original.slice(28*4,28*4+4)],'pupil exclusion is unchanged');
  for(let pixel=0;pixel<64;pixel++){
    assert.equal(result.data[pixel*4+3],original[pixel*4+3]);
    if(pixel!==27)assert.deepEqual([...result.data.slice(pixel*4,pixel*4+4)],
      [...original.slice(pixel*4,pixel*4+4)]);
  }
  assert.deepEqual([...f.pixels.data],[...original]);
  assert.deepEqual([...f.ring.data],[...ring]);
  assert.deepEqual([...f.pupil.data],[...pupil]);
  assert.deepEqual(second,result,'sRGB8 operation is deterministic');
  assert.notEqual(result.data,f.pixels.data);
  const softPupil={...f.pupil,data:f.pupil.data.slice()};
  softPupil.data[28]=1;
  const protectedOutput=applyManualContactsIrisColor(f.pixels,f.ring,
    softPupil,settings,f.context);
  assert.deepEqual([...protectedOutput.data.slice(28*4,28*4+4)],
    [...original.slice(28*4,28*4+4)],'any marked pupil coverage excludes color');
});

test('CONTACTS-IRIS-02: partial coverage/amount are bounded; zero amount returns owned identical pixels',()=>{
  const f=fixture(),full=apply(f);
  const half=applyManualContactsIrisColor(f.pixels,
    {...f.ring,data:Uint8Array.from(f.ring.data,(v,i)=>i===27?128:v)},
    f.pupil,settings,f.context);
  assert.ok(Math.abs(half.data[27*4]-f.pixels.data[27*4])<
    Math.abs(full.data[27*4]-f.pixels.data[27*4]));
  const zero=applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
    {...settings,amount:0},f.context);
  assert.deepEqual(zero,f.pixels);
  assert.notEqual(zero.data,f.pixels.data);
});

test('CONTACTS-IRIS-03: wrong role/Asset/SHA/person/eye/revision or pupil-less mask rejects',()=>{
  const f=fixture();
  for(const [key,value] of [['assetID',crypto.randomUUID()],
    ['originalSHA256','b'.repeat(64)],['personID',crypto.randomUUID()],
    ['eye','right'],['savedRevision',4],['target','proxy']]){
    assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
      settings,{...f.context,[key]:value}),
    /MANUAL_CONTACTS_(?:MASK_PROVENANCE|SOURCE_DIMENSIONS|PROXY_PROVENANCE|TARGET_DIMENSIONS)/);
  }
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.pupil,f.ring,
    settings,f.context),/MANUAL_CONTACTS_MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,
    f.mask('pupil'),settings,f.context),/MANUAL_CONTACTS_MASK_AMBIGUOUS/);
  const allExcluded=f.mask('pupil');allExcluded.data[27]=255;
  allExcluded.data[28]=255;
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,
    allExcluded,settings,f.context),/MANUAL_CONTACTS_NO_IRIS_PIXELS/);
});

test('CONTACTS-IRIS-04: invalid settings, hostile getter, dimensions, transparent selection and capacity reject',()=>{
  const f=fixture();
  for(const bad of [{...settings,amount:NaN},{...settings,amount:-0},
    {...settings,amount:1.01},{...settings,color:{r:1,g:2,b:256}},
    {...settings,authorized:true}])
    assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
      bad,f.context),/MANUAL_CONTACTS_SETTINGS_INVALID/);
  let calls=0;
  const hostile={...settings};
  Object.defineProperty(hostile,'color',{get(){calls++;throw Error('GETTER_RAN');}});
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
    hostile,f.context),/MANUAL_CONTACTS_SETTINGS_INVALID/);
  assert.equal(calls,0);
  const transparent=f.mask('ring',f.ring.data.slice());
  transparent.data[0]=255;
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,transparent,
    f.pupil,settings,f.context),/MANUAL_CONTACTS_MASK_TRANSPARENT/);
  assert.throws(()=>applyManualContactsIrisColor({...f.pixels,width:4000,
    height:3000},f.ring,f.pupil,settings,f.context),/MANUAL_CONTACTS_CAPACITY/);
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,
    {...f.pupil,width:9},settings,f.context),/MANUAL_CONTACTS_MASK_INVALID/);
});

test('CONTACTS-IRIS-05: exact 1600 proxy source geometry is required and metadata is retained',()=>{
  const width=2000,height=1000;
  const source=fixture(width,height),proxy=makeProxyPixels(source.pixels);
  const context={...source.context,target:'proxy'};
  const mask=(role,index)=>{
    const coverage=new Uint8Array(proxy.width*proxy.height);
    coverage[index]=255;
    return {width:proxy.width,height:proxy.height,data:coverage,
      provenance:{kind:role==='ring'?'manual-contacts-iris-ring-mask':
        'manual-contacts-pupil-exclusion-mask',source:role==='ring'?
        'owner-manual-iris-ring-coverage':
        'owner-manual-pupil-exclusion-coverage',...context,
        width:proxy.width,height:proxy.height}};
  };
  const ring=mask('ring',10),pupil=mask('pupil',11);
  const out=applyManualContactsIrisColor(proxy,ring,pupil,settings,context);
  assert.equal(out.width,1600);assert.equal(out.height,800);
  assert.equal(out.sourceWidth,width);assert.equal(out.sourceHeight,height);
  assert.throws(()=>applyManualContactsIrisColor({width:proxy.width,
    height:proxy.height,data:proxy.data},ring,pupil,settings,context),
  /MANUAL_CONTACTS_SOURCE_DIMENSIONS_MISMATCH|MANUAL_CONTACTS_PROXY_PROVENANCE_REQUIRED/);
  assert.throws(()=>applyManualContactsIrisColor({...proxy,width:1599},
    ring,pupil,settings,context),/INVALID_OR_OVERSIZE_PIXELS/);
});

test('CONTACTS-IRIS-06: preabort and in-flight Abort never mutate source',()=>{
  const f=fixture(200,200),before=f.pixels.data.slice();
  f.ring.data[100]=255;f.ring.data[101]=255;
  f.pupil.data[101]=255;
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
    settings,f.context,{signal:AbortSignal.abort()}),{name:'AbortError'});
  let checks=0;
  const signal={get aborted(){return ++checks>5;}};
  assert.throws(()=>applyManualContactsIrisColor(f.pixels,f.ring,f.pupil,
    settings,f.context,{signal}),{name:'AbortError'});
  assert.deepEqual(f.pixels.data,before);
});
