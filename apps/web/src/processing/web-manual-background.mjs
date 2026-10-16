import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {refineSolidScene} from './delta66-scene-background.mjs';
import {validateWebManualBackground} from '../../../../dist/apps/backend/src/web-manual-background.js';
export {validateWebManualBackground,LOCAL_BRUSH_VERSION};
export const WEB_MANUAL_BACKGROUND_VERSION='suite-web-manual-background-1';
/** User-painted solid-background correction, not automatic extraction. The
 * existing kernel radius is in actual raster pixels, not physical dimensions. */
export function applyWebManualBackground(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebManualBackground(settings);checkAbort(signal);
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,
    workBudget:{remaining:96_000_000},signal}).data;
  let selected=false;
  for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])mask[i]=0;else if(mask[i])selected=true;}
  if(!selected)throw Error('WEB_MANUAL_BACKGROUND_EMPTY_MASK');
  return refineSolidScene(pixels,mask,{lighting:settings.lighting,banding:settings.banding,signal});
}
