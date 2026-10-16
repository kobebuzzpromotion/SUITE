import {assertPixels,checkAbort} from './pure.mjs';
import {HSL_COLORS,hueWeights,validateColorAdjustments} from './color-adjustments.mjs';

/** Pixel-space After-image sample, not screen/Crop/Before coordinates. The host
 * must map the pointer into this exact frame before calling. Returns JSON data
 * suitable for a draft; this module does not save a Recipe or select another photo. */
export function sampleHSLSelector(pixels,{x,y,radius=1},{signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=pixels.width||y<0||y>=pixels.height||
    !Number.isInteger(radius)||radius<0||radius>16)throw Error('HSL_SAMPLE_COORDINATES');
  const rgb=[0,0,0];let weight=0;
  for(let yy=Math.max(0,y-radius);yy<=Math.min(pixels.height-1,y+radius);yy++){
    checkAbort(signal);for(let xx=Math.max(0,x-radius);xx<=Math.min(pixels.width-1,x+radius);xx++){
      const o=(yy*pixels.width+xx)*4,a=pixels.data[o+3]/255;weight+=a;
      for(let c=0;c<3;c++)rgb[c]+=pixels.data[o+c]*a;
    }}
  if(!weight)throw Error('HSL_SAMPLE_TRANSPARENT');
  for(let c=0;c<3;c++)rgb[c]/=weight*255;
  const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;
  if(d<1/255)throw Error('HSL_SAMPLE_ACHROMATIC');
  const sector=max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4;
  const hue=((sector*60)%360+360)%360;
  return {schemaVersion:1,sampleRGB:rgb.map(v=>Math.round(v*255)),hue,
    weights:hueWeights(hue),coordinateSpace:'current-rgba8-frame',width:pixels.width,height:pixels.height};
}
/** Least-norm update across the existing adjacent HSL bands. The selected hue's
 * weighted change equals delta until a legacy [-100,100] endpoint is reached. */
export function adjustHSLSelection(current,selection,{channel,delta}){
  if(!selection||selection.schemaVersion!==1||!Number.isFinite(selection.hue)||
      !['hue','saturation','luminance'].includes(channel)||!Number.isFinite(delta)||Math.abs(delta)>200)
    throw Error('HSL_SELECTION_INVALID');
  const weights=hueWeights(selection.hue),params=validateColorAdjustments({hsl:current}).hsl;
  const norm=weights.reduce((s,w)=>s+w*w,0);
  for(let i=0;i<weights.length;i++)params[HSL_COLORS[i]][channel]=
    Math.max(-100,Math.min(100,params[HSL_COLORS[i]][channel]+delta*weights[i]/norm));
  return params;
}
