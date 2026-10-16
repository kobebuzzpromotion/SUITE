import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {TrialClient} from './trial-client.mjs';
import {EditorSession} from './session.mjs';
import {createProcessing} from './processing/index.mjs';
import {makeManualClothingSpotDocument} from './manual-clothing-spot-ui.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {MAX_INPUT_BYTES} from './processing/pure.mjs';

// Trial-only bridge. UI context and document fields are never authority. Only
// the registered Original bytes, decoded by the bundled Browser Worker, can
// establish full dimensions. Synthetic/non-RAW bytes must fail that decode.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const abort=()=>new DOMException('Clothing spot host cancelled','AbortError');
const check=signal=>{if(signal?.aborted)throw abort();};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function plain(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===null||proto===Object.prototype||
    (Object.getPrototypeOf(proto)===null&&
      Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object');
}
function exact(value,keys){return plain(value)&&Reflect.ownKeys(value).length===keys.length&&
  keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);
    return d?.enumerable===true&&Object.hasOwn(d,'value');});}
function jsonSnapshot(value,depth=0,budget={count:0}){
  if(++budget.count>100_000||depth>32)throw Error('CLOTHING_HOST_JSON_INVALID');
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value)){
    if(value.length>4096||Reflect.ownKeys(value).length!==value.length+1)
      throw Error('CLOTHING_HOST_JSON_INVALID');
    return Array.from({length:value.length},(_,index)=>{
      const d=Object.getOwnPropertyDescriptor(value,String(index));
      if(!d||!Object.hasOwn(d,'value'))throw Error('CLOTHING_HOST_JSON_INVALID');
      return jsonSnapshot(d.value,depth+1,budget);
    });
  }
  if(!plain(value))throw Error('CLOTHING_HOST_JSON_INVALID');
  const out={};
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string')throw Error('CLOTHING_HOST_JSON_INVALID');
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value')||key==='__proto__')
      throw Error('CLOTHING_HOST_JSON_INVALID');
    Object.defineProperty(out,key,{value:jsonSnapshot(d.value,depth+1,budget),
      enumerable:true,writable:true,configurable:true});
  }
  return out;
}
function identity(session,prior){
  const person=session?.principal;
  if(session?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(person?.id)||
      person.tenantId!==`trial-${person.id}`)
    throw Error(session?.endedReason||'CLOTHING_HOST_SESSION_REQUIRED');
  if(prior&&(prior.id!==person.id||prior.tenantId!==person.tenantId))
    throw Error('CLOTHING_HOST_SESSION_CHANGED');
  return {id:person.id,tenantId:person.tenantId};
}
function registered(assets,assetID,tenantId){
  if(!Array.isArray(assets))throw Error('CLOTHING_HOST_ASSETS_INVALID');
  const matches=assets.filter(asset=>asset?.id===assetID);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('CLOTHING_HOST_ASSET_UNAVAILABLE');
  const asset=matches[0];
  return {id:asset.id,sha256:asset.sha256.toLowerCase(),size:asset.size,tenantId};
}
function sameAsset(a,b){return ['id','sha256','size','tenantId'].every(k=>a[k]===b[k]);}
function editor(session,assetID,revision){
  const state=session.state;
  if(state.asset?.id!==assetID||state.revision!==revision||state.dirty!==false||
      state.busy!==null||state.exporting!==false||!session.proxy)
    throw Error('CLOTHING_HOST_EDITOR_CHANGED');
  return state;
}
async function original(api,asset,signal){
  check(signal);
  const bytes=await api.getOriginal(asset.id,{signal});check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size)
    throw Error('CLOTHING_HOST_ORIGINAL_CHANGED');
  if(!globalThis.crypto?.subtle)throw Error('CLOTHING_HOST_CRYPTO_UNAVAILABLE');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    n=>n.toString(16).padStart(2,'0')).join('');
  check(signal);
  if(digest!==asset.sha256)throw Error('CLOTHING_HOST_ORIGINAL_CHANGED');
  return bytes;
}
async function permission(api,id,signal){
  const proof=await api.request('/trial/authorize',
    {method:'POST',body:{assetID:id,action:'edit'},signal});
  check(signal);
  if(proof?.authorized!==true)throw Error('CLOTHING_HOST_PERMISSION_DENIED');
}
function dimensions(decoded){
  const pixels=decoded?.pixels;
  if(!pixels||!Number.isSafeInteger(pixels.width)||pixels.width<1||
      !Number.isSafeInteger(pixels.height)||pixels.height<1||
      pixels.width*pixels.height>8_000_000||
      !(pixels.data instanceof Uint8ClampedArray)||
      pixels.data.length!==pixels.width*pixels.height*4)
    throw Error('CLOTHING_HOST_DECODE_DIMENSIONS_INVALID');
  return {width:pixels.width,height:pixels.height};
}
function linkedSignal(external){
  if(external!==undefined&&(!external||typeof external.aborted!=='boolean'||
      typeof external.addEventListener!=='function'||
      typeof external.removeEventListener!=='function'))
    throw Error('CLOTHING_HOST_SIGNAL_INVALID');
  const controller=new AbortController(),stop=()=>controller.abort();
  external?.addEventListener('abort',stop,{once:true});
  if(external?.aborted)controller.abort();
  return {signal:controller.signal,stop,cleanup:()=>external?.removeEventListener('abort',stop)};
}

