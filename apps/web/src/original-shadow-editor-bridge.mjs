import {currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {EditorSession,checksum} from './session.mjs';
import {TrialClient} from './trial-client.mjs';
import {mountOriginalShadowManualUI} from './original-shadow-manual-ui.mjs';
import {createTrialOriginalShadowManualHost} from './original-shadow-manual-trial-host.mjs';
import {assertPixels,sourceDimensions,MAX_INPUT_BYTES} from './processing/pure.mjs';

// This bridge is a Trial-only product integration seam, not a source of
// permission. The imported host obtains fresh session/Asset/Original/Recipe
// evidence and performs CAS; a view selector or this UI never authenticates.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const plain=value=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
  keys.every(key=>{const item=Object.getOwnPropertyDescriptor(value,key);
    return item?.enumerable===true&&Object.hasOwn(item,'value');});
const copy=value=>structuredClone(value);
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const abort=signal=>{if(signal?.aborted)
  throw new DOMException('Original Shadow Editor operation cancelled','AbortError');};
function verifiedFrame(decoded,sha,processing){
  assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  const real=proof?.sourceRepresentation==='original-camera-raw'&&
    proof?.thumbnailFallback===false;
  const synthetic=processing?.syntheticTestOnly===true&&
    proof?.sourceRepresentation==='synthetic-nonraw-test';
  if(!SHA.test(proof?.sourceSHA256)||
      proof.sourceSHA256.toLowerCase()!==sha.toLowerCase()||
      proof.mode!=='proxy'||(!real&&!synthetic))
    throw Error('ORIGINAL_SHADOW_EDITOR_DECODE_PROVENANCE_REQUIRED');
  return sourceDimensions(decoded.pixels);
}

/** Creates only a genuinely backed Trial host. Editor UI may call mount() once
 * its own After image exists; this file never auto-mounts a product control. */
export function createOriginalShadowEditorBridge(options){
  if(!exact(options,['session','targetAssetID','backdropAssetID','getSelection'])||
      !(options.session instanceof EditorSession)||
      !(options.session.api instanceof TrialClient)||
      !UUID.test(options.targetAssetID)||!UUID.test(options.backdropAssetID)||
      options.targetAssetID===options.backdropAssetID||
      typeof options.getSelection!=='function')
    throw Error('ORIGINAL_SHADOW_EDITOR_BRIDGE_INIT_INVALID');
  const {session,targetAssetID,backdropAssetID,getSelection}=options;
  const api=session.api;
  let disposed=false,ui=null,afterImage=null,verifiedRevision=null,
    verifiedBody=null,applying=false;
  function selection(){
    const result=getSelection();
    if(!exact(result,['targetAssetID','backdropAssetID','view'])||
        result.targetAssetID!==targetAssetID||
        result.backdropAssetID!==backdropAssetID||
        !['before','after','split'].includes(result.view))
      throw Error('ORIGINAL_SHADOW_EDITOR_SELECTION_CHANGED');
    return result;
  }
  function localScope(){
    if(disposed)throw Error('ORIGINAL_SHADOW_EDITOR_BRIDGE_DISPOSED');
    const chosen=selection(),state=session.state;
    if(state.asset?.id!==targetAssetID||!SHA.test(state.asset.sha256)||
        chosen.view!=='after'||state.dirty||state.busy||state.exporting||
        state.error||!state.afterURL||!state.beforeURL||!session.proxy||
        !Number.isSafeInteger(state.revision)||state.revision<1||
        state.recipe?.parameters?.extendedParameters?.addShadowManual||
        state.shadowVerification==='unverified'||
        afterImage&&(afterImage.hidden||!afterImage.complete||
          !afterImage.naturalWidth||!afterImage.naturalHeight||
          afterImage.getAttribute('src')!==state.afterURL))
      throw Error('ORIGINAL_SHADOW_EDITOR_SCOPE_NOT_READY');
    const manual=state.recipe.parameters.extendedParameters.originalShadowManual;
    if(manual&&(manual.binding.assetID!==targetAssetID||
        manual.binding.originalSHA256.toLowerCase()!==state.asset.sha256.toLowerCase()||
        manual.binding.backdropID!==backdropAssetID))
      throw Error('ORIGINAL_SHADOW_EDITOR_MANUAL_BINDING_MISMATCH');
    return state;
  }
  function hostEditorState(){
    try{localScope();return {selectedAssetID:targetAssetID,
      selectedBackdropID:backdropAssetID,view:'after',ready:true,dirty:false,
      busy:false,permissionExpired:false};}
    catch{return {selectedAssetID:null,selectedBackdropID:null,
      view:'before',ready:false,dirty:true,busy:true,permissionExpired:true};}
  }
  async function decodedDimensions(targetBytes,target,{signal}={}){
    abort(signal);
    const state=localScope();
    if(target.id!==targetAssetID||target.sha256!==state.asset.sha256||
        target.tenantId!==state.asset.tenantId||
        await checksum(targetBytes)!==target.sha256.toLowerCase())
      throw Error('ORIGINAL_SHADOW_EDITOR_TARGET_CHANGED');
    const targetDecoded=await session.processing.decodeRaw(targetBytes.slice(0),
      {mode:'proxy',signal});
    const targetFrame=verifiedFrame(targetDecoded,target.sha256,session.processing);
    const listed=await api.listAssets();abort(signal);
    const matches=listed.filter(asset=>asset?.id===backdropAssetID);
    const backdrop=matches[0];
    if(matches.length!==1||backdrop.tenantId!==target.tenantId||
        backdrop.deletedAt!==null||backdrop.cloudSafe!==true||
        !SHA.test(backdrop.sha256)||!Number.isSafeInteger(backdrop.size)||
        backdrop.size<1||backdrop.size>MAX_INPUT_BYTES)
      throw Error('ORIGINAL_SHADOW_EDITOR_BACKDROP_CHANGED');
    const bytes=await api.getOriginal(backdropAssetID,{signal});abort(signal);
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==backdrop.size||
        await checksum(bytes)!==backdrop.sha256.toLowerCase())
      throw Error('ORIGINAL_SHADOW_EDITOR_BACKDROP_CHANGED');
    const decoded=await session.processing.decodeRaw(bytes.slice(0),
      {mode:'proxy',signal});
    const backdropFrame=verifiedFrame(decoded,backdrop.sha256,session.processing);
    if(backdropFrame.width!==targetFrame.width||
        backdropFrame.height!==targetFrame.height)
      throw Error('ORIGINAL_SHADOW_EDITOR_BACKDROP_DIMENSIONS_UNSUPPORTED');
    const source=sourceDimensions(session.proxy);
    if(source.width!==targetFrame.width||source.height!==targetFrame.height)
      throw Error('ORIGINAL_SHADOW_EDITOR_PREVIEW_SOURCE_CHANGED');
    abort(signal);localScope();
    return targetFrame;
  }
  const host=createTrialOriginalShadowManualHost({api,targetAssetID,
    backdropAssetID,getSourceDimensions:decodedDimensions,
    getEditorState:hostEditorState});
  function getContext(){
    const context=host.getContext();
    let ready=false,state=null;
    try{state=localScope();ready=context.ready===true&&
      context.target?.savedRevision===verifiedRevision&&
      state.revision===verifiedRevision&&same(state.recipe,verifiedBody);}
    catch{}
    return {...context,ready,permissionExpired:!ready,
      view:ready?'after':'before',
      rotationDegrees:state?.recipe?.parameters?.rotationDegrees??0,
      crop:state?.recipe?.parameters?.extendedParameters?.crop??null,
      canvasExpand:state?.recipe?.parameters?.extendedParameters?.canvasExpand??null,
      sceneGeometry:state?.recipe?.parameters?.extendedParameters?.sceneGeometry,
      sourceWidth:context.target?.sourceWidth,
      sourceHeight:context.target?.sourceHeight,...(ready?currentBrushDisplayGeometry(session):{})};
  }
  async function refresh({signal}={}){
    if(disposed)throw Error('ORIGINAL_SHADOW_EDITOR_BRIDGE_DISPOSED');
    verifiedRevision=null;verifiedBody=null;
    ui?.setEnabled(false);
    try{
      localScope();
      const context=await host.refresh({signal});abort(signal);
      const stored=await api.request(`/v1/assets/${targetAssetID}/recipe`,{signal});
      const state=localScope();
      if(stored?.recipe?.revision!==context.target.savedRevision||
          state.revision!==context.target.savedRevision||
          !same(stored.recipe.body,state.recipe))
        throw Error('ORIGINAL_SHADOW_EDITOR_RECIPE_CHANGED');
      verifiedRevision=state.revision;verifiedBody=copy(state.recipe);
      const result=getContext();
      if(!result.ready)throw Error('ORIGINAL_SHADOW_EDITOR_SCOPE_CHANGED');
      if(ui){ui.reset(state.recipe.parameters.extendedParameters.originalShadowManual);
        ui.setEnabled(true);}
      return result;
    }catch(error){verifiedRevision=null;verifiedBody=null;
      ui?.setEnabled(false);throw error;}
  }
  async function onApply(document,options){
    if(disposed)throw Error('ORIGINAL_SHADOW_EDITOR_BRIDGE_DISPOSED');
    if(applying)throw Error('ORIGINAL_SHADOW_EDITOR_BRIDGE_BUSY');
    const context=getContext();
    if(!context.ready)throw Error('ORIGINAL_SHADOW_EDITOR_REFRESH_REQUIRED');
    applying=true;
    try{
      abort(options?.signal);
      const response=await host.onApply(document,options);
      abort(options?.signal);
      if(response?.accepted!==true)
        throw Error('ORIGINAL_SHADOW_EDITOR_SAVE_OUTCOME_UNVERIFIED');
      const selected=selection();
      if(selected.view!=='after'||session.state.asset?.id!==targetAssetID)
        throw Error('ORIGINAL_SHADOW_EDITOR_SELECTION_CHANGED');
      // Host CAS/readback success is not a product Preview. Reload the actual
      // Session before acknowledging UI apply, so both Originals are gated
      // again by the normal Preview pipeline.
      await session.reload();abort(options?.signal);
      const current=session.state;
      if(current.asset?.id!==targetAssetID||
          current.revision!==context.target.savedRevision+1||
          current.shadowVerification!=='verified'||current.dirty||
          !same(current.recipe.parameters.extendedParameters.originalShadowManual,
            document))
        throw Error('ORIGINAL_SHADOW_EDITOR_SAVE_OUTCOME_UNVERIFIED');
      verifiedRevision=current.revision;verifiedBody=copy(current.recipe);
      if(!getContext().ready)
        throw Error('ORIGINAL_SHADOW_EDITOR_SAVE_OUTCOME_UNVERIFIED');
      // Do not reset the UI synchronously here: its active onApply AbortSignal
      // belongs to that UI and reset() would abort a CAS that just succeeded.
      // A subsequent explicit refresh() resets the revision-locked brush.
      return {accepted:true};
    }catch(error){verifiedRevision=null;verifiedBody=null;
      ui?.setEnabled(false);throw error;}
    finally{applying=false;}
  }
  function mount({root,afterImage:image}={}){
    if(disposed||ui||!root||!image)
      throw Error('ORIGINAL_SHADOW_EDITOR_MOUNT_INVALID');
    afterImage=image;
    try{
      const initial=getContext().ready?
        session.state.recipe.parameters.extendedParameters.originalShadowManual:undefined;
      ui=mountOriginalShadowManualUI({root,afterImage:image,getContext,
        onApply,initial,enabled:getContext().ready});
      return ui;
    }catch(error){afterImage=null;throw error;}
  }
  function sync(){const context=getContext();if(!applying)ui?.setEnabled(context.ready);
    return context;}
  function dispose(){disposed=true;verifiedRevision=null;verifiedBody=null;
    ui?.dispose();ui=null;afterImage=null;host.dispose();}
  return Object.freeze({getContext,refresh,onApply,mount,sync,dispose});
}
