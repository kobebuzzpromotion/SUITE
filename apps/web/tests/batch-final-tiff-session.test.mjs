import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession,checksum,neutralRecipe,MAX_BATCH_FINAL_BYTES,MAX_BATCH_FINAL_ITEMS} from '../src/session.mjs';

const copy=value=>structuredClone(value);
const pixels=()=>({width:2,height:1,data:new Uint8ClampedArray([30,60,90,255,120,150,180,255])});
async function fixture(count=2){
  const originals=new Map(),assets=[],recipes=new Map(),cache=new Map(),calls=[];
  for(let index=0;index<count;index++){
    const id=`asset-${index+1}`,bytes=new TextEncoder().encode(`TIFF_BATCH_SYNTHETIC_NON_RAW_${id}`).buffer;
    originals.set(id,bytes);
    const asset={id,name:`${id}.NONRAW`,sha256:await checksum(bytes),size:bytes.byteLength,deletedAt:null,cloudSafe:true};
    assets.push(asset);recipes.set(id,{assetId:id,revision:2,body:neutralRecipe()});
    cache.set(id,{asset:copy(asset),proxy:pixels(),history:[neutralRecipe()],cursor:0,revision:2,reference:null,dirty:false});
  }
  const api={
    async listAssets(){calls.push('list');return copy(assets);},
    async getRecipe(id){calls.push(`recipe:${id}`);return copy(recipes.get(id)??null);},
    async assertPermission(id,action){calls.push(`permission:${id}:${action}`);return {authorized:true};},
    async getOriginal(id){calls.push(`original:${id}`);return originals.get(id)?.slice(0);},
    async saveRecipe(){throw Error('FIXTURE_WRITE_FORBIDDEN');}
  };
  const storage={async get(id){calls.push(`cache:${id}`);return copy(cache.get(id));},
    async put(){throw Error('FIXTURE_WRITE_FORBIDDEN');}};
  const processing={syntheticTestOnly:true,
    async decodeRaw(_bytes,{mode}={}){calls.push(`decode:${mode}`);return {pixels:pixels(),provenance:{fixture:'NON_RAW'}};},
    async makeProxy(frame){return frame;},
    async render(frame){calls.push('render');return frame;},
    async encode(frame,options){calls.push(`encode:${options.format}`);calls.push({options:copy({...options,signal:undefined})});
      return new Blob([frame.data],{type:options.format==='tiff'?'image/tiff':`image/${options.format}`});}
  };
  const session=new EditorSession({api,storage,processing,
    urlAPI:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset(assets[0].id);calls.length=0;
  return {session,api,processing,storage,originals,assets,recipes,cache,calls};
}

test('TIFF-BATCH01 / saved explicit queue keeps two TIFF Blobs ordered with PPI/PPC and fixed Originals',async()=>{
  const f=await fixture(),orderedIds=['asset-2','asset-1'],before=f.session.state;
  for(const resolution of [{unit:'ppi',value:300},{unit:'ppc',value:118}]){
    const result=await f.session.exportBatchFinal({orderedIds,format:'tiff',resolution});
    assert.equal(result.status,'complete');
    assert.deepEqual(result.plan.map(row=>[row.assetId,row.sequence,row.total]),
      [['asset-2',1,2],['asset-1',2,2]]);
    assert.deepEqual(result.items.map(row=>[row.assetId,row.blob.type]),
      [['asset-2','image/tiff'],['asset-1','image/tiff']]);
    assert.equal(result.totalBytes,result.items.reduce((sum,row)=>sum+row.blob.size,0));
    const sent=f.calls.filter(call=>typeof call==='object').map(call=>call.options);
    assert.equal(sent.length,2);
    assert.ok(sent.every(options=>options.format==='tiff'&&options.quality===0.95&&
      options.resolution.unit===resolution.unit&&options.resolution.value===resolution.value));
    assert.equal(f.session.state.asset.id,before.asset.id);
    assert.deepEqual(f.session.state.recipe,before.recipe);
    assert.equal(f.session.state.dirty,false);
    assert.equal(f.session.state.exporting,false);
    for(const asset of f.assets){
      assert.equal(await checksum(f.originals.get(asset.id)),asset.sha256);
      assert.deepEqual(f.recipes.get(asset.id).body,neutralRecipe());
    }
    f.calls.length=0;
  }
});

test('TIFF-BATCH02 / unsupported quality, revoked permission, stale Recipe and changed second Original release no items',async()=>{
  const invalid=await fixture();
  await assert.rejects(invalid.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff',quality:1}),
    /EXPORT_SETTINGS_UNSUPPORTED/);
  assert.equal(invalid.calls.length,0);
  const permission=await fixture();let checks=0;
  permission.api.assertPermission=async(id,action)=>{
    permission.calls.push(`permission:${id}:${action}`);
    return {authorized:id!=='asset-2'||++checks<3};
  };
  await assert.rejects(permission.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'}),
    /EXPORT_BATCH_PERMISSION_DENIED/);
  // Revocation on the first item's post-encode recheck must discard that
  // internal Blob instead of treating it as a partial successful batch.
  assert.equal(permission.calls.filter(call=>call==='encode:tiff').length,1);
  assert.equal(permission.session.state.exporting,false);
  const stale=await fixture();let reads=0;
  stale.api.getRecipe=async id=>{
    stale.calls.push(`recipe:${id}`);
    const record=copy(stale.recipes.get(id));if(id==='asset-2'&&++reads===2)record.revision=3;return record;
  };
  await assert.rejects(stale.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'}),
    /EXPORT_BATCH_FIXED_RECIPE_MISMATCH/);
  assert.equal(stale.calls.some(call=>call==='encode:tiff'),false);
  const tampered=await fixture(),originalGet=tampered.api.getOriginal.bind(tampered.api);
  tampered.api.getOriginal=async id=>id==='asset-1'?new Uint8Array([9,9,9]).buffer:originalGet(id);
  await assert.rejects(tampered.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'}),
    /RAW_CHECKSUM_MISMATCH/);
  assert.equal(tampered.calls.filter(call=>call==='encode:tiff').length,1);
  assert.equal(tampered.session.state.asset.id,'asset-1');
});

test('TIFF-BATCH03 / portrait candidate, oversize result and cancellation remain fail-closed',async()=>{
  const portrait=await fixture();
  portrait.cache.get('asset-2').history[0].parameters.extendedParameters.portrait={};
  await assert.rejects(portrait.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'}),
    /EXPORT_BATCH_PERSON_REVIEW_REQUIRED/);
  assert.equal(portrait.calls.some(call=>call==='decode:final'),false);
  const oversized=await fixture();
  class HugeTIFF extends Blob{get size(){return MAX_BATCH_FINAL_BYTES;}}
  oversized.processing.encode=async()=>new HugeTIFF([1],{type:'image/tiff'});
  await assert.rejects(oversized.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'}),
    /EXPORT_BATCH_TOTAL_BYTES_EXCEEDED/);
  assert.equal(oversized.session.state.exporting,false);
  const cancelled=await fixture();let entered;const started=new Promise(resolve=>{entered=resolve;});
  cancelled.processing.decodeRaw=async(_bytes,{signal}={})=>{
    entered();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
    return {pixels:pixels()};
  };
  const pending=cancelled.session.exportBatchFinal({orderedIds:['asset-2','asset-1'],format:'tiff'});
  await started;cancelled.session.cancelExport();
  await assert.rejects(pending,/cancelled/);
  assert.equal(cancelled.calls.some(call=>call==='encode:tiff'),false);
  assert.equal(cancelled.session.state.exporting,false);
});

test('TIFF-BATCH04 / full twenty-item limit and existing JPEG/PNG MIME paths remain available',async()=>{
  const twenty=await fixture(MAX_BATCH_FINAL_ITEMS);
  const orderedIds=twenty.assets.map(asset=>asset.id).toReversed();
  const result=await twenty.session.exportBatchFinal({orderedIds,format:'tiff'});
  assert.equal(result.items.length,MAX_BATCH_FINAL_ITEMS);
  assert.deepEqual(result.items.map(row=>row.assetId),orderedIds);
  await assert.rejects(twenty.session.exportBatchFinal({orderedIds:[...orderedIds,'asset-1'],format:'tiff'}),
    /EXPORT_BATCH_TOO_LARGE/);
  const legacy=await fixture();
  for(const format of ['jpeg','png']){
    const output=await legacy.session.exportBatchFinal({orderedIds:['asset-1','asset-2'],format});
    assert.deepEqual(output.items.map(row=>row.blob.type),[`image/${format}`,`image/${format}`]);
  }
});
