import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Authentication, saved Recipe and non-RAW source are fixture-only. Final
// rendering and TIFF encoding below use the actual product browser Workers.
const assetID='44444444-4444-4444-8444-444444444444';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_TIFF_EDITOR_ORIGINAL').buffer;
const asset={id:assetID,name:'portrait.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const savedRecipe=neutralRecipe(),savedText=JSON.stringify(savedRecipe);
const saved={assetId:assetID,revision:2,body:savedRecipe};
function syntheticFrame(){
  const width=12,height=8,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;data.set([30+x*12,50+y*14,100+x+y,255],at);
  }
  return {width,height,data};
}
const cache={asset:structuredClone(asset),proxy:syntheticFrame(),history:[structuredClone(savedRecipe)],
  cursor:0,revision:2,reference:null,dirty:false};
const api={
  async listAssets(){return [structuredClone(asset)];},
  async getRecipe(id){return id===assetID?structuredClone(saved):null;},
  async assertPermission(id,action){if(id!==assetID||action!=='export')throw Error('FIXTURE_PERMISSION_DENIED');return {authorized:true};},
  async getOriginal(id){if(id!==assetID)throw Error('FIXTURE_ASSET_UNKNOWN');return original.slice(0);},
  async saveRecipe(){throw Error('FIXTURE_WRITE_FORBIDDEN');}
};
const storage={async get(id){return id===assetID?structuredClone(cache):undefined;},
  async put(){throw Error('FIXTURE_WRITE_FORBIDDEN');}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
let holdFinal=false,decodeStarted=false,finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(bytes,{mode,signal}={}){
  if(mode!=='final'||new TextDecoder().decode(bytes)!=='SYNTHETIC_NON_RAW_TIFF_EDITOR_ORIGINAL')
    throw Error('FIXTURE_NON_RAW_FINAL_ONLY');
  finalDecodeCount++;
  if(holdFinal){decodeStarted=true;await new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Fixture cancelled','AbortError'));return;}
    signal?.addEventListener('abort',()=>reject(new DOMException('Fixture cancelled','AbortError')),{once:true});
  });}
  return {pixels:syntheticFrame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(assetID);
const exportCalls=[];
const actualExport=session.exportFinal.bind(session);
session.exportFinal=async args=>{exportCalls.push(structuredClone(args));return actualExport(args);};
const blobRegistry=new Map(),clicks=[];
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobRegistry.set(url,blob);return url;};
const nativeClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.id==='download-link'&&this.download&&this.href.startsWith('blob:')){
    clicks.push({name:this.download,href:this.href});return;
  }
  return nativeClick.apply(this,args);
};
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'TIFF Browser Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const verdict=document.querySelector('#probe-verdict');
const expect=(value,label)=>{if(!value)throw Error(`TIFF_EDITOR_BROWSER_ASSERTION: ${label}`);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,20));
async function waitFor(predicate,label){const until=performance.now()+15000;
  while(!predicate()){if(performance.now()>until)throw Error(`TIFF_EDITOR_BROWSER_TIMEOUT: ${label}`);await sleep();}}
