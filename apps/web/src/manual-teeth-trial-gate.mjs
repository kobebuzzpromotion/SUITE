import {TrialClient} from './trial-client.mjs';
import {MAX_INPUT_BYTES} from './processing/pure.mjs';
import {MANUAL_TEETH_WHITENING_VERSION} from './processing/manual-teeth-whitening.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const abortError=()=>new DOMException('Teeth read cancelled','AbortError');
const checkAbort=signal=>{if(signal?.aborted)throw abortError();};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}
async function read(task,signal){
  checkAbort(signal);
  const pending=Promise.resolve().then(task);
  if(!signal)return pending;
  let onAbort;
  const cancelled=new Promise((_,reject)=>{
    onAbort=()=>reject(abortError());
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
  });
  try{const result=await Promise.race([pending,cancelled]);checkAbort(signal);return result;}
  finally{signal.removeEventListener('abort',onAbort);}
}
function identity(session,first){
  const person=session?.principal;
  if(session?.mode!=='INVITED_LOCAL_TRIAL'||!UUID.test(person?.id)||
      person.tenantId!==`trial-${person.id}`)
    throw Error(session?.endedReason||'TEETH_TRIAL_SESSION_REQUIRED');
  if(first&&(person.id!==first.id||person.tenantId!==first.tenantId))
    throw Error('TEETH_TRIAL_SESSION_CHANGED');
  return Object.freeze({id:person.id,tenantId:person.tenantId});
}
function assetRecord(assets,binding,first){
  if(!Array.isArray(assets))throw Error('TEETH_TRIAL_ASSET_LIST_INVALID');
  const matches=assets.filter(item=>item?.id===binding.assetID);
  if(matches.length!==1||matches[0].deletedAt!==null||
      matches[0].cloudSafe!==true)throw Error('TEETH_TRIAL_ASSET_UNAVAILABLE');
  const asset=matches[0];
  if(typeof asset.sha256!=='string'||!SHA.test(asset.sha256)||
      asset.sha256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      !Number.isSafeInteger(asset.size)||asset.size<1||asset.size>MAX_INPUT_BYTES||
      first&&asset.size!==first.size)
    throw Error('TEETH_TRIAL_ORIGINAL_CHANGED');
  return Object.freeze({size:asset.size});
}
function savedDocument(saved,binding){
  if(saved?.revision!==binding.savedRevision||!saved?.body)
    throw Error('TEETH_TRIAL_REVISION_CONFLICT');
  const document=saved.body?.parameters?.extendedParameters?.teethManual;
  if(!exact(document,['schemaVersion','engineVersion','binding','teethStrokes',
    'settings'])||document.schemaVersion!==1||
      document.engineVersion!==MANUAL_TEETH_WHITENING_VERSION)
    throw Error('TEETH_TRIAL_SAVED_DOCUMENT_INVALID');
  const attached=document.binding;
  if(!exact(attached,['assetID','originalSHA256','sourceWidth','sourceHeight',
    'personID'])||attached.assetID!==binding.assetID||
      attached.personID!==binding.personID||
      typeof attached.originalSHA256!=='string'||
      attached.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      !Number.isSafeInteger(attached.sourceWidth)||attached.sourceWidth<1||
      !Number.isSafeInteger(attached.sourceHeight)||attached.sourceHeight<1||
      attached.sourceWidth*attached.sourceHeight>8_000_000)
    throw Error('TEETH_TRIAL_SAVED_BINDING_MISMATCH');
  return Object.freeze({sourceWidth:attached.sourceWidth,
    sourceHeight:attached.sourceHeight});
}
async function originalDigest(api,binding,asset,signal){
  const bytes=await read(()=>api.getOriginal(binding.assetID,{signal}),signal);
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.size)
    throw Error('TEETH_TRIAL_ORIGINAL_CHANGED');
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)throw Error('TEETH_TRIAL_CRYPTO_UNAVAILABLE');
  const digest=new Uint8Array(await read(()=>subtle.digest('SHA-256',bytes),signal));
  const actual=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
  if(actual!==binding.originalSHA256.toLowerCase())
    throw Error('TEETH_TRIAL_ORIGINAL_CHANGED');
}

/**
 * Read-only Trial gate. Caller binding is an expectation, not proof. The
 * current API can freshly verify Principal, Asset registration, immutable
 * Original SHA, saved Recipe revision and edit/export permission; it exposes
 * no independent authenticated person inventory. A portrait target ID inside
 * the caller-authored saved Recipe proves neither tooth region nor unique
 * person identity. Consequently this gate ALWAYS rejects at the person step
 * and returns no authority or pixels. Do not bypass with UI flags, a fake
 * permissionEvidence object, or a caller-supplied person list. Product
 * Worker/Preview/Final must remain disconnected until a real person authority
 * and decoded source-dimension check are added under a separate contract.
 */
export async function readTrialManualTeethGate(options){
  if(!exact(options,['api','binding','action'])&&
      !exact(options,['api','binding','action','signal']))
    throw Error('TEETH_TRIAL_INPUT_INVALID');
  const {api,binding,action,signal}=options;
  if(!(api instanceof TrialClient)||
      !exact(binding,['assetID','originalSHA256','personID','savedRevision'])||
      typeof binding.assetID!=='string'||!UUID.test(binding.assetID)||
      typeof binding.originalSHA256!=='string'||!SHA.test(binding.originalSHA256)||
      typeof binding.personID!=='string'||!UUID.test(binding.personID)||
      !Number.isSafeInteger(binding.savedRevision)||binding.savedRevision<1||
      !['edit','export'].includes(action)||
      signal!==undefined&&(signal===null||typeof signal.aborted!=='boolean'||
        typeof signal.addEventListener!=='function'||
        typeof signal.removeEventListener!=='function'))
    throw Error('TEETH_TRIAL_INPUT_INVALID');
  checkAbort(signal);
  const firstIdentity=identity(await read(()=>api.getSession(),signal));
  const firstAsset=assetRecord(await read(()=>api.listAssets(),signal),binding);
  const firstDocument=savedDocument(await read(()=>api.getRecipe(binding.assetID),signal),binding);
  await originalDigest(api,binding,firstAsset,signal);
  assetRecord(await read(()=>api.listAssets(),signal),binding,firstAsset);
  const secondDocument=savedDocument(await read(()=>api.getRecipe(binding.assetID),signal),binding);
  if(secondDocument.sourceWidth!==firstDocument.sourceWidth||
      secondDocument.sourceHeight!==firstDocument.sourceHeight)
    throw Error('TEETH_TRIAL_SAVED_BINDING_MISMATCH');
  identity(await read(()=>api.getSession(),signal),firstIdentity);
  const permission=await read(()=>api.assertPermission(binding.assetID,action),signal);
  if(permission?.authorized!==true)throw Error('TEETH_TRIAL_PERMISSION_DENIED');
  checkAbort(signal);
  // No authenticated person inventory route exists in TrialClient/server.
  // Never return the otherwise valid Asset evidence as a tooth authority.
  throw Error('TEETH_PERSON_ID_AUTHORITY_UNAVAILABLE');
}
