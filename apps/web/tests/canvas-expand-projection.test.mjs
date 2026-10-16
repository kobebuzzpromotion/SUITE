import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {expandCanvasPixels,planCanvasExpansion} from '../src/processing/canvas-expand.mjs';

const settings=(margins,background=[0,0,0,0])=>({schemaVersion:1,margins,background});
const frame=(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)});

test('CANVAS-PROJECTION-01: Proxy and Final preserve the same normalized composition',()=>{
  const normalized=settings({left:.125,right:.25,top:.075,bottom:.175},[9,8,7,255]);
  const proxy={width:121,height:79,sourceWidth:1201,sourceHeight:801};
  const final={width:1201,height:801};
  const proxyOptions=projectCanvasExpansion(proxy,normalized);
  const finalOptions=projectCanvasExpansion(final,normalized);
  const proxyPlan=planCanvasExpansion(proxy,proxyOptions);
  const finalPlan=planCanvasExpansion(final,finalOptions);
  for(const [source,projected] of [[proxy,proxyOptions],[final,finalOptions]]){
    for(const key of ['left','right','top','bottom']){
      const edge=key==='left'||key==='right'?source.width:source.height;
      assert.ok(Math.abs(projected.margins[key]/edge-normalized.margins[key])<=.5/edge+1e-12,key);
    }
  }
  assert.ok(Math.abs(proxyPlan.x/proxy.width-finalPlan.x/final.width)<=.5/proxy.width+.5/final.width);
  assert.ok(Math.abs(proxyPlan.y/proxy.height-finalPlan.y/final.height)<=.5/proxy.height+.5/final.height);
  assert.deepEqual(proxyOptions.background,[9,8,7,255]);
  assert.deepEqual(finalOptions.background,[9,8,7,255]);
  assert.equal(proxyOptions.margins.left,Math.round(121*.125));
  assert.equal(finalOptions.margins.left,Math.round(1201*.125));
  assert.deepEqual(normalized,settings({left:.125,right:.25,top:.075,bottom:.175},[9,8,7,255]));
});

test('CANVAS-PROJECTION-02: dimensions are the post-rotation/post-Crop frame, not Original metadata',()=>{
  const croppedRotated={width:60,height:100,sourceWidth:4000,sourceHeight:3000};
  const projected=projectCanvasExpansion(croppedRotated,settings({left:.5,right:0,top:.2,bottom:0}));
  assert.deepEqual(projected.margins,{left:30,right:0,top:20,bottom:0});
  assert.deepEqual(planCanvasExpansion(croppedRotated,projected),{
    width:90,height:120,x:30,y:20,sourceWidth:60,sourceHeight:100,background:[0,0,0,0],
  });
});

test('CANVAS-PROJECTION-03: projected settings expand RGBA without changing the source',()=>{
  const original=frame(2,2);
  original.data.set([41,42,43,128],0);
  original.data.set([61,62,63,255],12);
  const before=original.data.slice();
  const projected=projectCanvasExpansion(original,settings({left:.5,right:.5,top:.5,bottom:0},[3,4,5,0]));
  const result=expandCanvasPixels(original,projected);
  assert.deepEqual([result.width,result.height],[4,3]);
  assert.deepEqual([...result.data.slice(0,4)],[3,4,5,0]);
  assert.deepEqual([...result.data.slice((1*4+1)*4,(1*4+2)*4)],[41,42,43,128]);
  assert.deepEqual([...result.data.slice((2*4+2)*4,(2*4+3)*4)],[61,62,63,255]);
  assert.deepEqual(original.data,before);
  assert.notEqual(result.data,original.data);
});

test('CANVAS-PROJECTION-04: strict Recipe shape, range and background validation',()=>{
  const source={width:10,height:8};
  const valid={left:0,right:0,top:0,bottom:0};
  for(const candidate of [null,[],{},{...settings(valid),unexpected:1},
    settings({...valid,left:NaN}),settings({...valid,left:Infinity}),
    settings({...valid,left:-.01}),settings({...valid,left:4.01}),
    settings({...valid,left:'0.2'}),settings({left:0,right:0,top:0}),
    settings({...valid,extra:0}),{...settings(valid),schemaVersion:2}]){
    assert.throws(()=>projectCanvasExpansion(source,candidate));
  }
  assert.throws(()=>projectCanvasExpansion(source,settings(valid,[0,0,0,256])),/CANVAS_BACKGROUND_INVALID/);
  assert.throws(()=>projectCanvasExpansion(source,settings(valid,null)),/CANVAS_BACKGROUND_INVALID/);
  assert.deepEqual(projectCanvasExpansion(source,settings(valid)),{margins:valid,background:[0,0,0,0]});
});

test('CANVAS-PROJECTION-05: output edge and pixel limits fail before allocation',()=>{
  const zero={left:0,right:0,top:0,bottom:0};
  assert.throws(()=>projectCanvasExpansion({width:16000,height:1},settings({...zero,left:.1})),/CANVAS_SIZE_LIMIT/);
  assert.throws(()=>projectCanvasExpansion({width:5000,height:4000},settings({...zero,right:1})),/CANVAS_SIZE_LIMIT/);
  const bounded=planCanvasExpansion({width:5000,height:4000},
    projectCanvasExpansion({width:5000,height:4000},settings({...zero,right:.1})));
  assert.ok((5000*4000+bounded.width*bounded.height)*4<=256*1024*1024);
  assert.throws(()=>projectCanvasExpansion({width:0,height:1},settings(zero)),/CANVAS_SOURCE_DIMENSIONS_INVALID/);
});

test('CANVAS-PROJECTION-06: abort is fail-closed and source/settings are untouched',()=>{
  const source={width:10,height:8},input=settings({left:.25,right:0,top:0,bottom:0});
  const controller=new AbortController();controller.abort();
  assert.throws(()=>projectCanvasExpansion(source,input,{signal:controller.signal}),error=>error?.name==='AbortError');
  const projected=projectCanvasExpansion(source,input);
  assert.ok(Object.isFrozen(projected));
  assert.ok(Object.isFrozen(projected.margins));
  assert.ok(Object.isFrozen(projected.background));
  assert.deepEqual(input,settings({left:.25,right:0,top:0,bottom:0}));
  assert.deepEqual(source,{width:10,height:8});
});
