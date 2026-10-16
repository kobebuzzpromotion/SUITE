import {assertPixels,checkAbort} from './pure.mjs';
import {readExportResolution,writeExportResolution} from '../export-resolution.mjs';
import {encodeTIFF} from '../export-tiff.mjs';
export async function encode(pixels,{format='jpeg',quality=.95,settings,resolution,signal}={},validateExportSettings) {
  assertPixels(pixels);checkAbort(signal);
  if(!['jpeg','png','tiff'].includes(format)||typeof quality!=='number'||!Number.isFinite(quality)||quality<.01||quality>1)throw Error('UNSUPPORTED_WEB_ENCODING');
  if(resolution!==undefined&&(!resolution||typeof resolution!=='object'||Array.isArray(resolution)||
    Reflect.ownKeys(resolution).some(key=>!['unit','value'].includes(key))||
    !['ppi','ppc'].includes(resolution.unit)||!Number.isSafeInteger(resolution.value)||
    resolution.value<1||resolution.value>65535))throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
  if(settings) {
    if(typeof validateExportSettings!=='function')throw Error('SHARED_EXPORT_VALIDATOR_REQUIRED');validateExportSettings(settings);
    if(settings.format!==format||settings.bit_depth!==8||settings.color_space!=='sRGB'||settings.tiff_compression!=='none'||settings.metadata!=='remove'||settings.requested_dpi!==96)throw Error('UNSUPPORTED_WEB_EXPORT_SETTINGS');
    if(format==='jpeg'&&quality!==settings.jpeg_quality/100)throw Error('EXPORT_QUALITY_MISMATCH');
  }
  if(format==='tiff'){
    if(quality!==.95)throw Error('TIFF_QUALITY_UNSUPPORTED');
    // This Worker receives only rendered RGBA8 sRGB pixels. Never claim RAW16,
    // AdobeRGB, LZW, or metadata preservation merely because the TIFF schema
    // can describe them. Explicit preserve_alpha=false uses the same white
    // flattening as legacy JPEG/PNG before requesting RGB TIFF output.
    const data=pixels.data.slice();
    if(settings?.preserve_alpha===false)for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*a+255*(1-a));data[i+3]=255;}
    const density=resolution===undefined?undefined:{x:resolution.value,y:resolution.value,unit:resolution.unit==='ppi'?'INCH':'CENTIMETER'};
    const encoded=encodeTIFF({width:pixels.width,height:pixels.height,data,channels:settings?.preserve_alpha===false?'RGB':'RGBA',bitsPerSample:8,
      ...(density===undefined?{}:{resolution:density}),signal});
    checkAbort(signal);
    const blob=new Blob([encoded.bytes],{type:'image/tiff'});
    if(!blob.size||blob.type!=='image/tiff')throw Error('ENCODER_FORMAT_MISMATCH');
    return blob;
  }
  if(typeof OffscreenCanvas==='undefined')throw Error('WORKER_OFFSCREEN_CANVAS_UNAVAILABLE');
  const canvas=new OffscreenCanvas(pixels.width,pixels.height),context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
  const data=pixels.data.slice();
  if(format==='jpeg'||settings?.preserve_alpha===false)for(let i=0;i<data.length;i+=4){const a=data[i+3]/255;for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*a+255*(1-a));data[i+3]=255;}
  context.putImageData(new ImageData(data,pixels.width,pixels.height),0,0);
  const type=format==='jpeg'?'image/jpeg':'image/png',blob=await canvas.convertToBlob({type,quality});checkAbort(signal);
  if(!blob.size||blob.type!==type)throw Error('ENCODER_FORMAT_MISMATCH');
  if(resolution===undefined)return blob;
  // The existing encoder strips source metadata. An explicit print-density
  // request adds only JFIF APP0 or PNG pHYs after encoding, never original Exif.
  const encoded=new Uint8Array(await blob.arrayBuffer());checkAbort(signal);
  const marked=writeExportResolution(encoded,{format,...resolution});checkAbort(signal);
  const verified=readExportResolution(marked,format);
  if(verified.width!==pixels.width||verified.height!==pixels.height)throw Error('ENCODED_DIMENSION_MISMATCH');
  return new Blob([marked],{type});
}
