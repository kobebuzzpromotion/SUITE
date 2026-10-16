import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Browser-only synthetic non-RAW pixels. Product Editor, Session, Worker,
// Recipe save/reload, and Final PNG encoding remain the real implementations.
const id='55555555-5555-4555-8555-555555555555';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_SELECTIVE_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'selective-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const ranges=['reds','yellows','greens','cyans','blues','magentas','whites','neutrals','blacks'];
const swatches=[[220,45,55],[220,205,35],[45,205,65],[35,190,205],[45,75,225],
  [205,50,195],[235,232,228],[130,125,120],[28,27,32]];
function frame(){
  const width=90,height=90,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const swatch=swatches[Math.floor(y/30)*3+Math.floor(x/30)],at=(y*width+x)*4;
    data.set([...swatch,255],at);
  }
  return {width,height,data};
}
let saved={assetId:id,revision:2,body:neutralRecipe()};
let cache={asset:structuredClone(asset),proxy:frame(),history:[structuredClone(saved.body)],
  cursor:0,revision:2,reference:null,dirty:false};
const api={
  async listAssets(){return [structuredClone(asset)];},
  async getRecipe(candidate){return candidate===id?structuredClone(saved):null;},
  async getOriginal(candidate){if(candidate!==id)throw Error('TEST_ASSET_UNKNOWN');return original.slice(0);},
  async assertPermission(candidate,action){if(candidate!==id||!['edit','export'].includes(action))throw Error('TEST_PERMISSION_DENIED');return {authorized:true};},
  async saveRecipe(candidate,revision,body){
    if(candidate!==id||revision!==saved.revision)throw Error('TEST_REVISION_CONFLICT');
    saved={assetId:id,revision:revision+1,body:structuredClone(body)};return structuredClone(saved);
  },
};
const storage={
  async get(candidate){return candidate===id?structuredClone(cache):undefined;},
  async put(candidate,value){if(candidate!==id)throw Error('TEST_ASSET_UNKNOWN');cache=structuredClone(value);},
};
const worker=createProcessing({workerURL:'/processing-worker.js'});
let previewRenderCount=0,finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,
  async render(...args){previewRenderCount++;return worker.render(...args);},
  async decodeRaw(_bytes,{mode}={}){
    if(mode!=='final')throw Error('TEST_FINAL_ONLY');finalDecodeCount++;
    return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
  },
};
const blobs=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>{blobs.delete(url);revokeURL(url);};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){autoClicks.push({name:this.download,href:this.href});return;}
  return anchorClick.apply(this,args);
};

