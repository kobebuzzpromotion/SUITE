import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Browser-only synthetic non-RAW pattern with tonal edges and fine texture.
// The real Editor/Session/Worker handles Recipe, Preview and Final output.
const id='77777777-7777-4777-8777-777777777777';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_DETAIL_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'detail-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const clamp=value=>Math.max(0,Math.min(255,value));
function frame(width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    const broad=(Math.floor(x/(width/6))+Math.floor(y/(height/4)))%2?48:-48;
    const fine=(((x*37+y*53)%11)-5)*4;
    const tone=110+broad+fine+Math.floor(x*45/width);
    data[at]=clamp(tone);data[at+1]=clamp(tone+13);data[at+2]=clamp(tone-17);data[at+3]=255;
  }
  return {width,height,data};
}
let saved={assetId:id,revision:2,body:neutralRecipe()};
let cache={asset:structuredClone(asset),proxy:frame(120,80),history:[structuredClone(saved.body)],
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
    return {pixels:frame(240,160),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
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
const expect=(condition,label)=>{if(!condition)throw Error(`DETAIL_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`DETAIL_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const detail=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.detail??{};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function decoded(blob){
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const output=new Uint8ClampedArray(context.getImageData(0,0,bitmap.width,bitmap.height).data);
  bitmap.close();return output;
}
const different=(left,right)=>left.some((value,index)=>value!==right[index]);
async function preview(){
  const blob=blobs.get(session.state.afterURL);expect(blob instanceof Blob,'Worker Preview PNG exists');
  return decoded(blob);
}
async function changeDetail(field,value){
  const control=byID(`#detail-${field}`),prior=session.state.afterURL,priorRender=previewRenderCount;
  control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>detail()[field]===value&&session.state.busy===null&&
    session.state.afterURL!==prior&&previewRenderCount>priorRender,`${field} Worker Preview`);
  expect(Number(control.value)===value,`${field} UI value`);
}
async function saveAndReload(){
  const old=saved.revision;
  expect(session.state.dirty&&!byID('[data-action="save"]').disabled,'dirty Detail Recipe can save');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===old+1&&session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'Detail Recipe save');
  const fixed=JSON.stringify(detail()),prior=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&session.state.afterURL!==prior&&
    !byID('[data-action="export-png"]').disabled,'Detail Recipe reload');
  expect(JSON.stringify(detail())===fixed&&same(saved.body,session.state.recipe),
    'all active Detail keys survive reload');
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'saved Detail Recipe can export PNG');
  const count=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===count+1&&!session.state.exporting,'Worker Final PNG via Editor UI');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'actual Worker Final PNG Blob linked');
  return decoded(blob);
}
async function runBrowserChecks(){
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'authenticated synthetic saved Editor asset');
  const fields=['denoise','clarity','texture','sharpness'];
  const sliders=Array.from(byID('#detail-controls').querySelectorAll('input[type="range"]'));
  expect(fields.every(field=>sliders.some(slider=>slider.id===`detail-${field}`&&!slider.disabled)),
    'four named Detail sliders enabled');
  expect(!sliders.some(slider=>/sharpen[\s_-]*(radius|detail|masking)/i.test(
    `${slider.id} ${slider.getAttribute('aria-label')??''} ${slider.closest('label')?.textContent??''}`)),
  'Sharpen Radius/Detail/Masking are not fake interactive sliders');
  expect(!byID('#detail-sharpen-radius')&&!byID('#detail-sharpen-detail')&&
    !byID('#detail-sharpen-masking'),'unimplemented Sharpen sub-controls do not appear');
  const baselinePreview=await preview(),baselineFinal=await exportViaUI();
  const steps=[['denoise',70],['clarity',70],['texture',70],['sharpness',80]];
  let priorPreview=baselinePreview,priorFinal=baselineFinal;
  const results=[];
  for(const [field,value] of steps){
    await changeDetail(field,value);
    expect(Object.keys(detail()).every(key=>fields.includes(key))&&
      steps.slice(0,results.length+1).every(([key,expected])=>detail()[key]===expected),
    `${field} distinct saved Recipe key without unknown controls`);
    const nextPreview=await preview();
    expect(different(priorPreview,nextPreview),`${field} changes actual Worker Preview pixels`);
    if(field==='sharpness'){
      const priorUndo=session.state.afterURL;
      byID('[data-action="undo"]').click();
      await waitFor(()=>detail().sharpness===undefined&&session.state.afterURL!==priorUndo&&
        session.state.busy===null,'Sharpness Undo');
      expect(!different(await preview(),priorPreview),'Undo restores pre-Sharpness Preview pixels');
      const priorRedo=session.state.afterURL;
      byID('[data-action="redo"]').click();
      await waitFor(()=>detail().sharpness===value&&session.state.afterURL!==priorRedo&&
        session.state.busy===null,'Sharpness Redo');
      expect(!different(await preview(),nextPreview),'Redo restores Sharpness Preview pixels');
    }
    await saveAndReload();
    const nextFinal=await exportViaUI();
    expect(different(priorFinal,nextFinal),`${field} changes actual Worker Final pixels`);
    expect(session.state.recipe.parameters.processingOrder.includes('postDecodeAdjustments'),
      `${field} remains in existing postDecode Recipe stage`);
    results.push({field,value,revision:saved.revision,previewChanged:true,finalChanged:true});
    priorPreview=nextPreview;priorFinal=nextFinal;
  }
  expect(saved.revision===6&&finalDecodeCount===5&&autoClicks.length===5&&
    previewRenderCount>=9&&!session.state.dirty&&same(saved.body,session.state.recipe),
  'four Detail saves and five actual Worker Final renders completed');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA remain unchanged');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'DETAIL-EDITOR-BROWSER-PASS',
    boundary:'synthetic signed-in non-RAW Editor -> saved Recipe -> actual Worker Preview/Final',
    controls:results,unimplementedSharpenSubControls:'no active Radius/Detail/Masking sliders',
    previewRenderCount,finalDecodeCount,originalSHA:asset.sha256});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'DETAIL-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        detail:detail(),afterURL:session.state.afterURL},savedRevision:saved.revision,
      previewRenderCount,finalDecodeCount});
  });
});
