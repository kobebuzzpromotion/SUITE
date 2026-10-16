import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_BLUSH_COLOR_VERSION='suite-srgb8-owner-manual-blush-color-1';
export const MANUAL_BLUSH_MAX_PIXELS=8_000_000;
// Shared arithmetic only; callers still establish their own distinct provenance.
export function blendMakeupChannel(source,color,weight){
  return Math.round(source*(1-weight)+color*weight);
}
const PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT_KEYS=['assetID','originalSHA256','personID','savedRevision',
  'sourceWidth','sourceHeight','target'];
const PROVENANCE_KEYS=['kind','source','assetID','originalSHA256','personID',
  'savedRevision','sourceWidth','sourceHeight','target','width','height'];

function exact(value,keys){
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
  if(!exact(context,CONTEXT_KEYS)||
      typeof context.assetID!=='string'||!UUID.test(context.assetID)||
      typeof context.originalSHA256!=='string'||!SHA.test(context.originalSHA256)||
      typeof context.personID!=='string'||!UUID.test(context.personID)||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !Number.isSafeInteger(context.sourceWidth)||context.sourceWidth<1||
      !Number.isSafeInteger(context.sourceHeight)||context.sourceHeight<1||
      !Number.isSafeInteger(context.sourceWidth*context.sourceHeight)||
      context.sourceWidth*context.sourceHeight>MANUAL_BLUSH_MAX_PIXELS||
      !['source','proxy'].includes(context.target))
    throw Error('MANUAL_BLUSH_BINDING_INVALID');
  return context;
}
function expectedDimensions(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
function checkedSettings(settings){
  if(!exact(settings,['color','opacity'])||!exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(channel=>Number.isInteger(settings.color[channel])&&
        settings.color[channel]>=0&&settings.color[channel]<=255)||
      typeof settings.opacity!=='number'||!Number.isFinite(settings.opacity)||
      Object.is(settings.opacity,-0)||settings.opacity<0||settings.opacity>1)
    throw Error('MANUAL_BLUSH_SETTINGS_INVALID');
  return settings;
}
function checkedMask(mask,pixels,context,signal){
  if(!exact(mask,['width','height','data','provenance'])||
      mask.width!==pixels.width||mask.height!==pixels.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(Object.prototype.toString.call(mask.data))||
      Object.prototype.toString.call(mask.data.buffer)==='[object SharedArrayBuffer]'||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_BLUSH_MASK_INVALID');
  const provenance=mask.provenance;
  if(!exact(provenance,PROVENANCE_KEYS)||
      provenance.kind!=='manual-blush-cheek-mask'||
      provenance.source!=='caller-manual-cheek-strokes'||
      provenance.assetID!==context.assetID||
      typeof provenance.originalSHA256!=='string'||
      provenance.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      provenance.personID!==context.personID||
      provenance.savedRevision!==context.savedRevision||
      provenance.sourceWidth!==context.sourceWidth||
      provenance.sourceHeight!==context.sourceHeight||
      provenance.target!==context.target||
      provenance.width!==pixels.width||provenance.height!==pixels.height)
    throw Error('MANUAL_BLUSH_MASK_PROVENANCE_MISMATCH');
  const coverage=new Uint8Array(mask.data);
  let selected=0;
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    if(!coverage[pixel])continue;
    if(pixels.data[pixel*4+3]===0)throw Error('MANUAL_BLUSH_MASK_TRANSPARENT');
    selected++;
  }
  if(selected===0||selected===coverage.length)throw Error('MANUAL_BLUSH_MASK_AMBIGUOUS');
  return coverage;
}

/**
 * SUITE-only manual cheek tint. For each selected opaque sRGB8 pixel, each RGB
 * channel becomes round(source*(1-weight)+color*weight), where weight is
 * opacity*coverage/255. This is not an Evoto 12-style replica or AI cheek
 * detection. The caller-provided mask/provenance is only structurally checked:
 * it is NOT authentication, proof of cheek location, or fresh permission.
 * A future host must independently verify the Asset, Original, person,
 * authoring, permission and saved Recipe revision before use.
 *
 * Input must be an unrotated, uncropped upright source frame or its exact
 * 1600px proxy. No Original bytes, Recipe or external storage are written.
 */
export function applyManualBlushColor(pixels,mask,settings,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_BLUSH_MAX_PIXELS)
    throw Error('MANUAL_BLUSH_CAPACITY');
  assertPixels(pixels);
  const bound=checkedContext(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_BLUSH_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(pixels,'sourceWidth')||!Object.hasOwn(pixels,'sourceHeight')))
    throw Error('MANUAL_BLUSH_PROXY_PROVENANCE_REQUIRED');
  const expected=expectedDimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_BLUSH_TARGET_DIMENSIONS_MISMATCH');
  const chosen=checkedSettings(settings),coverage=checkedMask(mask,pixels,bound,signal);
  checkAbort(signal);
  const output={width:pixels.width,height:pixels.height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;
  }
  if(chosen.opacity===0)return output;
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    const at=pixel*4;
    if(coverage[pixel]===0||pixels.data[at+3]===0)continue;
    const weight=chosen.opacity*coverage[pixel]/255;
    for(const [index,channel] of ['r','g','b'].entries())
      output.data[at+index]=blendMakeupChannel(pixels.data[at+index],chosen.color[channel],weight);
  }
  checkAbort(signal);
  return output;
}
