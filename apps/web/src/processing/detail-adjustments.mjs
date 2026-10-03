import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

export const DETAIL_ALGORITHM_VERSION='suite-srgb8-detail-1';
export const DETAIL_LIMITS=Object.freeze({clarity:Object.freeze([-100,100]),texture:Object.freeze([-100,100]),sharpness:Object.freeze([0,100])});
const REFERENCE_LONG_EDGE=3000;
const BASE_RADII=Object.freeze({clarity:16,textureFine:1,textureCoarse:4,sharpness:1.5});
const clampIndex=(i,size)=>Math.max(0,Math.min(size-1,i));

/** Actual representation pixels, not sensor dimensions. Fractions are retained, never rounded to a minimum radius. */
export function detailRadiiFor(pixels){
  assertPixels(pixels);const source=sourceDimensions(pixels),longEdge=Math.max(pixels.width,pixels.height),scale=longEdge/REFERENCE_LONG_EDGE;
  return Object.freeze({referenceLongEdge:REFERENCE_LONG_EDGE,actualLongEdge:longEdge,sourceLongEdge:Math.max(source.width,source.height),representationScale:longEdge/Math.max(source.width,source.height),clarity:BASE_RADII.clarity*scale,textureFine:BASE_RADII.textureFine*scale,textureCoarse:BASE_RADII.textureCoarse*scale,sharpness:BASE_RADII.sharpness*scale});
}

function checkedParameters(parameters){
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.keys(parameters).some(key=>!Object.hasOwn(DETAIL_LIMITS,key)))throw Error('INVALID_DETAIL_PARAMETERS');
  const result={};for(const [key,[minimum,maximum]] of Object.entries(DETAIL_LIMITS)){const value=Object.hasOwn(parameters,key)?parameters[key]:0;if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||value>maximum)throw Error('DETAIL_RANGE_'+key.toUpperCase());result[key]=value;}return result;
}

/**
 * Separable fractional box kernel: integer inner taps weight 1, two outer taps weight the fractional part.
 * Clamp edges; cap each axis radius at dimension-1 (a 1-pixel axis is an identity).
 * Sliding sums give O(pixel count) work even for thin images. Optional alpha coverage normalizes
 * premultiplied luminance so hidden RGB cannot contaminate visible neighbors. Alpha itself is never filtered.
 */
function blurLuma(luma,pixels,radius,workspace,out,signal){
  const {width,height,data}=pixels,{horizontal,coverageHorizontal}=workspace;
  const rx=Math.min(radius,width-1),ix=Math.floor(rx),fx=rx-ix,nx=2*ix+1+2*fx;
  const ry=Math.min(radius,height-1),iy=Math.floor(ry),fy=ry-iy,ny=2*iy+1+2*fy;
  const weighted=Boolean(coverageHorizontal),coverage=k=>weighted?data[k*4+3]/255:1;
  for(let y=0;y<height;y++){
    if(y%32===0)checkAbort(signal);const row=y*width;let sum=0,weight=0;
    for(let dx=-ix;dx<=ix;dx++){const k=row+clampIndex(dx,width),a=coverage(k);sum+=luma[k]*a;weight+=a;}
    for(let x=0;x<width;x++){
      if(x%16384===0)checkAbort(signal);
      const left=row+clampIndex(x-ix-1,width),right=row+clampIndex(x+ix+1,width),al=coverage(left),ar=coverage(right);
      horizontal[row+x]=(sum+fx*(luma[left]*al+luma[right]*ar))/nx;
      if(weighted)coverageHorizontal[row+x]=(weight+fx*(al+ar))/nx;
      const remove=row+clampIndex(x-ix,width),add=row+clampIndex(x+ix+1,width),a0=coverage(remove),a1=coverage(add);sum+=luma[add]*a1-luma[remove]*a0;weight+=a1-a0;
    }
  }
  for(let x=0;x<width;x++){
    if(x%32===0)checkAbort(signal);let sum=0,weight=0;
    for(let dy=-iy;dy<=iy;dy++){const k=clampIndex(dy,height)*width+x;sum+=horizontal[k];if(weighted)weight+=coverageHorizontal[k];}
    for(let y=0;y<height;y++){
      if(y%16384===0)checkAbort(signal);
      const top=clampIndex(y-iy-1,height)*width+x,bottom=clampIndex(y+iy+1,height)*width+x;
      const numerator=sum+fy*(horizontal[top]+horizontal[bottom]);
      const denominator=weighted?weight+fy*(coverageHorizontal[top]+coverageHorizontal[bottom]):ny;
      out[y*width+x]=denominator>1e-12?numerator/denominator:luma[y*width+x];
      const remove=clampIndex(y-iy,height)*width+x,add=clampIndex(y+iy+1,height)*width+x;sum+=horizontal[add]-horizontal[remove];if(weighted)weight+=coverageHorizontal[add]-coverageHorizontal[remove];
    }
  }
  checkAbort(signal);return out;
}

