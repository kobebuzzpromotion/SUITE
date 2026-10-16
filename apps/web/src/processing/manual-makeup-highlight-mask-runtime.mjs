import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {MANUAL_MAKEUP_HIGHLIGHT_VERSION,MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS} from
  './manual-makeup-highlight.mjs';

export const MANUAL_MAKEUP_HIGHLIGHT_MASK_RUNTIME_VERSION=
  'suite-owner-manual-makeup-highlight-mask-runtime-1';
export {SUBJECT_MASK_MAX_WORK as MANUAL_MAKEUP_HIGHLIGHT_MASK_MAX_WORK};
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
  if(!exact(document,['schemaVersion','engineVersion','binding','highlightStrokes','settings'])||
      document.schemaVersion!==1||document.engineVersion!==MANUAL_MAKEUP_HIGHLIGHT_VERSION)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_INVALID');
  const bound=document.binding;
  if(!exact(bound,['assetID','originalSHA256','sourceWidth','sourceHeight','personID'])||
      typeof bound.assetID!=='string'||!UUID.test(bound.assetID)||
      typeof bound.originalSHA256!=='string'||!SHA.test(bound.originalSHA256)||
      typeof bound.personID!=='string'||!UUID.test(bound.personID)||
      !Number.isSafeInteger(bound.sourceWidth)||bound.sourceWidth<1||
      !Number.isSafeInteger(bound.sourceHeight)||bound.sourceHeight<1||
      bound.sourceWidth*bound.sourceHeight>MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_BINDING_INVALID');
  const settings=document.settings;
  if(!exact(settings,['intensity'])||!Number.isSafeInteger(settings.intensity)||
      settings.intensity<0||settings.intensity>100)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_SETTINGS_INVALID');
  if(!dense(document.highlightStrokes,1,MAX_STROKES))
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_STROKES_INVALID');
  let points=0,hasAdd=false;
  const strokes=document.highlightStrokes.map(stroke=>{
    checkAbort(signal);
    if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
        !['ADD','ERASE'].includes(stroke.operation)||!dense(stroke.path,1,MAX_POINTS)||
        typeof stroke.radiusFraction!=='number'||!Number.isFinite(stroke.radiusFraction)||
        stroke.radiusFraction<.001||stroke.radiusFraction>.25||!unit(stroke.hardness))
      throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_STROKE_INVALID');
    points+=stroke.path.length;
    if(points>MAX_POINTS)throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_CAPACITY');
    if(stroke.operation==='ADD')hasAdd=true;
    const path=stroke.path.map(point=>{
      if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
        throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_POINT_INVALID');
      return Object.freeze({u:point.u,v:point.v});
    });
    return Object.freeze({operation:stroke.operation,path:Object.freeze(path),
      radiusFraction:stroke.radiusFraction,hardness:stroke.hardness});
  });
  if(!hasAdd)throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_ADD_REQUIRED');
  const safe={schemaVersion:1,engineVersion:MANUAL_MAKEUP_HIGHLIGHT_VERSION,
    binding:{assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
      personID:bound.personID},highlightStrokes:strokes,
    settings:{intensity:settings.intensity}};
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_DOCUMENT_JSON_LIMIT');
  checkAbort(signal);
  return Object.freeze({binding:Object.freeze(safe.binding),
    strokes:Object.freeze(strokes),settings:Object.freeze(safe.settings)});
}

function checkedRuntime(binding,runtime){
  if(!exact(runtime,['assetID','originalSHA256','personID','sourceWidth','sourceHeight',
    'draftBaseRevision','savedRevision','ownerConfirmed'])||
      runtime.assetID!==binding.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      runtime.personID!==binding.personID||
      runtime.sourceWidth!==binding.sourceWidth||runtime.sourceHeight!==binding.sourceHeight)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_RUNTIME_BINDING_MISMATCH');
  if(!Number.isSafeInteger(runtime.draftBaseRevision)||runtime.draftBaseRevision<1||
      !Number.isSafeInteger(runtime.savedRevision)||runtime.savedRevision<1||
      runtime.draftBaseRevision!==runtime.savedRevision)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_RUNTIME_REVISION_MISMATCH');
  if(runtime.ownerConfirmed!==true)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_OWNER_INTENT_REQUIRED');
  return runtime;
}

function targetDimensions(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_MAKEUP_HIGHLIGHT_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}

/**
 * Re-rasterizes owner-intended normalized Highlight strokes independently at
 * the unedited upright source or exact 1600px Proxy. Uses the existing manual
 * brush capsule/feather/erase geometry and its 8MP/96M-work/abort limits.
 *
 * This is a pure geometry adapter, NOT authentication. `ownerConfirmed`, IDs,
 * revision and output provenance are caller assertions, not proof that the
 * strokes actually cover a facial highlight zone. A fresh authenticated host
 * must verify the real Asset, Original, person, saved Recipe and authorship
 * before product Preview/Final. It never writes Original bytes or Recipe.
 */
export function rasterizeManualMakeupHighlightMask(pixels,document,runtime,
  {target,signal}={}){
  checkAbort(signal);
  const validated=checkedDocument(document,signal);
  const bound=validated.binding,context=checkedRuntime(bound,runtime);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_CAPACITY');
  assertPixels(pixels);
  const source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_SOURCE_DIMENSIONS_MISMATCH');
  const expected=targetDimensions(bound,target);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_TARGET_DIMENSIONS_MISMATCH');
  const base=authorSubjectMask(pixels,validated.strokes,
    {assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      savedRevision:context.savedRevision},{ownerConfirmed:true,signal});
  let selected=0;
  for(let index=0;index<base.data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(base.data[index])selected++;
  }
  if(!selected||selected===base.data.length)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_MASK_AMBIGUOUS');
  checkAbort(signal);
  return Object.freeze({width:pixels.width,height:pixels.height,data:base.data,
    provenance:Object.freeze({kind:'owner-manual-makeup-highlight-mask',
      source:'owner-manual-makeup-highlight-strokes',assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,personID:bound.personID,
      savedRevision:context.savedRevision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target,width:pixels.width,height:pixels.height})});
}
