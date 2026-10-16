import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

// SUITE-specific, owner-marked local warp; not Evoto's Nose control or AI.
export const MANUAL_NOSE_HORIZONTAL_VERSION='suite-srgb8-owner-manual-nose-horizontal-1';
export const MANUAL_NOSE_HORIZONTAL_MAX_PIXELS=8_000_000;
export const MANUAL_NOSE_HORIZONTAL_MAX_WORK=2_000_000;
const PROXY_MAX_EDGE=1600,MAX_JSON_BYTES=16*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const BINDING=['assetID','originalSHA256','personID','sourceWidth','sourceHeight'];
const CONTEXT=[...BINDING,'savedRevision','target'];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  !Object.is(value,-0)&&value>=0&&value<=1;

function plain(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||prototype===Object.prototype||
    (Object.getPrototypeOf(prototype)===null&&
      Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return plain(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
    });
}
function binding(value){
  return exact(value,BINDING)&&typeof value.assetID==='string'&&
    typeof value.originalSHA256==='string'&&typeof value.personID==='string'&&
    UUID.test(value.assetID)&&SHA.test(value.originalSHA256)&&
    UUID.test(value.personID)&&Number.isSafeInteger(value.sourceWidth)&&
    value.sourceWidth>=1&&Number.isSafeInteger(value.sourceHeight)&&
    value.sourceHeight>=1&&
    Number.isSafeInteger(value.sourceWidth*value.sourceHeight)&&
    value.sourceWidth*value.sourceHeight<=MANUAL_NOSE_HORIZONTAL_MAX_PIXELS;
}
function validated(document,context,signal){
  checkAbort(signal);
  if(!exact(document,['schemaVersion','engineVersion','representation',
    'binding','roi','settings'])||document.schemaVersion!==1||
      document.engineVersion!==MANUAL_NOSE_HORIZONTAL_VERSION||
      document.representation!=='normalized-owner-marked-nose-roi-v1'||
      !binding(document.binding))throw Error('MANUAL_NOSE_DOCUMENT_INVALID');
  if(!exact(context,CONTEXT)||!binding(Object.fromEntries(BINDING.map(key=>
    [key,context[key]])))||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !['source','proxy'].includes(context.target)||
      document.binding.assetID!==context.assetID||
      document.binding.originalSHA256.toLowerCase()!==
        context.originalSHA256.toLowerCase()||
      document.binding.personID!==context.personID||
      document.binding.sourceWidth!==context.sourceWidth||
      document.binding.sourceHeight!==context.sourceHeight)
    throw Error('MANUAL_NOSE_BINDING_MISMATCH');
  const roi=document.roi;
  if(!exact(roi,['x','y','width','height'])||
      !unit(roi.x)||!unit(roi.y)||!unit(roi.width)||!unit(roi.height)||
      roi.width<.02||roi.width>.4||roi.height<.02||roi.height>.35||
      roi.width*roi.height>.12||
      roi.x+roi.width>1||roi.y+roi.height>1)
    throw Error('MANUAL_NOSE_ROI_INVALID');
  const settings=document.settings;
  if(!exact(settings,['displacementFraction','featherFraction'])||
      typeof settings.displacementFraction!=='number'||
      !Number.isFinite(settings.displacementFraction)||
      Object.is(settings.displacementFraction,-0)||
      Math.abs(settings.displacementFraction)>.03||
      typeof settings.featherFraction!=='number'||
      !Number.isFinite(settings.featherFraction)||
      settings.featherFraction<.05||settings.featherFraction>.35)
    throw Error('MANUAL_NOSE_SETTINGS_INVALID');
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_NOSE_JSON_LIMIT');
  return document;
}
function targetDimensions(context){
  if(context.target==='source')
    return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
const smooth=value=>{
  const t=clamp(value,0,1);return t*t*(3-2*t);
};

/**
 * Shift sampled visible sRGB8 RGB horizontally inside a small owner-marked
 * rectangle. At pixel center (u,v), distance to the ROI edge is feathered by
 * smoothstep. The inverse sample is x - displacementFraction*width*weight,
 * clamped to pixel centers inside the ROI; linear horizontal interpolation is
 * alpha-weighted to exclude hidden RGB. Destination alpha never changes.
 * ROI outside pixels and transparent destination hidden RGB remain byte-equal.
 * This deterministic 2D effect neither locates a nose nor reconstructs unseen
 * skin. Caller binding/revision/ROI are structural ASSERTIONS, not fresh person
 * permission, anatomical proof, Original-byte evidence or Recipe persistence.
 */
export function applyManualNoseHorizontal(pixels,document,context,{signal}={}){
  checkAbort(signal);
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exact(pixels,hasSource?['width','height','data','sourceWidth',
    'sourceHeight']:['width','height','data']))
    throw Error('MANUAL_NOSE_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_NOSE_HORIZONTAL_MAX_PIXELS)
    throw Error('MANUAL_NOSE_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_NOSE_SHARED_INPUT_INVALID');
  const safe=validated(document,context,signal);
  const source=sourceDimensions(pixels),expected=targetDimensions(context);
  if(source.width!==context.sourceWidth||source.height!==context.sourceHeight||
      pixels.width!==expected.width||pixels.height!==expected.height||
      (context.target==='source'&&hasSource)||
      (context.target==='proxy'&&!hasSource))
    throw Error('MANUAL_NOSE_DIMENSIONS_MISMATCH');
  const {width,height,data}=pixels,roi=safe.roi,settings=safe.settings;
  const left=Math.max(0,Math.ceil(roi.x*width-.5));
  const right=Math.min(width-1,Math.floor((roi.x+roi.width)*width-.5));
  const top=Math.max(0,Math.ceil(roi.y*height-.5));
  const bottom=Math.min(height-1,Math.floor((roi.y+roi.height)*height-.5));
  if(left>right||top>bottom)throw Error('MANUAL_NOSE_ROI_EMPTY');
  if((right-left+1)*(bottom-top+1)>MANUAL_NOSE_HORIZONTAL_MAX_WORK)
    throw Error('MANUAL_NOSE_WORK_LIMIT');
  const output={width,height,data:data.slice()};
  if(hasSource){output.sourceWidth=pixels.sourceWidth;
    output.sourceHeight=pixels.sourceHeight;}
  const feather=settings.featherFraction*Math.min(roi.width,roi.height);
  if(settings.displacementFraction===0)return output;
  for(let y=top;y<=bottom;y++){
    checkAbort(signal);
    const v=(y+.5)/height;
    for(let x=left;x<=right;x++){
      const at=(y*width+x)*4;
      if(!data[at+3])continue;
      const u=(x+.5)/width;
      const distance=Math.min(u-roi.x,roi.x+roi.width-u,
        v-roi.y,roi.y+roi.height-v);
      const weight=smooth(distance/feather);
      if(weight===0)continue;
      const from=clamp(x-settings.displacementFraction*width*weight,left,right);
      const x0=Math.floor(from),x1=Math.min(right,x0+1),t=from-x0;
      const at0=(y*width+x0)*4,at1=(y*width+x1)*4;
      const w0=(1-t)*data[at0+3]/255,w1=t*data[at1+3]/255;
      if(w0+w1<=0)continue;
      for(let channel=0;channel<3;channel++)
        output.data[at+channel]=Math.round((data[at0+channel]*w0+
          data[at1+channel]*w1)/(w0+w1));
    }
  }
  checkAbort(signal);
  return output;
}
