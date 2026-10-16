import {assertPixels,checkAbort,MAX_PIXELS,srgbToLinear,linearToSrgb} from './processing/pure.mjs';

// Browser canvases vary by device. Keep the existing Web pixel ceiling and an
// explicit edge/working-set guard before allocating the second RGBA frame.
export const MAX_EXPORT_EDGE=16_384;
export const MAX_EXPORT_PIXELS=MAX_PIXELS;
export const MAX_EXPORT_RESIZE_BYTES=256*1024*1024;
const LINEAR=Float64Array.from({length:256},(_,value)=>srgbToLinear(value/255));

function positiveInteger(value){return Number.isSafeInteger(value)&&value>=1;}

function validateDimensions(source){
  if(!source||typeof source!=='object')throw Error('EXPORT_SOURCE_DIMENSIONS_INVALID');
  const {width,height}=source;
  if(!positiveInteger(width)||!positiveInteger(height)||width*height>MAX_PIXELS)throw Error('EXPORT_SOURCE_DIMENSIONS_INVALID');
  return {width,height};
}

/**
 * Plan post-render dimensions. `source` is the rotated/cropped Final frame,
 * not the Original RAW dimensions. Existing modes preserve aspect ratio; `fit`
 * and `dimensions` treat width/height as a bounding box, not a distortion
 * request. `exact-dimensions` requires an explicit treatment of mismatched
 * aspect ratios; it does not change the meaning of `dimensions`.
 * PPI/PPC are metadata, not pixel dimensions, and are not set here.
 */
export function planExportDimensions(source,settings={kind:'original'}){
  const {width:sourceWidth,height:sourceHeight}=validateDimensions(source);
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('EXPORT_SIZE_SETTINGS_INVALID');
  const {kind}=settings;
  let width,height;
  if(kind==='original'){width=sourceWidth;height=sourceHeight;}
  else if(kind==='percentage'){
    const percentage=settings.value;
    if(!positiveInteger(percentage)||percentage>100)throw Error('EXPORT_SIZE_PERCENTAGE_INVALID');
    width=Math.max(1,Math.round(sourceWidth*percentage/100));
    height=Math.max(1,Math.round(sourceHeight*percentage/100));
  }else if(kind==='width'){
    width=settings.value;
    if(!positiveInteger(width)||width>sourceWidth)throw Error('EXPORT_SIZE_WIDTH_INVALID');
    height=Math.max(1,Math.round(sourceHeight*width/sourceWidth));
  }else if(kind==='height'){
    height=settings.value;
    if(!positiveInteger(height)||height>sourceHeight)throw Error('EXPORT_SIZE_HEIGHT_INVALID');
    width=Math.max(1,Math.round(sourceWidth*height/sourceHeight));
  }else if(kind==='long-edge'||kind==='short-edge'){
    const requested=settings.value;
    const sourceEdge=kind==='long-edge'?Math.max(sourceWidth,sourceHeight):Math.min(sourceWidth,sourceHeight);
    if(!positiveInteger(requested)||requested>sourceEdge)throw Error('EXPORT_SIZE_EDGE_INVALID');
    const factor=requested/sourceEdge;
    width=Math.max(1,Math.round(sourceWidth*factor));
    height=Math.max(1,Math.round(sourceHeight*factor));
    width=Math.min(width,sourceWidth);height=Math.min(height,sourceHeight);
  }else if(kind==='exact-dimensions'){
    width=settings.width;height=settings.height;
    if(!positiveInteger(width)||!positiveInteger(height)||width>sourceWidth||height>sourceHeight)
      throw Error('EXPORT_SIZE_EXACT_DIMENSIONS_INVALID');
    if(!['pad','crop','stretch'].includes(settings.strategy))throw Error('EXPORT_SIZE_EXACT_STRATEGY_REQUIRED');
    if(settings.strategy==='pad'){
      const background=settings.background;
      if(!Array.isArray(background)||background.length!==3||background.some(channel=>!Number.isInteger(channel)||channel<0||channel>255))
        throw Error('EXPORT_SIZE_PAD_BACKGROUND_REQUIRED');
    }
  }else if(kind==='fit'||kind==='dimensions'){
    const maxWidth=settings.width,maxHeight=settings.height;
    if(!positiveInteger(maxWidth)||!positiveInteger(maxHeight))throw Error('EXPORT_SIZE_BOUNDS_INVALID');
    const factor=Math.min(1,maxWidth/sourceWidth,maxHeight/sourceHeight);
    width=Math.max(1,Math.round(sourceWidth*factor));
    height=Math.max(1,Math.round(sourceHeight*factor));
    // Rounding a near-half-pixel result must never escape the selected box.
    width=Math.min(width,maxWidth);height=Math.min(height,maxHeight);
  }else throw Error('EXPORT_SIZE_MODE_UNSUPPORTED');
  if(width>MAX_EXPORT_EDGE||height>MAX_EXPORT_EDGE||width*height>MAX_EXPORT_PIXELS)throw Error('EXPORT_SIZE_LIMIT');
  const sourceBytes=sourceWidth*sourceHeight*4,outputBytes=width*height*4;
  if(sourceBytes+outputBytes>MAX_EXPORT_RESIZE_BYTES)throw Error('EXPORT_SIZE_MEMORY_LIMIT');
  return Object.freeze({width,height,sourceWidth,sourceHeight,kind});
}

