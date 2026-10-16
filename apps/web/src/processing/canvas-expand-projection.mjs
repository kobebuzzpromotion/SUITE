import {planCanvasExpansion,planCanvasExpansionGeometry} from './canvas-expand.mjs';
import {checkAbort} from './pure.mjs';

const MARGIN_KEYS=['left','right','top','bottom'];
const MAX_NORMALIZED_MARGIN=4;

function plainObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value));
}

/**
 * Project Recipe margins onto the CURRENT rendered frame. Call this after
 * rotation and Crop for both Proxy and Final. Horizontal fractions use the
 * post-Crop width; vertical fractions use its height. Never use sourceWidth
 * or sourceHeight here: those describe the unedited upright Original.
 *
 * Recipe settings: {schemaVersion:1,margins:{left,right,top,bottom},background?}
 * Each margin is a fraction from 0 through 4. The returned integer settings
 * can be passed directly to expandCanvasPixels. planCanvasExpansion performs
 * the same output-size and working-memory preflight before any pixel work.
 */
export function projectCanvasExpansion(source,settings,{signal}={}){
  const options=projectCanvasExpansionGeometry(source,settings,{signal});
  planCanvasExpansion(source,options);
  checkAbort(signal);
  return options;
}

/** Same normalized Recipe contract, for allocation-free dimension readouts.
 * Does not authorize an actual render; use projectCanvasExpansion for pixels. */
export function projectCanvasExpansionGeometry(source,settings,{signal}={}){
  checkAbort(signal);
  if(!plainObject(settings)||settings.schemaVersion!==1||
    Object.keys(settings).some(key=>!['schemaVersion','margins','background'].includes(key))||
    !plainObject(settings.margins)||
    Object.keys(settings.margins).length!==MARGIN_KEYS.length||
    MARGIN_KEYS.some(key=>!Object.hasOwn(settings.margins,key)))throw Error('CANVAS_PROJECTION_SETTINGS_INVALID');
  const margins={};
  for(const key of MARGIN_KEYS){
    const fraction=settings.margins[key];
    if(typeof fraction!=='number'||!Number.isFinite(fraction)||fraction<0||fraction>MAX_NORMALIZED_MARGIN)
      throw Error('CANVAS_PROJECTION_MARGIN_INVALID');
    const edge=key==='left'||key==='right'?source?.width:source?.height;
    margins[key]=Math.round(edge*fraction);
    if(!Number.isSafeInteger(margins[key]))throw Error('CANVAS_PROJECTION_MARGIN_INVALID');
  }
  if(Object.hasOwn(settings,'background')&&!Array.isArray(settings.background))
    throw Error('CANVAS_BACKGROUND_INVALID');
  const options={margins,background:Object.hasOwn(settings,'background')?settings.background:[0,0,0,0]};
  const plan=planCanvasExpansionGeometry(source,options);
  checkAbort(signal);
  return Object.freeze({margins:Object.freeze({...margins}),background:plan.background});
}
