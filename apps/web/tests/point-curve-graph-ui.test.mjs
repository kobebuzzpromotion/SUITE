import test from 'node:test';
import assert from 'node:assert/strict';
import {pointCurveGraphCoordinate,pointCurveGraphHitIndex,insertCurveGraphPoint,moveCurveGraphPoint,removeCurveGraphPoint} from '../src/editor-ui.mjs';
import {applyPointCurves,buildPointCurveLUT} from '../src/processing/point-curves.mjs';

const identity=[{x:0,y:0},{x:255,y:255}];

test('graph pointer coordinates account for centered contain and inverted output axis',()=>{
  const square={left:20,top:40,width:240,height:240};
  assert.deepEqual(pointCurveGraphCoordinate({rect:square,clientX:140,clientY:160}),{x:128,y:127});
  assert.deepEqual(pointCurveGraphCoordinate({rect:square,clientX:20,clientY:280}),{x:0,y:0});
  assert.deepEqual(pointCurveGraphCoordinate({rect:square,clientX:260,clientY:40}),{x:255,y:255});
  const contain={left:0,top:0,width:400,height:200};
  assert.equal(pointCurveGraphCoordinate({rect:contain,clientX:20,clientY:100}),null);
  assert.deepEqual(pointCurveGraphCoordinate({rect:contain,clientX:200,clientY:100}),{x:128,y:127});
  assert.deepEqual(pointCurveGraphCoordinate({rect:contain,clientX:20,clientY:100,clamp:true}),{x:0,y:127});
  assert.throws(()=>pointCurveGraphCoordinate({rect:{left:0,top:0,width:0,height:100},clientX:0,clientY:0}),/POINT_CURVE_GRAPH_RECT_INVALID/);
});

test('graph point add/move/delete preserves ordered integer endpoints and source arrays',()=>{
  const inserted=insertCurveGraphPoint(identity,{x:128,y:220});
  assert.equal(inserted.index,1);
  assert.deepEqual(inserted.points,[{x:0,y:0},{x:128,y:220},{x:255,y:255}]);
  assert.deepEqual(identity,[{x:0,y:0},{x:255,y:255}]);
  assert.equal(insertCurveGraphPoint(inserted.points,{x:128,y:9}),null);
  assert.equal(insertCurveGraphPoint(identity,{x:0,y:40}),null);
  const moved=moveCurveGraphPoint(inserted.points,1,{x:300,y:-15});
  assert.deepEqual(moved[1],{x:254,y:0});
  assert.deepEqual(moveCurveGraphPoint(inserted.points,0,{x:50,y:42})[0],{x:0,y:42});
  assert.deepEqual(moveCurveGraphPoint(inserted.points,2,{x:200,y:270})[2],{x:255,y:255});
  assert.deepEqual(removeCurveGraphPoint(inserted.points,1),identity);
  assert.equal(removeCurveGraphPoint(inserted.points,0),null);
  assert.deepEqual(inserted.points,[{x:0,y:0},{x:128,y:220},{x:255,y:255}]);
});

test('retargeted native double click finds only a nearby removable interior point',()=>{
  const points=[{x:0,y:0},{x:128,y:128},{x:255,y:255}];
  const rect={left:100,top:200,width:255,height:255};
  assert.equal(pointCurveGraphHitIndex(points,rect,228,327),1);
  assert.equal(pointCurveGraphHitIndex(points,rect,260,327),1);
  assert.equal(pointCurveGraphHitIndex(points,rect,263,327),null);
  assert.equal(pointCurveGraphHitIndex(points,rect,100,455),null);
  assert.equal(pointCurveGraphHitIndex(points,rect,355,200),null);
  assert.equal(pointCurveGraphHitIndex(points,rect,280,260),null);
  assert.equal(pointCurveGraphHitIndex(points,{...rect,width:0},228,327),null);
});

test('graph-generated points feed the existing real-pixel point-curve path',()=>{
  const added=insertCurveGraphPoint(identity,{x:128,y:220}).points;
  const lut=buildPointCurveLUT(added);
  assert.equal(lut[128],220);
  const original={width:1,height:1,data:new Uint8ClampedArray([128,128,128,211])};
  const result=applyPointCurves(original,{red:added});
  assert.deepEqual([...result.data],[220,128,128,211]);
  assert.deepEqual([...original.data],[128,128,128,211]);
});

test('graph refuses a 33rd point and invalid direct edit indices',()=>{
  const full=Array.from({length:32},(_,index)=>({x:index===31?255:index*8,y:index===31?255:index*8}));
  assert.equal(insertCurveGraphPoint(full,{x:249,y:80}),null);
  assert.throws(()=>moveCurveGraphPoint(identity,-1,{x:2,y:3}),/POINT_CURVE_GRAPH_MOVE_INVALID/);
});
