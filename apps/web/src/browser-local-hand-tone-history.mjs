import {BrowserLocalAPI} from './browser-local-api.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const canonical=value=>JSON.stringify(sort(value));
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;}
function exact(value,keys){if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)return false;return keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor?.enumerable&&Object.hasOwn(descriptor,'value');});}

/** Read-only anonymous-local historical comparison. No Trial principal, Cloud
 * Safe claim, Save authority or synthetic HEAD. The host guard must pin its
 * current API object, Asset, Recipe, revision, Proxy and access across awaits.
 * Call recheck again after ordinary rendering and before displaying the result.
 */
export function prepareBrowserLocalHandToneHistory(options){return prepareLocalHistory(options,'handToneManual');}
/** Clothing is repaired on the verified <=8MP source before making its Proxy.
 * Worker rectangle rounding/size/overlap failures remain explicit failures. */
export function prepareBrowserLocalClothingSpotHistory(options){return prepareLocalHistory(options,'clothingSpotManual');}
// A separate entry point keeps existing comparison helpers Proxy-only. The
// selection remains a real historical version, never a synthetic draft row.
export function prepareBrowserLocalManualSourceHistory(options,branch){
  if(!['handToneManual','clothingSpotManual'].includes(branch))throw Error('LOCAL_MANUAL_HISTORY_BRANCH');
  return prepareLocalHistory(options,branch,'source');
}
async function prepareLocalHistory({api,selection,expectedAsset,guard,signal}={},branch,target='proxy'){
  const clothing=branch==='clothingSpotManual',failure=code=>Error(`${clothing?'LOCAL_CLOTHING':'LOCAL_HAND'}_HISTORY_${code}`);
  if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||
      typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512||
      typeof guard!=='function'||!exact(selection,['assetId','revision','bodySHA256'])||
      !UUID.test(selection.assetId)||!Number.isSafeInteger(selection.revision)||selection.revision<1||
      !SHA.test(selection.bodySHA256)||selection.assetId!==expectedAsset?.id||!SHA.test(expectedAsset?.sha256)||
      !Number.isSafeInteger(expectedAsset?.size)||expectedAsset.size<1||expectedAsset.size>MAX_INPUT_BYTES)
    throw failure('CONTRACT');
  selection={...selection};
  const asset={id:expectedAsset.id,sha256:expectedAsset.sha256.toLowerCase(),size:expectedAsset.size},
    databaseName=api.databaseName,factory=api.factory,crypto=api.crypto;
  const check=()=>{checkAbort(signal);guard();if(api.databaseName!==databaseName||api.factory!==factory||api.crypto!==crypto||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype)throw failure('SCOPE_CHANGED');};
  const read=async task=>{check();const result=await task();check();return result;};
  const hash=async bytes=>Array.from(new Uint8Array(await read(()=>globalThis.crypto.subtle.digest('SHA-256',bytes))),value=>value.toString(16).padStart(2,'0')).join('');
  const call=(method,...args)=>read(()=>BrowserLocalAPI.prototype[method].call(api,...args));
  const liveAsset=async()=>{
    const rows=await call('listAssets');if(!Array.isArray(rows))throw failure('ASSETS_INVALID');
    const matches=rows.filter(row=>row?.id===asset.id),row=matches[0];
    if(matches.length!==1||row.deletedAt!=null||row.storage!=='BROWSER_LOCAL_ONLY'||row.cloudSafe!==false||
        row.sha256?.toLowerCase()!==asset.sha256||row.size!==asset.size)throw failure('ASSET_CHANGED');
  };
  const historical=async()=>{
    const rows=await call('getRecipeHistory',asset.id,{signal});if(!Array.isArray(rows))throw failure('INVALID');
    const matches=rows.filter(row=>row?.revision===selection.revision&&row.branch!==true);
    if(matches.length!==1)throw failure('VERSION_MISSING');
    const recipe=structuredClone(matches[0].body);validateRecipe(recipe);
    if(await hash(new TextEncoder().encode(canonical(recipe)))!==selection.bodySHA256.toLowerCase())throw failure('BODY_CHANGED');
    return recipe;
  };
  const original=async()=>{const bytes=await call('getOriginal',asset.id,{signal});
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||await hash(bytes)!==asset.sha256)throw failure('ORIGINAL_CHANGED');return bytes;};
  await liveAsset();const recipe=await historical(),extra=recipe.parameters.extendedParameters;
  const mixed=['portrait','blushManual','handToneManual','clothingSpotManual','contactsIrisManual','eyelinerManual','eyeshadowManual','faceDecorationsManual','bwEdgeManual','addShadowManual','originalShadowManual'];
  if(mixed.some(key=>key!==branch&&Object.hasOwn(extra,key)))throw failure('MIXED_RUNTIME_UNSUPPORTED');
  const document=extra[branch],binding=document?.binding;
  if(!binding||binding.assetID!==asset.id||binding.originalSHA256?.toLowerCase()!==asset.sha256||
      !Number.isSafeInteger(binding.sourceWidth)||!Number.isSafeInteger(binding.sourceHeight)||
      binding.sourceWidth<1||binding.sourceHeight<1||binding.sourceWidth*binding.sourceHeight>8_000_000)
    throw failure('BINDING');
  const bytes=await original(),recipeJSON=canonical(recipe);
  const recheck=async()=>{await liveAsset();if(canonical(await historical())!==recipeJSON)throw failure('BODY_CHANGED');await original();await liveAsset();check();};
  // Decoder and manual renderer are bundled Worker implementations, not injected
  // caller evidence. Source must be a full original camera RAW, never thumbnail.
  const processing=createProcessing();
  try{
    const decoded=await read(()=>processing.decodeRaw(bytes.slice(0),{mode:'final',signal}));
    assertPixels(decoded?.pixels);const proof=decoded.provenance,source=sourceDimensions(decoded.pixels);
    if(proof?.sourceRepresentation!=='original-camera-raw'||proof.decoderPackage!=='@colorhythm/libraw-wasm'||
        proof.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||proof.mode!=='final'||proof.thumbnailFallback!==false||
        proof.sourceSHA256?.toLowerCase()!==asset.sha256||source.width!==binding.sourceWidth||source.height!==binding.sourceHeight||
        decoded.pixels.width!==binding.sourceWidth||decoded.pixels.height!==binding.sourceHeight||decoded.pixels.width*decoded.pixels.height>8_000_000)
      throw failure('DECODE_MISMATCH');
    // Preserve the binding's exact SHA spelling for Clothing's strict Worker
    // comparison, after the independent case-insensitive digest verification.
    const runtime={assetID:asset.id,originalSHA256:clothing?binding.originalSHA256:asset.sha256,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,savedRevision:selection.revision};
    if(target==='source'){
      const input={width:decoded.pixels.width,height:decoded.pixels.height,data:new Uint8ClampedArray(decoded.pixels.data)};
      const method=clothing?'renderManualClothingSpot':'renderManualHandTone';
      const pixels=await read(()=>processing[method](input,{revision:selection.revision,body:recipe},runtime,{target:'source',signal}));assertPixels(pixels);
      if(pixels.width!==binding.sourceWidth||pixels.height!==binding.sourceHeight)throw failure('RENDER_DIMENSIONS');
      await recheck();const renderRecipe=structuredClone(recipe);delete renderRecipe.parameters.extendedParameters[branch];
      return {kind:'browser-local-historical-manual-source-only',pixels:{...pixels,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight},recipe:renderRecipe,runtime:{...runtime},recheck};
    }
    let proxySourcePixels=decoded.pixels;
    if(clothing){
      const input={width:decoded.pixels.width,height:decoded.pixels.height,data:new Uint8ClampedArray(decoded.pixels.data)};
      proxySourcePixels=await read(()=>processing.renderManualClothingSpot(input,{revision:selection.revision,body:recipe},runtime,{target:'source',signal}));
      assertPixels(proxySourcePixels);
      if(proxySourcePixels.width!==binding.sourceWidth||proxySourcePixels.height!==binding.sourceHeight)throw failure('RENDER_DIMENSIONS');
    }
    const proxy=await read(()=>processing.makeProxy(proxySourcePixels,1600));assertPixels(proxy);
    const scale=Math.min(1,1600/Math.max(binding.sourceWidth,binding.sourceHeight)),proxySource=sourceDimensions(proxy);
    if(proxy.width!==Math.max(1,Math.round(binding.sourceWidth*scale))||proxy.height!==Math.max(1,Math.round(binding.sourceHeight*scale))||
        proxySource.width!==binding.sourceWidth||proxySource.height!==binding.sourceHeight||proxy.width*proxy.height>8_000_000)
      throw failure('PROXY_MISMATCH');
    let pixels=proxy;
    if(!clothing){const input={width:proxy.width,height:proxy.height,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,data:new Uint8ClampedArray(proxy.data)};
      pixels=await read(()=>processing.renderManualHandTone(input,{revision:selection.revision,body:recipe},runtime,{target:'proxy',signal}));assertPixels(pixels);}
    if(pixels.width!==proxy.width||pixels.height!==proxy.height)throw failure('RENDER_DIMENSIONS');
    await recheck();
    const renderRecipe=structuredClone(recipe);delete renderRecipe.parameters.extendedParameters[branch];
    return {kind:clothing?'browser-local-historical-clothing-spot-comparison-only':'browser-local-historical-hand-tone-comparison-only',pixels:{...pixels,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight},recipe:renderRecipe,runtime:{...runtime},recheck};
  }finally{processing.dispose();}
}
