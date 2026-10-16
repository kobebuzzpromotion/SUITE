import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession,checksum,neutralRecipe} from '../src/session.mjs';
import {validateOutputSharpening,applyExportOutputSharpening} from '../src/export-output-adjustments.mjs';
import {resizeExportPixels} from '../src/export-size.mjs';

const official=[
  ['screen','low'],['screen','standard'],['screen','high'],
  ['print','low'],['print','standard'],['print','high']
];
const manual={kind:'manual',gain:1.5,radiusPx:1,thresholdLuma:0};
const clone=value=>structuredClone(value);
function frame(id){
  const width=16,height=8,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const value=(Math.floor(x/4)+Math.floor(y/4))%2?210:35;
    data.set([value,id==='a'?value:Math.min(255,value+15),value,255],(y*width+x)*4);
  }
  return {width,height,data};
}
async function fixture(){
  const originals=new Map([['a',new TextEncoder().encode('AUDIT_SYNTHETIC_NON_RAW_A').buffer],
    ['b',new TextEncoder().encode('AUDIT_SYNTHETIC_NON_RAW_B').buffer]]);
  const assets=[];
  for(const [id,bytes] of originals)assets.push({id,name:`${id}.NONRAW`,sha256:await checksum(bytes),
    size:bytes.byteLength,deletedAt:null,cloudSafe:true});
  const remote=new Map(assets.map(asset=>[asset.id,{assetId:asset.id,revision:2,body:neutralRecipe()}]));
  const cache=new Map(assets.map(asset=>[asset.id,{asset:clone(asset),proxy:frame(asset.id),
    history:[neutralRecipe()],cursor:0,revision:2,reference:null,dirty:false}]));
  const calls=[],api={
    async listAssets(){return clone(assets);},
    async getRecipe(id){return clone(remote.get(id)??null);},
    async assertPermission(id,action){if(!originals.has(id)||action!=='export')throw Error('AUDIT_PERMISSION_DENIED');return {authorized:true};},
    async getOriginal(id){return originals.get(id)?.slice(0);},
    async saveRecipe(){calls.push('saveRecipe');throw Error('AUDIT_WRITE_FORBIDDEN');}
  };
  const storage={async get(id){return clone(cache.get(id));},async put(){throw Error('AUDIT_WRITE_FORBIDDEN');}};
  const processing={syntheticTestOnly:true,
    async decodeRaw(bytes,{mode}={}){
      calls.push('decode');
      if(mode!=='final')throw Error('AUDIT_FINAL_ONLY');
      const content=new TextDecoder().decode(bytes),id=content.endsWith('_A')?'a':content.endsWith('_B')?'b':null;
      if(!id)throw Error('AUDIT_NON_RAW_ONLY');
      return {pixels:frame(id),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
    },
    async makeProxy(pixels){return pixels;},
    async render(pixels){calls.push('render');return pixels;},
    async resizeForExport(pixels,size){calls.push('resize');return resizeExportPixels(pixels,size);},
    async applyExportOutputSharpening(pixels,settings){calls.push('sharpen');return applyExportOutputSharpening(pixels,settings);},
    async encode(pixels,{format}){calls.push('encode');return new Blob([pixels.data],{type:`image/${format}`});}
  };
  const session=new EditorSession({api,storage,processing,urlAPI:{createObjectURL:()=> 'blob:audit',revokeObjectURL(){}},
    personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
  await session.initialize();await session.openAsset('a');calls.length=0;
  return {session,calls,remote,originals,assets};
}

test('OUTPUT-AUDIT-01 / official six named Screen or Print strengths are not silently mapped to SUITE manual values',async()=>{
  const context=await fixture(),{session,calls}=context;
  assert.deepEqual(validateOutputSharpening({kind:'none'}),{kind:'none'});
  assert.deepEqual(validateOutputSharpening(manual),manual);
  for(const [medium,strength] of official){
    const requested={kind:medium,strength};
    assert.throws(()=>validateOutputSharpening(requested),/OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
    await assert.rejects(session.exportFinal({format:'png',outputSharpening:requested}),
      /OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
    await assert.rejects(session.exportBatchFinal({orderedIds:['a','b'],format:'png',outputSharpening:requested}),
      /OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
  }
  assert.deepEqual(calls,[],'unsupported presets must fail before decode/render/encode/save');
});

test('OUTPUT-AUDIT-02 / SUITE manual is export-only after resize in single and Batch, with Original and saved Recipe intact',async()=>{
  const {session,calls,remote,originals,assets}=await fixture();
  const recipeBefore=new Map([...remote].map(([id,row])=>[id,JSON.stringify(row.body)]));
  const normal=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50}})).arrayBuffer());
  calls.length=0;
  const sharpened=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50},
    outputSharpening:manual})).arrayBuffer());
  assert.notDeepEqual(sharpened,normal,'manual changes the output pixels');
  assert.deepEqual(calls.filter(value=>['resize','sharpen','encode'].includes(value)),['resize','sharpen','encode']);
  calls.length=0;
  const batch=await session.exportBatchFinal({orderedIds:['b','a'],format:'png',size:{kind:'percentage',value:50},
    outputSharpening:manual});
  assert.equal(batch.status,'complete');assert.deepEqual(batch.items.map(item=>item.assetId),['b','a']);
  assert.deepEqual(calls.filter(value=>['resize','sharpen','encode'].includes(value)),
    ['resize','sharpen','encode','resize','sharpen','encode']);
  assert.equal(calls.includes('saveRecipe'),false);
  for(const asset of assets){
    assert.equal(JSON.stringify(remote.get(asset.id).body),recipeBefore.get(asset.id));
    assert.equal(Object.hasOwn(remote.get(asset.id).body.parameters.extendedParameters,'outputSharpening'),false);
    assert.equal(await checksum(originals.get(asset.id)),asset.sha256);
  }
  assert.equal(session.state.revision,2);assert.equal(session.state.dirty,false);
});
