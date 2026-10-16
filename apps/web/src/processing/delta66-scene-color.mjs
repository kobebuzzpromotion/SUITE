import {assertPixels,checkAbort,srgbToLinear,linearToSrgb} from './pure.mjs';
import {createHDRFrame} from './hdr-frame.mjs';
import {applyPersonalizedLook} from './astra-look-learning.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const copy=p=>({...p,data:p.data.slice()});
function selection(mask,p){if(mask!==undefined&&(!(mask instanceof Uint8Array)||mask.length!==p.width*p.height))throw Error('SCENE_COLOR_MASK');}
/** Display-only brightness and dark-channel dehaze supplement existing exposure,
 * contrast, texture, clarity, saturation and HSL. No RAW recovery is claimed. */
export function applySceneBasic(pixels,{brightness=0,dehaze=0}={}, {signal}={}){
  assertPixels(pixels);if(![brightness,dehaze].every(v=>Number.isFinite(v)&&v>=-100&&v<=100))throw Error('SCENE_BASIC_RANGE');
  const out=copy(pixels);if(brightness===0&&dehaze===0)return out;
  const air=[.1,.1,.1];let peak=-1;
  for(let i=0;i<pixels.data.length;i+=4){if((i&16383)===0)checkAbort(signal);if(!pixels.data[i+3])continue;
    const l=pixels.data[i]+pixels.data[i+1]+pixels.data[i+2];if(l>peak){peak=l;for(let c=0;c<3;c++)air[c]=Math.max(.1,srgbToLinear(pixels.data[i+c]/255));}}
  const {width,height,data}=pixels;
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const o=(y*width+x)*4;if(!data[o+3])continue;let dark=1;
    if(dehaze>0)for(let dy=-2;dy<=2;dy+=2)for(let dx=-2;dx<=2;dx+=2){
      const xx=clamp(x+dx,0,width-1),yy=clamp(y+dy,0,height-1),at=(yy*width+xx)*4;if(!data[at+3])continue;
      for(let c=0;c<3;c++)dark=Math.min(dark,srgbToLinear(data[at+c]/255)/air[c]);}
    const transmission=Math.max(.12,1-.92*(dehaze/100)*dark);
    for(let c=0;c<3;c++){
      const value=srgbToLinear(data[o+c]/255);
      const restored=dehaze>0?(value-air[c])/transmission+air[c]:value*(1+dehaze/200)-air[c]*dehaze/200;
      const encoded=clamp(linearToSrgb(clamp(restored)));
      out.data[o+c]=Math.round(255*encoded**(2**(-brightness/100)));
    }
  }}return out;
}
const ILLUMINANTS=Object.freeze({daylight:[1,1,1],cloudy:[1.08,1,.91],shade:[1.16,1,.82],
  tungsten:[.72,1,1.5],fluorescent:[1.04,.9,1.18],flash:[1.03,1,.96]});
/** Gray-world/explicit neutral-region gains are in linear RGB. Illuminant
 * presets are SUITE display approximations, not camera-specific RAW matrices. */
export function estimateWhiteBalance(pixels,{mode='auto',mask}={}, {signal}={}){
  assertPixels(pixels);selection(mask,pixels);
  if(Object.hasOwn(ILLUMINANTS,mode))return {gains:[...ILLUMINANTS[mode]],domain:'linear-rec709',method:mode};
  if(!['auto','selector'].includes(mode)||mode==='selector'&&!mask)throw Error('WB_MODE_OR_SELECTION');
  const sums=[0,0,0];let n=0;
  for(let i=0;i<pixels.width*pixels.height;i++){
    if((i&16383)===0)checkAbort(signal);const o=i*4,w=(mask?mask[i]/255:1)*pixels.data[o+3]/255;if(!w)continue;
    if(Math.max(pixels.data[o],pixels.data[o+1],pixels.data[o+2])>250||Math.min(pixels.data[o],pixels.data[o+1],pixels.data[o+2])<3)continue;
    for(let c=0;c<3;c++)sums[c]+=srgbToLinear(pixels.data[o+c]/255)*w;n+=w;
  }
  if(n<1||sums.some(v=>v<=0))throw Error('WB_NO_NEUTRAL_EVIDENCE');
  const target=sums.reduce((a,b)=>a+b,0)/3;
  return {gains:sums.map(v=>clamp(target/v,.25,4)),domain:'linear-rec709',method:mode};
}
export function applyWhiteBalance(pixels,estimate,{signal}={}){
  assertPixels(pixels);
  if(estimate?.domain!=='linear-rec709'||!Array.isArray(estimate.gains)||estimate.gains.length!==3||
    estimate.gains.some(v=>!Number.isFinite(v)||v<.25||v>4))throw Error('WB_GAINS_INVALID');
  const out=copy(pixels);for(let i=0;i<out.data.length;i+=4){if((i&16383)===0)checkAbort(signal);if(!out.data[i+3])continue;
    for(let c=0;c<3;c++)out.data[i+c]=Math.round(clamp(linearToSrgb(srgbToLinear(pixels.data[i+c]/255)*estimate.gains[c]))*255);}
  return out;
}
/** Float32 linear RGB already decoded from RAW/HDR, not a Bayer demosaic API. */
export function applyLinearWhiteBalance(frame,estimate,{signal}={}){
  const source=createHDRFrame({width:frame.width,height:frame.height,pixels:frame.pixels,colorSpace:frame.colorSpace,
    sourceEncoding:frame.sourceEncoding,sdrWhiteNits:frame.sdrWhiteNits,headroomStops:frame.headroomStops,signal});
  if(estimate?.domain!=='linear-rec709'||!Array.isArray(estimate.gains)||estimate.gains.length!==3||
    estimate.gains.some(v=>!Number.isFinite(v)||v<.25||v>4))throw Error('WB_GAINS_INVALID');
  const pixels=source.pixels;for(let i=0;i<pixels.length;i++){if((i&16383)===0)checkAbort(signal);pixels[i]*=estimate.gains[i%3];}
  return createHDRFrame({width:source.width,height:source.height,pixels,colorSpace:source.colorSpace,
    sourceEncoding:source.sourceEncoding,sdrWhiteNits:source.sdrWhiteNits,headroomStops:source.headroomStops,signal});
}
function colorStats(p,mask,signal){assertPixels(p);selection(mask,p);const sum=[0,0,0],sq=[0,0,0];let n=0;
  for(let i=0;i<p.width*p.height;i++){if((i&16383)===0)checkAbort(signal);const o=i*4,w=(mask?mask[i]/255:1)*p.data[o+3]/255;
    n+=w;for(let c=0;c<3;c++){const v=p.data[o+c]/255;sum[c]+=v*w;sq[c]+=v*v*w;}}
  if(n<1)throw Error('COLOR_MATCH_EMPTY');const mean=sum.map(v=>v/n);
  return {mean,std:sq.map((v,c)=>Math.sqrt(Math.max(1e-5,v/n-mean[c]**2)))};}
