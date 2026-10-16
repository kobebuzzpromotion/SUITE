import {assertPixels,checkAbort} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_PIXELS} from './subject-mask-authoring.mjs';
import {validateAddShadowManualDocument} from './add-shadow-manual-contract.mjs';

export const ADD_SHADOW_MANUAL_MASK_VERSION='suite-add-shadow-manual-subject-raster-1';
const OPTION_KEYS=['target','savedRevision','currentRevision','ownerConfirmed','signal'];
function plain(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function validOptions(options){
  if(!plain(options)||Reflect.ownKeys(options).some(key=>
    typeof key!=='string'||!OPTION_KEYS.includes(key)||
    !Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value'))||
    !['source','proxy'].includes(options.target)||
    !Number.isSafeInteger(options.savedRevision)||options.savedRevision<1||
    !Number.isSafeInteger(options.currentRevision)||options.currentRevision<1||
    options.ownerConfirmed!==true)
    throw Error('ADD_SHADOW_MANUAL_MASK_RUNTIME_INVALID');
  if(options.savedRevision!==options.currentRevision)
    throw Error('ADD_SHADOW_MANUAL_MASK_STALE_REVISION');
}
function targetDimensions(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  const scale=Math.min(1,1600/Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}

/**
 * Rerasterize the saved normalized strokes at this actual source/proxy frame,
 * never stretch or persist a bitmap. `expectedBinding` and `savedRevision`
 * must come from fresh authenticated Asset/backdrop and Recipe CAS checks;
 * `savedRevision` is the document's persisted Recipe version; `currentRevision`
 * is the fresh API/CAS version. Both must match. `ownerConfirmed` is only a
 * manual-selection assertion, not authorization.
 */
export function rasterizeAddShadowManualSubjectMask(targetPixels,document,
  expectedBinding,options){
  validOptions(options);
  const {target,savedRevision,signal}=options;
  checkAbort(signal);
  assertPixels(targetPixels);
  if(targetPixels.width*targetPixels.height>SUBJECT_MASK_MAX_PIXELS)
    throw Error('ADD_SHADOW_MANUAL_MASK_CAPACITY');
  const validated=validateAddShadowManualDocument(document,expectedBinding,{signal});
  const {width,height}=targetDimensions(validated.binding,target);
  if(targetPixels.width!==width||targetPixels.height!==height)
    throw Error('ADD_SHADOW_MANUAL_MASK_TARGET_DIMENSIONS_MISMATCH');
  checkAbort(signal);
  return authorSubjectMask(targetPixels,validated.subjectStrokes,{
    assetID:validated.binding.assetID,
    originalSHA256:validated.binding.originalSHA256,savedRevision},
  {ownerConfirmed:true,signal});
}
