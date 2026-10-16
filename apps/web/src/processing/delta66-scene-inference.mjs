import {assertPixels,checkAbort} from './pure.mjs';
import {createMaskedInpaintONNX} from './masked-inpaint-onnx.mjs';
import {resizeAstraFrame} from './astra-image-model.mjs';

const TASKS=['white-balance','auto-color','background-fusion','sky-replacement','belly-slimming',
  'face-shadow-removal','relight-natural','relight-golden','people-removal','smart-removal-magic',
  'smart-removal-quick','strong-glare-removal','backdrop-clean'];
/** A task-labelled, digest-pinned model. Labels are an IO requirement backed by
 * the host's model inventory, not proof that arbitrary weights learned that task.
 * Deterministic two-input models reuse the existing real inpaint implementation.
 * Optional noiseInput adds actual seed-conditioned NCHW noise, not fake variants.
 * No weights or ONNX Runtime are installed/downloaded here. */
export async function createSceneImageModel(config,{signal}={}){
  if(!config||!TASKS.includes(config.task))throw Error('SCENE_MODEL_TASK_INVALID');
  const {task,noiseInput}=config;
  if(noiseInput===undefined){
    const model=await createMaskedInpaintONNX(config,{signal});
    return Object.freeze({task,modelSHA256:model.modelSHA256,stochastic:false,
      generate:(pixels,mask,{signal}={})=>model.inpaint(pixels,{width:pixels.width,height:pixels.height,data:mask},{signal}),
      close:()=>model.close()});
  }
  const {ort,modelAssetBuffer,modelSHA256,imageInput,maskInput,imageOutput,width,height,
    inputRange,outputRange,maskMeaning,sessionOptions={executionProviders:['wasm']}}=config;
  const validRange=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&v[1]>v[0];
  const names=[imageInput,maskInput,noiseInput];
  if(!ort?.Tensor||typeof ort?.InferenceSession?.create!=='function'||!(modelAssetBuffer instanceof Uint8Array)||
    !modelAssetBuffer.length||modelAssetBuffer.length>512*1024*1024||!/^[a-f0-9]{64}$/i.test(modelSHA256||'')||
    names.some(v=>typeof v!=='string'||!v.length)||new Set(names).size!==3||typeof imageOutput!=='string'||!imageOutput||
    !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<8||height<8||width*height>1_048_576||
    !validRange(inputRange)||!validRange(outputRange)||!['hole-is-one','keep-is-one'].includes(maskMeaning))throw Error('SCENE_MODEL_CONTRACT');
  const bytes=modelAssetBuffer.slice(),lo=inputRange[0],hi=inputRange[1],outLo=outputRange[0],outHi=outputRange[1];
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);if(digest!==modelSHA256.toLowerCase())throw Error('SCENE_MODEL_SHA_MISMATCH');
  const session=await ort.InferenceSession.create(bytes,sessionOptions);
  if(session.inputNames.length!==3||names.some(n=>!session.inputNames.includes(n))||!session.outputNames.includes(imageOutput)){
    await session.release();throw Error('SCENE_MODEL_IO_MISMATCH');}
  let closed=false,busy=false;
  return Object.freeze({task,modelSHA256:digest,stochastic:true,
    async generate(pixels,mask,{seed=1,signal}={}){
      assertPixels(pixels);checkAbort(signal);
      if(closed||busy)throw Error('SCENE_MODEL_UNAVAILABLE');
      if(pixels.width*pixels.height>8_000_000||!(mask instanceof Uint8Array)||mask.length!==pixels.width*pixels.height||
        !Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('SCENE_GENERATION_INPUT');
      const source={...pixels,data:pixels.data.slice()},coverage=mask.slice();
      const scale=Math.min(width/source.width,height/source.height),rw=Math.max(1,Math.round(source.width*scale)),rh=Math.max(1,Math.round(source.height*scale));
      const left=Math.floor((width-rw)/2),top=Math.floor((height-rh)/2),n=width*height;
      const rgb=new Float32Array(n*3),holes=new Float32Array(n),noise=new Float32Array(n);let state=(seed>>>0)||0x9e3779b9;
      for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
        const sx=Math.max(0,Math.min(source.width-1,Math.floor((x-left+.5)*source.width/rw)));
        const sy=Math.max(0,Math.min(source.height-1,Math.floor((y-top+.5)*source.height/rh))),p=sy*source.width+sx,i=y*width+x;
        for(let c=0;c<3;c++)rgb[c*n+i]=lo+(source.data[p*4+3]?source.data[p*4+c]/255:0)*(hi-lo);
        const hole=x>=left&&x<left+rw&&y>=top&&y<top+rh?coverage[p]/255:0;
        holes[i]=maskMeaning==='hole-is-one'?hole:1-hole;
        state^=state<<13;state^=state>>>17;state^=state<<5;noise[i]=(state>>>0)/2147483648-1;
      }}
      // Conservatively retain small brush marks when reducing to the model grid.
      for(let y=0;y<source.height;y++){checkAbort(signal);for(let x=0;x<source.width;x++){
        const v=coverage[y*source.width+x]/255;if(!v)continue;
        const xx=left+Math.min(rw-1,Math.floor((x+.5)*rw/source.width)),yy=top+Math.min(rh-1,Math.floor((y+.5)*rh/source.height)),i=yy*width+xx;
        holes[i]=maskMeaning==='hole-is-one'?Math.max(holes[i],v):Math.min(holes[i],1-v);
      }}
      const tensors=[new ort.Tensor('float32',rgb,[1,3,height,width]),new ort.Tensor('float32',holes,[1,1,height,width]),new ort.Tensor('float32',noise,[1,1,height,width])];
      let result;busy=true;
      try{
        result=await session.run(Object.fromEntries(names.map((name,i)=>[name,tensors[i]])),[imageOutput]);checkAbort(signal);
        const image=result[imageOutput];
        if(image?.type!=='float32'||image.dims.length!==4||image.dims.some((d,i)=>d!==[1,3,height,width][i])||
          !(image.data instanceof Float32Array)||image.data.length!==3*n||image.data.some(v=>!Number.isFinite(v)))throw Error('SCENE_MODEL_OUTPUT');
        const data=new Uint8ClampedArray(rw*rh*4);
        for(let y=0;y<rh;y++){checkAbort(signal);for(let x=0;x<rw;x++){
          const i=(y+top)*width+x+left,o=(y*rw+x)*4;
          for(let c=0;c<3;c++)data[o+c]=Math.round(Math.max(0,Math.min(255,(image.data[c*n+i]-outLo)/(outHi-outLo)*255)));data[o+3]=255;
        }}
        const generated=resizeAstraFrame({width:rw,height:rh,data},source.width,source.height,{signal});
        for(let i=0;i<coverage.length;i++){
          if((i&16383)===0)checkAbort(signal);const o=i*4;if(!source.data[o+3]||!coverage[i])continue;
          for(let c=0;c<3;c++)source.data[o+c]=Math.round(source.data[o+c]*(1-coverage[i]/255)+generated.data[o+c]*coverage[i]/255);
        }
        return source;
      }finally{Object.values(result||{}).forEach(t=>t.dispose?.());tensors.forEach(t=>t.dispose?.());busy=false;}
    },async close(){if(busy)throw Error('SCENE_MODEL_BUSY');if(!closed){closed=true;await session.release();}}
  });
}
