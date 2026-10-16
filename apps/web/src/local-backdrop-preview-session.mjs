import {renderLocalBackdropBundle} from './local-backdrop-render-adapter.mjs';
import {localBackdropDisplayPixels} from './local-backdrop-display.mjs';
import {renderAppleLocalWarp} from './processing/apple-local-warp-renderer.mjs';
import {renderAppleGlobalTail} from './processing/apple-local-global-renderer.mjs';
import {renderAppleBundleValue} from './processing/apple-local-bundle-renderer.mjs';

/** Explicit non-saving preview lifecycle. sourceProvider returns
 * {source,currentBinding}; currentBinding is a data-only host token containing
 * photo identity/Recipe revision. authorize checks it against CURRENT host state,
 * rights and source provenance, not merely against the supplied bundle.
 * sourceProvider returns an owned pixel buffer which this session erases.
 * Context changes erase the last returned preview too; UI must observe its own
 * context subscription to remove any canvas copy. No persistence occurs here.
 */
export function createLocalBackdropPreviewSession({sourceProvider,authorize,subscribeContext}={}){
  if([sourceProvider,authorize,subscribeContext].some(fn=>typeof fn!=='function'))throw Error('LOCAL_BACKDROP_PREVIEW_HOST');
  let generation=0,closed=false,busy=false,aborter=null,last=null;
  const cancelled=()=>new DOMException('Cancelled or stale backdrop preview','AbortError');
  const invalidate=()=>{generation++;aborter?.abort();last?.data?.fill(0);last=null;};
  const unsubscribe=subscribeContext(invalidate);
  if(typeof unsubscribe!=='function')throw Error('LOCAL_BACKDROP_PREVIEW_SUBSCRIPTION');
  return Object.freeze({
    async preview(bundle,{signal,localWarp=null,localRetouch=null,appleParameters=null,bodyMask=null,workingByteLimit}={}){
      if(closed||busy)throw Error('LOCAL_BACKDROP_PREVIEW_UNAVAILABLE');
      if(bundle?.recipe!==null&&(!(bundle?.backgroundBytes instanceof Uint8Array)||bundle.backgroundBytes.length>32*1024*1024||
        !(bundle?.maskBytes instanceof Uint8Array)||bundle.maskBytes.length>8_000_000))throw Error('LOCAL_BACKDROP_PREVIEW_BUNDLE');
      // Own bundle bytes and metadata before waiting for the host source.
      if(bodyMask!==null&&(!(bodyMask instanceof Uint8Array)||bodyMask.length>8_000_000))throw Error('LOCAL_BACKDROP_BODY_MASK');
      const fixed=structuredClone(bundle),fixedWarp=localWarp===null?null:structuredClone(localWarp),fixedRetouch=localRetouch===null?null:structuredClone(localRetouch);
      const fixedBody=bodyMask?.slice()??null;
      const fixedParameters=appleParameters===null?null:structuredClone(appleParameters);
      invalidate();const epoch=generation,local=new AbortController();aborter=local;busy=true;
      const abort=()=>local.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)local.abort();
      let provided,linear,warped,globalFrame,display,currentBinding,success=false;
      const check=()=>{if(closed||local.signal.aborted||generation!==epoch)throw cancelled();};
      const permission=async(stage,details={})=>{
        check();
        if(await authorize({binding:structuredClone(fixed.binding),recipe:structuredClone(fixed.recipe),
          maskKind:fixed.maskKind??'preview',...details,nativeParameters:structuredClone(fixedParameters),localWarp:structuredClone(fixedWarp),localRetouch:structuredClone(fixedRetouch),stage,generation:epoch,currentBinding:structuredClone(currentBinding)},
          {signal:local.signal})!==true)throw Error('LOCAL_BACKDROP_PREVIEW_PERMISSION');
        check();
      };
      try{
        check();provided=await sourceProvider({generation:epoch,signal:local.signal});check();
        if(!provided?.currentBinding||!provided.source)throw Error('LOCAL_BACKDROP_PREVIEW_SOURCE');
        currentBinding=structuredClone(provided.currentBinding);
        await permission('beforePreview');
        if(fixed.recipe===null){
          display=await renderAppleBundleValue(provided.source,{schemaVersion:2,originalJSON:fixed.originalJSON,
            sourceWidth:provided.source.width,sourceHeight:provided.source.height,manifest:null,backgroundBytes:null,maskBytes:null,bodyMaskBytes:fixedBody},
            {authorized:true,signal:local.signal});
          await permission('releasePreview');last=display;success=true;
          return {...display,generation:epoch,currentBinding:structuredClone(currentBinding),sourceWidth:provided.source.width,sourceHeight:provided.source.height,nonSaved:true,saved:false};
        }
        linear=await renderLocalBackdropBundle({bundle:fixed,source:provided.source,localRetouch:fixedRetouch,workingByteLimit,
          authorize:details=>permission('render',details).then(()=>true)},{signal:local.signal});
        check();
        if(fixedWarp){
          await permission('beforeWarp');
          warped=await renderAppleLocalWarp(linear,fixedWarp,{signal:local.signal,workingByteLimit,mask:fixed.maskBytes,bodyMask:fixedBody});
          check();
        }
        if(fixedParameters)globalFrame=await renderAppleGlobalTail(warped??linear,fixedParameters,{signal:local.signal});
        display=await localBackdropDisplayPixels(globalFrame??warped??linear,{signal:local.signal});
        await permission('releasePreview');
        last=display;success=true;
        return {...display,generation:epoch,currentBinding:structuredClone(currentBinding),nonSaved:true,saved:false};
      }finally{
        provided?.source?.data?.fill(0);linear?.data?.fill(0);warped?.data?.fill(0);warped?.mask?.fill(0);
        globalFrame?.data?.fill(0);
        fixed?.backgroundBytes?.fill(0);fixed?.maskBytes?.fill(0);fixedBody?.fill(0);
        if(!success)display?.data?.fill(0);
        signal?.removeEventListener('abort',abort);if(aborter===local)aborter=null;busy=false;
      }
    },
    cancel:invalidate,
    dispose(){if(closed)return;closed=true;invalidate();unsubscribe();}
  });
}