const byID=selector=>document.querySelector(selector);
const select=(selector,value)=>{const input=byID(selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
const input=(selector,value)=>{const field=byID(selector);field.value=String(value);field.dispatchEvent(new Event('input',{bubbles:true}));};
const button=()=>byID('[data-action="export-tiff"]');
const link=()=>byID('#download-link');
function inspectTIFF(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer);
  expect(bytes[0]===73&&bytes[1]===73&&view.getUint16(2,true)===42,'TIFF header');
  const u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true),ifd=u32(4),count=u16(ifd),tags=new Map();
  expect(count>=13&&ifd+2+count*12+4<=bytes.length,'IFD bounds');
  for(let i=0;i<count;i++){
    const at=ifd+2+i*12,type=u16(at+2),n=u32(at+4),length=n*(type===3?2:type===5?8:4);
    const valueAt=length>4?u32(at+8):at+8;
    expect(valueAt+Math.min(length,4)<=bytes.length,'IFD value bounds');
    tags.set(u16(at),{valueAt,value:type===3?u16(valueAt):u32(valueAt)});
  }
  const density=tag=>{const at=tags.get(tag)?.valueAt;expect(at+8<=bytes.length,'density bounds');return [u32(at),u32(at+4)];};
  return {tags,density};
}
async function unchanged(){
  const bytes=await api.getOriginal(assetID);
  expect(await checksum(bytes)===asset.sha256,'Original SHA unchanged');
  expect(JSON.stringify(saved.body)===savedText&&JSON.stringify(session.state.recipe)===savedText&&
    session.state.revision===2&&!session.state.dirty,'saved and current Recipe unchanged');
}
async function checkExport(unit,value){
  select('#export-resolution-unit',unit);input('#export-resolution-value',value);
  expect(!button().disabled,`${unit} TIFF button enabled`);
  const before=exportCalls.length,beforeClicks=clicks.length;
  button().click();
  await waitFor(()=>exportCalls.length===before+1&&clicks.length===beforeClicks+1,`${unit} Final completion`);
  const args=exportCalls.at(-1),download=link(),blob=blobRegistry.get(download.href);
  expect(args.format==='tiff'&&args.quality===0.95&&args.resolution?.unit===unit&&
    args.resolution?.value===value,`${unit} Editor to Session TIFF options`);
  expect(!download.hidden&&blob instanceof Blob&&blob.type==='image/tiff'&&blob.size>0,
    `${unit} actual Worker Blob linked`);
  expect(download.download.endsWith('.tif')&&!/[\\/\u0000-\u001f]/.test(download.download)&&
    !download.download.startsWith('.')&&clicks.at(-1).name===download.download&&
    clicks.at(-1).href===download.href,`${unit} safe .tif filename and triggered link`);
  const parsed=inspectTIFF(await blob.arrayBuffer()),tag=id=>parsed.tags.get(id)?.value;
  expect(tag(256)===12&&tag(257)===8&&tag(258)===8&&tag(259)===1&&tag(262)===2&&
    tag(277)===4&&tag(338)===2&&tag(296)===(unit==='ppi'?2:3),
    `${unit} dimensions, 8-bit uncompressed sRGB RGBA tags`);
  for(const id of [282,283])expect(JSON.stringify(parsed.density(id))===JSON.stringify([value,1]),
    `${unit} density numerator and denominator`);
  await unchanged();
  return {unit,value,name:download.download,bytes:blob.size,mime:blob.type,
    width:tag(256),height:tag(257),bits:tag(258),compression:tag(259)};
}
async function run(){
  const results=[];
  expect(session.state.asset?.id===assetID&&!session.state.dirty&&session.state.revision===2,
    'synthetic saved authenticated Editor source');
  // Invalid controls must not call Session or produce a link.
  select('#export-resolution-unit','ppi');input('#export-resolution-value',0);
  expect(button().disabled&&exportCalls.length===0&&clicks.length===0,'zero PPI disables TIFF Final');
  input('#export-resolution-value',70000);
  expect(button().disabled&&exportCalls.length===0,'oversized PPI disables TIFF Final');
  input('#export-resolution-value',300);
  // Hold fixture-only decoding to exercise the product UI/Session cancel path
  // before an actual Final Blob exists. Positive cases below use actual Workers.
  holdFinal=true;button().click();
  await waitFor(()=>decodeStarted&&session.state.exporting,'Final in progress');
  expect(!byID('[data-action="cancel-export"]').hidden,'cancel button visible while exporting');
  byID('[data-action="cancel-export"]').click();
  await waitFor(()=>!session.state.exporting,'Final cancelled');
  holdFinal=false;
  expect(clicks.length===0&&(!link().href||link().hidden),'cancel produces no download link');
  await unchanged();
  // Unsafe custom text exercises the real safe naming path for each TIFF link.
  select('#export-name-method','original-custom');input('#export-name-custom','unsafe/..\\TIFF');
  results.push(await checkExport('ppi',300));
  results.push(await checkExport('ppc',118));
  expect(results.length===2&&clicks.length===2&&finalDecodeCount===3,
    'two actual TIFF Finals plus one cancelled attempt');
  verdict.textContent=JSON.stringify({status:'PASS',boundary:'synthetic saved non-RAW Editor UI -> Session -> real Worker -> TIFF Blob -> safe .tif link',
    results,invalid:'zero and >65535 PPI disabled before Session',cancel:'no partial Blob link',
    originalSHA:asset.sha256,recipeRevision:2,userAgent:navigator.userAgent});
  dispose();worker.dispose();
}
byID('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error),
    sessionError:session.state.error,exportCalls,clicks,finalDecodeCount,
    note:byID('#export-settings-note')?.textContent});});
});
