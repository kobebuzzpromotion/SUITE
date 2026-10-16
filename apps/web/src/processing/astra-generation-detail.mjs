import {checkAbort} from './pure.mjs';
import {astraFrame,astraMask,resizeAstraFrame} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationCandidate,resolutionDimensions,
  compositeGeneration} from './astra-generation-core.mjs';

export function detailResolutionOptions(pixels,model,dimensionCatalog){
  const source=astraFrame(pixels);requireGenerationModel(model,'detail-enhance');
  if(!dimensionCatalog||typeof dimensionCatalog!=='object')throw Error('DETAIL_DIMENSION_CATALOG_REQUIRED');
  const options=[{mode:'no-upscale',width:source.width,height:source.height}];
  for(const mode of ['2K','4K','6K']){
    if(!Object.hasOwn(dimensionCatalog,mode))continue;
    const requested={mode,...dimensionCatalog[mode]};
    try{
      const d=resolutionDimensions(source,requested,[mode]);
      if(d.width<=source.width*model.outputScale&&d.height<=source.height*model.outputScale)
        options.push({mode,...d});
    }catch(error){if(error?.message!=='GENERATION_RESOLUTION_DIMENSIONS_INVALID')throw error;}
  }
  return options;
}
/** Run a task-trained detail model on overlapping context tiles. Native learned
 * output must be at least the requested dimensions; ordinary interpolation is
 * never counted as model upscale. K labels require explicit host dimensions.
 * Ordinary Detail/Sharpen controls and the original source remain untouched. */
export async function generateDetailEnhance(pixels,{model,binding,resolution={mode:'no-upscale'},
  protectionMask,seed=1,controls={},signal}={}){
  requireGenerationModel(model,'detail-enhance');
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),protect=astraMask(protectionMask,source);
  const requested=structuredClone(resolution),parameters=structuredClone(controls);
  const dimensions=resolutionDimensions(source,requested,['no-upscale','2K','4K','6K']);
  if(dimensions.width>source.width*model.outputScale||dimensions.height>source.height*model.outputScale)
    throw Error('DETAIL_MODEL_NATIVE_SCALE_INSUFFICIENT');
  const mask=new Uint8Array(protect.length);for(let i=0;i<mask.length;i++)mask[i]=protect[i]?0:255;
  const raw=await model.run(source,{...(model.masked?{mask}:{}),seed,controls:parameters,tiled:true,signal});checkAbort(signal);
  const generated=raw.width===dimensions.width&&raw.height===dimensions.height?raw:
    resizeAstraFrame(raw,dimensions.width,dimensions.height,{signal});
  const reference=source.width===dimensions.width&&source.height===dimensions.height?source:
    resizeAstraFrame(source,dimensions.width,dimensions.height,{signal});
  const targetMask=new Uint8Array(dimensions.width*dimensions.height);
  for(let y=0;y<dimensions.height;y++){checkAbort(signal);for(let x=0;x<dimensions.width;x++){
    const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/dimensions.width));
    const sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/dimensions.height));
    targetMask[y*dimensions.width+x]=mask[sy*source.width+sx];
  }}
  const result=compositeGeneration(reference,generated,targetMask,{signal});
  return generationCandidate(result,{task:'detail-enhance',seed,modelSHA256:model.modelSHA256,
    binding:sourceBinding,parameters:{resolution:{mode:requested.mode,...dimensions},
      nativeInferenceWidth:raw.width,nativeInferenceHeight:raw.height,controls:parameters}},{signal});
}
