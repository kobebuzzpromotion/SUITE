import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {applyManualBlushColor,MANUAL_BLUSH_COLOR_VERSION,MANUAL_BLUSH_MAX_PIXELS} from
  '../src/processing/manual-blush-color.mjs';

const assetID='11111111-1111-4111-8111-111111111111';
const personID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sha='a'.repeat(64);
const context=(overrides={})=>({assetID,originalSHA256:sha,personID,savedRevision:3,
  sourceWidth:4,sourceHeight:1,target:'source',...overrides});
const settings=(overrides={})=>({color:{r:200,g:30,b:90},opacity:.5,...overrides});
function pixels(){return {width:4,height:1,data:new Uint8ClampedArray([
  80,100,120,255, 80,100,120,128, 80,100,120,255, 17,23,29,0])};}
function mask(bound=context(),data=new Uint8Array([255,128,0,0]),changes={}){
  const width=bound.target==='proxy'?1600:bound.sourceWidth,height=bound.sourceHeight;
  return {width,height,data,provenance:{kind:'manual-blush-cheek-mask',
    source:'caller-manual-cheek-strokes',assetID:bound.assetID,
    originalSHA256:bound.originalSHA256,personID:bound.personID,
    savedRevision:bound.savedRevision,sourceWidth:bound.sourceWidth,
    sourceHeight:bound.sourceHeight,target:bound.target,width,height,...changes}};
}
const apply=(p,m,s=settings(),c=context(),options={})=>applyManualBlushColor(p,m,s,c,options);

test('BLUSH-MANUAL-01: explicit cheek mask alone receives deterministic sRGB8 tint; alpha/source/mask remain unchanged',()=>{
  assert.equal(MANUAL_BLUSH_COLOR_VERSION,'suite-srgb8-owner-manual-blush-color-1');
  const input=pixels(),selected=mask(),original=input.data.slice(),coverage=selected.data.slice();
  const result=apply(input,selected);
  assert.deepEqual([...result.data.slice(0,4)],[140,65,105,255]);
  const weight=.5*128/255;
  assert.deepEqual([...result.data.slice(4,7)],
    [200,30,90].map((color,index)=>Math.round([80,100,120][index]*(1-weight)+color*weight)));
  assert.equal(result.data[7],128);
  assert.deepEqual([...result.data.slice(8,16)],[...original.slice(8,16)]);
  assert.deepEqual([...input.data],[...original]);
  assert.deepEqual([...selected.data],[...coverage]);
  assert.deepEqual(apply(input,selected),result);
  assert.notStrictEqual(result.data,input.data);
});

test('BLUSH-MANUAL-02: opacity zero is detached byte identity, including transparent hidden RGB',()=>{
  const input=pixels(),result=apply(input,mask(),settings({opacity:0}));
  assert.notStrictEqual(result.data,input.data);
  assert.deepEqual([...result.data],[...input.data]);
  assert.deepEqual([...result.data.slice(12,16)],[17,23,29,0]);
});

test('BLUSH-MANUAL-03: source and exact 1600px proxy geometry are separately bound',()=>{
  const bound=context({sourceWidth:1700,sourceHeight:1,target:'proxy'});
  const input={width:1600,height:1,sourceWidth:1700,sourceHeight:1,
    data:new Uint8ClampedArray(1600*4)};
  for(let at=0;at<input.data.length;at+=4)input.data.set([80,100,120,255],at);
  const data=new Uint8Array(1600);data[25]=255;
  const result=apply(input,mask(bound,data),settings(),bound);
  assert.deepEqual([result.width,result.height,result.sourceWidth,result.sourceHeight],
    [1600,1,1700,1]);
  assert.equal(result.data[25*4],140);
  assert.equal(result.data[26*4],80);
  assert.throws(()=>apply({...input,sourceWidth:1701},mask(bound,data),settings(),bound),
    /MANUAL_BLUSH_SOURCE_DIMENSIONS_MISMATCH/);
  assert.throws(()=>apply({...input,sourceWidth:undefined,sourceHeight:undefined},
    mask(bound,data),settings(),bound),/INVALID_SOURCE_FRAME|MANUAL_BLUSH_/);
  assert.throws(()=>apply({...input,width:1599},mask(bound,data),settings(),bound),
    /INVALID_OR_OVERSIZE_PIXELS/);
});

