import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {applyManualEyeliner,MANUAL_EYELINER_MAX_PIXELS,
  MANUAL_EYELINER_VERSION} from './manual-eyeliner-line.mjs';

export const MANUAL_EYELINER_RUNTIME_VERSION='suite-owner-manual-eyeliner-runtime-1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const PROXY_MAX_EDGE=1600;

function plain(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||(Object.getPrototypeOf(prototype)===null&&
    Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return plain(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
    });
}
function checkedRuntime(value){
  if(!exact(value,['assetID','originalSHA256','personID',
    'sourceWidth','sourceHeight','savedRevision'])||
      typeof value.assetID!=='string'||!UUID.test(value.assetID)||
      typeof value.originalSHA256!=='string'||!SHA.test(value.originalSHA256)||
      typeof value.personID!=='string'||!UUID.test(value.personID)||
      !Number.isSafeInteger(value.sourceWidth)||value.sourceWidth<1||
      !Number.isSafeInteger(value.sourceHeight)||value.sourceHeight<1||
      !Number.isSafeInteger(value.sourceWidth*value.sourceHeight)||
      value.sourceWidth*value.sourceHeight>MANUAL_EYELINER_MAX_PIXELS||
      !Number.isSafeInteger(value.savedRevision)||value.savedRevision<1)
    throw Error('MANUAL_EYELINER_RUNTIME_INVALID');
  return value;
}
function expectedDimensions(runtime,target){
  if(target==='source')return {width:runtime.sourceWidth,height:runtime.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_EYELINER_RUNTIME_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(runtime.sourceWidth,runtime.sourceHeight));
  return {width:Math.max(1,Math.round(runtime.sourceWidth*scale)),
    height:Math.max(1,Math.round(runtime.sourceHeight*scale))};
}
function checkedFrame(pixels,target,runtime){
  const keys=target==='proxy'?
    ['width','height','data','sourceWidth','sourceHeight']:
    ['width','height','data'];
  if(!exact(pixels,keys))throw Error('MANUAL_EYELINER_RUNTIME_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_EYELINER_MAX_PIXELS)
    throw Error('MANUAL_EYELINER_RUNTIME_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_EYELINER_RUNTIME_SHARED_INPUT_INVALID');
  const source=sourceDimensions(pixels),expected=expectedDimensions(runtime,target);
  if(source.width!==runtime.sourceWidth||source.height!==runtime.sourceHeight||
      pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_EYELINER_RUNTIME_DIMENSIONS_MISMATCH');
  return pixels;
}

/**
 * Projects an already-saved typed manual eye-edge document onto a caller's
 * upright, unedited source frame or exact 1600px-bound Proxy frame. The pure
 * renderer revalidates every vertex, the optional connected wing, work cap,
 * context and abort signal. This wrapper checks frame shape and provenance
 * claims before calling it and returns freshly allocated pixels.
 *
 * IDs, SHA, personID, savedRevision and source dimensions supplied here are
 * structural claims, not proof of current actor permission, detected eye,
 * actual Original bytes or genuine decode. A fresh authenticated product
 * host must establish those before Preview/Final; this is not wired there.
 */
export function renderSavedManualEyeliner(pixels,document,runtime,{target,signal}={}){
  checkAbort(signal);
  const context=checkedRuntime(runtime);
  if(target!=='source'&&target!=='proxy')
    throw Error('MANUAL_EYELINER_RUNTIME_TARGET_INVALID');
  const frame=checkedFrame(pixels,target,context);
  const output=applyManualEyeliner(frame,document,
    {assetID:context.assetID,originalSHA256:context.originalSHA256,
      personID:context.personID,sourceWidth:context.sourceWidth,
      sourceHeight:context.sourceHeight,savedRevision:context.savedRevision,
      target},{signal});
  checkAbort(signal);
  return Object.freeze({pixels:output,provenance:Object.freeze({
    kind:'manual-eyeliner-lid-line',engineVersion:MANUAL_EYELINER_VERSION,
    source:'caller-asserted-saved-manual-document',assetID:context.assetID,
    originalSHA256:context.originalSHA256,personID:context.personID,
    savedRevision:context.savedRevision,sourceWidth:context.sourceWidth,
    sourceHeight:context.sourceHeight,target,width:output.width,height:output.height})});
}
