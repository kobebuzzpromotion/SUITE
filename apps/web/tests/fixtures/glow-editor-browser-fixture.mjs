import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Authenticated Trial HTTP/SQLite and the actual Editor/Worker are used.
// Camera decode remains a synthetic non-RAW test seam, never a RAW claim.
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_GLOW_ORIGINAL').buffer;
const originalBytes=new Uint8Array(original).slice();
const client=new TrialClient();
const invite=await (await fetch('/fixture/new')).json();
await client.login(invite.inviteToken);
const registered=await client.createAsset({name:'glow-test.NONRAW',
  sha256:await checksum(original),size:original.byteLength});
const asset=await client.putOriginal(registered.id,original.slice(0));
const id=asset.id;
const initial=await client.saveRecipe(id,0,neutralRecipe());
async function createTarget(label,exposure){
  const bytes=new TextEncoder().encode(`SYNTHETIC_NON_RAW_GLOW_ORIGINAL_${label}`).buffer;
  const registered=await client.createAsset({name:`glow-target-${label}.NONRAW`,
    sha256:await checksum(bytes),size:bytes.byteLength});
  const target=await client.putOriginal(registered.id,bytes.slice(0));
  const body=neutralRecipe();body.parameters.exposure=exposure;
  const saved=await client.saveRecipe(target.id,0,body);
  if(saved.revision!==1)throw Error(`target ${label} initial saved Recipe`);
  return {asset:target,bytes,body};
}
const targets=[await createTarget('one',0),await createTarget('two',0.5)];
const frame=()=>{
  const width=80,height=60,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,dist=Math.hypot(x-40,y-30);
    const light=dist<9?240:dist<16?145:42;
    data[at]=Math.min(255,light+Math.round(x/12));
    data[at+1]=Math.min(255,light+Math.round(y/12));
    data[at+2]=Math.min(255,light-10);data[at+3]=255;
  }
  return {width,height,data};
};
let savedRevision=initial.revision;
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(_bytes,{mode}={}){
  if(!['proxy','final'].includes(mode)||
      !new TextDecoder().decode(_bytes).startsWith('SYNTHETIC_NON_RAW_GLOW_ORIGINAL'))
    throw Error('SYNTHETIC_NON_RAW_ONLY');
  if(mode==='final')finalDecodeCount++;
  return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const blobs=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>revokeURL(url);
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){
    autoClicks.push({name:this.download,href:this.href});return;
  }
  return anchorClick.apply(this,args);
};

const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(id);
const dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});

