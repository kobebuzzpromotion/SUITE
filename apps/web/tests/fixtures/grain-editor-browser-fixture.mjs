import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Test-only principal and synthetic non-RAW raster. The actual product
// Editor, session, Worker renderer/encoder, and Recipe save path are exercised.
const id='55555555-5555-4555-8555-555555555555';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_GRAIN_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'grain-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const frame=()=>{
  const width=128,height=96,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    // Three broad luma zones plus chroma variation expose tonal and color grain.
    const base=x<width/3?35:x<2*width/3?125:215;
    data[at]=Math.min(255,base+Math.round(y/9));
    data[at+1]=Math.max(0,base-Math.round(y/15));
    data[at+2]=Math.min(255,base+Math.round(x/18));data[at+3]=255;
  }
  return {width,height,data};
};
let saved={assetId:id,revision:2,body:neutralRecipe()};
let cache={asset:structuredClone(asset),proxy:frame(),history:[structuredClone(saved.body)],
  cursor:0,revision:2,reference:null,dirty:false};
const api={
  async listAssets(){return [structuredClone(asset)];},
  async getRecipe(candidate){return candidate===id?structuredClone(saved):null;},
  async getOriginal(candidate){if(candidate!==id)throw Error('TEST_ASSET_UNKNOWN');return original.slice(0);},
  async assertPermission(candidate,action){
    if(candidate!==id||!['edit','export'].includes(action))throw Error('TEST_PERMISSION_DENIED');
    return {authorized:true};
  },
  async saveRecipe(candidate,revision,body){
    if(candidate!==id||revision!==saved.revision)throw Error('TEST_REVISION_CONFLICT');
    saved={assetId:id,revision:revision+1,body:structuredClone(body)};
    return structuredClone(saved);
  },
};
const storage={async get(candidate){return candidate===id?structuredClone(cache):undefined;},
  async put(candidate,value){if(candidate!==id)throw Error('TEST_ASSET_UNKNOWN');cache=structuredClone(value);}};
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(_bytes,{mode}={}){
  if(mode!=='final')throw Error('TEST_FINAL_ONLY');finalDecodeCount++;
  return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const blobs=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){
    autoClicks.push({name:this.download,href:this.href});return;
  }
  return anchorClick.apply(this,args);
};

const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(id);
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Browser Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`GRAIN_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`GRAIN_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const grain=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.detail?.grain??{};
async function pixels(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(bitmap,0,0);
  const data=context.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return data;
}
const different=(left,right)=>left.length===right.length&&left.some((value,index)=>value!==right[index]);
async function previewPixels(){
  const url=session.state.afterURL,blob=blobs.get(url);
  expect(blob instanceof Blob&&blob.type==='image/png','actual Worker Preview PNG Blob');
  return pixels(blob);
}
async function setGrain(field,value){
  const previous=session.state.afterURL,control=byID(field==='amount'?'#detail-grain':`#grain-${field}`);
  expect(control instanceof HTMLInputElement&&control.type==='range',`${field} Editor range exists`);
  control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>grain()[field]===value&&session.state.busy===null&&
    Boolean(session.state.afterURL)&&session.state.afterURL!==previous,
    `Editor grain ${field} ${value}`);
  expect(Number(control.value)===value,`${field} UI value`);
}
async function saveAndReload(){
  const old=saved.revision;
  expect(!byID('[data-action="save"]').disabled&&session.state.dirty,'Grain save enabled');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===old+1&&session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'Grain Recipe save');
  const fixed=JSON.stringify(grain()),previous=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&Boolean(session.state.afterURL)&&
    session.state.afterURL!==previous&&!byID('[data-action="export-png"]').disabled,
    'Grain saved Recipe reload');
  expect(JSON.stringify(grain())===fixed&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'saved Grain settings survive reload');
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'PNG Final enabled after save');
  const old=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===old+1&&!session.state.exporting,
    'Grain Final via Editor PNG button');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'actual Final PNG Blob linked');
  return pixels(blob);
}
async function runBrowserChecks(){
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'signed-in synthetic saved non-RAW Editor');
  expect(byID('#grain-section') instanceof HTMLDetailsElement,'Grain Editorial section exists');
  const baselinePreview=await previewPixels(),baselineFinal=await exportViaUI();
  const controls=[['amount',90],['shadows',10],['midtones',35],['highlights',65],
    ['size',55],['roughness',70],['colorVariation',80]];
  const changedControls=[];
  let lastPreview=baselinePreview;
  for(const [field,value] of controls){
    await setGrain(field,value);
    const current=await previewPixels();
    expect(different(lastPreview,current),`${field} changes real Worker Preview pixels`);
    changedControls.push(field);lastPreview=current;
  }
  const redoSettings=JSON.stringify(grain()),redoPixels=lastPreview;
  const previousUndo=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>grain().colorVariation===undefined&&session.state.afterURL!==previousUndo&&
    session.state.busy===null,'Grain Undo');
  const undoPixels=await previewPixels();
  expect(different(redoPixels,undoPixels),'Undo restores prior Preview pixels');
  const previousRedo=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>JSON.stringify(grain())===redoSettings&&session.state.afterURL!==previousRedo&&
    session.state.busy===null,'Grain Redo');
  expect(!different(redoPixels,await previewPixels()),'Redo restores exact deterministic Preview pixels');
  await saveAndReload();
  expect(JSON.stringify(grain())===redoSettings&&grain().amount===90&&grain().shadows===10&&
    grain().midtones===35&&grain().highlights===65&&grain().size===55&&
    grain().roughness===70&&grain().colorVariation===80,
    'all seven Grain values persist in saved Recipe');
  const final=await exportViaUI();
  expect(different(baselineFinal,final),'Grain changes actual Worker Final pixels');
  expect(different(baselinePreview,await previewPixels()),'Grain changes actual Worker Preview pixels');
  expect(finalDecodeCount===2&&autoClicks.length===2,'neutral and Grain Final exported');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA unchanged');
  expect(!session.state.dirty&&saved.revision===3&&
    JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),'saved revision fixed');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'GRAIN-EDITOR-BROWSER-PASS',
    boundary:'synthetic non-RAW signed-in Editor -> saved Recipe -> actual Worker Preview/Final',
    originalSHA:asset.sha256,changedControls,undoRedo:true,savedRevision:saved.revision,
    finalDecodeCount});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'GRAIN-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        grain:grain(),afterURL:session.state.afterURL},savedRevision:saved.revision,finalDecodeCount});
  });
});
