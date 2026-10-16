import {assertPixels,checkAbort} from './pure.mjs';
import {applyPointColor,validatePointColorSelections} from './lr-point-color.mjs';

const STRIP_PIXELS=262_144;
const KERNEL_PIXELS=8_000_000;

/** Full render adapter: retain the shared 24 MP frame gate, not the small
 * point-color kernel's 8 MP frame gate. Point color is pixel-local, so strips
 * require no halo and do not change selection weights at their boundaries.
 * One full output buffer is still required; this is not streamed file export.
 * Source/proxy metadata belongs to the whole frame, never the temporary tiles.
 */
export function applyPointColorForRender(frame,selections,{amount=1,signal}={}){
  assertPixels(frame);checkAbort(signal);
  const selected=validatePointColorSelections(selections);
  // The kernel's amount validator is private; retain precisely its public range.
  if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('POINT_COLOR_RANGE');
  if(!(frame.data.buffer instanceof ArrayBuffer))throw Error('POINT_COLOR_BUFFER_CAPACITY');
  const {width,height}=frame;
  const data=new Uint8ClampedArray(frame.data.length);
  const rows=Math.max(1,Math.floor(STRIP_PIXELS/width));
  for(let y=0;y<height;y+=rows){
    checkAbort(signal);
    const stripHeight=Math.min(rows,height-y),start=y*width*4;
    if(width>KERNEL_PIXELS){
      // assertPixels also permits extremely wide one-row images. Split that
      // exceptional row horizontally rather than rejecting an otherwise valid
      // <=24 MP frame or exceeding the reused kernel's 8 MP limit.
      for(let x=0;x<width;x+=STRIP_PIXELS){
        checkAbort(signal);const tileWidth=Math.min(STRIP_PIXELS,width-x),offset=start+x*4;
        const tile={width:tileWidth,height:1,data:frame.data.subarray(offset,offset+tileWidth*4)};
        data.set(applyPointColor(tile,selected,{amount,signal}).data,offset);
      }
    }else{
      const tile={width,height:stripHeight,data:frame.data.subarray(start,start+width*stripHeight*4)};
      const adjusted=applyPointColor(tile,selected,{amount,signal});
      for(let row=0;row<stripHeight;row++){
        checkAbort(signal);const offset=row*width*4;
        data.set(adjusted.data.subarray(offset,offset+width*4),start+offset);
      }
    }
  }
  checkAbort(signal);return {...frame,width,height,data};
}
