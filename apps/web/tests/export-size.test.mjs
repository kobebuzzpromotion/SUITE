import test from 'node:test';
import assert from 'node:assert/strict';
import {planExportDimensions,resizeExportPixels,MAX_EXPORT_EDGE,MAX_EXPORT_PIXELS,MAX_EXPORT_RESIZE_BYTES} from '../src/export-size.mjs';

const frame=(width,height,rgba)=>({width,height,data:new Uint8ClampedArray(rgba)});
const pixel=(image,x,y)=>[...image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4)];

test('EXPORT-SIZE-01 / Final-frame width, height, percentage, and fit box preserve ratio within integer rounding',()=>{
  const source={width:4000,height:3000};
  assert.deepEqual(planExportDimensions(source,{kind:'original'}),{width:4000,height:3000,sourceWidth:4000,sourceHeight:3000,kind:'original'});
  assert.deepEqual([planExportDimensions(source,{kind:'percentage',value:25}).width,planExportDimensions(source,{kind:'percentage',value:25}).height],[1000,750]);
  assert.deepEqual([planExportDimensions(source,{kind:'width',value:800}).width,planExportDimensions(source,{kind:'width',value:800}).height],[800,600]);
  assert.deepEqual([planExportDimensions(source,{kind:'height',value:1200}).width,planExportDimensions(source,{kind:'height',value:1200}).height],[1600,1200]);
  assert.deepEqual([planExportDimensions(source,{kind:'fit',width:900,height:500}).width,planExportDimensions(source,{kind:'fit',width:900,height:500}).height],[667,500]);
});

test('EXPORT-SIZE-02 / tiny Final frame remains at least one pixel and no mode enlarges it',()=>{
  const source={width:3,height:2};
  assert.deepEqual([planExportDimensions(source,{kind:'percentage',value:1}).width,planExportDimensions(source,{kind:'percentage',value:1}).height],[1,1]);
  assert.deepEqual([planExportDimensions(source,{kind:'width',value:2}).width,planExportDimensions(source,{kind:'width',value:2}).height],[2,1]);
  assert.deepEqual([planExportDimensions(source,{kind:'fit',width:999,height:999}).width,planExportDimensions(source,{kind:'fit',width:999,height:999}).height],[3,2]);
});

test('EXPORT-SIZE-03 / invalid, oversized and implicit-upscale requests fail before allocation',()=>{
  const source={width:100,height:80};
  for(const settings of [null,{}, {kind:'percentage',value:0},{kind:'percentage',value:101},{kind:'percentage',value:25.5},{kind:'width',value:101},{kind:'height',value:81},{kind:'width',value:NaN},{kind:'fit',width:0,height:70},{kind:'fit',width:70,height:Infinity},{kind:'mystery'}]){
    assert.throws(()=>planExportDimensions(source,settings));
  }
  assert.throws(()=>planExportDimensions({width:MAX_EXPORT_PIXELS+1,height:1},{kind:'width',value:1}),/EXPORT_SOURCE_DIMENSIONS_INVALID/);
  assert.throws(()=>planExportDimensions(null,{kind:'original'}),/EXPORT_SOURCE_DIMENSIONS_INVALID/);
  assert.throws(()=>planExportDimensions({width:MAX_EXPORT_EDGE+1,height:1},{kind:'original'}),/EXPORT_SIZE_LIMIT/);
  assert.ok(MAX_EXPORT_RESIZE_BYTES>=2*MAX_EXPORT_PIXELS*4);
});

test('EXPORT-SIZE-04 / opaque area downsample averages real RGBA8 pixels, not a placeholder dimension change',()=>{
  const source=frame(2,2,[
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255
  ]);
  const before=source.data.slice();
  const output=resizeExportPixels(source,{kind:'width',value:1});
  assert.deepEqual([output.width,output.height],[1,1]);
  assert.deepEqual(pixel(output,0,0),[188,188,188,255]);
  assert.deepEqual(source.data,before);
  assert.notStrictEqual(output.data,source.data);
});

test('EXPORT-SIZE-05 / premultiplied-alpha reduction avoids transparent RGB halos',()=>{
  const source=frame(2,1,[255,0,0,0, 0,0,255,255]);
  const output=resizeExportPixels(source,{kind:'width',value:1});
  assert.deepEqual(pixel(output,0,0),[0,0,255,128]);
  const fullyTransparent=resizeExportPixels(frame(2,1,[255,0,0,0, 0,255,0,0]),{kind:'width',value:1});
  assert.deepEqual(pixel(fullyTransparent,0,0),[0,0,0,0]);
});

test('EXPORT-SIZE-06 / identity size yields detached exact pixels, including hidden RGB and metadata isolation',()=>{
  const source={...frame(2,1,[15,25,35,0, 200,150,100,222]),sourceWidth:2,sourceHeight:1};
  const output=resizeExportPixels(source,{kind:'percentage',value:100});
  assert.deepEqual(output,{width:2,height:1,data:source.data});
  assert.notStrictEqual(output.data,source.data);
  output.data[0]=77;assert.equal(source.data[0],15);
  assert.equal(Object.hasOwn(output,'sourceWidth'),false);
});

test('EXPORT-SIZE-07 / malformed RGBA8 source and both early or mid-operation cancellation refuse output',()=>{
  for(const invalid of [frame(0,1,[]),{width:2,height:1,data:new Uint8Array(8)},frame(2,1,[1,2,3,4])]){
    assert.throws(()=>resizeExportPixels(invalid,{kind:'width',value:1}),/INVALID_OR_OVERSIZE_PIXELS/);
  }
  const source=frame(2,4,Array.from({length:8},()=>[20,40,80,255]).flat());
  const before=source.data.slice();
  const controller=new AbortController();controller.abort();
  assert.throws(()=>resizeExportPixels(source,{kind:'height',value:2},{signal:controller.signal}),{name:'AbortError'});
  let checks=0;const signal={get aborted(){return ++checks>=4;}};
  assert.throws(()=>resizeExportPixels(source,{kind:'height',value:2},{signal}),{name:'AbortError'});
  let wideChecks=0;const wideSignal={get aborted(){return ++wideChecks>=3;}};
  const wide=frame(8192,1,new Uint8ClampedArray(8192*4).fill(90));
  assert.throws(()=>resizeExportPixels(wide,{kind:'width',value:1},{signal:wideSignal}),{name:'AbortError'});
  assert.deepEqual(source.data,before);
});
