import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {MANUAL_HAND_TONE_VERSION,MANUAL_HAND_TONE_MAX_PIXELS} from './manual-hand-tone.mjs';

export const MANUAL_HAND_MASK_RUNTIME_VERSION='suite-owner-manual-hand-mask-runtime-1';
export {SUBJECT_MASK_MAX_WORK as MANUAL_HAND_MASK_MAX_WORK};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const PROXY_MAX_EDGE=1600,MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;

function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||(Object.getPrototypeOf(prototype)===null&&
    Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return record(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor&&Object.hasOwn(descriptor,'value');
    });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  for(let index=0;index<value.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;

function checkedDocument(document,signal){
  if(!exact(document,['schemaVersion','engineVersion','binding','handStrokes','settings'])||
      document.schemaVersion!==1||document.engineVersion!==MANUAL_HAND_TONE_VERSION)
    throw Error('MANUAL_HAND_DOCUMENT_INVALID');
  const bound=document.binding;
  if(!exact(bound,['assetID','originalSHA256','sourceWidth','sourceHeight'])||
      typeof bound.assetID!=='string'||!UUID.test(bound.assetID)||
      typeof bound.originalSHA256!=='string'||!SHA.test(bound.originalSHA256)||
      !Number.isSafeInteger(bound.sourceWidth)||bound.sourceWidth<1||
      !Number.isSafeInteger(bound.sourceHeight)||bound.sourceHeight<1||
      !Number.isSafeInteger(bound.sourceWidth*bound.sourceHeight)||
      bound.sourceWidth*bound.sourceHeight>MANUAL_HAND_TONE_MAX_PIXELS)
    throw Error('MANUAL_HAND_DOCUMENT_BINDING_INVALID');
  const settings=document.settings;
  if(!exact(settings,['strength','radiusSourcePixels'])||
      typeof settings.strength!=='number'||!Number.isFinite(settings.strength)||
      Object.is(settings.strength,-0)||settings.strength<0||settings.strength>1||
      !Number.isSafeInteger(settings.radiusSourcePixels)||
      settings.radiusSourcePixels<1||settings.radiusSourcePixels>6)
    throw Error('MANUAL_HAND_DOCUMENT_SETTINGS_INVALID');
  if(!dense(document.handStrokes,1,MAX_STROKES))
    throw Error('MANUAL_HAND_DOCUMENT_STROKES_INVALID');
  let points=0,hasAdd=false;
  const strokes=document.handStrokes.map(stroke=>{
    checkAbort(signal);
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||!dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MANUAL_HAND_DOCUMENT_STROKE_INVALID');
    points+=stroke.path.length;
    if(points>MAX_POINTS)throw Error('MANUAL_HAND_DOCUMENT_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    const path=stroke.path.map(point=>{
      if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MANUAL_HAND_DOCUMENT_POINT_INVALID');
      return Object.freeze({u:point.u,v:point.v});
    });
    return Object.freeze({operation:stroke.operation,path:Object.freeze(path),
      radiusFraction:stroke.radiusFraction,hardness:stroke.hardness});
  });
  if(!hasAdd)throw Error('MANUAL_HAND_DOCUMENT_ADD_REQUIRED');
  const safe={schemaVersion:1,engineVersion:MANUAL_HAND_TONE_VERSION,
    binding:{assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight},
    handStrokes:strokes,
    settings:{strength:settings.strength,radiusSourcePixels:settings.radiusSourcePixels}};
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_HAND_DOCUMENT_JSON_LIMIT');
  checkAbort(signal);
  return Object.freeze({binding:Object.freeze(safe.binding),strokes:Object.freeze(strokes)});
}
function checkedRuntime(binding,runtime){
  if(!exact(runtime,['assetID','originalSHA256','sourceWidth','sourceHeight','savedRevision'])||
      runtime.assetID!==binding.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      runtime.sourceWidth!==binding.sourceWidth||runtime.sourceHeight!==binding.sourceHeight)
    throw Error('MANUAL_HAND_RUNTIME_BINDING_MISMATCH');
  if(!Number.isSafeInteger(runtime.savedRevision)||runtime.savedRevision<1)
    throw Error('MANUAL_HAND_RUNTIME_REVISION_INVALID');
  return runtime;
}
function targetDimensions(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_HAND_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}
function checkedFrame(pixels){
  const hasSourceWidth=Object.hasOwn(pixels??{},'sourceWidth');
  const hasSourceHeight=Object.hasOwn(pixels??{},'sourceHeight');
  if(hasSourceWidth!==hasSourceHeight||
      !exact(pixels,hasSourceWidth?['width','height','data','sourceWidth','sourceHeight']:
        ['width','height','data']))throw Error('MANUAL_HAND_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_HAND_TONE_MAX_PIXELS)
    throw Error('MANUAL_HAND_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_HAND_SHARED_INPUT_INVALID');
  return pixels;
}

/**
 * Re-rasterize a typed saved handToneManual stroke document at its upright
 * unedited full-source frame or exact 1600px-bound proxy, with ADD/ERASE and
 * bounded geometry from the generic explicit-stroke rasterizer. Only its
 * geometry is reused: the generic `ownerConfirmed` flag passed internally
 * unlocks rasterization and is NOT proof of owner identity or hand position.
 * The returned provenance is specifically hand-tone, never a subject matte.
 * Runtime IDs, SHA and savedRevision are caller assertions, not authentication
 * or evidence that the bytes were decoded from the registered Original. An
 * external fresh host gate must establish these before Preview/Final.
 */
export function rasterizeManualHandMask(pixels,document,runtime,{target,signal}={}){
  checkAbort(signal);
  const validated=checkedDocument(document,signal);
  const bound=validated.binding,context=checkedRuntime(bound,runtime);
  const frame=checkedFrame(pixels),source=sourceDimensions(frame);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_HAND_SOURCE_DIMENSIONS_MISMATCH');
  if(target==='proxy'&&(!Object.hasOwn(frame,'sourceWidth')||
      !Object.hasOwn(frame,'sourceHeight')))
    throw Error('MANUAL_HAND_PROXY_PROVENANCE_REQUIRED');
  const expected=targetDimensions(bound,target);
  if(frame.width!==expected.width||frame.height!==expected.height)
    throw Error('MANUAL_HAND_TARGET_DIMENSIONS_MISMATCH');
  const base=authorSubjectMask(frame,validated.strokes,
    {assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      savedRevision:context.savedRevision},{ownerConfirmed:true,signal});
  checkAbort(signal);
  return Object.freeze({width:frame.width,height:frame.height,data:base.data,
    provenance:Object.freeze({kind:'manual-hand-forearm-mask',
      source:'caller-explicit-hand-forearm-strokes',assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,savedRevision:context.savedRevision,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
      target,width:frame.width,height:frame.height})});
}
