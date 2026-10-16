import {decodeSceneRaw} from './delta66-scene-raw.mjs';
import {checkAbort,MAX_PIXELS} from './pure.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MODEL_TASK='demosaiced-linear-rgb-denoise';
function frame16(frame){
  if(!frame||!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width<1||frame.height<1||frame.width*frame.height>MAX_PIXELS||frame.channels!=='RGB'||frame.bitsPerSample!==16||frame.colorSpace!=='srgb'||frame.transfer!=='linear'||frame.alphaMode!==undefined||!(frame.data instanceof Uint16Array)||!(frame.data.buffer instanceof ArrayBuffer)||frame.data.length!==frame.width*frame.height*3)throw Error('RAW_DENOISE_LINEAR_RGB16_REQUIRED');
  return frame;
}
const copy=frame=>({...frame,data:frame.data.slice()});
function unit(v){if(!Number.isFinite(v)||v<0||v>1)throw Error('RAW_DENOISE_STRENGTH');return v;}
/** Joint-color bilateral filtering in LINEAR 16-bit RGB. sigma is normalized
 * linear signal noise, not an ISO value or estimated camera calibration.
 * Spatial distance and RGB distance jointly suppress cross-edge smoothing.
 * This is explicitly classical, post-demosaic denoising, NOT RAW/CFA AI.
 */
export function denoiseLinearRAW16(input,{strength=.5,radius=2,sigma=.015,signal}={}){
  frame16(input);checkAbort(signal);unit(strength);
  if(!Number.isInteger(radius)||radius<1||radius>4||!Number.isFinite(sigma)||sigma<1/65535||sigma>.25)throw Error('RAW_DENOISE_PARAMETERS');
  const out=copy(input);if(!strength)return out;
  const {width:w,height:h,data}=input,taps=[],spatial=Math.max(.5,radius/1.5),noiseScale=1/(2*sigma*sigma*65535*65535);
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)taps.push([dx,dy,Math.exp(-(dx*dx+dy*dy)/(2*spatial*spatial))]);
  for(let y=0;y<h;y++){checkAbort(signal);for(let x=0;x<w;x++){
    const o=(y*w+x)*3,center=[data[o],data[o+1],data[o+2]],sum=[0,0,0];let norm=0;
    for(const [dx,dy,spatialWeight] of taps){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=(yy*w+xx)*3;
      const distance=((data[j]-center[0])**2+(data[j+1]-center[1])**2+(data[j+2]-center[2])**2)/3,weight=spatialWeight*Math.exp(-distance*noiseScale);norm+=weight;
      for(let c=0;c<3;c++)sum[c]+=data[j+c]*weight;}
    for(let c=0;c<3;c++)out.data[o+c]=Math.round(center[c]+(sum[c]/norm-center[c])*strength);
  }}return out;
}
/** Concrete ONNX contract:
 * imageInput: float32 [1,3,tileHeight,tileWidth], linear sRGB 0..1.
 * optional sigmaInput: float32 [1], normalized linear signal sigma.
 * imageOutput: float32 [1,3,tileHeight,tileWidth], denoised linear sRGB 0..1,
 * NOT a residual map, camera RGB, encoded sRGB, log data or packed Bayer.
 * Edge-clamped context tiles; only halo-free centers are retained. Model must
 * support this tiled IO and its receptive-field radius must fit within halo.
 * Actual SHA check/session.run are implemented; no weights/runtime bundled.
 */
