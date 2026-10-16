import {assertPixels,checkAbort,srgbToLinear,linearToSrgb} from './pure.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const BANDS=['shadows','midtones','highlights'],WHEELS=['global',...BANDS];
export const COLOR_GRADING_ALGORITHM='suite-linear-chroma-tonal-wheels-1';
function range(v,a,b){if(!Number.isFinite(v)||v<a||v>b)throw Error('COLOR_GRADING_RANGE');return v;}
function record(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error('COLOR_GRADING_FIELDS');}
export function validateColorGrading(input={}){
  record(input,[...WHEELS,'blending','balance','amount']);const out={blending:range(input.blending??50,0,100),balance:range(input.balance??0,-100,100),amount:range(input.amount??1,0,1)};
  for(const k of WHEELS){const v=input[k]??{};record(v,['hue','saturation','luminance']);out[k]={hue:range(v.hue??0,0,360)%360,saturation:range(v.saturation??0,0,100),luminance:range(v.luminance??0,-100,100)};}return out;
}
/** Positive balance increases highlight influence. Blending interpolates from
 * narrow triangular bands to overlapping Bernstein weights. Weights sum to 1.
 * This is a SUITE definition, not a reconstruction of Adobe's private curves. */
export function colorGradingWeights(luminance,{blending=50,balance=0}={}){
  range(luminance,0,1);range(blending,0,100);range(balance,-100,100);const x=clamp(luminance+balance/400),b=blending/100;
  const narrow=[Math.max(0,1-2*x),1-Math.abs(2*x-1),Math.max(0,2*x-1)],wide=[(1-x)**2,2*x*(1-x),x*x];
  return narrow.map((v,i)=>v*(1-b)+wide[i]*b);
}
function wheelColor(wheel){const h=wheel.hue/60,x=1-Math.abs(h%2-1),rgb=h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:h<4?[0,x,1]:h<5?[x,0,1]:[1,0,x];
  const y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];return rgb.map(v=>(v-y)*wheel.saturation/100*.2);}
/** Global and three tonal wheels, hue/saturation/luminance, blend and balance.
 * Existing portrait grade() only supports fixed RGB offsets; this separate
 * wheel kernel supplies missing controls without changing that saved behavior.
 * Sampling remains on original luminance. Alpha and transparent hidden RGB are
 * preserved; gamut compression scales chroma rather than clipping hue channels.
 */
export function applyColorGrading(pixels,input={}, {mask,signal}={}){
  assertPixels(pixels);checkAbort(signal);const p=validateColorGrading(input),data=pixels.data.slice(),n=pixels.width*pixels.height;
  if(mask!==undefined&&(!(mask instanceof Uint8Array)||mask.length!==n))throw Error('COLOR_GRADING_MASK');
  if(!p.amount||WHEELS.every(k=>!p[k].saturation&&!p[k].luminance))return {...pixels,data};
  const colors=Object.fromEntries(WHEELS.map(k=>[k,wheelColor(p[k])]));
  for(let i=0;i<n;i++){if(!(i&16383))checkAbort(signal);const o=i*4;if(!data[o+3])continue;const amount=p.amount*(mask?mask[i]/255:1);if(!amount)continue;
    const rgb=[0,1,2].map(c=>srgbToLinear(pixels.data[o+c]/255)),y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    const weights=colorGradingWeights(y,p),l=clamp((p.global.luminance+BANDS.reduce((s,k,j)=>s+p[k].luminance*weights[j],0))/100,-1,1);
    const targetY=l>=0?y+(1-y)*l*.5:y*(1+l*.5);
    const chroma=rgb.map((v,c)=>v-y+colors.global[c]+BANDS.reduce((s,k,j)=>s+colors[k][c]*weights[j],0));
    let compression=1;for(const c of chroma)if(c>0)compression=Math.min(compression,(1-targetY)/c);else if(c<0)compression=Math.min(compression,-targetY/c);
    for(let c=0;c<3;c++){const graded=targetY+chroma[c]*compression;data[o+c]=Math.round(255*clamp(linearToSrgb(rgb[c]+(graded-rgb[c])*amount)));}
  }checkAbort(signal);return {...pixels,data};
}
export function resetColorGrading(){return validateColorGrading({});}
