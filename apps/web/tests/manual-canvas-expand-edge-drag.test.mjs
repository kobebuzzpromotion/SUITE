import test from 'node:test';
import assert from 'node:assert/strict';
import {beginCanvasExpansionEdgeDrag,updateCanvasExpansionEdgeDrag,
  nudgeCanvasExpansionEdge} from '../src/manual-canvas-expand-edge-drag.mjs';

const zero=()=>({left:0,right:0,top:0,bottom:0});
const rect=()=>({left:100,top:200,width:800,height:600});
const config=(edge='left')=>({edge,margins:zero(),selectionKey:'asset-sha-revision-1',
  preview:{upright:{width:400,height:300},naturalWidth:400,naturalHeight:300,afterRect:rect()},
  full:{upright:{width:800,height:600}},rotationDegrees:0,view:'after'});
const pointer=(x,y,id=7,type='mouse')=>({pointerId:id,pointerType:type,clientX:x,clientY:y});
const touch=(x,y,id=9)=>({touches:[{identifier:id,clientX:x,clientY:y}],
  changedTouches:[{identifier:id,clientX:x,clientY:y}]});
const move=(gesture,event,cfg)=>updateCanvasExpansionEdgeDrag(gesture,event,
  {afterRect:cfg.preview.afterRect,selectionKey:cfg.selectionKey});

test('CANVAS-EDGE-01: four physical edges project client drag into post-Crop percent, never Original percent',()=>{
  const cases=[['left',pointer(100,500),pointer(20,500),'left'],
    ['right',pointer(900,500),pointer(980,500),'right'],
    ['top',pointer(500,200),pointer(500,140),'top'],
    ['bottom',pointer(500,800),pointer(500,860),'bottom']];
  for(const [edge,start,current,key] of cases){
    const cfg=config(edge),gesture=beginCanvasExpansionEdgeDrag(cfg,start);
    const result=move(gesture,current,cfg);
    assert.equal(result.changed,true);
    assert.equal(result.marginPercent,10);
    assert.deepEqual(result.margins,{...zero(),[key]:0.1});
    assert.equal(result.projected.preview[key],edge==='left'||edge==='right'?40:30);
    assert.equal(result.projected.full[key],edge==='left'||edge==='right'?80:60);
  }
});

test('CANVAS-EDGE-02: current expanded Preview, rotation and Crop use actual content boundary',()=>{
  const cfg=config();
  cfg.preview.upright={width:300,height:800};
  cfg.full.upright={width:600,height:1600};
  cfg.rotationDegrees=90;
  cfg.crop={rotation:90,crop_rect:{x:0.25,y:0.125,width:0.5,height:0.5}};
  // Preview rotated 800x300 -> Crop 400x150. Existing left margin 25%.
  cfg.margins={left:0.25,right:0,top:0,bottom:0};
  cfg.preview.naturalWidth=500;
  cfg.preview.naturalHeight=150;
  cfg.preview.afterRect={left:50,top:100,width:1000,height:600};
  // Contain scale 2: image top 250, content left=50+100*2=250.
  const gesture=beginCanvasExpansionEdgeDrag(cfg,pointer(250,400));
  const result=move(gesture,pointer(170,400),cfg);
  assert.equal(result.marginPercent,35);
  assert.deepEqual(result.projected.preview,{left:140,right:0,top:0,bottom:0});
  assert.deepEqual(result.projected.full,{left:280,right:0,top:0,bottom:0});
  assert.equal(cfg.margins.left,0.25);
});

test('CANVAS-EDGE-03: clicks, wrong-axis motion and boundary clamping never edit',()=>{
  const cfg=config('right'),gesture=beginCanvasExpansionEdgeDrag(cfg,pointer(900,500));
  assert.equal(move(gesture,pointer(903.9,500),cfg).changed,false);
  assert.equal(move(gesture,pointer(900,550),cfg).changed,false);
  assert.equal(move(gesture,pointer(840,500),cfg).changed,false);
  assert.equal(move(gesture,pointer(2500,500),cfg).marginPercent,200);
});

test('CANVAS-EDGE-04: touch identity and pointer identity are fixed; multi-touch and miss reject',()=>{
  const cfg=config('bottom');
  const gesture=beginCanvasExpansionEdgeDrag(cfg,touch(500,800));
  assert.equal(move(gesture,touch(500,860),cfg).marginPercent,10);
  assert.throws(()=>move(gesture,touch(500,860,10),cfg),/CANVAS_EDGE_POINTER_CHANGED/);
  assert.throws(()=>move(gesture,pointer(500,860),cfg),/CANVAS_EDGE_POINTER_CHANGED/);
  const multiple={touches:[touch(0,0).touches[0],touch(1,1,10).touches[0]],changedTouches:[]};
  assert.throws(()=>beginCanvasExpansionEdgeDrag(cfg,multiple),/CANVAS_EDGE_INPUT_INVALID/);
  assert.throws(()=>beginCanvasExpansionEdgeDrag(cfg,pointer(100,100)),/CANVAS_EDGE_HANDLE_MISS/);
});

