import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {healPortraitClone24MP} from './delta66-portrait-repair.mjs';
import {validateManualClone} from '../../../../dist/apps/backend/src/manual-clone.js';
export {validateManualClone,LOCAL_BRUSH_VERSION};
export const MANUAL_CLONE_VERSION='suite-manual-clone-1';
export const MANUAL_CLONE_MAX_PIXELS=24_000_000;

/** One immutable donor frame, before geometric transforms. No inference, face
 * identity or reconstruction. Normalized donor displacement scales per frame. */
export function applyManualClone(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualClone(settings);checkAbort(signal);
  // Source metadata can exceed the actual Proxy raster. assertPixels retains
  // canonical metadata validation; this limit bounds actual clone allocations.
  if(pixels.width*pixels.height>MANUAL_CLONE_MAX_PIXELS)
    throw Error('MANUAL_CLONE_SOURCE_CAPACITY');
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,signal});
  const offsetX=settings.offset.dx*pixels.width,offsetY=settings.offset.dy*pixels.height;
  // The lower-level kernel skips out-of-frame donors. This product contract
  // instead rejects the complete edit, so no selected region silently disappears.
  for(let y=0;y<pixels.height;y++){
    checkAbort(signal);
    for(let x=0;x<pixels.width;x++)if(mask.data[y*pixels.width+x]){
      const sx=x+offsetX,sy=y+offsetY;
      if(sx<0||sy<0||sx>pixels.width-1||sy>pixels.height-1)throw Error('MANUAL_CLONE_DONOR_OUTSIDE');
    }
  }
  return healPortraitClone24MP(pixels,mask.data,{offsetX,offsetY,heal:settings.heal,opacity:settings.opacity,signal});
}
