import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProxyPixels} from '../src/processing/pure.mjs';
import {applyManualFaceDecorationFreckles,
  MANUAL_FACE_DECORATION_FRECKLES_VERSION} from
  '../src/processing/manual-face-decoration-freckles.mjs';

const ASSET='11111111-1111-4111-8111-111111111111';
const PERSON='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);
function frame(width=40,height=40){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)data.set([150,135,120,255],i*4);
  data.set([11,22,33,0],0);
  return {width,height,data};
}
const binding=(width=40,height=40,target='source')=>({assetID:ASSET,
  originalSHA256:SHA,personID:PERSON,savedRevision:3,
  sourceWidth:width,sourceHeight:height,target});
const dot=(u=.5,v=.5)=>({u,v,radiusFraction:.05,
  color:{r:95,g:65,b:45},opacity:.8});
const selection=(points,context)=>({binding:context,points});
const apply=(pixels,points=[dot()],context=binding())=>
  applyManualFaceDecorationFreckles(pixels,selection(points,context),context);

test('FRECKLES-01: small authored dots alter opaque RGB locally, not alpha, hidden RGB or inputs',()=>{
  assert.match(MANUAL_FACE_DECORATION_FRECKLES_VERSION,
    /suite-srgb8-owner-manual-freckles-1/);
  const source=frame(),before=source.data.slice(),points=[dot()];
  const result=apply(source,points),again=apply(source,points);
  assert.notDeepEqual([...result.data.slice((19*40+19)*4,(19*40+19)*4+3)],
    [...before.slice((19*40+19)*4,(19*40+19)*4+3)]);
  assert.deepEqual([...result.data.slice(0,4)],[11,22,33,0]);
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    const at=(y*40+x)*4;
    assert.equal(result.data[at+3],before[at+3]);
    if(x<17||x>22||y<17||y>22)
      assert.deepEqual([...result.data.slice(at,at+4)],
        [...before.slice(at,at+4)]);
  }
  assert.deepEqual([...source.data],[...before]);
  assert.deepEqual(points,[dot()]);
  assert.deepEqual(again,result);
  assert.notEqual(result.data,source.data);
});

test('FRECKLES-02: zero opacity is an owned neutral result; multiple dots remain deterministic',()=>{
  const source=frame();
  const neutral=apply(source,[{...dot(),opacity:0}]);
  assert.deepEqual(neutral,source);
  assert.notEqual(neutral.data,source.data);
  const two=apply(source,[dot(.4,.5),dot(.6,.5)]);
  assert.notDeepEqual(two,source);
  assert.deepEqual(two,apply(source,[dot(.4,.5),dot(.6,.5)]));
});

test('FRECKLES-03: Asset, SHA, person, version, source dimensions and target are structural bounds',()=>{
  const source=frame(),expected=binding();
  for(const change of [{assetID:crypto.randomUUID()},
    {originalSHA256:'b'.repeat(64)},{personID:crypto.randomUUID()},
    {savedRevision:4},{sourceWidth:41},{target:'proxy'}])
    assert.throws(()=>applyManualFaceDecorationFreckles(source,
      selection([dot()],{...expected,...change}),expected),
    /MANUAL_FRECKLES_SELECTION_BINDING_MISMATCH/);
  assert.throws(()=>apply(source,[dot()],{...expected,authorized:true}),
    /MANUAL_FRECKLES_BINDING_INVALID/);
});

test('FRECKLES-04: hostile point forms, unknown keys, capacity and transparent-only target reject',()=>{
  const source=frame();
  for(const invalid of [{...dot(),u:NaN},{...dot(),opacity:-0},
    {...dot(),opacity:1.01},{...dot(),radiusFraction:.2},
    {...dot(),color:{r:0,g:2,b:256}},{...dot(),permission:true}])
    assert.throws(()=>apply(source,[invalid]),/MANUAL_FRECKLES_POINT_INVALID/);
  const sparse=[dot(),dot()];delete sparse[1];
  assert.throws(()=>apply(source,sparse),/MANUAL_FRECKLES_POINTS_INVALID/);
  assert.throws(()=>apply(source,Array(65).fill(dot())),
    /MANUAL_FRECKLES_POINTS_INVALID/);
  let called=0;const hostile={...dot()};
  Object.defineProperty(hostile,'color',{get(){called++;throw Error('GETTER_RAN');}});
  assert.throws(()=>apply(source,[hostile]),/MANUAL_FRECKLES_POINT_INVALID/);
  assert.equal(called,0);
  const transparent=frame();transparent.data.fill(0);
  assert.throws(()=>apply(transparent),/MANUAL_FRECKLES_NO_OPAQUE_TARGET/);
  assert.throws(()=>apply({...source,width:4000,height:3000}),
    /MANUAL_FRECKLES_CAPACITY/);
});

test('FRECKLES-05: exact 1600px Proxy keeps source metadata and normalized location',()=>{
  const source=frame(2000,1000),proxy=makeProxyPixels(source);
  const context=binding(2000,1000,'proxy');
  const result=apply(proxy,[dot()],context);
  assert.equal(result.width,1600);assert.equal(result.height,800);
  assert.equal(result.sourceWidth,2000);assert.equal(result.sourceHeight,1000);
  assert.notDeepEqual(result,proxy);
  assert.throws(()=>apply({...proxy,width:1599},[dot()],context),
    /INVALID_OR_OVERSIZE_PIXELS|MANUAL_FRECKLES_TARGET_DIMENSIONS_MISMATCH/);
  assert.throws(()=>apply({width:1600,height:800,data:proxy.data},
    [dot()],context),/MANUAL_FRECKLES_SOURCE_DIMENSIONS_MISMATCH|PROXY_PROVENANCE_REQUIRED/);
});

test('FRECKLES-06: pre-abort and mid-loop abort do not mutate the source',()=>{
  const source=frame(200,200),before=source.data.slice();
  const context=binding(200,200);
  assert.throws(()=>applyManualFaceDecorationFreckles(source,
    selection([dot()],context),context,{signal:AbortSignal.abort()}),
  {name:'AbortError'});
  let checks=0;
  const signal={get aborted(){return ++checks>2;}};
  assert.throws(()=>applyManualFaceDecorationFreckles(source,
    selection([dot(),dot(.45,.45),dot(.55,.55)],context),context,{signal}),
  {name:'AbortError'});
  assert.deepEqual([...source.data],[...before]);
});
