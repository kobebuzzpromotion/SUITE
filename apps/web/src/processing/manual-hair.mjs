import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {recolorPortraitHair} from './delta66-portrait-eye-hair.mjs';
import {validateManualHair} from '../../../../dist/apps/backend/src/manual-hair.js';
export {validateManualHair,LOCAL_BRUSH_VERSION};
export const MANUAL_HAIR_VERSION='suite-manual-hair-1';

/** User-selected color, shine and smoothing, never segmentation. The shared
 * kernel uses radius 3 and computes neighborhoods up to 4*radius: smoothing
 * tiles carry a 12px halo from immutable input and write only their core.
 * Optional gray coverage is independent: the existing kernel intersects it
 * with hair exactly once. Preserve the kernel's 8MP limit with <=536-square
 * rasters; actual complete frames remain capped at 24MP. Omitted smooth is 0. */
export function applyManualHair(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualHair(settings);checkAbort(signal);
  const workBudget={remaining:96_000_000};
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,
    workBudget,signal}).data;
  let selected=false;
  for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])mask[i]=0;else if(mask[i])selected=true;}
  if(!selected)throw Error('MANUAL_HAIR_EMPTY_MASK');
  const blacken=settings.blacken??0;
  const grayMask=settings.grayStrokes?.length?rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,
    strokes:settings.grayStrokes,workBudget,signal}).data:null;
  if(blacken){
    let overlap=false;
    for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(mask[i]&&grayMask?.[i]){overlap=true;break;}}
    if(!overlap)throw Error('MANUAL_HAIR_GRAY_OVERLAP_EMPTY');
  }
  const smooth=settings.smooth??0,halo=smooth?12:0;
  const data=pixels.data.slice();if(!settings.amount&&!settings.shine&&!smooth&&!blacken)return {...pixels,data};
  for(let top=0;top<pixels.height;top+=512)for(let left=0;left<pixels.width;left+=512){
    checkAbort(signal);const right=Math.min(pixels.width,left+512),bottom=Math.min(pixels.height,top+512);
    let occupied=false;
    for(let y=top;y<bottom&&!occupied;y++)for(let x=left;x<right;x++)if(mask[y*pixels.width+x]){occupied=true;break;}
    if(!occupied)continue;
    const x0=Math.max(0,left-halo),y0=Math.max(0,top-halo),x1=Math.min(pixels.width,right+halo),y1=Math.min(pixels.height,bottom+halo);
    const width=x1-x0,height=y1-y0;
    const tileData=new Uint8ClampedArray(width*height*4),tileMask=new Uint8Array(width*height);
    const tileGray=grayMask?new Uint8Array(width*height):undefined;
    for(let y=0;y<height;y++){checkAbort(signal);const at=(y0+y)*pixels.width+x0;
      tileData.set(pixels.data.subarray(at*4,(at+width)*4),y*width*4);tileMask.set(mask.subarray(at,at+width),y*width);
      if(tileGray)tileGray.set(grayMask.subarray(at,at+width),y*width);}
    const result=recolorPortraitHair({width,height,data:tileData},tileMask,{color:[settings.color.r,settings.color.g,settings.color.b],amount:settings.amount,shine:settings.shine,smooth,grayMask:tileGray,blacken,signal});
    for(let y=top;y<bottom;y++){checkAbort(signal);for(let x=left;x<right;x++){
      const local=(y-y0)*width+x-x0;if(!tileMask[local])continue;const at=(y*pixels.width+x)*4;
      for(let c=0;c<3;c++)data[at+c]=result.data[local*4+c];}}
  }
  checkAbort(signal);return {...pixels,data};
}
