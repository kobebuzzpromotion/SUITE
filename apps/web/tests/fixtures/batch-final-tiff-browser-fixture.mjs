import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Two saved synthetic non-RAW Assets. The actual Editor, Session and browser
// Workers run unchanged; this is not production Auth, Cloud or camera RAW QA.
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const originals=new Map([[a,new TextEncoder().encode('BATCH_TIFF_NON_RAW_A').buffer],
  [b,new TextEncoder().encode('BATCH_TIFF_NON_RAW_B').buffer]]);
const assets=[];
for(const [id,bytes] of originals)assets.push({id,name:id===a?'first.NONRAW':'second.NONRAW',
  sha256:await checksum(bytes),size:bytes.byteLength,deletedAt:null,cloudSafe:true});
const recipes=new Map(assets.map(asset=>[asset.id,{assetId:asset.id,revision:2,body:neutralRecipe()}]));
const recipeSnapshots=new Map([...recipes].map(([id,row])=>[id,JSON.stringify(row.body)]));
const frame=(base=40)=>{
  const width=12,height=8,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([base+x*5,base+y*7,140,255],(y*width+x)*4);
  return {width,height,data};
};
const caches=new Map(assets.map(asset=>[asset.id,{asset:structuredClone(asset),
  proxy:frame(asset.id===a?40:80),history:[neutralRecipe()],cursor:0,revision:2,reference:null,dirty:false}]));
let scenario='success',decodeCount=0,encodeCount=0;
const api={
  async listAssets(){return structuredClone(assets);},
  async getRecipe(id){return structuredClone(recipes.get(id)??null);},
  async assertPermission(id,action){if(!originals.has(id)||action!=='export')throw Error('FIXTURE_PERMISSION_DENIED');return {authorized:true};},
  async getOriginal(id){
    if(scenario==='fail-second'&&id===a&&decodeCount>=1)return new Uint8Array([1,2,3]).buffer;
    return originals.get(id)?.slice(0);
  },
  async saveRecipe(){throw Error('FIXTURE_WRITE_FORBIDDEN');}
};
const storage={async get(id){return structuredClone(caches.get(id));},
  async put(){throw Error('FIXTURE_WRITE_FORBIDDEN');}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
const processing={...worker,syntheticTestOnly:true,
  async decodeRaw(bytes,{mode,signal}={}){
    if(mode!=='final'||![...originals.values()].some(source=>
      new TextDecoder().decode(source)===new TextDecoder().decode(bytes)))throw Error('FIXTURE_NON_RAW_ONLY');
    decodeCount++;
    if(scenario==='hold-cancel')await new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(new DOMException('cancelled','AbortError'));return;}
      signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
    });
    return {pixels:frame(decodeCount%2?80:40),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
  },
  async encode(pixels,options){encodeCount++;return worker.encode(pixels,options);}
};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(a);
const calls=[];const actualExport=session.exportBatchFinal.bind(session);
session.exportBatchFinal=async options=>{calls.push(structuredClone(options));return actualExport(options);};
const blobs=new Map(),revoked=[];
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>{revoked.push(url);return revokeURL(url);};
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Batch TIFF Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const verdict=document.querySelector('#probe-verdict');
const expect=(value,label)=>{if(!value)throw Error(`BATCH_TIFF_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){const until=performance.now()+15000;
  while(!predicate()){if(performance.now()>until)throw Error(`BATCH_TIFF_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));}}
const byID=selector=>document.querySelector(selector);
const select=(selector,value)=>{const control=byID(selector);control.value=value;
  control.dispatchEvent(new Event('change',{bubbles:true}));};
const input=(selector,value)=>{const control=byID(selector);control.value=String(value);
  control.dispatchEvent(new Event('input',{bubbles:true}));};
