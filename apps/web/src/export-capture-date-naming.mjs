import {TrialClient} from './trial-client.mjs';
import {readTrialDngCaptureDateEvidence} from './export-capture-date-gate.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
function checkAbort(signal){
  if(signal?.aborted)throw new DOMException('Capture-date naming cancelled','AbortError');
}
function exact(value,keys){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
    Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor&&Object.hasOwn(descriptor,'value');
    });
}
function recipeJSON(value){
  const seen=new WeakSet();let nodes=0;
  function copy(item,depth){
    if(++nodes>100000||depth>64)throw Error('CAPTURE_DATE_NAMING_RECIPE_INVALID');
    if(item===null||typeof item==='string'||typeof item==='boolean')return item;
    if(typeof item==='number'&&Number.isFinite(item))return item;
    if(typeof item!=='object'||seen.has(item))throw Error('CAPTURE_DATE_NAMING_RECIPE_INVALID');
    seen.add(item);
    if(Array.isArray(item)){
      if(Reflect.ownKeys(item).length!==item.length+1||
          !Array.from({length:item.length},(_,index)=>Object.hasOwn(item,index)).every(Boolean))
        throw Error('CAPTURE_DATE_NAMING_RECIPE_INVALID');
      return item.map(child=>copy(child,depth+1));
    }
    const keys=Reflect.ownKeys(item);
    if(keys.some(key=>typeof key!=='string')||!exact(item,keys))
      throw Error('CAPTURE_DATE_NAMING_RECIPE_INVALID');
    const ordered={};
    for(const key of keys.sort()){
      ordered[key]=copy(item[key],depth+1);
    }
    return ordered;
  }
  const encoded=JSON.stringify(copy(value,0));
  if(encoded.length>2_000_000)throw Error('CAPTURE_DATE_NAMING_RECIPE_INVALID');
  return encoded;
}
async function abortable(task,signal){
  checkAbort(signal);
  if(!signal)return task();
  let onAbort;
  const cancelled=new Promise((_,reject)=>{
    onAbort=()=>reject(new DOMException('Capture-date naming cancelled','AbortError'));
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
  });
  try{
    const value=await Promise.race([Promise.resolve().then(task),cancelled]);
    checkAbort(signal);return value;
  }finally{signal.removeEventListener('abort',onAbort);}
}
function savedMatches(saved,binding,bodyJSON){
  if(!saved||saved.revision!==binding.savedRevision||
      recipeJSON(saved.body)!==bodyJSON)
    throw Error('CAPTURE_DATE_NAMING_SAVED_RECIPE_MISMATCH');
}
function wallDate(evidence){
  if(evidence?.sourceContainer!=='DNG_VERSION_SIGNALLED_CLASSIC_TIFF_EXIF_IFD_SUBSET'||
      evidence.dateSource!=='EXIF_DateTimeOriginal_0x9003'||
      evidence.offsetEvidence!=='EXIF_OffsetTimeOriginal_0x9011'||
      !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(evidence.offsetTimeOriginal)||
      typeof evidence.dateTimeOriginal!=='string'||
      !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(evidence.dateTimeOriginal)||
      evidence.calendarDateOriginal!==evidence.dateTimeOriginal.slice(0,10).replaceAll(':',''))
    throw Error('CAPTURE_DATE_NAMING_EVIDENCE_UNAVAILABLE');
  const compact=evidence.calendarDateOriginal;
  return `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
}

/**
 * Read a fresh, authenticated Trial DNG Original and derive only its Exif
 * DateTimeOriginal wall calendar date. An explicit OffsetTimeOriginal is
 * required as evidence but is not used to shift the day or infer a timezone.
 * The returned input is bound to this Asset/SHA/Recipe revision; Final export
 * must independently re-authorize. Synthetic DNG does not prove camera-clock
 * truth, general RAW support, or that the file is decodable.
 */
export async function readTrialDngCaptureDateNamingInput(options){
  if(!exact(options,['api','state'])&&!exact(options,['api','state','signal']))
    throw Error('CAPTURE_DATE_NAMING_INPUT_INVALID');
  const {api,state,signal}=options;
  if(!(api instanceof TrialClient)||!state||typeof state!=='object'||
      state.dirty!==false||!Number.isSafeInteger(state.revision)||
      state.revision<1||!state.asset||
      typeof state.asset.id!=='string'||!UUID.test(state.asset.id)||
      typeof state.asset.sha256!=='string'||!SHA.test(state.asset.sha256)||
      (signal!==undefined&&(signal===null||typeof signal.aborted!=='boolean'||
        typeof signal.addEventListener!=='function'||
        typeof signal.removeEventListener!=='function')))
    throw Error('CAPTURE_DATE_NAMING_INPUT_INVALID');
  const binding=Object.freeze({assetID:state.asset.id.toLowerCase(),
    originalSHA256:state.asset.sha256.toLowerCase(),savedRevision:state.revision});
  const bodyJSON=recipeJSON(state.recipe);
  checkAbort(signal);
  savedMatches(await abortable(()=>api.getRecipe(binding.assetID),signal),binding,bodyJSON);
  const gate=await readTrialDngCaptureDateEvidence({api,binding,...(signal?{signal}:{})});
  if(gate.verification!=='TRIAL_FRESH_EXPORT_READ_ONLY_NOT_NAMING_AUTHORITY'||
      gate.binding.assetID!==binding.assetID||
      gate.binding.originalSHA256!==binding.originalSHA256||
      gate.binding.savedRevision!==binding.savedRevision||
      gate.evidence.sourceAssetID!==binding.assetID||
      gate.evidence.sourceSHA256!==binding.originalSHA256)
    throw Error('CAPTURE_DATE_NAMING_BINDING_MISMATCH');
  const captureDate=wallDate(gate.evidence);
  savedMatches(await abortable(()=>api.getRecipe(binding.assetID),signal),binding,bodyJSON);
  if(state.dirty!==false||state.revision!==binding.savedRevision||
      state.asset?.id?.toLowerCase()!==binding.assetID||
      state.asset?.sha256?.toLowerCase()!==binding.originalSHA256||
      recipeJSON(state.recipe)!==bodyJSON)
    throw Error('CAPTURE_DATE_NAMING_STATE_CHANGED');
  checkAbort(signal);
  return Object.freeze({binding,namingInput:Object.freeze({method:'capture-date-original',
    captureDate}),verification:'TRIAL_DNG_EXIF_WALL_DATE_WITH_OFFSET_NOT_FINAL_AUTHORITY'});
}
