import {EditorSession} from './session.mjs';
import {TrialClient} from './trial-client.mjs';
import {readTrialDngCaptureDateNamingInput} from './export-capture-date-naming.mjs';
import {buildExportFilename} from './export-naming.mjs';

const MIME=Object.freeze({jpeg:'image/jpeg',png:'image/png',tiff:'image/tiff'});
const EXPORT_KEYS=new Set(['format','quality','size','resolution','outputSharpening']);

function checkAbort(signal){
  if(signal?.aborted)throw new DOMException('Capture-date Final cancelled','AbortError');
}
function plain(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function fixedState(session,api){
  if(session.api!==api)throw Error('CAPTURE_DATE_FINAL_API_CHANGED');
  const state=session.state;
  if(!state||state.dirty!==false||state.busy||state.exporting||
      !state.asset||typeof state.asset.name!=='string'||
      !Number.isSafeInteger(state.asset.size)||state.asset.size<1)
    throw Error('CAPTURE_DATE_FINAL_STATE_UNAVAILABLE');
  return {state,identity:JSON.stringify({assetID:state.asset.id,
    originalSHA256:state.asset.sha256,name:state.asset.name,size:state.asset.size,
    revision:state.revision,recipe:state.recipe})};
}
function assertSameState(session,api,identity){
  const current=fixedState(session,api);
  if(current.identity!==identity)throw Error('CAPTURE_DATE_FINAL_STATE_CHANGED');
  return current.state;
}

/**
 * Trial-only, saved single-Asset DNG capture-date Final. The returned Blob is
 * offered to the caller only after two fresh authenticated Exif/Original gates,
 * with EditorSession's own Final checks in between. No download is started.
 * The DNG test decoder is synthetic; this does not establish real RAW QA,
 * camera-clock truth, general RAW support, or atomicity after return.
 */
export async function exportTrialDngCaptureDateFinal(options){
  if(!plain(options)||Reflect.ownKeys(options).some(key=>
      !['api','session','exportOptions','existingNames','signal'].includes(key)))
    throw Error('CAPTURE_DATE_FINAL_INPUT_INVALID');
  const {api,session,exportOptions={},existingNames=[],signal}=options;
  if(!(api instanceof TrialClient)||!(session instanceof EditorSession)||
      session.api!==api||!plain(exportOptions)||
      Reflect.ownKeys(exportOptions).some(key=>!EXPORT_KEYS.has(key))||
      (signal!==undefined&&(signal===null||typeof signal.aborted!=='boolean'||
        typeof signal.addEventListener!=='function'||
        typeof signal.removeEventListener!=='function')))
    throw Error('CAPTURE_DATE_FINAL_INPUT_INVALID');
  const format=exportOptions.format??'jpeg';
  if(!Object.hasOwn(MIME,format))throw Error('CAPTURE_DATE_FINAL_FORMAT_UNSUPPORTED');
  checkAbort(signal);
  const {state,identity}=fixedState(session,api);
  const before=await readTrialDngCaptureDateNamingInput({api,state,...(signal?{signal}:{})});
  checkAbort(signal);
  assertSameState(session,api,identity);
  const filename=buildExportFilename({originalFilename:state.asset.name,format,
    ...before.namingInput,existingNames});
  assertSameState(session,api,identity);

  // EditorSession owns the Final AbortController. The external signal only
  // requests cancellation of this export; await settlement before returning.
  let onAbort;
  if(signal){
    onAbort=()=>session.cancelExport();
    signal.addEventListener('abort',onAbort,{once:true});
  }
  let blob;
  try{
    checkAbort(signal);
    blob=await session.exportFinal(exportOptions);
  }finally{if(signal)signal.removeEventListener('abort',onAbort);}
  checkAbort(signal);
  if(!(blob instanceof Blob)||blob.type!==MIME[format]||
      !Number.isSafeInteger(blob.size)||blob.size<1)
    throw Error('CAPTURE_DATE_FINAL_BLOB_INVALID');
  const afterState=assertSameState(session,api,identity);
  const after=await readTrialDngCaptureDateNamingInput({api,state:afterState,
    ...(signal?{signal}:{})});
  checkAbort(signal);
  assertSameState(session,api,identity);
  if(after.binding.assetID!==before.binding.assetID||
      after.binding.originalSHA256!==before.binding.originalSHA256||
      after.binding.savedRevision!==before.binding.savedRevision||
      after.namingInput.captureDate!==before.namingInput.captureDate)
    throw Error('CAPTURE_DATE_FINAL_EVIDENCE_CHANGED');
  return Object.freeze({blob,filename,format,binding:before.binding,
    captureDate:before.namingInput.captureDate,
    verification:'TRIAL_DNG_SYNTHETIC_RAW_QA_NOT_PROVEN'});
}
