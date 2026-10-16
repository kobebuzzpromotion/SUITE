import {checkAbort} from './pure.mjs';
import {astraFrame} from './astra-image-model.mjs';
import {generateDetailEnhance} from './astra-generation-detail.mjs';
import {restoreOldPhoto} from './astra-generation-restoration.mjs';
import {generationBinding} from './astra-generation-core.mjs';

/** Actual per-image generation, not copied Recipe settings. Scope is the two
 * supported AI Lab batch tasks; no generic batch support is inferred for others.
 * Returns per-item results/errors; performs no writes, charges or permission grants.
 * Explicit source/parameters are snapshotted before awaits and never reused across
 * photographs. Already completed results survive later cancellation or failure. */
export async function generateRestorationBatch(items,{task,model,colorizationModel,signal}={}){
  if(!['detail-enhance','old-photo-restore'].includes(task)||!Array.isArray(items)||!items.length||items.length>20)
    throw Error('GENERATION_BATCH_INVALID');
  // Bound total retained source frames as well as the per-image runtime limit.
  if(items.reduce((n,item)=>n+(item?.pixels?.width||0)*(item?.pixels?.height||0),0)>24_000_000)
    throw Error('GENERATION_BATCH_CAPACITY');
  const sources=items.map(item=>({pixels:astraFrame(item.pixels),binding:generationBinding(item.binding),
    options:structuredClone(item.options||{})}));
  if(new Set(sources.map(item=>item.binding.assetID)).size!==sources.length)throw Error('GENERATION_BATCH_DUPLICATE_SOURCE');
  const rows=[];
  for(let index=0;index<sources.length;index++){
    if(signal?.aborted){for(let i=index;i<sources.length;i++)rows.push({index:i,status:'cancelled'});break;}
    const item=sources[index];
    try{
      checkAbort(signal);
      const result=task==='detail-enhance'?
        await generateDetailEnhance(item.pixels,{...item.options,model,binding:item.binding,signal}):
        await restoreOldPhoto(item.pixels,{...item.options,restorationModel:model,colorizationModel,binding:item.binding,signal});
      rows.push({index,status:'generated',source:item.binding,result});
    }catch(error){rows.push({index,status:signal?.aborted?'cancelled':'failed',source:item.binding,
      error:typeof error?.message==='string'?error.message:'GENERATION_FAILED'});}
  }
  return rows;
}
