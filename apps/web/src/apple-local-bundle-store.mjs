import {readAppleLocalEditJSON,rejectDuplicateKeys} from './apple-local-edit-import.mjs';
import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';
import {validateLocalBackdropBundle} from './local-backdrop-bundle.mjs';
import {validateCropSettings} from '../../../dist/apps/backend/src/crop-export.js';
const DB='suite-apple-local-bundles-v1', STORE='bundles';
const check=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('APPLE_BUNDLE_SCHEMA');}
export async function inspectAppleLocalBundle(value,{signal}={}){
  check(signal);exact(value,['schemaVersion','originalJSON','manifest','backgroundBytes','maskBytes','bodyMaskBytes',...(value?.schemaVersion===2?['sourceWidth','sourceHeight']:[])]);
  if(![1,2].includes(value.schemaVersion))throw Error('APPLE_BUNDLE_VERSION');
  const imported=readAppleLocalEditJSON(value.originalJSON,{preflight:preflightCrossDeviceCapabilities});
  const doc=imported.document;if(!doc.asset||!doc.history)throw Error('APPLE_BUNDLE_BINDING');
  const p=doc.history.entries[doc.history.cursor].parameters,e=p.extendedParameters;
  const sourceWidth=value.schemaVersion===2?value.sourceWidth:e.localBackdrop?.maskWidth,sourceHeight=value.schemaVersion===2?value.sourceHeight:e.localBackdrop?.maskHeight;
  if(![sourceWidth,sourceHeight].every(n=>Number.isInteger(n)&&n>0&&n<=32768)||sourceWidth*sourceHeight>8_000_000)throw Error('APPLE_BUNDLE_DIMENSIONS');
  if((!e.localBackdrop&&(value.schemaVersion!==2||!e.localWarp&&!e.localRetouch))||Object.keys(e).some(k=>!['localBackdrop','localWarp','localRetouch','crop'].includes(k))||
    !Number.isFinite(p.contrast)||p.contrast<0||p.saturation!==1||Math.abs(p.exposure)>20||p.rotationDegrees%90!==0||
    !Array.isArray(p.processingOrder)||new Set(p.processingOrder).size!==p.processingOrder.length||
    p.processingOrder.some(k=>!['exposure','contrast','saturation','rotation','crop'].includes(k))||
    p.exposure!==0&&!p.processingOrder.includes('exposure')||p.contrast!==1&&!p.processingOrder.includes('contrast')||p.rotationDegrees%360!==0&&!p.processingOrder.includes('rotation'))throw Error('APPLE_BUNDLE_STAGE_UNSUPPORTED');
  if(e.crop){
    validateCropSettings(e.crop);
    if(e.crop.rotation!==p.rotationDegrees||p.processingOrder.at(-1)!=='crop')throw Error('APPLE_BUNDLE_CROP_ORDER');
    const swapped=Math.abs(p.rotationDegrees/90)%2===1;
    const w=swapped?sourceHeight:sourceWidth,h=swapped?sourceWidth:sourceHeight,r=e.crop.crop_rect;
    if([r.x*w,r.y*h,r.width*w,r.height*h].some(v=>Math.abs(v-Math.round(v))>1e-7))throw Error('APPLE_CROP_SUBPIXEL_UNSUPPORTED');
    if(e.crop.crop_ratio&&Math.abs((r.width*w)/(r.height*h)-e.crop.crop_ratio.width/e.crop.crop_ratio.height)>.003)throw Error('APPLE_BUNDLE_CROP_RATIO');
  }else if(p.processingOrder.includes('crop'))throw Error('APPLE_BUNDLE_CROP_REQUIRED');
  const body=value.bodyMaskBytes;
  if(e.localWarp?.bodyMask){if(!(body instanceof Uint8Array)||body.length!==e.localWarp.bodyMask.byteCount||body.length>8_000_000||await hash(body)!==e.localWarp.bodyMask.sha256.toLowerCase())throw Error('APPLE_BUNDLE_BODY_MASK');}
  else if(body!==null)throw Error('APPLE_BUNDLE_BODY_MASK_UNEXPECTED');
  if(e.localBackdrop){
    if(sourceWidth!==e.localBackdrop.maskWidth||sourceHeight!==e.localBackdrop.maskHeight)throw Error('APPLE_BUNDLE_DIMENSIONS');
    const verified=await validateLocalBackdropBundle({recipe:e.localBackdrop,binding:{id:doc.asset.id,sha256:doc.asset.sha256},manifest:value.manifest,
      backgroundBytes:value.backgroundBytes,maskBytes:value.maskBytes},{signal});
    verified.backgroundBytes.fill(0);verified.maskBytes.fill(0);
  }else if(value.manifest!==null||value.backgroundBytes!==null||value.maskBytes!==null)throw Error('APPLE_BUNDLE_UNEXPECTED_BACKGROUND');
  const originalBytes=new TextEncoder().encode(value.originalJSON);
  const byteCount=originalBytes.length+(value.backgroundBytes?.length??0)+(value.maskBytes?.length??0)+(body?.length??0);
  if(byteCount>64*1024*1024)throw Error('APPLE_BUNDLE_CAPACITY');
  const tuple=[value.schemaVersion,await hash(originalBytes),value.manifest,
    value.backgroundBytes?await hash(value.backgroundBytes):null,value.maskBytes?await hash(value.maskBytes):null,body?await hash(body):null];
  if(value.schemaVersion===2)tuple.push(sourceWidth,sourceHeight);
  const bundleSHA256=await hash(new TextEncoder().encode(JSON.stringify(tuple)));check(signal);
  return {parameters:p,asset:doc.asset,sourceWidth,sourceHeight,reference:{schemaVersion:value.schemaVersion,engineVersion:`suite-apple-local-bundle-v${value.schemaVersion}`,assetID:doc.asset.id,
    originalSHA256:doc.asset.sha256.toLowerCase(),bundleSHA256,byteCount}};
}
async function database(){return await new Promise((resolve,reject)=>{
  let settled=false;const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{if(settled){r.transaction.abort();return;}r.result.createObjectStore(STORE);};
  r.onsuccess=()=>{if(settled){r.result.close();return;}settled=true;r.result.onversionchange=()=>r.result.close();resolve(r.result);};
  r.onerror=()=>{if(!settled){settled=true;reject(r.error);}};
  r.onblocked=()=>{if(!settled){settled=true;reject(Error('APPLE_BUNDLE_STORAGE_BLOCKED'));}};
});}
async function access(key,value,signal){
  check(signal);const db=await database();
  try{return await new Promise((resolve,reject)=>{
    check(signal);const tx=db.transaction(STORE,value?'readwrite':'readonly'),store=tx.objectStore(STORE);let result,failure;
    const abort=()=>{failure=new DOMException('Cancelled','AbortError');try{tx.abort();}catch{}};
    signal?.addEventListener('abort',abort,{once:true});
    tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(result);};
    tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(failure??tx.error??Error('APPLE_BUNDLE_STORAGE'));};
    tx.onerror=()=>{failure=tx.error;};
    const get=store.get(key);get.onsuccess=()=>{result=get.result;if(value&&!result){
      // Bound persistent accumulation as well as the per-bundle byte budget.
      const count=store.count();count.onsuccess=()=>{if(count.result>=8){failure=Error('APPLE_BUNDLE_STORE_FULL');tx.abort();}else store.add(value,key);};
    }};
  });}finally{db.close();}
}
export async function saveAppleLocalBundle(input,{signal}={}){
  const value=structuredClone(input),info=await inspectAppleLocalBundle(value,{signal});
  const old=await access(info.reference.bundleSHA256,value,signal);
  if(old){const previous=await inspectAppleLocalBundle(old,{signal});if(JSON.stringify(previous.reference)!==JSON.stringify(info.reference))throw Error('APPLE_BUNDLE_IMMUTABLE_CONFLICT');}
  check(signal);return info.reference;
}
export async function loadAppleLocalBundle(reference,{signal}={}){
  exact(reference,['schemaVersion','engineVersion','assetID','originalSHA256','bundleSHA256','byteCount']);
  const value=await access(reference.bundleSHA256,null,signal);if(!value)throw Error('APPLE_BUNDLE_ASSETS_MISSING');
  const info=await inspectAppleLocalBundle(value,{signal});
  if(Object.keys(info.reference).some(k=>info.reference[k]!==reference[k]))throw Error('APPLE_BUNDLE_REFERENCE_MISMATCH');
  return {value,...info};
}
/** Check active references before modifying Undo/cache or committing a server
 * Recipe. This is local integrity only, never a Cloud Safe receipt. */
