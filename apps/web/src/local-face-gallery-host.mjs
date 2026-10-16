import {matchLocalPhotoIdentity} from './processing/local-face-identity.mjs';
import {WEB_LOCAL_FACE_OBSERVATION_CONTRACT as contract} from './processing/local-face-observations.mjs';

/** Ephemeral, explicitly imported Web-only gallery; never persists biometrics,
 * enrolls a person, transfers Apple embeddings, or invents matching thresholds.
 * Host must invalidate() on photo/settings/access changes. Consent is a user
 * declaration and is required again after every invalidation/import. */
export function createLocalFaceGalleryHost({canUse}={}){
  if(typeof canUse!=='function')throw Error('LOCAL_FACE_GALLERY_HOST');
  let document=null,revision=0,approved=false,closed=false;
  const wipe=doc=>{for(const entry of Array.isArray(doc?.gallery)?doc.gallery:[]){const values=entry?.embedding?.values;if(Array.isArray(values))values.fill(0);}};
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
    Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
  const invalidate=()=>{revision++;approved=false;};
  return Object.freeze({
    load(text){
      if(closed)throw Error('LOCAL_FACE_GALLERY_CLOSED');
      invalidate();wipe(document);document=null;
      if(typeof text!=='string'||text.length>8_000_000||new TextEncoder().encode(text).length>8_000_000)
        throw Error('LOCAL_FACE_GALLERY_SIZE');
      let next;
      try{
        next=JSON.parse(text);
        if(!exact(next,['schemaVersion','revision','analysisVersion','policy','gallery'])||next.schemaVersion!==1||
          typeof next.revision!=='string'||!next.revision.trim()||next.revision.length>256||
          typeof next.analysisVersion!=='string'||!next.analysisVersion.trim()||next.analysisVersion.length>256||
          !Array.isArray(next.gallery)||next.gallery.length<1||next.gallery.length>10_000||
          next.policy?.modelSHA256!==contract.recognizerSHA256||
          next.policy?.preprocessingVersion!==contract.recognizerPreprocessingVersion||
          next.policy?.dimension!==contract.dimension)throw Error('LOCAL_FACE_GALLERY_CONTRACT');
        matchLocalPhotoIdentity([],next.gallery,next.policy);
        document=next;
        return {templates:next.gallery.length,people:new Set(next.gallery.map(e=>e.personID.toLowerCase())).size,
          revision:next.revision,policyRevision:next.policy.revision,persisted:false};
      }catch(error){wipe(next);throw error;}
    },
    approve(value){invalidate();approved=value===true&&document!==null&&!closed;},
    invalidate,
    async identityProvider(binding,{signal}={}){
      if(closed||signal?.aborted||!approved||!document||canUse()!==true)throw Error('LOCAL_FACE_GALLERY_PERMISSION');
      if(binding?.preprocessingVersion!==contract.pixelPreprocessingVersion)throw Error('LOCAL_FACE_GALLERY_PIXEL_DOMAIN');
      const epoch=revision,fixed=document,photo=structuredClone(binding);
      const valid=()=>!closed&&approved&&document===fixed&&revision===epoch&&canUse()===true;
      const copied=structuredClone(fixed.gallery);
      return {gallery:copied,policy:structuredClone(fixed.policy),analysisVersion:fixed.analysisVersion,
        release(){wipe({gallery:copied});},
        async validateCurrent(current,{signal:currentSignal}={}){
          return !signal?.aborted&&!currentSignal?.aborted&&valid()&&
            ['assetID','originalSHA256','analysisSHA256','revision','inputWidth','inputHeight'].every(key=>current?.[key]===photo[key]);
        }};
    },
    dispose(){if(closed)return;closed=true;invalidate();wipe(document);document=null;}
  });
}
