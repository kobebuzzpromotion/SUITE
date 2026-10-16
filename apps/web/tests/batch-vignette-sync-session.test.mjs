import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, neutralRecipe} from '../src/session.mjs';
import {applyBatchVignetteSync} from '../src/batch-vignette-sync.mjs';

const ids=['source','first','second'];
const sha='a'.repeat(64);
const assets=ids.map(id=>({id,sha256:sha}));
const recipe=()=>{const body=neutralRecipe();body.parameters.extendedParameters.postCropAdjustments={
  schemaVersion:1,engineVersion:'suite-srgb8-manual-vignette-1',vignette:{amount:-40}};return body;};

test('VIGNETTE-SYNC-SESSION01 / MOCK_STATE: unsaved source or target draft blocks every write',async()=>{
  let writes=0;
  const api={listAssets:async()=>assets,assertPermission:async()=>({authorized:true}),
    getRecipe:async()=>({revision:1,body:recipe()}),
    saveRecipe:async()=>{writes++;throw Error('SHOULD_NOT_WRITE');}};
  const session=new EditorSession({api,processing:{}});
  session.data.asset=assets[0];session.data.recipe=recipe();session.data.revision=1;
  session.proxy={width:1,height:1,data:new Uint8ClampedArray([80,80,80,255])};
  session.data.dirty=true;
  await assert.rejects(session.batchSyncVignette(ids.slice(1)),/VIGNETTE_SYNC_SOURCE_SAVE_REQUIRED/);
  session.data.dirty=false;
  session.storage={get:async id=>id==='first'?{dirty:true}:undefined,put:async()=>{}};
  await assert.rejects(session.batchSyncVignette(ids.slice(1)),/VIGNETTE_SYNC_TARGET_UNSAVED_DRAFT/);
  assert.equal(writes,0);
});

test('VIGNETTE-SYNC-SESSION02 / MOCK_STATE: changed SHA, denied edit, ambiguous write are not saved',async()=>{
  const source={id:'source',sha256:sha,revision:1};
  const targets=ids.slice(1).map(id=>({id,sha256:sha,revision:1}));
  const stored=new Map(ids.map(id=>[id,{revision:1,body:recipe()}]));
  let bad='sha';
  const api={
    listAssets:async()=>bad==='sha'?assets.map(asset=>asset.id==='first'?{...asset,sha256:'b'.repeat(64)}:asset):assets,
    getRecipe:async id=>stored.get(id),
    assertPermission:async id=>({authorized:!(bad==='permission'&&id==='first')}),
    saveRecipe:async(id,revision,body)=>{if(bad==='ambiguous'&&id==='first'){
      stored.set(id,{revision:revision+1,body});throw Error('NETWORK_LOST_AFTER_COMMIT');}
      const saved={revision:revision+1,body};stored.set(id,saved);return saved;},
  };
  for(const [mode,firstStatus] of [['sha','failed'],['permission','failed'],['ambiguous','unverified']]){
    bad=mode;
    const result=await applyBatchVignetteSync({api,source,targets,expectedSourceRecipe:recipe()});
    assert.equal(result.status,'partial');
    assert.equal(result.results[0].status,firstStatus);
    assert.equal(result.results[1].status,'saved');
    stored.set('first',{revision:1,body:recipe()});
    stored.set('second',{revision:1,body:recipe()});
  }
});
