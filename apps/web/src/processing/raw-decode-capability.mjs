import {MAX_INPUT_BYTES,MAX_PIXELS} from './pure.mjs';
import {suiteNativeABI} from './raw-native-bridge.mjs';
export const RAW_PROXY_MAX_SOURCE_PIXELS=96_000_000;
export const RAW_ALLOCATION_MAX_MB=512;

/** Capabilities of the loaded wrapper/native bridge, not hypothetical LibRaw support.
 * setHalfSize(1) reduces the developed raster but does not bound RAW unpack memory.
 * Active/iwidth getters do not expose the complete full-resolution output geometry:
 * LibRaw's get_mem_image_format also uses internal Fuji geometry and pixel aspect.
 * Neither make/model nor half-size output matching ceil(active/2) proves absence
 * of those transforms. Only ABI 1's separate decoder full-geometry plan admits
 * large RAWs. Stock 1.1.1 without the new WASM and glue remains unsupported.
 * References: LibRaw src/preprocessing/raw2image.cpp and
 * src/postprocessing/mem_image.cpp; @colorhythm/libraw-wasm 1.1.1 public index.d.ts.
 */
export function rawDecodeCapabilities(module) {
  const available=suiteNativeABI(module)===1;
  return Object.freeze({
    decoderPackage:'@colorhythm/libraw-wasm',decoderPackageVersion:'1.1.1',
    nativeABI:available?1:0,halfSizeSetterAvailable:true,largeRawProxySupported:available,
    largeRawProxyBlocker:available?null:'RAW_NATIVE_EXTENSION_REQUIRED',
    maxInputBytes:MAX_INPUT_BYTES,maxSensorPixels:available?RAW_PROXY_MAX_SOURCE_PIXELS:MAX_PIXELS,maxOutputPixels:MAX_PIXELS,
    maxSourcePixels:available?RAW_PROXY_MAX_SOURCE_PIXELS:MAX_PIXELS,maxFinalSensorPixels:MAX_PIXELS,
    // This is a pre-unpack admission budget, NOT a promise that all decoder
    // allocations fit in sensorPixels*2 bytes. The extension bounds RAW allocation,
    // not total decoder working memory or JS copies.
    unpackBudgetKind:available?'native-raw-allocation-and-sensor-pixel-limits':'sensor-pixel-admission-limit',
    rawAllocationMaxMB:available?RAW_ALLOCATION_MAX_MB:null,totalMemoryBounded:false,
    sourceGeometry:available?'separate-native-full-upright-plan':'actual-full-resolution-upright-decoded-output',
    thumbnailFallback:false,
  });
}

/** Called after open (metadata), before unpack (full sensor allocation). */
export function assertRawDecodeAdmission({rawWidth,rawHeight,rawCount,mode,inputBytes,nativeABI=0}) {
  if(!['proxy','final'].includes(mode))throw Error('INVALID_DECODE_MODE');
  if(!Number.isSafeInteger(inputBytes)||inputBytes<1||inputBytes>MAX_INPUT_BYTES)
    throw Error('INVALID_OR_OVERSIZE_RAW');
  const sensorPixels=rawWidth*rawHeight;
  if(!Number.isSafeInteger(rawWidth)||!Number.isSafeInteger(rawHeight)||rawWidth<1||rawHeight<1||
    !Number.isSafeInteger(sensorPixels)||rawCount!==1)throw Error('UNSUPPORTED_OR_OVERSIZE_RAW');
  if(sensorPixels>MAX_PIXELS) {
    if(mode!=='proxy'||sensorPixels>RAW_PROXY_MAX_SOURCE_PIXELS)throw Error('UNSUPPORTED_OR_OVERSIZE_RAW');
    if(nativeABI!==1){const error=Error('RAW_NATIVE_EXTENSION_REQUIRED');error.code='RAW_NATIVE_EXTENSION_REQUIRED';throw error;}
    return {sensorPixels,halfSize:1};
  }
  return {sensorPixels,halfSize:0};
}
export function assertRawFrameDimensions(width,height,maxPixels) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    !Number.isSafeInteger(width*height)||width*height>maxPixels)throw Error('UNSUPPORTED_PROCESSED_RAW_LAYOUT');
  return {width,height};
}
