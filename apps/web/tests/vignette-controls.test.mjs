import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVignette,validateVignetteSettings} from '../src/processing/vignette.mjs';

// SUITE-defined post-Crop 8-bit sRGB effect, not an Evoto parity/RAW QA claim.
const field=(width=21,height=21,value=128)=>({width,height,
  data:new Uint8ClampedArray(Array.from({length:width*height},()=>[value,value,value,187]).flat())});
const pixel=(frame,x,y)=>Array.from(frame.data.slice((y*frame.width+x)*4,(y*frame.width+x)*4+4));

test('VIG-CONTROLS-01: Amount-only and default object are byte-identical; zero remains neutral',()=>{
  const source={...field(),sourceWidth:42,sourceHeight:42},before=source.data.slice();
  const numeric=applyVignette(source,-70);
  const object=applyVignette(source,{amount:-70,midpoint:50,roundness:0,feather:50,highlights:0});
  assert.deepEqual(object.data,numeric.data);
  assert.deepEqual(applyVignette(source,{amount:0,midpoint:100,roundness:-100,feather:0,highlights:100}).data,before);
  assert.notEqual(object.data,source.data);
  assert.deepEqual(source.data,before);
  assert.deepEqual([object.sourceWidth,object.sourceHeight],[42,42]);
});

test('VIG-CONTROLS-02: Midpoint reaches further inward at 100 and further outward at 0',()=>{
  const source=field();
  const inward=applyVignette(source,{amount:-100,midpoint:100});
  const outward=applyVignette(source,{amount:-100,midpoint:0});
  assert.ok(pixel(inward,7,10)[0]<pixel(outward,7,10)[0]);
  assert.deepEqual(pixel(inward,10,10),pixel(source,10,10));
  assert.deepEqual(pixel(outward,10,10),pixel(source,10,10));
});

test('VIG-CONTROLS-03: Roundness changes side-versus-corner shape',()=>{
  const source=field();
  const square=applyVignette(source,{amount:-90,roundness:-100});
  const cornerFocused=applyVignette(source,{amount:-90,roundness:100});
  assert.ok(pixel(square,0,10)[0]<pixel(cornerFocused,0,10)[0]);
  assert.deepEqual(pixel(square,0,0),pixel(cornerFocused,0,0));
  assert.deepEqual(pixel(square,10,10),pixel(cornerFocused,10,10));
});

test('VIG-CONTROLS-04: Feather widens the transition instead of becoming a dummy slider',()=>{
  const source=field();
  const hard=applyVignette(source,{amount:-90,feather:0});
  const soft=applyVignette(source,{amount:-90,feather:100});
  assert.ok(pixel(hard,3,10)[0]<pixel(soft,3,10)[0]);
  assert.deepEqual(pixel(hard,10,10),pixel(source,10,10));
  assert.deepEqual(pixel(soft,10,10),pixel(source,10,10));
});

test('VIG-CONTROLS-05: Highlights protects bright edge pixels during darkening',()=>{
  const source=field(9,9,128),corner=(x,y)=>((y*source.width+x)*4);
  source.data.set([240,240,240,187],corner(0,0));
  source.data.set([40,40,40,187],corner(8,0));
  const unprotected=applyVignette(source,{amount:-100,highlights:0});
  const protectedResult=applyVignette(source,{amount:-100,highlights:100});
  assert.ok(pixel(protectedResult,0,0)[0]>pixel(unprotected,0,0)[0]);
  assert.deepEqual(pixel(protectedResult,8,0),pixel(unprotected,8,0));
  assert.deepEqual(pixel(protectedResult,0,0)[3],187);
  assert.deepEqual(applyVignette(source,{amount:100,highlights:100}).data,
    applyVignette(source,{amount:100,highlights:0}).data);
});

test('VIG-CONTROLS-06: strict optional ranges, shape and abort reject without source mutation',()=>{
  const source=field(),before=source.data.slice();
  assert.deepEqual(validateVignetteSettings({amount:-1}),
    {amount:-1,midpoint:50,roundness:0,feather:50,highlights:0});
  for(const invalid of [null,[],{}, {amount:-101}, {amount:'-1'},
    {amount:0,midpoint:-1},{amount:0,midpoint:101},{amount:0,roundness:-101},
    {amount:0,roundness:101},{amount:0,feather:101},{amount:0,highlights:-1},
    {amount:0,highlights:NaN},{amount:0,midpoint:Infinity},
    {amount:0,unknown:10}]){
    assert.throws(()=>validateVignetteSettings(invalid));
    assert.throws(()=>applyVignette(source,invalid));
  }
  const controller=new AbortController();controller.abort();
  assert.throws(()=>applyVignette(source,{amount:-50},{signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(source.data,before);
});
