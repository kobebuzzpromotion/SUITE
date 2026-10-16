import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {blendTeethBrightnessDesaturation} from './web-manual-teeth-kernel.mjs';
import {validateWebManualTeeth} from '../../../../dist/apps/backend/src/web-manual-teeth.js';
export {validateWebManualTeeth,LOCAL_BRUSH_VERSION};
export const WEB_MANUAL_TEETH_VERSION='suite-web-manual-teeth-1';
/** Ordinary user-painted correction, separate from person-bound teethManual.
 * Actual frame <=24MP; source metadata is validated by assertPixels. */
export function applyWebManualTeeth(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebManualTeeth(settings);checkAbort(signal);
  const coverage=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,
    workBudget:{remaining:96_000_000},signal}).data;
  let selected=false;
  for(let i=0;i<coverage.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])coverage[i]=0;else if(coverage[i])selected=true;}
  if(!selected)throw Error('WEB_MANUAL_TEETH_EMPTY_MASK');
  return blendTeethBrightnessDesaturation(pixels,coverage,{brightness:settings.brightness,desaturation:settings.desaturation},{signal});
}