const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`GLOW_EDITOR_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const until=performance.now()+15000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`GLOW_EDITOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const glow=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.glow??{};
const preview=()=>new Uint8ClampedArray(session.previewPixels?.data??[]);
const different=(left,right)=>left.length===right.length&&left.some((value,index)=>value!==right[index]);
async function setMode(mode){
  const previous=session.state.afterURL,oldPixels=preview(),control=byID('#glow-mode');control.value=mode;
  control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>glow().mode===mode&&session.state.busy===null&&session.state.afterURL!==previous,
    `Editor Glow mode ${mode}`);
  expect(control.value===mode,`Glow mode UI ${mode}`);
  if(glow().intensity>0)expect(different(oldPixels,preview()),`Glow ${mode} changes Worker Preview pixels`);
}
async function setGlowControl(field,value){
  const previous=session.state.afterURL,oldPixels=preview(),control=byID(`#glow-${field}`);
  control.value=String(value);control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>glow()[field]===value&&session.state.busy===null&&session.state.afterURL!==previous,
    `Editor Glow ${field} ${value}`);
  expect(Number(control.value)===value,`Glow ${field} UI value`);
  expect(different(oldPixels,preview()),`Glow ${field} ${value} changes Worker Preview pixels`);
}
async function saveAndReload(){
  const old=savedRevision;
  expect(!byID('[data-action="save"]').disabled&&session.state.dirty,'save enabled for Glow draft');
  byID('[data-action="save"]').click();
  await waitFor(()=>session.state.revision===old+1&&
    !session.state.dirty&&session.state.busy===null,'Glow Recipe save');
  const saved=await client.getRecipe(id);
  expect(saved.revision===old+1&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'actual Trial HTTP/SQLite Recipe save matches Editor');
  savedRevision=saved.revision;
  const fixed=JSON.stringify(glow()),previous=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.busy===null&&Boolean(session.state.afterURL)&&
    session.state.afterURL!==previous&&!byID('[data-action="export-png"]').disabled,
    'Glow saved Recipe reload');
  expect(JSON.stringify(glow())===fixed&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'saved Glow controls survive reloading');
}
async function pixels(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(bitmap,0,0);
  const value=context.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return value;
}
async function exportViaUI(){
  expect(!byID('[data-action="export-png"]').disabled,'PNG Final enabled after save');
  const old=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===old+1&&!session.state.exporting,
    'Glow Final via Editor PNG button');
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    'real Final PNG Blob linked');
  return {blob,data:await pixels(blob)};
}
async function runBrowserChecks(){
  const result={modes:[],mask:null,history:null,savedRevisions:[]};
  expect(session.state.asset.id===id&&!session.state.dirty&&session.state.revision===1,
    'authenticated Trial saved synthetic non-RAW Editor');
  const base=(await exportViaUI()).data;
  await setMode('whiteMist');
  for(const [field,value] of [['intensity',80],['radius',9],['threshold',110],
    ['diffusion',60],['tint',30],['exposure',25]])await setGlowControl(field,value);
  await setGlowControl('exposure',45);
  const afterRedo=JSON.stringify(glow()),previousUndo=session.state.afterURL;
  byID('[data-action="undo"]').click();
  await waitFor(()=>glow().exposure===25&&session.state.afterURL!==previousUndo&&
    session.state.busy===null,'Glow Undo');
  const previousRedo=session.state.afterURL;
  byID('[data-action="redo"]').click();
  await waitFor(()=>JSON.stringify(glow())===afterRedo&&session.state.afterURL!==previousRedo&&
    session.state.busy===null,'Glow Redo');
  result.history={undoExposure:25,redoExposure:glow().exposure};

  expect(Boolean(session.state.glowMaskURL),'Glow preview mask URL generated');
  const maskBlob=blobs.get(session.state.glowMaskURL),maskPixels=await pixels(maskBlob);
  expect(maskPixels.some((value,index)=>index%4===3&&value>0),'Glow preview mask has visible alpha');
  const beforeURL=session.state.beforeURL,afterURL=session.state.afterURL;
  expect(byID('#glow-mask-overlay').hidden,'mask initially hidden');
  byID('#glow-mask-toggle').click();
  expect(!byID('#glow-mask-overlay').hidden&&
    byID('#glow-mask-toggle').getAttribute('aria-pressed')==='true',
    'Show Glow Mask displays only After overlay');
  byID('[data-view="before"]').click();
  expect(byID('#glow-mask-overlay').hidden,'Before view hides Glow Mask');
  byID('[data-view="after"]').click();
  expect(!byID('#glow-mask-overlay').hidden&&session.state.beforeURL===beforeURL&&
    session.state.afterURL===afterURL,'After restores mask without rerendering source');
  result.mask={nonzeroAlpha:true,beforeHidden:true,afterShown:true};

  await saveAndReload();result.savedRevisions.push(savedRevision);
  const whiteWithMask=(await exportViaUI()).data;
  byID('#glow-mask-toggle').click();
  expect(byID('#glow-mask-overlay').hidden,'Show Glow Mask toggle hides overlay');
  const whiteWithoutMask=(await exportViaUI()).data;
  expect(!different(whiteWithMask,whiteWithoutMask),'Preview Glow Mask never enters Final');
  expect(different(base,whiteWithMask),'White Mist changes actual Final pixels');
  result.modes.push({mode:'whiteMist',changedPixels:true,maskExcludedFromFinal:true});

  let previousMode=whiteWithoutMask;
  for(const mode of ['blackMist','halation']){
    await setMode(mode);
    await saveAndReload();result.savedRevisions.push(savedRevision);
    const final=(await exportViaUI()).data;
    expect(different(base,final)&&different(previousMode,final),
      `${mode} actual Final pixels differ from neutral and preceding mode`);
    result.modes.push({mode,changedPixels:true,distinctFromPrevious:true});
    previousMode=final;
  }
  expect(finalDecodeCount===5&&autoClicks.length===5,'baseline plus four Glow Final operations');
  const storedOriginal=await client.getOriginal(id);
  expect((await checksum(original))===asset.sha256&&
    new Uint8Array(original).every((value,index)=>value===originalBytes[index])&&
    (await checksum(storedOriginal))===asset.sha256&&
    session.state.asset.sha256===asset.sha256,'Original bytes and SHA unchanged');
  const saved=await client.getRecipe(id);
  expect(!session.state.dirty&&savedRevision===4&&saved.revision===4&&
    JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'three saved Glow mode revisions remain fixed');

  const choices=[...byID('#batch-targets').querySelectorAll('input[name="batch-target"]')];
  expect(choices.length===2&&choices.every(input=>!input.disabled),
    'two explicitly selectable saved target photos');
  for(const input of choices)input.click();
  const syncButton=byID('#glow-sync-apply');
  expect(!syncButton.disabled,'Glow-only Sync enabled for two selected targets');
  syncButton.click();
  await waitFor(()=>byID('#glow-sync-outcome').textContent.includes('2/2')&&
    session.state.busy===null,'actual Editor Glow-only Sync result');
  const synced=[];
  for(const target of targets){
    const stored=await client.getRecipe(target.asset.id);
    expect(stored.revision===2&&
      JSON.stringify(stored.body.parameters.extendedParameters.postDecodeAdjustments.color.glow)===JSON.stringify(glow())&&
      stored.body.parameters.exposure===target.body.parameters.exposure,
      'Glow-only Sync saved Glow while retaining target exposure');
    expect((await checksum(await client.getOriginal(target.asset.id)))===target.asset.sha256,
      'Glow-only Sync leaves target Original SHA unchanged');
    synced.push({assetId:target.asset.id,revision:stored.revision,exposure:stored.body.parameters.exposure});
  }
  await session.openAsset(targets[0].asset.id);
  expect(JSON.stringify(glow())===JSON.stringify(saved.body.parameters.extendedParameters.postDecodeAdjustments.color.glow)&&
    session.state.revision===2&&!session.state.dirty,'synced Glow reloads into actual Editor');
  const targetFinal=(await exportViaUI()).data;
  expect(different(base,targetFinal),'synced Glow changes target actual Worker Final pixels');
  result.sync={selected:2,saved:2,reloaded:true,targetFinalDiff:true,targets:synced};
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'GLOW-EDITOR-BROWSER-PASS',
    boundary:'authenticated Trial HTTP/SQLite synthetic non-RAW Editor -> saved Recipe -> actual Worker Preview/Final',
    originalSHA:asset.sha256,finalDecodeCount,...result});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'GLOW-EDITOR-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        glow:glow(),afterURL:session.state.afterURL,maskURL:session.state.glowMaskURL},
      savedRevision,finalDecodeCount});
  });
});
