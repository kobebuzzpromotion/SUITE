import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {applyLocalLevels} from '../src/processing/local-levels.mjs';
import {applyManualMakeupHighlight,MANUAL_MAKEUP_HIGHLIGHT_VERSION} from
  '../src/processing/manual-makeup-highlight.mjs';

const assetID='11111111-1111-4111-8111-111111111111';
const personID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sha='a'.repeat(64);
function context(overrides={}){
  return {assetID,originalSHA256:sha,personID,savedRevision:3,
    sourceWidth:4,sourceHeight:1,target:'source',ownerConfirmed:true,...overrides};
}
function pixels(){
  return {width:4,height:1,data:new Uint8ClampedArray([
    64,80,96,255, 64,80,96,255, 64,80,96,255, 17,23,29,0])};
}
function mask(bound=context(),data=new Uint8Array([255,128,0,0]),overrides={}){
  return {width:bound.target==='proxy'?1600:bound.sourceWidth,height:bound.sourceHeight,
    data,provenance:{kind:'owner-manual-makeup-highlight-mask',
      source:'owner-manual-makeup-highlight-strokes',assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,personID:bound.personID,
      savedRevision:bound.savedRevision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target:bound.target,
      width:bound.target==='proxy'?1600:bound.sourceWidth,height:bound.sourceHeight,
      ...overrides}};
}
const apply=(p,m,s={intensity:100},c=context(),options={})=>
  applyManualMakeupHighlight(p,m,s,c,options);

test('MAKEUP-MANUAL-01: only explicitly selected coverage brightens using the existing Local Levels kernel',()=>{
  assert.equal(MANUAL_MAKEUP_HIGHLIGHT_VERSION,'suite-srgb8-owner-manual-makeup-highlight-1');
  const input=pixels(),before=[...input.data],selected=mask();
  const output=apply(input,selected);
  const expected=applyLocalLevels(input,{width:4,height:1,data:selected.data},
    {master:{gamma:2}});
  assert.deepEqual([...output.data],[...expected.data]);
  assert.ok(output.data[0]>input.data[0]);
  assert.ok(output.data[4]>input.data[4]&&output.data[4]<output.data[0]);
  assert.deepEqual([...output.data.slice(8,12)],[...input.data.slice(8,12)]);
  assert.deepEqual([...output.data.slice(12,16)],[...input.data.slice(12,16)]);
  assert.deepEqual([3,7,11,15].map(i=>output.data[i]),[255,255,255,0]);
  assert.deepEqual([...input.data],before);
  assert.deepEqual([...selected.data],[255,128,0,0]);
});

test('MAKEUP-MANUAL-02: neutral intensity is a detached identity, without editing alpha or hidden RGB',()=>{
  const input=pixels(),output=apply(input,mask(),{intensity:0});
  assert.notStrictEqual(output.data,input.data);
  assert.deepEqual([...output.data],[...input.data]);
});

test('MAKEUP-MANUAL-03: source/proxy dimensions and original frame are independently bound',()=>{
  const bound=context({sourceWidth:1700,sourceHeight:1,target:'proxy'});
  const input={width:1600,height:1,sourceWidth:1700,sourceHeight:1,
    data:new Uint8ClampedArray(1600*4)};
  for(let i=0;i<input.data.length;i+=4)input.data.set([100,100,100,255],i);
  const data=new Uint8Array(1600);data[25]=255;
  const selected=mask(bound,data);
  const output=apply(input,selected,{intensity:50},bound);
  assert.equal(output.sourceWidth,1700);assert.equal(output.sourceHeight,1);
  assert.ok(output.data[25*4]>100);
  assert.equal(output.data[26*4],100);
  assert.throws(()=>apply({...input,width:1599},selected,{intensity:50},bound),
    /INVALID_OR_OVERSIZE_PIXELS/);
  assert.throws(()=>apply(input,selected,{intensity:50},{...bound,sourceWidth:1701}),
    /MANUAL_MAKEUP_HIGHLIGHT_SOURCE_DIMENSIONS_MISMATCH/);
});

test('MAKEUP-MANUAL-04: wrong Asset, SHA, person, revision and role fail closed',()=>{
  const input=pixels(),selected=mask();
  for(const change of [
    {assetID:'22222222-2222-4222-8222-222222222222'},
    {originalSHA256:'b'.repeat(64)},
    {personID:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {savedRevision:4},
    {kind:'owner-manual-teeth-mask'},
    {source:'automatic-face-detector'},
    {target:'proxy'},
    {width:3},
  ])assert.throws(()=>apply(input,mask(context(),selected.data,change)),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_PROVENANCE_MISMATCH/);
  assert.throws(()=>apply(input,selected,{intensity:40},context({ownerConfirmed:false})),
    /MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID/);
});

test('MAKEUP-MANUAL-05: empty/full/transparent or fake coverage is not a manual highlight selection',()=>{
  const input=pixels();
  assert.throws(()=>apply(input,mask(context(),new Uint8Array(4))),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_AMBIGUOUS/);
  const opaque=pixels();opaque.data[15]=255;
  assert.throws(()=>apply(opaque,mask(context(),new Uint8Array([255,255,255,255]))),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_AMBIGUOUS/);
  assert.throws(()=>apply(input,mask(context(),new Uint8Array([0,0,0,255]))),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_TRANSPARENT/);
  assert.throws(()=>apply(input,{...mask(),data:new Float32Array(4)}),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_INVALID/);
  assert.throws(()=>apply(input,{...mask(),unexpected:true}),
    /MANUAL_MAKEUP_HIGHLIGHT_MASK_INVALID/);
});

test('MAKEUP-MANUAL-06: strict finite intensity, bound context, capacity and abort',()=>{
  const input=pixels(),selected=mask();
  for(const value of [-1,101,0.5,NaN,Infinity,'30'])
    assert.throws(()=>apply(input,selected,{intensity:value}),
      /MANUAL_MAKEUP_HIGHLIGHT_SETTINGS_INVALID/);
  assert.throws(()=>apply(input,selected,{intensity:40,mode:'AI'}),
    /MANUAL_MAKEUP_HIGHLIGHT_SETTINGS_INVALID/);
  assert.throws(()=>apply(input,selected,{intensity:30},
    {...context(),permission:'self-declared'}),/MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID/);
  const oversize={width:8_000_001,height:1,data:new Uint8ClampedArray(0)};
  assert.throws(()=>apply(oversize,selected),/MANUAL_MAKEUP_HIGHLIGHT_CAPACITY/);
  const controller=new AbortController();controller.abort();
  assert.throws(()=>apply(input,selected,{intensity:50},context(),
    {signal:controller.signal}),error=>error.name==='AbortError');
});

test('MAKEUP-MANUAL-07: worker-realm JSON and byte mask are accepted, class/accessor/symbol claims are not',()=>{
  const input=pixels();
  const realm=runInNewContext(`({context:${JSON.stringify(context())},
    mask:{width:4,height:1,data:new Uint8Array([255,0,0,0]),
      provenance:${JSON.stringify(mask().provenance)}}})`);
  assert.ok(apply(input,realm.mask,{intensity:20},realm.context).data[0]>input.data[0]);
  assert.throws(()=>apply(input,mask(),{intensity:20},
    Object.assign(new class Bound{}(),context())),/MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID/);
  assert.throws(()=>apply(input,mask(),{intensity:20},
    {...context(),[Symbol('authority')]:true}),/MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID/);
  const accessor=context();Object.defineProperty(accessor,'personID',{get(){throw Error('read');}});
  assert.throws(()=>apply(input,mask(),{intensity:20},accessor),
    /MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID/);
});
