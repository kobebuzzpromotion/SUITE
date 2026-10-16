import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {MANUAL_TEETH_WHITENING_VERSION,MANUAL_TEETH_MAX_PIXELS} from
  './manual-teeth-whitening.mjs';

export const MANUAL_TEETH_MASK_RUNTIME_VERSION='suite-owner-manual-teeth-mask-runtime-1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const PROXY_MAX_EDGE=1600;
const MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;

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
  for(let i=0;i<value.length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;

function checkedDocument(document,signal){
  if(!exact(document,['schemaVersion','engineVersion','binding','teethStrokes','settings'])||
      document.schemaVersion!==1||document.engineVersion!==MANUAL_TEETH_WHITENING_VERSION)
    throw Error('MANUAL_TEETH_DOCUMENT_INVALID');
  const bound=document.binding;
  if(!exact(bound,['assetID','originalSHA256','sourceWidth','sourceHeight','personID'])||
      typeof bound.assetID!=='string'||!UUID.test(bound.assetID)||
      typeof bound.originalSHA256!=='string'||!SHA.test(bound.originalSHA256)||
      typeof bound.personID!=='string'||!UUID.test(bound.personID)||
      !Number.isSafeInteger(bound.sourceWidth)||bound.sourceWidth<1||
      !Number.isSafeInteger(bound.sourceHeight)||bound.sourceHeight<1||
      bound.sourceWidth*bound.sourceHeight>MANUAL_TEETH_MAX_PIXELS)
    throw Error('MANUAL_TEETH_DOCUMENT_BINDING_INVALID');
  const settings=document.settings;
  if(!exact(settings,['brightness','desaturation'])||
      typeof settings.brightness!=='number'||!Number.isFinite(settings.brightness)||
      settings.brightness< -100||settings.brightness>100||
      typeof settings.desaturation!=='number'||!Number.isFinite(settings.desaturation)||
      settings.desaturation<0||settings.desaturation>100)
    throw Error('MANUAL_TEETH_DOCUMENT_SETTINGS_INVALID');
  if(!dense(document.teethStrokes,1,MAX_STROKES))
    throw Error('MANUAL_TEETH_DOCUMENT_STROKES_INVALID');
  let points=0,hasAdd=false;
  const strokes=document.teethStrokes.map(stroke=>{
    checkAbort(signal);
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||!dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MANUAL_TEETH_DOCUMENT_STROKE_INVALID');
    points+=stroke.path.length;
    if(points>MAX_POINTS)throw Error('MANUAL_TEETH_DOCUMENT_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    const path=stroke.path.map(point=>{
      if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MANUAL_TEETH_DOCUMENT_POINT_INVALID');
      return Object.freeze({u:point.u,v:point.v});
    });
    return Object.freeze({operation:stroke.operation,path:Object.freeze(path),
      radiusFraction:stroke.radiusFraction,hardness:stroke.hardness});
  });
  if(!hasAdd)throw Error('MANUAL_TEETH_DOCUMENT_ADD_REQUIRED');
  const safe={schemaVersion:1,engineVersion:MANUAL_TEETH_WHITENING_VERSION,
    binding:{assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
      personID:bound.personID},teethStrokes:strokes,
    settings:{brightness:settings.brightness,desaturation:settings.desaturation}};
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_TEETH_DOCUMENT_JSON_LIMIT');
  checkAbort(signal);
  return Object.freeze({binding:Object.freeze(safe.binding),strokes:Object.freeze(strokes),
    settings:Object.freeze(safe.settings)});
}

function checkedRuntime(binding,runtime){
  if(!exact(runtime,['assetID','originalSHA256','personID','sourceWidth','sourceHeight',
    'draftBaseRevision','savedRevision','ownerConfirmed'])||
      runtime.assetID!==binding.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      runtime.personID!==binding.personID||
      runtime.sourceWidth!==binding.sourceWidth||runtime.sourceHeight!==binding.sourceHeight)
    throw Error('MANUAL_TEETH_RUNTIME_BINDING_MISMATCH');
  if(!Number.isSafeInteger(runtime.draftBaseRevision)||runtime.draftBaseRevision<1||
      !Number.isSafeInteger(runtime.savedRevision)||runtime.savedRevision<1||
      runtime.draftBaseRevision!==runtime.savedRevision)
    throw Error('MANUAL_TEETH_RUNTIME_REVISION_MISMATCH');
  if(runtime.ownerConfirmed!==true)
    throw Error('MANUAL_TEETH_OWNER_INTENT_REQUIRED');
  return runtime;
}

function targetDimensions(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_TEETH_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}

/**
 * Re-rasterize a saved, normalized owner-intended stroke document for either
 * the unedited upright source or makeProxyPixels()'s exact 1600px proxy.
 * This is a pure geometry adapter, NOT authentication: ownerConfirmed,
 * identifiers, revision and output provenance are caller assertions. A fresh
 * authenticated host must verify real Asset/Original/person/revision/authoring
 * authority before this mask can enter any product Worker, Preview or Final.
 * No tooth detection, AI repair, Original mutation or Recipe save occurs here.
 */
export function rasterizeManualTeethMask(pixels,document,runtime,{target,signal}={}){
  checkAbort(signal);
  const validated=checkedDocument(document,signal);
  const bound=validated.binding,context=checkedRuntime(bound,runtime);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_TEETH_MAX_PIXELS)
    throw Error('MANUAL_TEETH_CAPACITY');
  assertPixels(pixels);
  const source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_TEETH_SOURCE_DIMENSIONS_MISMATCH');
  const expected=targetDimensions(bound,target);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_TEETH_TARGET_DIMENSIONS_MISMATCH');
  // authorSubjectMask owns the normalized capsule/feather/erase geometry,
  // alpha-zero suppression, 8MP, 96M-work and in-flight abort checks.
  const base=authorSubjectMask(pixels,validated.strokes,
    {assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      savedRevision:context.savedRevision},{ownerConfirmed:true,signal});
  let selected=0;
  for(let index=0;index<base.data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(base.data[index])selected++;
  }
  if(!selected||selected===base.data.length)throw Error('MANUAL_TEETH_MASK_AMBIGUOUS');
  checkAbort(signal);
  return Object.freeze({width:pixels.width,height:pixels.height,data:base.data,
    provenance:Object.freeze({kind:'owner-manual-teeth-mask',
      source:'owner-manual-teeth-strokes',assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,personID:bound.personID,
      savedRevision:context.savedRevision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target,width:pixels.width,height:pixels.height})});
}

export {SUBJECT_MASK_MAX_WORK as MANUAL_TEETH_MASK_MAX_WORK};
