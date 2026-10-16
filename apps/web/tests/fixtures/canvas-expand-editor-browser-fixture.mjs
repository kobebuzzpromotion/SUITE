import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Deliberately synthetic NON-RAW. The real Editor/Session/Worker and PNG
// encoder are exercised, but no camera decoder, Cloud binding or AI fill.
const id='66666666-6666-4666-8666-666666666666';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_MANUAL_CANVAS_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'canvas-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
function frame(width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    data[at]=40+Math.floor(x*150/width);data[at+1]=30+Math.floor(y*170/height);
    data[at+2]=80+Math.floor((x+y)*80/(width+height));data[at+3]=255;
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
const expect=(condition,label)=>{if(!condition)throw Error(`CANVAS_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`CANVAS_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const expansion=()=>session.state.recipe.parameters.extendedParameters.canvasExpand??null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function decoded(blob){
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const output={width:bitmap.width,height:bitmap.height,
    data:new Uint8ClampedArray(context.getImageData(0,0,bitmap.width,bitmap.height).data)};
  bitmap.close();return output;
}
async function preview(){
  const blob=blobs.get(session.state.afterURL);expect(blob instanceof Blob,'Worker Proxy PNG exists');
  return decoded(blob);
}
const pixel=(image,x,y)=>Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
async function setMargin(edge,percent){
  const input=byID(`#canvas-${edge}`),previous=session.state.afterURL,prior=previewRenderCount;
  input.value=String(percent);input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>expansion()?.margins?.[edge]===percent/100&&session.state.busy===null&&
    session.state.afterURL!==previous&&previewRenderCount>prior,`${edge} margin Worker Preview`);
  expect(Number(input.value)===percent,`${edge} UI control reflects Recipe`);
}
async function setBackground(name,rgba){
  const control=byID('#canvas-background'),previous=session.state.afterURL,prior=previewRenderCount;
  control.value=name;control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>same(expansion()?.background,rgba)&&session.state.busy===null&&
    session.state.afterURL!==previous&&previewRenderCount>prior,`${name} background Worker Preview`);
  expect(control.value===name,`${name} UI background selection`);
}
async function saveAndReload(){
  const old=saved.revision;
  expect(session.state.dirty&&!byID('[data-action="save"]').disabled,'dirty canvas Recipe can save');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===old+1&&session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'manual expansion save');
  const fixed=JSON.stringify(expansion()),previous=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&session.state.afterURL!==previous&&
    !byID('[data-action="export-png"]').disabled,'manual expansion reload');
  expect(JSON.stringify(expansion())===fixed&&same(saved.body,session.state.recipe),
    'margins and background survive Recipe reload');
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'saved Recipe can export Final PNG');
  const count=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===count+1&&!session.state.exporting,'Worker Final PNG via Editor UI');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'real Worker Final PNG Blob linked');
  return decoded(blob);
}
async function runBrowserChecks(){
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'authenticated synthetic saved Editor asset');
  byID('#canvas-expand-section').open=true;
  const baseProxy=await preview(),baseFinal=await exportViaUI();
  expect(baseProxy.width===120&&baseProxy.height===80&&baseFinal.width===240&&baseFinal.height===160,
    'neutral Proxy and Final use different real frame dimensions');
  for(const [edge,value] of [['left',25],['right',10],['top',20],['bottom',15]])
    await setMargin(edge,value);
  const margins={left:.25,right:.1,top:.2,bottom:.15};
  expect(same(expansion()?.margins,margins)&&expansion()?.schemaVersion===1,
    'all four percentages reach distinct Recipe margins');
  expect(!session.state.recipe.parameters.processingOrder.includes('canvasExpand'),
    'no new Recipe processingOrder stage');
  const proxyDimensions={width:162,height:108},finalDimensions={width:324,height:216};
  const backgrounds=[['white',[255,255,255,255]],['gray',[128,128,128,255]],
    ['black',[0,0,0,255]],['transparent',[0,0,0,0]]];
  const results=[];
  for(const [name,rgba] of backgrounds){
    if(name!=='white')await setBackground(name,rgba);
    expect(same(expansion()?.background,rgba),`${name} Recipe RGBA`);
    const proxy=await preview();
    expect(proxy.width===proxyDimensions.width&&proxy.height===proxyDimensions.height,
      `${name} actual Proxy dimensions projected from 120×80`);
    expect(same(pixel(proxy,0,0),rgba),`${name} Proxy corner RGBA`);
    expect(same(pixel(proxy,30+50,16+30),pixel(baseProxy,50,30)),
      `${name} Proxy content remains unchanged at projected offset`);
    if(name==='transparent'){
      const snapshot=JSON.stringify(expansion()),beforeURL=session.state.afterURL;
      byID('[data-action="undo"]').click();
      await waitFor(()=>same(expansion()?.background,[0,0,0,255])&&session.state.afterURL!==beforeURL&&
        session.state.busy===null,'transparent Undo returns black');
      expect(same(pixel(await preview(),0,0),[0,0,0,255]),'Undo changes actual Proxy corner');
      const redoURL=session.state.afterURL;
      byID('[data-action="redo"]').click();
      await waitFor(()=>JSON.stringify(expansion())===snapshot&&session.state.afterURL!==redoURL&&
        session.state.busy===null,'transparent Redo restores RGBA');
      expect(same(pixel(await preview(),0,0),rgba),'Redo restores actual Proxy corner');
    }
    await saveAndReload();
    const final=await exportViaUI();
    expect(final.width===finalDimensions.width&&final.height===finalDimensions.height,
      `${name} actual Final dimensions projected from 240×160`);
    expect(same(pixel(final,0,0),rgba),`${name} Final corner RGBA`);
    expect(same(pixel(final,60+100,32+60),pixel(baseFinal,100,60)),
      `${name} Final content unchanged at its own projected offset`);
    results.push({name,proxy:[proxy.width,proxy.height],final:[final.width,final.height],corner:rgba});
  }
  expect(!byID('#canvas-expand-reset').disabled,'Reset enabled for active manual margins');
  byID('#canvas-expand-reset').click();
  await waitFor(()=>expansion()===null&&session.state.busy===null,'Reset removes expansion');
  const resetProxy=await preview();
  expect(resetProxy.width===120&&resetProxy.height===80&&
    same(pixel(resetProxy,50,30),pixel(baseProxy,50,30)),
  'Reset restores original Proxy dimensions/pixels');
  const resetURL=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>expansion()?.background?.[3]===0&&session.state.afterURL!==resetURL&&
    session.state.busy===null,'Reset Undo restores transparent expansion');
  const redoURL=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>expansion()===null&&session.state.afterURL!==redoURL&&
    session.state.busy===null,'Reset Redo removes expansion again');
  await saveAndReload();
  const resetFinal=await exportViaUI();
  expect(resetFinal.width===240&&resetFinal.height===160&&
    same(pixel(resetFinal,100,60),pixel(baseFinal,100,60)),
  'Reset Final returns to original dimensions and pixels');
  expect(finalDecodeCount===6&&autoClicks.length===6&&previewRenderCount>=14,
    'neutral/four backgrounds/Reset actual Worker Final and Proxy paths ran');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA remain unchanged');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'CANVAS-EDITOR-BROWSER-PASS',
    boundary:'synthetic signed-in non-RAW Editor -> Recipe -> actual Worker Proxy/Final',
    margins,backgrounds:results,reset:'Undo/Redo and Final verified',savedRevision:saved.revision,
    previewRenderCount,finalDecodeCount,autoExpandDuringSync:'NOT_IMPLEMENTED: photo-specific AI inference',
    originalSHA:asset.sha256});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'CANVAS-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        expansion:expansion(),afterURL:session.state.afterURL},savedRevision:saved.revision,
      previewRenderCount,finalDecodeCount});
  });
});
