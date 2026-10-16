import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {enhancePortraitEyes} from './delta66-portrait-eye-hair.mjs';
import {validateManualEyes} from '../../../../dist/apps/backend/src/manual-eyes.js';
export {validateManualEyes,LOCAL_BRUSH_VERSION};
export const MANUAL_EYES_VERSION='suite-manual-eyes-1';

/** All three hand-painted masks enter one pointwise operation. This preserves
 * overlap arithmetic (no repeated rounding or sequential saturation). No AI,
 * anatomical verification, catchlight, iris geometry, or red-eye correction.
 * Existing 8MP region limit stays unchanged; bounded tiles support 24MP frames. */
export function applyManualEyes(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualEyes(settings);checkAbort(signal);
  const keys=['eye','sclera','iris'].filter(key=>Object.hasOwn(settings.regions,key));
  const masks={},workBudget={remaining:96_000_000};
  for(const key of keys){
    checkAbort(signal);
    const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,
      strokes:settings.regions[key].strokes,workBudget,signal}).data;
    let selected=false;
    for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);if(!pixels.data[i*4+3])mask[i]=0;else if(mask[i])selected=true;}
    if(!selected){const error=Error('MANUAL_EYES_EMPTY_MASK');error.region=key;throw error;}
    masks[key]=mask;
  }
  const controls={overall:settings.regions.eye?.amount??0,whites:settings.regions.sclera?.amount??0,
    colorEnhancement:settings.regions.iris?.amount??0,irisBrightness:0,reflection:0,flare:0,redEye:0,cleanse:0,signal};
  const data=pixels.data.slice();
  if(!controls.overall&&!controls.whites&&!controls.colorEnhancement){checkAbort(signal);return {...pixels,data};}
  for(let top=0;top<pixels.height;top+=512)for(let left=0;left<pixels.width;left+=512){
    checkAbort(signal);const width=Math.min(512,pixels.width-left),height=Math.min(512,pixels.height-top);
    let occupied=false;
    for(let y=0;y<height&&!occupied;y++)for(let x=0;x<width;x++){
      const at=(top+y)*pixels.width+left+x;if(keys.some(key=>masks[key][at])){occupied=true;break;}}
    if(!occupied)continue;
    const tileData=new Uint8ClampedArray(width*height*4),tileMasks={};
    for(const key of keys)tileMasks[key]=new Uint8Array(width*height);
    for(let y=0;y<height;y++){
      checkAbort(signal);const at=(top+y)*pixels.width+left;
      tileData.set(pixels.data.subarray(at*4,(at+width)*4),y*width*4);
      for(const key of keys)tileMasks[key].set(masks[key].subarray(at,at+width),y*width);
    }
    // Pointwise controls need no halo; do not attach full source metadata to tiles.
    const result=enhancePortraitEyes({width,height,data:tileData},tileMasks,controls);
    for(let y=0;y<height;y++){
      checkAbort(signal);
      for(let x=0;x<width;x++){
        const local=y*width+x;if(!keys.some(key=>tileMasks[key][local]))continue;
        const at=((top+y)*pixels.width+left+x)*4;
        for(let c=0;c<3;c++)data[at+c]=result.data[local*4+c];
      }
    }
  }
  checkAbort(signal);return {...pixels,data};
}
