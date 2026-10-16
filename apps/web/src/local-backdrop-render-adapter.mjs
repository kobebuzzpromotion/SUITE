import {validateLocalBackdropBundle} from './local-backdrop-bundle.mjs';
import {renderLocalBackdrop} from './processing/local-backdrop-renderer.mjs';
import {decodeLocalBackdropPNG} from './local-backdrop-png-decoder.mjs';

const fail=reason=>{throw Error(`LOCAL_BACKDROP_ADAPTER_${reason}`);};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
/** Explicit bundle → caller-owned decoder → dedicated renderer.
 * decodeBackground receives ONLY verified encoded bytes and {signal}. It must
 * produce a newly owned upright orientation-1, straight sRGB8 top-left RGBA
 * buffer from those bytes; this adapter erases that returned buffer afterwards.
 * authorize must check current photo/Recipe generation, rights, source-pixel
 * provenance and decoder provenance. It must not approve merely on SHA equality.
 * No UI, store, download, implicit decode or saved-original mutation occurs.
 */
export async function renderLocalBackdropBundle({bundle,source,decodeBackground=decodeLocalBackdropPNG,authorize,
  localWarp=null,localRetouch=null,workingByteLimit=256*1024*1024},{signal}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
  check();
  if(typeof decodeBackground!=='function'||typeof authorize!=='function')fail('HOST_REQUIRED');
  if(localWarp!=null)fail('WARP_UNSUPPORTED');
  const fixedRetouch=localRetouch==null?null:structuredClone(localRetouch);
  if(!Number.isSafeInteger(workingByteLimit)||workingByteLimit<1||workingByteLimit>512*1024*1024)fail('BUDGET');
  if(!source||!(source.data instanceof Uint8ClampedArray)||
    !Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||
    source.width>32768||source.height>32768||source.width*source.height>8_000_000||
    source.data.length!==source.width*source.height*4||source.colorSpace!=='srgb'||
    source.alpha!=='straight'||source.rows!=='top-left'||source.orientation!==1)fail('SOURCE');
  let verified,foreground,decoded,decoderBytes,result,success=false;
  try{
    // Freeze source pixels before the first asynchronous boundary.
    foreground={width:source.width,height:source.height,data:source.data.slice(),
      colorSpace:'srgb',alpha:'straight',rows:'top-left',orientation:1};
    verified=await validateLocalBackdropBundle(bundle,{signal});check();
    // Account for adapter-owned copies in addition to the renderer's own
    // buffers. Host/decoder internal allocations are outside this estimate.
    const retainedBytes=foreground.data.byteLength+verified.backgroundBytes.byteLength*2+
      verified.maskBytes.byteLength+verified.manifest.width*verified.manifest.height*4;
    const rendererBudget=workingByteLimit-retainedBytes;
    if(!Number.isSafeInteger(rendererBudget)||rendererBudget<1)fail('BUDGET');
    const current=async(stage,pixelBinding={})=>{
      check();
      if(await authorize({stage,binding:{...verified.binding},recipe:structuredClone(verified.recipe),
        manifest:{...verified.manifest},maskKind:verified.maskKind,...pixelBinding},{signal})!==true)fail('STALE_OR_PERMISSION');
      check();
    };
    await current('beforeDecode');
    decoderBytes=verified.backgroundBytes.slice();
    decoded=await decodeBackground(decoderBytes,{signal});check();
    // No metadata defaults: a decoder must explicitly attest pixel conventions.
    if(!decoded||!(decoded.data instanceof Uint8ClampedArray)||
      decoded.width!==verified.manifest.width||decoded.height!==verified.manifest.height||
      decoded.data.length!==decoded.width*decoded.height*4||decoded.colorSpace!=='srgb'||
      decoded.alpha!=='straight'||decoded.rows!=='top-left'||decoded.orientation!==1)fail('DECODE');
    await current('afterDecode');
    const [sourcePixelSHA256,backgroundPixelSHA256]=await Promise.all([digest(foreground.data),digest(decoded.data)]);check();
    await current('beforeRender',{sourcePixelSHA256,backgroundPixelSHA256});
    result=await renderLocalBackdrop({source:foreground,
      background:{pixels:decoded,bytes:verified.backgroundBytes,manifest:verified.manifest},
      maskBytes:verified.maskBytes,recipe:verified.recipe,binding:verified.binding,
      sourcePixelSHA256,backgroundPixelSHA256,maskKind:verified.maskKind,localWarp,localRetouch:fixedRetouch,workingByteLimit:rendererBudget,
      authorize:binding=>current('renderer',binding).then(()=>true)},{signal});
    await current('release',{sourcePixelSHA256,backgroundPixelSHA256});
    success=true;return result;
  }finally{
    foreground?.data.fill(0);decoderBytes?.fill(0);
    if(decoded?.data instanceof Uint8ClampedArray)decoded.data.fill(0);
    verified?.backgroundBytes.fill(0);verified?.maskBytes.fill(0);
    if(!success)result?.data.fill(0);
  }
}
