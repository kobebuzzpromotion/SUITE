import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Actual Editor/Session/Worker, but synthetic saved non-RAW bytes and fixture
// authorization. This does not certify camera RAW, Cloud, or proprietary presets.
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const originals=new Map([[a,new TextEncoder().encode('OUTPUT_NON_RAW_A').buffer],
  [b,new TextEncoder().encode('OUTPUT_NON_RAW_B').buffer]]);
const assets=[];
for(const [id,bytes] of originals)assets.push({id,name:id===a?'first.NONRAW':'second.NONRAW',
  sha256:await checksum(bytes),size:bytes.byteLength,deletedAt:null,cloudSafe:true});
const recipes=new Map(assets.map(asset=>[asset.id,{assetId:asset.id,revision:2,body:neutralRecipe()}]));
const recipeSnapshots=new Map([...recipes].map(([id,row])=>[id,JSON.stringify(row.body)]));
function frame(id){
  const width=24,height=18,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=(x+y)%4<2?38:213;
    data.set([n,id===a?Math.min(255,n+15):Math.max(0,n-15),n,255],(y*width+x)*4);
  }
  return {width,height,data};
}
const caches=new Map(assets.map(asset=>[asset.id,{asset:structuredClone(asset),proxy:frame(asset.id),
  history:[neutralRecipe()],cursor:0,revision:2,reference:null,dirty:false}]));
let scenario='success',decodeCount=0,encodeCount=0;
const api={
  async listAssets(){return structuredClone(assets);},
  async getRecipe(id){return structuredClone(recipes.get(id)??null);},
  async assertPermission(id,action){if(!originals.has(id)||action!=='export')throw Error('FIXTURE_PERMISSION_DENIED');return {authorized:true};},
  async getOriginal(id){return originals.get(id)?.slice(0);},
  async saveRecipe(){throw Error('FIXTURE_WRITE_FORBIDDEN');}
};
const storage={async get(id){return structuredClone(caches.get(id));},
  async put(){throw Error('FIXTURE_WRITE_FORBIDDEN');}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
const processing={...worker,syntheticTestOnly:true,
  async decodeRaw(bytes,{mode,signal}={}){
    if(mode!=='final')throw Error('FIXTURE_NON_RAW_ONLY');
    const text=new TextDecoder().decode(bytes),id=text==='OUTPUT_NON_RAW_A'?a:text==='OUTPUT_NON_RAW_B'?b:null;
    if(!id)throw Error('FIXTURE_NON_RAW_ONLY');
    decodeCount++;
    if(scenario==='fail-first'&&decodeCount===1)throw Error('FIXTURE_FIRST_DECODE_FAILED');
    if(scenario==='fail-second'&&decodeCount===2)throw Error('FIXTURE_SECOND_DECODE_FAILED');
    if(scenario==='hold-cancel')await new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(new DOMException('cancelled','AbortError'));return;}
      signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
    });
    return {pixels:frame(id),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
  },
  async encode(pixels,options){encodeCount++;return worker.encode(pixels,options);}
};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(a);
const singleCalls=[],batchCalls=[];
const actualSingle=session.exportFinal.bind(session),actualBatch=session.exportBatchFinal.bind(session);
session.exportFinal=async options=>{singleCalls.push(structuredClone(options));return actualSingle(options);};
session.exportBatchFinal=async options=>{batchCalls.push(structuredClone(options));return actualBatch(options);};
const blobs=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
const realClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){autoClicks.push({href:this.href,download:this.download});};
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Output Fixture Owner',role:'author',trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});
const verdict=document.querySelector('#probe-verdict'),byID=selector=>document.querySelector(selector);
const expect=(value,label)=>{if(!value)throw Error(`OUTPUT_SHARPENING_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){const until=performance.now()+15000;
  while(!predicate()){if(performance.now()>until)throw Error(`OUTPUT_SHARPENING_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));}}
const select=(selector,value)=>{const control=byID(selector);control.value=value;
  control.dispatchEvent(new Event('change',{bubbles:true}));};