const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(id);
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Browser Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`SELECTIVE_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`SELECTIVE_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const selective=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.selectiveColor??{};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function pixels(blob){
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const output=new Uint8ClampedArray(context.getImageData(0,0,bitmap.width,bitmap.height).data);
  bitmap.close();return output;
}
const different=(left,right)=>left.some((value,index)=>value!==right[index]);
async function previewPixels(){
  const blob=blobs.get(session.state.afterURL);expect(blob instanceof Blob,'Worker Preview PNG Blob exists');
  return pixels(blob);
}
async function changeRange(range){
  const select=byID('#selective-range');select.value=range;select.dispatchEvent(new Event('change',{bubbles:true}));
  expect(select.value===range,`selected UI range ${range}`);
}
async function changeControl(field,value){
  const range=byID('#selective-range').value,control=byID(`#selective-${field}`);
  const previous=session.state.afterURL,previousRender=previewRenderCount;
  control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>selective().ranges?.[range]?.[field]===value&&session.state.busy===null&&
    session.state.afterURL!==previous&&previewRenderCount>previousRender,`${range}.${field} Worker Preview`);
  expect(Number(control.value)===value,`${range}.${field} UI retained value`);
}
async function changeMethod(method){
  const control=byID('#selective-method'),previous=session.state.afterURL,prior=previewRenderCount;
  control.value=method;control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>(selective().method??'relative')===method&&session.state.busy===null&&
    session.state.afterURL!==previous&&previewRenderCount>prior,`${method} method Worker Preview`);
  expect(control.value===method,`${method} UI method retained`);
}
async function saveAndReload(){
  const old=saved.revision;
  expect(session.state.dirty&&!byID('[data-action="save"]').disabled,'dirty Recipe can save');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===old+1&&session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'Selective Color Recipe save');
  const fixed=JSON.stringify(selective()),previous=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&session.state.afterURL!==previous&&
    !byID('[data-action="export-png"]').disabled,'Selective Color saved Recipe reload');
  expect(JSON.stringify(selective())===fixed&&same(saved.body,session.state.recipe),
    'range/method keys survive reload');
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'Final PNG enabled for saved Recipe');
  const count=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===count+1&&!session.state.exporting,'Final PNG via Editor UI');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'actual Worker Final PNG Blob linked');
  return pixels(blob);
}
async function runBrowserChecks(){
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'authenticated synthetic saved Editor asset');
  const section=byID('#selective-color-section');section.open=true;
  const rangeSelect=byID('#selective-range');
  expect(rangeSelect.options.length===9&&ranges.every((range,index)=>rangeSelect.options[index].value===range),
    'nine correct selectable color families');
  expect(['cyan','magenta','yellow','black'].every(field=>!byID(`#selective-${field}`).disabled),
    'four active CMYK controls');
  const neutralPreview=await previewPixels(),neutralFinal=await exportViaUI();
  expect(!different(neutralPreview,neutralFinal),'neutral Preview and Final agree');

  const edited=[];
  for(const range of ranges){
    await changeRange(range);
    expect(Number(byID('#selective-cyan').value)===0,`${range} starts with its own zero cyan`);
    const prior=await previewPixels();
    await changeControl('cyan',60);
    const next=await previewPixels();
    expect(different(prior,next),`${range} changes actual Worker Preview pixels`);
    expect(selective().ranges?.[range]?.cyan===60,`${range} uses its distinct Recipe key`);
    edited.push(range);
  }
  await changeRange('reds');
  expect(Number(byID('#selective-cyan').value)===60,'range switch restores saved Reds value');
  for(const [field,value] of [['magenta',-30],['yellow',25],['black',15]])await changeControl(field,value);
  const relativeRanges=structuredClone(selective().ranges);
  expect(same(relativeRanges.reds,{cyan:60,magenta:-30,yellow:25,black:15})&&
    ranges.every(range=>relativeRanges[range]?.cyan===60),
  'nine ranges and all four Reds CMYK values persist separately');
  expect(selective().method===undefined,'Relative default uses existing omitted method key');
  expect(session.state.recipe.parameters.processingOrder.includes('postDecodeAdjustments')&&
    !session.state.recipe.parameters.processingOrder.includes('selectiveColor'),
  'Selective Color remains in existing postDecode Recipe stage');

  await saveAndReload();
  const relativePreview=await previewPixels(),relativeFinal=await exportViaUI();
  expect(different(neutralFinal,relativeFinal)&&!different(relativePreview,relativeFinal),
    'Relative Worker Preview and Final agree and differ from neutral');
  await changeMethod('absolute');
  expect(same(selective().ranges,relativeRanges),'method switch preserves nine range values');
  const absoluteBeforeUndo=await previewPixels(),priorUndo=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>(selective().method??'relative')==='relative'&&session.state.afterURL!==priorUndo&&
    session.state.busy===null,'method Undo');
  expect(!different(await previewPixels(),relativePreview),'Undo restores Relative pixels');
  const priorRedo=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>selective().method==='absolute'&&session.state.afterURL!==priorRedo&&
    session.state.busy===null,'method Redo');
  expect(!different(await previewPixels(),absoluteBeforeUndo),'Redo restores Absolute pixels');
  await saveAndReload();
  const absolutePreview=await previewPixels(),absoluteFinal=await exportViaUI();
  expect(different(relativePreview,absolutePreview)&&different(relativeFinal,absoluteFinal),
    'Relative and Absolute produce distinct Preview and Final pixels');
  expect(!different(absolutePreview,absoluteFinal),'Absolute Worker Preview and Final agree');
  expect(saved.revision===4&&!session.state.dirty&&same(saved.body,session.state.recipe)&&
    selective().method==='absolute'&&same(selective().ranges,relativeRanges),
  'saved Absolute Recipe reloads with all nine ranges intact');
  expect(finalDecodeCount===3&&autoClicks.length===3&&previewRenderCount>=14,
    'neutral/Relative/Absolute Final and repeated real Worker previews ran');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA remain unchanged');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'SELECTIVE-EDITOR-BROWSER-PASS',
    boundary:'synthetic signed-in non-RAW Editor -> saved Recipe -> actual Worker Preview/Final',
    ranges:edited,controls:'Reds CMYK plus all nine cyan channels',methods:['relative','absolute'],
    savedRevision:saved.revision,previewRenderCount,finalDecodeCount,originalSHA:asset.sha256});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'SELECTIVE-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        selective:selective(),afterURL:session.state.afterURL},savedRevision:saved.revision,
      previewRenderCount,finalDecodeCount});
  });
});
