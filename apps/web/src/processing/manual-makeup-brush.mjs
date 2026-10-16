import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {blendMakeupChannel} from './manual-blush-color.mjs';
import {validateManualMakeup} from '../../../../dist/apps/backend/src/manual-makeup-brush.js';
export {validateManualMakeup};
export const MANUAL_MAKEUP_VERSION='suite-manual-makeup-brush-1';
export const MANUAL_MAKEUP_LAYERS_VERSION='suite-manual-makeup-brush-2';
export {LOCAL_BRUSH_VERSION};

/** User-painted color, not face recognition or semantic cheek segmentation.
 * Apply on the upright untransformed frame before geometry/crop. Same normalized
 * strokes feed Proxy and Final; existing brush capacity/work guards remain.
 */
export function applyManualMakeup(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualMakeup(settings);checkAbort(signal);
  const data=new Uint8ClampedArray(pixels.data);
  const layers=settings.schemaVersion===2?settings.layers:[settings];
  const workBudget={remaining:96_000_000};
  for(const layer of layers){
  if(layer.opacity===0)continue;
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:layer.strokes,signal,workBudget});
  const color=[layer.color.r,layer.color.g,layer.color.b];
  for(let y=0;y<pixels.height;y++){
    checkAbort(signal);
    for(let x=0;x<pixels.width;x++){
      const at=y*pixels.width+x,i=at*4;
      if(!mask.data[at]||data[i+3]===0)continue;
      const weight=mask.data[at]/255*layer.opacity;
      for(let c=0;c<3;c++)data[i+c]=blendMakeupChannel(data[i+c],color[c],weight);
    }
  }
  }
  checkAbort(signal);return {...pixels,data};
}