test('CANVAS-EDGE-05: physical RTL directions and viewport scroll use client coords; stale layout/selection fail',()=>{
  const cfg=config('left');
  cfg.direction='rtl'; // CSS writing direction does not reverse the physical photo edge.
  const gesture=beginCanvasExpansionEdgeDrag(cfg,pointer(100,500));
  assert.equal(move(gesture,pointer(20,500),cfg).marginPercent,10);
  assert.throws(()=>updateCanvasExpansionEdgeDrag(gesture,pointer(20,500),
    {afterRect:{...cfg.preview.afterRect,top:201},selectionKey:cfg.selectionKey}),
  /CANVAS_EDGE_LAYOUT_CHANGED/);
  assert.throws(()=>updateCanvasExpansionEdgeDrag(gesture,pointer(20,500),
    {afterRect:cfg.preview.afterRect,selectionKey:'other-asset'}),
  /CANVAS_EDGE_SELECTION_CHANGED/);
});

test('CANVAS-EDGE-06: Arrow, Shift, Home/End and orthogonal key are discrete and bounded',()=>{
  for(const [edge,grow,shrink] of [['left','ArrowLeft','ArrowRight'],
    ['right','ArrowRight','ArrowLeft'],['top','ArrowUp','ArrowDown'],
    ['bottom','ArrowDown','ArrowUp']]){
    const cfg=config(edge);
    let result=nudgeCanvasExpansionEdge(cfg,{key:grow});
    assert.equal(result.marginPercent,1);
    result=nudgeCanvasExpansionEdge(cfg,{key:grow,shiftKey:true});
    assert.equal(result.marginPercent,10);
    assert.equal(nudgeCanvasExpansionEdge(cfg,{key:shrink}).changed,false);
    assert.equal(nudgeCanvasExpansionEdge(cfg,{key:'Tab'}).changed,false);
    assert.equal(nudgeCanvasExpansionEdge(cfg,{key:'Home'}).changed,false);
    assert.equal(nudgeCanvasExpansionEdge(cfg,{key:'End'}).marginPercent,200);
  }
});

test('CANVAS-EDGE-07: stale image, Before, invalid geometry and output capacity reject',()=>{
  const cfg=config();
  cfg.preview.naturalWidth=399;
  assert.throws(()=>beginCanvasExpansionEdgeDrag(cfg,pointer(100,500)),/CANVAS_EDGE_PREVIEW_STALE/);
  cfg.preview.naturalWidth=400;cfg.view='before';
  assert.throws(()=>beginCanvasExpansionEdgeDrag(cfg,pointer(100,500)),/CANVAS_EDGE_AFTER_REQUIRED/);
  cfg.view='after';cfg.crop={rotation:0,crop_rect:{x:0,y:0,width:0,height:1}};
  assert.throws(()=>nudgeCanvasExpansionEdge(cfg,{key:'ArrowLeft'}),/CANVAS_EDGE_CROP_INVALID/);
  cfg.crop=undefined;cfg.full.upright={width:4000,height:4000};
  const gesture=beginCanvasExpansionEdgeDrag(cfg,pointer(100,500));
  assert.throws(()=>move(gesture,pointer(-1100,500),cfg),/CANVAS_SIZE_LIMIT|CANVAS_MEMORY_LIMIT/);
});

test('CANVAS-EDGE-08: invalid events and Abort are fail-closed; inputs are not modified',()=>{
  const cfg=config(),snapshot=structuredClone(cfg),start=pointer(100,500),event={...start};
  const gesture=beginCanvasExpansionEdgeDrag(cfg,start);
  assert.throws(()=>move(gesture,pointer(Number.NaN,500),cfg),/CANVAS_EDGE_INPUT_INVALID/);
  assert.throws(()=>updateCanvasExpansionEdgeDrag(gesture,pointer(20,500),
    {afterRect:cfg.preview.afterRect,selectionKey:cfg.selectionKey,
      signal:AbortSignal.abort()}),/ABORT|Abort/i);
  assert.throws(()=>beginCanvasExpansionEdgeDrag({...cfg,margins:{...zero(),left:2.01}},start),
    /CANVAS_EDGE_MARGINS_INVALID/);
  assert.deepEqual(cfg,snapshot);
  assert.deepEqual(start,event);
});
