import {BrowserLocalAPI} from './browser-local-api.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from '../../../dist/apps/backend/src/portrait-recipe.js';

const ORDER=[['blushManual','renderManualBlush'],['contactsIrisManual','renderManualContacts'],['eyeshadowManual','renderManualEyeshadow'],['eyelinerManual','renderManualEyeliner'],['faceDecorationsManual','renderManualFreckles']];
const EXCLUDED=['handToneManual','clothingSpotManual','bwEdgeManual','addShadowManual','originalShadowManual','webRawDenoise'];
const SHA=/^[0-9a-f]{64}$/i;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const canonical=v=>JSON.stringify(sort(v));

/** New anonymous-local consent boundary, not the Trial authoring gate. Only
 * exact already-saved documents are replayed. No inference or new makeup authoring.
 * Composition order: Blush -> Contacts -> Eyeshadow -> Eyeliner -> Freckles on full source.
 * The host must recheck after downstream render and independently enforce CAS.
 */
export async function prepareBrowserLocalSavedMakeup({api,recipe,expectedAsset,target,guard,assertConsent,signal}={}){
  if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||
      typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512||
      typeof guard!=='function'||typeof assertConsent!=='function'||!['proxy','source'].includes(target)||
      typeof expectedAsset?.id!=='string'||!expectedAsset.id||!SHA.test(expectedAsset.sha256??'')||
      !Number.isSafeInteger(expectedAsset.size)||expectedAsset.size<1||expectedAsset.size>MAX_INPUT_BYTES)
    throw Error('LOCAL_MAKEUP_CONTRACT');
  const asset=structuredClone(expectedAsset),current=structuredClone(recipe);validateRecipe(current);
  const extra=current.parameters.extendedParameters,branches=ORDER.filter(([key])=>Object.hasOwn(extra,key));
  if(!branches.length||EXCLUDED.some(key=>Object.hasOwn(extra,key)))throw Error('LOCAL_MAKEUP_MIXED_RUNTIME_UNSUPPORTED');
  function portrait(body){const p=body.parameters.extendedParameters.portrait;
    if(!p||p.targets.some(t=>t.value!==0))throw Error('LOCAL_MAKEUP_NEUTRAL_PORTRAIT_REQUIRED');
    validatePortraitBinding(p,asset.id,asset.sha256);return p;}
  const identity=portrait(current),bound=extra[branches[0][0]].binding;
  const personIDs=[...new Set(branches.map(([key])=>extra[key].binding.personID))].sort();
  for(const [key] of branches){const binding=extra[key].binding;
    if(binding.assetID!==asset.id||binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase()||
        !identity.targets.some(t=>t.id===binding.personID)||binding.sourceWidth!==bound.sourceWidth||binding.sourceHeight!==bound.sourceHeight)
      throw Error('LOCAL_MAKEUP_BINDING');}
  if(!Number.isSafeInteger(bound.sourceWidth)||!Number.isSafeInteger(bound.sourceHeight)||bound.sourceWidth<1||bound.sourceHeight<1||bound.sourceWidth*bound.sourceHeight>8_000_000)throw Error('LOCAL_MAKEUP_SOURCE_CAPACITY');
  const databaseName=api.databaseName,factory=api.factory,crypto=api.crypto;
  const check=()=>{checkAbort(signal);guard();if(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.databaseName!==databaseName||api.factory!==factory||api.crypto!==crypto)throw Error('LOCAL_MAKEUP_SCOPE_CHANGED');
    const consent=assertConsent({api,asset:structuredClone(asset),personIDs:[...personIDs]});
    if(consent===false||consent&&typeof consent.then==='function')throw Error('LOCAL_MAKEUP_SYNCHRONOUS_CONSENT_REQUIRED');};
  const read=async task=>{check();const value=await task();check();return value;};
  const call=(method,...args)=>read(()=>BrowserLocalAPI.prototype[method].call(api,...args));
  const hash=async bytes=>Array.from(new Uint8Array(await read(()=>globalThis.crypto.subtle.digest('SHA-256',bytes))),n=>n.toString(16).padStart(2,'0')).join('');
  const live=async()=>{const rows=await call('listAssets');if(!Array.isArray(rows))throw Error('LOCAL_MAKEUP_ASSET_LIST');const matches=rows.filter(r=>r?.id===asset.id),a=matches[0];
    if(matches.length!==1||a.deletedAt!=null||a.storage!=='BROWSER_LOCAL_ONLY'||a.cloudSafe!==false||a.size!==asset.size||a.sha256?.toLowerCase()!==asset.sha256.toLowerCase())throw Error('LOCAL_MAKEUP_ASSET_CHANGED');};
  const original=async()=>{const bytes=await call('getOriginal',asset.id,{signal});if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size||await hash(bytes)!==asset.sha256.toLowerCase())throw Error('LOCAL_MAKEUP_ORIGINAL_CHANGED');return bytes;};
  await live();const rows=await call('getRecipeHistory',asset.id,{signal});if(!Array.isArray(rows))throw Error('LOCAL_MAKEUP_HISTORY_INVALID');
  const plans=[];
  for(const [key,method] of branches){const documentJSON=canonical(extra[key]);const matches=rows.filter(row=>row?.branch!==true&&Number.isSafeInteger(row.revision)&&row.revision>0&&
      row.body?.parameters?.extendedParameters&&Object.hasOwn(row.body.parameters.extendedParameters,key)&&canonical(row.body.parameters.extendedParameters[key])===documentJSON);
    matches.sort((a,b)=>b.revision-a.revision);const selected=matches[0];if(!selected)throw Error('LOCAL_MAKEUP_DOCUMENT_NOT_SAVED');
    const body=structuredClone(selected.body);validateRecipe(body);const savedIdentity=portrait(body);
    if(EXCLUDED.some(k=>Object.hasOwn(body.parameters.extendedParameters,k)))throw Error('LOCAL_MAKEUP_SAVED_MIXED_RUNTIME_UNSUPPORTED');
    validatePortraitContinuity(savedIdentity,identity);validatePortraitContinuity(identity,savedIdentity);
    plans.push({key,method,revision:selected.revision,body,bodySHA:await hash(new TextEncoder().encode(canonical(body)))});
  }
  const recheck=async()=>{await live();const fresh=await call('getRecipeHistory',asset.id,{signal});if(!Array.isArray(fresh))throw Error('LOCAL_MAKEUP_HISTORY_INVALID');
    for(const plan of plans){const matches=fresh.filter(row=>row?.revision===plan.revision&&row.branch!==true);if(matches.length!==1)throw Error('LOCAL_MAKEUP_HISTORY_MISSING');validateRecipe(matches[0].body);
      if(await hash(new TextEncoder().encode(canonical(matches[0].body)))!==plan.bodySHA)throw Error('LOCAL_MAKEUP_HISTORY_CHANGED');}
    await original();await live();check();};
  const bytes=await original(),processing=createProcessing();
  try{
    const decoded=await read(()=>processing.decodeRaw(bytes.slice(0),{mode:'final',signal}));assertPixels(decoded?.pixels);const proof=decoded.provenance,source=sourceDimensions(decoded.pixels);
    if(proof?.sourceRepresentation!=='original-camera-raw'||proof.decoderPackage!=='@colorhythm/libraw-wasm'||proof.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||
        proof.mode!=='final'||proof.thumbnailFallback!==false||proof.sourceSHA256?.toLowerCase()!==asset.sha256.toLowerCase()||
        source.width!==bound.sourceWidth||source.height!==bound.sourceHeight||decoded.pixels.width!==bound.sourceWidth||decoded.pixels.height!==bound.sourceHeight||decoded.pixels.width*decoded.pixels.height>8_000_000)
      throw Error('LOCAL_MAKEUP_DECODE_MISMATCH');
    let pixels={width:decoded.pixels.width,height:decoded.pixels.height,data:new Uint8ClampedArray(decoded.pixels.data)};
    for(const plan of plans){const document=plan.body.parameters.extendedParameters[plan.key],binding=document.binding;
      const runtime={assetID:binding.assetID,originalSHA256:binding.originalSHA256,personID:binding.personID,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight,savedRevision:plan.revision};
      if(plan.key==='blushManual'){runtime.draftBaseRevision=plan.revision;runtime.ownerConfirmed=true;}
      if(plan.key==='contactsIrisManual')runtime.eye=binding.eye;
      if(plan.key==='eyeshadowManual')runtime.eye=document.eye;
      // Each Worker receives the REAL historical row. ownerConfirmed above is
      // only the freshly checked new local consent, not a Trial authorization.
      const rendered=await read(()=>processing[plan.method](pixels,{revision:plan.revision,body:plan.body},runtime,{target:'source',signal}));assertPixels(rendered);
      if(rendered.width!==bound.sourceWidth||rendered.height!==bound.sourceHeight)throw Error('LOCAL_MAKEUP_RENDER_DIMENSIONS');
      pixels={width:rendered.width,height:rendered.height,data:rendered.data};
    }
    if(target==='proxy'){pixels=await read(()=>processing.makeProxy(pixels,1600));assertPixels(pixels);const source=sourceDimensions(pixels),scale=Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
      if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight||pixels.width!==Math.max(1,Math.round(bound.sourceWidth*scale))||pixels.height!==Math.max(1,Math.round(bound.sourceHeight*scale)))throw Error('LOCAL_MAKEUP_PROXY_MISMATCH');}
    await recheck();const renderRecipe=structuredClone(current);for(const [key] of branches)delete renderRecipe.parameters.extendedParameters[key];delete renderRecipe.parameters.extendedParameters.portrait;
    return {pixels:{...pixels,sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight},recipe:renderRecipe,recheck};
  }finally{processing.dispose();}
}
