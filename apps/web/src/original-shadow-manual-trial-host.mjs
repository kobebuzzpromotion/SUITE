import {TrialClient} from './trial-client.mjs';
import {buildOriginalShadowManualRecipe} from './original-shadow-manual-recipe.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {MAX_INPUT_BYTES,MAX_SOURCE_PIXELS} from './processing/pure.mjs';

// Invited local Trial only. The registered SHA authenticates stored Original
// bytes, not caller-supplied decoded RGBA or a future Final rendering path.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
  keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);
    return d?.enumerable===true&&Object.hasOwn(d,'value');});
const aborted=()=>new DOMException('Original Shadow host cancelled','AbortError');
const check=signal=>{if(signal?.aborted)throw aborted();};
function signalFrom(value){
  if(value!==undefined&&(value===null||typeof value.aborted!=='boolean'||
      typeof value.addEventListener!=='function'||
      typeof value.removeEventListener!=='function'))
    throw Error('ORIGINAL_SHADOW_HOST_SIGNAL_INVALID');
  return value;
}
function principal(session,expected){
  const identity=session?.principal;
  if(session?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(identity?.id)||
      identity.tenantId!==`trial-${identity.id}`)
    throw Error(session?.endedReason||'ORIGINAL_SHADOW_HOST_SESSION_REQUIRED');
  if(expected&&(identity.id!==expected.id||identity.tenantId!==expected.tenantId))
    throw Error('ORIGINAL_SHADOW_HOST_SESSION_CHANGED');
  return {id:identity.id,tenantId:identity.tenantId};
}
function selected(assets,id,tenantId){
  if(!Array.isArray(assets))throw Error('ORIGINAL_SHADOW_HOST_ASSETS_INVALID');
  const matches=assets.filter(asset=>asset?.id===id);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('ORIGINAL_SHADOW_HOST_ASSET_UNAVAILABLE');
  const asset=matches[0];
  return {id:asset.id,sha256:asset.sha256,size:asset.size,tenantId};
}
function sameAsset(left,right){
  return ['id','sha256','size','tenantId'].every(key=>left[key]===right[key]);
}
function sourceDimensions(value){
  // Source metadata only; effect/runtime pixel buffers keep their own 8MP cap.
  if(!exact(value,['width','height'])||
      !Number.isSafeInteger(value.width)||value.width<1||
      !Number.isSafeInteger(value.height)||value.height<1||
      value.width*value.height>MAX_SOURCE_PIXELS)
    throw Error('ORIGINAL_SHADOW_HOST_DIMENSIONS_INVALID');
  return {width:value.width,height:value.height};
}
async function original(api,asset,signal){
  check(signal);
  const bytes=await api.request(`/v1/assets/${asset.id}/original?purpose=high-precision`,
    {signal});
  check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size)
    throw Error('ORIGINAL_SHADOW_HOST_ORIGINAL_CHANGED');
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)throw Error('ORIGINAL_SHADOW_HOST_CRYPTO_UNAVAILABLE');
  const digest=new Uint8Array(await subtle.digest('SHA-256',bytes));
  check(signal);
  const hex=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hex!==asset.sha256.toLowerCase())
    throw Error('ORIGINAL_SHADOW_HOST_ORIGINAL_CHANGED');
  return bytes;
}
async function permission(api,assetID,action,signal){
  const result=await api.request('/trial/authorize',{method:'POST',
    body:{assetID,action},signal});
  check(signal);
  if(result?.authorized!==true)
    throw Error('ORIGINAL_SHADOW_HOST_PERMISSION_DENIED');
}
function editorScope(readState,targetID,backdropID){
  const state=readState();
  if(!state||state.selectedAssetID!==targetID||
      state.selectedBackdropID!==backdropID||state.view!=='after'||
      state.ready!==true||state.dirty!==false||state.busy!==false||
      state.permissionExpired!==false)
    throw Error('ORIGINAL_SHADOW_HOST_EDITOR_SCOPE_CHANGED');
  return state;
}
function sameSnapshot(left,right){
  return left.identity.id===right.identity.id&&
    left.identity.tenantId===right.identity.tenantId&&
    sameAsset(left.target,right.target)&&sameAsset(left.backdrop,right.backdrop)&&
    left.width===right.width&&left.height===right.height&&
    left.saved.revision===right.saved.revision&&
    JSON.stringify(left.saved.body)===JSON.stringify(right.saved.body);
}
function linkedSignal(external){
  signalFrom(external);const controller=new AbortController();
  const abort=()=>controller.abort();
  external?.addEventListener('abort',abort,{once:true});
  if(external?.aborted)controller.abort();
  return {signal:controller.signal,abort,cleanup:()=>
    external?.removeEventListener('abort',abort)};
}

