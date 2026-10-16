import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {validateLocalLUTMask} from '../../../../dist/apps/backend/src/local-lut-mask.js';
export {validateLocalLUTMask,LOCAL_BRUSH_VERSION};
export const LOCAL_LUT_MASK_VERSION='suite-local-lut-mask-1';

/** Blend already intensity-adjusted LUT RGB in encoded sRGB. The ungraded
 * frame owns alpha, hidden transparent RGB and all source metadata. Neither
 * input is modified; this function never repeats LUT/profile intensity. */
export function blendLocalLUTMask(before,graded,doc,{signal}={}){
  assertPixels(before);assertPixels(graded);validateLocalLUTMask(doc);checkAbort(signal);
  if(before.width!==graded.width||before.height!==graded.height)throw Error('LOCAL_LUT_MASK_DIMENSIONS_MISMATCH');
  const mask=rasterizeLocalBrushMask({width:before.width,height:before.height,strokes:doc.strokes,
    workBudget:{remaining:96_000_000},signal}).data;
  const data=before.data.slice();
  for(let y=0;y<before.height;y++){
    checkAbort(signal);
    for(let x=0;x<before.width;x++){
      const index=y*before.width+x,at=index*4;
      if(!before.data[at+3])continue;
      const coverage=(doc.invert?255-mask[index]:mask[index])/255;
      if(!coverage)continue;
      for(let channel=0;channel<3;channel++)data[at+channel]=Math.round(before.data[at+channel]+(graded.data[at+channel]-before.data[at+channel])*coverage);
    }
  }
  checkAbort(signal);return {...before,data};
}
