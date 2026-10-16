import {checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {checkedFaceFrame,copyFaceFrame} from './astra-face-core.mjs';
import {createFaceEmbeddingONNX,matchFaceGallery} from './astra-face-recognition.mjs';
import {personProcessingStatus,PERSON_PRIVACY_APPROVED} from '../person-privacy.mjs';

/** Cluster only by person IDs in a supplied, authorized gallery. Unknown faces
 * stay unknown; no external identity lookup, name inference or auto-enrollment.
 * This returns suggestions and never changes project marks or gallery entries.
 */
export async function groupCullingPeople(items,gallery,{model,threshold,margin,
  privacy,authorize,signal}={}) {
  checkAbort(signal);
  if(personProcessingStatus(privacy)!==PERSON_PRIVACY_APPROVED)throw Error('PRIVACY_REVIEW_REQUIRED');
  if(typeof authorize!=='function'||!Array.isArray(items)||items.length>2000||
      new Set(items.map(item=>item.id)).size!==items.length||!Array.isArray(gallery)||!gallery.length||gallery.length>10000||
      !Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(margin)||margin<0||margin>1)
    throw Error('CULLING_PEOPLE_INPUT_INVALID');
  const fixedGallery=structuredClone(gallery),people=new Map(),unknown=[],observations=[];
  const embedder=await createFaceEmbeddingONNX(model,{signal});
  try {
    for(const item of items){
      checkAbort(signal);
      if(typeof item.id!=='string'||!item.id||!/^[a-f0-9]{64}$/i.test(item.originalSHA256??''))throw Error('CULLING_PEOPLE_ASSET_INVALID');
      checkedFaceFrame(item.pixels);
      const source=copyFaceFrame(item.pixels),binding=structuredClone(item.binding);
      const request={operation:'culling-explicit-gallery',assetID:item.id,originalSHA256:item.originalSHA256,binding,
        galleryPersonIDs:[...new Set(fixedGallery.map(entry=>entry.personID))]};
      if(await authorize(request,{signal})!==true)throw Error('CULLING_PEOPLE_NOT_AUTHORIZED');
      checkAbort(signal);
      const detected=await detectFaceFeatures(source,{signal});
      const matches=[];
      for(let index=0;index<detected.faces.length;index++){
        const vector=await embedder.embed(source,detected.faces[index],{signal});
        const match=matchFaceGallery(vector,fixedGallery,{threshold,margin,modelSHA256:embedder.modelSHA256});
        vector.fill(0);matches.push({faceIndex:index,...match});
      }
      if(await authorize({...request,operation:'release-culling-gallery-result',personIDs:matches.filter(m=>m.status==='matched').map(m=>m.personID)},{signal})!==true)
        throw Error('CULLING_PEOPLE_NOT_AUTHORIZED');
      checkAbort(signal);
      for(const match of matches)if(match.status==='matched'){
        if(!people.has(match.personID))people.set(match.personID,new Set());people.get(match.personID).add(item.id);
      }else unknown.push({assetID:item.id,faceIndex:match.faceIndex});
      observations.push({assetID:item.id,matches});
    }
    return {proposalOnly:true,groups:[...people].map(([personID,ids])=>({personID,assetIDs:[...ids]})),unknown,observations,
      modelSHA256:embedder.modelSHA256};
  }finally{for(const entry of fixedGallery)entry.embedding?.fill?.(0);await embedder.close();}
}
