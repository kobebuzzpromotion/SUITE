import {LibRaw} from '@colorhythm/libraw-wasm';
import {assertInputBuffer,checkAbort,MAX_PIXELS} from './pure.mjs';
import {sha256,libRawTimestampEvidence} from './raw.mjs';
let initialization;
async function initialize(){
  if(!initialization)initialization=(async()=>{const response=await fetch('/vendor/libraw/libraw.wasm');if(!response.ok)throw Error('LIBRAW_WASM_UNAVAILABLE');const bytes=await response.arrayBuffer(),requestedWasmSHA256=await sha256(bytes);await LibRaw.initialize(bytes);return requestedWasmSHA256;})();
  return initialization;
}
function gains(value){if(!Array.isArray(value)||![3,4].includes(value.length)||value.some(v=>!Number.isFinite(v)||v<=0||v>64))throw Error('SCENE_RAW_WB_GAINS');return value.length===3?[...value,value[1]]:[...value];}
function bitmap16(image){
  if(image.type_!=='LIBRAW_IMAGE_BITMAP'||image.bits!==16||image.colors!==3||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.width*image.height>MAX_PIXELS||image.data_size!==image.width*image.height*6||image.data.length!==image.data_size)throw Error('SCENE_RAW_16BIT_LAYOUT');
  // WebAssembly memory is little-endian. Do not widen 8-bit pixels and call them 16-bit.
  const view=new DataView(image.data.buffer,image.data.byteOffset,image.data.byteLength),data=new Uint16Array(image.width*image.height*3);
  for(let i=0;i<data.length;i++)data[i]=view.getUint16(i*2,true);return {width:image.width,height:image.height,data};
}
/** SUITE auto WB from a neutral-gain, linear camera-RGB demosaic, not LibRaw's
 * unavailable use_auto_wb setter. Result gains are applied BEFORE final RAW
 * color conversion/demosaic via the real setUserMul API on a new decoder.
 * Only three-color RGB cameras are accepted for this custom auto estimator. */
function autoGains(frame,{signal}={}){
  const sums=[0,0,0];let n=0;for(let i=0;i<frame.data.length;i+=3){if(!(i%12288))checkAbort(signal);const rgb=[frame.data[i],frame.data[i+1],frame.data[i+2]];
    if(rgb.some(v=>v<128||v>64000))continue;for(let c=0;c<3;c++)sums[c]+=rgb[c];n++;}
  if(n<16||sums.some(v=>v<=0))throw Error('SCENE_RAW_AUTO_WB_INSUFFICIENT_SAMPLES');const mean=sums.map(v=>v/n),target=Math.max(...mean),out=mean.map(v=>target/v);
  return gains(out);
}
async function process(buffer,{whiteBalance,userGains,outputColor,transfer,signal}){
  const decoder=new LibRaw();await decoder.waitUntilReady();
  try{
    checkAbort(signal);decoder.open(buffer);const camera=decoder.getIParams(),rawWidth=decoder.getRawWidth(),rawHeight=decoder.getRawHeight(),flip=decoder.getFlip();
    if(!Number.isSafeInteger(rawWidth)||!Number.isSafeInteger(rawHeight)||rawWidth<1||rawHeight<1||rawWidth*rawHeight>MAX_PIXELS||camera.raw_count!==1)throw Error('SCENE_RAW_UNSUPPORTED_DIMENSIONS');
    if(![0,3,5,6].includes(flip)||decoder.getPixelAspect()!==1||camera.colors!==3||!/^RGB/.test(camera.cdesc))throw Error('SCENE_RAW_UNSUPPORTED_CAMERA_LAYOUT');
    decoder.setHalfSize(0);decoder.setUseCameraWb(whiteBalance==='camera'?1:0);for(let c=0;c<4;c++)decoder.setUserMul(c,userGains?.[c]??0);
    decoder.setOutputColor(outputColor);decoder.setOutputBps(16);decoder.setGamma(0,transfer==='linear'?1:1/2.4);decoder.setGamma(1,transfer==='linear'?1:12.92);decoder.setNoAutoBright(1);decoder.setBright(1);
    checkAbort(signal);decoder.unpack();checkAbort(signal);decoder.dcrawProcess();checkAbort(signal);const frame=bitmap16(decoder.dcrawMakeMemImage());
    let timestamp;try{timestamp=libRawTimestampEvidence(decoder.getImgOther()?.timestamp);}catch{/* Optional timestamp evidence. */}
    return {frame,metadata:{make:camera.normalized_make||camera.make,model:camera.normalized_model||camera.model,rawWidth,rawHeight,sourceFlip:flip,...(timestamp||{})}};
  }finally{decoder.dispose();}
}
/** Actual RAW-domain camera/auto/explicit WB and genuine 16-bit RGB output.
 * No shared decoder/Recipe route is changed. Caller must use the 16-bit export
 * route, never pass this frame to the RGBA8 encoder. Camera mode retains the
 * existing LibRaw fallback policy when camera metadata lacks valid WB.
 * No guessed Kelvin -> camera multiplier conversion is provided. */
export async function decodeSceneRaw(buffer,{whiteBalance='camera',userGains,transfer='srgb',signal}={}){
  assertInputBuffer(buffer);checkAbort(signal);if(!['camera','auto','explicit'].includes(whiteBalance)||!['srgb','linear'].includes(transfer)||whiteBalance!=='explicit'&&userGains!==undefined)throw Error('SCENE_RAW_WB_MODE');
  const source=buffer.slice(0),signature=new Uint8Array(source,0,Math.min(source.byteLength,12));
  if(signature[0]===255&&signature[1]===216||signature[0]===137&&signature[1]===80||signature[0]===71&&signature[1]===73||signature[0]===82&&signature[1]===73&&signature[8]===87&&signature[9]===69)throw Error('NOT_CAMERA_RAW');
  const appliedGains=whiteBalance==='explicit'?gains(userGains):null,sourceSHA256=await sha256(source),requestedWasmSHA256=await initialize();checkAbort(signal);
  let actualGains=appliedGains;
  if(whiteBalance==='auto'){const neutral=await process(source,{whiteBalance:'explicit',userGains:[1,1,1,1],outputColor:0,transfer:'linear',signal});actualGains=autoGains(neutral.frame,{signal});}
  const result=await process(source,{whiteBalance,userGains:actualGains,outputColor:1,transfer,signal});
  return {frame:{...result.frame,channels:'RGB',bitsPerSample:16,colorSpace:'srgb',transfer:transfer==='linear'?'linear':'encoded'},metadata:result.metadata,
    provenance:{sourceSHA256,requestedWasmSHA256,wasmSingletonIdentity:'host-must-pin-before-first-initialization',decoder:'@colorhythm/libraw-wasm',librawVersion:LibRaw.version(),halfSize:0,whiteBalance: whiteBalance==='auto'?'suite-camera-rgb-gray-world':whiteBalance==='camera'?'camera-requested-libraw-fallback-policy':'explicit-camera-channel-gains',userMultipliers:actualGains,processingOrder:['RAW-open','WB-parameters','unpack','dcrawProcess','16bit-mem-image'],autoBright:false,thumbnailFallback:false,orientation:'LibRaw-default-upright',sourceUnchanged:true}};
}
