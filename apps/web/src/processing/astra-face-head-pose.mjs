import {prepareAstraFace} from './astra-face-runtime.mjs';
import {copyFaceFrame,featherMask,warpFace} from './astra-face-core.mjs';
import {polygonCenter} from './face-feature-geometry.mjs';
import {enforceFaceIdentity} from './astra-face-conditioned-onnx.mjs';

export function createHeadPoseProcessor({model,identityEmbedder,identityThreshold,authorize,privacy}={}){
  return async function process(pixels,binding,{faceIndex,occlusionMask,upDown=0,leftRight=0,tilt=0},{signal}={}){
    if([upDown,leftRight,tilt].some(v=>!Number.isFinite(v)||v<-100||v>100))throw Error('HEAD_POSE_RANGE');
    const base=await prepareAstraFace(pixels,binding,faceIndex,occlusionMask,{authorize,privacy,signal});
    const {source,face}=base;
    if(face.pose.yawAsymmetry>.7||!Number.isFinite(face.pose.pitchRatio)||face.pose.pitchRatio<.1||face.pose.pitchRatio>1.2)
      throw Error('HEAD_POSE_SOURCE_UNSUPPORTED');
    const mask=featherMask(base.mask,source.width,source.height,Math.max(1,Math.min(32,Math.round(source.width*.01))),signal);
    let output=copyFaceFrame(source);
    if(upDown||leftRight){
      // Rotating a 2D crop is not pitch/yaw. A three-control view-synthesis model
      // must reconstruct newly visible surface. Missing weights never fall back
      // to an affine skew that is falsely labelled a pose reconstruction.
      if(model?.feature!=='head-pose'||typeof model.generate!=='function'||model.conditionNames?.length!==3||
        !['upDown','leftRight','tilt'].every(k=>model.conditionNames.includes(k)))throw Error('HEAD_POSE_MODEL_REQUIRED');
      output=await model.generate(source,mask,{upDown,leftRight,tilt},{signal});
    }else if(tilt){
      const center=polygonCenter(face.oval),cx=center.x*source.width,cy=center.y*source.height;
      // SUITE bounded in-plane mapping: full control = 12 degrees. This is not
      // a claim about the undocumented competitor angle per slider step.
      const angle=tilt/100*Math.PI/15,c=Math.cos(angle),s=Math.sin(angle);
      output=warpFace(source,mask,(x,y)=>({x:cx+(x-cx)*c+(y-cy)*s,y:cy-(x-cx)*s+(y-cy)*c}),{signal});
    }
    const identity=upDown||leftRight||tilt?await enforceFaceIdentity(source,output,face,identityEmbedder,identityThreshold,{signal}):null;
    await base.release();return {pixels:output,controls:{upDown,leftRight,tilt},identity,
      provenance:{algorithm:upDown||leftRight?'conditioned-view-synthesis':'suite-selected-face-roll',modelSHA256:upDown||leftRight?model.modelSHA256:null}};
  };
}
