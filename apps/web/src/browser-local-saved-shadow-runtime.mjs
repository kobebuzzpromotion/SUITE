import {BrowserLocalAPI} from './browser-local-api.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {rasterizeSubjectStrokes} from './processing/subject-mask-authoring.mjs';
import {compositeSubjectPixels} from './processing/background-composite.mjs';
import {applyAddShadow} from './processing/add-shadow.mjs';
import {applyOriginalShadow} from './processing/original-shadow.mjs';

const KEYS=['bwEdgeManual','addShadowManual','originalShadowManual'];
const EXCLUDED=['portrait','blushManual','contactsIrisManual','eyeshadowManual','eyelinerManual','faceDecorationsManual','handToneManual','clothingSpotManual','webRawDenoise'];
const SHA=/^[0-9a-f]{64}$/i;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const canonical=v=>JSON.stringify(sort(v));
const plainFrame=p=>({width:p.width,height:p.height,data:new Uint8ClampedArray(p.data)});

/** Replay real saved local documents. Local consent is not a Trial permission.
 * Full source backdrop/shadow first. BW remains a downstream color/local-stage
 * operation via the explicitly local option, matching the existing saved order.
 * Add plus Original shadow remains undefined and is rejected.
 * No inferred matte, fitted background, fabricated authenticated provenance, or
 * original overwrite. Caller rechecks after downstream processing and save CAS.
 */
