import {validateWebLensShading} from '../../../../dist/apps/backend/src/web-connected-lens.js';
import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {applyLensCorrection} from './lr-lens-correction.mjs';
import {createLensCoordinateMap} from './lens-coordinate.mjs';
export {validateWebLensShading};
/** Upright, uncropped sRGB8 only. Profile is user-supplied, not certified here.
 * Legacy shading stage stays before local edits. Geometry/CA is a separate stage. */
export function applyWebLensShading(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebLensShading(settings);checkAbort(signal);
  const source=sourceDimensions(pixels);
  if(Math.abs(source.width/source.height/settings.profile.aspectRatio-1)>.002||Math.abs(pixels.width/pixels.height/settings.profile.aspectRatio-1)>.002)throw Error('LENS_FRAME_OR_SETTINGS_INVALID');
  if(settings.shading===0)return {...pixels,data:new Uint8ClampedArray(pixels.data)};
  const result=applyLensCorrection(pixels,settings.profile,{distortion:0,chromatic:0,shading:settings.shading,maximumGain:settings.maximumGain,constrainCrop:false,signal});
  assertPixels(result.frame);checkAbort(signal);
  if(result.frame.width!==pixels.width||result.frame.height!==pixels.height)throw Error('LENS_SHADING_DIMENSIONS_CHANGED');
  return {...pixels,data:result.frame.data};
}

/** After source-space local edits/Liquify, before sceneGeometry/rotation/Crop.
 * No hidden crop and no second shading application. */
export function applyWebLensGeometry(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebLensShading(settings);checkAbort(signal);
  const source=sourceDimensions(pixels);
  if(Math.abs(source.width/source.height/settings.profile.aspectRatio-1)>.002)throw Error('LENS_FRAME_OR_SETTINGS_INVALID');
  createLensCoordinateMap(settings,pixels.width,pixels.height);
  const distortion=settings.distortion??0,chromatic=settings.chromatic??0;
  if(!distortion&&!chromatic)return {...pixels,data:pixels.data.slice()};
  const result=applyLensCorrection(pixels,settings.profile,{distortion,chromatic,shading:0,maximumGain:settings.maximumGain,constrainCrop:false,signal});
  assertPixels(result.frame);checkAbort(signal);
  if(result.frame.width!==pixels.width||result.frame.height!==pixels.height)throw Error('LENS_SHADING_DIMENSIONS_CHANGED');
  return {...pixels,data:result.frame.data};
}
