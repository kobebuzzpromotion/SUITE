import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {buildPortraitField,renderPortraitField} from './delta66-portrait-warp.mjs';
import {certifyLiquifyField} from './web-manual-liquify-map.mjs';
import {validateWebManualLiquify} from '../../../../dist/apps/backend/src/web-manual-liquify.js';
export {validateWebManualLiquify,LOCAL_BRUSH_VERSION};
export const WEB_MANUAL_LIQUIFY_VERSION='suite-web-manual-liquify-1';
/** Nonsemantic whole-raster warp. No isolated-body inpainting or fake face ID.
 * Existing 8MP/128 operation/128M work limits remain. Neutral operations are
 * valid. Source metadata can exceed actual raster size, never its allocation cap. */
export function applyWebManualLiquify(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebManualLiquify(settings);checkAbort(signal);
  if(pixels.width*pixels.height>8_000_000)throw Error('WEB_LIQUIFY_FRAME_CAPACITY');
  const coverage=settings.freezeStrokes.length?rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,
    strokes:settings.freezeStrokes,workBudget:{remaining:96_000_000},signal}).data:undefined;
  // Existing Liquify freeze is a hard lock, not an opacity-blended displacement.
  let protection;
  if(coverage){protection=new Uint8Array(coverage.length);for(let i=0;i<coverage.length;i++){if(!(i&16383))checkAbort(signal);protection[i]=coverage[i]?255:0;}}
  const requested=buildPortraitField(pixels,settings.operations,{protection,pinEdges:true,signal});
  const result=renderPortraitField(pixels,requested,{protection,signal});
  // Never return partially usable output when actual mapping fails certification.
  certifyLiquifyField(result.field,{signal});checkAbort(signal);
  return {pixels:result.pixels,field:result.field};
}
