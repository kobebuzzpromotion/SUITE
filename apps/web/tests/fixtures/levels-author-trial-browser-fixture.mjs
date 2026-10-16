import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession,checksum,neutralRecipe} from '../../src/session.mjs';
import {mountEditor} from '../../src/editor-ui.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

// Authenticated Trial HTTP/SQLite and real Chrome Worker, but synthetic non-RAW
// decode. This cannot establish camera RAW or deployed Cloud fidelity.
const client=new TrialClient();
const invitation=await (await fetch('/fixture/new')).json();
await client.login(invitation.inviteToken);
async function savedAsset(label){
  const bytes=new TextEncoder().encode(`SYNTHETIC_NON_RAW_LEVELS_AUTHOR_ORIGINAL_${label}`).buffer;
  const sha256=await checksum(bytes);
  const registered=await client.createAsset({name:`${label}.NONRAW`,sha256,size:bytes.byteLength});
  const asset=await client.putOriginal(registered.id,bytes.slice(0));
  const recipe=await client.saveRecipe(asset.id,0,neutralRecipe());
  if(recipe.revision!==1)throw Error(`initial ${label} Recipe version`);
  return {asset,bytes,sha256};
}
const source=await savedAsset('levels-author-source');
const target=await savedAsset('levels-author-target');
const frame=()=>{
  const width=80,height=60,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;
    data.set([24+x*2,36+y*3,230-x*2,255],at);
  }
  return {width,height,data};
};
const worker=createProcessing({workerURL:'/processing-worker.js'});
let finalDecodes=0;
const processing={...worker,syntheticTestOnly:true,async decodeRaw(bytes,{mode}={}){
  if(!['proxy','final'].includes(mode)||
      !new TextDecoder().decode(bytes).startsWith('SYNTHETIC_NON_RAW_LEVELS_AUTHOR_ORIGINAL'))
    throw Error('SYNTHETIC_NON_RAW_ONLY');
  if(mode==='final')finalDecodes++;
  return {pixels:frame(),provenance:{fixture:'SYNTHETIC_NON_RAW'}};
}};
const blobs=new Map(),downloads=[];
const createURL=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);blobs.set(url,blob);return url;};
const clickAnchor=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(...args){
  if(this.download&&this.href.startsWith('blob:')){downloads.push({name:this.download,href:this.href});return;}
  return clickAnchor.apply(this,args);
};
const session=new EditorSession({api:client,processing,personProcessingStatus:'SYNTHETIC_TEST_ONLY'});
await session.initialize();await session.openAsset(source.asset.id);
const dispose=mountEditor(session,{trialSession:await client.getSession(),authorAPI:client});
const find=selector=>document.querySelector(selector);
const expect=(condition,label)=>{if(!condition)throw Error(`LEVELS_AUTHOR_BROWSER_ASSERTION: ${label}`);};
const levels=()=>session.state.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.levels??{};
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
async function waitFor(predicate,label){
  const deadline=performance.now()+25000;
  while(!predicate()){
    if(performance.now()>deadline)throw Error(`LEVELS_AUTHOR_BROWSER_TIMEOUT: ${label}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
async function pixels(blob){
  const bitmap=await createImageBitmap(blob);
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
  bitmap.close();return data;
}
const different=(a,b)=>a.length===b.length&&a.some((value,index)=>value!==b[index]);
async function exportPNG(label){
  const button=find('[data-action="export-png"]');
  await waitFor(()=>!button.disabled,`${label} Final UI enabled`);
  const count=downloads.length;button.click();
  await waitFor(()=>downloads.length===count+1&&!session.state.exporting,`${label} Worker Final`);
  const link=find('#download-link'),blob=blobs.get(link.href);
  expect(!link.hidden&&blob instanceof Blob&&blob.type==='image/png'&&blob.size>0,
    `${label} real Worker Final PNG`);
  return pixels(blob);
}
async function saveCurrent(label){
  const revision=session.state.revision;
  await waitFor(()=>session.state.dirty&&!find('[data-action="save"]').disabled,`${label} Save UI`);
  find('[data-action="save"]').click();
  await waitFor(()=>session.state.revision===revision+1&&!session.state.dirty&&session.state.busy===null,
    `${label} CAS Save`);
  const saved=await client.getRecipe(session.state.asset.id);
  expect(saved.revision===revision+1&&equal(saved.body,session.state.recipe),`${label} SQLite readback`);
  return saved;
}
async function reloadCurrent(label){
  const before=JSON.stringify(session.state.recipe),oldURL=session.state.afterURL;
  find('[data-action="reload"]').click();
  await waitFor(()=>session.state.afterURL!==oldURL&&session.state.busy===null&&
    !find('[data-action="export-png"]').disabled,`${label} Recipe reload`);
  expect(JSON.stringify(session.state.recipe)===before&&!session.state.dirty,
    `${label} saved Levels round-trip`);
}
async function setLevel(channel,field,value){
  const input=find(`#levels-${channel}-${field}-number`);
  expect(input instanceof HTMLInputElement&&!input.disabled,`${channel}.${field} direct input`);
  const previous=session.state.afterURL;
  input.value=String(value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>levels()[channel]?.[field]===value&&session.state.busy===null&&
    session.state.afterURL!==previous&&blobs.get(session.state.afterURL) instanceof Blob,
  `${channel}.${field} Editor→Recipe→Preview`);
}
async function selectPhoto(id){
  const selector=`#filmstrip-items [data-asset-id="${id}"]`;
  await waitFor(()=>find(selector)&&!find(selector).disabled,`filmstrip target ${id}`);
  find(selector).click();
  await waitFor(()=>session.state.asset?.id===id&&session.state.busy===null&&
    blobs.get(session.state.afterURL) instanceof Blob&&!find('[data-action="export-png"]').disabled,
  `opened selected Asset ${id}`);
}
async function publishPreset(expected){
  expect(find('#trial-author-form')&&find('.preset-library'),'real Author and Library product UI');
  await waitFor(()=>!find('#trial-new-draft').disabled,'new Draft button');
  find('#trial-new-draft').click();
  await waitFor(()=>!find('#trial-capture-global').disabled,'saved source Capture button');
  find('#trial-capture-global').click();
  const name='Levels Author Four Channels';
  const nameInput=find('#trial-look-name');nameInput.value=name;
  nameInput.dispatchEvent(new Event('input',{bubbles:true}));
  const snapshot=JSON.parse(find('#trial-global-preview').textContent);
  expect(equal(snapshot.postDecodeAdjustments.color.levels,expected),
    'Author Capture contains four-channel Levels');
  await waitFor(()=>!find('#trial-save-draft').disabled,'Draft Save button');
  find('#trial-save-draft').click();
  await waitFor(()=>find('#trial-author-status').textContent.includes('下書きをサーバーへ保存しました')&&
    find('#trial-look-status').textContent==='DRAFT','Draft HTTP/SQLite Save');
  let draft=(await client.listDrafts()).find(item=>item.name===name);
  expect(draft?.status==='DRAFT'&&draft.source?.assetID===source.asset.id&&
    equal(draft.parameters.postDecodeAdjustments.color.levels,expected),
  'source-bound Draft reload retains Levels');
  find('#trial-refresh-drafts').click();
  await waitFor(()=>find('#trial-author-status').textContent.includes('サーバーから取得しました'),
    'Draft UI reload');
  const draftButton=[...find('#trial-draft-list').querySelectorAll('button')]
    .find(button=>button.textContent.includes(name));
  expect(draftButton,'saved Draft appears in Author UI');draftButton.click();
  expect(find('#trial-global-preview').textContent.includes('levels'),'reloaded Draft preview');
  await waitFor(()=>!find('#trial-submit-draft').disabled,'Submit button');
  find('#trial-submit-draft').click();
  await waitFor(()=>find('#trial-look-status').textContent==='SUBMITTED','submitted for review');
  draft=(await client.listDrafts()).find(item=>item.id===draft.id);
  expect(draft?.status==='SUBMITTED','server confirms submitted revision');
  let selfReviewDenied=false;
  try{await client.reviewDraft(draft.id,{expectedRevision:draft.revision,decision:'ACCEPTED'});}
  catch{selfReviewDenied=true;}
  expect(selfReviewDenied,'author cannot accept own submitted Draft');
  const review=await fetch('/fixture/admin-review',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({draftID:draft.id,revision:draft.revision})});
  expect(review.ok,'distinct authenticated admin accepts submitted Draft');
  const accepted=await review.json();
  expect(equal(accepted.preset?.parameters?.postDecodeAdjustments?.color?.levels,expected),
    'admin-published immutable Levels snapshot');
  const published=(await client.listPresets()).find(item=>item.name===name);
  expect(published?.version===draft.revision&&
    equal(published.parameters.postDecodeAdjustments.color.levels,expected),
  'published Preset readback retains version and Levels');
  return {name,draft,published};
}
async function applyFromLibrary(name,expected){
  const library=find('.preset-library'),refresh=library.querySelector('.panel-title button');
  await waitFor(()=>!refresh.disabled,'Library Refresh button');refresh.click();
  await waitFor(()=>[...library.querySelectorAll('.draft-list-item')]
    .some(button=>button.textContent.includes(name)),'published Library row');
  const item=[...library.querySelectorAll('.draft-list-item')]
    .find(button=>button.textContent.includes(name));
  expect(!item.disabled,'published Preset Apply button');item.click();
  await waitFor(()=>session.state.dirty&&equal(levels(),expected)&&
    library.querySelector('[role="status"]').textContent.includes('未保存'),
  'actual Library applies unsaved Levels');
  find('[data-action="undo"]').click();
  await waitFor(()=>!equal(levels(),expected)&&!find('[data-action="redo"]').disabled,
    'Library Apply Undo');
  find('[data-action="redo"]').click();
  await waitFor(()=>equal(levels(),expected)&&session.state.busy===null,
    'Library Apply Redo');
}
async function run(){
  expect(location.search.includes('view=author')&&session.state.asset?.id===source.asset.id&&
    session.state.revision===1,'saved authenticated source opened in Author view');
  const settings=[['master','inputBlack',20],['red','outputBlack',35],
    ['green','gamma',1.5],['blue','outputWhite',210]];
  for(const [channel,field,value] of settings)await setLevel(channel,field,value);
  const expected=structuredClone(levels());
  expect(Object.keys(expected).length===4,'all four Levels channels in source Recipe');
  const sourceSaved=await saveCurrent('source');await reloadCurrent('source');
  const {name,draft,published}=await publishPreset(expected);
  await selectPhoto(target.asset.id);
  const baseline=await exportPNG('neutral target');
  await applyFromLibrary(name,expected);
  const targetSaved=await saveCurrent('published target');await reloadCurrent('published target');
  const final=await exportPNG('published Levels target');
  expect(different(baseline,final),'published Levels alter actual Worker Final pixels');
  expect((await checksum(await client.getOriginal(source.asset.id)))===source.sha256&&
    (await checksum(await client.getOriginal(target.asset.id)))===target.sha256,
  'source and target Original bytes/SHA unchanged');
  let staleCAS=false;
  try{await client.saveRecipe(target.asset.id,1,targetSaved.body);}catch{staleCAS=true;}
  expect(staleCAS&&((await client.getRecipe(target.asset.id)).revision===targetSaved.revision),
    'old target revision cannot overwrite published Levels');
  const staleReview=await fetch('/fixture/admin-review',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({draftID:draft.id,revision:1})});
  expect(!staleReview.ok,'old Draft review version cannot republish');
  const revoked=await fetch('/fixture/revoke',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({invitationID:invitation.invitationID})});
  expect(revoked.ok,'Trial invitation revoked');
  let readDenied=false,editDenied=false;
  try{await client.getRecipe(target.asset.id);}catch{readDenied=true;}
  try{await client.assertPermission(target.asset.id,'edit');}catch{editDenied=true;}
  expect(readDenied&&editDenied,'revoked member cannot read or edit target');
  const ended=await client.getSession();
  expect(ended.principal===null&&ended.endedReason==='TRIAL_REVOKED',
    'Trial session reports real revocation');
  dispose();worker.dispose();
  find('#probe-verdict').textContent=JSON.stringify({result:'LEVELS-AUTHOR-TRIAL-BROWSER-PASS',
    boundary:'real Chrome Author/Library + separate admin Trial HTTP/SQLite + synthetic non-RAW Worker',
    settings,sourceRevision:sourceSaved.revision,targetRevision:targetSaved.revision,
    publishedVersion:published.version,finalDecodes,finalPixelsDiffer:true,
    undoRedo:true,staleCASRejected:true,staleReviewRejected:true,revoked:true,
    originalSHA:[source.sha256,target.sha256],
    incompleteGate:'Personal/Workspace OIDC host, Community, actual RAW, Cloud and physical device NOT_RUN'});
}
find('#probe-run').addEventListener('click',()=>{
  void run().catch(error=>{find('#probe-verdict').textContent=JSON.stringify({
    result:'LEVELS-AUTHOR-TRIAL-BROWSER-FAIL',error:error.message,stack:error.stack,
    sessionError:session.state.error,state:{asset:session.state.asset?.id,
      revision:session.state.revision,busy:session.state.busy,dirty:session.state.dirty,
      levels:levels()},finalDecodes});});
});
