import {assertPixels,sourceDimensions,checkAbort} from './pure.mjs';
import {rasterizeLocalBrushMask,LOCAL_BRUSH_VERSION} from './local-mask-brush.mjs';
import {retouchPortraitSkin} from './delta66-portrait-repair.mjs';
import {validateManualSkin} from '../../../../dist/apps/backend/src/manual-skin.js';
export {validateManualSkin,LOCAL_BRUSH_VERSION};
export const MANUAL_SKIN_VERSION='suite-manual-skin-1';
export const MANUAL_SKIN_LAYERS_VERSION='suite-manual-skin-2';
const CORE=512;

/** Nonsemantic local brush controls. Existing 8MP region kernel is unchanged:
 * each <=768-square tile carries a complete 4*radius neighborhood. Global mean
 * is computed by that kernel but cannot affect these controls (toneAmount and
 * complexionAmount are zero). Never add such global controls without revisiting
 * this contract. Every tile samples immutable input, not prior tile outputs.
 */
export function applyManualSkin(pixels,settings,{signal}={}){
  assertPixels(pixels);validateManualSkin(settings);checkAbort(signal);
  const layers=settings.schemaVersion===2?settings.layers:[settings],workBudget={remaining:96_000_000};
  let result=pixels;
  for(const layer of layers){checkAbort(signal);result=applyLayer(result,layer,{signal,workBudget});}
  return result;
}
function applyLayer(pixels,settings,{signal,workBudget}){
  const source=sourceDimensions(pixels),scale=Math.min(pixels.width,pixels.height)/Math.min(source.width,source.height);
  const temperature=settings.temperature??0,tint=settings.tint??0,radiance=settings.radiance??0,finish=settings.finish??'natural';
  const radius=Math.max(1,Math.min(32,Math.round(settings.radius*scale))),halo=radius*4;
  const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:settings.strokes,signal,workBudget}).data;
  let selected=false;
  for(let i=0;i<mask.length;i++){if((i&16383)===0)checkAbort(signal);if(pixels.data[i*4+3]===0)mask[i]=0;else if(mask[i])selected=true;}
  if(!selected)throw Error('MANUAL_SKIN_EMPTY_MASK');
  const data=pixels.data.slice();
  if(settings.smoothness===0&&settings.texture===0&&settings.rosy===0&&temperature===0&&tint===0&&radiance===0&&finish==='natural')return {...pixels,data};
  for(let top=0;top<pixels.height;top+=CORE)for(let left=0;left<pixels.width;left+=CORE){
    checkAbort(signal);
    const right=Math.min(pixels.width,left+CORE),bottom=Math.min(pixels.height,top+CORE);
    let occupied=false;
    for(let y=top;y<bottom&&!occupied;y++)for(let x=left;x<right;x++)if(mask[y*pixels.width+x]){occupied=true;break;}
    if(!occupied)continue;
    const x0=Math.max(0,left-halo),y0=Math.max(0,top-halo),x1=Math.min(pixels.width,right+halo),y1=Math.min(pixels.height,bottom+halo);
    const width=x1-x0,height=y1-y0,tileData=new Uint8ClampedArray(width*height*4),tileMask=new Uint8Array(width*height);
    for(let y=0;y<height;y++){
      checkAbort(signal);const from=(y0+y)*pixels.width+x0;
      tileData.set(pixels.data.subarray(from*4,(from+width)*4),y*width*4);
      tileMask.set(mask.subarray(from,from+width),y*width);
    }
    // A tile is a local raster, not the original image's canonical source frame.
    const result=retouchPortraitSkin({width,height,data:tileData},tileMask,
      {soften:settings.smoothness,texture:settings.texture,rosy:settings.rosy,radius,
        temperature,tint,radiance,finish,toneAmount:0,complexionAmount:0}, {signal});
    for(let y=top;y<bottom;y++){
      checkAbort(signal);
      for(let x=left;x<right;x++){
        const at=y*pixels.width+x;if(!mask[at])continue;
        const from=((y-y0)*width+x-x0)*4,to=at*4;
        for(let c=0;c<3;c++)data[to+c]=result.data[from+c];
      }
    }
  }
  checkAbort(signal);return {...pixels,data};
}
