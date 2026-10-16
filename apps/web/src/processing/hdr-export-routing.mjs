import {createHDRFrame,toneMapSDRPreview,HDR_COLOR_SPACE,HDR_SOURCE_ENCODING} from './hdr-frame.mjs';
import {encodeRadianceHDR} from './astra-hdr-rgbe.mjs';
import {assertPixels,checkAbort} from './pure.mjs';

const PURPOSES=['print','sns','hdr-preserve'];
const KEYS=['purpose','format','bitDepth','colorSpace','signal'];

function exportRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
      Reflect.ownKeys(value).some(key=>typeof key!=='string'||!KEYS.includes(key)||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))||
      !PURPOSES.includes(value.purpose))throw Error('HDR_EXPORT_REQUEST_INVALID');
  const {purpose,signal}=value;
  const format=value.format??(purpose==='hdr-preserve'?'rgbe':purpose==='print'?'tiff':'jpeg');
  if(purpose==='hdr-preserve'){
    if(format!=='rgbe')throw Error('HDR_EXPORT_FORMAT_UNSUPPORTED');
    // RGBE is not a Float32 or a 32-bit-per-channel file. Do not silently
    // reinterpret a TIFF/PNG-style scalar bit-depth request as shared exponent.
    if(Object.hasOwn(value,'bitDepth'))throw Error('HDR_EXPORT_RGBE_BIT_DEPTH_NOT_SCALAR');
    if(Object.hasOwn(value,'colorSpace')&&value.colorSpace!==HDR_COLOR_SPACE)
      throw Error('HDR_EXPORT_COLOR_SPACE_UNSUPPORTED');
  }else{
    if(!['jpeg','png','tiff'].includes(format))throw Error('SDR_EXPORT_FORMAT_UNSUPPORTED');
    if(Object.hasOwn(value,'bitDepth')&&value.bitDepth!==8)throw Error('SDR_EXPORT_BIT_DEPTH_UNSUPPORTED');
    if(Object.hasOwn(value,'colorSpace')&&value.colorSpace!=='sRGB')throw Error('SDR_EXPORT_COLOR_SPACE_UNSUPPORTED');
  }
  if(signal!==undefined&&(signal===null||typeof signal!=='object'||typeof signal.aborted!=='boolean'))
    throw Error('HDR_EXPORT_SIGNAL_INVALID');
  checkAbort(signal);
  return {purpose,format,signal};
}

/**
 * Independent HDR output router. It does not register a Worker/UI operation,
 * write files, create a Blob, or send a frame to the legacy encode() function.
 *
 * routeHDRExport(frame,{purpose:'print'|'sns',format?:'jpeg'|'png'|'tiff',
 *   bitDepth?:8,colorSpace?:'sRGB',signal?}) returns kind:'sdr-pixels'. Its
 * pixels field contains only validated Uint8ClampedArray RGBA8 and can later be
 * passed to the existing SDR encoder. The requested file is not yet encoded.
 *
 * routeHDRExport(frame,{purpose:'hdr-preserve',format?:'rgbe',
 *   colorSpace?:'LINEAR_SRGB_REC709',signal?}) returns kind:'hdr-bytes', already
 * encoded by the existing Radiance encoder. Never pass this result to encode().
 * RGBE has three 8-bit mantissas plus one shared 8-bit exponent: 32 bits/pixel,
 * not 32 bits/channel. It retains HDR range with RGBE quantization, not lossless
 * Float32 precision. Reference-white nits are supplied as side metadata only.
 */
export function routeHDRExport(frame,request){
  const {purpose,format,signal}=exportRequest(request);
  // Revalidate and detach the linear frame before choosing either output path.
  // A mislabeled RGBA8 buffer cannot satisfy createHDRFrame's Float32 RGB input.
  const source=createHDRFrame({width:frame?.width,height:frame?.height,pixels:frame?.pixels,
    colorSpace:frame?.colorSpace,sourceEncoding:frame?.sourceEncoding,
    sdrWhiteNits:frame?.sdrWhiteNits,headroomStops:frame?.headroomStops,signal});
  const sourceDescription=Object.freeze({width:source.width,height:source.height,
    colorSpace:HDR_COLOR_SPACE,sourceEncoding:HDR_SOURCE_ENCODING,
    sdrWhiteNits:source.sdrWhiteNits,headroomStops:source.headroomStops,
    hasHDRContent:source.hasHDRContent});
  if(purpose==='hdr-preserve'){
    const bytes=encodeRadianceHDR(source,{signal});checkAbort(signal);
    return Object.freeze({kind:'hdr-bytes',bytes,source:sourceDescription,
      output:Object.freeze({purpose,format:'rgbe',container:'Radiance HDR',
        extension:'.hdr',encoded:true,width:source.width,height:source.height,
        colorSpace:HDR_COLOR_SPACE,transfer:'linear',channels:'RGB',
        encoding:'RGBE_SHARED_EXPONENT',mantissaBitsPerChannel:8,
        sharedExponentBits:8,bitsPerPixel:32,alpha:false,
        hdrRangePreserved:true,float32PrecisionPreserved:false,
        sdrWhiteNitsEmbedded:false}),
      toneMapping:null});
  }
  const mapped=toneMapSDRPreview(source,{signal});
  // Strip preview-only fields and, critically, never return Float32 source
  // channels inside the encoder input. Preserve the existing SDR curve verbatim.
  const pixels={width:mapped.width,height:mapped.height,data:mapped.data};
  assertPixels(pixels);checkAbort(signal);
  return Object.freeze({kind:'sdr-pixels',pixels,source:sourceDescription,
    output:Object.freeze({purpose,format,encoded:false,width:pixels.width,height:pixels.height,
      colorSpace:'sRGB',transfer:'sRGB',channels:'RGBA',pixelEncoding:'RGBA8',
      bitDepth:8,bitsPerPixel:32,alpha:'opaque',hdrRangePreserved:false}),
    toneMapping:Object.freeze({algorithm:'suite-sdr-preview-75pct-log-highlight-1',
      clippedPixels:mapped.clippedPixels,headroomStops:source.headroomStops})});
}
