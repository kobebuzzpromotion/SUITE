import {checkAbort} from './pure.mjs';
import {astraFrame,astraMask,resizeAstraFrame} from './astra-image-model.mjs';
export function requireGenerationModel(model,task,{masked=false,stochastic=false}={}){
  if(!model||model.task!==task||typeof model.run!=='function'||!/^[a-f0-9]{64}$/i.test(model.modelSHA256||'')||
    (masked&&!model.masked)||(stochastic&&!model.stochastic))throw Error('GENERATION_TASK_MODEL_REQUIRED');
}
export function generationBinding(value){
  if(!value||typeof value.assetID!=='string'||!/^[a-f0-9-]{36}$/i.test(value.assetID)||
    !/^[a-f0-9]{64}$/i.test(value.originalSHA256||'')||!Number.isSafeInteger(value.recipeRevision)||value.recipeRevision<1)
    throw Error('GENERATION_SOURCE_BINDING_REQUIRED');
  return {assetID:value.assetID,originalSHA256:value.originalSHA256.toLowerCase(),recipeRevision:value.recipeRevision};
}
export function generationSeeds(seeds,count){
  if(!Array.isArray(seeds)||seeds.length!==count||new Set(seeds).size!==count||
    seeds.some(s=>!Number.isInteger(s)||s<0||s>4294967295))throw Error('GENERATION_DISTINCT_SEEDS_REQUIRED');
  return [...seeds];
}
export function compositeGeneration(source,generated,mask,{signal}={}){
  const original=astraFrame(source,40_000_000),coverage=astraMask(mask,source);
  const rendered=generated.width===source.width&&generated.height===source.height?
    astraFrame(generated,40_000_000):resizeAstraFrame(generated,source.width,source.height,{signal});
  for(let i=0;i<coverage.length;i++){
    if((i&16383)===0)checkAbort(signal);
    const at=i*4;if(!original.data[at+3]||!coverage[i])continue;
    const w=coverage[i]/255;for(let c=0;c<3;c++)original.data[at+c]=Math.round(original.data[at+c]*(1-w)+rendered.data[at+c]*w);
  }
  return original;
}
export function protectedGenerationMask(mask,protection,pixels){
  const selected=astraMask(mask,pixels),protectedPixels=astraMask(protection,pixels);
  for(let i=0;i<selected.length;i++)if(protectedPixels[i]||!pixels.data[i*4+3])selected[i]=0;
  return selected;
}
export function resolutionDimensions(source,resolution,allowed){
  if(!resolution||!allowed.includes(resolution.mode))throw Error('GENERATION_RESOLUTION_MODE_INVALID');
  if(resolution.mode==='no-upscale')return {width:source.width,height:source.height};
  // K is deliberately not guessed: host supplies explicit approved dimensions.
  const {width,height}=resolution;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width*height>40_000_000||Math.max(width,height)>8192||Math.abs(width/height-source.width/source.height)>2/Math.min(width,height))
    throw Error('GENERATION_RESOLUTION_DIMENSIONS_INVALID');
  return {width,height};
}
export async function generationCandidate(pixels,{task,seed,modelSHA256,binding,parameters},{signal}={}){
  checkAbort(signal);const snapshot=astraFrame(pixels,40_000_000);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',snapshot.data)),v=>v.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);
  return {pixels:snapshot,manifest:Object.freeze({schemaVersion:1,task,seed,modelSHA256,
    source:Object.freeze(generationBinding(binding)),parameters:structuredClone(parameters),
    width:snapshot.width,height:snapshot.height,pixelSHA256:digest,
    resultKind:'new-generated-image',authorization:'not-attested'})};
}
/** Select one or all already-generated candidates for a future authorised save.
 * Rehash pixels to reject changed buffers; never regenerate at Final. No writes. */
export async function selectGeneratedCandidates(candidates,indices,{signal}={}){
  if(!Array.isArray(candidates)||!candidates.length||candidates.length>20||!Array.isArray(indices)||
    !indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=candidates.length))
    throw Error('GENERATION_SELECTION_INVALID');
  const selected=[];
  for(const index of indices){checkAbort(signal);const c=candidates[index],pixels=astraFrame(c.pixels,40_000_000);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.data)),v=>v.toString(16).padStart(2,'0')).join('');
    if(digest!==c.manifest?.pixelSHA256||pixels.width!==c.manifest.width||pixels.height!==c.manifest.height)
      throw Error('GENERATION_CANDIDATE_CHANGED');
    selected.push({pixels,manifest:structuredClone(c.manifest)});
  }
  checkAbort(signal);return selected;
}
