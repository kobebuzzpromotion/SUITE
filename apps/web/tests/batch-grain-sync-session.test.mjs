import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, neutralRecipe} from '../src/session.mjs';

const ids=['source','first','second'],sha='a'.repeat(64);
const assets=ids.map(id=>({id,sha256:sha}));
const grain={amount:48,seed:0x12345678,shadows:75,midtones:85,highlights:65,
  size:35,roughness:25,colorVariation:45};
function recipe(grainValue,exposure=0){
  const body=neutralRecipe();body.parameters.exposure=exposure;
  if(grainValue){body.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',detail:{grain:structuredClone(grainValue)}};
    body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');}
  return body;
}
function setup(api,storage){
  const session=new EditorSession({api,processing:{},storage});
  session.data.asset=assets[0];session.data.recipe=recipe(grain);session.data.revision=1;
  session.proxy={width:1,height:1,data:new Uint8ClampedArray([80,80,80,255])};
  return session;
}

test('GRAIN-SYNC-SESSION01 / source or target unsaved draft rejects before any write',async()=>{
  let writes=0;
  const api={listAssets:async()=>assets,assertPermission:async()=>({authorized:true}),
    getRecipe:async()=>({revision:1,body:recipe()}),
    saveRecipe:async()=>{writes++;throw Error('SHOULD_NOT_WRITE');}};
  const session=setup(api,{get:async()=>undefined,put:async()=>{}});
  session.data.dirty=true;
  await assert.rejects(session.batchSyncGrain(ids.slice(1)),/GRAIN_SYNC_SOURCE_SAVE_REQUIRED/);
  session.data.dirty=false;
  session.storage={get:async id=>id==='first'?{dirty:true}:undefined,put:async()=>{}};
  await assert.rejects(session.batchSyncGrain(ids.slice(1)),/GRAIN_SYNC_TARGET_UNSAVED_DRAFT/);
  assert.equal(writes,0);
});

test('GRAIN-SYNC-SESSION02 / saved source copies only Grain with CAS and truthful partial status',async()=>{
  const sourceBody=recipe(grain,0.8),firstBody=recipe({amount:12,seed:9},-0.4),
    secondBody=recipe(null,1.2);
  const stored=new Map([['source',{revision:1,body:sourceBody}],
    ['first',{revision:1,body:firstBody}],['second',{revision:1,body:secondBody}]]);
  const api={listAssets:async()=>assets,assertPermission:async()=>({authorized:true}),
    getRecipe:async id=>structuredClone(stored.get(id)),
    saveRecipe:async(id,revision,body)=>{
      if(id==='first')return {outcome:'conflict'};
      assert.equal(revision,1);const saved={revision:revision+1,body:structuredClone(body)};
      stored.set(id,saved);return structuredClone(saved);
    }};
  const session=setup(api,{get:async()=>undefined,put:async()=>{}});
  session.data.recipe=structuredClone(sourceBody);
  const result=await session.batchSyncGrain(ids.slice(1));
  assert.equal(result.status,'partial');assert.deepEqual(result.results.map(row=>row.status),['conflict','saved']);
  assert.equal(stored.get('first').revision,1);
  assert.equal(stored.get('second').revision,2);
  assert.equal(stored.get('second').body.parameters.exposure,1.2);
  assert.deepEqual(stored.get('second').body.parameters.extendedParameters.postDecodeAdjustments.detail.grain,
    grain);
  assert.deepEqual(stored.get('source').body,sourceBody);
  assert.equal(session.state.dirty,false);
});