export async function prepareBrowserLocalSavedShadow({api,recipe,expectedAsset,target,guard,assertConsent,signal}={}) {
  if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||
      typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512||
      typeof guard!=='function'||typeof assertConsent!=='function'||!['proxy','source'].includes(target))throw Error('LOCAL_SHADOW_CONTRACT');
  const validAsset=a=>a&&typeof a.id==='string'&&SHA.test(a.sha256??'')&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_INPUT_BYTES;
  if(!validAsset(expectedAsset))throw Error('LOCAL_SHADOW_ASSET_INVALID');
  const asset=structuredClone(expectedAsset),current=structuredClone(recipe);validateRecipe(current);
  const extra=current.parameters.extendedParameters,keys=KEYS.filter(k=>Object.hasOwn(extra,k));
  if(!keys.length||EXCLUDED.some(k=>Object.hasOwn(extra,k)))throw Error('LOCAL_SHADOW_MIXED_RUNTIME_UNSUPPORTED');
  const bound=extra[keys[0]].binding;
  for(const key of keys){const b=extra[key].binding;
    if(b.assetID!==asset.id||b.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase()||b.sourceWidth!==bound.sourceWidth||b.sourceHeight!==bound.sourceHeight)throw Error('LOCAL_SHADOW_BINDING');}
  if(bound.sourceWidth*bound.sourceHeight>8_000_000)throw Error('LOCAL_SHADOW_SOURCE_CAPACITY');
  const add=extra.addShadowManual,retain=extra.originalShadowManual,backdropBinding=(add??retain)?.binding;
  if(add&&retain)throw Error('ORIGINAL_SHADOW_FINAL_ADD_SHADOW_UNDEFINED');
  const databaseName=api.databaseName,factory=api.factory,crypto=api.crypto;let backdrop=null,consentReady=false;
  const check=()=>{checkAbort(signal);guard();if(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.databaseName!==databaseName||api.factory!==factory||api.crypto!==crypto)throw Error('LOCAL_SHADOW_SCOPE_CHANGED');
    if(consentReady){const result=assertConsent({api,asset:structuredClone(asset),backdrop:backdrop?structuredClone(backdrop):null,recipe:structuredClone(current)});
      if(result===false||result&&typeof result.then==='function')throw Error('LOCAL_SHADOW_SYNCHRONOUS_CONSENT_REQUIRED');}};
  const read=async task=>{check();const value=await task();check();return value;};
  const call=(method,...args)=>read(()=>BrowserLocalAPI.prototype[method].call(api,...args));
  const hash=async bytes=>Array.from(new Uint8Array(await read(()=>globalThis.crypto.subtle.digest('SHA-256',bytes))),n=>n.toString(16).padStart(2,'0')).join('');
  const inventoryAsset=(rows,id,expected)=>{const matches=rows.filter(a=>a?.id===id),a=matches[0];
    if(matches.length!==1||!validAsset(a)||a.deletedAt!=null||a.storage!=='BROWSER_LOCAL_ONLY'||a.cloudSafe!==false||expected&&(a.size!==expected.size||a.sha256.toLowerCase()!==expected.sha256.toLowerCase()))throw Error('LOCAL_SHADOW_ASSET_CHANGED');return a;};
  const live=async()=>{const rows=await call('listAssets');if(!Array.isArray(rows))throw Error('LOCAL_SHADOW_ASSET_LIST');inventoryAsset(rows,asset.id,asset);
    if(backdrop)inventoryAsset(rows,backdrop.id,backdrop);return rows;};
  const rows=await live();
  if(backdropBinding){backdrop=structuredClone(inventoryAsset(rows,backdropBinding.backdropID));
    if(backdrop.id===asset.id||backdrop.sha256.toLowerCase()!==backdropBinding.backdropSHA256.toLowerCase())throw Error('LOCAL_SHADOW_BACKDROP_CHANGED');}
  consentReady=true;check();
  const history=await call('getRecipeHistory',asset.id,{signal});if(!Array.isArray(history))throw Error('LOCAL_SHADOW_HISTORY_INVALID');
  const matches=history.filter(r=>r?.branch!==true&&Number.isSafeInteger(r.revision)&&r.revision>0&&r.body?.parameters?.extendedParameters&&
    KEYS.every(k=>Object.hasOwn(extra,k)===Object.hasOwn(r.body.parameters.extendedParameters,k)&&(!Object.hasOwn(extra,k)||canonical(extra[k])===canonical(r.body.parameters.extendedParameters[k]))));
  matches.sort((a,b)=>b.revision-a.revision);const row=matches[0];if(!row)throw Error('LOCAL_SHADOW_DOCUMENT_NOT_SAVED');
  const saved=structuredClone(row.body);validateRecipe(saved);
  if(EXCLUDED.some(k=>Object.hasOwn(saved.parameters.extendedParameters,k)))throw Error('LOCAL_SHADOW_SAVED_MIXED_RUNTIME_UNSUPPORTED');
  const revision=row.revision,savedJSON=canonical(saved);
  const original=async a=>{const bytes=await call('getOriginal',a.id,{signal});if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==a.size||await hash(bytes)!==a.sha256.toLowerCase())throw Error('LOCAL_SHADOW_ORIGINAL_CHANGED');return bytes;};
  const recheck=async()=>{await live();const rows=await call('getRecipeHistory',asset.id,{signal});if(!Array.isArray(rows))throw Error('LOCAL_SHADOW_HISTORY_INVALID');
    const matches=rows.filter(r=>r?.revision===revision&&r.branch!==true);if(matches.length!==1||canonical(matches[0].body)!==savedJSON)throw Error('LOCAL_SHADOW_HISTORY_CHANGED');
    await original(asset);if(backdrop)await original(backdrop);await live();check();};
  const processing=createProcessing();
  try {
    const decode=async a=>{const bytes=await original(a),decoded=await read(()=>processing.decodeRaw(bytes.slice(0),{mode:'final',signal}));assertPixels(decoded?.pixels);
      const p=decoded.provenance,d=sourceDimensions(decoded.pixels);
      if(p?.sourceRepresentation!=='original-camera-raw'||p.decoderPackage!=='@colorhythm/libraw-wasm'||p.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||p.mode!=='final'||p.thumbnailFallback!==false||p.sourceSHA256?.toLowerCase()!==a.sha256.toLowerCase()||d.width!==bound.sourceWidth||d.height!==bound.sourceHeight||decoded.pixels.width!==bound.sourceWidth||decoded.pixels.height!==bound.sourceHeight)throw Error('LOCAL_SHADOW_DECODE_MISMATCH');
      return decoded;};
    const decoded=await decode(asset),source=plainFrame(decoded.pixels);let pixels=plainFrame(source);
    const mask=strokes=>{check();return rasterizeSubjectStrokes(source,strokes,{signal});};
    if(backdrop){const replacement=plainFrame((await decode(backdrop)).pixels),subject=mask((add??retain).subjectStrokes);
      pixels=compositeSubjectPixels(pixels,replacement,subject,{signal});
      if(add)pixels=applyAddShadow(pixels,subject,add.settings,{signal});
      if(retain)pixels=applyOriginalShadow(source,pixels,subject,mask(retain.shadowStrokes),{opacity:retain.settings.opacity,signal});}
    check();
    if(target==='proxy'){pixels=await read(()=>processing.makeProxy(pixels,1600));assertPixels(pixels);const d=sourceDimensions(pixels),scale=Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
      if(d.width!==bound.sourceWidth||d.height!==bound.sourceHeight||pixels.width!==Math.max(1,Math.round(bound.sourceWidth*scale))||pixels.height!==Math.max(1,Math.round(bound.sourceHeight*scale)))throw Error('LOCAL_SHADOW_PROXY_MISMATCH');}
    const proxy=target==='proxy'?await read(()=>processing.makeProxy(source,1600)):undefined;
    if(proxy){assertPixels(proxy);if(proxy.width!==pixels.width||proxy.height!==pixels.height||sourceDimensions(proxy).width!==bound.sourceWidth||sourceDimensions(proxy).height!==bound.sourceHeight)throw Error('LOCAL_SHADOW_PROXY_MISMATCH');}
    await recheck();const renderRecipe=structuredClone(current);for(const key of keys)if(key!=='bwEdgeManual')delete renderRecipe.parameters.extendedParameters[key];
    const options=extra.bwEdgeManual?{localSavedBW:{document:structuredClone(extra.bwEdgeManual),assetID:asset.id,originalSHA256:asset.sha256,sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,target}}:{};
    return {pixels:{...pixels,sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight},proxy,recipe:renderRecipe,options,recheck,
      provenance:{kind:'browser-local-saved-shadow',sourceSHA256:asset.sha256,savedRevision:revision,backdropSHA256:backdrop?.sha256??null,branches:[...keys]},metadata:decoded.metadata};
  } finally {processing.dispose();}
}
