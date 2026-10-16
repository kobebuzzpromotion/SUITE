import {assertPixels,checkAbort} from './pure.mjs';

const FIELDS=['luminance','noiseDetail','noiseContrast','color','colorDetail','colorSmoothness'];
const yAt=(data,i)=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
/** Independent luminance and chroma denoising for decoded sRGB8. Use instead of
 * the legacy denoise stage; retain existing clarity/texture/sharpen afterwards.
 * All controls are SUITE 0..100 (luminance/color default 0). Detail controls
 * govern edge rejection; contrast restores local luma residual; smoothness
 * controls chroma neighborhood spacing. It is not RAW-only AI Denoise.
 */
export function applyExtendedNoiseReduction(pixels,parameters={}, {signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||
    Object.keys(parameters).some(k=>!FIELDS.includes(k)))throw Error('NOISE_PARAMETERS_INVALID');
  const p={luminance:0,noiseDetail:50,noiseContrast:0,color:0,colorDetail:50,colorSmoothness:50,...parameters};
  if(FIELDS.some(k=>!Number.isFinite(p[k])||p[k]<0||p[k]>100))throw Error('NOISE_CONTROL_RANGE');
  const {width,height,data:source}=pixels,data=source.slice();
  if(p.luminance===0&&p.color===0)return {...pixels,data};
  if(width*height>8_000_000)throw Error('NOISE_WORK_CAPACITY');
  const lumaSigma=4+(1-p.noiseDetail/100)*40,chromaSigma=5+(1-p.colorDetail/100)*70;
  const spacing=1+Math.floor(p.colorSmoothness/40);
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const at=(y*width+x)*4;if(!source[at+3])continue;
    const center=yAt(source,at),cb=source[at+2]-center,cr=source[at]-center;
    let lumaTotal=0,lumaWeight=0,cbTotal=0,crTotal=0,chromaWeight=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const spatial=dx===0&&dy===0?1:dx===0||dy===0?.65:.4;
      if(p.luminance){
        const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy)),o=(yy*width+xx)*4;
        const v=yAt(source,o),w=spatial*(source[o+3]/255)*Math.exp(-(((v-center)/lumaSigma)**2)/2);
        lumaTotal+=v*w;lumaWeight+=w;
      }
      if(p.color){
        const xx=Math.max(0,Math.min(width-1,x+dx*spacing)),yy=Math.max(0,Math.min(height-1,y+dy*spacing)),o=(yy*width+xx)*4;
        const v=yAt(source,o),b=source[o+2]-v,r=source[o]-v;
        const colorDistance=((b-cb)**2+(r-cr)**2)/(chromaSigma*chromaSigma);
        const w=spatial*(source[o+3]/255)*Math.exp(-colorDistance/2-(((v-center)/32)**2)/2);
        cbTotal+=b*w;crTotal+=r*w;chromaWeight+=w;
      }
    }
    const mean=lumaWeight?lumaTotal/lumaWeight:center;
    const cleaned=mean+(center-mean)*p.noiseContrast/100;
    const luminance=center+(cleaned-center)*p.luminance/100;
    const blue=cb+(chromaWeight?cbTotal/chromaWeight-cb:0)*p.color/100;
    const red=cr+(chromaWeight?crTotal/chromaWeight-cr:0)*p.color/100;
    const rgb=[luminance+red,luminance-(.2126*red+.0722*blue)/.7152,luminance+blue];
    for(let c=0;c<3;c++)data[at+c]=Math.round(Math.max(0,Math.min(255,rgb[c])));
  }}
  checkAbort(signal);return {...pixels,data};
}