const choose=id=>byID(`#batch-final-assets input[value="${id}"]`).click();
const links=()=>[...document.querySelectorAll('#batch-final-downloads a')];
const status=()=>byID('#batch-final-status').textContent;
function tiff(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  expect(bytes[0]===73&&bytes[1]===73&&u16(2)===42,'TIFF header');
  const ifd=u32(4),count=u16(ifd),tags=new Map();
  expect(count>=13&&ifd+2+count*12+4<=bytes.length,'TIFF IFD bounds');
  for(let i=0;i<count;i++){
    const at=ifd+2+i*12,type=u16(at+2),n=u32(at+4),length=n*(type===3?2:type===5?8:4);
    const valueAt=length>4?u32(at+8):at+8;
    expect(valueAt+Math.min(length,4)<=bytes.length,'TIFF tag bounds');
    tags.set(u16(at),{value:type===3?u16(valueAt):u32(valueAt),at:valueAt});
  }
  const value=id=>tags.get(id)?.value,density=id=>[u32(tags.get(id).at),u32(tags.get(id).at+4)];
  return {value,density};
}
async function unchanged(){
  for(const asset of assets){
    expect(await checksum(originals.get(asset.id))===asset.sha256,`${asset.id} Original SHA unchanged`);
    expect(JSON.stringify(recipes.get(asset.id).body)===recipeSnapshots.get(asset.id),
      `${asset.id} saved Recipe unchanged`);
  }
  expect(session.state.asset?.id===a&&!session.state.dirty&&session.state.revision===2,
    'current selection and saved revision unchanged');
}
async function successful(unit,value){
  scenario='success';decodeCount=0;encodeCount=0;
  select('#export-resolution-unit',unit);input('#export-resolution-value',value);
  expect(!byID('#batch-final-start').disabled,`${unit} Batch TIFF enabled`);
  byID('#batch-final-start').click();
  await waitFor(()=>status().includes('2件すべてのFinal'),`${unit} two-item completion`);
  const shown=links(),args=calls.at(-1);
  expect(args.format==='tiff'&&args.quality===0.95&&args.resolution?.unit===unit&&
    args.resolution.value===value&&JSON.stringify(args.orderedIds)===JSON.stringify([b,a]),
    `${unit} exact UI -> Session options and explicit order`);
  expect(shown.length===2&&encodeCount===2,`${unit} all-or-nothing two Worker encodes and links`);
  const reports=[];
  for(let i=0;i<shown.length;i++){
    const anchor=shown[i],blob=blobs.get(anchor.href),header=tiff(await blob.arrayBuffer());
    expect(blob instanceof Blob&&blob.type==='image/tiff'&&blob.size>0,`${unit} TIFF Blob`);
    const stem=`Suite_.._TIFF_${String(i+1).padStart(3,'0')}`;
    // The second batch must not overwrite the first batch's suggested name.
    const expectedName=`${stem}${unit==='ppc'?'_01':''}.tif`;
    expect(anchor.download===expectedName&&
      !/[\\/\u0000-\u001f]/.test(anchor.download),`${unit} safe ordered .tif name`);
    expect(header.value(256)===12&&header.value(257)===8&&header.value(258)===8&&
      header.value(259)===1&&header.value(277)===4&&header.value(296)===(unit==='ppi'?2:3),
      `${unit} real TIFF dimensions, bit depth, compression and unit`);
    for(const id of [282,283])expect(JSON.stringify(header.density(id))===JSON.stringify([value,1]),
      `${unit} density tag ${id}`);
    reports.push({name:anchor.download,mime:blob.type,bytes:blob.size,assetId:i===0?b:a});
  }
  await unchanged();
  return {unit,value,files:reports,urls:shown.map(link=>link.href)};
}
async function run(){
  choose(b);choose(a);
  expect(byID('#batch-final-selection').textContent.includes('second.NONRAW → 2. first.NONRAW'),
    'manual b-then-a order');
  select('#batch-final-format','tiff');select('#batch-final-naming','custom-sequence');
  input('#batch-final-custom','Suite/..\\TIFF');
  select('#export-resolution-unit','ppi');input('#export-resolution-value',0);
  expect(byID('#batch-final-start').disabled&&calls.length===0,'zero density rejects before Session');
  input('#export-resolution-value',70000);
  expect(byID('#batch-final-start').disabled&&calls.length===0,'oversize density rejects before Session');
  input('#export-resolution-value',300);
  const results=[];
  results.push(await successful('ppi',300));
  results.push(await successful('ppc',118));

  scenario='fail-second';decodeCount=0;encodeCount=0;
  byID('#batch-final-start').click();
  await waitFor(()=>status().includes('完了していません'),'second Original failure');
  expect(encodeCount===1&&links().length===0,'one internal Blob but zero partial links');
  await unchanged();

  scenario='hold-cancel';decodeCount=0;encodeCount=0;
  byID('#batch-final-start').click();
  await waitFor(()=>decodeCount===1&&session.state.exporting,'Batch Final held before Worker');
  byID('#batch-final-cancel').click();
  await waitFor(()=>status().includes('完了していません'),'cancelled Batch Final');
  expect(encodeCount===0&&links().length===0,'cancel leaves zero links');
  await unchanged();

  const earlier=results.flatMap(result=>result.urls);
  expect(earlier.every(url=>revoked.includes(url)),'new Batch runs revoke earlier URLs');
  verdict.textContent=JSON.stringify({status:'PASS',boundary:'synthetic saved non-RAW Editor -> Session -> real Workers -> complete TIFF batch links',
    userAgent:navigator.userAgent,results:results.map(({urls,...rest})=>rest),
    invalid:'0 and 70000 density blocked',failure:'second Original mismatch yields zero links',
    cancellation:'zero links',originals:'SHA unchanged',recipes:'revision 2 unchanged'});
  dispose();worker.dispose();
}
byID('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error),
    sessionError:session.state.error,uiStatus:status(),calls,decodeCount,encodeCount,linkCount:links().length});});
});
