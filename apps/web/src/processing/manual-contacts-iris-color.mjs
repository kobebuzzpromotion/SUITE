import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_CONTACTS_IRIS_COLOR_VERSION='suite-srgb8-manual-iris-color-1';
export const MANUAL_CONTACTS_MAX_PIXELS=8_000_000;
// Shared luminance-preserving color arithmetic, without manual-mask claims.
export function makeupIrisTargetChannel(luma,tint,tintLuma){
  return Math.max(0,Math.min(255,luma+tint-tintLuma));
}
const MAX_SELECTED=1_000_000,PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT_KEYS=['assetID','originalSHA256','personID','eye',
  'savedRevision','sourceWidth','sourceHeight','target'];
const PROVENANCE_KEYS=['kind','source',...CONTEXT_KEYS,'width','height'];
const MASK_SPECS={ring:{kind:'manual-contacts-iris-ring-mask',
  source:'owner-manual-iris-ring-coverage'},
  pupil:{kind:'manual-contacts-pupil-exclusion-mask',
    source:'owner-manual-pupil-exclusion-coverage'}};

function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype&&
      !(Object.getPrototypeOf(proto)===null&&
        Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function contextOf(input){
  if(!exact(input,CONTEXT_KEYS)||
      typeof input.assetID!=='string'||!UUID.test(input.assetID)||
      typeof input.originalSHA256!=='string'||!SHA.test(input.originalSHA256)||
      typeof input.personID!=='string'||!UUID.test(input.personID)||
      !['left','right'].includes(input.eye)||
      !Number.isSafeInteger(input.savedRevision)||input.savedRevision<1||
      !Number.isSafeInteger(input.sourceWidth)||input.sourceWidth<1||
      !Number.isSafeInteger(input.sourceHeight)||input.sourceHeight<1||
      input.sourceWidth*input.sourceHeight>MANUAL_CONTACTS_MAX_PIXELS||
      !['source','proxy'].includes(input.target))
    throw Error('MANUAL_CONTACTS_BINDING_INVALID');
  return input;
}
function dimensions(context){
  if(context.target==='source')
    return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
function settingsOf(value){
  if(!exact(value,['color','amount'])||
      !exact(value.color,['r','g','b'])||
      !['r','g','b'].every(key=>Number.isInteger(value.color[key])&&
        value.color[key]>=0&&value.color[key]<=255)||
      typeof value.amount!=='number'||!Number.isFinite(value.amount)||
      Object.is(value.amount,-0)||value.amount<0||value.amount>1)
    throw Error('MANUAL_CONTACTS_SETTINGS_INVALID');
  return value;
}
function maskOf(mask,pixels,context,role,signal){
  if(!exact(mask,['width','height','data','provenance'])||
      mask.width!==pixels.width||mask.height!==pixels.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(
        Object.prototype.toString.call(mask.data))||
      Object.prototype.toString.call(mask.data.buffer)==='[object SharedArrayBuffer]'||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_CONTACTS_MASK_INVALID');
  const proof=mask.provenance,expected=MASK_SPECS[role];
  if(!exact(proof,PROVENANCE_KEYS)||proof.kind!==expected.kind||
      proof.source!==expected.source||
      proof.assetID!==context.assetID||
      typeof proof.originalSHA256!=='string'||
      proof.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      proof.personID!==context.personID||proof.eye!==context.eye||
      proof.savedRevision!==context.savedRevision||
      proof.sourceWidth!==context.sourceWidth||
      proof.sourceHeight!==context.sourceHeight||
      proof.target!==context.target||proof.width!==pixels.width||
      proof.height!==pixels.height)
    throw Error('MANUAL_CONTACTS_MASK_PROVENANCE_MISMATCH');
  const data=new Uint8Array(mask.data);
  let selected=0;
  for(let index=0;index<data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(!data[index])continue;
    if(pixels.data[index*4+3]===0)
      throw Error('MANUAL_CONTACTS_MASK_TRANSPARENT');
    if(++selected>MAX_SELECTED)
      throw Error('MANUAL_CONTACTS_MASK_CAPACITY');
  }
  if(selected===0||selected===data.length)
    throw Error('MANUAL_CONTACTS_MASK_AMBIGUOUS');
  return data;
}

/** SUITE-only manually covered iris color. Source sRGB8 luma is used as the
 * basis for a colored target, then mixed by amount*ring outside every marked
 * pupil pixel (any nonzero exclusion is absolute). Gamut
 * clipping means exact luminance preservation is not claimed. This is not any
 * of Evoto's 11 materials, AI iris detection, or an authenticated edit.
 * Two caller-provided mask provenance records are checked structurally only:
 * a future fresh host must prove person/eye, real Original, authoring and
 * permissions independently before Recipe/Worker/Final use. */
export function applyManualContactsIrisColor(pixels,irisRingMask,
  pupilExclusionMask,settings,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_CONTACTS_MAX_PIXELS)
    throw Error('MANUAL_CONTACTS_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_CONTACTS_SHARED_INPUT_INVALID');
  const bound=contextOf(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_CONTACTS_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(pixels,'sourceWidth')||
        !Object.hasOwn(pixels,'sourceHeight')))
    throw Error('MANUAL_CONTACTS_PROXY_PROVENANCE_REQUIRED');
  const expected=dimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_CONTACTS_TARGET_DIMENSIONS_MISMATCH');
  const chosen=settingsOf(settings);
  const ring=maskOf(irisRingMask,pixels,bound,'ring',signal);
  const pupil=maskOf(pupilExclusionMask,pixels,bound,'pupil',signal);
  let active=0;
  for(let index=0;index<ring.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(ring[index]&&pupil[index]===0)active++;
  }
  if(!active)throw Error('MANUAL_CONTACTS_NO_IRIS_PIXELS');
  checkAbort(signal);
  const output={width:pixels.width,height:pixels.height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;
    output.sourceHeight=pixels.sourceHeight;
  }
  if(chosen.amount===0)return output;
  const tint=[chosen.color.r,chosen.color.g,chosen.color.b];
  const tintLuma=.2126*tint[0]+.7152*tint[1]+.0722*tint[2];
  for(let index=0;index<ring.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(!ring[index]||pupil[index]!==0)continue;
    const at=index*4;
    if(pixels.data[at+3]===0)continue;
    const luma=.2126*pixels.data[at]+.7152*pixels.data[at+1]+
      .0722*pixels.data[at+2];
    const weight=chosen.amount*(ring[index]/255);
    for(let channel=0;channel<3;channel++){
      const target=makeupIrisTargetChannel(luma,tint[channel],tintLuma);
      output.data[at+channel]=Math.round(pixels.data[at+channel]*(1-weight)+
        target*weight);
    }
  }
  checkAbort(signal);
  return output;
}
