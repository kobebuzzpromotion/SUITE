import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_EYESHADOW_COLOR_VERSION='suite-srgb8-owner-manual-eyeshadow-color-1';
export const MANUAL_EYESHADOW_MAX_PIXELS=8_000_000;
const MAX_SELECTED=1_000_000,PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT=['assetID','originalSHA256','personID','eye','savedRevision',
  'sourceWidth','sourceHeight','target'];
const PROVENANCE=['kind','source',...CONTEXT,'width','height'];
const ROLES={shadow:{kind:'manual-eyeshadow-eye-area-mask',
  source:'owner-manual-eyeshadow-coverage'},
iris:{kind:'manual-eyeshadow-iris-exclusion-mask',
  source:'owner-manual-iris-exclusion-coverage'},
pupil:{kind:'manual-eyeshadow-pupil-exclusion-mask',
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
function checkedContext(value){
  if(!exact(value,CONTEXT)||
      typeof value.assetID!=='string'||!UUID.test(value.assetID)||
      typeof value.originalSHA256!=='string'||!SHA.test(value.originalSHA256)||
      typeof value.personID!=='string'||!UUID.test(value.personID)||
      !['image-left','image-right'].includes(value.eye)||
      !Number.isSafeInteger(value.savedRevision)||value.savedRevision<1||
      !Number.isSafeInteger(value.sourceWidth)||value.sourceWidth<1||
      !Number.isSafeInteger(value.sourceHeight)||value.sourceHeight<1||
      !Number.isSafeInteger(value.sourceWidth*value.sourceHeight)||
      value.sourceWidth*value.sourceHeight>MANUAL_EYESHADOW_MAX_PIXELS||
      !['source','proxy'].includes(value.target))
    throw Error('MANUAL_EYESHADOW_BINDING_INVALID');
  return value;
}
function dimensions(context){
  if(context.target==='source')
    return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
function checkedSettings(value){
  if(!exact(value,['color','opacity'])||!exact(value.color,['r','g','b'])||
      !['r','g','b'].every(k=>Number.isSafeInteger(value.color[k])&&
        value.color[k]>=0&&value.color[k]<=255)||
      typeof value.opacity!=='number'||!Number.isFinite(value.opacity)||
      Object.is(value.opacity,-0)||value.opacity<0||value.opacity>1)
    throw Error('MANUAL_EYESHADOW_SETTINGS_INVALID');
  return value;
}
function checkedMask(mask,pixels,context,role,signal){
  if(!exact(mask,['width','height','data','provenance'])||
      mask.width!==pixels.width||mask.height!==pixels.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(
        Object.prototype.toString.call(mask.data))||
      Object.prototype.toString.call(mask.data.buffer)==='[object SharedArrayBuffer]'||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_EYESHADOW_MASK_INVALID');
  const proof=mask.provenance,expected=ROLES[role];
  if(!exact(proof,PROVENANCE)||proof.kind!==expected.kind||
      proof.source!==expected.source||proof.assetID!==context.assetID||
      typeof proof.originalSHA256!=='string'||
      proof.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      proof.personID!==context.personID||proof.eye!==context.eye||
      proof.savedRevision!==context.savedRevision||
      proof.sourceWidth!==context.sourceWidth||
      proof.sourceHeight!==context.sourceHeight||
      proof.target!==context.target||proof.width!==pixels.width||
      proof.height!==pixels.height)
    throw Error('MANUAL_EYESHADOW_MASK_PROVENANCE_MISMATCH');
  const data=new Uint8Array(mask.data);
  let selected=0;
  for(let index=0;index<data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(!data[index])continue;
    if(pixels.data[index*4+3]===0)
      throw Error('MANUAL_EYESHADOW_MASK_TRANSPARENT');
    if(++selected>MAX_SELECTED)
      throw Error('MANUAL_EYESHADOW_MASK_CAPACITY');
  }
  if(role==='shadow'&&(selected===0||selected===data.length))
    throw Error('MANUAL_EYESHADOW_MASK_AMBIGUOUS');
  return data;
}

/**
 * SUITE-only manual single-color blend inside explicit eye-area coverage.
 * Any nonzero iris or pupil exclusion fully protects that pixel. Alpha and
 * transparent hidden RGB are unchanged. Mask provenance is structurally
 * checked, NOT proof of eye location, person, permission, or Original bytes.
 * A fresh authenticated product host must provide those independent gates.
 * This is not Evoto's 14/8-style material or a confirmed component Amount.
 */
export function applyManualEyeshadowColor(pixels,eyeAreaMask,
  irisExclusionMask,pupilExclusionMask,settings,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_EYESHADOW_MAX_PIXELS)
    throw Error('MANUAL_EYESHADOW_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_EYESHADOW_SHARED_INPUT_INVALID');
  const bound=checkedContext(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_EYESHADOW_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(pixels,'sourceWidth')||!Object.hasOwn(pixels,'sourceHeight')))
    throw Error('MANUAL_EYESHADOW_PROXY_PROVENANCE_REQUIRED');
  const expected=dimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_EYESHADOW_TARGET_DIMENSIONS_MISMATCH');
  const chosen=checkedSettings(settings);
  const area=checkedMask(eyeAreaMask,pixels,bound,'shadow',signal);
  const iris=checkedMask(irisExclusionMask,pixels,bound,'iris',signal);
  const pupil=checkedMask(pupilExclusionMask,pixels,bound,'pupil',signal);
  let active=0;
  for(let index=0;index<area.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(area[index]&&iris[index]===0&&pupil[index]===0)active++;
  }
  if(!active)throw Error('MANUAL_EYESHADOW_NO_TARGET_PIXELS');
  checkAbort(signal);
  const output={width:pixels.width,height:pixels.height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;
  }
  if(chosen.opacity===0)return output;
  const tint=[chosen.color.r,chosen.color.g,chosen.color.b];
  for(let index=0;index<area.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    if(!area[index]||iris[index]!==0||pupil[index]!==0)continue;
    const at=index*4,weight=chosen.opacity*area[index]/255;
    for(let channel=0;channel<3;channel++)
      output.data[at+channel]=Math.round(pixels.data[at+channel]*(1-weight)+
        tint[channel]*weight);
  }
  checkAbort(signal);
  return output;
}
