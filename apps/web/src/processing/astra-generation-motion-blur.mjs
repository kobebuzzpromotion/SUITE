import {checkAbort} from './pure.mjs';
import {astraFrame,astraMask} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationCandidate,compositeGeneration} from './astra-generation-core.mjs';

/** Ghost-flow model consumes subject coverage as its mask input, plus explicit
 * normalized exposure and direction controls. This is learned motion synthesis,
 * not a renamed uniform convolution. The host's matching model IO must declare
 * controlFields named exposure (0..1) and direction (-1..1, turns/half-circle).
 * compare includes the detached input; adoption/save happens elsewhere. */
export async function generateMotionBlur(pixels,{model,binding,subjectMask,protectionMask,
  exposure=.5,direction=0,seed=1,signal}={}){
  requireGenerationModel(model,'motion-ghost-flow',{masked:true});
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),subject=astraMask(subjectMask,source);
  const protect=astraMask(protectionMask,source);
  if(!Number.isFinite(exposure)||exposure<0||exposure>1||!Number.isFinite(direction)||Math.abs(direction)>1||!subject.some(Boolean))
    throw Error('MOTION_CONTROLS_INVALID');
  const mask=new Uint8Array(subject.length);
  for(let i=0;i<mask.length;i++)mask[i]=protect[i]?0:255;
  const raw=await model.run(source,{mask:subject,seed,controls:{exposure,direction},signal});checkAbort(signal);
  const result=compositeGeneration(source,raw,mask,{signal});
  const candidate=await generationCandidate(result,{task:'motion-ghost-flow',seed,modelSHA256:model.modelSHA256,
    binding:sourceBinding,parameters:{mode:'ghost-flow',exposure,direction}},{signal});
  return {before:source,after:candidate};
}
