import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_HAND_TONE_VERSION='suite-srgb8-owner-manual-hand-tone-1';
export const MANUAL_HAND_TONE_MAX_PIXELS=8_000_000;
const PROXY_MAX_EDGE=1600;
const MAX_RADIUS=6;
const MAX_LUMA_CORRECTION=24;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT_KEYS=['assetID','originalSHA256','savedRevision','sourceWidth','sourceHeight','target'];
const MASK_PROVENANCE_KEYS=['kind','source','assetID','originalSHA256','savedRevision',
  'sourceWidth','sourceHeight','target','width','height'];

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
function checkedFrame(pixels){
  const hasSourceWidth=Object.hasOwn(pixels??{},'sourceWidth');
  const hasSourceHeight=Object.hasOwn(pixels??{},'sourceHeight');
  if(hasSourceWidth!==hasSourceHeight||
      !exact(pixels,hasSourceWidth?['width','height','data','sourceWidth','sourceHeight']:
        ['width','height','data']))throw Error('MANUAL_HAND_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_HAND_TONE_MAX_PIXELS)
    throw Error('MANUAL_HAND_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_HAND_SHARED_INPUT_INVALID');
  return pixels;
}
function checkedContext(context){
  if(!exact(context,CONTEXT_KEYS)||typeof context.assetID!=='string'||!UUID.test(context.assetID)||
      typeof context.originalSHA256!=='string'||!SHA.test(context.originalSHA256)||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !Number.isSafeInteger(context.sourceWidth)||context.sourceWidth<1||
      !Number.isSafeInteger(context.sourceHeight)||context.sourceHeight<1||
      !Number.isSafeInteger(context.sourceWidth*context.sourceHeight)||
      context.sourceWidth*context.sourceHeight>MANUAL_HAND_TONE_MAX_PIXELS||
      !['source','proxy'].includes(context.target))throw Error('MANUAL_HAND_BINDING_INVALID');
  return context;
}
function expectedDimensions(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
function checkedSettings(settings){
  if(!exact(settings,['strength','radiusSourcePixels'])||
      typeof settings.strength!=='number'||!Number.isFinite(settings.strength)||
      Object.is(settings.strength,-0)||settings.strength<0||settings.strength>1||
      !Number.isSafeInteger(settings.radiusSourcePixels)||
      settings.radiusSourcePixels<1||settings.radiusSourcePixels>MAX_RADIUS)
    throw Error('MANUAL_HAND_SETTINGS_INVALID');
  return settings;
}
function checkedMask(mask,pixels,context,signal){
  if(!exact(mask,['width','height','data','provenance'])||
      mask.width!==pixels.width||mask.height!==pixels.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(
        Object.prototype.toString.call(mask.data))||
      Object.prototype.toString.call(mask.data.buffer)==='[object SharedArrayBuffer]'||
      mask.data.length!==pixels.width*pixels.height)
    throw Error('MANUAL_HAND_MASK_INVALID');
  const p=mask.provenance;
  if(!exact(p,MASK_PROVENANCE_KEYS)||p.kind!=='manual-hand-forearm-mask'||
      p.source!=='caller-explicit-hand-forearm-strokes'||p.assetID!==context.assetID||
      typeof p.originalSHA256!=='string'||
      p.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      p.savedRevision!==context.savedRevision||p.sourceWidth!==context.sourceWidth||
      p.sourceHeight!==context.sourceHeight||p.target!==context.target||
      p.width!==pixels.width||p.height!==pixels.height)
    throw Error('MANUAL_HAND_MASK_PROVENANCE_MISMATCH');
  const coverage=new Uint8Array(mask.data);
  let visibleSelected=0;
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    if(coverage[pixel]&&pixels.data[pixel*4+3])visibleSelected++;
  }
  if(!visibleSelected)throw Error('MANUAL_HAND_MASK_EMPTY');
  return coverage;
}
const luma=(data,at)=>0.2126*data[at]+0.7152*data[at+1]+0.0722*data[at+2];

/** Horizontal box sums for a single original (never previously edited) row. */
function horizontalRow(data,coverage,width,y,radius,signal){
  const weightedLuma=new Float64Array(width),weights=new Float64Array(width);
  for(let x=0;x<width;x++){
    if((x&0x3fff)===0)checkAbort(signal);
    const pixel=y*width+x,at=pixel*4;
    const weight=coverage[pixel]/255*data[at+3]/255;
    weights[x]=weight;
    weightedLuma[x]=weight*luma(data,at);
  }
  const sums=new Float64Array(width),weightSums=new Float64Array(width);
  let total=0,weightTotal=0;
  for(let x=0;x<Math.min(radius,width);x++){
    total+=weightedLuma[x];weightTotal+=weights[x];
  }
  for(let x=0;x<width;x++){
    const add=x+radius,remove=x-radius-1;
    if(add<width){total+=weightedLuma[add];weightTotal+=weights[add];}
    if(remove>=0){total-=weightedLuma[remove];weightTotal-=weights[remove];}
    sums[x]=total;weightSums[x]=weightTotal;
  }
  return {sums,weightSums};
}

/**
 * SUITE-only, non-AI manual hand/forearm tone equalization on upright sRGB8.
 * For each selected visible pixel, Y=.2126R+.7152G+.0722B, localMean is the
 * radius-bounded mean of original Y weighted by mask coverage and alpha, and
 * targetY=Y+clamp((localMean-Y)*strength*coverage/255,-24,+24). RGB is
 * multiplied by clamp(targetY/Y,.75,1.25), then rounded to bytes. Y=0 keeps
 * its original RGB. The common gain preserves channel ratios (hue/chroma)
 * before 8-bit clipping; clipping may shift hue. Bounded local contrast/texture
 * is intentionally softened, not reconstructed. Only selected RGB changes;
 * mask coverage feathers its boundary. Alpha/hidden RGB/outside-mask RGB and
 * both inputs remain unchanged. This differs from global or Local Levels.
 *
 * Context and mask provenance are structural CALLER ASSERTIONS, not proof of
 * identity, permission, hand position, authorship, Original bytes or current
 * saved revision. An authenticated host must establish those independently.
 * Source is an upright, uncropped full frame; proxy is its exact 1600px-bound
 * upright projection. No Recipe, Original, storage or other Asset is written.
 */
export function applyManualHandTone(pixels,mask,settings,context,{signal}={}){
  checkAbort(signal);
  const frame=checkedFrame(pixels),bound=checkedContext(context);
  const source=sourceDimensions(frame);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_HAND_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(frame,'sourceWidth')||!Object.hasOwn(frame,'sourceHeight')))
    throw Error('MANUAL_HAND_PROXY_PROVENANCE_REQUIRED');
  const expected=expectedDimensions(bound);
  if(frame.width!==expected.width||frame.height!==expected.height)
    throw Error('MANUAL_HAND_TARGET_DIMENSIONS_MISMATCH');
  const chosen=checkedSettings(settings),coverage=checkedMask(mask,frame,bound,signal);
  checkAbort(signal);
  const output={width:frame.width,height:frame.height,data:frame.data.slice()};
  if(Object.hasOwn(frame,'sourceWidth')){
    output.sourceWidth=frame.sourceWidth;output.sourceHeight=frame.sourceHeight;
  }
  if(chosen.strength===0)return output;
  const radius=Math.max(1,Math.round(chosen.radiusSourcePixels*frame.width/bound.sourceWidth));
  const verticalLuma=new Float64Array(frame.width),verticalWeights=new Float64Array(frame.width);
  const rows=new Map();
  function addRow(y){
    const row=horizontalRow(frame.data,coverage,frame.width,y,radius,signal);
    rows.set(y,row);
    for(let x=0;x<frame.width;x++){
      verticalLuma[x]+=row.sums[x];verticalWeights[x]+=row.weightSums[x];
    }
  }
  function removeRow(y){
    const row=rows.get(y);rows.delete(y);
    for(let x=0;x<frame.width;x++){
      verticalLuma[x]-=row.sums[x];verticalWeights[x]-=row.weightSums[x];
    }
  }
  for(let y=0;y<=Math.min(radius,frame.height-1);y++)addRow(y);
  for(let y=0;y<frame.height;y++){
    checkAbort(signal);
    for(let x=0;x<frame.width;x++){
      if((x&0x3fff)===0)checkAbort(signal);
      const pixel=y*frame.width+x,at=pixel*4;
      if(!coverage[pixel]||!frame.data[at+3]||verticalWeights[x]<=0)continue;
      const current=luma(frame.data,at);
      if(current<=0)continue;
      const mean=verticalLuma[x]/verticalWeights[x];
      const proposed=(mean-current)*chosen.strength*coverage[pixel]/255;
      const delta=Math.max(-MAX_LUMA_CORRECTION,Math.min(MAX_LUMA_CORRECTION,proposed));
      const gain=Math.max(.75,Math.min(1.25,(current+delta)/current));
      for(let channel=0;channel<3;channel++)
        output.data[at+channel]=Math.round(frame.data[at+channel]*gain);
    }
    if(y-radius>=0)removeRow(y-radius);
    if(y+radius+1<frame.height)addRow(y+radius+1);
  }
  checkAbort(signal);
  return output;
}
