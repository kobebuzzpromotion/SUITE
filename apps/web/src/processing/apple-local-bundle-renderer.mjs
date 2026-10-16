import {loadAppleLocalBundle,inspectAppleLocalBundle} from '../apple-local-bundle-store.mjs';
import {renderAppleLocalRetouch} from './apple-local-retouch-renderer.mjs';
import {renderLocalBackdropBundle} from '../local-backdrop-render-adapter.mjs';
import {renderAppleLocalWarp} from './apple-local-warp-renderer.mjs';
import {renderAppleGlobalTail} from './apple-local-global-renderer.mjs';
import {localBackdropDisplayPixels} from '../local-backdrop-display.mjs';
/** Caller must hold the current photo permission gate. Local files are never
 * evidence of permission, Cloud Safe, or availability on another device. */
export async function renderSavedAppleBundle(source,reference,{authorized=false,signal}={}){
  if(authorized!==true)throw Error('APPLE_BUNDLE_AUTHORIZATION_REQUIRED');
  const {value,parameters,asset}=await loadAppleLocalBundle(reference,{signal});
  try{return await renderAppleBundleValue(source,value,{authorized,signal});}
  finally{value.backgroundBytes?.fill(0);value.maskBytes?.fill(0);value.bodyMaskBytes?.fill(0);}
}
export async function renderAppleBundleValue(source,value,{authorized=false,signal}={}){
  if(authorized!==true)throw Error('APPLE_BUNDLE_AUTHORIZATION_REQUIRED');
  const {parameters,asset,sourceWidth,sourceHeight}=await inspectAppleLocalBundle(value,{signal});
  if(source.width!==sourceWidth||source.height!==sourceHeight||!(source.data instanceof Uint8ClampedArray)||source.data.length!==sourceWidth*sourceHeight*4)throw Error('APPLE_BUNDLE_SOURCE_DIMENSIONS');
  const ext=parameters.extendedParameters;let linear,warped,global,base;
  try{
    if(ext.localBackdrop)linear=await renderLocalBackdropBundle({source:{...source,colorSpace:'srgb',alpha:'straight',rows:'top-left',orientation:1},
      bundle:{recipe:ext.localBackdrop,binding:{id:asset.id,sha256:asset.sha256},manifest:value.manifest,
        backgroundBytes:value.backgroundBytes,maskBytes:value.maskBytes,maskKind:'preview'},
      localRetouch:ext.localRetouch??null,authorize:async()=>authorized===true&&!signal?.aborted},{signal});
    else{
      if(sourceWidth*sourceHeight*96>256*1024*1024)throw Error('APPLE_BUNDLE_WORKING_CAPACITY');
      base={width:sourceWidth,height:sourceHeight,data:new Float32Array(source.data.length),assetID:asset.id,originalSHA256:asset.sha256,
        colorSpace:'linear-srgb',alpha:'premultiplied',rows:'top-left'};
      const linearize=byte=>{const n=byte/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
      for(let i=0;i<source.data.length;i+=4){
        const alpha=source.data[i+3]/255;for(let c=0;c<3;c++)base.data[i+c]=linearize(source.data[i+c])*alpha;base.data[i+3]=alpha;
        if(i%65536===0){await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
      }
      linear=ext.localRetouch?await renderAppleLocalRetouch(base,ext.localRetouch,{signal}):base;
    }
    if(ext.localWarp)warped=await renderAppleLocalWarp(linear,ext.localWarp,{signal,bodyMask:value.bodyMaskBytes});
    global=await renderAppleGlobalTail(warped??linear,parameters,{signal});
    return await localBackdropDisplayPixels(global,{signal});
  }finally{
    base?.data.fill(0);linear?.data.fill(0);warped?.data.fill(0);global?.data.fill(0);
  }
}
