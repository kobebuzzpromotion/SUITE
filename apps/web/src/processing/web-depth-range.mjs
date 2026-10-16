import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {rangeEdgeWeight} from './lr-point-color.mjs';
import {applyPortraitAdjustmentStack} from './delta66-portrait-masks.mjs';
import {validateWebDepthRange,assertWebDepthRangeBinding} from '../../../../dist/apps/backend/src/web-depth-range.js';
export {validateWebDepthRange,assertWebDepthRangeBinding};
export const WEB_DEPTH_RANGE_VERSION='suite-web-depth-range-1';

// Same pixel-center, edge-clamped bilinear convention as createDepthRangeMask.
// Invalid contributing donors exclude the sample, including inverted selections.
function coverage(depth,x,y,width,height,edges,invert){
  const sx=Math.max(0,Math.min(depth.width-1,(x+.5)*depth.width/width-.5)),
    sy=Math.max(0,Math.min(depth.height-1,(y+.5)*depth.height/height-.5));
  const ax=Math.floor(sx),ay=Math.floor(sy),bx=Math.min(depth.width-1,ax+1),by=Math.min(depth.height-1,ay+1),u=sx-ax,v=sy-ay;
  let z=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const weight=(dx?u:1-u)*(dy?v:1-v);if(!weight)continue;
    const i=(dy?by:ay)*depth.width+(dx?bx:ax);if(!depth.validity[i])return 0;
    z+=depth.data[i]*weight;
  }
  const value=rangeEdgeWeight(z,edges);return Math.round(255*(invert?1-value:value));
}
/** Host must verify asset/SHA binding separately and call only on the entire
 * source-upright frame BEFORE all warp/crop/rotation operations. No inference,
 * geometry provenance or authenticity is inferred from user-supplied depth. */
export function applyWebDepthRange(pixels,document,{signal}={}){
  assertPixels(pixels);validateWebDepthRange(document);checkAbort(signal);
  const source=sourceDimensions(pixels);
  if(source.width!==document.sourceWidth||source.height!==document.sourceHeight)throw Error('WEB_DEPTH_RANGE_DIMENSIONS_MISMATCH');
  const output=pixels.data.slice();
  for(let top=0;top<pixels.height;top+=512)for(let left=0;left<pixels.width;left+=512){
    checkAbort(signal);const width=Math.min(512,pixels.width-left),height=Math.min(512,pixels.height-top);
    const data=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height);let selected=false;
    for(let y=0;y<height;y++){
      checkAbort(signal);const start=(top+y)*pixels.width+left;
      data.set(pixels.data.subarray(start*4,(start+width)*4),y*width*4);
      for(let x=0;x<width;x++){
        const i=y*width+x;if(!data[i*4+3])continue;
        mask[i]=coverage(document.depth,left+x,top+y,pixels.width,pixels.height,document.edges,document.invert);
        if(mask[i])selected=true;
      }
    }
    if(!selected)continue;
    const adjusted=applyPortraitAdjustmentStack({width,height,data},mask,[{kind:'basic',values:document.basic}],{signal});
    for(let y=0;y<height;y++){
      checkAbort(signal);
      for(let x=0;x<width;x++){
        const i=y*width+x;if(!mask[i])continue;const at=((top+y)*pixels.width+left+x)*4;
        for(let c=0;c<3;c++)output[at+c]=adjusted.data[i*4+c];
      }
    }
  }
  checkAbort(signal);return {...pixels,data:output};
}