/** Reference/background consistency is explicit regional distribution matching;
 * arbitrary learned Looks continue to use the existing paired-look processor. */
export function estimateSceneMatch(pixels,reference,{sourceMask,referenceMask,amount=1,signal}={}){
  if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('COLOR_MATCH_AMOUNT');
  const a=colorStats(pixels,sourceMask,signal),b=colorStats(reference,referenceMask,signal);
  const scale=a.std.map((v,c)=>clamp(b.std[c]/v,.5,2));
  return {scale,offset:a.mean.map((v,c)=>b.mean[c]-v*scale[c]),amount};
}
export function validateSceneMatch(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(settings))||
      Reflect.ownKeys(settings).length!==3||Reflect.ownKeys(settings).some(k=>!['scale','offset','amount'].includes(k)))throw Error('COLOR_MATCH_SETTINGS');
  for(const key of ['scale','offset','amount']){
    const d=Object.getOwnPropertyDescriptor(settings,key);
    if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('COLOR_MATCH_SETTINGS');
  }
  for(const [key,min,max] of [['scale',.5,2],['offset',-2,1]]){
    const values=settings[key];
    if(!Array.isArray(values)||values.length!==3||Reflect.ownKeys(values).length!==4)throw Error('COLOR_MATCH_SETTINGS');
    for(let c=0;c<3;c++){
      const d=Object.getOwnPropertyDescriptor(values,String(c));
      if(!d?.enumerable||!Object.hasOwn(d,'value')||!Number.isFinite(d.value)||d.value<min||d.value>max)throw Error('COLOR_MATCH_SETTINGS');
    }
  }
  if(!Number.isFinite(settings.amount)||settings.amount<0||settings.amount>1)throw Error('COLOR_MATCH_AMOUNT');
  return {scale:[...settings.scale],offset:[...settings.offset],amount:settings.amount};
}
/** Fixed encoded-sRGB channel distribution transform. No reference image is
 * needed during rendering; alpha and transparent hidden RGB remain unchanged. */
export function applySceneMatch(pixels,settings,{sourceMask,signal}={}){
  assertPixels(pixels);selection(sourceMask,pixels);checkAbort(signal);
  const {scale,offset,amount}=validateSceneMatch(settings),out=copy(pixels);
  for(let i=0;i<pixels.width*pixels.height;i++){if((i&16383)===0)checkAbort(signal);const o=i*4,w=amount*(sourceMask?sourceMask[i]/255:1);
    if(!pixels.data[o+3]||!w)continue;for(let c=0;c<3;c++){
      const target=clamp(pixels.data[o+c]/255*scale[c]+offset[c]);
      out.data[o+c]=Math.round(pixels.data[o+c]*(1-w)+target*255*w);}}
  return out;
}
export function matchSceneColor(pixels,reference,{sourceMask,referenceMask,amount=1,signal}={}){
  const settings=estimateSceneMatch(pixels,reference,{sourceMask,referenceMask,amount,signal});
  return applySceneMatch(pixels,settings,{sourceMask,signal});
}
export const applySceneLearnedLook=applyPersonalizedLook;
export function matchSceneSeries(images,reference,options={}){
  if(!Array.isArray(images)||!images.length||images.length>20)throw Error('COLOR_SERIES_LIMIT');
  return images.map(image=>matchSceneColor(image.pixels,reference,{...options,sourceMask:image.mask}));
}