const input=(element,value)=>{element.value=String(value);element.dispatchEvent(new Event('input',{bubbles:true}));};
const singleForm=byID('.export-section .suite-export-output-form');
const batchForm=byID('.batch-final-section .suite-export-output-form');
const batchLinks=()=>[...document.querySelectorAll('#batch-final-downloads a')];
const manual=form=>{form.querySelector('input[value="manual"]').click();};
const submit=form=>form.querySelector('button[type="submit"]').click();
function tiffPixels(blob){return blob.arrayBuffer().then(buffer=>{
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  expect(bytes[0]===73&&bytes[1]===73&&u16(2)===42,'TIFF header');
  const ifd=u32(4),count=u16(ifd),tags=new Map();
  for(let i=0;i<count;i++){const at=ifd+2+i*12;tags.set(u16(at),{type:u16(at+2),count:u32(at+4),value:u32(at+8)});}
  const offset=tags.get(273)?.value,length=tags.get(279)?.value;
  expect(Number.isInteger(offset)&&Number.isInteger(length)&&length>0&&offset+length<=bytes.length,'TIFF strip bounds');
  return bytes.slice(offset,offset+length);
});}
async function pixelBytes(blob){
  if(blob.type==='image/tiff')return tiffPixels(blob);
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
  const pixels=context.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return new Uint8Array(pixels);
}
async function differs(left,right,label){
  const a=await pixelBytes(left),b=await pixelBytes(right);
  expect(a.length===b.length&&a.some((value,index)=>value!==b[index]),
    `${label}; lengths=${a.length}/${b.length}; first=${[...a.slice(0,20)]}/${[...b.slice(0,20)]}`);
}
async function unchanged(){
  for(const asset of assets){
    expect(await checksum(originals.get(asset.id))===asset.sha256,`${asset.id} Original SHA unchanged`);
    expect(JSON.stringify(recipes.get(asset.id).body)===recipeSnapshots.get(asset.id),`${asset.id} saved Recipe unchanged`);
  }
  expect(session.state.asset?.id===a&&!session.state.dirty&&session.state.revision===2,'Editor saved state unchanged');
}
async function single(format){
  scenario='success';select('#single-output-format',format);
  singleForm.querySelector('input[value="none"]').click();
  let before=singleCalls.length;submit(singleForm);
  await waitFor(()=>singleCalls.length===before+1&&byID('#download-link').href.startsWith('blob:')&&
    singleForm.getAttribute('aria-busy')==='false',`${format} single no-sharpen`);
  const none=blobs.get(byID('#download-link').href);
  expect(singleCalls.at(-1).outputSharpening.kind==='none',`${format} single none option`);
  manual(singleForm);
  input(singleForm.querySelector('[name="gain"]'),'3');
  before=singleCalls.length;submit(singleForm);
  await waitFor(()=>singleForm.querySelector('[role="status"]').textContent.includes('確認'),`${format} invalid manual feedback`);
  expect(singleCalls.length===before,`${format} invalid manual does not call Session`);
  input(singleForm.querySelector('[name="gain"]'),'2');submit(singleForm);
  await waitFor(()=>singleCalls.length===before+1&&singleForm.getAttribute('aria-busy')==='false',`${format} single manual`);
  const sharpened=blobs.get(byID('#download-link').href);
  expect(singleCalls.at(-1).outputSharpening.kind==='manual'&&singleCalls.at(-1).outputSharpening.gain===2,
    `${format} validated manual option`);
  expect(none?.type===sharpened?.type&&none?.type===`image/${format}`,`${format} MIME`);
  await differs(none,sharpened,`${format} actual Worker output pixels differ`);
  let dimensions=null;
  if(format==='jpeg'){
    const before=await createImageBitmap(none),after=await createImageBitmap(sharpened);
    dimensions=[[before.width,before.height],[after.width,after.height]];
    expect(dimensions.every(([width,height])=>width===24&&height===18),
      'JPEG none/manual retain actual 24×18 dimensions');
    before.close();after.close();
  }
  await unchanged();return {format,mime:sharpened.type,bytes:sharpened.size,dimensions};
}
async function rejectedFirstJPEG(){
  expect(byID('#download-link').hidden&&!byID('#download-link').getAttribute('href'),
    'no Final link before a failed JPEG');
  const beforeClicks=autoClicks.length,beforeEncode=encodeCount,beforeCalls=singleCalls.length;
  scenario='fail-first';decodeCount=0;select('#single-output-format','jpeg');manual(singleForm);
  submit(singleForm);
  await waitFor(()=>decodeCount===1&&singleForm.getAttribute('aria-busy')==='false'&&
    singleForm.querySelector('[role="status"]').textContent.includes('開始できませんでした'),
  'first JPEG decode failure is surfaced');
  expect(singleCalls.length===beforeCalls+1&&singleCalls.at(-1).outputSharpening.kind==='manual',
    'failed JPEG used manual export path');
  expect(byID('#download-link').hidden&&!byID('#download-link').getAttribute('href')&&
    autoClicks.length===beforeClicks&&encodeCount===beforeEncode,
  'failed JPEG publishes no link, auto-download or encoded Blob');
  await unchanged();scenario='success';
}
async function batch(format){
  scenario='success';decodeCount=0;select('#batch-final-format',format);
  batchForm.querySelector('input[value="none"]').click();
  let before=batchCalls.length;submit(batchForm);
  await waitFor(()=>batchCalls.length===before+1&&batchLinks().length===2&&
    batchForm.getAttribute('aria-busy')==='false',`${format} batch none`);
  const none=batchLinks().map(link=>blobs.get(link.href));
  expect(batchCalls.at(-1).outputSharpening.kind==='none',`${format} batch none option`);
  manual(batchForm);input(batchForm.querySelector('[name="gain"]'),'2');
  before=batchCalls.length;submit(batchForm);
  await waitFor(()=>batchCalls.length===before+1&&batchLinks().length===2&&
    batchForm.getAttribute('aria-busy')==='false',`${format} batch manual`);
  const sharpened=batchLinks().map(link=>blobs.get(link.href));
  expect(batchCalls.at(-1).outputSharpening.kind==='manual'&&batchCalls.at(-1).outputSharpening.gain===2,
    `${format} batch validated manual option`);
  for(let i=0;i<2;i++)await differs(none[i],sharpened[i],`${format} batch image ${i+1} pixels differ`);
  await unchanged();return {format,files:sharpened.map(blob=>({mime:blob.type,bytes:blob.size}))};
}
async function run(){
  expect(singleForm&&batchForm,'both output forms mounted');
  expect(![singleForm,batchForm].some(form=>form.textContent.includes('Screen/Print')),
    'no official preset names in mounted output forms');
  await rejectedFirstJPEG();
  const singleResults=[];for(const format of ['jpeg','png','tiff'])singleResults.push(await single(format));
  byID(`#batch-final-assets input[value="${b}"]`).click();
  byID(`#batch-final-assets input[value="${a}"]`).click();
  expect(!byID('#batch-final-start').disabled,'two saved Batch targets selected');
  const batches=[];for(const format of ['png','tiff'])batches.push(await batch(format));
  // Native keyboard Escape discards uncommitted numeric changes without exporting.
  manual(batchForm);input(batchForm.querySelector('[name="gain"]'),'1.7');
  const beforeEscape=batchCalls.length;
  batchForm.querySelector('[name="gain"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(batchCalls.length===beforeEscape&&batchForm.querySelector('input[value="none"]').checked,
    'Escape cancels draft without calling Session');
  scenario='fail-second';decodeCount=0;manual(batchForm);submit(batchForm);
  await waitFor(()=>byID('#batch-final-status').textContent.includes('完了していません'),'Batch second failure');
  expect(batchLinks().length===0,'Batch partial result gives zero links');
  scenario='hold-cancel';decodeCount=0;submit(batchForm);
  await waitFor(()=>decodeCount===1&&batchForm.getAttribute('aria-busy')==='true','Batch held export');
  batchForm.querySelector('button[type="button"]').click();
  await waitFor(()=>byID('#batch-final-status').textContent.includes('完了していません'),'Batch cancel');
  expect(batchLinks().length===0,'cancelled Batch gives zero links');
  await unchanged();
  verdict.textContent=JSON.stringify({status:'OUTPUT_SHARPENING_BROWSER_PASS',
    boundary:'synthetic saved non-RAW Editor -> real Worker JPEG/PNG/TIFF',userAgent:navigator.userAgent,
    single:singleResults,batches,invalid:'rejected before Session',cancel:'no links',partial:'no links',
    failedFirstJPEG:'no link or auto-download',
    original:'SHA unchanged',recipe:'revision 2 unchanged',autoClicks:autoClicks.length});
  dispose();worker.dispose();HTMLAnchorElement.prototype.click=realClick;
}
byID('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{verdict.textContent=JSON.stringify({status:'FAIL',error:String(error?.stack??error),
    sessionError:session.state.error,uiError:byID('#error-banner')?.textContent,
    batchStatus:byID('#batch-final-status')?.textContent,singleCalls,batchCalls,decodeCount,encodeCount,
    batchLinks:batchLinks().length,autoClicks});});
});
