import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_CLOTHING_SPOT_VERSION='suite-srgb8-manual-clothing-spot-1';
export const MANUAL_CLOTHING_MAX_PIXELS=8_000_000;
export const MANUAL_CLOTHING_MAX_PATCH_PIXELS=65_536;
const PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const CONTEXT_KEYS=['assetID','originalSHA256','savedRevision','sourceWidth','sourceHeight','target'];
const RECT_KEYS=['x','y','width','height'];
const PROVENANCE_KEYS=['kind','source','assetID','originalSHA256','savedRevision',
  'sourceWidth','sourceHeight','target','targetRect','referenceRect'];

function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype&&
      !(Object.getPrototypeOf(proto)===null&&
        Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object'))return false;
  const owned=Reflect.ownKeys(value);
  return owned.length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}
const sameRect=(a,b)=>exact(b,RECT_KEYS)&&RECT_KEYS.every(key=>a[key]===b[key]);
function checkedContext(context){
  if(!exact(context,CONTEXT_KEYS)||typeof context.assetID!=='string'||!UUID.test(context.assetID)||
      typeof context.originalSHA256!=='string'||!SHA.test(context.originalSHA256)||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !Number.isSafeInteger(context.sourceWidth)||context.sourceWidth<1||
      !Number.isSafeInteger(context.sourceHeight)||context.sourceHeight<1||
      !Number.isSafeInteger(context.sourceWidth*context.sourceHeight)||
      context.sourceWidth*context.sourceHeight>MANUAL_CLOTHING_MAX_PIXELS||
      !['source','proxy'].includes(context.target))throw Error('MANUAL_CLOTHING_BINDING_INVALID');
  return context;
}
function expectedDimensions(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
function checkedRect(rect,width,height){
  if(!exact(rect,RECT_KEYS)||RECT_KEYS.some(key=>!Number.isSafeInteger(rect[key]))||
      rect.x<0||rect.y<0||rect.width<2||rect.height<2||
      rect.width>256||rect.height>256||rect.width*rect.height>MANUAL_CLOTHING_MAX_PATCH_PIXELS||
      rect.x+rect.width>width||rect.y+rect.height>height)
    throw Error('MANUAL_CLOTHING_REGION_INVALID');
  return rect;
}
function checkedRegions(regions,width,height){
  if(!exact(regions,['target','reference']))throw Error('MANUAL_CLOTHING_REGIONS_INVALID');
  const target=checkedRect(regions.target,width,height);
  const reference=checkedRect(regions.reference,width,height);
  if(target.width!==reference.width||target.height!==reference.height)
    throw Error('MANUAL_CLOTHING_REGION_SIZE_MISMATCH');
  if(target.x<reference.x+reference.width&&reference.x<target.x+target.width&&
      target.y<reference.y+reference.height&&reference.y<target.y+target.height)
    throw Error('MANUAL_CLOTHING_REGIONS_OVERLAP');
  return {target,reference};
}
function checkedMask(mask,regions,context,pixels,signal){
  const {target,reference}=regions;
  if(!exact(mask,['width','height','data','provenance'])||
      mask.width!==target.width||mask.height!==target.height||
      !ArrayBuffer.isView(mask.data)||
      !['[object Uint8Array]','[object Uint8ClampedArray]'].includes(Object.prototype.toString.call(mask.data))||
      Object.prototype.toString.call(mask.data.buffer)==='[object SharedArrayBuffer]'||
      mask.data.length!==target.width*target.height)throw Error('MANUAL_CLOTHING_MASK_INVALID');
  const p=mask.provenance;
  if(!exact(p,PROVENANCE_KEYS)||p.kind!=='manual-clothing-target-coverage'||
      p.source!=='caller-explicit-target-and-reference'||p.assetID!==context.assetID||
      typeof p.originalSHA256!=='string'||
      p.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      p.savedRevision!==context.savedRevision||p.sourceWidth!==context.sourceWidth||
      p.sourceHeight!==context.sourceHeight||p.target!==context.target||
      !sameRect(target,p.targetRect)||!sameRect(reference,p.referenceRect))
    throw Error('MANUAL_CLOTHING_MASK_PROVENANCE_MISMATCH');
  const coverage=new Uint8Array(mask.data);
  let selected=0;
  for(let localY=0;localY<target.height;localY++)for(let localX=0;localX<target.width;localX++){
    if(((localY*target.width+localX)&0x3fff)===0)checkAbort(signal);
    const local=localY*target.width+localX;
    if(coverage[local]===0)continue;
    const dst=((target.y+localY)*pixels.width+target.x+localX)*4;
    const src=((reference.y+localY)*pixels.width+reference.x+localX)*4;
    if(pixels.data[dst+3]===0||pixels.data[src+3]===0)
      throw Error('MANUAL_CLOTHING_MASK_TRANSPARENT');
    selected++;
  }
  if(selected===0)throw Error('MANUAL_CLOTHING_MASK_AMBIGUOUS');
  return coverage;
}

/**
 * SUITE-only, non-AI, same-image sRGB8 spot copy. Each target RGB byte is
 * round(target*(1-coverage/255)+reference*coverage/255). The reference is read
 * from the untouched input frame, never from another Asset or edited output.
 * Alpha, transparent hidden RGB, outside-mask RGB, input and mask are unchanged.
 *
 * A future authenticated host must independently verify Asset/Original SHA,
 * authoring, same-garment selection, permissions and saved Recipe revision.
 * context and mask provenance here are caller assertions, NOT authentication,
 * clothing detection, AI de-blemishing or proof that both regions are fabric.
 * Only upright, unrotated, uncropped source frames or exact 1600px proxies are
 * accepted. No Recipe, Original bytes, Final output or storage is touched.
 */
export function applyManualClothingSpot(pixels,mask,regions,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_CLOTHING_MAX_PIXELS)
    throw Error('MANUAL_CLOTHING_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_CLOTHING_SHARED_INPUT_INVALID');
  const bound=checkedContext(context),source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_CLOTHING_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(pixels,'sourceWidth')||!Object.hasOwn(pixels,'sourceHeight')))
    throw Error('MANUAL_CLOTHING_PROXY_PROVENANCE_REQUIRED');
  const expected=expectedDimensions(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_CLOTHING_TARGET_DIMENSIONS_MISMATCH');
  const chosen=checkedRegions(regions,pixels.width,pixels.height);
  const coverage=checkedMask(mask,chosen,bound,pixels,signal);
  checkAbort(signal);
  const output={width:pixels.width,height:pixels.height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;
  }
  const {target,reference}=chosen;
  for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){
    if(((y*target.width+x)&0x3fff)===0)checkAbort(signal);
    const amount=coverage[y*target.width+x];if(!amount)continue;
    const dst=((target.y+y)*pixels.width+target.x+x)*4;
    const src=((reference.y+y)*pixels.width+reference.x+x)*4;
    const weight=amount/255;
    for(let channel=0;channel<3;channel++)
      output.data[dst+channel]=Math.round(pixels.data[dst+channel]*(1-weight)+
        pixels.data[src+channel]*weight);
  }
  checkAbort(signal);
  return output;
}
