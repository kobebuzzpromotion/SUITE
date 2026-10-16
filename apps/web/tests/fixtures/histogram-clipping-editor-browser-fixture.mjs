import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Test-only synthetic non-RAW owner, pixels, API and storage. Product Editor,
// Session, histogram/clipping, Worker Preview/Final and Recipe paths are real.
const id='55555555-5555-4555-8555-555555555555';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_HISTOGRAM_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'histogram-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const frame=()=>{
  const width=80,height=60,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    const value=x<10?0:x>=70?255:55+Math.round((x-10)*2.2);
    data[at]=value;data[at+1]=value;data[at+2]=value;data[at+3]=255;
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
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>revokeURL(url);
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){autoClicks.push(this.href);return;}
  return anchorClick.apply(this,args);
};
const session=new EditorSession({api,storage,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(id);
const dispose=mountEditor(session,{trialSession:{mode:'INVITED_LOCAL_TRIAL',principal:{
  id:'synthetic-local-owner',authorName:'Browser Fixture Owner',role:'author',
  trialEndsAt:'2099-01-01T00:00:00.000Z'}},
  authorAPI:{listPresets:async()=>[],getSession:async()=>({principal:{id:'synthetic-local-owner'}})}});

const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`HISTOGRAM_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`HISTOGRAM_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
async function pixels(blob){
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const data=context.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return {width:canvas.width,height:canvas.height,data};
}
const different=(left,right)=>left.some((value,index)=>value!==right[index]);
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'saved PNG Final enabled');
  const old=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===old+1&&!session.state.exporting,
    'Editor Final PNG output');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'actual Final PNG Blob linked');
  return (await pixels(blob)).data;
}
const currentValue=region=>{
  const params=session.state.recipe.parameters;
  return region==='exposure'?params.exposure:
    params.extendedParameters.postDecodeAdjustments?.color?.[region]??0;
};
async function dragTone(region,pointerId){
  const button=byID(`[data-tone-region="${region}"]`),row=button.parentElement;
  expect(!button.disabled&&button.clientWidth>0,`${region} drag control available`);
  const width=button.clientWidth,start=button.getBoundingClientRect().left+width/2;
  const before=currentValue(region),previous=session.state.afterURL;
  // Synthetic PointerEvents exercise the real delegated UI handlers. Native
  // pointer capture is separately checked via CUA drag in the browser audit.
  button.setPointerCapture=()=>{};button.hasPointerCapture=()=>false;
  const event=(type,x)=>new PointerEvent(type,{bubbles:true,cancelable:true,
    pointerId,button:0,buttons:type==='pointerup'?0:1,clientX:x,
    clientY:button.getBoundingClientRect().top+button.clientHeight/2});
  button.dispatchEvent(event('pointerdown',start));
  row.dispatchEvent(event('pointermove',start+width*.15));
  row.dispatchEvent(event('pointerup',start+width*.15));
  await waitFor(()=>currentValue(region)>before&&session.state.busy===null&&
    Boolean(session.state.afterURL)&&session.state.afterURL!==previous,
  `${region} drag commits through Recipe and Preview`);
  return {region,before,after:currentValue(region)};
}
async function runBrowserChecks(){
  const report={tones:[],clipping:null,revision:null};
  const histogram=session.state.histogram;
  expect(histogram?.includedPixels===80*60&&histogram.clipping.shadow.anyChannel>0&&
    histogram.clipping.highlight.anyChannel>0,'rendered RGBA8 histogram includes black and white rails');
  for(const channel of ['luma','red','green','blue'])
    expect((byID(`.suite-histogram-${channel}`).getAttribute('d')??'').startsWith('M'),
      `${channel} SVG distribution rendered`);
  expect(byID('.suite-clipping-summary').textContent.includes('黒側')&&
    byID('.suite-clipping-summary').textContent.includes('白側'),
  'visible clipping summary');
  const overlayBlob=blobs.get(session.state.clippingOverlayURL),overlay=await pixels(overlayBlob);
  const sample=(x,y)=>[...overlay.data.slice((y*overlay.width+x)*4,(y*overlay.width+x)*4+4)];
  const black=sample(3,3),white=sample(75,3);
  expect(black[2]>black[0]&&black[3]>0&&white[0]>white[2]&&white[3]>0,
    'blue black-clipping and red white-clipping preview pixels');

  const fixedRecipe=JSON.stringify(session.state.recipe),afterURL=session.state.afterURL;
  expect(byID('#clipping-overlay').hidden,'overlay initially hidden');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',bubbles:true}));
  expect(!byID('#clipping-overlay').hidden&&
    byID('#clipping-toggle').getAttribute('aria-pressed')==='true','J enables photo overlay');
  byID('[data-view="before"]').click();
  expect(byID('#clipping-overlay').hidden,'Before view hides clipping overlay');
  byID('[data-view="after"]').click();
  expect(!byID('#clipping-overlay').hidden,'After view restores clipping overlay');
  expect(JSON.stringify(session.state.recipe)===fixedRecipe&&session.state.afterURL===afterURL,
    'J and view toggles never edit Recipe or rendered photo');
  const baseWithOverlay=await exportViaUI();
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',bubbles:true}));
  expect(byID('#clipping-overlay').hidden,'J disables overlay');
  const baseWithoutOverlay=await exportViaUI();
  expect(!different(baseWithOverlay,baseWithoutOverlay),
    'Preview clipping overlay not composited into neutral Final');
  report.clipping={shadowCount:histogram.clipping.shadow.anyChannel,
    highlightCount:histogram.clipping.highlight.anyChannel,black,white,
    jToggle:true,beforeHidden:true,finalExcluded:true};

  for(const [index,region] of ['blacks','shadows','exposure','highlights','whites'].entries())
    report.tones.push(await dragTone(region,index+11));
  const whites=report.tones.at(-1).after,previousUndo=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>currentValue('whites')===0&&session.state.busy===null&&
    session.state.afterURL!==previousUndo,'tone drag Undo');
  const previousRedo=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>currentValue('whites')===whites&&session.state.busy===null&&
    session.state.afterURL!==previousRedo,'tone drag Redo');
  expect(session.state.dirty&&saved.revision===2,'five tone drags remain a draft until Save');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===3&&!session.state.dirty&&session.state.busy===null,
    'five tone adjustments save with CAS');
  const stored=JSON.stringify(saved.body),previousReload=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>Boolean(session.state.afterURL)&&session.state.afterURL!==previousReload&&
    !byID('[data-action="export-png"]').disabled,'tone adjustments reload Preview');
  expect(JSON.stringify(session.state.recipe)===stored&&report.tones.every(item=>currentValue(item.region)===item.after),
    'five region values survive saved Recipe reload');
  report.revision=saved.revision;

  byID('#clipping-toggle').click();
  expect(!byID('#clipping-overlay').hidden,'overlay shown after tone edits');
  const tonedWithOverlay=await exportViaUI();
  byID('#clipping-toggle').click();
  const tonedWithoutOverlay=await exportViaUI();
  expect(!different(tonedWithOverlay,tonedWithoutOverlay)&&
    different(baseWithoutOverlay,tonedWithOverlay),
  'Final changed by five Recipe tones but not by Preview overlay');
  expect(finalDecodeCount===4&&autoClicks.length===4,
    'four real Final renders for mask-on/off comparisons');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA unchanged');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'HISTOGRAM-EDITOR-BROWSER-PASS',
    boundary:'synthetic non-RAW signed-in Editor -> real Histogram/Overlay/Recipe -> Worker Final',
    pointerInput:'synthetic PointerEvent handlers; native pointer capture checked separately via CUA',
    finalDecodeCount,...report});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'HISTOGRAM-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        afterURL:session.state.afterURL,clippingURL:session.state.clippingOverlayURL,
        tones:Object.fromEntries(['blacks','shadows','exposure','highlights','whites'].map(name=>[name,currentValue(name)]))},
      finalDecodeCount});
  });
});