/** Connects manual-clothing-spot-ui's getContext/onSubmit to an invited Trial.
 * A fresh Worker decode is mandatory; no caller-provided dimensions or decoder
 * are accepted. The returned saved result does not claim Editor/Final refresh. */
export function createTrialManualClothingSpotHost({api,session,assetID,getEditorView}={}){
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||!UUID.test(assetID)||typeof getEditorView!=='function')
    throw Error('CLOTHING_HOST_INIT_INVALID');
  const processing=createProcessing();
  let snapshot=null,disposed=false,inflight=null;
  async function readFresh(signal){
    check(signal);
    const person=identity(await api.request('/trial/session',{signal}));
    const asset=registered((await api.request('/v1/assets',{signal})).assets,
      assetID,person.tenantId);
    const bytes=await original(api,asset,signal);
    // Bundled Worker/LibRaw is the independent decode provenance. A Node test
    // without Browser Worker or a synthetic non-RAW file cannot pass this gate.
    const size=dimensions(await processing.decodeRaw(bytes.slice(0),
      {mode:'final',signal}));check(signal);
    const saved=(await api.request(`/v1/assets/${assetID}/recipe`,{signal})).recipe;
    if(!Number.isSafeInteger(saved?.revision)||saved.revision<1||!saved.body)
      throw Error('CLOTHING_HOST_SAVED_RECIPE_REQUIRED');
    validateRecipe(saved.body);
    const existing=saved.body.parameters.extendedParameters.clothingSpotManual;
    if(existing&&(existing.binding.assetID!==asset.id||
        existing.binding.originalSHA256.toLowerCase()!==asset.sha256||
        existing.binding.sourceWidth!==size.width||
        existing.binding.sourceHeight!==size.height))
      throw Error('CLOTHING_HOST_EXISTING_DOCUMENT_MISMATCH');
    const again=registered((await api.request('/v1/assets',{signal})).assets,
      assetID,person.tenantId);
    if(!sameAsset(asset,again))throw Error('CLOTHING_HOST_ASSET_CHANGED');
    const latest=(await api.request(`/v1/assets/${assetID}/recipe`,{signal})).recipe;
    if(latest?.revision!==saved.revision||!same(latest.body,saved.body))
      throw Error('CLOTHING_HOST_REVISION_CHANGED');
    await original(api,asset,signal);
    await permission(api,assetID,signal);
    identity(await api.request('/trial/session',{signal}),person);
    check(signal);
    return {person,asset,size,saved:{revision:saved.revision,
      body:jsonSnapshot(saved.body)}};
  }
  async function run(task,external){
    if(disposed)throw Error('CLOTHING_HOST_DISPOSED');
    if(inflight)throw Error('CLOTHING_HOST_BUSY');
    const link=linkedSignal(external);inflight=link;
    try{return await task(link.signal);}
    finally{link.cleanup();if(inflight===link)inflight=null;}
  }
  function view(){
    const result=getEditorView();
    if(!result||!['after','split'].includes(result.view)||
        result.ready!==true||result.permissionExpired===true)
      throw Error('CLOTHING_HOST_VIEW_UNAVAILABLE');
    return result;
  }
  function getContext(){
    let display;
    try{display=view();}catch{display={view:'before',ready:false};}
    let ready=false,proxy;
    try{
      if(!snapshot||disposed)throw Error('NO_SNAPSHOT');
      const state=editor(session,assetID,snapshot.saved.revision);
      if(state.asset.sha256?.toLowerCase()!==snapshot.asset.sha256||
          !same(state.recipe,snapshot.saved.body))throw Error('EDITOR_RECIPE_CHANGED');
      proxy=session.proxy;
      const scale=Math.min(1,1600/Math.max(snapshot.size.width,snapshot.size.height));
      if(proxy.width!==Math.max(1,Math.round(snapshot.size.width*scale))||
          proxy.height!==Math.max(1,Math.round(snapshot.size.height*scale)))
        throw Error('NO_PROXY');
      ready=display.ready===true;
    }catch{}
    return {assetID:snapshot?.asset.id,originalSHA256:snapshot?.asset.sha256,
      sourceWidth:snapshot?.size.width,sourceHeight:snapshot?.size.height,
      savedRevision:snapshot?.saved.revision,
      uprightWidth:proxy?.width,uprightHeight:proxy?.height,
      view:display.view,ready,dirty:session.state.dirty,
      busy:session.state.busy!==null||session.state.exporting,
      permissionExpired:!ready,rotationDegrees:display.rotationDegrees,
      crop:display.crop,canvasExpand:display.canvasExpand,
      sceneGeometry:snapshot?.saved.body.parameters.extendedParameters.sceneGeometry,
      beforeRect:display.beforeRect,...(ready?currentBrushDisplayGeometry(session):{})};
  }
  async function refresh({signal}={}){
    snapshot=null;
    return run(async current=>{
      try{
        const start=session.state;
        if(start.asset?.id!==assetID||start.dirty!==false||
            start.busy!==null||start.exporting!==false||!session.proxy)
          throw Error('CLOTHING_HOST_EDITOR_CHANGED');
        view();
        const fresh=await readFresh(current);
        const currentState=editor(session,assetID,fresh.saved.revision);view();
        if(currentState.asset.sha256?.toLowerCase()!==fresh.asset.sha256||
            !same(currentState.recipe,fresh.saved.body))
          throw Error('CLOTHING_HOST_ASSET_CHANGED');
        snapshot=fresh;
        if(!getContext().ready)throw Error('CLOTHING_HOST_PROXY_MISMATCH');
        return getContext();
      }catch(error){snapshot=null;throw error;}
    },signal);
  }
  async function onSubmit(input,options){
    if(!exact(options,['savedRevision','signal'])||
        !Number.isSafeInteger(options.savedRevision)||options.savedRevision<1)
      throw Error('CLOTHING_HOST_SUBMIT_OPTIONS_INVALID');
    if(!snapshot)throw Error('CLOTHING_HOST_REFRESH_REQUIRED');
    const prior=snapshot;
    return run(async signal=>{
      try{
        const local=editor(session,assetID,prior.saved.revision);view();
        if(local.asset.sha256?.toLowerCase()!==prior.asset.sha256||
            !same(local.recipe,prior.saved.body))
          throw Error('CLOTHING_HOST_EDITOR_CHANGED');
        if(options.savedRevision!==prior.saved.revision)
          throw Error('CLOTHING_HOST_REVISION_CHANGED');
        const doc=jsonSnapshot(input);
        if(!exact(doc,['schemaVersion','engineVersion','binding','targetRect',
            'referenceRect','targetStrokes']))
          throw Error('CLOTHING_HOST_DOCUMENT_INVALID');
        const checked=makeManualClothingSpotDocument(doc.binding,doc.targetRect,
          doc.referenceRect,doc.targetStrokes);
        if(!same(doc,checked)||checked.binding.assetID!==prior.asset.id||
            checked.binding.originalSHA256.toLowerCase()!==prior.asset.sha256||
            checked.binding.sourceWidth!==prior.size.width||
            checked.binding.sourceHeight!==prior.size.height)
          throw Error('CLOTHING_HOST_DOCUMENT_BINDING_MISMATCH');
        const fresh=await readFresh(signal);
        if(fresh.person.id!==prior.person.id||
            fresh.person.tenantId!==prior.person.tenantId||
            !sameAsset(fresh.asset,prior.asset)||
            !same(fresh.size,prior.size)||
            fresh.saved.revision!==prior.saved.revision||
            !same(fresh.saved.body,prior.saved.body))
          throw Error('CLOTHING_HOST_FRESH_SCOPE_CHANGED');
        editor(session,assetID,prior.saved.revision);view();check(signal);
        const next=jsonSnapshot(fresh.saved.body);
        next.parameters.extendedParameters.clothingSpotManual=checked;
        validateRecipe(next);
        const committed=await api.request(`/v1/assets/${assetID}/recipe`,
          {method:'PUT',body:{expectedRevision:fresh.saved.revision,
            recipe:next},signal});
        check(signal);
        if(committed?.revision!==fresh.saved.revision+1||
            !same(committed.body,next))
          throw Error('CLOTHING_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await readFresh(signal);
        view();
        if(verified.person.id!==fresh.person.id||
            !sameAsset(verified.asset,fresh.asset)||
            !same(verified.size,fresh.size)||
            verified.saved.revision!==committed.revision||
            !same(verified.saved.body,next))
          throw Error('CLOTHING_HOST_SAVE_OUTCOME_UNVERIFIED');
        const after=session.state;
        if(after.asset?.id!==assetID||
            after.asset.sha256?.toLowerCase()!==fresh.asset.sha256||
            after.dirty!==false||after.busy!==null||after.exporting!==false)
          throw Error('CLOTHING_HOST_SAVE_OUTCOME_UNVERIFIED');
        snapshot=verified;
        return Object.freeze({savedVerified:true,revision:verified.saved.revision,
          editorReloadRequired:true,finalVerified:false});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.stop();processing.dispose();}
  return Object.freeze({getContext,refresh,onSubmit,dispose});
}
