import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Real Editor, Author/Library UI, Trial HTTP+SQLite and Worker Final. The decode
// input is deliberately synthetic non-RAW; it proves no camera RAW fidelity.
const client=new TrialClient();
const invitation=await (await fetch('/fixture/new')).json();
await client.login(invitation.inviteToken);
const originalBytes=new TextEncoder().encode('SYNTHETIC_NON_RAW_GLOW_AUTHOR_ORIGINAL').buffer;
const initialSHA=await checksum(originalBytes);
async function createSavedAsset(label,bytes){
  const registered=await client.createAsset({name:`${label}.NONRAW`,sha256:await checksum(bytes),size:bytes.byteLength});
  const asset=await client.putOriginal(registered.id,bytes.slice(0));
  const recipe=await client.saveRecipe(asset.id,0,neutralRecipe());
  if(recipe.revision!==1)throw Error(`initial ${label} Recipe revision`);
  return asset;
}
const sourceAsset=await createSavedAsset('glow-author-source',originalBytes);
const targets=[];
for(const mode of ['whiteMist','blackMist','halation']){
  const bytes=new TextEncoder().encode(`SYNTHETIC_NON_RAW_GLOW_AUTHOR_ORIGINAL_${mode}`).buffer;
  targets.push({mode,asset:await createSavedAsset(`glow-author-${mode}`,bytes)});
}
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
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodeCount=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(bytes,{mode}={}){
  if(!['proxy','final'].includes(mode)||
      !new TextDecoder().decode(bytes).startsWith('SYNTHETIC_NON_RAW_GLOW_AUTHOR_ORIGINAL'))
    throw Error('SYNTHETIC_NON_RAW_ONLY');
  if(mode==='final')finalDecodeCount++;
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

const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(sourceAsset.id);
const dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
const byID=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`GLOW_AUTHOR_BROWSER_ASSERTION: ${label}`);};
const glow=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.glow??{};
const sameGlow=(left,right)=>left?.mode===right?.mode&&
  ['intensity','radius','threshold','exposure','diffusion','tint']
    .every(field=>left[field]===right[field]);