// This is a SUITE-owned, opt-in exact-size operation. It does not assert that
// another editor's undocumented crop, pad or stretch policy is identical.
function exactRegion(plan,settings){
  const {width,height,sourceWidth,sourceHeight}=plan;
  if(settings.strategy==='stretch')return {sourceX:0,sourceY:0,sourceW:sourceWidth,sourceH:sourceHeight,
    targetX:0,targetY:0,targetW:width,targetH:height};
  const sourceRatio=sourceWidth/sourceHeight,targetRatio=width/height;
  if(settings.strategy==='crop'){
    const sourceW=sourceRatio>targetRatio?sourceHeight*targetRatio:sourceWidth;
    const sourceH=sourceRatio<targetRatio?sourceWidth/targetRatio:sourceHeight;
    return {sourceX:(sourceWidth-sourceW)/2,sourceY:(sourceHeight-sourceH)/2,sourceW,sourceH,
      targetX:0,targetY:0,targetW:width,targetH:height};
  }
  const scale=Math.min(width/sourceWidth,height/sourceHeight);
  const targetW=Math.max(1,Math.min(width,Math.round(sourceWidth*scale)));
  const targetH=Math.max(1,Math.min(height,Math.round(sourceHeight*scale)));
  return {sourceX:0,sourceY:0,sourceW:sourceWidth,sourceH:sourceHeight,
    targetX:Math.floor((width-targetW)/2),targetY:Math.floor((height-targetH)/2),targetW,targetH};
}