test('BLUSH-MANUAL-04: Asset/SHA/person/revision/target/mask role cannot be exchanged',()=>{
  const input=pixels(),selected=mask();
  for(const change of [
    {assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {savedRevision:4},{kind:'owner-manual-makeup-highlight-mask'},
    {source:'automatic-cheek-detector'},{target:'proxy'},{width:3},
  ])assert.throws(()=>apply(input,mask(context(),selected.data,change)),
    /MANUAL_BLUSH_MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>apply(input,selected,settings(),{...context(),permission:'self-declared'}),
    /MANUAL_BLUSH_BINDING_INVALID/);
});

test('BLUSH-MANUAL-05: empty/full/transparent or wrong-typed coverage is rejected without processing hidden RGB',()=>{
  const input=pixels();
  assert.throws(()=>apply(input,mask(context(),new Uint8Array(4))),
    /MANUAL_BLUSH_MASK_AMBIGUOUS/);
  const opaque=pixels();opaque.data[15]=255;
  assert.throws(()=>apply(opaque,mask(context(),new Uint8Array([255,255,255,255]))),
    /MANUAL_BLUSH_MASK_AMBIGUOUS/);
  assert.throws(()=>apply(input,mask(context(),new Uint8Array([0,0,0,255]))),
    /MANUAL_BLUSH_MASK_TRANSPARENT/);
  for(const invalid of [{...mask(),data:new Float32Array(4)},
    {...mask(),data:new Uint8Array(3)},
    {...mask(),role:'cheek'},
    {...mask(),provenance:{...mask().provenance,ownerConfirmed:true}}])
    assert.throws(()=>apply(input,invalid),/MANUAL_BLUSH_MASK_/);
  assert.deepEqual([...input.data.slice(12,16)],[17,23,29,0]);
});

test('BLUSH-MANUAL-06: color/opacity are exact finite settings; capacity and abort fail closed',()=>{
  const input=pixels(),selected=mask();
  for(const invalid of [{opacity:-.1},{opacity:1.1},{opacity:NaN},{opacity:Infinity},
    {opacity:'0.5'},{opacity:-0},{color:{r:256,g:30,b:90}},
    {color:{r:1.5,g:30,b:90}},{color:{r:200,g:30,b:'90'}},{color:{r:200,g:30,b:90,a:255}},
    {style:'Evoto-1'}])
    assert.throws(()=>apply(input,selected,settings(invalid)),/MANUAL_BLUSH_SETTINGS_INVALID/);
  assert.throws(()=>apply({width:MANUAL_BLUSH_MAX_PIXELS+1,height:1,
    data:new Uint8ClampedArray(0)},selected),/MANUAL_BLUSH_CAPACITY/);
  const controller=new AbortController();controller.abort();
  assert.throws(()=>apply(input,selected,settings(),context(),{signal:controller.signal}),
    error=>error.name==='AbortError');
  assert.deepEqual([...input.data],[...pixels().data]);
});

test('BLUSH-MANUAL-07: mid-processing abort returns no partial result and never mutates source',()=>{
  const width=16385,input={width,height:1,data:new Uint8ClampedArray(width*4)};
  for(let at=0;at<input.data.length;at+=4)input.data.set([80,100,120,255],at);
  const before=input.data.slice(),bound=context({sourceWidth:width,sourceHeight:1});
  const data=new Uint8Array(width);data.fill(255);data[width-1]=0;
  const selected={width,height:1,data,provenance:{...mask(bound).provenance,width}};
  let checks=0;const signal={get aborted(){return ++checks>5;}};
  assert.throws(()=>apply(input,selected,settings(),bound,{signal}),error=>error.name==='AbortError');
  assert.ok(checks>5);
  assert.deepEqual(input.data,before);
});

test('BLUSH-MANUAL-08: cross-realm plain context/typed mask work; class, accessors and symbols do not',()=>{
  const input=pixels();
  const realm=runInNewContext(`({context:${JSON.stringify(context())},
    settings:${JSON.stringify(settings())},mask:{width:4,height:1,
      data:new Uint8Array([255,0,0,0]),provenance:${JSON.stringify(mask().provenance)}}})`);
  assert.equal(apply(input,realm.mask,realm.settings,realm.context).data[0],140);
  assert.throws(()=>apply(input,mask(),settings(),Object.assign(new class Claim{}(),context())),
    /MANUAL_BLUSH_BINDING_INVALID/);
  assert.throws(()=>apply(input,mask(),settings(),{...context(),[Symbol('authority')]:true}),
    /MANUAL_BLUSH_BINDING_INVALID/);
  const accessor=context();Object.defineProperty(accessor,'personID',{get(){throw Error('read');}});
  assert.throws(()=>apply(input,mask(),settings(),accessor),/MANUAL_BLUSH_BINDING_INVALID/);
});
