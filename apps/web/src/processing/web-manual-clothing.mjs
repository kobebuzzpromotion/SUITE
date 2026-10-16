import {assertPixels,sourceDimensions,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {applyClothingAdjustments} from './clothing-adjustments.mjs';
import {validateWebManualClothing} from '../../../../dist/apps/backend/src/web-manual-clothing.js';
export {validateWebManualClothing,LOCAL_BRUSH_VERSION};
export const WEB_MANUAL_CLOTHING_VERSION='suite-web-manual-clothing-1';

/** Hand-painted wrinkle frequency reduction, not garment recognition or
 * reconstruction. Source-pixel radius scales to Proxy just like manualSkin.
 * A 4r halo covers the largest independent box mean. Every core samples the
 * immutable input; the existing 8MP kernel never receives a full 24MP image. */
export function applyWebManualClothing(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebManualClothing(settings);checkAbort(signal);
  const source=sourceDimensions(pixels),scale=Math.min(pixels.width,pixels.height)/Math.min(source.width,source.height);
  const radius=Math.max(1,Math.min(32,Math.round(settings.radius*scale))),halo=radius*4;
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,
    workBudget:{remaining:96_000_000},signal}).data;
  let selected=false;
  for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])mask[i]=0;else if(mask[i])selected=true;}
  if(!selected)throw Error('WEB_MANUAL_CLOTHING_EMPTY_MASK');
  const data=pixels.data.slice();
  if(settings.dewrinkle===0){checkAbort(signal);return {...pixels,data};}
  for(let top=0;top<pixels.height;top+=512)for(let left=0;left<pixels.width;left+=512){
    checkAbort(signal);const right=Math.min(pixels.width,left+512),bottom=Math.min(pixels.height,top+512);
    let occupied=false;
    for(let y=top;y<bottom&&!occupied;y++)for(let x=left;x<right;x++)if(mask[y*pixels.width+x]){occupied=true;break;}
    if(!occupied)continue;
    const x0=Math.max(0,left-halo),y0=Math.max(0,top-halo),x1=Math.min(pixels.width,right+halo),y1=Math.min(pixels.height,bottom+halo);
    const width=x1-x0,height=y1-y0,tileData=new Uint8ClampedArray(width*height*4),tileMask=new Uint8Array(width*height);
    for(let y=0;y<height;y++){
      checkAbort(signal);const at=(y0+y)*pixels.width+x0;
      tileData.set(pixels.data.subarray(at*4,(at+width)*4),y*width*4);tileMask.set(mask.subarray(at,at+width),y*width);
    }
    const result=applyClothingAdjustments({width,height,data:tileData},tileMask,
      {dewrinkle:settings.dewrinkle,fineWrinkles:settings.fineWrinkles,coarseWrinkles:settings.coarseWrinkles,
        radius,blemishes:0,edgeSmoothing:0},{signal});
    for(let y=top;y<bottom;y++){
      checkAbort(signal);
      for(let x=left;x<right;x++){
        const at=y*pixels.width+x;if(!mask[at])continue;const local=((y-y0)*width+x-x0)*4;
        for(let c=0;c<3;c++)data[at*4+c]=result.data[local+c];
      }
    }
  }
  checkAbort(signal);return {...pixels,data};
}
