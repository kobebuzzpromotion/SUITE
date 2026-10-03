import {assertPixels,checkAbort} from './pure.mjs';
export async function encode(pixels,{format='jpeg',quality=.95,settings,signal}={},validateExportSettings) {
  assertPixels(pixels);checkAbort(signal);
  if(!['jpeg','png'].includes(format)||typeof quality!=='number'||!Number.isFinite(quality)||quality<.01||quality>1)throw Error('UNSUPPORTED_WEB_ENCODING');
  if(settings) {
    if(typeof validateExportSettings!=='function')throw Error('SHARED_EXPORT_VALIDATOR_REQUIRED');validateExportSettings(settings);
    if(settings.format!==format||settings.bit_depth!==8||settings.color_space!=='sRGB'||settings.tiff_compression!=='none'||settings.metadata!=='remove'||settings.requested_dpi!==96)throw Error('UNSUPPORTED_WEB_EXPORT_SETTINGS');
    if(format==='jpeg'&&quality!==settings.jpeg_quality/100)throw Error('EXPORT_QUALITY_MISMATCH');
  }
  if(typeof OffscreenCanvas==='undefined')throw Error('WORKER_OFFSCREEN_CANVAS_UNAVAILABLE');
  const canvas=new OffscreenCanvas(pixels.width,pixels.height),context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
  const data=pixels.data.slice();
  if(format==='jpeg'||settings?.preserve_alpha===false)for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*a+255*(1-a));data[i+3]=255;}
  context.putImageData(new ImageData(data,pixels.width,pixels.height),0,0);
  const type=format==='jpeg'?'image/jpeg':'image/png',blob=await canvas.convertToBlob({type,quality});checkAbort(signal);
  if(!blob.size||blob.type!==type)throw Error('ENCODER_FORMAT_MISMATCH');
  return blob;
}
