import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {MANUAL_CONTACTS_IRIS_COLOR_VERSION,MANUAL_CONTACTS_MAX_PIXELS} from
  './manual-contacts-iris-color.mjs';

export const MANUAL_CONTACTS_MASK_RUNTIME_VERSION='suite-manual-contacts-mask-runtime-1';
export {SUBJECT_MASK_MAX_WORK as MANUAL_CONTACTS_MASK_MAX_WORK};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
      return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
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
  if(!exact(document,['schemaVersion','engineVersion','binding',
    'irisRingStrokes','pupilExclusionStrokes','settings'])||
      document.schemaVersion!==1||
      document.engineVersion!==MANUAL_CONTACTS_IRIS_COLOR_VERSION)
    throw Error('MANUAL_CONTACTS_DOCUMENT_INVALID');
  const bound=document.binding;
  if(!exact(bound,['assetID','originalSHA256','personID','eye',
    'sourceWidth','sourceHeight'])||
      typeof bound.assetID!=='string'||!UUID.test(bound.assetID)||
      typeof bound.originalSHA256!=='string'||!SHA.test(bound.originalSHA256)||
      typeof bound.personID!=='string'||!UUID.test(bound.personID)||
      !['left','right'].includes(bound.eye)||
      !Number.isSafeInteger(bound.sourceWidth)||bound.sourceWidth<1||
      !Number.isSafeInteger(bound.sourceHeight)||bound.sourceHeight<1||
      !Number.isSafeInteger(bound.sourceWidth*bound.sourceHeight)||
      bound.sourceWidth*bound.sourceHeight>MANUAL_CONTACTS_MAX_PIXELS)
    throw Error('MANUAL_CONTACTS_DOCUMENT_BINDING_INVALID');
  const settings=document.settings;
  if(!exact(settings,['color','amount'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(key=>Number.isSafeInteger(settings.color[key])&&
        settings.color[key]>=0&&settings.color[key]<=255)||
      !unit(settings.amount)||Object.is(settings.amount,-0))
    throw Error('MANUAL_CONTACTS_DOCUMENT_SETTINGS_INVALID');
  let strokeCount=0,pointCount=0;
  const copyStrokes=(value,role)=>{
    if(!dense(value,1,MAX_STROKES))
      throw Error(`MANUAL_CONTACTS_${role}_STROKES_INVALID`);
    let hasAdd=false;
    const strokes=value.map(stroke=>{
      checkAbort(signal);
      if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
          !['ADD','ERASE'].includes(stroke.operation)||
          !dense(stroke.path,1,MAX_POINTS)||
          typeof stroke.radiusFraction!=='number'||
          !Number.isFinite(stroke.radiusFraction)||
          stroke.radiusFraction<.001||stroke.radiusFraction>.25||
          !unit(stroke.hardness))
        throw Error(`MANUAL_CONTACTS_${role}_STROKE_INVALID`);
      strokeCount++;pointCount+=stroke.path.length;
      if(strokeCount>MAX_STROKES||pointCount>MAX_POINTS)
        throw Error('MANUAL_CONTACTS_DOCUMENT_CAPACITY');
      if(stroke.operation==='ADD')hasAdd=true;
      const path=stroke.path.map(point=>{
        if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
          throw Error(`MANUAL_CONTACTS_${role}_POINT_INVALID`);
        return Object.freeze({u:point.u,v:point.v});
      });
      return Object.freeze({operation:stroke.operation,path:Object.freeze(path),
        radiusFraction:stroke.radiusFraction,hardness:stroke.hardness});
    });
    if(!hasAdd)throw Error(`MANUAL_CONTACTS_${role}_ADD_REQUIRED`);
    return Object.freeze(strokes);
  };
  const ring=copyStrokes(document.irisRingStrokes,'RING');
  const pupil=copyStrokes(document.pupilExclusionStrokes,'PUPIL');
  const safe={schemaVersion:1,engineVersion:MANUAL_CONTACTS_IRIS_COLOR_VERSION,
    binding:{assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      personID:bound.personID,eye:bound.eye,
      sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight},
    irisRingStrokes:ring,pupilExclusionStrokes:pupil,
    settings:{color:{r:settings.color.r,g:settings.color.g,b:settings.color.b},
      amount:settings.amount}};
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_CONTACTS_DOCUMENT_JSON_LIMIT');
  checkAbort(signal);
  return Object.freeze({binding:Object.freeze(safe.binding),ring,pupil});
}
function checkedRuntime(binding,runtime){
  if(!exact(runtime,['assetID','originalSHA256','personID','eye',
    'sourceWidth','sourceHeight','savedRevision'])||
      runtime.assetID!==binding.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==binding.originalSHA256.toLowerCase()||
      runtime.personID!==binding.personID||runtime.eye!==binding.eye||
      runtime.sourceWidth!==binding.sourceWidth||
      runtime.sourceHeight!==binding.sourceHeight)
    throw Error('MANUAL_CONTACTS_RUNTIME_BINDING_MISMATCH');
  if(!Number.isSafeInteger(runtime.savedRevision)||runtime.savedRevision<1)
    throw Error('MANUAL_CONTACTS_RUNTIME_REVISION_INVALID');
  return runtime;
}
function targetDimensions(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_CONTACTS_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}
function checkedFrame(pixels){
  const hasSourceWidth=Object.hasOwn(pixels??{},'sourceWidth');
  const hasSourceHeight=Object.hasOwn(pixels??{},'sourceHeight');
  if(hasSourceWidth!==hasSourceHeight||
      !exact(pixels,hasSourceWidth?['width','height','data',
        'sourceWidth','sourceHeight']:['width','height','data']))
    throw Error('MANUAL_CONTACTS_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_CONTACTS_MAX_PIXELS)
    throw Error('MANUAL_CONTACTS_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_CONTACTS_SHARED_INPUT_INVALID');
  return pixels;
}

/**
 * Pure stroke geometry adapter. The internal ownerConfirmed=true is required
 * by the shared rasterizer but does NOT attest identity, consent, iris location,
 * actual Original bytes, person privacy or current Recipe authorization.
 * The runtime binding and returned provenance are caller assertions only.
 * A fresh authenticated host must prove all of these before any product
 * Worker, Preview or Final path may consume these masks.
 */
export function rasterizeManualContactsMasks(pixels,document,runtime,
  {target,signal}={}){
  checkAbort(signal);
  const validated=checkedDocument(document,signal);
  const bound=validated.binding,context=checkedRuntime(bound,runtime);
  const frame=checkedFrame(pixels),source=sourceDimensions(frame);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_CONTACTS_SOURCE_DIMENSIONS_MISMATCH');
  if(target==='proxy'&&(!Object.hasOwn(frame,'sourceWidth')||
      !Object.hasOwn(frame,'sourceHeight')))
    throw Error('MANUAL_CONTACTS_PROXY_PROVENANCE_REQUIRED');
  const expected=targetDimensions(bound,target);
  if(frame.width!==expected.width||frame.height!==expected.height)
    throw Error('MANUAL_CONTACTS_TARGET_DIMENSIONS_MISMATCH');
  const proof={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    savedRevision:context.savedRevision};
  const ring=authorSubjectMask(frame,validated.ring,proof,
    {ownerConfirmed:true,signal});
  const pupil=authorSubjectMask(frame,validated.pupil,proof,
    {ownerConfirmed:true,signal});
  let ringSelected=0,pupilSelected=0,active=0;
  for(let index=0;index<ring.data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(ring.data[index])ringSelected++;
    if(pupil.data[index])pupilSelected++;
    if(ring.data[index]&&!pupil.data[index])active++;
  }
  if(!ringSelected||!pupilSelected||!active||
      ringSelected===ring.data.length||pupilSelected===pupil.data.length||
      ringSelected>1_000_000||pupilSelected>1_000_000)
    throw Error('MANUAL_CONTACTS_MASK_AMBIGUOUS');
  const mask=(data,kind,sourceName)=>Object.freeze({
    width:frame.width,height:frame.height,data,
    provenance:Object.freeze({kind,source:sourceName,assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,personID:bound.personID,eye:bound.eye,
      savedRevision:context.savedRevision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target,
      width:frame.width,height:frame.height})});
  checkAbort(signal);
  return Object.freeze({
    irisRingMask:mask(ring.data,'manual-contacts-iris-ring-mask',
      'owner-manual-iris-ring-coverage'),
    pupilExclusionMask:mask(pupil.data,'manual-contacts-pupil-exclusion-mask',
      'owner-manual-pupil-exclusion-coverage')});
}
