import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {blendTeethBrightnessDesaturation} from './web-manual-teeth-kernel.mjs';

export const MANUAL_TEETH_WHITENING_VERSION='suite-srgb8-owner-manual-teeth-whitening-1';
export const MANUAL_TEETH_MAX_PIXELS=8_000_000;
const PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;

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

function binding(context){
  const keys=['assetID','originalSHA256','personID','savedRevision','sourceWidth',
    'sourceHeight','target','ownerConfirmed'];
  if(!exact(context,keys)||!UUID.test(context.assetID)||!UUID.test(context.personID)||
      !SHA.test(context.originalSHA256)||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !Number.isSafeInteger(context.sourceWidth)||!Number.isSafeInteger(context.sourceHeight)||
      context.sourceWidth<1||context.sourceHeight<1||
      context.sourceWidth*context.sourceHeight>MANUAL_TEETH_MAX_PIXELS||
      !['source','proxy'].includes(context.target)||context.ownerConfirmed!==true)
    throw Error('MANUAL_TEETH_BINDING_INVALID');
  return context;
}

function expectedDimensions(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}

function checkedMask(mask,pixels,context,signal){
  const keys=['width','height','data','provenance'];
  if(!exact(mask,keys)||mask.width!==pixels.width||mask.height!==pixels.height||
      !(mask.data instanceof Uint8Array||mask.data instanceof Uint8ClampedArray)||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_TEETH_MASK_INVALID');
  const provenance=mask.provenance;
  if(!exact(provenance,['kind','source','assetID','originalSHA256','personID',
    'savedRevision','sourceWidth','sourceHeight','target','width','height'])||
      provenance.kind!=='owner-manual-teeth-mask'||
      provenance.source!=='owner-manual-teeth-strokes'||
      provenance.assetID!==context.assetID||provenance.personID!==context.personID||
      typeof provenance.originalSHA256!=='string'||
      provenance.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      provenance.savedRevision!==context.savedRevision||
      provenance.sourceWidth!==context.sourceWidth||
      provenance.sourceHeight!==context.sourceHeight||
      provenance.target!==context.target||
      provenance.width!==pixels.width||provenance.height!==pixels.height)
    throw Error('MANUAL_TEETH_MASK_PROVENANCE_MISMATCH');
  const coverage=mask.data.slice();
  let selected=0;
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    if(!coverage[pixel])continue;
    if(pixels.data[pixel*4+3]===0)throw Error('MANUAL_TEETH_MASK_TRANSPARENT');
    selected++;
  }
  if(!selected||selected===coverage.length)throw Error('MANUAL_TEETH_MASK_AMBIGUOUS');
  return coverage;
}

function checkedSettings(settings){
  if(!exact(settings,['brightness','desaturation'])||
      typeof settings.brightness!=='number'||!Number.isFinite(settings.brightness)||
      settings.brightness< -100||settings.brightness>100||
      typeof settings.desaturation!=='number'||!Number.isFinite(settings.desaturation)||
      settings.desaturation<0||settings.desaturation>100)
    throw Error('MANUAL_TEETH_SETTINGS_INVALID');
  return settings;
}

/**
 * SUITE-only, display-referred sRGB8 pixel operation on one explicitly painted
 * teeth-mask role. The pure comparison here is NOT authentication. In
 * particular, ownerConfirmed and provenance are caller assertions, not proof
 * of ownership, a genuine teeth region or a fresh permission decision. A
 * future product host must verify the mask's authoring provenance and fresh
 * Asset/Original/Recipe/person authority before it calls this helper. Do not
 * expose this as an autonomous tooth detector, repair or generated smile.
 *
 * The input must be an unrotated, uncropped source frame or its exact 1600px
 * proxy. The caller must rerender from Original-equivalent pixels, never from
 * an edited output; no Original bytes or Recipe are written by this function.
 */
export function applyManualTeethWhitening(pixels,mask,settings,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_TEETH_MAX_PIXELS)
    throw Error('MANUAL_TEETH_CAPACITY');
  assertPixels(pixels);
  const bound=binding(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_TEETH_SOURCE_DIMENSIONS_MISMATCH');
  const expected=expectedDimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_TEETH_TARGET_DIMENSIONS_MISMATCH');
  const fixed=checkedSettings(settings);
  const coverage=checkedMask(mask,pixels,bound,signal);
  checkAbort(signal);
  // Keep the legacy output shape and every preceding binding/provenance check.
  // Only arithmetic is shared with the separate nonsemantic Web brush product.
  const result=blendTeethBrightnessDesaturation(pixels,coverage,fixed,{signal});
  const output={width:pixels.width,height:pixels.height,data:result.data};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;
  }
  checkAbort(signal);
  return output;
}
