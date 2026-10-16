import {checkAbort} from './pure.mjs';
import {astraFrame,astraMask} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationCandidate,protectedGenerationMask,
  compositeGeneration} from './astra-generation-core.mjs';

/** The repair range is either explicit (external liquify), or derived from the
 * actual displacement field (dx/dy in pixels) retained by the liquify operation.
 * A dedicated repair model restores background lines/textures; this is not blur.
 * subjectMask must describe the ALREADY DEFORMED subject: those pixels stay exact. */
export async function repairLiquifiedBackground(pixels,{model,binding,subjectMask,repairMask,displacement,
  seed=1,signal}={}){
  requireGenerationModel(model,'liquify-repair',{masked:true});
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),subject=astraMask(subjectMask,source),n=source.width*source.height;
  if((repairMask===undefined)===(displacement===undefined))throw Error('LIQUIFY_ONE_RANGE_SOURCE_REQUIRED');
  let range;
  if(repairMask!==undefined)range=astraMask(repairMask,source);
  else{
    if(!(displacement?.dx instanceof Float32Array)||!(displacement?.dy instanceof Float32Array)||
      displacement.dx.length!==n||displacement.dy.length!==n)throw Error('LIQUIFY_DISPLACEMENT_INVALID');
    range=new Uint8Array(n);
    for(let i=0;i<n;i++){
      if((i&16383)===0)checkAbort(signal);
      const dx=displacement.dx[i],dy=displacement.dy[i];
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>source.width||Math.abs(dy)>source.height)
        throw Error('LIQUIFY_DISPLACEMENT_RANGE');
      if(Math.hypot(dx,dy)>.25)range[i]=255;
    }
  }
  const mask=protectedGenerationMask(range,subject,source);
  if(!mask.some(Boolean))throw Error('LIQUIFY_EMPTY_BACKGROUND_RANGE');
  const raw=await model.run(source,{mask,seed,signal});checkAbort(signal);
  const result=compositeGeneration(source,raw,mask,{signal});
  return generationCandidate(result,{task:'liquify-repair',seed,modelSHA256:model.modelSHA256,
    binding:sourceBinding,parameters:{rangeSource:displacement?'displacement-field':'external-explicit',subjectPixelsPreserved:true}},{signal});
}
