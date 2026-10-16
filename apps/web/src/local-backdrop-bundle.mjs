import {validateAppleLocalEdit} from './apple-local-edit-import.mjs';

const fail=reason=>{throw Error(`LOCAL_BACKDROP_BUNDLE_${reason}`);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||keys.some(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return !descriptor||!Object.hasOwn(descriptor,'value');
    }))fail('SCHEMA');
}
/** Verifies an explicitly supplied native backdrop resource bundle only.
 * Declared dimensions are matched to Recipe metadata, NOT attested as decoded
 * image dimensions. callerConfirmed is a declaration, not a legal approval.
 * No download, storage, decoding, inference or permission record is synthesized.
 * Returned bytes are owned copies; the consumer must erase them when finished.
 * Renderer still requires decoded pixels/provenance, current host authorization,
 * pixel SHA checks and supported stage selection. This is not a render receipt.
 */
export async function validateLocalBackdropBundle({recipe,binding,manifest,backgroundBytes,maskBytes,
  maskKind='preview'},{signal}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();
  exact(binding,['id','sha256']);
  if(typeof binding.id!=='string'||typeof binding.sha256!=='string')fail('BINDING');
  validateAppleLocalEdit('localBackdrop',recipe,binding);
  exact(manifest,['assetID','version','sha256','byteCount','width','height','permission']);
  if(manifest.permission!=='callerConfirmed')fail('PERMISSION');
  const r=structuredClone(recipe),fixedBinding=Object.freeze({...binding}),fixedManifest=Object.freeze({...manifest});
  if(['assetID','version','sha256','byteCount','width','height'].some(key=>fixedManifest[key]!==r.background[key]))fail('BACKGROUND_REFERENCE');
  if(!['preview','final'].includes(maskKind))fail('MASK_KIND');
  const maskReference=maskKind==='final'&&r.finalMask?{...r.finalMask}:
    {sha256:r.maskSHA256,width:r.maskWidth,height:r.maskHeight,byteCount:r.maskByteCount};
  if(!(backgroundBytes instanceof Uint8Array)||backgroundBytes.length!==r.background.byteCount||
    !(maskBytes instanceof Uint8Array)||maskBytes.length!==maskReference.byteCount)fail('BYTE_COUNT');
  // Recipe validation already bounds encoded bytes at 32 MiB and raw L8 at 8 MP.
  let encoded,mask,success=false;
  try{
    encoded=backgroundBytes.slice();mask=maskBytes.slice();
    const [backgroundSHA,maskSHA]=await Promise.all([digest(encoded),digest(mask)]);check();
    if(backgroundSHA!==r.background.sha256.toLowerCase()||maskSHA!==maskReference.sha256.toLowerCase())fail('SHA256');
    success=true;
    return {recipe:r,binding:fixedBinding,manifest:fixedManifest,backgroundBytes:encoded,maskBytes:mask,
      maskKind,maskReference:Object.freeze(maskReference),encodedIntegrityVerified:true,
      decodedDimensionsVerified:false,decodedPixelsVerified:false,permissionDeclared:true,
      permissionReviewed:false,persisted:false,renderReady:false};
  }finally{if(!success){encoded?.fill(0);mask?.fill(0);}}
}
