import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Real Trial HTTP/SQLite and real Browser Worker, but deliberately synthetic
// non-RAW decode data. This must never be reported as camera RAW or Cloud PASS.
const client=new TrialClient();
const {inviteToken}=await (await fetch('/fixture/invite')).json();
await client.login(inviteToken);
const original=new TextEncoder().encode('SYNTHETIC_NON_RAW_GRAIN_TRIAL_ORIGINAL').buffer;
const initialSHA=await checksum(original);
const registered=await client.createAsset({name:'grain-trial.NONRAW',sha256:initialSHA,size:original.byteLength});
const asset=await client.putOriginal(registered.id,original.slice(0));
const first=await client.saveRecipe(asset.id,0,neutralRecipe());
if(first.revision!==1)throw Error('GRAIN_TRIAL_INITIAL_RECIPE');

function frame(){
  const width=96,height=72,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,base=x<32?35:x<64?125:215;
    data[at]=Math.min(255,base+y%17);
    data[at+1]=Math.max(0,base-y%13);
    data[at+2]=Math.min(255,base+x%11);data[at+3]=255;
  }
  return {width,height,data};
}
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodes=0,holdFinal=false,holdReached=false;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(bytes,{mode,signal}={}){
  if(!['proxy','final'].includes(mode)||new TextDecoder().decode(bytes)!=='SYNTHETIC_NON_RAW_GRAIN_TRIAL_ORIGINAL')
    throw Error('SYNTHETIC_NON_RAW_ONLY');
  if(mode==='final'){
    finalDecodes++;
    if(holdFinal){
      holdReached=true;
      await new Promise((resolve,reject)=>{
        if(signal?.aborted){reject(Error('EXPORT_ABORTED'));return;}
        signal?.addEventListener('abort',()=>reject(Error('EXPORT_ABORTED')),{once:true});
      });
    }
  }
  return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const blobs=new Map(),autoClicks=[];
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){autoClicks.push({name:this.download,href:this.href});return;}
  return anchorClick.apply(this,args);
};
const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(asset.id);
const dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
const find=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`GRAIN_TRIAL_BROWSER_ASSERTION: ${label}`);};
async function waitFor(predicate,label){
  const deadline=performance.now()+18000;
  while(!predicate()){
    if(performance.now()>deadline)throw Error(`GRAIN_TRIAL_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const grain=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.detail?.grain??{};
async function pixels(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);
  const data=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return data;
}
const different=(left,right)=>left.length===right.length&&left.some((value,index)=>value!==right[index]);
async function previewPixels(){
  await waitFor(()=>session.state.busy===null&&blobs.get(session.state.afterURL) instanceof Blob,
    'settled real Worker Preview PNG');
  const blob=blobs.get(session.state.afterURL);
  expect(blob instanceof Blob&&blob.type==='image/png','real Worker Preview PNG');
  return pixels(blob);
}
async function setGrain(field,value){
  const input=find(field==='amount'?'#detail-grain':`#grain-${field}`);
  expect(input instanceof HTMLInputElement&&!input.disabled,`${field} product Editor control`);
  const previous=session.state.afterURL;
  input.value=String(value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>grain()[field]===value&&session.state.busy===null&&
    session.state.afterURL!==previous&&blobs.get(session.state.afterURL) instanceof Blob,
  `${field} UI→Recipe→Worker Preview`);
}
async function exportPNG(label){
  const button=find('[data-action="export-png"]');
  await waitFor(()=>!button.disabled,`${label} Final button render`);
  expect(!button.disabled,`${label} Final button enabled`);
  const count=autoClicks.length;button.click();
  await waitFor(()=>autoClicks.length===count+1&&!session.state.exporting,`${label} Final PNG`);
  const link=find('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    `${label} actual Worker Final Blob`);
  return pixels(blob);
}
async function run(){
  expect(session.state.asset?.id===asset.id&&session.state.revision===1&&!session.state.dirty,
    'saved Trial Asset loaded');
  const baseline=await previewPixels(),baselineFinal=await exportPNG('baseline');
  let previous=baseline;
  const controls=[['amount',90],['shadows',10],['midtones',35],['highlights',65],
    ['size',55],['roughness',70],['colorVariation',80]];
  for(const [field,value] of controls){
    await setGrain(field,value);
    const next=await previewPixels();
    expect(different(previous,next),`${field} changes real Preview pixels`);
    previous=next;
  }
  const fixed=JSON.stringify(grain()),beforeUndo=previous,undoURL=session.state.afterURL;
  find('[data-action="undo"]').click();
  await waitFor(()=>grain().colorVariation===undefined&&session.state.afterURL!==undoURL&&
    !find('[data-action="redo"]').disabled,'Undo Grain');
  expect(different(beforeUndo,await previewPixels()),'Undo changes Preview pixels');
  const redoURL=session.state.afterURL;
  find('[data-action="redo"]').click();
  await waitFor(()=>JSON.stringify(grain())===fixed&&session.state.afterURL!==redoURL,
    'Redo Grain');
  expect(!different(beforeUndo,await previewPixels()),'Redo exact deterministic Preview');
  expect(!find('[data-action="save"]').disabled,'Save enabled');
  find('[data-action="save"]').click();
  await waitFor(()=>session.state.revision===2&&!session.state.dirty&&session.state.busy===null,
    'real Trial CAS Save');
  let saved=await client.getRecipe(asset.id);
  expect(saved.revision===2&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    'SQLite saved Recipe equals Editor Recipe');
  const reloadURL=session.state.afterURL;
  find('[data-action="reload"]').click();
  await waitFor(()=>session.state.afterURL!==reloadURL&&session.state.busy===null,
    'real Trial Recipe reload');
  expect(JSON.stringify(grain())===fixed&&!session.state.dirty,'seven Grain values survive Trial reload');
  const final=await exportPNG('saved Grain');
  expect(different(baselineFinal,final),'saved Grain changes actual Worker Final pixels');
  expect((await checksum(await client.getOriginal(asset.id)))===initialSHA&&
    session.state.asset.sha256===initialSHA,'Original bytes/SHA unchanged after Final');

  // A held Final must abort without a new download, using the real UI cancel.
  holdFinal=true;holdReached=false;
  const clicks=autoClicks.length;
  find('[data-action="export-png"]').click();
  await waitFor(()=>holdReached&&session.state.exporting&&
    !find('[data-action="cancel-export"]').hidden,'held Final exposes cancel');
  find('[data-action="cancel-export"]').click();
  await waitFor(()=>!session.state.exporting,'cancelled Final settles');
  expect(autoClicks.length===clicks,'cancel creates no new Final click');
  holdFinal=false;

  // Concurrent CAS advance; stale Editor save may not claim success.
  const concurrent=await client.saveRecipe(asset.id,2,saved.body);
  expect(concurrent.revision===3,'independent Trial CAS advance');
  await setGrain('colorVariation',45);
  find('[data-action="save"]').click();
  await waitFor(()=>session.state.busy===null&&Boolean(session.state.error),'stale Save rejected');
  saved=await client.getRecipe(asset.id);
  expect(saved.revision===3&&saved.body.parameters.extendedParameters.postDecodeAdjustments.detail.grain.colorVariation===80&&
    session.state.dirty&&session.state.revision===2,'stale CAS leaves SQLite head unchanged');
  const originalAfterConflict=await client.getOriginal(asset.id);
  expect(await checksum(originalAfterConflict)===initialSHA,'Original unchanged after CAS rejection');

  const revoked=await fetch('/fixture/revoke',{method:'POST'});
  expect(revoked.ok&&Boolean((await revoked.json()).revoked),'fixture revokes real Trial invitation');
  let permissionDenied=false,recipeDenied=false;
  try{await client.assertPermission(asset.id,'edit');}catch{permissionDenied=true;}
  try{await client.getRecipe(asset.id);}catch{recipeDenied=true;}
  expect(permissionDenied&&recipeDenied,'revoked Trial cannot authorize or reload Recipe');
  const ended=await client.getSession();
  expect(ended.principal===null&&ended.endedReason==='TRIAL_REVOKED','Trial session reports revocation');
  expect(autoClicks.length===clicks,'no Final generated after cancel/conflict/revocation');
  dispose();worker.dispose();
  find('#probe-verdict').textContent=JSON.stringify({result:'GRAIN-TRIAL-BROWSER-PASS',
    boundary:'real Trial HTTP/SQLite + Chrome Worker; synthetic non-RAW',
    controls:controls.map(([field])=>field),savedRevision:2,serverHeadAfterConflict:3,
    finalDecodes,undoRedo:true,cancelled:true,staleRejected:true,revoked:true,originalSHA:initialSHA});
}
find('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{
    find('#probe-verdict').textContent=JSON.stringify({result:'GRAIN-TRIAL-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{busy:session.state.busy,dirty:session.state.dirty,revision:session.state.revision,
        exporting:session.state.exporting,grain:grain()},finalDecodes});
  });
});
