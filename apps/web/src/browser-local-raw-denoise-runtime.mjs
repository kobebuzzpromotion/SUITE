import {BrowserLocalAPI} from './browser-local-api.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES,MAX_PIXELS} from './processing/pure.mjs';
import {validateWebRawDenoise,WEB_RAW_DENOISE_VERSION,WEB_RAW_DENOISE_MAX_WORK} from './processing/web-raw-denoise.mjs';

const SHA=/^[0-9a-f]{64}$/i;
const excluded=['handToneManual','clothingSpotManual','portrait','bwEdgeManual','addShadowManual','originalShadowManual',
  'blushManual','contactsIrisManual','eyelinerManual','eyeshadowManual','faceDecorationsManual'];

/** Anonymous local Original -> bundled RAW16 denoise -> full source or Proxy.
 * No history is required for this ordinary editable setting. Host guard pins
 * current API, Asset, Recipe and access; recheck must run after downstream work.
 * This is not Cloud Safe, a camera-model certification, or Save/CAS authority.
 */
export async function prepareBrowserLocalRawDenoise({api,recipe,expectedAsset,target,guard,signal}={}){
  if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||
      typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512||
      typeof guard!=='function'||!['proxy','source'].includes(target)||
      typeof expectedAsset?.id!=='string'||!expectedAsset.id||!SHA.test(expectedAsset.sha256??'')||
      !Number.isSafeInteger(expectedAsset.size)||expectedAsset.size<1||expectedAsset.size>MAX_INPUT_BYTES)
    throw Error('LOCAL_RAW_DENOISE_CONTRACT');
  const current=structuredClone(recipe);validateRecipe(current);
  const extra=current.parameters.extendedParameters,settings=extra.webRawDenoise;validateWebRawDenoise(settings);
  if(excluded.some(key=>Object.hasOwn(extra,key)))throw Error('LOCAL_RAW_DENOISE_MIXED_RUNTIME_UNSUPPORTED');
  const asset={id:expectedAsset.id,sha256:expectedAsset.sha256.toLowerCase(),size:expectedAsset.size},
    databaseName=api.databaseName,factory=api.factory,crypto=api.crypto;
  const check=()=>{checkAbort(signal);guard();if(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.databaseName!==databaseName||api.factory!==factory||api.crypto!==crypto)throw Error('LOCAL_RAW_DENOISE_SCOPE_CHANGED');};
  const read=async task=>{check();const result=await task();check();return result;};
  const call=(method,...args)=>read(()=>BrowserLocalAPI.prototype[method].call(api,...args));
  const digest=async bytes=>Array.from(new Uint8Array(await read(()=>globalThis.crypto.subtle.digest('SHA-256',bytes))),n=>n.toString(16).padStart(2,'0')).join('');
  const live=async()=>{const rows=await call('listAssets');if(!Array.isArray(rows))throw Error('LOCAL_RAW_DENOISE_ASSET_LIST');
    const matches=rows.filter(row=>row?.id===asset.id),row=matches[0];
    if(matches.length!==1||row.deletedAt!=null||row.storage!=='BROWSER_LOCAL_ONLY'||row.cloudSafe!==false||row.sha256?.toLowerCase()!==asset.sha256||row.size!==asset.size)throw Error('LOCAL_RAW_DENOISE_ASSET_CHANGED');};
  const original=async()=>{const bytes=await call('getOriginal',asset.id,{signal});if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||await digest(bytes)!==asset.sha256)throw Error('LOCAL_RAW_DENOISE_ORIGINAL_CHANGED');return bytes;};
  const recheck=async()=>{await live();await original();await live();check();};
  await live();const bytes=await original();
  const processing=createProcessing();
  try{
    const result=await read(()=>processing.renderWebRawDenoise(bytes.slice(0),settings,{signal}));
    assertPixels(result?.pixels);const source=sourceDimensions(result.pixels),proof=result.provenance,denoise=proof?.denoise,output=proof?.output;
    const expectedWork=settings.strength===0?0:result.pixels.width*result.pixels.height*(2*settings.radius+1)**2;
    // This decoder has its own proof vocabulary; do not invent the normal RAW
    // adapter's mode/sourceRepresentation fields or claim verified WASM identity.
    if(source.width!==result.pixels.width||source.height!==result.pixels.height||source.width*source.height>MAX_PIXELS||
        proof?.sourceSHA256?.toLowerCase()!==asset.sha256||proof.decoder!=='@colorhythm/libraw-wasm'||
        proof.engineVersion!==WEB_RAW_DENOISE_VERSION||proof.halfSize!==0||proof.thumbnailFallback!==false||
        proof.sourceUnchanged!==true||proof.autoBright!==false||proof.orientation!=='LibRaw-default-upright'||
        proof.whiteBalance!=='camera-requested-libraw-fallback-policy'||
        denoise?.method!=='joint-color-bilateral'||denoise.domain!=='post-demosaic-linear-srgb16'||
        denoise.strength!==settings.strength||denoise.radius!==settings.radius||denoise.sigma!==settings.sigma||
        denoise.skipped!==(settings.strength===0)||denoise.cfaDenoise!==false||denoise.adobeEquivalent!==false||
        denoise.neighborhoodWorkUpperBound!==expectedWork||denoise.maximumNeighborhoodWork!==WEB_RAW_DENOISE_MAX_WORK||expectedWork>WEB_RAW_DENOISE_MAX_WORK||
        output?.channels!=='RGBA'||output.bitsPerSample!==8||output.colorSpace!=='srgb'||output.transfer!=='encoded')
      throw Error('LOCAL_RAW_DENOISE_PROVENANCE_MISMATCH');
    let pixels=result.pixels;
    if(target==='proxy'){
      pixels=await read(()=>processing.makeProxy(result.pixels,1600));assertPixels(pixels);const dimensions=sourceDimensions(pixels),scale=Math.min(1,1600/Math.max(source.width,source.height));
      if(pixels.width!==Math.max(1,Math.round(source.width*scale))||pixels.height!==Math.max(1,Math.round(source.height*scale))||dimensions.width!==source.width||dimensions.height!==source.height)
        throw Error('LOCAL_RAW_DENOISE_PROXY_MISMATCH');
    }
    await recheck();
    const renderRecipe=structuredClone(current);delete renderRecipe.parameters.extendedParameters.webRawDenoise;
    return {pixels,recipe:renderRecipe,recheck};
  }finally{processing.dispose();}
}
