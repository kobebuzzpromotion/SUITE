import {LOCAL_FACE_OBSERVATION_CONTRACT,WEB_LOCAL_FACE_OBSERVATION_CONTRACT,localFaceObservations} from './processing/local-face-observations.mjs';
import {matchLocalPhotoIdentity} from './processing/local-face-identity.mjs';

const cancelled=()=>new DOMException('Cancelled or stale photo','AbortError');
// The initialized controller must be exclusively owned by this session while a
// request runs. cancel terminates its worker; explicit reinitialization is needed.
// validateCurrent must check the host photo/settings generation, not only UUID.
export function createLocalFaceAnalysisSession({controller,validateCurrent,issueFaceTargetIDs}={}){
  if(typeof controller?.analyze!=='function'||typeof controller?.cancel!=='function'||
    typeof validateCurrent!=='function'||issueFaceTargetIDs!=null&&typeof issueFaceTargetIDs!=='function')
    throw Error('LOCAL_FACE_SESSION_DEPENDENCIES');
  let generation=0,active=false,closed=false,aborter=null,lastKey=null,lastIDs=null;
  return Object.freeze({
    async analyze({prepared,analysisVersion,policy,gallery},{signal}={}){
      if(active||closed)throw Error('LOCAL_FACE_SESSION_UNAVAILABLE');
      if(!(prepared?.bgr instanceof Uint8Array)||prepared.bgr.length>2_560_000*3||
        !Number.isSafeInteger(prepared.revision)||prepared.revision<0||
        !Array.isArray(gallery)||gallery.length>10_000||
        !Number.isInteger(policy?.dimension)||policy.dimension<16||policy.dimension>4096||
        gallery.length*policy.dimension>8_000_000)throw Error('LOCAL_FACE_SESSION_INPUT');
      // Clone before first permission/current-photo await, never read caller data
      // again. Matching validates every explicit model/policy/gallery contract.
      const p={assetID:prepared.assetID,originalSHA256:prepared.originalSHA256,analysisSHA256:prepared.analysisSHA256,
        preprocessingVersion:prepared.preprocessingVersion,width:prepared.width,height:prepared.height,stride:prepared.stride,
        inputWidth:prepared.inputWidth,inputHeight:prepared.inputHeight,revision:prepared.revision,bgr:prepared.bgr.slice()};
      let fixedPolicy,fixedGallery;
      const contract=p.preprocessingVersion===WEB_LOCAL_FACE_OBSERVATION_CONTRACT.pixelPreprocessingVersion
        ?WEB_LOCAL_FACE_OBSERVATION_CONTRACT:LOCAL_FACE_OBSERVATION_CONTRACT;
      const clearInputs=()=>{
        p.bgr.fill(0);
        for(const entry of fixedGallery??[]){
          const values=entry?.embedding?.values;
          if(Array.isArray(values)||values instanceof Float32Array)values.fill(0);
        }
      };
      try{
        fixedPolicy=structuredClone(policy);fixedGallery=structuredClone(gallery);
        if(p.preprocessingVersion!==contract.pixelPreprocessingVersion||fixedPolicy.modelSHA256!==contract.recognizerSHA256||
          fixedPolicy.preprocessingVersion!==contract.recognizerPreprocessingVersion||fixedPolicy.dimension!==contract.dimension)
          throw Error('LOCAL_FACE_SESSION_POLICY_DOMAIN');
        matchLocalPhotoIdentity([],fixedGallery,fixedPolicy,{signal});
      }catch(error){clearInputs();throw error;}
      const binding=Object.freeze({assetID:p.assetID,originalSHA256:p.originalSHA256,analysisSHA256:p.analysisSHA256,
        analysisVersion,revision:p.revision,inputWidth:p.inputWidth,inputHeight:p.inputHeight});
      const epoch=++generation,local=new AbortController();active=true;aborter=local;
      const onAbort=()=>local.abort();signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted)local.abort();
      const current=async()=>{
        if(local.signal.aborted||closed||generation!==epoch)throw cancelled();
        if(await validateCurrent(binding,{signal:local.signal})!==true)throw cancelled();
        if(local.signal.aborted||closed||generation!==epoch)throw cancelled();
      };
      let raw;
      try{
        await current();
        raw=await controller.analyze({bgr:p.bgr,width:p.width,height:p.height,stride:p.stride},
          {binding,signal:local.signal});
        await current();
        if(!Array.isArray(raw?.faces)||raw.faces.length>512)throw Error('LOCAL_FACE_SESSION_OUTPUT');
        // Stable only for exactly the same analysis/version/detection rows. IDs
        // are not reused by proximity, array index or supposed person identity.
        const key=JSON.stringify([binding,p.width,p.height,raw.faces.map(f=>Array.from(f.values??[]))]);
        let ids;
        if(key===lastKey)ids=lastIDs.slice();
        else if(issueFaceTargetIDs)ids=await issueFaceTargetIDs(Object.freeze({binding,count:raw.faces.length,analysisKey:key}),{signal:local.signal});
        else ids=raw.faces.map(()=>crypto.randomUUID());
        await current();
        const analysis=await localFaceObservations({workerResult:raw,prepared:p,
          runtimeContract:contract,faceTargetIDs:ids,analysisVersion},{signal:local.signal});
        await current();
        const matches=matchLocalPhotoIdentity(analysis.observations,fixedGallery,fixedPolicy,{signal:local.signal});
        await current();
        lastKey=key;lastIDs=analysis.faces.map(f=>f.target.faceTargetID);
        return Object.freeze({analysis,matches,requestGeneration:epoch,automaticAssignment:false,persisted:false});
      }finally{
        for(const face of raw?.faces??[]){face.embedding?.fill(0);face.values?.fill(0);}
        clearInputs();signal?.removeEventListener('abort',onAbort);
        if(aborter===local)aborter=null;active=false;
      }
    },
    cancel(){generation++;aborter?.abort();controller.cancel();},
    dispose(){closed=true;generation++;aborter?.abort();controller.cancel();lastKey=null;lastIDs=null;}
  });
}
