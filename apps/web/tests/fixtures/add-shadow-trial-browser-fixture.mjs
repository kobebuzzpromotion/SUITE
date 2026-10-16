import {TrialClient} from '../../src/trial-client.mjs';
import {EditorSession} from '../../src/session.mjs';
import {createProcessing} from '../../src/processing/index.mjs';
import {readTrialAddShadowTarget} from '../../src/add-shadow-target-gate.mjs';
import {readTrialAddShadowBackdrop} from '../../src/add-shadow-backdrop-gate.mjs';
import {ADD_SHADOW_VERSION} from '../../src/processing/add-shadow.mjs';

const status=document.getElementById('probe-verdict');
const button=document.getElementById('probe-run');
const invite=JSON.parse(document.getElementById('probe-config').textContent).invite;
const nonRawBytes=new Uint8Array([0xff,0xd8,0xff,0xe0,83,85,73,84,69,45,78,79,78,82,65,87]);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  item=>item.toString(16).padStart(2,'0')).join('');
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,
  saturation:1,rotationDegrees:0,extendedParameters:{},
  processingOrder:['exposure','contrast','saturation','rotation']}});
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function rejects(task,pattern){
  try{await task();}catch(error){
    const message=String(error?.message||error);
    assert(pattern.test(message),`EXPECTED_${pattern}_GOT_${message}`);
    assert(!/BROWSER_WORKER_UNAVAILABLE/.test(message),'NODE_WORKER_ERROR_IN_CHROME');
    return message;
  }
  throw Error(`EXPECTED_REJECTION_${pattern}`);
}
async function asset(api,label){
  const bytes=nonRawBytes.slice();
  bytes[bytes.length-1]=label==='target'?1:2;
  const created=await api.createAsset({name:`shadow-${label}.nonraw`,
    sha256:await sha(bytes),size:bytes.length});
  await api.putOriginal(created.id,bytes.buffer);
  const listed=(await api.listAssets()).find(item=>item.id===created.id);
  assert(listed?.cloudSafe===true,`CLOUD_SAFE_${label}`);
  return listed;
}
function manualDocument(target,backdrop){
  return {schemaVersion:1,engineVersion:ADD_SHADOW_VERSION,
    binding:{assetID:target.id,originalSHA256:target.sha256,
      sourceWidth:40,sourceHeight:20,backdropID:backdrop.id,
      backdropSHA256:backdrop.sha256},
    subjectStrokes:[{operation:'ADD',path:[{u:.5,v:.5}],
      radiusFraction:.04,hardness:.8}],
    settings:{mode:'soft',opacity:70,blur:6,gradient:20,
      blend:'normal',offsetX:2,offsetY:3,shadowColor:[10,20,30]}};
}
async function run(){
  button.disabled=true;status.textContent='RUNNING';
  let processing;
  try{
    const api=new TrialClient();
    await api.login(invite);
    const principal=(await api.getSession()).principal;
    assert(principal?.tenantId===`trial-${principal.id}`,'TRIAL_IDENTITY');
    const target=await asset(api,'target'),backdrop=await asset(api,'backdrop');
    const base=await api.saveRecipe(target.id,0,neutral());
    assert(base.revision===1,'BASE_REVISION');
    const doc=manualDocument(target,backdrop),withShadow=neutral();
    withShadow.parameters.extendedParameters.addShadowManual=doc;
    const saved=await api.saveRecipe(target.id,1,withShadow);
    assert(saved.revision===2,'SHADOW_REVISION');
    const reloaded=await api.getRecipe(target.id);
    assert(reloaded.revision===2&&
      JSON.stringify(reloaded.body.parameters.extendedParameters.addShadowManual)===
        JSON.stringify(doc),'RELOADED_DOCUMENT');
    const binding={...doc.binding,savedRevision:2};
    const verified=await readTrialAddShadowTarget({api,binding,action:'export'});
    assert(verified.assetID===target.id&&verified.originalSHA256===target.sha256&&
      verified.savedRevision===2&&verified.principal.id===principal.id,
      'FRESH_TARGET_GATE');
    await rejects(()=>readTrialAddShadowTarget({api,
      binding:{...binding,savedRevision:1},action:'export'}),
      /ADD_SHADOW_TARGET_REVISION_CONFLICT/);
    await rejects(()=>readTrialAddShadowTarget({api,
      binding:{...binding,originalSHA256:'f'.repeat(64)},action:'export'}),
      /ADD_SHADOW_TARGET_ORIGINAL_CHANGED/);
    await rejects(()=>readTrialAddShadowBackdrop({api,
      binding:{...binding,backdropSHA256:'f'.repeat(64)},
      selectedBackdropID:backdrop.id,target:'proxy'}),
      /ADD_SHADOW_BACKDROP_ORIGINAL_CHANGED/);
    processing=createProcessing();
    const decoderError=await rejects(()=>processing.decodeRaw(nonRawBytes.buffer.slice(0),
      {mode:'final'}),/NOT_CAMERA_RAW/);
    const pixels={width:40,height:20,data:new Uint8ClampedArray(40*20*4)};
    for(let index=3;index<pixels.data.length;index+=4)pixels.data[index]=255;
    const session=new EditorSession({api,processing});
    session.proxy=pixels;session.history=[reloaded.body];session.cursor=0;
    session.data={...session.data,assets:[target,backdrop],asset:target,
      recipe:reloaded.body,revision:2,dirty:false,shadowVerification:'unverified'};
    session.bind(reloaded.body);
    const previewError=await rejects(()=>session.refreshPreview(),/NOT_CAMERA_RAW/);
    assert(session.state.afterURL===null&&session.state.beforeURL===null&&
      session.state.shadowVerification==='unverified','PREVIEW_BLOB_NOT_PUBLISHED');
    const finalError=await rejects(()=>session.exportFinal({format:'png'}),
      /NOT_CAMERA_RAW/);
    assert(session.state.afterURL===null&&session.state.exporting===false,
      'FINAL_BLOB_NOT_PUBLISHED');
    const cancelled=new AbortController();cancelled.abort();
    await rejects(()=>readTrialAddShadowBackdrop({api,binding,
      selectedBackdropID:backdrop.id,target:'proxy',signal:cancelled.signal}),
      /AbortError|cancelled/);
    const pending=session.exportFinal({format:'png'});
    session.cancelExport();
    const cancelError=await rejects(()=>pending,/AbortError|cancelled|EXPORT_ABORTED/);
    assert(session.state.exporting===false&&session.state.afterURL===null,
      'CANCEL_NO_BLOB');
    const revoke=await fetch('/__revoke',{method:'POST'});
    assert(revoke.ok,'TEST_REVOKE_FAILED');
    await rejects(()=>readTrialAddShadowTarget({api,binding,action:'export'}),
      /TRIAL_REVOKED/);
    await rejects(()=>session.refreshPreview(),/TRIAL_REVOKED/);
    await rejects(()=>session.exportFinal({format:'png'}),/TRIAL_REVOKED/);
    assert(session.state.afterURL===null&&session.state.beforeURL===null&&
      session.state.exporting===false,'REVOKED_NO_BLOB');
    status.textContent='ADD_SHADOW_TRIAL_CHROME_PASS '+JSON.stringify({
      kind:'REAL_TRIAL_HTTP_SQLITE_SYNTHETIC_NON_RAW',
      targetID:verified.assetID,revision:verified.savedRevision,
      decoderError,previewError,finalError,cancelError,
      publishedPreview:false,publishedFinal:false,
      realRawSuccess:false});
  }catch(error){status.textContent='ADD_SHADOW_TRIAL_CHROME_FAIL '+
    String(error?.stack||error);}
  finally{processing?.dispose();}
}
button.addEventListener('click',run,{once:true});
