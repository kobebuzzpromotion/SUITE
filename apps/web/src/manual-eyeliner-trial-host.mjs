import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {TrialClient} from './trial-client.mjs';
import {EditorSession,checksum} from './session.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {makeManualEyelinerDocument} from './manual-eyeliner-ui.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from
  '../../../dist/apps/backend/src/portrait-recipe.js';
import {PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>structuredClone(value);
const check=signal=>{if(signal?.aborted)
  throw new DOMException('Eyeliner host cancelled','AbortError');};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype&&
      !(Object.getPrototypeOf(proto)===null&&
        Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function linked(external){
  if(external!==undefined&&(!external||typeof external.aborted!=='boolean'||
      typeof external.addEventListener!=='function'||
      typeof external.removeEventListener!=='function'))
    throw Error('EYELINER_HOST_SIGNAL_INVALID');
  const controller=new AbortController(),abort=()=>controller.abort();
  external?.addEventListener('abort',abort,{once:true});
  if(external?.aborted)controller.abort();
  return {signal:controller.signal,abort,cleanup:()=>
    external?.removeEventListener('abort',abort)};
}
function identity(response,expected){
  const principal=response?.principal;
  if(response?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(principal?.id)||
      principal.tenantId!==`trial-${principal.id}`)
    throw Error(response?.endedReason||'EYELINER_HOST_TRIAL_SESSION_REQUIRED');
  const result={id:principal.id,tenantId:principal.tenantId};
  if(expected&&!same(result,expected))throw Error('EYELINER_HOST_SESSION_CHANGED');
  return result;
}
function privacy(session,remote){
  session.requirePersonProcessing();
  if(session.state.personProcessingStatus!==PERSON_PRIVACY_APPROVED||
      remote?.personProcessingStatus!==PERSON_PRIVACY_APPROVED)
    throw Error('EYELINER_HOST_PERSON_PRIVACY_NOT_APPROVED');
  return PERSON_PRIVACY_APPROVED;
}
function assetFrom(list,id,tenantId,expected){
  if(!Array.isArray(list))throw Error('EYELINER_HOST_ASSET_LIST_INVALID');
  const matches=list.filter(item=>item?.id===id);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('EYELINER_HOST_ASSET_UNAVAILABLE');
  const result={id,tenantId,sha256:matches[0].sha256.toLowerCase(),
    size:matches[0].size};
  if(expected&&!same(result,expected))throw Error('EYELINER_HOST_ASSET_CHANGED');
  return result;
}
function portraitFor(body,asset,personID,reference){
  validateRecipe(body);
  const portrait=body.parameters.extendedParameters.portrait;
  if(!portrait||!reference||!Array.isArray(portrait.targets)||
      !portrait.targets.some(target=>target.id===personID))
    throw Error('EYELINER_HOST_PORTRAIT_PERSON_CONTINUITY_REQUIRED');
  validatePortraitBinding(portrait,asset.id,asset.sha256);
  validatePortraitContinuity(reference,portrait);
}
function editorState(session,getView,expected){
  const state=session.state,asset=state.asset;
  if(!asset||!UUID.test(asset.id)||!SHA.test(asset.sha256)||
      !Number.isSafeInteger(asset.size)||asset.size<1||
      !Number.isSafeInteger(state.revision)||state.revision<1||
      !UUID.test(state.selectedPersonID)||!Array.isArray(state.people)||
      !state.people.some(person=>person.id===state.selectedPersonID&&
        person.complete===true)||!session.detections?.length||
      !session.reference||state.dirty!==false||state.busy!==null||
      state.exporting!==false||getView()!=='after')
    throw Error('EYELINER_HOST_EDITOR_SCOPE_UNAVAILABLE');
  if(expected&&(asset.id!==expected.asset.id||
      asset.tenantId!==expected.asset.tenantId||
      asset.sha256.toLowerCase()!==expected.asset.sha256||
      asset.size!==expected.asset.size||
      state.revision!==expected.revision||
      state.selectedPersonID!==expected.personID||
      session.operation!==expected.operation||
      !same(state.recipe,expected.recipe)))
    throw Error('EYELINER_HOST_EDITOR_SCOPE_CHANGED');
  portraitFor(state.recipe,asset,state.selectedPersonID,session.reference);
  return {asset:{id:asset.id,tenantId:asset.tenantId,
    sha256:asset.sha256.toLowerCase(),size:asset.size},
    personID:state.selectedPersonID,revision:state.revision,
    recipe:copy(state.recipe),operation:session.operation};
}
function savedRecipe(value,asset,personID,reference,revision,body){
  if(!value||value.revision!==revision||value.branch===true||
      !value.body||!same(value.body,body))
    throw Error('EYELINER_HOST_SAVED_RECIPE_CHANGED');
  portraitFor(value.body,asset,personID,reference);
}
async function sourceDimensions(api,processing,asset,signal){
  check(signal);
  const bytes=await api.getOriginal(asset.id,{signal});check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||
      await checksum(bytes)!==asset.sha256)
    throw Error('EYELINER_HOST_ORIGINAL_CHANGED');
  check(signal);
  // Only the host's bundled Browser Worker may attest to LibRaw decoding.
  const decoded=await processing.decodeRaw(bytes.slice(0),{mode:'final',signal});
  check(signal);assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  if(proof?.sourceRepresentation!=='original-camera-raw'||
      proof?.decoderPackage!=='@colorhythm/libraw-wasm'||
      proof?.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||
      proof?.sourceSHA256?.toLowerCase()!==asset.sha256||
      proof?.mode!=='final'||proof?.thumbnailFallback!==false||
      decoded.pixels.width*decoded.pixels.height>8_000_000)
    throw Error('EYELINER_HOST_RAW_DECODE_PROVENANCE_REQUIRED');
  return {width:decoded.pixels.width,height:decoded.pixels.height};
}

/** Save-boundary only. Drawn eyelids and selected person IDs are assertions,
 * not identity, anatomy or permission proof. Product Trial currently lacks
 * approved person privacy, so no ordinary Trial save can pass this gate. */
export function createTrialManualEyelinerHost({api,session,getView}={}){
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||typeof getView!=='function')
    throw Error('EYELINER_HOST_INIT_INVALID');
  const processing=createProcessing();
  let snapshot=null,disposed=false,inflight=null;
  async function run(task,external){
    if(disposed)throw Error('EYELINER_HOST_DISPOSED');
    if(inflight)throw Error('EYELINER_HOST_BUSY');
    const work=linked(external);inflight=work;
    try{check(work.signal);return await task(work.signal);}
    finally{work.cleanup();if(inflight===work)inflight=null;}
  }
  async function serverRead(expected,revision,body,previousIdentity,signal){
    check(signal);
    const remote=await api.request('/trial/session',{signal});check(signal);
    const who=identity(remote,previousIdentity);
    privacy(session,remote);
    const asset=assetFrom((await api.request('/v1/assets',{signal})).assets,
      expected.asset.id,who.tenantId,expected.asset);check(signal);
    const edit=await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal});check(signal);
    if(edit?.authorized!==true)throw Error('EYELINER_HOST_EDIT_PERMISSION_DENIED');
    const stored=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    savedRecipe(stored,asset,expected.personID,session.reference,revision,body);
    const dimensions=await sourceDimensions(api,processing,asset,signal);
    assetFrom((await api.request('/v1/assets',{signal})).assets,
      asset.id,who.tenantId,asset);check(signal);
    const latest=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    savedRecipe(latest,asset,expected.personID,session.reference,revision,body);
    const permission=await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal});check(signal);
    if(permission?.authorized!==true)
      throw Error('EYELINER_HOST_EDIT_PERMISSION_DENIED');
    const finalSession=await api.request('/trial/session',{signal});check(signal);
    identity(finalSession,who);privacy(session,finalSession);
    return {identity:who,asset,dimensions,revision,recipe:copy(body)};
  }
  function getContext(){
    if(disposed||!snapshot)throw Error('EYELINER_HOST_REFRESH_REQUIRED');
    const current=editorState(session,getView,snapshot);
    const scale=Math.min(1,1600/Math.max(snapshot.dimensions.width,
      snapshot.dimensions.height));
    if(!session.proxy||
        session.proxy.width!==Math.max(1,Math.round(snapshot.dimensions.width*scale))||
        session.proxy.height!==Math.max(1,Math.round(snapshot.dimensions.height*scale)))
      throw Error('EYELINER_HOST_PROXY_MISMATCH');
    return {assetID:current.asset.id,originalSHA256:current.asset.sha256,
      personID:current.personID,sourceWidth:snapshot.dimensions.width,
      sourceHeight:snapshot.dimensions.height,savedRevision:snapshot.revision,
      view:'after',ready:true,dirty:false,busy:false,permissionExpired:false,...(currentBrushDisplayGeometry(session))};
  }
  async function refresh({signal}={}){
    snapshot=null;
    return run(async current=>{
      try{
        session.requirePersonProcessing();
        const editor=editorState(session,getView);
        const fresh=await serverRead(editor,editor.revision,editor.recipe,
          null,current);
        editorState(session,getView,editor);
        snapshot={...fresh,personID:editor.personID,
          operation:editor.operation};
        return getContext();
      }catch(error){snapshot=null;throw error;}
    },signal);
  }
  async function onSubmit(document,options){
    if(!exact(options,['savedRevision','personID','signal'])||
        !Number.isSafeInteger(options.savedRevision)||options.savedRevision<1||
        !UUID.test(options.personID))
      throw Error('EYELINER_HOST_SUBMIT_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('EYELINER_HOST_REFRESH_REQUIRED');
    if(!exact(document,['schemaVersion','engineVersion','representation',
      'binding','eyeTargets','settings']))
      throw Error('EYELINER_HOST_DOCUMENT_INVALID');
    const validated=makeManualEyelinerDocument(document.binding,
      document.eyeTargets,document.settings);
    if(!same(validated,document)||
        validated.binding.assetID!==previous.asset.id||
        validated.binding.originalSHA256.toLowerCase()!==previous.asset.sha256||
        validated.binding.personID!==previous.personID||
        validated.binding.sourceWidth!==previous.dimensions.width||
        validated.binding.sourceHeight!==previous.dimensions.height||
        options.savedRevision!==previous.revision||
        options.personID!==previous.personID)
      throw Error('EYELINER_HOST_DOCUMENT_SCOPE_MISMATCH');
    return run(async signal=>{
      try{
        editorState(session,getView,previous);
        const fresh=await serverRead(previous,previous.revision,
          previous.recipe,previous.identity,signal);
        if(!same(fresh.dimensions,previous.dimensions))
          throw Error('EYELINER_HOST_SOURCE_CHANGED');
        const next=copy(fresh.recipe);
        const prior=next.parameters.extendedParameters.eyelinerManual;
        if(prior&&prior.binding.personID!==previous.personID)
          throw Error('EYELINER_HOST_EXISTING_PERSON_MISMATCH');
        next.parameters.extendedParameters.eyelinerManual=validated;
        validateRecipe(next);
        editorState(session,getView,previous);check(signal);
        const saved=await api.request(`/v1/assets/${previous.asset.id}/recipe`,
          {method:'PUT',body:{expectedRevision:previous.revision,recipe:next},
            signal});check(signal);
        if(saved?.revision!==previous.revision+1||saved.branch===true||
            !same(saved.body,next))
          throw Error('EYELINER_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await serverRead(previous,saved.revision,next,
          previous.identity,signal);
        if(!same(verified.dimensions,previous.dimensions))
          throw Error('EYELINER_HOST_SAVE_OUTCOME_UNVERIFIED');
        editorState(session,getView,previous);
        snapshot=null;
        return Object.freeze({readbackVerified:true,
          savedRevision:verified.revision,editorSynchronized:false,
          realRAWProvenanceVerified:true,finalVerified:false});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.abort();
    processing.dispose();}
  return Object.freeze({refresh,getContext,onSubmit,dispose});
}
