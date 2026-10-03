import {LibRaw} from '@colorhythm/libraw-wasm';
import {assertInputBuffer,assertPixels,checkAbort,MAX_PIXELS,WEB_ENGINE} from './pure.mjs';
export async function sha256(buffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join(''); }
let initialized;
async function initialize() {
  if(!initialized) initialized=(async()=>{const response=await fetch('/vendor/libraw/libraw.wasm');if(!response.ok)throw Error('LIBRAW_WASM_UNAVAILABLE');const bytes=await response.arrayBuffer();const hash=await sha256(bytes);await LibRaw.initialize(bytes);return hash;})();
  return initialized;
}
export async function decodeRaw(buffer,{signal,mode='final'}={}) {
  assertInputBuffer(buffer);checkAbort(signal);if(!['proxy','final'].includes(mode))throw Error('INVALID_DECODE_MODE');
  const signature=new Uint8Array(buffer,0,Math.min(buffer.byteLength,12));
  if(signature[0]===255&&signature[1]===216 || signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71 || signature[0]===71&&signature[1]===73&&signature[2]===70 || signature[0]===82&&signature[1]===73&&signature[2]===70&&signature[8]===87&&signature[9]===69)throw Error('NOT_CAMERA_RAW');
  const sourceSHA256=await sha256(buffer),wasmSHA256=await initialize();checkAbort(signal);
  const decoder=new LibRaw();await decoder.waitUntilReady();
  try {
    decoder.open(buffer);
    const rawWidth=decoder.getRawWidth(),rawHeight=decoder.getRawHeight(),camera=decoder.getIParams(),flip=decoder.getFlip();
    if(!Number.isSafeInteger(rawWidth)||!Number.isSafeInteger(rawHeight)||rawWidth<1||rawHeight<1||rawWidth*rawHeight>MAX_PIXELS||camera.raw_count!==1)throw Error('UNSUPPORTED_OR_OVERSIZE_RAW');
    if(![0,3,5,6].includes(flip)||decoder.getPixelAspect()!==1)throw Error('UNSUPPORTED_RAW_ORIENTATION_OR_ASPECT');
    decoder.setHalfSize(0);decoder.setUseCameraWb(1);decoder.setOutputColor(1);decoder.setOutputBps(8);
    decoder.setGamma(0,1/2.4);decoder.setGamma(1,12.92);decoder.setNoAutoBright(1);decoder.setBright(1);
    checkAbort(signal);decoder.unpack();checkAbort(signal);decoder.dcrawProcess();checkAbort(signal);
    const image=decoder.dcrawMakeMemImage();
    if(image.type_!=='LIBRAW_IMAGE_BITMAP'||image.bits!==8||image.colors!==3||image.data_size!==image.width*image.height*3||image.data.length!==image.data_size||image.width*image.height>MAX_PIXELS)throw Error('UNSUPPORTED_PROCESSED_RAW_LAYOUT');
    const data=new Uint8ClampedArray(image.width*image.height*4);
    for(let i=0,j=0;i<image.data.length;i+=3,j+=4){data[j]=image.data[i];data[j+1]=image.data[i+1];data[j+2]=image.data[i+2];data[j+3]=255;}
    const pixels=assertPixels({width:image.width,height:image.height,data});
    return {pixels,metadata:{make:camera.normalized_make||camera.make,model:camera.normalized_model||camera.model,rawWidth,rawHeight,width:image.width,height:image.height,sourceFlip:flip},
      provenance:{engineVersion:WEB_ENGINE,decoderPackage:'@colorhythm/libraw-wasm',decoderPackageVersion:'1.1.1',librawVersion:LibRaw.version(),wasmSHA256,sourceSHA256,mode,sourceRepresentation:'original-camera-raw',decodePath:'open/unpack/dcrawProcess/dcrawMakeMemImage',thumbnailFallback:false,halfSize:0,colorSpace:'sRGB',gamma:[1/2.4,12.92],bitDepth:8,whiteBalance:'camera-requested-libraw-fallback-policy',autoBright:false,orientation:'LibRaw-default-user_flip=-1-normalized-upright',anchorCoordinates:'normalized-lower-left',maskCoordinates:'normalized-upper-left',processingOrder:['unedited-decoded-base','person-face-brightness','global-exposure','global-contrast','global-saturation','rotation','crop','encode'],license:'wrapper MIT; LibRaw LGPL-2.1 OR CDDL-1.0'}};
  } finally {decoder.dispose();}
}