export async function verifyAppleLocalBundle(reference,{signal}={}){
  const loaded=await loadAppleLocalBundle(reference,{signal});
  try{check(signal);return {...loaded.reference};}
  finally{loaded.value.backgroundBytes?.fill(0);loaded.value.maskBytes?.fill(0);loaded.value.bodyMaskBytes?.fill(0);}
}
/** Explicit portable file, not account synchronization. Contains editable
 * history and image/mask assets: callers must warn before download/sharing. */
export async function exportAppleLocalBundle(input,{signal}={}){
  const fixed=structuredClone(input);
  await inspectAppleLocalBundle(fixed,{signal});
  const encode=bytes=>{
    if(bytes===null)return null;
    let binary='';for(let i=0;i<bytes.length;i+=8192){check(signal);binary+=String.fromCharCode(...bytes.subarray(i,i+8192));}
    return btoa(binary);
  };
  try{
    return JSON.stringify({format:'suite-apple-local-bundle',version:fixed.schemaVersion,...(fixed.schemaVersion===2?{sourceWidth:fixed.sourceWidth,sourceHeight:fixed.sourceHeight}:{}),originalJSON:fixed.originalJSON,
      manifest:fixed.manifest,backgroundBase64:encode(fixed.backgroundBytes),maskBase64:encode(fixed.maskBytes),bodyMaskBase64:encode(fixed.bodyMaskBytes)});
  }finally{fixed.backgroundBytes?.fill(0);fixed.maskBytes?.fill(0);fixed.bodyMaskBytes?.fill(0);}
}
export async function importAppleLocalBundle(text,{signal}={}){
  check(signal);
  if(typeof text!=='string'||text.length>96*1024*1024)throw Error('APPLE_BUNDLE_TRANSFER_CAPACITY');
  rejectDuplicateKeys(text);
  const wire=JSON.parse(text);exact(wire,['format','version','originalJSON','manifest','backgroundBase64','maskBase64','bodyMaskBase64',...(wire?.version===2?['sourceWidth','sourceHeight']:[])]);
  if(wire.format!=='suite-apple-local-bundle'||![1,2].includes(wire.version))throw Error('APPLE_BUNDLE_TRANSFER_VERSION');
  const decode=(string,limit)=>{
    if(typeof string!=='string'||string.length>Math.ceil(limit/3)*4||string.length%4!==0)throw Error('APPLE_BUNDLE_TRANSFER_BYTES');
    const binary=atob(string);if(binary.length>limit||btoa(binary)!==string)throw Error('APPLE_BUNDLE_TRANSFER_BYTES');
    const bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++){if(i%8192===0)check(signal);bytes[i]=binary.charCodeAt(i);}return bytes;
  };
  let value,backgroundBytes,maskBytes,bodyMaskBytes;
  try{
    backgroundBytes=wire.backgroundBase64===null?null:decode(wire.backgroundBase64,32*1024*1024);maskBytes=wire.maskBase64===null?null:decode(wire.maskBase64,8_000_000);
    bodyMaskBytes=wire.bodyMaskBase64===null?null:decode(wire.bodyMaskBase64,8_000_000);
    value={schemaVersion:wire.version,...(wire.version===2?{sourceWidth:wire.sourceWidth,sourceHeight:wire.sourceHeight}:{}),originalJSON:wire.originalJSON,manifest:wire.manifest,backgroundBytes,maskBytes,bodyMaskBytes};
    await inspectAppleLocalBundle(value,{signal});check(signal);return value;
  }catch(error){backgroundBytes?.fill(0);maskBytes?.fill(0);bodyMaskBytes?.fill(0);throw error;}
}
