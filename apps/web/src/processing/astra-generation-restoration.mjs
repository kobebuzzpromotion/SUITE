import {checkAbort} from './pure.mjs';
import {astraFrame,astraMask,resizeAstraFrame} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationCandidate,resolutionDimensions,
  compositeGeneration} from './astra-generation-core.mjs';

/** Dedicated colorization inference (default ON) followed by a dedicated
 * restoration network for faded/yellowed/scratched/damaged/blurred photographs.
 * These are distinct model tasks, not the detail model under another name.
 * No skin-tone inference or identity-preservation claim is made here. */
export async function restoreOldPhoto(pixels,{restorationModel,colorizationModel,colorize=true,binding,
  resolution,protectionMask,seed=1,controls={},signal}={}){
  requireGenerationModel(restorationModel,'old-photo-restore');
  if(typeof colorize!=='boolean')throw Error('RESTORE_COLORIZATION_INVALID');
  if(colorize)requireGenerationModel(colorizationModel,'photo-colorize');
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),protect=astraMask(protectionMask,source);
  const requested=structuredClone(resolution),parameters=structuredClone(controls);
  const dimensions=resolutionDimensions(source,requested,['2K','4K']);
  if(dimensions.width>source.width*restorationModel.outputScale||dimensions.height>source.height*restorationModel.outputScale)
    throw Error('RESTORE_MODEL_NATIVE_SCALE_INSUFFICIENT');
  const mask=new Uint8Array(protect.length);for(let i=0;i<mask.length;i++)mask[i]=protect[i]?0:255;
  let conditioned=source;
  if(colorize){
    const color=await colorizationModel.run(source,{...(colorizationModel.masked?{mask}:{}),seed,tiled:true,signal});
    checkAbort(signal);conditioned=compositeGeneration(source,color,mask,{signal});
  }
  const raw=await restorationModel.run(conditioned,{...(restorationModel.masked?{mask}:{}),seed,controls:parameters,tiled:true,signal});
  checkAbort(signal);
  const generated=resizeAstraFrame(raw,dimensions.width,dimensions.height,{signal});
  const reference=source.width===dimensions.width&&source.height===dimensions.height?source:
    resizeAstraFrame(source,dimensions.width,dimensions.height,{signal});
  const targetMask=new Uint8Array(dimensions.width*dimensions.height);
  for(let y=0;y<dimensions.height;y++){checkAbort(signal);for(let x=0;x<dimensions.width;x++){
    const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/dimensions.width));
    const sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/dimensions.height));
    targetMask[y*dimensions.width+x]=mask[sy*source.width+sx];
  }}
  const result=compositeGeneration(reference,generated,targetMask,{signal});
  return generationCandidate(result,{task:'old-photo-restore',seed,modelSHA256:restorationModel.modelSHA256,
    binding:sourceBinding,parameters:{colorize,colorizationModelSHA256:colorize?colorizationModel.modelSHA256:null,
      resolution:{mode:requested.mode,...dimensions},controls:parameters}},{signal});
}
