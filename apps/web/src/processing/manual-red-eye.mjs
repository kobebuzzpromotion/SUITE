import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {enhancePortraitEyes} from './delta66-portrait-eye-hair.mjs';
import {validateManualRedEye} from '../../../../dist/apps/backend/src/manual-red-eye.js';
export {validateManualRedEye,LOCAL_BRUSH_VERSION};
export const MANUAL_RED_EYE_VERSION='suite-manual-red-eye-1';

/** User-painted red excess suppression, not an iris detector. Only the
 * pointwise redEye control is active, so tiles require no neighborhood halo.
 * The existing region kernel's 8MP limit remains intact; actual frame <=24MP. */
export function applyManualRedEye(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualRedEye(settings);checkAbort(signal);
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,
    workBudget:{remaining:96_000_000},signal}).data;
  let selected=false;
  for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])mask[i]=0;else if(mask[i])selected=true;}
  if(!selected)throw Error('MANUAL_RED_EYE_EMPTY_MASK');
  const data=pixels.data.slice();if(!settings.amount)return {...pixels,data};
  for(let top=0;top<pixels.height;top+=512)for(let left=0;left<pixels.width;left+=512){
    checkAbort(signal);const width=Math.min(512,pixels.width-left),height=Math.min(512,pixels.height-top);
    let occupied=false;
    for(let y=0;y<height&&!occupied;y++)for(let x=0;x<width;x++)if(mask[(top+y)*pixels.width+left+x]){occupied=true;break;}
    if(!occupied)continue;
    const tileData=new Uint8ClampedArray(width*height*4),tileMask=new Uint8Array(width*height);
    for(let y=0;y<height;y++){checkAbort(signal);const at=(top+y)*pixels.width+left;
      tileData.set(pixels.data.subarray(at*4,(at+width)*4),y*width*4);tileMask.set(mask.subarray(at,at+width),y*width);}
    const result=enhancePortraitEyes({width,height,data:tileData},{iris:tileMask},{redEye:settings.amount,signal});
    for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
      const local=y*width+x;if(!tileMask[local])continue;const at=((top+y)*pixels.width+left+x)*4;
      for(let c=0;c<3;c++)data[at+c]=result.data[local*4+c];}}
  }
  checkAbort(signal);return {...pixels,data};
}
