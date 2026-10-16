import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {TrialClient} from './trial-client.mjs';
import {EditorSession,checksum} from './session.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {makeManualContactsDocument} from './manual-contacts-ui.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from
  '../../../dist/apps/backend/src/portrait-recipe.js';
import {PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const copy=value=>structuredClone(value);
const abortError=()=>new DOMException('Contacts host cancelled','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError();};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function linked(external){
  if(external!==undefined&&(external===null||typeof external.aborted!=='boolean'||
      typeof external.addEventListener!=='function'||
      typeof external.removeEventListener!=='function'))
    throw Error('CONTACTS_HOST_SIGNAL_INVALID');
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
    throw Error(value?.endedReason||'CONTACTS_HOST_TRIAL_SESSION_REQUIRED');
  const result={id:principal.id,tenantId:principal.tenantId};
  if(expected&&!same(result,expected))throw Error('CONTACTS_HOST_SESSION_CHANGED');
  return result;
}
function privacy(session,remote){
  session.requirePersonProcessing();
  const status=session.state.personProcessingStatus;
  if(status==='SYNTHETIC_TEST_ONLY'&&
      session.processing?.syntheticTestOnly===true&&
      typeof window==='undefined'&&typeof process!=='undefined'&&
      typeof process.env?.NODE_TEST_CONTEXT==='string')
    return 'synthetic-test-only';
  if(status===PERSON_PRIVACY_APPROVED&&
      remote?.personProcessingStatus===PERSON_PRIVACY_APPROVED)
    return 'approved';
  throw Error('CONTACTS_HOST_PERSON_PRIVACY_NOT_APPROVED');
}
function assetFrom(list,id,tenantId,expected){
  if(!Array.isArray(list))throw Error('CONTACTS_HOST_ASSET_LIST_INVALID');
  const matches=list.filter(item=>item?.id===id);
  if(matches.length!==1||matches[0].tenantId!==tenantId||
      matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
      !SHA.test(matches[0].sha256)||
      !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
      matches[0].size>MAX_INPUT_BYTES)
    throw Error('CONTACTS_HOST_ASSET_UNAVAILABLE');
  const result={id,tenantId,sha256:matches[0].sha256.toLowerCase(),
    size:matches[0].size};
  if(expected&&!same(result,expected))throw Error('CONTACTS_HOST_ASSET_CHANGED');
  return result;
}
function portraitFor(recipe,asset,personID,reference){
  validateRecipe(recipe);
  const portrait=recipe.parameters.extendedParameters.portrait;
  if(!portrait||!reference||!Array.isArray(portrait.targets)||
      !portrait.targets.some(target=>target.id===personID))
    throw Error('CONTACTS_HOST_PORTRAIT_PERSON_CONTINUITY_REQUIRED');
  validatePortraitBinding(portrait,asset.id,asset.sha256);
  validatePortraitContinuity(reference,portrait);
  // A saved portrait target links one photo/person ID; it does not attest
  // that either eye or an iris has been anatomically identified.
  return portrait;
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
    throw Error('CONTACTS_HOST_EDITOR_SCOPE_UNAVAILABLE');
  if(expected&&(asset.id!==expected.asset.id||
      asset.tenantId!==expected.asset.tenantId||
      asset.sha256.toLowerCase()!==expected.asset.sha256||
      asset.size!==expected.asset.size||
      session.operation!==expected.sessionOperation||
      state.revision!==expected.revision||
      state.selectedPersonID!==expected.personID||
      !same(state.recipe,expected.recipe)))
    throw Error('CONTACTS_HOST_EDITOR_SCOPE_CHANGED');
  portraitFor(state.recipe,asset,state.selectedPersonID,session.reference);
  return {asset:{id:asset.id,tenantId:asset.tenantId,
      sha256:asset.sha256.toLowerCase(),size:asset.size},
    revision:state.revision,personID:state.selectedPersonID,
    recipe:copy(state.recipe),sessionOperation:session.operation};
}
function storedRecipe(record,asset,personID,reference,revision,body){
  if(!record||record.revision!==revision||record.branch===true||
      !record.body||!same(record.body,body))
    throw Error('CONTACTS_HOST_SAVED_RECIPE_CHANGED');
  portraitFor(record.body,asset,personID,reference);
  return record.body;
}
async function originalDimensions(api,session,processing,asset,mode,signal){
  check(signal);
  const bytes=await api.getOriginal(asset.id,{signal});check(signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||
      await checksum(bytes)!==asset.sha256)
    throw Error('CONTACTS_HOST_ORIGINAL_CHANGED');
  check(signal);
  // The session's injected decoder is permitted solely by the hard Node test
  // guard above. Product approval always uses this host's own Browser Worker.
  const decoder=mode==='synthetic-test-only'?session.processing:processing;
  const decoded=await decoder.decodeRaw(bytes.slice(0),{mode:'final',signal});
  check(signal);assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  const real=mode==='approved'&&
    proof?.sourceRepresentation==='original-camera-raw'&&
    proof?.decoderPackage==='@colorhythm/libraw-wasm'&&
    proof?.decodePath==='open/unpack/dcrawProcess/dcrawMakeMemImage';
  const synthetic=mode==='synthetic-test-only'&&
    proof?.sourceRepresentation==='synthetic-nonraw-test';
  if((!real&&!synthetic)||proof.sourceSHA256?.toLowerCase()!==asset.sha256||
      proof.mode!=='final'||proof.thumbnailFallback!==false||
      decoded.pixels.width*decoded.pixels.height>8_000_000)
    throw Error('CONTACTS_HOST_DECODE_PROVENANCE_REQUIRED');
  return {width:decoded.pixels.width,height:decoded.pixels.height};
}

/** Trial-only mechanical save boundary. Current product lacks trusted iris/eye
 * geometry and ordinary Trial person-privacy approval. Consequently this host
 * can produce a positive CAS/readback only in Node's synthetic-test-only mode;
 * that is not product authentication, real RAW, anatomical proof or Final. */
export function createTrialManualContactsHost({api,session,getView}={}){
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||typeof getView!=='function')
    throw Error('CONTACTS_HOST_INIT_INVALID');
  const processing=createProcessing();
  let snapshot=null,disposed=false,inflight=null;
  async function run(task,external){
    if(disposed)throw Error('CONTACTS_HOST_DISPOSED');
    if(inflight)throw Error('CONTACTS_HOST_BUSY');
    const work=linked(external);inflight=work;
    try{check(work.signal);return await task(work.signal);}
    finally{work.cleanup();if(inflight===work)inflight=null;}
  }
  async function serverRead(expected,revision,body,previousIdentity,signal){
    check(signal);
    const remote=await api.request('/trial/session',{signal});check(signal);
    const who=identity(remote,previousIdentity);
    const mode=privacy(session,remote);
    if(mode!=='synthetic-test-only')
      throw Error('CONTACTS_HOST_IRIS_LOCATION_NOT_VERIFIED');
    const asset=assetFrom((await api.request('/v1/assets',{signal})).assets,
      expected.asset.id,who.tenantId,expected.asset);
    const edit=await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal});check(signal);
    if(edit?.authorized!==true)throw Error('CONTACTS_HOST_EDIT_PERMISSION_DENIED');
    const stored=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    storedRecipe(stored,asset,expected.personID,session.reference,revision,body);
    const dimensions=await originalDimensions(api,session,processing,asset,mode,signal);
    const again=assetFrom((await api.request('/v1/assets',{signal})).assets,
      asset.id,who.tenantId,asset);
    if(!same(asset,again))throw Error('CONTACTS_HOST_ASSET_CHANGED');
    const latest=(await api.request(`/v1/assets/${asset.id}/recipe`,
      {signal})).recipe;check(signal);
    storedRecipe(latest,asset,expected.personID,session.reference,revision,body);
    const finalEdit=await api.request('/trial/authorize',{method:'POST',
      body:{assetID:asset.id,action:'edit'},signal});check(signal);
    if(finalEdit?.authorized!==true)
      throw Error('CONTACTS_HOST_EDIT_PERMISSION_DENIED');
    const lastSession=await api.request('/trial/session',{signal});check(signal);
    identity(lastSession,who);
    if(privacy(session,lastSession)!==mode)
      throw Error('CONTACTS_HOST_PERSON_PRIVACY_CHANGED');
    return {identity:who,asset,dimensions,revision,
      recipe:copy(body),mode};
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
    if(disposed||!snapshot)throw Error('CONTACTS_HOST_REFRESH_REQUIRED');
    const state=editorState(session,getView,{asset:snapshot.asset,
      revision:snapshot.revision,personID:snapshot.personID,
      recipe:snapshot.recipe,sessionOperation:snapshot.sessionOperation});
    const scale=Math.min(1,1600/Math.max(snapshot.dimensions.width,
      snapshot.dimensions.height));
    if(!session.proxy||
        session.proxy.width!==Math.max(1,Math.round(snapshot.dimensions.width*scale))||
        session.proxy.height!==Math.max(1,Math.round(snapshot.dimensions.height*scale)))
      throw Error('CONTACTS_HOST_PROXY_MISMATCH');
    return {assetID:state.asset.id,originalSHA256:state.asset.sha256,
      personID:state.personID,eye:'left',
      sourceWidth:snapshot.dimensions.width,
      sourceHeight:snapshot.dimensions.height,savedRevision:snapshot.revision,
      view:'after',ready:true,dirty:false,busy:false,permissionExpired:false,...(currentBrushDisplayGeometry(session))};
  }
  function checkedScope(binding,revision,previous){
    if(!exact(binding,['assetID','originalSHA256','personID','eye',
      'sourceWidth','sourceHeight'])||
        binding.assetID!==previous.asset.id||
        typeof binding.originalSHA256!=='string'||
        binding.originalSHA256.toLowerCase()!==previous.asset.sha256||
        binding.personID!==previous.personID||
        !['left','right'].includes(binding.eye)||
        binding.sourceWidth!==previous.dimensions.width||
        binding.sourceHeight!==previous.dimensions.height||
        revision!==previous.revision)
      throw Error('CONTACTS_HOST_DOCUMENT_SCOPE_MISMATCH');
  }
  async function verifyFresh(options){
    if(!exact(options,['binding','savedRevision','signal']))
      throw Error('CONTACTS_HOST_VERIFY_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('CONTACTS_HOST_REFRESH_REQUIRED');
    checkedScope(options.binding,options.savedRevision,previous);
    return run(async signal=>{
      try{
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,sessionOperation:previous.sessionOperation});
        const fresh=await serverRead(previous,previous.revision,
          previous.recipe,previous.identity,signal);
        if(!same(fresh.dimensions,previous.dimensions))
          throw Error('CONTACTS_HOST_SOURCE_CHANGED');
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,sessionOperation:previous.sessionOperation});
        return Object.freeze({status:'verified',binding:copy(options.binding),
          savedRevision:previous.revision});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  async function submitDraft(document,options){
    if(!exact(options,['savedRevision','signal']))
      throw Error('CONTACTS_HOST_SUBMIT_OPTIONS_INVALID');
    const previous=snapshot;
    if(!previous)throw Error('CONTACTS_HOST_REFRESH_REQUIRED');
    if(!exact(document,['schemaVersion','engineVersion','binding',
      'irisRingStrokes','pupilExclusionStrokes','settings']))
      throw Error('CONTACTS_HOST_DOCUMENT_INVALID');
    const validated=makeManualContactsDocument(document.binding,
      document.irisRingStrokes,document.pupilExclusionStrokes,document.settings);
    if(!same(validated,document))throw Error('CONTACTS_HOST_DOCUMENT_INVALID');
    checkedScope(validated.binding,options.savedRevision,previous);
    return run(async signal=>{
      try{
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,sessionOperation:previous.sessionOperation});
        const fresh=await serverRead(previous,previous.revision,
          previous.recipe,previous.identity,signal);
        if(!same(fresh.dimensions,previous.dimensions))
          throw Error('CONTACTS_HOST_SOURCE_CHANGED');
        const next=copy(fresh.recipe);
        const prior=next.parameters.extendedParameters.contactsIrisManual;
        if(prior&&(prior.binding.personID!==previous.personID||
            prior.binding.eye!==validated.binding.eye))
          throw Error('CONTACTS_HOST_EXISTING_EYE_OR_PERSON_CONFLICT');
        next.parameters.extendedParameters.contactsIrisManual=validated;
        validateRecipe(next);
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,sessionOperation:previous.sessionOperation});
        check(signal);
        const saved=await api.request(`/v1/assets/${previous.asset.id}/recipe`,
          {method:'PUT',body:{expectedRevision:previous.revision,
            recipe:next},signal});check(signal);
        if(saved?.revision!==previous.revision+1||!same(saved.body,next))
          throw Error('CONTACTS_HOST_SAVE_OUTCOME_UNVERIFIED');
        const verified=await serverRead(previous,saved.revision,next,
          previous.identity,signal);
        if(!same(verified.dimensions,previous.dimensions))
          throw Error('CONTACTS_HOST_SAVE_OUTCOME_UNVERIFIED');
        editorState(session,getView,{asset:previous.asset,
          revision:previous.revision,personID:previous.personID,
          recipe:previous.recipe,sessionOperation:previous.sessionOperation});
        snapshot=null;
        return Object.freeze({readbackVerified:true,savedRevision:saved.revision,
          editorSynchronized:false,syntheticTestOnly:true,
          realRAWVerified:false,finalVerified:false});
      }catch(error){snapshot=null;throw error;}
    },options.signal);
  }
  function dispose(){disposed=true;snapshot=null;inflight?.abort();
    processing.dispose();}
  return Object.freeze({refresh,getContext,verifyFresh,submitDraft,dispose});
}
