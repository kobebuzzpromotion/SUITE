import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES} from './processing/pure.mjs';

const RAW_NAME=/\.(arw|cr2|cr3|nef|nrw|dng|raf|rw2|orf|pef|srw|raw)$/i;

/** Full upright, decoded sRGB8 training input. No Proxy/thumbnail, resizing,
 * file registration, upload, or substitution of a non-RAW browser decode.
 * The filename selects a candidate only; bundled LibRaw evidence is required.
 */
export async function decodePersonalLookRaw(file,{signal,guard}={}){
  if(typeof guard!=='function'||!(file instanceof Blob)||typeof file.name!=='string'||!RAW_NAME.test(file.name)||
      !Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_INPUT_BYTES)
    throw Error('LOOK_RAW_INPUT_INVALID');
  const name=file.name,size=file.size;
  const check=()=>{checkAbort(signal);guard();if(file.name!==name||file.size!==size)throw Error('LOOK_RAW_INPUT_CHANGED');};
  const read=async task=>{check();const result=await task();check();return result;};
  const bytes=await read(()=>file.arrayBuffer());
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==size)throw Error('LOOK_RAW_INPUT_SIZE');
  const digest=await read(()=>globalThis.crypto.subtle.digest('SHA-256',bytes));
  const sha=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const processing=createProcessing();
  try{
    const result=await read(()=>processing.decodeRaw(bytes,{mode:'final',signal}));
    assertPixels(result?.pixels);const frame=result.pixels,source=sourceDimensions(frame),proof=result.provenance;
    if(frame.width*frame.height>8_000_000||source.width!==frame.width||source.height!==frame.height||
        proof?.decoderPackage!=='@colorhythm/libraw-wasm'||proof.decoderPackageVersion!=='1.1.1'||
        typeof proof.librawVersion!=='string'||!proof.librawVersion||
        proof.sourceSHA256!==sha||proof.sourceRepresentation!=='original-camera-raw'||
        proof.decodePath!=='open/unpack/dcrawProcess/dcrawMakeMemImage'||proof.mode!=='final'||
        proof.halfSize!==0||proof.thumbnailFallback!==false||proof.colorSpace!=='sRGB'||proof.bitDepth!==8||
        proof.orientation!=='LibRaw-default-user_flip=-1-normalized-upright')
      throw Error('LOOK_RAW_FULL_DECODE_REQUIRED');
    check();
    return {width:frame.width,height:frame.height,data:new Uint8ClampedArray(frame.data)};
  }finally{processing.dispose();}
}
