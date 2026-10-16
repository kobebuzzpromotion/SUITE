import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EditorSession, neutralRecipe} from '../src/session.mjs';
import {ASSET_A, ASSET_B, deferred} from './fixtures.mjs';

// Synthetic non-RAW Session fault injection. The signal is the one passed by
// the Editor edge host after Escape/pointercancel; physical browser input is
// a separate gate.
const settings = () => ({margins: {left:.25,right:0,top:0,bottom:0},
  background:[255,255,255,255]});
const pixel = () => ({width:2,height:2,data:new Uint8ClampedArray([
  50,60,70,255, 80,90,100,255, 110,120,130,255, 140,150,160,255])});
async function fixture() {
  const assets=[ASSET_A,ASSET_B].map((id,index)=>({id,name:`photo-${index}.nonraw`,
    sha256:String(index+1).repeat(64),size:12,cloudSafe:true,deletedAt:null}));
  const remote=new Map(assets.map(asset=>[asset.id,{revision:1,body:neutralRecipe()}]));
  const cache=new Map(assets.map(asset=>[asset.id,{asset:structuredClone(asset),
    proxy:pixel(),history:[neutralRecipe()],cursor:0,revision:1,
    reference:null,dirty:false}]));
  const api={listAssets:async()=>structuredClone(assets),
    getRecipe:async id=>structuredClone(remote.get(id)),
    assertPermission:async()=>({authorized:true})};
  const storage={get:async id=>structuredClone(cache.get(id)),
    put:async(id,value)=>{cache.set(id,structuredClone(value));}};
  const processing={syntheticTestOnly:true,render:async pixels=>pixels,
    encode:async()=>new Blob([new Uint8Array([1])],{type:'image/png'})};
  let serial=0;
  const urlAPI={createObjectURL:()=>`blob:canvas-cancel-${++serial}`,
    revokeObjectURL:()=>{}};
  const session=new EditorSession({api,storage,processing,urlAPI,
    personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(ASSET_A);
  return {session,api,storage,processing,cache,assets};
}
const sameState=(session,before)=>{
  assert.deepEqual(session.state.recipe,before.recipe);
  assert.equal(session.state.dirty,before.dirty);
  assert.equal(session.state.revision,before.revision);
  assert.equal(session.state.canUndo,before.canUndo);
  assert.equal(session.state.busy,null);
};

test('CANVAS-PENDING-01: Edge host passes its AbortSignal into the Canvas-only Session call',async()=>{
  const source=await readFile(new URL('../src/editor-ui.mjs',import.meta.url),'utf8');
  assert.match(source,/run\('setCanvasExpansion',\{margins:candidate\.margins,background\},\{signal\}\)/u);
});

test('CANVAS-PENDING-02: Escape/pointercancel while permission is delayed cannot commit the candidate',async()=>{
  const f=await fixture(),before=f.session.state,cacheBefore=structuredClone(f.cache.get(ASSET_A));
  const entered=deferred(),release=deferred();
  f.api.assertPermission=async()=>{entered.resolve();await release.promise;return {authorized:true};};
  const controller=new AbortController();
  const operation=f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  await entered.promise;
  await assert.rejects(f.session.openAsset(ASSET_B),/OPERATION_IN_PROGRESS/);
  controller.abort();release.resolve();
  await assert.rejects(operation,{name:'AbortError'});
  sameState(f.session,before);
  assert.deepEqual(f.cache.get(ASSET_A),cacheBefore);
  await f.session.openAsset(ASSET_B);
  assert.equal(f.session.state.asset.id,ASSET_B);
  assert.equal(f.session.state.recipe.parameters.extendedParameters.canvasExpand,undefined);
  assert.equal(f.cache.get(ASSET_A).history[0].parameters.extendedParameters.canvasExpand,undefined);
});

test('CANVAS-PENDING-03: cancellation during delayed draft storage restores old cache and clean state',async()=>{
  const f=await fixture(),before=f.session.state,cacheBefore=structuredClone(f.cache.get(ASSET_A));
  const entered=deferred(),release=deferred(),originalPut=f.storage.put;
  let held=false;
  f.storage.put=async(id,value)=>{
    if(!held){held=true;entered.resolve();await release.promise;}
    return originalPut(id,value);
  };
  const controller=new AbortController();
  const operation=f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(operation,{name:'AbortError'});
  sameState(f.session,before);
  assert.deepEqual(f.cache.get(ASSET_A),cacheBefore);
});

test('CANVAS-PENDING-04: cancellation during delayed preview render removes late Recipe and restores history',async()=>{
  const f=await fixture(),before=f.session.state,cacheBefore=structuredClone(f.cache.get(ASSET_A));
  const entered=deferred(),release=deferred(),originalRender=f.processing.render;
  let held=false;
  f.processing.render=async(...args)=>{
    if(!held){held=true;entered.resolve();await release.promise;}
    return originalRender(...args);
  };
  const controller=new AbortController();
  const operation=f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(operation,{name:'AbortError'});
  sameState(f.session,before);
  assert.deepEqual(f.cache.get(ASSET_A),cacheBefore);
  assert.equal(f.session.state.recipe.parameters.extendedParameters.canvasExpand,undefined);
});

test('CANVAS-PENDING-05: pre-aborted or malformed signal cannot start an edit',async()=>{
  const f=await fixture(),before=f.session.state;
  const controller=new AbortController();controller.abort();
  await assert.rejects(f.session.setCanvasExpansion(settings(),{signal:controller.signal}),
    {name:'AbortError'});
  await assert.rejects(f.session.setCanvasExpansion(settings(),{signal:{aborted:'no'}}),
    /CANVAS_ABORT_SIGNAL_INVALID/);
  sameState(f.session,before);
});

test('CANVAS-PENDING-06: cancellation restores a prior unsaved draft, not just a neutral saved Recipe',async()=>{
  const f=await fixture();
  await f.session.setAdjustment('exposure',.5);
  const before=f.session.state,cacheBefore=structuredClone(f.cache.get(ASSET_A));
  const entered=deferred(),release=deferred(),originalRender=f.processing.render;
  let held=false;
  f.processing.render=async(...args)=>{
    if(!held){held=true;entered.resolve();await release.promise;}
    return originalRender(...args);
  };
  const controller=new AbortController();
  const operation=f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(operation,{name:'AbortError'});
  sameState(f.session,before);
  assert.equal(f.session.state.recipe.parameters.exposure,.5);
  assert.deepEqual(f.cache.get(ASSET_A),cacheBefore);
});

test('CANVAS-PENDING-07: a noncancelled edge edit still reaches the normal Undo and save path',async()=>{
  const f=await fixture(),controller=new AbortController();
  await f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  assert.equal(f.session.state.recipe.parameters.extendedParameters.canvasExpand.margins.left,.25);
  assert.equal(f.session.state.dirty,true);
  await f.session.undo();
  assert.equal(f.session.state.recipe.parameters.extendedParameters.canvasExpand,undefined);
});

test('CANVAS-PENDING-08: failed local rollback blocks further actions instead of claiming a clean cancel',async()=>{
  const f=await fixture(),entered=deferred(),release=deferred();
  const originalPut=f.storage.put;
  let writes=0;
  f.storage.put=async(id,value)=>{
    writes++;
    if(writes===1){await originalPut(id,value);entered.resolve();await release.promise;return;}
    throw Error('SYNTHETIC_ROLLBACK_STORAGE_FAILURE');
  };
  const controller=new AbortController();
  const operation=f.session.setCanvasExpansion(settings(),{signal:controller.signal});
  await entered.promise;controller.abort();release.resolve();
  await assert.rejects(operation,/CANVAS_CANCEL_ROLLBACK_FAILED/);
  assert.equal(f.session.state.busy,'recovery required');
  assert.equal(f.session.state.dirty,true);
  assert.equal(f.session.state.afterURL,null);
  await assert.rejects(f.session.openAsset(ASSET_B),/UNSAVED_EDITS|OPERATION_IN_PROGRESS/);
  await assert.rejects(f.session.exportFinal({format:'png'}),/OPERATION_IN_PROGRESS/);
});