/** Host bridge for mountOriginalShadowManualUI({getContext,onApply}). The
 * provided dimensions callback must inspect the digest-verified target bytes;
 * it is not a verified decoded-frame/RAW provenance certificate. */
export function createTrialOriginalShadowManualHost({api,targetAssetID,
  backdropAssetID,getSourceDimensions,getEditorState}={}){
  if(!(api instanceof TrialClient)||!UUID.test(targetAssetID)||
      !UUID.test(backdropAssetID)||targetAssetID===backdropAssetID||
      typeof getSourceDimensions!=='function'||typeof getEditorState!=='function')
    throw Error('ORIGINAL_SHADOW_HOST_INIT_INVALID');
  let snapshot=null,disposed=false,inflight=null;
  async function readFresh(signal){
    check(signal);
    const identity=principal(await api.request('/trial/session',{signal}));
    const assetList=(await api.request('/v1/assets',{signal})).assets;
    const target=selected(assetList,targetAssetID,identity.tenantId);
    const backdrop=selected(assetList,backdropAssetID,identity.tenantId);
    const targetBytes=await original(api,target,signal);
    await original(api,backdrop,signal);
    const dimensions=sourceDimensions(await getSourceDimensions(targetBytes.slice(0),
      Object.freeze({...target}),{signal}));
    check(signal);
    const saved=(await api.request(`/v1/assets/${targetAssetID}/recipe`,
      {signal})).recipe;
    if(!Number.isSafeInteger(saved?.revision)||saved.revision<1||!saved.body)
      throw Error('ORIGINAL_SHADOW_HOST_SAVED_RECIPE_REQUIRED');
    validateRecipe(saved.body);
    const lastList=(await api.request('/v1/assets',{signal})).assets;
    if(!sameAsset(target,selected(lastList,targetAssetID,identity.tenantId))||
        !sameAsset(backdrop,selected(lastList,backdropAssetID,identity.tenantId)))
      throw Error('ORIGINAL_SHADOW_HOST_ASSET_CHANGED');
    const latest=(await api.request(`/v1/assets/${targetAssetID}/recipe`,
      {signal})).recipe;
    if(latest?.revision!==saved.revision||
        JSON.stringify(latest?.body)!==JSON.stringify(saved.body))
      throw Error('ORIGINAL_SHADOW_HOST_REVISION_CHANGED');
    await original(api,target,signal);
    await original(api,backdrop,signal);
    await permission(api,targetAssetID,'edit',signal);
    await permission(api,backdropAssetID,'export',signal);
    principal(await api.request('/trial/session',{signal}),identity);
    check(signal);
    return {identity,target,backdrop,width:dimensions.width,
      height:dimensions.height,saved};
  }
  async function run(task,external){
    if(disposed)throw Error('ORIGINAL_SHADOW_HOST_DISPOSED');
    if(inflight)throw Error('ORIGINAL_SHADOW_HOST_BUSY');
    const linked=linkedSignal(external);inflight=linked;
    try{return await task(linked.signal);}
    finally{linked.cleanup();if(inflight===linked)inflight=null;}
  }
  function getContext(){
    let state=null;
    try{state=getEditorState();}catch{}
    const ready=!!snapshot&&!disposed&&!!state&&
      state.selectedAssetID===targetAssetID&&
      state.selectedBackdropID===backdropAssetID&&state.view==='after'&&
      state.ready===true&&state.dirty===false&&state.busy===false&&
      state.permissionExpired===false;
    return {target:snapshot?{id:snapshot.target.id,
      sha256:snapshot.target.sha256,sourceWidth:snapshot.width,
      sourceHeight:snapshot.height,savedRevision:snapshot.saved.revision}:null,
      backdrop:snapshot?{id:snapshot.backdrop.id,
        sha256:snapshot.backdrop.sha256}:null,
      view:state?.view??'before',ready,dirty:state?.dirty===true,
      busy:state?.busy===true,permissionExpired:!ready,
      rotationDegrees:state?.rotationDegrees,crop:state?.crop,
      canvasExpand:state?.canvasExpand,beforeRect:state?.beforeRect,
      sceneGeometry:state?.sceneGeometry,lensGeometry:state?.lensGeometry,
      sourceWidth:snapshot?.width,sourceHeight:snapshot?.height,liquifyField:state?.liquifyField,uprightWidth:state?.uprightWidth,uprightHeight:state?.uprightHeight,expectedAfterURL:state?.expectedAfterURL};
  }
  async function refresh({signal}={}){
    snapshot=null;
    return run(async current=>{
      editorScope(getEditorState,targetAssetID,backdropAssetID);
      const fresh=await readFresh(current);
      editorScope(getEditorState,targetAssetID,backdropAssetID);
      snapshot=fresh;
      return getContext();
    },signal);
  }
  async function onApply(document,options){
    if(!exact(options,['target','backdrop','expectedRevision','signal'])||
        !exact(options.target,['id','sha256','sourceWidth','sourceHeight'])||
        !exact(options.backdrop,['id','sha256'])||
        !Number.isSafeInteger(options.expectedRevision)||
        options.expectedRevision<1)
      throw Error('ORIGINAL_SHADOW_HOST_APPLY_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('ORIGINAL_SHADOW_HOST_REFRESH_REQUIRED');
    if(options.target.id!==previous.target.id||
        options.target.sha256!==previous.target.sha256||
        options.target.sourceWidth!==previous.width||
        options.target.sourceHeight!==previous.height||
        options.backdrop.id!==previous.backdrop.id||
        options.backdrop.sha256!==previous.backdrop.sha256||
        options.expectedRevision!==previous.saved.revision)
      throw Error('ORIGINAL_SHADOW_HOST_UI_SCOPE_MISMATCH');
    return run(async signal=>{
      try{
        editorScope(getEditorState,targetAssetID,backdropAssetID);
        const fresh=await readFresh(signal);
        if(!sameSnapshot(previous,fresh))
          throw Error('ORIGINAL_SHADOW_HOST_FRESH_SCOPE_CHANGED');
        const next=buildOriginalShadowManualRecipe({recipe:fresh.saved.body,
          document,target:{id:fresh.target.id,sha256:fresh.target.sha256,
            sourceWidth:fresh.width,sourceHeight:fresh.height,
            savedRevision:fresh.saved.revision},
          backdrop:{id:fresh.backdrop.id,sha256:fresh.backdrop.sha256},
          draftBaseRevision:fresh.saved.revision,signal});
        editorScope(getEditorState,targetAssetID,backdropAssetID);
        check(signal);
        // SQLite saveRecipe validates target/backdrop binding and CAS in one
        // transaction. A response lost after commit is an uncertain outcome.
        const committed=await api.request(`/v1/assets/${targetAssetID}/recipe`,
          {method:'PUT',body:{expectedRevision:fresh.saved.revision,
            recipe:next},signal});
        check(signal);
        if(committed?.revision!==fresh.saved.revision+1||
            JSON.stringify(committed.body)!==JSON.stringify(next))
          throw Error('ORIGINAL_SHADOW_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await readFresh(signal);
        editorScope(getEditorState,targetAssetID,backdropAssetID);
        if(verified.identity.id!==fresh.identity.id||
            verified.identity.tenantId!==fresh.identity.tenantId||
            !sameAsset(verified.target,fresh.target)||
            !sameAsset(verified.backdrop,fresh.backdrop)||
            verified.width!==fresh.width||verified.height!==fresh.height||
            verified.saved.revision!==committed.revision||
            JSON.stringify(verified.saved.body)!==JSON.stringify(next))
          throw Error('ORIGINAL_SHADOW_HOST_SAVE_OUTCOME_UNVERIFIED');
        snapshot=verified;
        return {accepted:true};
      }catch(error){
        snapshot=null;
        throw error;
      }
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.abort();}
  return Object.freeze({getContext,refresh,onApply,dispose});
}
