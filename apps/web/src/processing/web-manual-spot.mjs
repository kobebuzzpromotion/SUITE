import {assertPixels,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {repairRegion} from './region-repair-core.mjs';
import {validateWebManualSpot} from '../../../../dist/apps/backend/src/web-manual-spot.js';
export {validateWebManualSpot,LOCAL_BRUSH_VERSION};
export const WEB_MANUAL_SPOT_VERSION='suite-web-manual-spot-1';

/** Explicit small-region neighbor diffusion, not AI or semantic detection.
 * A single complete domain ROI preserves the kernel's global known-boundary
 * propagation; independent tiles would incorrectly introduce donor boundaries. */
export function applyWebManualSpot(pixels,settings,{signal}={}){
  assertPixels(pixels);validateWebManualSpot(settings);checkAbort(signal);
  const workBudget={remaining:96_000_000};
  const raster=strokes=>rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes,workBudget,signal}).data;
  const defects=raster(settings.defects),domain=raster(settings.domain);
  let left=pixels.width,top=pixels.height,right=-1,bottom=-1,selected=0;
  for(let y=0;y<pixels.height;y++){
    checkAbort(signal);
    for(let x=0;x<pixels.width;x++){
      const i=y*pixels.width+x;
      // Check authored support even on transparent pixels; never silently drop
      // an out-of-domain mark before validating the user's selected boundary.
      if(defects[i]&&!domain[i])throw Error('WEB_MANUAL_SPOT_DEFECT_OUTSIDE_DOMAIN');
      if(domain[i]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(defects[i]&&pixels.data[i*4+3])selected++;
    }
  }
  if(right<left)throw Error('WEB_MANUAL_SPOT_EMPTY_DOMAIN');
  if(!selected)throw Error('WEB_MANUAL_SPOT_EMPTY_DEFECTS');
  const width=right-left+1,height=bottom-top+1;
  if(width*height>1_000_000)throw Error('WEB_MANUAL_SPOT_ROI_CAPACITY');
  if(selected*settings.iterations>16_000_000)throw Error('REGION_REPAIR_WORK_CAPACITY');
  const data=new Uint8ClampedArray(width*height*4),damage=new Uint8Array(width*height),allowed=new Uint8Array(width*height);
  for(let y=0;y<height;y++){
    checkAbort(signal);const start=(top+y)*pixels.width+left;
    data.set(pixels.data.subarray(start*4,(start+width)*4),y*width*4);
    damage.set(defects.subarray(start,start+width),y*width);allowed.set(domain.subarray(start,start+width),y*width);
  }
  // ROI is a standalone actual frame: full-image source metadata is not attached.
  const repaired=repairRegion({width,height,data},damage,allowed,{strength:settings.strength,iterations:settings.iterations,signal});
  const output=pixels.data.slice();
  for(let y=0;y<height;y++){
    checkAbort(signal);
    for(let x=0;x<width;x++){
      const i=y*width+x,at=((top+y)*pixels.width+left+x)*4;
      if(!damage[i]||!pixels.data[at+3])continue;
      for(let c=0;c<3;c++)output[at+c]=repaired.data[i*4+c];
    }
  }
  checkAbort(signal);return {...pixels,data:output};
}
