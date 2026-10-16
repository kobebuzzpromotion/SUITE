import {planExportQueue, resolveExportQueuePosition} from './export-queue.mjs';
import {buildExportFilename} from './export-naming.mjs';
import {encodeDeliveryFrame} from './delta66-workflow-format.mjs';

const plans=new WeakSet();
const abort=signal=>{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');};
const key=(assetId,variantId)=>JSON.stringify([assetId,variantId]);
const nameKey=name=>name.normalize('NFC').toLocaleLowerCase('en-US');

/** Cartesian export variants, pinned to saved recipes. No implicit all-library selection.
 * Preset application/Final rendering remains in the existing authorized Final path.
 * Effect presets must produce distinct saved recipes upstream, not metadata-only variants.
 */
export function planDeliveryVariants({orderedIds,assets,variants,recipes}={}) {
  const queue=planExportQueue({orderedIds,assets});
  if(!Array.isArray(variants)||!variants.length||variants.length>16||!Array.isArray(recipes))throw Error('DELIVERY_VARIANTS_INVALID');
  const seen=new Set(), pins=new Map();
  for(const recipe of recipes){
    if(!recipe||typeof recipe.assetId!=='string'||typeof recipe.variantId!=='string'||
        !Number.isSafeInteger(recipe.version)||recipe.version<1||! /^[a-f0-9]{64}$/i.test(recipe.originalSHA256))
      throw Error('DELIVERY_RECIPE_PIN_INVALID');
    const id=key(recipe.assetId,recipe.variantId);if(pins.has(id))throw Error('DELIVERY_RECIPE_PIN_DUPLICATE');
    pins.set(id,{version:recipe.version,originalSHA256:recipe.originalSHA256.toLowerCase()});
  }
  const copies=variants.map(variant=>{
    if(!variant||typeof variant.id!=='string'||!variant.id||seen.has(variant.id)||
        typeof variant.name!=='string'||!variant.name.trim()||!variant.settings||typeof variant.settings!=='object')
      throw Error('DELIVERY_VARIANT_INVALID');
    seen.add(variant.id);return structuredClone(variant);
  });
  if(queue.length*copies.length>1000)throw Error('DELIVERY_JOB_LIMIT');
  const jobs=[];
  for(const row of queue)for(const variant of copies){
    const position=resolveExportQueuePosition({plan:queue,asset:row.asset});
    const pin=pins.get(key(row.assetId,variant.id));
    if(!pin||pin.originalSHA256!==row.asset.sha256)throw Error('DELIVERY_RECIPE_PIN_MISSING_OR_STALE');
    jobs.push(Object.freeze({id:key(row.assetId,variant.id),asset:row.asset,variant:Object.freeze(variant),
      recipeVersion:pin.version,...position}));
  }
  // Freeze nested settings so caller mutation cannot alter the queued intent.
  const frozen=new WeakSet();
  const freeze=value=>{if(value&&typeof value==='object'&&!frozen.has(value)){frozen.add(value);for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
  const result=freeze({schemaVersion:1,jobs});plans.add(result);return result;
}

/** Encodes supplied completed Final frames, never claims caller-supplied pins are authentication.
 * All results are staged; no output is published if a later item fails. This deliberately keeps
 * the existing 20-item/256 MiB batch envelope rather than claiming large-format streaming.
 */
export async function encodeDeliveryBatch(plan,frames,{existingNames=[],conflict='rename',signal}={}){
  if(!plans.has(plan)||!Array.isArray(frames)||frames.length!==plan.jobs.length||frames.length>20||
      !Array.isArray(existingNames)||existingNames.some(name=>typeof name!=='string')||
      !['rename','skip','reject'].includes(conflict))throw Error('DELIVERY_BATCH_INVALID');
  // Replace is intentionally not a browser implicit overwrite. Host atomic conditional-write
  // support + explicit user confirmation is required; rename/skip/reject are safe here.
  const inventory=new Map(),occupied=[...existingNames],outputs=[];let totalBytes=0;
  for(const frame of frames){
    if(!frame||typeof frame.jobId!=='string'||inventory.has(frame.jobId))throw Error('DELIVERY_FRAME_INVALID');
    inventory.set(frame.jobId,frame);
  }
  for(const job of plan.jobs){
    abort(signal);const input=inventory.get(job.id);
    if(!input||input.recipeVersion!==job.recipeVersion||input.originalSHA256!==job.asset.sha256)
      throw Error('DELIVERY_FINAL_FRAME_PIN_MISMATCH');
    const result=await encodeDeliveryFrame(input.pixels,{...job.variant.settings,signal});
    const naming={originalFilename:job.asset.name,format:result.format,method:'original-export-preset',
      exportPresetName:job.variant.name,sequence:job.sequence,total:job.total};
    const desired=buildExportFilename(naming),collides=occupied.some(name=>nameKey(name)===nameKey(desired));
    if(collides&&conflict==='reject')throw Error('DELIVERY_DESTINATION_CONFLICT');
    if(collides&&conflict==='skip'){outputs.push({jobId:job.id,status:'skipped',name:desired});continue;}
    const name=buildExportFilename({...naming,existingNames:occupied});occupied.push(name);
    totalBytes+=result.blob.size;
    if(totalBytes>256*1024*1024)throw Error('DELIVERY_BATCH_BYTE_LIMIT');
    outputs.push({jobId:job.id,status:'staged',name,...result});
  }
  abort(signal);return {status:'staged-not-delivered',outputs,totalBytes};
}

/** Pure persisted queue-state transition. Restored 'running' jobs require explicit retry;
 * complete only means a host supplied a delivery receipt, not an inferred OS/provider success.
 */
export function transitionDeliveryJob(state,event){
  if(!state||!['queued','running','failed','cancelled','delivered'].includes(state.status)||
      !Number.isSafeInteger(state.attempt)||state.attempt<0||!event)throw Error('DELIVERY_STATE_INVALID');
  const next=structuredClone(state);
  if(event.type==='start'&&state.status==='queued'){next.status='running';next.attempt++;}
  else if(event.type==='retry'&&['failed','cancelled','running'].includes(state.status)){next.status='queued';delete next.error;delete next.receipt;}
  else if(event.type==='cancel'&&['queued','running'].includes(state.status)){next.status='cancelled';}
  else if(event.type==='fail'&&state.status==='running'&&typeof event.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(event.code)){
    next.status='failed';next.error=event.code;
  }else if(event.type==='delivered'&&state.status==='running'&&event.receipt&&
      typeof event.receipt.destination==='string'&&event.receipt.destination&&
      /^[a-f0-9]{64}$/i.test(event.receipt.sha256)&&Number.isSafeInteger(event.receipt.bytes)&&event.receipt.bytes>0){
    next.status='delivered';next.receipt=structuredClone(event.receipt);
  }else throw Error('DELIVERY_STATE_TRANSITION_INVALID');
  return next;
}
