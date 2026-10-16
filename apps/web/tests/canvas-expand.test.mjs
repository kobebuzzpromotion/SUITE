import test from 'node:test';
import assert from 'node:assert/strict';
import {planCanvasExpansion,expandCanvasPixels,MAX_CANVAS_EDGE,MAX_CANVAS_PIXELS,MAX_CANVAS_WORKING_BYTES} from '../src/processing/canvas-expand.mjs';

const frame=(width,height,values)=>({width,height,data:new Uint8ClampedArray(values)});
const pixel=(image,x,y)=>[...image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4)];

test('CANVAS-EXPAND-01 / four exact margins plan a larger frame and source anchor',()=>{
  const plan=planCanvasExpansion({width:2,height:3},{margins:{left:1,right:4,top:2,bottom:5}});
  assert.deepEqual({...plan,background:[...plan.background]},{width:7,height:10,x:1,y:2,sourceWidth:2,sourceHeight:3,background:[0,0,0,0]});
  assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(plan.background));
});

test('CANVAS-EXPAND-02 / target size positions source by explicit edge or centered anchor',()=>{
  const source={width:2,height:2};
  assert.deepEqual([planCanvasExpansion(source,{width:7,height:5}).x,planCanvasExpansion(source,{width:7,height:5}).y],[2,1]);
  assert.deepEqual([planCanvasExpansion(source,{width:7,height:5,anchor:{x:'left',y:'top'}}).x,planCanvasExpansion(source,{width:7,height:5,anchor:{x:'left',y:'top'}}).y],[0,0]);
  assert.deepEqual([planCanvasExpansion(source,{width:7,height:5,anchor:{x:'right',y:'bottom'}}).x,planCanvasExpansion(source,{width:7,height:5,anchor:{x:'right',y:'bottom'}}).y],[5,3]);
});

test('CANVAS-EXPAND-03 / actual RGBA8 pixels land exactly at margin anchor on a flat colored background',()=>{
  const source=frame(2,1,[255,40,60,192, 5,15,25,0]);
  const before=source.data.slice();
  const result=expandCanvasPixels(source,{margins:{left:1,right:2,top:1,bottom:1},background:[10,20,30,255]});
  assert.deepEqual([result.width,result.height],[5,3]);
  assert.deepEqual(pixel(result,0,0),[10,20,30,255]);
  assert.deepEqual(pixel(result,1,1),[255,40,60,192]);
  assert.deepEqual(pixel(result,2,1),[5,15,25,0]);
  assert.deepEqual(pixel(result,4,2),[10,20,30,255]);
  assert.deepEqual(source.data,before);
  assert.notStrictEqual(result.data,source.data);
});

test('CANVAS-EXPAND-04 / transparent background remains zero and the unscaled source is byte-exact',()=>{
  const source=frame(1,2,[100,110,120,255, 200,210,220,64]);
  const result=expandCanvasPixels(source,{width:3,height:4,anchor:{x:'right',y:'bottom'}});
  assert.deepEqual(pixel(result,0,0),[0,0,0,0]);
  assert.deepEqual(pixel(result,2,2),[100,110,120,255]);
  assert.deepEqual(pixel(result,2,3),[200,210,220,64]);
  const neutral=expandCanvasPixels(source,{margins:{}});
  assert.deepEqual(neutral.data,source.data);
  neutral.data[0]=0;assert.equal(source.data[0],100);
});

test('CANVAS-EXPAND-05 / malformed settings, ambiguous size modes, invalid color and oversize refuse before output',()=>{
  const source={width:2,height:2};
  for(const options of [null,{}, {margins:{left:-1}},{margins:{left:1.5}},{margins:{},width:3,height:3},
    {margins:{},anchor:{x:'center',y:'center'}},{width:1,height:3},{width:3,height:0},
    {width:3,height:3,anchor:{x:'middle',y:'top'}},{width:3,height:3,anchor:'center'},
    {margins:{right:1},background:[0,0,0]},{margins:{right:1},background:[0,0,0,256]},
    {margins:{right:1},background:[0,0,0,0.5]}]){
    assert.throws(()=>planCanvasExpansion(source,options));
  }
  assert.throws(()=>planCanvasExpansion(source,{width:MAX_CANVAS_EDGE+1,height:2}),/CANVAS_SIZE_LIMIT/);
  assert.throws(()=>planCanvasExpansion(source,{width:MAX_CANVAS_PIXELS,height:2}),/CANVAS_SIZE_LIMIT/);
  assert.throws(()=>planCanvasExpansion({width:MAX_CANVAS_PIXELS+1,height:1},{margins:{}}),/CANVAS_SOURCE_DIMENSIONS_INVALID/);
  assert.ok(MAX_CANVAS_WORKING_BYTES>=MAX_CANVAS_PIXELS*8);
});

test('CANVAS-EXPAND-06 / invalid RGBA8 data and pre-aborted or mid-fill cancellation never mutate original',()=>{
  for(const invalid of [frame(0,1,[]),{width:1,height:1,data:new Uint8Array(4)},frame(2,1,[0,0,0,0])]){
    assert.throws(()=>expandCanvasPixels(invalid,{margins:{right:1}}),/INVALID_OR_OVERSIZE_PIXELS/);
  }
  const source=frame(1,1,[70,80,90,100]),before=source.data.slice();
  const controller=new AbortController();controller.abort();
  assert.throws(()=>expandCanvasPixels(source,{margins:{right:1}},{signal:controller.signal}),{name:'AbortError'});
  let checks=0;const signal={get aborted(){return ++checks>=4;}};
  assert.throws(()=>expandCanvasPixels(source,{width:8192,height:1,background:[10,20,30,255]},{signal}),{name:'AbortError'});
  assert.deepEqual(source.data,before);
});
