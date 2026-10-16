import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {applyLocalLevels} from './local-levels.mjs';

export const MANUAL_MAKEUP_HIGHLIGHT_VERSION='suite-srgb8-owner-manual-makeup-highlight-1';
export const MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS=8_000_000;
const PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT_KEYS=['assetID','originalSHA256','personID','savedRevision',
  'sourceWidth','sourceHeight','target','ownerConfirmed'];
const PROVENANCE_KEYS=['kind','source','assetID','originalSHA256','personID',
  'savedRevision','sourceWidth','sourceHeight','target','width','height'];

function exactRecord(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))return false;
  const own=Reflect.ownKeys(value);
  return own.length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}

function checkedContext(context){
  if(!exactRecord(context,CONTEXT_KEYS)||
      typeof context.assetID!=='string'||!UUID.test(context.assetID)||
      typeof context.originalSHA256!=='string'||!SHA.test(context.originalSHA256)||
      typeof context.personID!=='string'||!UUID.test(context.personID)||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !Number.isSafeInteger(context.sourceWidth)||context.sourceWidth<1||
      !Number.isSafeInteger(context.sourceHeight)||context.sourceHeight<1||
      !Number.isSafeInteger(context.sourceWidth*context.sourceHeight)||
      context.sourceWidth*context.sourceHeight>MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS||
      !['source','proxy'].includes(context.target)||context.ownerConfirmed!==true)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_BINDING_INVALID');
  return context;
}

function expectedDimensions(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}

function checkedMask(mask,pixels,context,signal){
  if(!exactRecord(mask,['width','height','data','provenance'])||
      mask.width!==pixels.width||mask.height!==pixels.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(Object.prototype.toString.call(mask.data))||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_MASK_INVALID');
  const provenance=mask.provenance;
  if(!exactRecord(provenance,PROVENANCE_KEYS)||
      provenance.kind!=='owner-manual-makeup-highlight-mask'||
      provenance.source!=='owner-manual-makeup-highlight-strokes'||
      provenance.assetID!==context.assetID||
      typeof provenance.originalSHA256!=='string'||
      provenance.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      provenance.personID!==context.personID||
      provenance.savedRevision!==context.savedRevision||
      provenance.sourceWidth!==context.sourceWidth||
      provenance.sourceHeight!==context.sourceHeight||
      provenance.target!==context.target||
      provenance.width!==pixels.width||provenance.height!==pixels.height)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_MASK_PROVENANCE_MISMATCH');
  const coverage=new Uint8Array(mask.data);
  let selected=0;
  for(let index=0;index<coverage.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(!coverage[index])continue;
    if(pixels.data[index*4+3]===0)throw Error('MANUAL_MAKEUP_HIGHLIGHT_MASK_TRANSPARENT');
    selected++;
  }
  if(selected===0||selected===coverage.length)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_MASK_AMBIGUOUS');
  return {width:mask.width,height:mask.height,data:coverage};
}

/**
 * SUITE-only sRGB8 manual-area brightening, not automatic makeup detection or
 * an Evoto-equivalent effect. Intensity 0..100 maps explicitly to Master Levels
 * gamma 1..2; the existing Local Levels kernel gates that transform by the
 * selected coverage. Black/white endpoints and straight alpha are preserved.
 *
 * This pure helper checks matching caller-provided provenance; ownerConfirmed
 * and mask source strings are NOT authentication or proof of a facial zone.
 * A product host must independently authenticate the person/Asset/Original,
 * fresh permission, saved revision and stroke authoring before calling it.
 * Input pixels must be the unedited upright source frame or its 1600px proxy.
 */
export function applyManualMakeupHighlight(pixels,mask,settings,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_MAKEUP_HIGHLIGHT_MAX_PIXELS)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_CAPACITY');
  assertPixels(pixels);
  const bound=checkedContext(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_SOURCE_DIMENSIONS_MISMATCH');
  const expected=expectedDimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_TARGET_DIMENSIONS_MISMATCH');
  if(!exactRecord(settings,['intensity'])||!Number.isInteger(settings.intensity)||
      settings.intensity<0||settings.intensity>100)
    throw Error('MANUAL_MAKEUP_HIGHLIGHT_SETTINGS_INVALID');
  const boundedMask=checkedMask(mask,pixels,bound,signal);
  checkAbort(signal);
  const output=applyLocalLevels(pixels,boundedMask,{master:{gamma:1+settings.intensity/100}},{signal});
  checkAbort(signal);
  return output;
}
