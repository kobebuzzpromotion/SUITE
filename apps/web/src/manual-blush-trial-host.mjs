import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {TrialClient} from './trial-client.mjs';
import {EditorSession} from './session.mjs';
import {checksum} from './session.mjs';
import {makeManualBlushDocument} from './manual-blush-ui.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from
  '../../../dist/apps/backend/src/portrait-recipe.js';
import {assertPixels,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&[Object.prototype,null].includes(
    Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length&&
  keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);
    return d?.enumerable===true&&Object.hasOwn(d,'value');});
const abortError=()=>new DOMException('Manual Blush host cancelled','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError();};
const copy=value=>structuredClone(value);
function linked(external){
  if(external!==undefined&&(external===null||typeof external.aborted!=='boolean'||
      typeof external.addEventListener!=='function'||
      typeof external.removeEventListener!=='function'))
    throw Error('BLUSH_HOST_SIGNAL_INVALID');
  const controller=new AbortController(),abort=()=>controller.abort();
  external?.addEventListener('abort',abort,{once:true});
  if(external?.aborted)controller.abort();
  return {signal:controller.signal,abort,cleanup:()=>
    external?.removeEventListener('abort',abort)};
}
function identity(value,expected){
  const principal=value?.principal;
  if(value?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(principal?.id)||
      principal.tenantId!==`trial-${principal.id}`)
    throw Error(value?.endedReason||'BLUSH_HOST_TRIAL_SESSION_REQUIRED');
  if(expected&&(principal.id!==expected.id||
      principal.tenantId!==expected.tenantId))
    throw Error('BLUSH_HOST_SESSION_CHANGED');
  return {id:principal.id,tenantId:principal.tenantId};
}
function privacy(session,remote){
  session.requirePersonProcessing();
  const current=session.state.personProcessingStatus;
  if(current==='SYNTHETIC_TEST_ONLY'&&
      session.processing?.syntheticTestOnly===true&&
      typeof window==='undefined'&&typeof process!=='undefined'&&
      typeof process.env?.NODE_TEST_CONTEXT==='string')
    return 'synthetic-test-only';
  if(current===PERSON_PRIVACY_APPROVED&&
      remote?.personProcessingStatus===PERSON_PRIVACY_APPROVED)return 'approved';
  throw Error('BLUSH_HOST_PERSON_PRIVACY_NOT_APPROVED');
}
function assetFrom(list,id,tenantId,expected){
  if(!Array.isArray(list))throw Error('BLUSH_HOST_ASSET_LIST_INVALID');
  const matches=list.filter(item=>item?.id===id);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('BLUSH_HOST_ASSET_UNAVAILABLE');
  const asset=matches[0];
  if(expected&&(asset.sha256.toLowerCase()!==expected.sha256||
      asset.size!==expected.size))
    throw Error('BLUSH_HOST_ASSET_CHANGED');
  return {id,tenantId,sha256:asset.sha256.toLowerCase(),size:asset.size};
}
function portraitFor(recipe,asset,personID,reference){
  validateRecipe(recipe);
  const portrait=recipe.parameters.extendedParameters.portrait;
  if(!portrait||!reference||!Array.isArray(portrait.targets)||
      !portrait.targets.some(target=>target.id===personID))
    throw Error('BLUSH_HOST_PORTRAIT_PERSON_CONTINUITY_REQUIRED');
  validatePortraitBinding(portrait,asset.id,asset.sha256);
  validatePortraitContinuity(reference,portrait);
  return portrait;
}
function editorState(session,getView,expected){
  const state=session.state,asset=state.asset;
  if(!asset||!UUID.test(asset.id)||!SHA.test(asset.sha256)||
      !Number.isSafeInteger(asset.size)||asset.size<1||
      !Number.isSafeInteger(state.revision)||state.revision<1||
      !UUID.test(state.selectedPersonID)||
      !Array.isArray(state.people)||
      !state.people.some(person=>person.id===state.selectedPersonID&&
        person.complete===true)||!session.detections?.length||
      !session.reference||state.dirty!==false||state.busy!==null||
      state.exporting!==false||getView()!=='after')
    throw Error('BLUSH_HOST_EDITOR_SCOPE_UNAVAILABLE');
  if(expected&&(asset.id!==expected.asset.id||
      asset.sha256.toLowerCase()!==expected.asset.sha256||
      asset.size!==expected.asset.size||
      session.operation!==expected.sessionOperation||
      state.revision!==expected.revision||
      state.selectedPersonID!==expected.personID||
      !same(state.recipe,expected.recipe)))
    throw Error('BLUSH_HOST_EDITOR_SCOPE_CHANGED');
  portraitFor(state.recipe,asset,state.selectedPersonID,session.reference);
  return {asset:{id:asset.id,sha256:asset.sha256.toLowerCase(),
    size:asset.size},revision:state.revision,
    personID:state.selectedPersonID,recipe:copy(state.recipe),
    sessionOperation:session.operation};
}
function savedRecipe(record,asset,personID,reference,revision,body){
  if(!record||record.revision!==revision||record.branch===true||
      !record.body||!same(record.body,body))
    throw Error('BLUSH_HOST_SAVED_RECIPE_CHANGED');
  portraitFor(record.body,asset,personID,reference);
  return record.body;
}
async function originalDimensions(api,session,asset,privacyMode,signal){
  check(signal);
  const bytes=await api.getOriginal(asset.id,{signal});check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||
      await checksum(bytes)!==asset.sha256)
    throw Error('BLUSH_HOST_ORIGINAL_CHANGED');
  check(signal);
  const decoded=await session.processing.decodeRaw(bytes.slice(0),
    {mode:'final',signal});check(signal);
  assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  const real=privacyMode==='approved'&&
    proof?.sourceRepresentation==='original-camera-raw';
  const synthetic=privacyMode==='synthetic-test-only'&&
    proof?.sourceRepresentation==='synthetic-nonraw-test';
  if(!real&&!synthetic||proof.sourceSHA256?.toLowerCase()!==asset.sha256||
      proof.mode!=='final'||proof.thumbnailFallback!==false)
    throw Error('BLUSH_HOST_DECODE_PROVENANCE_REQUIRED');
  if(decoded.pixels.width*decoded.pixels.height>8_000_000)
    throw Error('BLUSH_HOST_DECODE_DIMENSIONS_INVALID');
  return {width:decoded.pixels.width,height:decoded.pixels.height};
}

