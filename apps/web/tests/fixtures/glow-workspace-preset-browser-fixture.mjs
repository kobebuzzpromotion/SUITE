import {mountGlowWorkspacePreset} from '../../src/glow-workspace-preset-mount.mjs';
import {WorkspacePresetClient} from '../../src/workspace-preset-client.mjs';
import {createProcessing} from '../../src/processing/index.mjs';

const config=await (await fetch('/fixture/config')).json();
const panel=document.querySelector('#app');
const verdict=document.querySelector('#probe-verdict');
let selectedId=config.sourceId;
let selectedWorkspaceId=config.workspaceId;
let principal=config.expectedSubject;
let expired=false;
let networkFailure='';
let stage='setup';
const fetchImpl=(...args)=>fetch(...args).catch(error=>{
  networkFailure=`${error?.name}: ${error?.message}`;throw error;
});
const tokenProvider=async()=>{
  const response=await fetch(`/fixture/token?user=${encodeURIComponent(principal)}&expired=${expired?'1':'0'}`);
  if(!response.ok)throw Error('FIXTURE_TOKEN_UNAVAILABLE');
  return (await response.json()).token;
};
const selectionProvider=()=>({workspaceId:selectedWorkspaceId,
  projectId:config.projectId,assetId:selectedId});
const mounted=mountGlowWorkspacePreset({container:panel,baseURL:location.origin,
  workspaceId:config.workspaceId,projectId:config.projectId,
  expectedSubject:config.expectedSubject,expectedTenantId:config.expectedTenantId,
  tokenProvider,selectionProvider,fetchImpl});
const expect=(condition,message)=>{if(!condition)throw Error(`GLOW_WS_PRESET_ASSERT: ${message}`);};
const path=id=>`/v1/workspaces/${config.workspaceId}/projects/${config.projectId}/assets/${id}/recipe`;
async function stored(id){
  const response=await fetch(path(id),{headers:{Authorization:`Bearer ${await tokenProvider()}`}});
  expect(response.ok,`saved Recipe HTTP ${response.status}`);
  return (await response.json()).recipe;
}
async function waitFor(predicate,message){
  const deadline=performance.now()+20000;
  while(!predicate()){
    if(performance.now()>deadline)throw Error(`GLOW_WS_PRESET_TIMEOUT: ${message}`);
    await new Promise(done=>setTimeout(done,25));
  }
}
function frame(){
  const width=80,height=60,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,near=Math.hypot(x-40,y-30)<12;
    const light=near?245:Math.hypot(x-40,y-30)<23?130:35;
    data[at]=light;data[at+1]=Math.max(0,light-10);data[at+2]=Math.max(0,light-20);data[at+3]=255;
  }
  return {width,height,data};
}
const controls=()=>({scope:panel.querySelector('[data-glow-preset-scope]'),
  name:panel.querySelector('[data-glow-preset-name]'),
  list:panel.querySelector('[data-glow-preset-list]'),
  status:panel.querySelector('[data-glow-preset-status]'),
  save:panel.querySelector('[data-glow-preset-save]'),
  apply:panel.querySelector('[data-glow-preset-apply]')});