function fillLuma(data,luma,signal){for(let k=0;k<luma.length;k++){if(k%16384===0)checkAbort(signal);const i=k*4;luma[k]=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];}}
function addLumaDelta(data,count,delta,signal){for(let k=0;k<count;k++){if(k%16384===0)checkAbort(signal);const i=k*4;if(data[i+3]===0)continue;const amount=delta(k);for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]+amount);}}

/**
 * Distinct sRGB8 post-color stages, in fixed order: clarity -> texture -> sharpness, before rotation/Crop.
 * Clarity: broad luminance local contrast, bounded signed residual to limit extreme halos.
 * Texture: signed difference of fine/coarse low-pass luminance (a middle-frequency band, not sharpening).
 * Sharpness: positive high-frequency unsharp residual; 0 neutral, lower values reduce enhancement, no invented negative range.
 * RGB receives the same luminance delta (chroma differences retained until clipping). All alpha bytes and input bytes stay unchanged.
 * Neutral stages are skipped exactly; no blur/round-trip occurs at 0. Re-render from the same unedited base to avoid repeated application.
 *
 * Proxy/Final use actualLongEdge/3000 radii; source frame only reports the downsample ratio. Fractional radii and
 * axis clamping still leave sampling/quantization differences. This is NOT an exact Proxy/Final visual-parity guarantee.
 * Working memory is bounded in count, not device safety: texture/combinations use four Float32 full-size buffers,
 * plus one extra for nonopaque alpha and input/output RGBA. At 24MP this is approximately 576/672MB before upstream
 * RAW/Worker/Canvas allocations. Real peak memory, speed, halo and RAW quality remain NOT_RUN.
 * No Recipe schema, person detection, persistence, UI or encoder is implemented by this module.
 */
export function applyDetailAdjustments(pixels,parameters={}, {signal}={}){
  assertPixels(pixels);checkAbort(signal);const settings=checkedParameters(parameters),radii=detailRadiiFor(pixels),data=pixels.data.slice(),count=pixels.width*pixels.height;
  const output={width:pixels.width,height:pixels.height,data};
  if(Object.hasOwn(pixels,'sourceWidth')){output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;}
  output.detailProvenance={algorithmVersion:DETAIL_ALGORITHM_VERSION,colorSpace:'sRGB8 encoded luminance',order:['clarity','texture','sharpness'],appliedStages:['clarity','texture','sharpness'].filter(stage=>settings[stage]!==0),parameters:{...settings},radii:{...radii},edgeMode:'clamp',axisRadiusCap:'dimension-1',alpha:'unchanged; coverage-normalized neighbors',visualVerification:'NOT_RUN'};
  if(settings.clarity===0&&settings.texture===0&&settings.sharpness===0)return output;
  let nonopaque=false;for(let i=3;i<data.length;i+=4){if(i%65536===3)checkAbort(signal);if(data[i]!==255){nonopaque=true;break;}}
  const luma=new Float32Array(count),workspace={horizontal:new Float32Array(count),coverageHorizontal:nonopaque?new Float32Array(count):null};
  const broad=new Float32Array(count),fine=settings.texture!==0?new Float32Array(count):null;
  const current={width:pixels.width,height:pixels.height,data};
  if(settings.clarity!==0){fillLuma(data,luma,signal);blurLuma(luma,current,radii.clarity,workspace,broad,signal);const gain=1.5*settings.clarity/100;addLumaDelta(data,count,k=>{const residual=luma[k]-broad[k];return gain*residual/(1+Math.abs(residual)/32);},signal);}
  if(settings.texture!==0){fillLuma(data,luma,signal);blurLuma(luma,current,radii.textureFine,workspace,fine,signal);blurLuma(luma,current,radii.textureCoarse,workspace,broad,signal);const gain=1.25*settings.texture/100;addLumaDelta(data,count,k=>gain*(fine[k]-broad[k]),signal);}
  if(settings.sharpness!==0){fillLuma(data,luma,signal);blurLuma(luma,current,radii.sharpness,workspace,broad,signal);const gain=settings.sharpness/100;addLumaDelta(data,count,k=>gain*(luma[k]-broad[k]),signal);}
  checkAbort(signal);return output;
}

export const applyClarity=(pixels,value,options)=>applyDetailAdjustments(pixels,{clarity:value},options);
export const applyTexture=(pixels,value,options)=>applyDetailAdjustments(pixels,{texture:value},options);
export const applySharpness=(pixels,value,options)=>applyDetailAdjustments(pixels,{sharpness:value},options);
