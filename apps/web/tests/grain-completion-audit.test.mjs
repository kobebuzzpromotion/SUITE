import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGrain} from '../src/processing/grain.mjs';
import {EditorSession, neutralRecipe} from '../src/session.mjs';
import {applyBatchRecipe} from '../src/batch-edit.mjs';
import {createPresetFacade} from '../src/preset-facade.mjs';

const clone=value=>structuredClone(value);
const SOURCE='11111111-1111-4111-8111-111111111111';
const TARGET='22222222-2222-4222-8222-222222222222';
const SHA='a'.repeat(64);

function withGrain(amount,exposure){
  const body=neutralRecipe();
  body.parameters.exposure=exposure;
  body.parameters.extendedParameters.postDecodeAdjustments={
    schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',
    detail:{grain:{amount,seed:7,shadows:73,midtones:62,highlights:51,
      size:47,roughness:36,colorVariation:25}},
  };
  body.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  return body;
}

test('GRAIN-AUDIT-01: seven controls alter an owned raster without mutating input or alpha',()=>{
  const pixels={width:16,height:12,data:new Uint8ClampedArray(16*12*4)};
  for(let i=0;i<pixels.data.length;i+=4){
    const x=(i/4)%pixels.width,base=x<5?35:x<11?125:220;
    pixels.data[i]=base;pixels.data[i+1]=base-5;pixels.data[i+2]=base+5;pixels.data[i+3]=255;
  }
  const original=pixels.data.slice();
  const base={amount:75,shadows:75,midtones:75,highlights:75,
    size:30,roughness:30,colorVariation:30};
  const baseline=applyGrain(pixels,base,{seed:123});
  for(const field of Object.keys(base)){
    const altered=applyGrain(pixels,{...base,[field]:field==='amount'?40:5},{seed:123});
    assert.notDeepEqual(altered.data,baseline.data,`${field} must alter real output pixels`);
    for(let i=3;i<altered.data.length;i+=4)assert.equal(altered.data[i],255);
  }
  assert.deepEqual(pixels.data,original,'Grain never writes its input raster');
});

test('GRAIN-AUDIT-02: full-Recipe Batch remains distinct from the connected Grain-only Sync',async()=>{
  const saved=new Map([
    [SOURCE,{assetId:SOURCE,revision:2,body:withGrain(65,0)}],
    [TARGET,{assetId:TARGET,revision:3,body:withGrain(12,1)}],
  ]);
  const api={
    async listAssets(){return [{id:SOURCE,sha256:SHA},{id:TARGET,sha256:SHA}];},
    async getRecipe(id){return clone(saved.get(id));},
    async assertPermission(){return {authorized:true};},
    async saveRecipe(id,revision,body){
      assert.equal(saved.get(id).revision,revision);
      const next={assetId:id,revision:revision+1,body:clone(body)};
      saved.set(id,next);return clone(next);
    },
  };
  const result=await applyBatchRecipe({api,
    source:{id:SOURCE,sha256:SHA,revision:2},
    targets:[{id:TARGET,sha256:SHA,revision:3}]});
  assert.equal(result.status,'complete');
  assert.equal(saved.get(TARGET).body.parameters.extendedParameters.postDecodeAdjustments.detail.grain.amount,65);
  assert.equal(saved.get(TARGET).body.parameters.exposure,0,
    'full Batch replaced the target exposure; it cannot be called Grain-only Sync');
  assert.equal(typeof EditorSession.prototype.batchSyncGrain,'function',
    'the separate saved-source Grain-only product entry point is connected');
});

test('GRAIN-AUDIT-03: Community Preset is deliberately unavailable, not an Author alias',async()=>{
  const facade=createPresetFacade();
  await assert.rejects(facade.list({kind:'COMMUNITY'}),/COMMUNITY_NOT_IMPLEMENTED/);
  await assert.rejects(facade.reload({kind:'COMMUNITY',id:'example'}),/COMMUNITY_NOT_IMPLEMENTED/);
});
