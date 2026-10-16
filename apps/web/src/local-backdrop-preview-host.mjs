import {PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';
import {assertPixels} from './processing/pure.mjs';
import {validateAppleLocalEdit,readAppleLocalEditJSON} from './apple-local-edit-import.mjs';
import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';

/** Supplies only a copy of the current unedited proxy. The consumer must label
 * this as a backdrop-only preview, never as full Apple edit restoration. */
export function createLocalBackdropPreviewHost({session,canUse,subscribeAccess}={}){
  if(typeof session?.subscribe!=='function'||typeof canUse!=='function'||typeof subscribeAccess!=='function')
    throw Error('LOCAL_BACKDROP_HOST_REQUIRED');
  let state=session.state,epoch=0,closed=false,issued=null;
  const listeners=new Set();
  const invalidate=()=>{epoch++;issued=null;for(const listener of [...listeners])listener();};
  const stopState=session.subscribe(next=>{state=next;invalidate();});
  const stopAccess=subscribeAccess(invalidate);
  if(typeof stopState!=='function'||typeof stopAccess!=='function')throw Error('LOCAL_BACKDROP_HOST_SUBSCRIPTION');
  const allowed=()=>!closed&&state?.personProcessingStatus===PERSON_PRIVACY_APPROVED&&
    !state.busy&&!state.exporting&&!state.blocked&&!state.dirty&&canUse(state)===true;
  const current=(record)=>allowed()&&issued===record&&epoch===record.epoch&&session.proxy===record.frame&&
    state.asset?.id===record.assetID&&state.asset?.sha256===record.originalSHA256&&state.revision===record.revision&&
    JSON.stringify(state.recipe)===record.recipeKey;
  return Object.freeze({
    async sourceProvider({signal}={}){
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      if(!allowed())throw Error('LOCAL_BACKDROP_HOST_PERMISSION');
      const frame=session.proxy;assertPixels(frame);
      if(frame.width*frame.height>8_000_000)throw Error('LOCAL_BACKDROP_HOST_CAPACITY');
      const assetID=state.asset?.id,originalSHA256=state.asset?.sha256,revision=state.revision;
      if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(assetID??'')||
        !/^[0-9a-f]{64}$/i.test(originalSHA256??'')||!Number.isSafeInteger(revision)||revision<0)
        throw Error('LOCAL_BACKDROP_HOST_BINDING');
      const token=crypto.randomUUID();
      const record={token,epoch,frame,assetID,originalSHA256,revision,recipeKey:JSON.stringify(state.recipe)};
      issued=record;
      const data=new Uint8ClampedArray(frame.data);
      if(signal?.aborted||!current(record)){data.fill(0);throw new DOMException('Stale photo','AbortError');}
      return {source:{width:frame.width,height:frame.height,data,colorSpace:'srgb',alpha:'straight',rows:'top-left',orientation:1},
        currentBinding:{token,epoch,assetID,originalSHA256,revision}};
    },
    async authorize(details,{signal}={}){
      const record=issued,binding=details?.currentBinding;
      if(signal?.aborted||!record||!binding||!current(record))return false;
      if(['token','epoch','assetID','originalSHA256','revision'].some(key=>binding[key]!==record[key]))return false;
      if(details.purpose==='mac-parity-fixture'){
        try{
          const loaded=readAppleLocalEditJSON(details.originalJSON,{preflight:preflightCrossDeviceCapabilities}),asset=loaded.document.asset;
          return asset?.id?.toLowerCase()===record.assetID.toLowerCase()&&asset?.sha256?.toLowerCase()===record.originalSHA256.toLowerCase();
        }catch{return false;}
      }
      const imported=details.binding,recipe=details.recipe;
      if(!recipe&&details.nativeParameters){
        if(!imported||imported.id?.toLowerCase()!==record.assetID.toLowerCase()||imported.sha256?.toLowerCase()!==record.originalSHA256.toLowerCase())return false;
        const extra=details.nativeParameters.extendedParameters;
        if(!extra||extra.localBackdrop||!extra.localWarp&&!extra.localRetouch)return false;
        try{for(const key of ['localWarp','localRetouch'])if(extra[key])validateAppleLocalEdit(key,extra[key],{id:record.assetID,sha256:record.originalSHA256});}
        catch{return false;}
        return true;
      }
      if(!imported||!recipe||typeof imported.id!=='string'||typeof imported.sha256!=='string'||
        imported.id.toLowerCase()!==record.assetID.toLowerCase()||
        imported.sha256.toLowerCase()!==record.originalSHA256.toLowerCase()||
        recipe.assetID?.toLowerCase()!==record.assetID.toLowerCase()||
        recipe.originalSHA256?.toLowerCase()!==record.originalSHA256.toLowerCase()||
        recipe.maskWidth!==record.frame.width||recipe.maskHeight!==record.frame.height)return false;
      if(details.localWarp!=null){
        try { validateAppleLocalEdit('localWarp',details.localWarp,{id:record.assetID,sha256:record.originalSHA256}); }
        catch { return false; }
      }
      if(details.localRetouch!=null){
        try { validateAppleLocalEdit('localRetouch',details.localRetouch,{id:record.assetID,sha256:record.originalSHA256}); }
        catch { return false; }
      }
      return true;
    },
    subscribeContext(listener){
      if(closed||typeof listener!=='function')throw Error('LOCAL_BACKDROP_HOST_CLOSED');
      listeners.add(listener);return()=>listeners.delete(listener);
    },
    dispose(){if(closed)return;closed=true;invalidate();stopState();stopAccess();listeners.clear();}
  });
}