/**
 * Independent Trial host for manual Blush authoring. A saved portrait target
 * supplies same-photo continuity, not independent anatomical/person identity.
 * Synthetic test-only decoding is NEVER a real RAW or production privacy pass.
 * Backend CAS/readback is authoritative for persistence; EditorSession still
 * needs a separate authenticated Blush preview/Final mount and reload path.
 */
export function createTrialManualBlushHost({api,session,getView}={}){
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||typeof getView!=='function')
    throw Error('BLUSH_HOST_INIT_INVALID');
  let snapshot=null,disposed=false,inflight=null;
  async function run(task,external){
    if(disposed)throw Error('BLUSH_HOST_DISPOSED');
    if(inflight)throw Error('BLUSH_HOST_BUSY');
    const work=linked(external);inflight=work;
    try{check(work.signal);return await task(work.signal);}
    finally{work.cleanup();if(inflight===work)inflight=null;}
  }
  async function serverRead(expected,revision,body,previousIdentity,signal){
    check(signal);
    const remote=await api.request('/trial/session',{signal});check(signal);
    const who=identity(remote,previousIdentity);
    const mode=privacy(session,remote);
    const assets=(await api.request('/v1/assets',{signal})).assets;check(signal);
    const asset=assetFrom(assets,expected.asset.id,who.tenantId,
      expected.asset);
    await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal}).then(permission=>{
      if(permission?.authorized!==true)
        throw Error('BLUSH_HOST_EDIT_PERMISSION_DENIED');
    });check(signal);
    const stored=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    savedRecipe(stored,asset,expected.personID,session.reference,revision,body);
    const dimensions=await originalDimensions(api,session,asset,mode,signal);
    const last=(await api.request('/v1/assets',{signal})).assets;check(signal);
    assetFrom(last,asset.id,who.tenantId,asset);
    const latest=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    savedRecipe(latest,asset,expected.personID,session.reference,revision,body);
    const permission=await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal});check(signal);
    if(permission?.authorized!==true)
      throw Error('BLUSH_HOST_EDIT_PERMISSION_DENIED');
    const finalSession=await api.request('/trial/session',{signal});check(signal);
    identity(finalSession,who);
    if(privacy(session,finalSession)!==mode)
      throw Error('BLUSH_HOST_PERSON_PRIVACY_CHANGED');
    return {identity:who,asset,dimensions,revision,recipe:copy(body),mode};
  }
  async function refresh({signal}={}){
    snapshot=null;
    return run(async current=>{
      session.requirePersonProcessing();
      const expected=editorState(session,getView);
      const fresh=await serverRead(expected,expected.revision,
        expected.recipe,null,current);
      editorState(session,getView,expected);
      snapshot={...fresh,personID:expected.personID,
        sessionOperation:expected.sessionOperation};
      return getContext();
    },signal);
  }
  function getContext(){
    if(disposed||!snapshot)throw Error('BLUSH_HOST_REFRESH_REQUIRED');
    const state=editorState(session,getView,{asset:snapshot.asset,
      revision:snapshot.revision,personID:snapshot.personID,
      recipe:snapshot.recipe,sessionOperation:snapshot.sessionOperation});
    return {assetID:state.asset.id,originalSHA256:state.asset.sha256,
      personID:state.personID,sourceWidth:snapshot.dimensions.width,
      sourceHeight:snapshot.dimensions.height,savedRevision:snapshot.revision,
      view:'after',ready:true,dirty:false,busy:false,
      permissionExpired:false,...(currentBrushDisplayGeometry(session))};
  }
  async function onSubmit(document,options){
    if(!exact(options,['savedRevision','personID','signal'])||
        !Number.isSafeInteger(options.savedRevision)||
        !UUID.test(options.personID))
      throw Error('BLUSH_HOST_SUBMIT_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('BLUSH_HOST_REFRESH_REQUIRED');
    if(!exact(document,['schemaVersion','engineVersion','binding',
      'cheekStrokes','settings']))
      throw Error('BLUSH_HOST_DOCUMENT_INVALID');
    const validated=makeManualBlushDocument(document?.binding,
      document?.cheekStrokes,document?.settings);
    if(!same(validated,document)||
        validated.binding.assetID!==previous.asset.id||
        validated.binding.originalSHA256.toLowerCase()!==previous.asset.sha256||
        validated.binding.personID!==previous.personID||
        validated.binding.sourceWidth!==previous.dimensions.width||
        validated.binding.sourceHeight!==previous.dimensions.height||
        options.savedRevision!==previous.revision||
        options.personID!==previous.personID)
      throw Error('BLUSH_HOST_DOCUMENT_SCOPE_MISMATCH');
    return run(async signal=>{
      try{
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,
          sessionOperation:previous.sessionOperation});
        const fresh=await serverRead(previous,previous.revision,
          previous.recipe,previous.identity,signal);
        if(fresh.dimensions.width!==previous.dimensions.width||
            fresh.dimensions.height!==previous.dimensions.height||
            fresh.mode!==previous.mode)
          throw Error('BLUSH_HOST_SOURCE_CHANGED');
        const next=copy(fresh.recipe);
        const prior=next.parameters.extendedParameters.blushManual;
        if(prior&&prior.binding.personID!==previous.personID)
          throw Error('BLUSH_HOST_EXISTING_PERSON_MISMATCH');
        next.parameters.extendedParameters.blushManual=validated;
        validateRecipe(next);
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,
          sessionOperation:previous.sessionOperation});
        check(signal);
        const saved=await api.request(`/v1/assets/${previous.asset.id}/recipe`,
          {method:'PUT',body:{expectedRevision:previous.revision,recipe:next},
            signal});check(signal);
        if(saved?.revision!==previous.revision+1||!same(saved.body,next))
          throw Error('BLUSH_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await serverRead(previous,saved.revision,next,
          previous.identity,signal);
        if(verified.dimensions.width!==previous.dimensions.width||
            verified.dimensions.height!==previous.dimensions.height||
            verified.mode!==previous.mode)
          throw Error('BLUSH_HOST_SAVE_OUTCOME_UNVERIFIED');
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,
          sessionOperation:previous.sessionOperation});
        snapshot=null;
        return Object.freeze({readbackVerified:true,savedRevision:saved.revision,
          editorSynchronized:false,syntheticTestOnly:verified.mode===
            'synthetic-test-only'});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.abort();}
  return Object.freeze({refresh,getContext,onSubmit,dispose});
}
