import {detectFaceFeatures} from './faces.mjs';
import {polygonMask,polygonCenter} from './face-feature-geometry.mjs';
import {reshapePortraitEyes,reshapePortraitMouth,reshapePortraitFace,symmetrizePortrait} from './delta66-portrait-warp.mjs';
import {correctPortraitIris,enhancePortraitEyes} from './delta66-portrait-eye-hair.mjs';
/** Actual local FaceLandmarker extraction. The caller chooses a detection; this
 * selection is not personID or authorization. Application binding stays external.
 * Original metadata dimensions may exceed this processing buffer's dimensions. */
export async function detectPortraitFeatureInput(frame,{faceIndex,signal}={}){
  const result=await detectFaceFeatures(frame,{signal});const index=faceIndex??(result.faces.length===1?0:undefined);
  if(!Number.isInteger(index)||!result.faces[index])throw Error('PORTRAIT_FACE_SELECTION_REQUIRED');
  return {face:result.faces[index],detectionIndex:index,modelSHA256:result.modelSHA256,coordinateSpace:'normalized-upper-left',identity:'not-established'};
}
export async function reshapeDetectedPortrait(frame,{feature,controls,faceIndex,mask,protection,signal}){
  const input=await detectPortraitFeatureInput(frame,{faceIndex,signal}),face=input.face,options={mask:mask??polygonMask(frame.width,frame.height,face.oval,{signal}),protection,signal};
  let result;if(feature==='eyes')result=reshapePortraitEyes(frame,face,controls,options);
  else if(feature==='mouth')result=reshapePortraitMouth(frame,face,controls,options);
  else if(feature==='face')result=reshapePortraitFace(frame,face,controls,options);
  else if(feature==='symmetry'){
    const pairs=[[33,263],[133,362],[61,291],[127,356],[172,397]].map(([a,b])=>[face.landmarks[a],face.landmarks[b]].sort((p,q)=>p.x-q.x));
    result=symmetrizePortrait(frame,pairs,{...options,...controls,axisX:polygonCenter(face.oval).x});
  }else throw Error('PORTRAIT_DETECTED_FEATURE');return {...result,evidence:input};
}
export async function correctDetectedPortraitIrises(frame,{faceIndex,imageLeft={},imageRight={},linked,inpainter,protection,signal}={}){
  const {face}=await detectPortraitFeatureInput(frame,{faceIndex,signal});let output=frame;
  if(face.pose.yawAsymmetry>.5||Math.abs(face.pose.rollRadians)>.6)throw Error('PORTRAIT_IRIS_POSE_UNSUPPORTED');
  for(const [side,settings] of [['imageLeft',{...linked,...imageLeft}],['imageRight',{...linked,...imageRight}]]){
    if(!Object.keys(settings).length)continue;const iris=face.regions[side+'Iris'];if(!iris)throw Error('PORTRAIT_IRIS_LANDMARKS_UNAVAILABLE');
    output=await correctPortraitIris(output,{eye:face.regions[side+'Eye'],iris},{...settings,inpainter,protection,signal});}
  return output;
}
export function portraitEyeAnatomyMasks(frame,{eye,iris},{signal}={}){
  const whole=polygonMask(frame.width,frame.height,eye,{signal}),inner=polygonMask(frame.width,frame.height,iris,{signal}),sclera=new Uint8Array(whole.length);
  for(let i=0;i<sclera.length;i++){inner[i]=Math.min(inner[i],whole[i]);sclera[i]=Math.round(whole[i]*(1-inner[i]/255));}
  return {eye:whole,iris:inner,sclera};
}
export async function enhanceDetectedPortraitEyes(frame,{faceIndex,imageLeft={},imageRight={},linked,extraMasks={},protection,signal}={}){
  const {face}=await detectPortraitFeatureInput(frame,{faceIndex,signal});let output=frame;
  for(const [side,settings] of [['imageLeft',{...linked,...imageLeft}],['imageRight',{...linked,...imageRight}]]){
    if(!Object.keys(settings).length)continue;const iris=face.regions[side+'Iris'];if(!iris)throw Error('PORTRAIT_IRIS_LANDMARKS_UNAVAILABLE');
    const masks=portraitEyeAnatomyMasks(frame,{eye:face.regions[side+'Eye'],iris},{signal});
    output=enhancePortraitEyes(output,{...masks,...extraMasks[side]},{...settings,protection,signal});}return output;
}