async function uiSave(kind,name){
  selectedId=config.sourceId;
  const ui=controls();ui.scope.value=kind;
  ui.scope.dispatchEvent(new Event('change',{bubbles:true}));
  ui.name.value=name;ui.save.click();
  await waitFor(()=>ui.status.textContent.includes('保存確認済み')||
    ui.status.textContent.includes('GLOW_')||ui.status.textContent.includes('WORKSPACE_'),
  `${kind} save`);
  expect(ui.status.textContent.includes('保存確認済み'),
    `${kind} UI save: ${ui.status.textContent} ${networkFailure}`);
  const entries=await mounted.list({kind});
  const item=entries.find(preset=>preset.name===name);
  expect(item?.version===1&&item.kind===kind,`${kind} saved Preset list`);
  const reloaded=await mounted.reload({kind,id:item.id});
  expect(JSON.stringify(reloaded.recipe.parameters.extendedParameters
    .postDecodeAdjustments.color.glow)===JSON.stringify(config.glow),`${kind} 3-mode+6-value reload`);
  return item;
}
async function uiApply(preset,targetId){
  selectedId=targetId;
  const ui=controls();
  ui.scope.value=preset.kind;ui.scope.dispatchEvent(new Event('change',{bubbles:true}));
  panel.querySelector('[data-glow-preset-refresh]').click();
  await waitFor(()=>ui.status.textContent.includes('件を再取得')||
    ui.status.textContent.includes('GLOW_')||ui.status.textContent.includes('WORKSPACE_'),
  `${preset.kind} refresh`);
  expect(ui.status.textContent.includes('件を再取得'),`${preset.kind} UI refresh: ${ui.status.textContent}`);
  ui.list.value=preset.id;expect(ui.list.value===preset.id,'Preset option selected');
  ui.apply.click();
  await waitFor(()=>ui.status.textContent.includes('適用・保存確認済み')||
    ui.status.textContent.includes('GLOW_')||ui.status.textContent.includes('WORKSPACE_'),
  `${preset.kind} apply`);
  expect(ui.status.textContent.includes('適用・保存確認済み'),
    `${preset.kind} UI apply: ${ui.status.textContent}`);
  const after=await stored(targetId);
  expect(after.version===2&&after.presetSnapshot?.id===preset.id&&
    after.presetSnapshot?.version===1,'version-pinned saved Recipe');
  expect(JSON.stringify(after.body.parameters.extendedParameters.postDecodeAdjustments.color.glow)===
    JSON.stringify(config.glow),'applied Glow settings saved/reloaded');
  return after;
}
async function run(){
  stage='source read';
  const source=await stored(config.sourceId);
  stage='personal save';
  const personal=await uiSave('PERSONAL','Glow · Personal');
  stage='workspace save';
  const workspace=await uiSave('WORKSPACE','Glow · Workspace');
  stage='personal apply';
  const personalAfter=await uiApply(personal,config.personalTargetId);
  stage='workspace apply';
  const workspaceAfter=await uiApply(workspace,config.workspaceTargetId);
  stage='Final pixels';
  const worker=createProcessing({workerURL:'/processing-worker.js'});
  try{
    const before=await worker.render(frame(),{schemaVersion:1,parameters:{exposure:0,contrast:1,
      saturation:1,rotationDegrees:0,extendedParameters:{},
      processingOrder:['exposure','contrast','saturation','rotation']}});
    const final=await worker.render(frame(),personalAfter.body);
    expect(before.data.some((value,index)=>value!==final.data[index]),
      'actual Worker Final pixels differ');
    const blob=await worker.encode(final,{format:'png'});
    expect(blob instanceof Blob&&blob.type==='image/png'&&blob.size>100,
      'actual Worker Final PNG');
  }finally{worker.dispose();}
  expect((await stored(config.sourceId)).version===source.version,'Preset save leaves source Recipe unchanged');
  stage='Glow-only existing edit preservation';
  const protectedAfter=await uiApply(personal,config.protectedTargetId);
  expect(protectedAfter.body.parameters.exposure===1,
    'atomic Glow-only Apply preserves unrelated target exposure');
  expect(protectedAfter.version===2,'edited target saved exactly once');
  stage='edited Final pixels';
  const editedWorker=createProcessing({workerURL:'/processing-worker.js'});
  try{
    const baseline={schemaVersion:1,parameters:{exposure:1,contrast:1,saturation:1,
      rotationDegrees:0,extendedParameters:{},
      processingOrder:['exposure','contrast','saturation','rotation']}};
    const oldPixels=await editedWorker.render(frame(),baseline);
    const mergedPixels=await editedWorker.render(frame(),protectedAfter.body);
    expect(oldPixels.data.some((value,index)=>value!==mergedPixels.data[index]),
      'edited target Final uses saved Glow while retaining exposure');
    const output=await editedWorker.encode(mergedPixels,{format:'png'});
    expect(output instanceof Blob&&output.type==='image/png'&&output.size>100,
      'edited target Final PNG');
  }finally{editedWorker.dispose();}
  stage='preset update';
  selectedId=config.sourceId;
  const presetClient=new WorkspacePresetClient({baseURL:location.origin,
    workspaceId:config.workspaceId,expectedSubject:config.expectedSubject,
    expectedTenantId:config.expectedTenantId,tokenProvider,fetchImpl});
  await presetClient.updatePreset(personal.id,{baseVersion:1,name:'Glow · Personal updated',
    body:personal.recipe});
  stage='stale version';
  selectedId=config.protectedTargetId;
  let stale=false;
  try{await mounted.apply({kind:'PERSONAL',id:personal.id,version:1});}
  catch(error){stale=error.message==='GLOW_PRESET_VERSION_CONFLICT';}
  expect(stale,'stale Preset version denied');
  principal='other-user';
  stage='identity swap';
  let denied=false;
  try{await mounted.list({kind:'WORKSPACE'});}catch{denied=true;}
  expect(denied,'swapped JWT identity denied');
  principal=config.expectedSubject;
  stage='expired bearer';expired=true;
  denied=false;
  try{await mounted.list({kind:'WORKSPACE'});}catch{denied=true;}
  expect(denied,'expired JWT denied');expired=false;
  stage='other workspace';selectedWorkspaceId=config.projectId;
  denied=false;
  try{await mounted.apply({kind:'WORKSPACE',id:workspace.id,version:1});}
  catch(error){denied=error.message==='GLOW_PRESET_SELECTION_CHANGED';}
  expect(denied,'different selected Workspace denied before Apply');
  selectedWorkspaceId=config.workspaceId;
  expect(workspaceAfter.version===2,'Workspace Preset target saved');
  return {result:'GLOW-WS-PRESET-BROWSER-PASS',personalVersion:personalAfter.version,
    workspaceVersion:workspaceAfter.version,editedVersion:protectedAfter.version,finalPNG:true,
    boundary:'HOST_INJECTED_SYNTHETIC_NON_RAW_NODE_JWT_SQLITE_NOT_SHIPPED_OIDC'};
}
document.querySelector('#probe-run').addEventListener('click',()=>{
  verdict.textContent='RUNNING';
  void run().then(value=>{verdict.textContent=JSON.stringify(value);},error=>{
    verdict.textContent=JSON.stringify({result:'FAIL',stage,
      message:error?.message||String(error),networkFailure});
  });
});
