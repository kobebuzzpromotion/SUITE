import {validateWebRawDenoise} from '../../../../dist/apps/backend/src/web-raw-denoise.js';
import {decodeSceneRaw} from './delta66-scene-raw.mjs';
import {denoiseLinearRAW16} from './lr-raw-denoise.mjs';
import {assertPixels,checkAbort,linearToSrgb} from './pure.mjs';
export {validateWebRawDenoise};
export const WEB_RAW_DENOISE_VERSION='suite-web-raw-denoise-1';
export const WEB_RAW_DENOISE_MAX_WORK=216_000_000;

/** True RAW decode -> classical post-demosaic linear RGB16 denoise -> sRGB8.
 * Host downsizes only AFTER this operation so Preview and Final share the same
 * source-space radius/noise interpretation. No AI/CFA/Adobe equivalence claim.
 * Existing decoder enforces input128MiB, sensor/output24MP, full-size decode.
 */
export async function renderWebRawDenoise(buffer,settings,{signal}={}){
  validateWebRawDenoise(settings);checkAbort(signal);
  // Snapshot settings before the asynchronous decoder initialization.
  const {strength,radius,sigma}=settings;
  const decoded=await decodeSceneRaw(buffer,{whiteBalance:'camera',transfer:'linear',signal});
  checkAbort(signal);
  const work=strength===0?0:decoded.frame.width*decoded.frame.height*(2*radius+1)**2;
  // Conservative upper bound includes taps clipped at image edges. Budget is
  // checked before the denoiser allocates its output or evaluates neighborhoods.
  if(work>WEB_RAW_DENOISE_MAX_WORK)throw Error('WEB_RAW_DENOISE_WORK_LIMIT');
  const frame=strength===0?decoded.frame:denoiseLinearRAW16(decoded.frame,{strength,radius,sigma,signal});
  const data=new Uint8ClampedArray(frame.width*frame.height*4);
  for(let y=0;y<frame.height;y++){
    checkAbort(signal);
    for(let x=0;x<frame.width;x++){
      const i=y*frame.width+x;
      for(let c=0;c<3;c++)data[i*4+c]=Math.round(Math.max(0,Math.min(1,linearToSrgb(frame.data[i*3+c]/65535)))*255);
      data[i*4+3]=255;
    }
  }
  checkAbort(signal);
  return {pixels:assertPixels({width:frame.width,height:frame.height,data}),metadata:decoded.metadata,
    provenance:{...decoded.provenance,engineVersion:WEB_RAW_DENOISE_VERSION,
      denoise:{method:'joint-color-bilateral',domain:'post-demosaic-linear-srgb16',strength,radius,sigma,
        skipped:strength===0,neighborhoodWorkUpperBound:work,maximumNeighborhoodWork:WEB_RAW_DENOISE_MAX_WORK,
        cfaDenoise:false,adobeEquivalent:false},
      output:{channels:'RGBA',bitsPerSample:8,colorSpace:'srgb',transfer:'encoded'},sourceUnchanged:true,
      processingOrder:[...decoded.provenance.processingOrder,'linear-rgb16-denoise','linear-to-srgb8-rgba']}};
}
