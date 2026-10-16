import test from 'node:test';
import assert from 'node:assert/strict';
import {ADD_SHADOW_MAX_PIXELS, ADD_SHADOW_VERSION, applyAddShadow, validateAddShadowSettings} from '../src/processing/add-shadow.mjs';

function fixture(){
  const width=21,height=15,data=new Uint8ClampedArray(width*height*4),alpha=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    data.set([210,180,150,255],at);
    if(x>=6&&x<=9&&y>=4&&y<=7)alpha[y*width+x]=255;
  }
  data.set([217,88,33,0],(12*width+17)*4);
  return {background:{width,height,data},subjectMask:{width,height,data:alpha}};
}
const settings=(patch={})=>({mode:'drop',opacity:80,blur:0,gradient:0,blend:'normal',offsetX:4,offsetY:2,shadowColor:[0,0,0],...patch});
const rgb=(frame,x,y)=>[...frame.data.slice((y*frame.width+x)*4,(y*frame.width+x)*4+3)];

test('SHADOW-01: explicit mask makes a displaced shadow only outside subject; both inputs and alpha stay immutable',()=>{
  const {background,subjectMask}=fixture(),original=background.data.slice(),mask=subjectMask.data.slice();
  const output=applyAddShadow(background,subjectMask,settings());
  assert.equal(ADD_SHADOW_VERSION,'suite-srgb8-explicit-mask-shadow-1');
  assert.notEqual(output.data,background.data);
  assert.deepEqual(rgb(output,12,6),[42,36,30]);
  assert.deepEqual(rgb(output,7,5),rgb(background,7,5));
  assert.deepEqual(rgb(output,1,1),rgb(background,1,1));
  assert.deepEqual(output.data.slice((12*background.width+17)*4,(12*background.width+17)*4+4),new Uint8ClampedArray([217,88,33,0]));
  for(let i=3;i<output.data.length;i+=4)assert.equal(output.data[i],original[i]);
  assert.deepEqual(background.data,original);assert.deepEqual(subjectMask.data,mask);
});

test('SHADOW-02: None and opacity zero are identities without aliasing; an empty verified mask adds nothing',()=>{
  const {background,subjectMask}=fixture();
  for(const options of [settings({mode:'none'}),settings({opacity:0})]){
    const output=applyAddShadow(background,subjectMask,options);
    assert.deepEqual(output.data,background.data);assert.notEqual(output.data,background.data);
  }
  const empty={...subjectMask,data:new Uint8Array(subjectMask.data.length)};
  assert.deepEqual(applyAddShadow(background,empty,settings()).data,background.data);
});

test('SHADOW-03: Soft, Hard and Drop are distinct deterministic SUITE treatments, not a detected shadow',()=>{
  const {background,subjectMask}=fixture();
  const results=['soft','hard','drop'].map(mode=>applyAddShadow(background,subjectMask,settings({mode,blur:4})).data);
  for(const result of results)assert.deepEqual(result,applyAddShadow(background,subjectMask,settings({mode:['soft','hard','drop'][results.indexOf(result)],blur:4})).data);
  assert.notDeepEqual(results[0],results[1]);assert.notDeepEqual(results[1],results[2]);
  assert.notDeepEqual(results[0],results[2]);
});

test('SHADOW-04: opacity, blur, gradient and blend each change the output without changing source',()=>{
  const {background,subjectMask}=fixture(),baseline=applyAddShadow(background,subjectMask,settings({shadowColor:[100,20,10]})).data;
  const variants=[{opacity:35},{blur:5},{gradient:80},{blend:'multiply'}];
  for(const patch of variants){
    const changed=applyAddShadow(background,subjectMask,settings({shadowColor:[100,20,10],...patch})).data;
    assert.notDeepEqual(changed,baseline,Object.keys(patch)[0]);
  }
  assert.deepEqual(rgb(background,12,6),[210,180,150]);
});

test('SHADOW-05: unknown, out-of-range, sparse and non-finite controls and mismatched masks fail closed',()=>{
  const {background,subjectMask}=fixture();
  const invalid=[{opacity:-1},{opacity:101},{opacity:Infinity},{blur:65},{gradient:NaN},{blend:'screen'},
    {mode:'auto'},{offsetX:257},{offsetY:-257},{shadowColor:[1,2]},{shadowColor:[1,2,256]},{shadowColor:[1,2,3],aiDetect:true}];
  for(const patch of invalid)assert.throws(()=>validateAddShadowSettings(settings(patch)),/ADD_SHADOW_SETTINGS_INVALID/);
  assert.throws(()=>applyAddShadow(background,{...subjectMask,width:20},settings()),/ADD_SHADOW_MASK_INVALID/);
  assert.throws(()=>applyAddShadow(background,{...subjectMask,data:new Uint8Array(10)},settings()),/ADD_SHADOW_MASK_INVALID/);
  assert.throws(()=>applyAddShadow(background,{...subjectMask,data:[]},settings()),/ADD_SHADOW_MASK_INVALID/);
  assert.equal(ADD_SHADOW_MAX_PIXELS,8_000_000);
  assert.throws(()=>applyAddShadow({width:3000,height:3000,data:new Uint8ClampedArray(36_000_000)},
    {width:3000,height:3000,data:new Uint8Array(9_000_000)},settings()),/ADD_SHADOW_CAPACITY/);
});

test('SHADOW-06: cancellation rejects before or during work without mutating RGBA or mask',()=>{
  const {background,subjectMask}=fixture(),before=background.data.slice(),mask=subjectMask.data.slice();
  assert.throws(()=>applyAddShadow(background,subjectMask,settings(),{signal:{aborted:true}}),{name:'AbortError'});
  let checks=0;
  assert.throws(()=>applyAddShadow(background,subjectMask,settings({mode:'soft',blur:8}),
    {signal:{get aborted(){return ++checks>3;}}}),{name:'AbortError'});
  assert.deepEqual(background.data,before);assert.deepEqual(subjectMask.data,mask);
});