function resizeExactPixels(pixels,settings,plan,signal){
  const {width,height,sourceWidth,sourceHeight}=plan;
  const region=exactRegion(plan,settings),source=pixels.data;
  let data;
  try{data=new Uint8ClampedArray(width*height*4);}catch{throw Error('EXPORT_SIZE_ALLOCATION_FAILED');}
  if(settings.strategy==='pad'){
    const [r,g,b]=settings.background;
    for(let offset=0;offset<data.length;offset+=4){data[offset]=r;data[offset+1]=g;data[offset+2]=b;data[offset+3]=255;}
  }
  let samples=0;
  for(let y=0;y<region.targetH;y++){
    checkAbort(signal);
    const y0=region.sourceY+y*region.sourceH/region.targetH;
    const y1=region.sourceY+(y+1)*region.sourceH/region.targetH;
    for(let x=0;x<region.targetW;x++){
      const x0=region.sourceX+x*region.sourceW/region.targetW;
      const x1=region.sourceX+(x+1)*region.sourceW/region.targetW;
      let totalAlpha=0,red=0,green=0,blue=0;
      for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++){
        const wy=Math.max(0,Math.min(sy+1,y1)-Math.max(sy,y0));
        if(!wy)continue;
        for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
          const wx=Math.max(0,Math.min(sx+1,x1)-Math.max(sx,x0));
          if(!wx)continue;
          if((++samples&4095)===0)checkAbort(signal);
          const index=(sy*sourceWidth+sx)*4,weightedAlpha=wx*wy*source[index+3];
          totalAlpha+=weightedAlpha;
          red+=weightedAlpha*LINEAR[source[index]];
          green+=weightedAlpha*LINEAR[source[index+1]];
          blue+=weightedAlpha*LINEAR[source[index+2]];
        }
      }
      const out=((region.targetY+y)*width+region.targetX+x)*4,area=(x1-x0)*(y1-y0);
      if(settings.strategy==='pad'){
        const coverage=Math.min(1,totalAlpha/(area*255));
        const [r,g,b]=settings.background;
        data[out]=Math.round(linearToSrgb(coverage*(totalAlpha?red/totalAlpha:0)+(1-coverage)*LINEAR[r])*255);
        data[out+1]=Math.round(linearToSrgb(coverage*(totalAlpha?green/totalAlpha:0)+(1-coverage)*LINEAR[g])*255);
        data[out+2]=Math.round(linearToSrgb(coverage*(totalAlpha?blue/totalAlpha:0)+(1-coverage)*LINEAR[b])*255);
        data[out+3]=255;
      }else{
        data[out]=totalAlpha?Math.round(linearToSrgb(red/totalAlpha)*255):0;
        data[out+1]=totalAlpha?Math.round(linearToSrgb(green/totalAlpha)*255):0;
        data[out+2]=totalAlpha?Math.round(linearToSrgb(blue/totalAlpha)*255):0;
        data[out+3]=Math.round(totalAlpha/area);
      }
    }
  }
  checkAbort(signal);
  return {width,height,data};
}

/**
 * Alpha-correct, linear-light area-weighted RGBA8 reduction. Transparent hidden
 * RGB cannot bleed into visible pixels. No upscaling is performed here.
 */
export function resizeExportPixels(pixels,settings={kind:'original'},{signal}={}){
  assertPixels(pixels);checkAbort(signal);
  const plan=planExportDimensions(pixels,settings),{width,height,sourceWidth,sourceHeight}=plan;
  if(plan.kind==='exact-dimensions')return resizeExactPixels(pixels,settings,plan,signal);
  let data;
  try{data=new Uint8ClampedArray(width*height*4);}catch{throw Error('EXPORT_SIZE_ALLOCATION_FAILED');}
  if(width===sourceWidth&&height===sourceHeight){
    data.set(pixels.data);checkAbort(signal);return {width,height,data};
  }
  const source=pixels.data;let samples=0;
  for(let y=0;y<height;y++){
    checkAbort(signal);
    const y0=y*sourceHeight/height,y1=(y+1)*sourceHeight/height;
    for(let x=0;x<width;x++){
      const x0=x*sourceWidth/width,x1=(x+1)*sourceWidth/width;
      let totalAlpha=0,red=0,green=0,blue=0;
      for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++){
        const wy=Math.max(0,Math.min(sy+1,y1)-Math.max(sy,y0));
        if(!wy)continue;
        for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
          const wx=Math.max(0,Math.min(sx+1,x1)-Math.max(sx,x0));
          if(!wx)continue;
          if((++samples&4095)===0)checkAbort(signal);
          const index=(sy*sourceWidth+sx)*4,weightedAlpha=wx*wy*source[index+3];
          totalAlpha+=weightedAlpha;
          red+=weightedAlpha*LINEAR[source[index]];green+=weightedAlpha*LINEAR[source[index+1]];blue+=weightedAlpha*LINEAR[source[index+2]];
        }
      }
      const out=(y*width+x)*4,area=(x1-x0)*(y1-y0);
      data[out]=totalAlpha?Math.round(linearToSrgb(red/totalAlpha)*255):0;
      data[out+1]=totalAlpha?Math.round(linearToSrgb(green/totalAlpha)*255):0;
      data[out+2]=totalAlpha?Math.round(linearToSrgb(blue/totalAlpha)*255):0;
      data[out+3]=Math.round(totalAlpha/area);
    }
  }
  checkAbort(signal);
  return {width,height,data};
}
