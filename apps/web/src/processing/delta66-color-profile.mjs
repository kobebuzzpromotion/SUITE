import {assertPixels,checkAbort} from './pure.mjs';
import {parseCubeLUT} from '../delta66-preset-cube.mjs';

export const PROFILE_STAGE='decoded-srgb8-before-color-adjustments';
export const readCubeProfile=text=>parseCubeLUT(text);
function validLUT(lut){
  if(lut?.kind==='1D+3D'){
    if(lut.shaper?.kind!=='1D'||lut.lut3D?.kind!=='3D')throw Error('PROFILE_LUT_INVALID');
    validLUT(lut.shaper);validLUT(lut.lut3D);return;
  }
  if(!lut||!['1D','3D'].includes(lut.kind)||!Number.isInteger(lut.size)||lut.size<2||lut.size>(lut.kind==='1D'?65536:65)||
    !(lut.data instanceof Float32Array)||lut.data.length!==(lut.kind==='1D'?lut.size:lut.size**3)*3||
    !Array.isArray(lut.domainMin)||!Array.isArray(lut.domainMax)||lut.domainMin.length!==3||lut.domainMax.length!==3||
    lut.domainMin.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(lut.domainMax[i])||v>=lut.domainMax[i]||!Number.isFinite(lut.domainMax[i]-v))||
    lut.data.some(v=>!Number.isFinite(v)))throw Error('PROFILE_LUT_INVALID');
}
function sampleLUT(lut,rgb,outputScale=1){
  if(lut.kind==='1D+3D')return sampleLUT(lut.lut3D,sampleLUT(lut.shaper,rgb),outputScale);
  const q=rgb.map((v,c)=>Math.max(0,Math.min(1,(v-lut.domainMin[c])/(lut.domainMax[c]-lut.domainMin[c])))*(lut.size-1));
  const low=q.map(Math.floor),fraction=q.map((v,c)=>v-low[c]);
  if(lut.kind==='1D')return q.map((_,c)=>(lut.data[low[c]*3+c]*(1-fraction[c])+lut.data[Math.min(lut.size-1,low[c]+1)*3+c]*fraction[c])*outputScale);
  const out=[0,0,0];
  for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++){
    const rr=Math.min(lut.size-1,low[0]+r),gg=Math.min(lut.size-1,low[1]+g),bb=Math.min(lut.size-1,low[2]+b);
    const weight=(r?fraction[0]:1-fraction[0])*(g?fraction[1]:1-fraction[1])*(b?fraction[2]:1-fraction[2]);
    const index=(bb*lut.size*lut.size+gg*lut.size+rr)*3;for(let c=0;c<3;c++)out[c]+=lut.data[index+c]*outputScale*weight;
  }return out;
}
/** Standard is exact identity; B&W is display-referred Rec.709 luma; LUT uses
 * per-channel linear 1D interpolation and red-fastest trilinear 3D interpolation.
 * Combined CUBE applies shaper -> 3D with independent stage input ranges; no
 * intermediate 8-bit quantization or clamping of shaper OUTPUT to 0..1.
 * Only each stage's input coordinates clamp at its domain endpoints. Profile is
 * applied before HSL/curves/detail, once from the unedited decoded source.
 * This is not a RAW camera/DCP/ICC profile, nor a proprietary filter replica. */
export function applyColorProfile(pixels,{kind='standard',intensity=1,lut}={}, {signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!['standard','black-and-white','lut'].includes(kind)||!Number.isFinite(intensity)||intensity<0||intensity>1)
    throw Error('PROFILE_SETTINGS_INVALID');
  if(kind==='lut')validLUT(lut);else if(lut!==undefined)throw Error('PROFILE_UNEXPECTED_LUT');
  const data=pixels.data.slice();
  if(kind==='standard'||intensity===0)return {...pixels,data};
  for(let i=0;i<data.length;i+=4){
    if((i&16383)===0)checkAbort(signal);if(!data[i+3])continue;
    let target;
    if(kind==='black-and-white'){
      const y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];target=[y,y,y];
    }else{
      target=sampleLUT(lut,[data[i]/255,data[i+1]/255,data[i+2]/255],255);
    }
    for(let c=0;c<3;c++)data[i+c]=Math.round(Math.max(0,Math.min(255,data[i+c]*(1-intensity)+target[c]*intensity)));
  }
  checkAbort(signal);return {...pixels,data};
}
