import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';
import {levelsGammaToMidpointPosition,levelsMidpointPositionToGamma} from '../../src/levels-control-mapping.mjs';

// Test-only principal and synthetic non-RAW raster. Product Editor, session,
// Worker renderer/encoder and Recipe save/reload are not substituted.
const id='66666666-6666-4666-8666-666666666666';
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_LEVELS_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const asset={id,name:'levels-test.NONRAW',sha256:await checksum(original),size:original.byteLength,
  deletedAt:null,cloudSafe:true};
const frame=()=>{
  const width=120,height=80,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,base=25+Math.round(175*x/(width-1));
    data[at]=Math.min(255,base+Math.round(y/7));
    data[at+1]=Math.max(0,base-14+Math.round(y/9));
    data[at+2]=Math.min(255,base+19-Math.round(y/8));data[at+3]=255;
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
const expect=(condition,label)=>{if(!condition)throw Error(`LEVELS_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`LEVELS_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const levels=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.levels??{};
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
  const blob=blobs.get(session.state.afterURL);
  expect(blob instanceof Blob&&blob.type==='image/png','actual Worker Preview PNG Blob');
  return pixels(blob);
}
async function setLevel(channel,field,value){
  const previous=session.state.afterURL,control=byID(`#levels-${channel}-${field}`);
  const number=byID(`#levels-${channel}-${field}-number`);
  expect(control instanceof HTMLInputElement&&control.type==='range',`${channel}.${field} range exists`);
  expect(number instanceof HTMLInputElement&&number.type==='number',`${channel}.${field} direct number exists`);
  number.value=String(value);number.dispatchEvent(new Event('input',{bubbles:true}));
  number.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>levels()[channel]?.[field]===value&&session.state.busy===null&&
    Boolean(session.state.afterURL)&&session.state.afterURL!==previous,
    `Editor Levels ${channel}.${field}=${value}`);
  expect(Number(number.value)===value,`${channel}.${field} direct UI value`);
  if(field==='gamma')expect(Math.abs(Number(control.value)-levelsGammaToMidpointPosition(value))<=.5,
    `${channel}.gamma slider represents legacy Recipe gamma without rewriting it`);
  else expect(Number(control.value)===value,`${channel}.${field} slider UI value`);
}
async function checkGammaSliderDirection(){
  const slider=byID('#levels-master-gamma'),before=await previewPixels();
  const original=levels().master.gamma,previous=session.state.afterURL;
  slider.value='80';slider.dispatchEvent(new Event('input',{bubbles:true}));
  slider.dispatchEvent(new Event('change',{bubbles:true}));
  const darker=levelsMidpointPositionToGamma(80);
  await waitFor(()=>levels().master.gamma===darker&&session.state.busy===null&&
    session.state.afterURL!==previous,'rightward midpoint slider saves darker Recipe gamma');
  const after=await previewPixels();
  const middle=(40*120+60)*4;
  expect(darker<original&&after[middle]<before[middle], 'rightward gamma slider darkens actual Worker midtone');
  await setLevel('master','gamma',original);
}
function histogramChecks(){
  const histogram=session.state.levelsHistogram;
  expect(histogram?.includedPixels===120*80&&
    histogram.masterBasis==='sum-of-RGB-channel-counts-not-luma',
    'real rendered RGBA histogram for four Levels channels');
  for(const channel of ['master','red','green','blue']){
    const row=byID(`.levels-histogram-${channel}`),path=row?.querySelector('path');
    expect(row?.querySelector('button')&&!row.querySelector('button').disabled&&
      path?.getAttribute('d')?.startsWith('M')&&
      histogram.bins[channel].reduce((sum,count)=>sum+count,0)===
        histogram.includedPixels*(channel==='master'?3:1),`${channel} histogram visible/count correct`);
    row.querySelector('button').click();
    expect(row.querySelector('button').getAttribute('aria-pressed')==='true',
      `${channel} histogram channel selectable`);
  }
}
async function awaitImageReady(){
  await waitFor(()=>{
    const image=byID('#after-image');
    return image.complete&&image.naturalWidth===120&&image.naturalHeight===80&&
      image.getBoundingClientRect().width>0&&!byID('#levels-pick-black').disabled;
  },'After image dimensions and Levels sampler ready');
}
function clickAfterAt(x,y){
  const image=byID('#after-image'),rect=image.getBoundingClientRect();
  image.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:rect.left+x*rect.width,
    clientY:rect.top+y*rect.height}));
}
async function sampleEndpoint(channel,endpoint,x,y){
  const channelButton=byID(`[data-levels-channel="${channel}"]`);
  channelButton.click();
  expect(channelButton.getAttribute('aria-pressed')==='true',`${channel} active for ${endpoint}`);
  const picker=byID(`#levels-pick-${endpoint}`),field=endpoint==='black'?'inputBlack':'inputWhite';
  expect(!picker.disabled,`${endpoint} picker enabled in After`);
  const previous=levels()[channel]?.[field],oldURL=session.state.afterURL;
  picker.click();expect(picker.getAttribute('aria-pressed')==='true',`${endpoint} picker armed`);
  clickAfterAt(x,y);
  await waitFor(()=>levels()[channel]?.[field]!==previous&&session.state.busy===null&&
    Boolean(session.state.afterURL)&&session.state.afterURL!==oldURL,
    `${channel} ${endpoint} After sampling`);
  expect(picker.getAttribute('aria-pressed')==='false',`${endpoint} picker disarmed after sample`);
  return levels()[channel][field];
}
async function rejectedSampling(){
  await awaitImageReady();
  const black=byID('#levels-pick-black');
  byID('[data-view="before"]').click();
  expect(black.disabled&&!byID('#before-figure').hidden&&byID('#after-figure').hidden,
    'Before view disables Levels picker');
  const fixed=JSON.stringify(levels());
  clickAfterAt(.3,.5);
  expect(JSON.stringify(levels())===fixed,'Before view cannot change Levels');
  byID('[data-view="after"]').click();
  await awaitImageReady();
  // Force an object-fit:contain letterbox in the test page, while keeping the
  // real Editor click handler and natural browser-decoded dimensions.
  const image=byID('#after-image');image.style.width='320px';image.style.height='300px';
  expect(image.getBoundingClientRect().width===320&&image.getBoundingClientRect().height===300,
    'test geometry has a contain letterbox');
  black.click();expect(black.getAttribute('aria-pressed')==='true','picker armed for letterbox');
  clickAfterAt(.5,.02);
  expect(JSON.stringify(levels())===fixed&&black.getAttribute('aria-pressed')==='true'&&
    byID('#levels-sample-status').textContent.includes('余白'),
    'letterbox click rejected without Recipe edit');
  black.click();image.style.width='';image.style.height='';
}
async function saveAndReload(){
  const old=saved.revision;
  expect(!byID('[data-action="save"]').disabled&&session.state.dirty,'Levels save enabled');
  byID('[data-action="save"]').click();
  await waitFor(()=>saved.revision===old+1&&session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'Levels Recipe save');
  const fixed=JSON.stringify(levels()),previous=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&Boolean(session.state.afterURL)&&
    session.state.afterURL!==previous&&!byID('[data-action="export-png"]').disabled,
    'Levels saved Recipe reload');
  expect(JSON.stringify(levels())===fixed&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'all RGB Levels settings survive reload');
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'PNG Final enabled after save');
  const old=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===old+1&&!session.state.exporting,
    'Levels Final via Editor PNG button');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'actual Final PNG Blob linked');
  return pixels(blob);
}
async function runBrowserChecks(){
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===2,
    'signed-in synthetic saved non-RAW Editor');
  expect(byID('#levels-section') instanceof HTMLDetailsElement,'RGB Levels Editorial section exists');
  await awaitImageReady();histogramChecks();
  const baselinePreview=await previewPixels(),baselineFinal=await exportViaUI();
  const settings={master:{inputBlack:15,gamma:1.4,inputWhite:230,outputBlack:5,outputWhite:245},
    red:{inputBlack:20,gamma:1.6,inputWhite:225,outputBlack:12,outputWhite:240},
    green:{inputBlack:18,gamma:.8,inputWhite:220,outputBlack:8,outputWhite:235},
    blue:{inputBlack:25,gamma:1.3,inputWhite:235,outputBlack:18,outputWhite:230}};
  const changed=[];
  for(const [channel,fields] of Object.entries(settings)){
    for(const [field,value] of Object.entries(fields)){
      const before=await previewPixels();
      await setLevel(channel,field,value);
      expect(different(before,await previewPixels()),`${channel}.${field} changes Worker Preview pixels`);
      changed.push(`${channel}.${field}`);
    }
  }
  await checkGammaSliderDirection();
  expect(different(baselinePreview,await previewPixels()),'RGB Levels aggregate Preview differs from neutral');
  await rejectedSampling();
  const blackValue=await sampleEndpoint('red','black',.12,.5);
  const whiteValue=await sampleEndpoint('blue','white',.72,.5);
  expect(Number.isInteger(blackValue)&&blackValue>=0&&blackValue<225&&
    Number.isInteger(whiteValue)&&whiteValue>25&&whiteValue<=255,
    'After black and white picker values are valid RGB endpoints');
  const redoRecipe=JSON.stringify(levels()),redoPreview=await previewPixels();
  const previousUndo=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>levels().blue?.inputWhite===235&&session.state.afterURL!==previousUndo&&
    session.state.busy===null,'Levels Undo eyedropper');
  expect(different(redoPreview,await previewPixels()),'Undo changes Preview pixels');
  const previousRedo=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>JSON.stringify(levels())===redoRecipe&&session.state.afterURL!==previousRedo&&
    session.state.busy===null,'Levels Redo eyedropper');
  expect(!different(redoPreview,await previewPixels()),'Redo restores exact Preview pixels');
  await saveAndReload();
  for(const [channel,fields] of Object.entries(settings))for(const [field,value] of Object.entries(fields)){
    if(channel==='red'&&field==='inputBlack'||channel==='blue'&&field==='inputWhite')continue;
    expect(levels()[channel]?.[field]===value,`${channel}.${field} saved/reloaded`);
  }
  expect(levels().red.inputBlack===blackValue&&levels().blue.inputWhite===whiteValue,
    'both sampled endpoints saved and reloaded');
  histogramChecks();
  const final=await exportViaUI();
  expect(different(baselineFinal,final),'RGB Levels changes real Worker Final pixels');
  expect(finalDecodeCount===2&&autoClicks.length===2,'neutral and Levels Final exported');
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA unchanged');
  expect(!session.state.dirty&&saved.revision===3&&
    JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),'saved revision fixed');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'LEVELS-EDITOR-BROWSER-PASS',
    boundary:'synthetic non-RAW signed-in Editor -> saved Recipe -> actual Worker Preview/Final',
    originalSHA:asset.sha256,changed,blackValue,whiteValue,beforeRejected:true,
    letterboxRejected:true,undoRedo:true,savedRevision:saved.revision,finalDecodeCount});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'LEVELS-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        levels:levels(),afterURL:session.state.afterURL},savedRevision:saved.revision,finalDecodeCount});
  });
});
