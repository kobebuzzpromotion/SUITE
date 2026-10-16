import {assertPixels,sourceDimensions,checkAbort} from './pure.mjs';
import {refinePortraitMask} from './delta66-portrait-masks.mjs';
const KEYS=['expand','contract','smooth','feather'];
/** Source-pixel radii; tiles contain summed dependency halos for all four
 * ordered stages. Only core pixels are copied back; source mask is immutable. */
export function refineMaskForRender(frame,mask,settings,{signal}={}){
  assertPixels(frame);checkAbort(signal);
  if(!mask||mask.width!==frame.width||mask.height!==frame.height||!(mask.data instanceof Uint8Array)||mask.data.length!==frame.width*frame.height||!(mask.data.buffer instanceof ArrayBuffer))throw Error('MASK_REFINEMENT_MASK');
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Reflect.ownKeys(settings).length!==4||KEYS.some(key=>!Object.hasOwn(settings,key)||!Number.isInteger(settings[key])||settings[key]<0||settings[key]>64))throw Error('MASK_REFINEMENT_SETTINGS');
  const source=sourceDimensions(frame),scale=Math.min(frame.width,frame.height)/Math.min(source.width,source.height);
  const radii=Object.fromEntries(KEYS.map(key=>[key,settings[key]===0?0:Math.max(1,Math.round(settings[key]*scale))]));
  const halo=Object.values(radii).reduce((sum,v)=>sum+v,0),data=new Uint8Array(mask.data.length);
  for(let cy=0;cy<frame.height;cy+=512)for(let cx=0;cx<frame.width;cx+=512){
    checkAbort(signal);const cw=Math.min(512,frame.width-cx),ch=Math.min(512,frame.height-cy);
    const left=Math.max(0,cx-halo),top=Math.max(0,cy-halo),right=Math.min(frame.width,cx+cw+halo),bottom=Math.min(frame.height,cy+ch+halo);
    const width=right-left,height=bottom-top,rgba=new Uint8ClampedArray(width*height*4),coverage=new Uint8Array(width*height);
    for(let y=0;y<height;y++){checkAbort(signal);const start=(top+y)*frame.width+left;rgba.set(frame.data.subarray(start*4,(start+width)*4),y*width*4);coverage.set(mask.data.subarray(start,start+width),y*width);}
    const refined=refinePortraitMask({width,height,data:rgba},coverage,{...radii,signal});
    for(let y=0;y<ch;y++){checkAbort(signal);const start=(cy-top+y)*width+cx-left;data.set(refined.subarray(start,start+cw),(cy+y)*frame.width+cx);}
  }
  checkAbort(signal);return {width:frame.width,height:frame.height,data};
}
