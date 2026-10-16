import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const MANUAL_FACE_DECORATION_FRECKLES_VERSION=
  'suite-srgb8-owner-manual-freckles-1';
const MAX_PIXELS=8_000_000,MAX_POINTS=64,MAX_WORK=16_000_000;
const PROXY_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const BINDING=['assetID','originalSHA256','personID','savedRevision',
  'sourceWidth','sourceHeight','target'];
const POINT=['u','v','radiusFraction','color','opacity'];
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  value>=0&&value<=1&&!Object.is(value,-0);
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype&&
      !(Object.getPrototypeOf(prototype)===null&&
        Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object'))
    return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
  });
}
function dense(array){
  if(!Array.isArray(array)||array.length<1||array.length>MAX_POINTS||
      Reflect.ownKeys(array).length!==array.length+1)return false;
  for(let index=0;index<array.length;index++)
    if(!Object.hasOwn(Object.getOwnPropertyDescriptor(array,String(index))||{},
      'value'))return false;
  return true;
}
function bindingOf(value){
  if(!exact(value,BINDING)||!UUID.test(value.assetID)||
      !SHA.test(value.originalSHA256)||!UUID.test(value.personID)||
      !Number.isSafeInteger(value.savedRevision)||value.savedRevision<1||
      !Number.isSafeInteger(value.sourceWidth)||value.sourceWidth<1||
      !Number.isSafeInteger(value.sourceHeight)||value.sourceHeight<1||
      value.sourceWidth*value.sourceHeight>MAX_PIXELS||
      !['source','proxy'].includes(value.target))
    throw Error('MANUAL_FRECKLES_BINDING_INVALID');
  return value;
}
function pointsOf(value){
  if(!dense(value))throw Error('MANUAL_FRECKLES_POINTS_INVALID');
  return value.map(point=>{
    if(!exact(point,POINT)||!unit(point.u)||!unit(point.v)||
        typeof point.radiusFraction!=='number'||
        !Number.isFinite(point.radiusFraction)||
        point.radiusFraction<.001||point.radiusFraction>.05||
        !exact(point.color,['r','g','b'])||
        !['r','g','b'].every(key=>Number.isSafeInteger(point.color[key])&&
          point.color[key]>=0&&point.color[key]<=255)||
        !unit(point.opacity))
      throw Error('MANUAL_FRECKLES_POINT_INVALID');
    return {u:point.u,v:point.v,radiusFraction:point.radiusFraction,
      color:{r:point.color.r,g:point.color.g,b:point.color.b},
      opacity:point.opacity};
  });
}
function expectedSize(binding){
  if(binding.target==='source')
    return {width:binding.sourceWidth,height:binding.sourceHeight};
  const scale=Math.min(1,PROXY_EDGE/
    Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}

/** SUITE-only deterministic sRGB8 manual dots. A dot has a soft radial
 * coverage (1-distance^2)^2 and source-over RGB mixing at its chosen opacity.
 * No AI face/skin detection or Evoto style asset/formula is used. Binding and
 * authored coordinates are structural claims, NOT authentication, subject
 * identity, facial placement or consent. A fresh host must prove these before
 * any Recipe, Worker, UI or Final connection. Original bytes are never written.
 */
export function applyManualFaceDecorationFreckles(pixels,selection,context,
  {signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MAX_PIXELS)
    throw Error('MANUAL_FRECKLES_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_FRECKLES_SHARED_INPUT_INVALID');
  const bound=bindingOf(context);
  if(!exact(selection,['binding','points']))
    throw Error('MANUAL_FRECKLES_SELECTION_INVALID');
  const authored=bindingOf(selection.binding);
  if(authored.assetID!==bound.assetID||
      authored.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      authored.personID!==bound.personID||
      authored.savedRevision!==bound.savedRevision||
      authored.sourceWidth!==bound.sourceWidth||
      authored.sourceHeight!==bound.sourceHeight||
      authored.target!==bound.target)
    throw Error('MANUAL_FRECKLES_SELECTION_BINDING_MISMATCH');
  const source=sourceDimensions(pixels);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_FRECKLES_SOURCE_DIMENSIONS_MISMATCH');
  if(bound.target==='proxy'&&
      (!Object.hasOwn(pixels,'sourceWidth')||
        !Object.hasOwn(pixels,'sourceHeight')))
    throw Error('MANUAL_FRECKLES_PROXY_PROVENANCE_REQUIRED');
  const expected=expectedSize(bound);
  if(pixels.width!==expected.width||pixels.height!==expected.height)
    throw Error('MANUAL_FRECKLES_TARGET_DIMENSIONS_MISMATCH');
  const chosen=pointsOf(selection.points),
    minEdge=Math.min(pixels.width,pixels.height);
  let work=0;
  const areas=chosen.map(point=>{
    const radius=Math.max(.5,point.radiusFraction*minEdge);
    const cx=point.u*pixels.width-.5,cy=point.v*pixels.height-.5;
    const left=Math.max(0,Math.ceil(cx-radius));
    const right=Math.min(pixels.width-1,Math.floor(cx+radius));
    const top=Math.max(0,Math.ceil(cy-radius));
    const bottom=Math.min(pixels.height-1,Math.floor(cy+radius));
    work+=Math.max(0,right-left+1)*Math.max(0,bottom-top+1);
    if(work>MAX_WORK)throw Error('MANUAL_FRECKLES_WORK_LIMIT');
    return {point,radius,cx,cy,left,right,top,bottom};
  });
  checkAbort(signal);
  const output={width:pixels.width,height:pixels.height,
    data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;
    output.sourceHeight=pixels.sourceHeight;
  }
  let opaqueTouched=0,visited=0;
  for(const area of areas){
    for(let y=area.top;y<=area.bottom;y++){
      for(let x=area.left;x<=area.right;x++){
        if((visited++&0x3fff)===0)checkAbort(signal);
        const distance=(x-area.cx)**2+(y-area.cy)**2;
        if(distance>area.radius**2)continue;
        const at=(y*pixels.width+x)*4;
        if(pixels.data[at+3]===0)continue;
        opaqueTouched++;
        const falloff=(1-distance/(area.radius**2))**2;
        const weight=area.point.opacity*falloff;
        if(weight<=0)continue;
        for(const [channel,key] of ['r','g','b'].entries())
          output.data[at+channel]=Math.round(
            output.data[at+channel]*(1-weight)+
            area.point.color[key]*weight);
      }
    }
  }
  checkAbort(signal);
  if(!opaqueTouched)throw Error('MANUAL_FRECKLES_NO_OPAQUE_TARGET');
  return output;
}