async function waitFor(predicate,label){
  const until=performance.now()+18000;
  while(!predicate()){
    if(performance.now()>until)throw Error(`GLOW_AUTHOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
async function selectPhoto(assetID){
  const selector=`#filmstrip-items [data-asset-id="${assetID}"]`;
  await waitFor(()=>Boolean(byID(selector)&&!byID(selector).disabled),
    `filmstrip target ${assetID} becomes available`);
  const item=byID(selector);
  item.click();
  await waitFor(()=>session.state.asset?.id===assetID&&session.state.busy===null&&
    Boolean(session.state.afterURL)&&!byID('[data-action="export-png"]').disabled,
    'filmstrip opens selected Asset');
}
async function setGlow(mode,controls){
  const modeInput=byID('#glow-mode');expect(!modeInput.disabled,'Glow mode enabled');
  modeInput.value=mode;modeInput.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>glow().mode===mode&&session.state.busy===null,`Glow mode ${mode}`);
  for(const [field,value] of Object.entries(controls)){
    const input=byID(`#glow-${field}`);expect(input&&!input.disabled,`Glow ${field} enabled`);
    input.value=String(value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await waitFor(()=>glow()[field]===value&&session.state.busy===null,`Glow ${field} ${value}`);
  }
  expect(Object.entries(controls).every(([field,value])=>glow()[field]===value),
    'all six Glow values reached the actual Editor Recipe');
}
async function saveCurrent(label){
  const old=session.state.revision;
  expect(session.state.dirty&&!byID('[data-action="save"]').disabled,`${label} Save UI enabled`);
  byID('[data-action="save"]').click();
  await waitFor(()=>session.state.revision===old+1&&!session.state.dirty&&session.state.busy===null,
    `${label} real Trial Recipe CAS Save`);
  const saved=await client.getRecipe(session.state.asset.id);
  expect(saved.revision===old+1&&JSON.stringify(saved.body)===JSON.stringify(session.state.recipe),
    `${label} persisted Recipe matches UI`);
  return saved;
}
async function reloadCurrent(label){
  const recipe=JSON.stringify(session.state.recipe),oldURL=session.state.afterURL;
  byID('[data-action="reload"]').click();
  await waitFor(()=>session.state.afterURL!==oldURL&&session.state.busy===null&&
    !byID('[data-action="export-png"]').disabled,
    `${label} actual Editor reload`);
  expect(JSON.stringify(session.state.recipe)===recipe&&!session.state.dirty,
    `${label} saved Glow survives reload`);
}
async function pixels(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);
  const data=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return data;
}
const different=(left,right)=>left.length===right.length&&left.some((value,index)=>value!==right[index]);
async function exportViaUI(label){
  await waitFor(()=>!byID('[data-action="export-png"]').disabled,
    `${label} Final UI becomes ready`);
  expect(!byID('[data-action="export-png"]').disabled,`${label} Final enabled`);
  const before=autoClicks.length;
  byID('[data-action="export-png"]').click();
  await waitFor(()=>autoClicks.length===before+1&&!session.state.exporting,`${label} Worker Final`);
  const link=byID('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    `${label} real Final PNG Blob`);
  return pixels(blob);
}
async function publishAuthorDraft(mode,expected){
  const name=`Glow Author ${mode}`;
  await waitFor(()=>!byID('#trial-new-draft').disabled,`new Draft UI ${mode} becomes ready`);
  const newDraft=byID('#trial-new-draft');expect(!newDraft.disabled,'new Draft UI enabled');
  newDraft.click();
  const capture=byID('#trial-capture-global');
  await waitFor(()=>!capture.disabled,`saved source capture UI ${mode} becomes ready`);
  expect(!capture.disabled,'saved source can be captured');capture.click();
  const nameInput=byID('#trial-look-name');nameInput.value=name;
  nameInput.dispatchEvent(new Event('input',{bubbles:true}));
  expect(!byID('#trial-save-draft').disabled,'Author Draft Save UI enabled');
  byID('#trial-save-draft').click();
  await waitFor(()=>byID('#trial-author-status').textContent.includes('下書きをサーバーへ保存しました')&&
    byID('#trial-look-status').textContent==='DRAFT',`Author Draft Save ${mode}`);
  const drafts=await client.listDrafts(),draft=drafts.find(item=>item.name===name);
  expect(draft?.status==='DRAFT'&&draft.source?.assetID===sourceAsset.id,
    `Author Draft source Asset ${mode}`);
  const savedGlow=draft.parameters.postDecodeAdjustments?.color?.glow;
  expect(sameGlow(savedGlow,expected),
    `Author portable Draft preserves mode + six values ${mode}`);
  byID('#trial-refresh-drafts').click();
  await waitFor(()=>byID('#trial-author-status').textContent.includes('サーバーから取得しました'),
    `Author Draft reload ${mode}`);
  const draftItem=[...byID('#trial-draft-list').querySelectorAll('button')]
    .find(button=>button.textContent.includes(name));
  expect(draftItem,'saved Draft appears in real Author UI');draftItem.click();
  expect(byID('#trial-global-preview').textContent.includes(mode),
    `Author Draft reloaded with Glow ${mode}`);
  expect(!byID('#trial-submit-draft').disabled,'Author Submit UI enabled');
  byID('#trial-submit-draft').click();
  await waitFor(()=>byID('#trial-look-status').textContent==='SUBMITTED',
    `Author Submit ${mode}`);
  let selfReviewRejected=false;
  try{await client.reviewDraft(draft.id,{expectedRevision:draft.revision,decision:'ACCEPTED'});}
  catch{selfReviewRejected=true;}
  expect(selfReviewRejected,'author cannot approve own Draft');
  const reviewed=await fetch('/fixture/admin-review',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({draftID:draft.id,revision:draft.revision})});
  expect(reviewed.ok,`distinct authenticated admin accepts ${mode}`);
  const response=await reviewed.json();
  expect(response.preset?.parameters?.postDecodeAdjustments?.color?.glow?.mode===mode,
    `review publishes frozen Glow ${mode}`);
  const published=(await client.listPresets()).find(item=>item.name===name);
  expect(published?.version===draft.revision&&
    sameGlow(published.parameters.postDecodeAdjustments.color.glow,expected),
    `published Preset reload retains Glow ${mode}`);
  return {name,draftID:draft.id,presetID:published.id,version:published.version,sha256:published.sha256};
}
async function applyPublishedPreset(name,expected){
  const section=byID('.preset-library'),refresh=section.querySelector('.panel-title button');
  expect(!refresh.disabled,'Preset Library refresh enabled');refresh.click();
  await waitFor(()=>[...section.querySelectorAll('.draft-list-item')]
    .some(button=>button.textContent.includes(name)),`published Preset ${name} visible`);
  const item=[...section.querySelectorAll('.draft-list-item')]
    .find(button=>button.textContent.includes(name));
  expect(!item.disabled,'published Preset UI Apply enabled');item.click();
  await waitFor(()=>session.state.dirty&&sameGlow(glow(),expected)&&
    section.querySelector('[role="status"]').textContent.includes('未保存'),
    `Preset Apply from actual Library ${name}`);
  const undo=byID('[data-action="undo"]'),redo=byID('[data-action="redo"]');
  await waitFor(()=>!undo.disabled,`Preset ${name} Undo becomes available`);
  undo.click();
  await waitFor(()=>!sameGlow(glow(),expected)&&session.state.busy===null&&
    !redo.disabled,`Preset ${name} Undo restores prior target`);
  redo.click();
  await waitFor(()=>sameGlow(glow(),expected)&&session.state.busy===null,
    `Preset ${name} Redo reapplies Glow`);
}
async function verifyGlowOnlyOnEditedTarget(published,expected){
  expect(session.state.asset?.id===targets[2].asset.id,'Glow-only target is selected');
  await session.setAdjustment('exposure',1.25);
  await session.setAdjustment('color.temperature',32);
  await session.setAdjustment('detail.clarity',22);
  await session.setAdjustment('rotationDegrees',90);
  await saveCurrent('edited Glow-only target');
  const before=structuredClone(session.state.recipe);
  const beforePixels=await exportViaUI('edited target before Glow-only');
  let rejectedVersion=false;
  try{await session.applyPublishedAuthorGlowOnly({presetID:published.presetID,
    expectedVersion:published.version+1,expectedSHA256:published.sha256});}
  catch{rejectedVersion=true;}
  expect(rejectedVersion&&!session.state.dirty&&JSON.stringify(session.state.recipe)===JSON.stringify(before),
    'old or mismatched published Preset version leaves saved target unchanged');
  const originalGet=client.getOriginal.bind(client);
  client.getOriginal=async()=>{throw Error('INJECTED_ORIGINAL_READ_FAILURE');};
  let rejectedOriginal=false;
  try{await session.applyPublishedAuthorGlowOnly({presetID:published.presetID,
    expectedVersion:published.version,expectedSHA256:published.sha256});}
  catch{rejectedOriginal=true;}finally{client.getOriginal=originalGet;}
  expect(rejectedOriginal&&!session.state.dirty&&JSON.stringify(session.state.recipe)===JSON.stringify(before),
    'Original read failure produces no Glow draft or partial Recipe');
  const section=byID('.preset-library'),refresh=section.querySelector('.panel-title button');
  refresh.click();
  await waitFor(()=>[...section.querySelectorAll('.preset-apply-row')]
    .some(row=>row.querySelector('.draft-list-item')?.textContent.includes(published.name)&&
      row.querySelector('.author-glow-only-apply')?.disabled===false),
    'published preset row reloaded for Glow-only');
  const row=[...section.querySelectorAll('.preset-apply-row')]
    .find(item=>item.querySelector('.draft-list-item')?.textContent.includes(published.name));
  const action=row.querySelector('.author-glow-only-apply');
  expect(action&&!action.disabled,'Glow-only is a separate enabled real UI operation');
  action.click();
  await waitFor(()=>session.state.dirty&&sameGlow(glow(),expected)&&
    section.querySelector('[role="status"]').textContent.includes('Recipeは未保存'),
    'Glow-only UI applies as unsaved Recipe only');
  const after=structuredClone(session.state.recipe);
  delete before.parameters.extendedParameters.postDecodeAdjustments.color.glow;
  delete after.parameters.extendedParameters.postDecodeAdjustments.color.glow;
  expect(JSON.stringify(after)===JSON.stringify(before),
    'Glow-only retains exposure, color, detail, rotation and all other target fields');
  const undo=byID('[data-action="undo"]'),redo=byID('[data-action="redo"]');
  undo.click();await waitFor(()=>!sameGlow(glow(),expected)&&!redo.disabled,
    'Glow-only Undo restores target Glow');
  redo.click();await waitFor(()=>sameGlow(glow(),expected)&&session.state.busy===null,
    'Glow-only Redo reapplies only published Glow');
  await saveCurrent('Glow-only target CAS');await reloadCurrent('Glow-only target reload');
  const final=await exportViaUI('edited target after Glow-only');
  expect(different(beforePixels,final),'Glow-only affects real Worker Final PNG pixels');
  expect((await checksum(await client.getOriginal(targets[2].asset.id)))===targets[2].asset.sha256,
    'Glow-only target Original remains unchanged');
  const current=structuredClone(session.state.recipe),revision=session.state.revision;
  const concurrent=await client.saveRecipe(targets[2].asset.id,revision,current);
  expect(concurrent.revision===revision+1,'separate Trial writer advances target Recipe version');
  let rejectedTargetVersion=false;
  try{await session.applyPublishedAuthorGlowOnly({presetID:published.presetID,
    expectedVersion:published.version,expectedSHA256:published.sha256});}
  catch{rejectedTargetVersion=true;}
  expect(rejectedTargetVersion&&!session.state.dirty&&session.state.revision===revision&&
    JSON.stringify(session.state.recipe)===JSON.stringify(current),
    'stale target Recipe cannot produce a Glow-only draft');
  return {targetRevision:session.state.revision,finalPixelsDiffer:true,nonGlowPreserved:true,
    oldPresetVersionRejected:true,oldTargetVersionRejected:true,originalReadFailureRejected:true};
}
async function runBrowserChecks(){
  const results=[];
  let firstPublished=null;
  expect(location.search.includes('view=author')&&byID('#trial-author-form')&&
    byID('.preset-library'),'actual Author and Library UI mounted');
  expect(session.state.asset?.id===sourceAsset.id&&session.state.revision===1,
    'authenticated saved source Asset loaded');
  const settings=[
    ['whiteMist',{intensity:78,radius:9,threshold:110,exposure:34,diffusion:62,tint:28}],
    ['blackMist',{intensity:66,radius:7,threshold:97,exposure:22,diffusion:54,tint:-25}],
    ['halation',{intensity:88,radius:11,threshold:124,exposure:40,diffusion:71,tint:36}],
  ];
  let precedingFinal=null;
  for(const [mode,controls] of settings){
    if(session.state.asset.id!==sourceAsset.id)await selectPhoto(sourceAsset.id);
    await setGlow(mode,controls);
    const savedSource=await saveCurrent(`source ${mode}`);
    await reloadCurrent(`source ${mode}`);
    const expected=structuredClone(glow());
    const published=await publishAuthorDraft(mode,expected);
    firstPublished??=published;
    const target=targets.find(item=>item.mode===mode).asset;
    await selectPhoto(target.id);
    const neutral=await exportViaUI(`neutral target ${mode}`);
    await applyPublishedPreset(published.name,expected);
    const savedTarget=await saveCurrent(`target ${mode}`);
    await reloadCurrent(`target ${mode}`);
    const final=await exportViaUI(`published Glow ${mode}`);
    expect(different(neutral,final),`${mode} changes actual Worker Final pixels`);
    if(precedingFinal)expect(different(precedingFinal,final),`${mode} Final distinct from previous mode`);
    precedingFinal=final;
    expect((await checksum(await client.getOriginal(target.id)))===target.sha256,
      `${mode} target Original SHA unchanged`);
    let staleCAS=false;
    try{await client.saveRecipe(target.id,1,savedTarget.body);}catch{staleCAS=true;}
    expect(staleCAS&&((await client.getRecipe(target.id)).revision===savedTarget.revision),
      `${mode} stale target Recipe CAS rejected without overwrite`);
    results.push({mode,controls,sourceRevision:savedSource.revision,targetRevision:savedTarget.revision,
      publishedVersion:published.version,finalPixelsDiffer:true});
  }
  expect((await checksum(await client.getOriginal(sourceAsset.id)))===initialSHA&&
    (await checksum(originalBytes))===initialSHA,'source Original bytes and SHA unchanged');
  const glowOnly=await verifyGlowOnlyOnEditedTarget(firstPublished,
    {mode:settings[0][0],...settings[0][1]});
  expect(finalDecodeCount===8,'three neutral, three full-preset and two Glow-only Worker Finals');
  const otherResponse=await fetch('/fixture/other-owner',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({draftID:firstPublished.draftID,assetID:sourceAsset.id})});
  expect(otherResponse.ok,'independent other-owner HTTP check returned');
  const other=await otherResponse.json();
  expect([403,404].includes(other.draftStatus)&&[403,404].includes(other.recipeStatus)&&
    [403,404].includes(other.originalStatus),
    'separate author cannot read private Draft, source Recipe or Original');
  const revoked=await fetch('/fixture/revoke-author',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({invitationID:invitation.invitationID})});
  expect(revoked.ok,'separate admin revokes real Trial membership');
  let permissionDenied=false,recipeDenied=false;
  try{await client.assertPermission(targets[2].asset.id,'edit');}catch{permissionDenied=true;}
  try{await client.getRecipe(targets[2].asset.id);}catch{recipeDenied=true;}
  const ended=await client.getSession();
  expect(permissionDenied&&recipeDenied&&ended.principal===null&&ended.endedReason==='TRIAL_REVOKED',
    'revoked author cannot edit or reload Recipe; session reports revocation');
  dispose();worker.dispose();
  byID('#probe-verdict').textContent=JSON.stringify({result:'GLOW-AUTHOR-TRIAL-BROWSER-PASS',
    boundary:'real Chrome Editor Author/Library + separate admin Trial HTTP/SQLite + synthetic non-RAW Worker Final',
    resultCount:results.length,results,sourceOriginalSHA:initialSHA,finalDecodeCount,
    otherOwner:other,revocation:ended.endedReason,libraryUndoRedo:true,glowOnly,
    incompleteGate:'Personal/Workspace OIDC host, real RAW, Cloud and physical device NOT_RUN'});
}
byID('#probe-run').addEventListener('click',()=>{
  void runBrowserChecks().catch(error=>{
    byID('#probe-verdict').textContent=JSON.stringify({result:'GLOW-AUTHOR-TRIAL-BROWSER-FAIL',
      error:error.message,stack:error.stack,sessionError:session.state.error,
      state:{asset:session.state.asset?.id,revision:session.state.revision,
        dirty:session.state.dirty,busy:session.state.busy,glow:glow()},finalDecodeCount});
  });
});