export async function createRAWLinearDenoiseModel({ort,modelAssetBuffer,modelSHA256,task,imageInput,imageOutput,sigmaInput,tileWidth=256,tileHeight=256,halo=24,receptiveFieldRadius,
  sessionOptions={executionProviders:['wasm']}}={}, {signal}={}){
  checkAbort(signal);const names=[imageInput,...(sigmaInput===undefined?[]:[sigmaInput])];
  if(task!==MODEL_TASK||typeof ort?.Tensor!=='function'||typeof ort?.InferenceSession?.create!=='function'||!(modelAssetBuffer instanceof Uint8Array)||!modelAssetBuffer.length||modelAssetBuffer.length>512*1024*1024||!/^[a-f0-9]{64}$/i.test(modelSHA256||'')||names.some(n=>typeof n!=='string'||!n)||new Set(names).size!==names.length||typeof imageOutput!=='string'||!imageOutput||![tileWidth,tileHeight,halo,receptiveFieldRadius].every(Number.isSafeInteger)||tileWidth<8||tileHeight<8||tileWidth*tileHeight>1_048_576||halo<0||halo*2>=Math.min(tileWidth,tileHeight)||receptiveFieldRadius<0||receptiveFieldRadius>halo)throw Error('RAW_DENOISE_MODEL_CONTRACT');
  const bytes=modelAssetBuffer.slice(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);if(digest!==modelSHA256.toLowerCase())throw Error('RAW_DENOISE_MODEL_SHA');
  const session=await ort.InferenceSession.create(bytes,sessionOptions);
  if(session.inputNames.length!==names.length||names.some(n=>!session.inputNames.includes(n))||!session.outputNames.includes(imageOutput)){await session.release();throw Error('RAW_DENOISE_MODEL_IO');}
  let busy=false,closed=false;
  return Object.freeze({task:MODEL_TASK,modelSHA256:digest,domain:'demosaiced-linear-srgb16',noiseConditioned:sigmaInput!==undefined,
    async run(input,{strength=1,sigma,signal}={}){
      frame16(input);checkAbort(signal);unit(strength);
      if(sigmaInput===undefined&&sigma!==undefined)throw Error('RAW_DENOISE_MODEL_HAS_NO_SIGMA_INPUT');
      const noiseSigma=sigma??.015;if(!Number.isFinite(noiseSigma)||noiseSigma<1/65535||noiseSigma>.25)throw Error('RAW_DENOISE_SIGMA');
      if(busy||closed)throw Error('RAW_DENOISE_MODEL_UNAVAILABLE');const source=copy(input),out=copy(input);if(!strength)return out;busy=true;
      try{
        const coreW=tileWidth-halo*2,coreH=tileHeight-halo*2,n=tileWidth*tileHeight;
        for(let top=0;top<source.height;top+=coreH)for(let left=0;left<source.width;left+=coreW){checkAbort(signal);
          const values=new Float32Array(n*3);
          for(let y=0;y<tileHeight;y++)for(let x=0;x<tileWidth;x++){
            const yy=clamp(top+y-halo,0,source.height-1),xx=clamp(left+x-halo,0,source.width-1),o=(yy*source.width+xx)*3,i=y*tileWidth+x;
            for(let c=0;c<3;c++)values[c*n+i]=source.data[o+c]/65535;
          }
          const tensor=new ort.Tensor('float32',values,[1,3,tileHeight,tileWidth]),noise=sigmaInput?new ort.Tensor('float32',Float32Array.of(noiseSigma),[1]):null;let result;
          try{
            result=await session.run({[imageInput]:tensor,...(noise?{[sigmaInput]:noise}:{})},[imageOutput]);checkAbort(signal);const t=result[imageOutput];
            if(t?.type!=='float32'||t.dims.length!==4||t.dims.some((v,i)=>v!==[1,3,tileHeight,tileWidth][i])||!(t.data instanceof Float32Array)||t.data.length!==n*3||t.data.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('RAW_DENOISE_MODEL_OUTPUT');
            for(let y=0;y<Math.min(coreH,source.height-top);y++)for(let x=0;x<Math.min(coreW,source.width-left);x++){
              const o=((top+y)*source.width+left+x)*3,i=(y+halo)*tileWidth+x+halo;
              for(let c=0;c<3;c++)out.data[o+c]=Math.round(source.data[o+c]+(t.data[c*n+i]*65535-source.data[o+c])*strength);
            }
          }finally{for(const t of Object.values(result||{}))t.dispose?.();tensor.dispose?.();noise?.dispose?.();}
        }return out;
      }finally{busy=false;}
    },async close(){if(busy)throw Error('RAW_DENOISE_MODEL_BUSY');if(!closed){closed=true;await session.release();}}
  });
}
/** Original RAW -> real LibRaw linear RGB16 -> classical OR task-specific
 * learned denoise -> separate RGB16 derivative. No source rewrite or 8-bit
 * intermediate. Existing decoder's supported cameras/24MP bounds still apply.
 * Public getRawImage() returns a COPY; no fake writeback/private pointer hack.
 */
export async function denoiseCameraRAW(buffer,{whiteBalance='camera',userGains,method='classical',model,settings={},signal}={}){
  if(!['classical','model'].includes(method)||method==='model'&&(model?.task!==MODEL_TASK||model.domain!=='demosaiced-linear-srgb16'||typeof model.run!=='function')||method==='classical'&&model!==undefined)throw Error('RAW_DENOISE_METHOD');
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(k=>!(method==='classical'?['strength','radius','sigma']:['strength','sigma']).includes(k)))throw Error('RAW_DENOISE_SETTINGS');
  if(method==='model'&&!model.noiseConditioned&&settings.sigma!==undefined)throw Error('RAW_DENOISE_MODEL_HAS_NO_SIGMA_INPUT');
  const decoded=await decodeSceneRaw(buffer,{whiteBalance,userGains,transfer:'linear',signal});checkAbort(signal);
  const frame=method==='classical'?denoiseLinearRAW16(decoded.frame,{...settings,signal}):await model.run(decoded.frame,{...settings,signal});frame16(frame);
  if(frame.width!==decoded.frame.width||frame.height!==decoded.frame.height)throw Error('RAW_DENOISE_DIMENSION_CHANGE');
  return {frame,metadata:decoded.metadata,provenance:{...decoded.provenance,
    denoise:{method:method==='classical'?'joint-color-bilateral':'task-trained-onnx',domain:'post-demosaic-linear-srgb16',modelSHA256:method==='model'?model.modelSHA256:null,
      settings:{strength:settings.strength??(method==='classical'?.5:1),sigma:method==='classical'||model?.noiseConditioned?(settings.sigma??.015):null,...(method==='classical'?{radius:settings.radius??2}:{})},cfaDenoise:false,adobeEquivalent:false},
    sourceUnchanged:true,disposition:'separate-linear-rgb16-derivative',processingOrder:[...decoded.provenance.processingOrder,'linear-rgb16-denoise']}};
}
