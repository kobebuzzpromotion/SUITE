import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {TrialClient} from './trial-client.mjs';
import {EditorSession,checksum} from './session.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {makeManualHandToneDocument} from './manual-hand-tone-ui.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>structuredClone(value);
const abortError=()=>new DOMException('Hand Tone host cancelled','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError();};
function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===null||proto===Object.prototype||
    (Object.getPrototypeOf(proto)===null&&
      Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return record(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');});
}
function linkedSignal(external){
  if(external!==undefined&&(!external||typeof external.aborted!=='boolean'||
      typeof external.addEventListener!=='function'||
      typeof external.removeEventListener!=='function'))
    throw Error('HAND_HOST_SIGNAL_INVALID');
  const controller=new AbortController(),stop=()=>controller.abort();
  external?.addEventListener('abort',stop,{once:true});
  if(external?.aborted)controller.abort();
  return {signal:controller.signal,stop,cleanup:()=>external?.removeEventListener('abort',stop)};
}
function identity(response,expected){
  const principal=response?.principal;
  if(response?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(principal?.id)||
      principal.tenantId!==`trial-${principal.id}`)
    throw Error(response?.endedReason||'HAND_HOST_TRIAL_SESSION_REQUIRED');
  const result={id:principal.id,tenantId:principal.tenantId};
  if(expected&&!same(result,expected))throw Error('HAND_HOST_SESSION_CHANGED');
  return result;
}
function registered(list,id,tenantId,expected){
  if(!Array.isArray(list))throw Error('HAND_HOST_ASSETS_INVALID');
  const matches=list.filter(item=>item?.id===id);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('HAND_HOST_ASSET_UNAVAILABLE');
  const asset={id,tenantId,sha256:matches[0].sha256.toLowerCase(),
    size:matches[0].size};
  if(expected&&!same(asset,expected))throw Error('HAND_HOST_ASSET_CHANGED');
  return asset;
}
async function permission(api,assetID,signal){
  const result=await api.request('/trial/authorize',
    {method:'POST',body:{assetID,action:'edit'},signal});
  check(signal);
  if(result?.authorized!==true)throw Error('HAND_HOST_EDIT_PERMISSION_DENIED');
}
function currentEditor(session,assetID,expected){
  const state=session.state,asset=state.asset;
  if(asset?.id!==assetID||!SHA.test(asset?.sha256)||
      !Number.isSafeInteger(asset?.size)||asset.size<1||
      !Number.isSafeInteger(state.revision)||state.revision<1||
      state.dirty!==false||state.busy!==null||state.exporting!==false||
      !session.proxy)
    throw Error('HAND_HOST_EDITOR_UNAVAILABLE');
  validateRecipe(state.recipe);
  const result={asset:{id:asset.id,sha256:asset.sha256.toLowerCase(),
    size:asset.size},revision:state.revision,recipe:copy(state.recipe),
    operation:session.operation};
  if(expected&&!same(result,expected))throw Error('HAND_HOST_EDITOR_CHANGED');
  return result;
}
async function originalAndDimensions(api,processing,asset,signal){
  check(signal);
  const bytes=await api.getOriginal(asset.id,{signal});check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||
      await checksum(bytes)!==asset.sha256)
    throw Error('HAND_HOST_ORIGINAL_CHANGED');
  check(signal);
  // This internally created bundled Browser Worker is the only accepted RAW
  // decoder. Session-provided/caller-provided synthetic decoders are ignored.
  const decoded=await processing.decodeRaw(bytes.slice(0),{mode:'final',signal});
  check(signal);
  assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  if(proof?.sourceRepresentation!=='original-camera-raw'||
      proof?.decoderPackage!=='@colorhythm/libraw-wasm'||
      proof?.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||
      proof?.sourceSHA256?.toLowerCase()!==asset.sha256||
      proof?.mode!=='final'||proof?.thumbnailFallback!==false||
      decoded.pixels.width*decoded.pixels.height>8_000_000)
    throw Error('HAND_HOST_RAW_DECODE_PROVENANCE_REQUIRED');
  return {width:decoded.pixels.width,height:decoded.pixels.height};
}
function storedRecipe(record,revision,body){
  if(!record||record.revision!==revision||record.branch===true||
      !record.body||!same(record.body,body))
    throw Error('HAND_HOST_RECIPE_CHANGED');
  validateRecipe(record.body);
  return record.body;
}

/**
 * Trial-only Hand Tone authoring boundary. A user's drawn hand/forearm region
 * is not hand detection or permission. This host does not accept a decoder or
 * authority from the caller. It only reports CAS/readback, not Editor/Final
 * synchronization. Synthetic non-RAW bytes cannot satisfy the bundled LibRaw
 * Worker proof and must never be counted as a production RAW success.
 */
export function createTrialManualHandToneHost({api,session,assetID,getEditorView}={}){
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||!UUID.test(assetID)||typeof getEditorView!=='function')
    throw Error('HAND_HOST_INIT_INVALID');
  const processing=createProcessing();
  let snapshot=null,disposed=false,inflight=null;
  function view(){
    const display=getEditorView();
    if(!display||display.view!=='after'||display.ready!==true||
        display.permissionExpired===true)
      throw Error('HAND_HOST_VIEW_UNAVAILABLE');
    return display;
  }
  async function run(task,external){
    if(disposed)throw Error('HAND_HOST_DISPOSED');
    if(inflight)throw Error('HAND_HOST_BUSY');
    const link=linkedSignal(external);inflight=link;
    try{check(link.signal);return await task(link.signal);}
    finally{link.cleanup();if(inflight===link)inflight=null;}
  }
  async function readFresh(expected,signal){
    check(signal);
    const who=identity(await api.request('/trial/session',{signal}),
      expected?.identity);
    const asset=registered((await api.request('/v1/assets',{signal})).assets,
      assetID,who.tenantId,expected?.asset);
    await permission(api,assetID,signal);
    const saved=(await api.request(`/v1/assets/${assetID}/recipe`,
      {signal})).recipe;
    if(!Number.isSafeInteger(saved?.revision)||saved.revision<1||!saved.body)
      throw Error('HAND_HOST_SAVED_RECIPE_REQUIRED');
    validateRecipe(saved.body);
    if(expected&&
        (saved.revision!==expected.revision||!same(saved.body,expected.recipe)))
      throw Error('HAND_HOST_RECIPE_CHANGED');
    const size=await originalAndDimensions(api,processing,asset,signal);
    if(expected&&!same(size,expected.dimensions))
      throw Error('HAND_HOST_DIMENSIONS_CHANGED');
    const again=registered((await api.request('/v1/assets',{signal})).assets,
      assetID,who.tenantId,asset);
    if(!same(asset,again))throw Error('HAND_HOST_ASSET_CHANGED');
    const latest=(await api.request(`/v1/assets/${assetID}/recipe`,
      {signal})).recipe;
    storedRecipe(latest,saved.revision,saved.body);
    await permission(api,assetID,signal);
    identity(await api.request('/trial/session',{signal}),who);
    check(signal);
    return {identity:who,asset,dimensions:size,revision:saved.revision,
      recipe:copy(saved.body)};
  }
  function getContext(){
    if(!snapshot||disposed)throw Error('HAND_HOST_REFRESH_REQUIRED');
    const display=view(),editor=currentEditor(session,assetID,snapshot.editor);
    if(!same(editor.asset,snapshot.asset)||
        editor.revision!==snapshot.revision||
        !same(editor.recipe,snapshot.recipe))
      throw Error('HAND_HOST_EDITOR_CHANGED');
    const scale=Math.min(1,1600/Math.max(snapshot.dimensions.width,
      snapshot.dimensions.height));
    if(session.proxy.width!==Math.max(1,Math.round(snapshot.dimensions.width*scale))||
        session.proxy.height!==Math.max(1,Math.round(snapshot.dimensions.height*scale)))
      throw Error('HAND_HOST_PROXY_MISMATCH');
    return {assetID:snapshot.asset.id,
      originalSHA256:snapshot.asset.sha256,
      sourceWidth:snapshot.dimensions.width,
      sourceHeight:snapshot.dimensions.height,
      savedRevision:snapshot.revision,view:'after',ready:true,
      dirty:false,busy:false,permissionExpired:false,
      rotationDegrees:display.rotationDegrees,crop:display.crop,
      sceneGeometry:editor.recipe.parameters.extendedParameters?.sceneGeometry,
      canvasExpand:display.canvasExpand,beforeRect:display.beforeRect,...(currentBrushDisplayGeometry(session))};
  }
  async function refresh({signal}={}){
    snapshot=null;
    return run(async current=>{
      try{
        view();const editor=currentEditor(session,assetID);
        const fresh=await readFresh(null,current);
        if(!same(editor.asset,fresh.asset)||
            editor.revision!==fresh.revision||!same(editor.recipe,fresh.recipe))
          throw Error('HAND_HOST_EDITOR_CHANGED');
        currentEditor(session,assetID,editor);view();
        snapshot={...fresh,editor};
        return getContext();
      }catch(error){snapshot=null;throw error;}
    },signal);
  }
  async function onSubmit(input,options){
    if(!exact(options,['savedRevision','signal'])||
        !Number.isSafeInteger(options.savedRevision)||options.savedRevision<1)
      throw Error('HAND_HOST_SUBMIT_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('HAND_HOST_REFRESH_REQUIRED');
    if(!exact(input,['schemaVersion','engineVersion','binding',
      'handStrokes','settings']))throw Error('HAND_HOST_DOCUMENT_INVALID');
    const document=makeManualHandToneDocument(input.binding,input.handStrokes,
      input.settings);
    if(!same(document,input)||document.binding.assetID!==previous.asset.id||
        document.binding.originalSHA256.toLowerCase()!==previous.asset.sha256||
        document.binding.sourceWidth!==previous.dimensions.width||
        document.binding.sourceHeight!==previous.dimensions.height||
        options.savedRevision!==previous.revision)
      throw Error('HAND_HOST_DOCUMENT_SCOPE_MISMATCH');
    return run(async signal=>{
      try{
        currentEditor(session,assetID,previous.editor);view();
        const fresh=await readFresh(previous,signal);
        currentEditor(session,assetID,previous.editor);view();
        const next=copy(fresh.recipe);
        next.parameters.extendedParameters.handToneManual=document;
        validateRecipe(next);
        check(signal);
        const saved=await api.request(`/v1/assets/${assetID}/recipe`,
          {method:'PUT',body:{expectedRevision:fresh.revision,recipe:next},signal});
        check(signal);
        if(saved?.revision!==fresh.revision+1||saved.branch===true||
            !same(saved.body,next))
          throw Error('HAND_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await readFresh({...fresh,revision:saved.revision,
          recipe:next},signal);
        currentEditor(session,assetID,previous.editor);view();
        snapshot=null;
        return Object.freeze({readbackVerified:true,
          savedRevision:verified.revision,editorReloadRequired:true,
          finalVerified:false,realRAWProvenanceVerified:true});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.stop();
    processing.dispose();}
  return Object.freeze({refresh,getContext,onSubmit,dispose});
}
