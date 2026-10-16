import {assertPixels,checkAbort} from './pure.mjs';
/** Pure display-sRGB arithmetic shared by two separate products. No semantic
 * tooth validation, person identity, authority or consent is manufactured here.
 * The legacy bound wrapper retains all its gates before calling this kernel. */
export function blendTeethBrightnessDesaturation(pixels,coverage,{brightness,desaturation},{signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!(coverage instanceof Uint8Array||coverage instanceof Uint8ClampedArray)||coverage.length!==pixels.width*pixels.height)
    throw Error('TEETH_COLOR_COVERAGE_INVALID');
  if(!Number.isFinite(brightness)||brightness< -100||brightness>100||!Number.isFinite(desaturation)||desaturation<0||desaturation>100)
    throw Error('TEETH_COLOR_SETTINGS_INVALID');
  const output={...pixels,data:pixels.data.slice()},lift=brightness/100,fade=desaturation/100;
  if(lift===0&&fade===0){checkAbort(signal);return output;}
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    const weight=coverage[pixel]/255,at=pixel*4;if(weight===0||output.data[at+3]===0)continue;
    const r=pixels.data[at],g=pixels.data[at+1],b=pixels.data[at+2],gray=.2126*r+.7152*g+.0722*b;
    for(let channel=0;channel<3;channel++){
      const original=pixels.data[at+channel],desaturated=original+(gray-original)*fade;
      const brightened=lift>=0?desaturated+(255-desaturated)*lift:desaturated*(1+lift);
      output.data[at+channel]=Math.max(0,Math.min(255,Math.round(original+(brightened-original)*weight)));
    }
  }
  checkAbort(signal);return output;
}
