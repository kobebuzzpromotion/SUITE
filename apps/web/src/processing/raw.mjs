import {LibRaw} from '@colorhythm/libraw-wasm';
import {sha256} from './sha256.mjs';
export {sha256} from './sha256.mjs';
import {assertInputBuffer,assertPixels,checkAbort,MAX_PIXELS,WEB_ENGINE} from './pure.mjs';
import {assertRawDecodeAdmission,assertRawFrameDimensions,rawDecodeCapabilities as describeCapabilities,RAW_PROXY_MAX_SOURCE_PIXELS,RAW_ALLOCATION_MAX_MB} from './raw-decode-capability.mjs';
import {suiteNativeABI,createRawNativeBridge} from './raw-native-bridge.mjs';
// A deliberately conservative evidence range, not a conversion to UTC or a
// camera-local calendar day. LibRaw documents time_t as shooting date but the
// wrapper does not expose the source timezone/offset or parsing convention.
const MAX_CAPTURE_TIMESTAMP_SECONDS = 4133980799n; // through year 2100
export function libRawTimestampEvidence(value) {
  if (typeof value !== 'bigint' || value <= 0n || value > MAX_CAPTURE_TIMESTAMP_SECONDS) return null;
  return {libRawTimestampSeconds: value.toString(), libRawTimestampTimezone: 'UNVERIFIED'};
}
let initialized,nativeModule;
export function rawDecodeCapabilities(){return describeCapabilities(nativeModule);}
async function initialize() {
  if(!initialized) initialized=(async()=>{const response=await fetch('/vendor/libraw/libraw.wasm');if(!response.ok)throw Error('LIBRAW_WASM_UNAVAILABLE');const bytes=await response.arrayBuffer();const hash=await sha256(bytes);nativeModule=await LibRaw.initialize(bytes);return hash;})();
  return initialized;
}
export async function decodeRaw(buffer,{signal,mode='final'}={}) {
  assertInputBuffer(buffer);checkAbort(signal);if(!['proxy','final'].includes(mode))throw Error('INVALID_DECODE_MODE');
  const signature=new Uint8Array(buffer,0,Math.min(buffer.byteLength,12));
  if(signature[0]===255&&signature[1]===216 || signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71 || signature[0]===71&&signature[1]===73&&signature[2]===70 || signature[0]===82&&signature[1]===73&&signature[2]===70&&signature[8]===87&&signature[9]===69)throw Error('NOT_CAMERA_RAW');
  const sourceSHA256=await sha256(buffer),wasmSHA256=await initialize();checkAbort(signal);
  const decoder=new LibRaw();await decoder.waitUntilReady();
  try {
    checkAbort(signal);
    decoder.open(buffer);
    const rawWidth=decoder.getRawWidth(),rawHeight=decoder.getRawHeight(),camera=decoder.getIParams(),flip=decoder.getFlip();
    let timestampEvidence=null;
    try { timestampEvidence=libRawTimestampEvidence(decoder.getImgOther()?.timestamp); }
    catch { /* Optional descriptive metadata must not be invented or block valid pixels. */ }
    const {halfSize}=assertRawDecodeAdmission({rawWidth,rawHeight,rawCount:camera.raw_count,mode,inputBytes:buffer.byteLength,nativeABI:suiteNativeABI(nativeModule)});
    if(![0,3,5,6].includes(flip)||decoder.getPixelAspect()!==1)throw Error('UNSUPPORTED_RAW_ORIENTATION_OR_ASPECT');
    let bridge=null,fullGeometry=null;
    if(halfSize===1) {
      bridge=createRawNativeBridge(nativeModule,decoder);
      fullGeometry=bridge.planFullGeometry(buffer,{maxRawMB:RAW_ALLOCATION_MAX_MB,signal});
      assertRawFrameDimensions(fullGeometry.width,fullGeometry.height,RAW_PROXY_MAX_SOURCE_PIXELS);
      bridge.setMaxRawMemoryMB(RAW_ALLOCATION_MAX_MB);
    }
    decoder.setHalfSize(halfSize);decoder.setUseCameraWb(1);decoder.setOutputColor(1);decoder.setOutputBps(8);
    decoder.setGamma(0,1/2.4);decoder.setGamma(1,12.92);decoder.setNoAutoBright(1);decoder.setBright(1);
    checkAbort(signal);decoder.unpack();checkAbort(signal);decoder.dcrawProcess();checkAbort(signal);
    let processedFormat=null;
    if(bridge) {
      processedFormat=bridge.getProcessedFormat();
      assertRawFrameDimensions(processedFormat.width,processedFormat.height,MAX_PIXELS);
      if(processedFormat.bits!==8||processedFormat.colors!==3||processedFormat.width>fullGeometry.width||processedFormat.height>fullGeometry.height)
        throw Error('UNSUPPORTED_PROCESSED_RAW_LAYOUT');
      checkAbort(signal);
    }
    const image=decoder.dcrawMakeMemImage();
    checkAbort(signal);assertRawFrameDimensions(image.width,image.height,MAX_PIXELS);
    if(processedFormat&&['width','height','colors','bits'].some(key=>image[key]!==processedFormat[key]))throw Error('RAW_PROCESSED_FORMAT_MISMATCH');
    if(image.type_!=='LIBRAW_IMAGE_BITMAP'||image.bits!==8||image.colors!==3||image.data_size!==image.width*image.height*3||image.data.length!==image.data_size||image.width*image.height>MAX_PIXELS)throw Error('UNSUPPORTED_PROCESSED_RAW_LAYOUT');
    const data=new Uint8ClampedArray(image.width*image.height*4);
    for(let y=0;y<image.height;y++){checkAbort(signal);for(let x=0;x<image.width;x++){const j=(y*image.width+x)*4,i=(y*image.width+x)*3;data[j]=image.data[i];data[j+1]=image.data[i+1];data[j+2]=image.data[i+2];data[j+3]=255;}}
    const sourceGeometry=fullGeometry?{sourceWidth:fullGeometry.width,sourceHeight:fullGeometry.height}:{};
    const pixels=assertPixels({width:image.width,height:image.height,data,...sourceGeometry});
    return {pixels,metadata:{make:camera.normalized_make||camera.make,model:camera.normalized_model||camera.model,rawWidth,rawHeight,width:image.width,height:image.height,sourceFlip:flip,
      ...sourceGeometry,...(timestampEvidence||{})},
      provenance:{engineVersion:WEB_ENGINE,decoderPackage:'@colorhythm/libraw-wasm',decoderPackageVersion:'1.1.1',librawVersion:LibRaw.version(),wasmSHA256,sourceSHA256,mode,sourceRepresentation:'original-camera-raw',decodePath:'open/unpack/dcrawProcess/dcrawMakeMemImage',thumbnailFallback:false,halfSize,...(bridge?{nativeABI:1,fullUprightGeometry:{...fullGeometry},geometryEvidence:'separate-decoder-half0-adjust_sizes_info_only',rawAllocationMaxMB:RAW_ALLOCATION_MAX_MB,totalMemoryBounded:false}:{}),colorSpace:'sRGB',gamma:[1/2.4,12.92],bitDepth:8,whiteBalance:'camera-requested-libraw-fallback-policy',autoBright:false,orientation:'LibRaw-default-user_flip=-1-normalized-upright',anchorCoordinates:'normalized-lower-left',maskCoordinates:'normalized-upper-left',processingOrder:['unedited-decoded-base','person-face-brightness','global-exposure','global-contrast','global-saturation','rotation','crop','encode'],license:'wrapper MIT; LibRaw LGPL-2.1 OR CDDL-1.0'}};
  } finally {decoder.dispose();}
}
