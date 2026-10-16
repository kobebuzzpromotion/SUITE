import {detectFaceFeatures} from './faces.mjs';
import {checkedFaceFrame,copyFaceFrame,faceMask} from './astra-face-core.mjs';
import {checkAbort} from './pure.mjs';
import {personProcessingStatus,PERSON_PRIVACY_APPROVED} from '../person-privacy.mjs';
export async function prepareAstraFace(pixels,binding,faceIndex,occlusionMask,{authorize,privacy,signal}){
  if(typeof authorize!=='function'||personProcessingStatus(privacy)!==PERSON_PRIVACY_APPROVED)
    throw Error('ASTRA_FACE_AUTHORITY_OR_PRIVACY_REQUIRED');
  checkedFaceFrame(pixels);checkAbort(signal);
  if(!binding||typeof binding.assetID!=='string'||typeof binding.personID!=='string'||
    !/^[a-f0-9]{64}$/i.test(binding.originalSHA256??'')||!Number.isSafeInteger(binding.savedRevision)||binding.savedRevision<1||
    !Number.isSafeInteger(faceIndex)||faceIndex<0)throw Error('ASTRA_FACE_BINDING');
  if(!(occlusionMask instanceof Uint8Array||occlusionMask instanceof Uint8ClampedArray)||
    occlusionMask.length!==pixels.width*pixels.height)throw Error('ASTRA_FACE_OCCLUSION_REQUIRED');
  const source=copyFaceFrame(pixels),excluded=new Uint8Array(occlusionMask),bound=structuredClone(binding);
  if(excluded.some(v=>v!==0&&v!==255))throw Error('ASTRA_FACE_OCCLUSION_BINARY');
  const frameSHA256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source.data)),v=>v.toString(16).padStart(2,'0')).join('');
  const request={binding:bound,faceIndex,frameSHA256,width:source.width,height:source.height};
  if(await authorize({...request,phase:'before-analysis'},{signal})!==true)throw Error('ASTRA_FACE_NOT_AUTHORIZED');
  const inventory=await detectFaceFeatures(source,{signal}),face=inventory.faces[faceIndex];
  if(!face)throw Error('ASTRA_FACE_NOT_FOUND');
  if(await authorize({...structuredClone(request),phase:'after-analysis',inventory:structuredClone(inventory),
    occlusionMask:excluded.slice()},{signal})!==true)throw Error('ASTRA_FACE_NOT_AUTHORIZED');
  return {source,face,excluded,mask:faceMask(source,face,{protection:excluded,signal}),
    release:async()=>{checkAbort(signal);if(await authorize({...structuredClone(request),phase:'before-release'},{signal})!==true)
      throw Error('ASTRA_FACE_NOT_AUTHORIZED');checkAbort(signal);}};
}
