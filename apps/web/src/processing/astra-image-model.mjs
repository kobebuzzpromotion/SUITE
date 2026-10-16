import {assertPixels,checkAbort} from './pure.mjs';

// Actual inference for a documented, single-pass NCHW image-to-image ONNX graph.
// Diffusion graphs requiring tokenizer/VAE/scheduler are NOT this contract.
// Host supplies licensed task-trained weights and ORT; neither is bundled here.
const TASKS=['outpaint','grass-fill','liquify-repair','motion-ghost-flow',
  'detail-enhance','old-photo-restore','photo-colorize','clothing-moire-removal','golden-blonde-hair'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  v=>v.toString(16).padStart(2,'0')).join('');
const range=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&v[1]>v[0];
export function astraFrame(pixels,maxPixels=8_000_000){
  assertPixels(pixels);
  if(pixels.width*pixels.height>maxPixels||
    Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')throw Error('ASTRA_FRAME_CAPACITY');
  return {...pixels,data:pixels.data.slice()};
}
export function astraMask(mask,pixels){
  if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||mask.length!==pixels.width*pixels.height)
    throw Error('ASTRA_MASK_INVALID');
  return new Uint8Array(mask);
}
export function resizeAstraFrame(pixels,width,height,{signal}={}){
  assertPixels(pixels);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>40_000_000)
    throw Error('ASTRA_OUTPUT_CAPACITY');
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const sx=clamp((x+.5)*pixels.width/width-.5,0,pixels.width-1);
    const sy=clamp((y+.5)*pixels.height/height-.5,0,pixels.height-1);
    const a=Math.floor(sx),b=Math.floor(sy),u=sx-a,v=sy-b;
    const taps=[[a,b,(1-u)*(1-v)],[Math.min(a+1,pixels.width-1),b,u*(1-v)],
      [a,Math.min(b+1,pixels.height-1),(1-u)*v],
      [Math.min(a+1,pixels.width-1),Math.min(b+1,pixels.height-1),u*v]];
    const at=(y*width+x)*4;let alpha=0;const rgb=[0,0,0];
    for(const [xx,yy,w] of taps){const o=(yy*pixels.width+xx)*4,k=w*pixels.data[o+3];
      alpha+=k;for(let c=0;c<3;c++)rgb[c]+=pixels.data[o+c]*k;}
    data[at+3]=Math.round(alpha);
    if(alpha)for(let c=0;c<3;c++)data[at+c]=Math.round(rgb[c]/alpha);
  }}
  return {width,height,data};
}

/** config: task, model bytes/SHA; imageInput/imageOutput; optional maskInput
 * (hole-is-one or keep-is-one), noiseInput (NCHW 1 channel uniform [-1,1]),
 * controlsInput with an ordered list of {name,min,max,default}; width/height,
 * outputScale integer 1..4, inputRange/outputRange. IO values must come from
 * that model's documented contract, never inferred from a filename. */
export async function createAstraImageModel(config,{signal}={}){
  checkAbort(signal);
  const {ort,modelAssetBuffer,modelSHA256,task,imageInput,imageOutput,maskInput,noiseInput,
    controlsInput,width,height,outputScale=1,inputRange,outputRange,maskMeaning,
    controlFields=[],sessionOptions={executionProviders:['wasm']}}=config||{};
  if(!TASKS.includes(task)||typeof ort?.InferenceSession?.create!=='function'||typeof ort?.Tensor!=='function'||
    !(modelAssetBuffer instanceof Uint8Array)||!modelAssetBuffer.length||modelAssetBuffer.length>768*1024*1024||
    !/^[a-f0-9]{64}$/i.test(modelSHA256||'')||!range(inputRange)||!range(outputRange)||
    !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<16||height<16||width*height>1_048_576||
    !Number.isInteger(outputScale)||outputScale<1||outputScale>4||
    ![imageInput,imageOutput].every(v=>typeof v==='string'&&v.length>0))throw Error('ASTRA_MODEL_CONTRACT_INVALID');
  const names=[imageInput,...[maskInput,noiseInput,controlsInput].filter(v=>v!==undefined)];
  if(names.some(v=>typeof v!=='string'||!v.length)||new Set(names).size!==names.length||
    (maskInput&&!['hole-is-one','keep-is-one'].includes(maskMeaning))||
    !Array.isArray(controlFields)||controlFields.length>32||Boolean(controlsInput)!==Boolean(controlFields.length)||
    controlFields.some(f=>!f||typeof f.name!=='string'||!f.name.length||
      ![f.min,f.max,f.default].every(Number.isFinite)||f.max<=f.min||f.default<f.min||f.default>f.max)||
    new Set(controlFields.map(f=>f.name)).size!==controlFields.length)throw Error('ASTRA_MODEL_INPUT_INVALID');
  const fields=controlFields.map(f=>({...f})),inRange=[...inputRange],outRange=[...outputRange];
  const bytes=modelAssetBuffer.slice(),digest=await sha(bytes);checkAbort(signal);
  if(digest!==modelSHA256.toLowerCase())throw Error('ASTRA_MODEL_DIGEST_MISMATCH');
  const session=await ort.InferenceSession.create(bytes,sessionOptions);
  if(session.inputNames.length!==names.length||names.some(n=>!session.inputNames.includes(n))||
      !session.outputNames.includes(imageOutput)){await session.release();throw Error('ASTRA_MODEL_IO_MISMATCH');}
  let closed=false,busy=false;
  async function inference(source,mask,seed,controls,signal){
    const n=width*height,scale=Math.min(width/source.width,height/source.height);
    const rw=Math.max(1,Math.round(source.width*scale)),rh=Math.max(1,Math.round(source.height*scale));
    const left=Math.floor((width-rw)/2),top=Math.floor((height-rh)/2);
    const rgb=new Float32Array(n*3),hole=maskInput?new Float32Array(n):null;
    const noise=noiseInput?new Float32Array(n):null;let state=(seed>>>0)||0x9e3779b9;
    for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
      const sx=clamp(Math.floor((x-left+.5)*source.width/rw),0,source.width-1);
      const sy=clamp(Math.floor((y-top+.5)*source.height/rh),0,source.height-1);
      const from=sy*source.width+sx,i=y*width+x;
      for(let c=0;c<3;c++)rgb[c*n+i]=inRange[0]+(source.data[from*4+3]?source.data[from*4+c]/255:0)*(inRange[1]-inRange[0]);
      if(hole){const v=x>=left&&x<left+rw&&y>=top&&y<top+rh?mask[from]/255:0;
        hole[i]=maskMeaning==='hole-is-one'?v:1-v;}
      if(noise){state^=state<<13;state^=state>>>17;state^=state<<5;noise[i]=(state>>>0)/2147483648-1;}
    }}
    // Conservative coverage when the original mask contains sub-grid defects.
    if(hole&&(rw<source.width||rh<source.height))for(let y=0;y<source.height;y++){
      checkAbort(signal);for(let x=0;x<source.width;x++){
        const v=mask[y*source.width+x]/255;if(!v)continue;
        const xx=left+Math.min(rw-1,Math.floor((x+.5)*rw/source.width));
        const yy=top+Math.min(rh-1,Math.floor((y+.5)*rh/source.height)),i=yy*width+xx;
        hole[i]=maskMeaning==='hole-is-one'?Math.max(hole[i],v):Math.min(hole[i],1-v);
      }}
    const feed={},tensors=[];let result;
    const tensor=(name,data,dims)=>{const t=new ort.Tensor('float32',data,dims);tensors.push(t);feed[name]=t;};
    try{
      tensor(imageInput,rgb,[1,3,height,width]);
      if(hole)tensor(maskInput,hole,[1,1,height,width]);
      if(noise)tensor(noiseInput,noise,[1,1,height,width]);
      if(controlsInput)tensor(controlsInput,new Float32Array(fields.map(f=>controls[f.name]??f.default)),[1,fields.length]);
      checkAbort(signal);result=await session.run(feed,[imageOutput]);checkAbort(signal);
      const out=result[imageOutput],ow=width*outputScale,oh=height*outputScale,on=ow*oh;
      if(out?.type!=='float32'||!Array.isArray(out.dims)||out.dims.length!==4||
        out.dims.some((v,i)=>v!==[1,3,oh,ow][i])||!(out.data instanceof Float32Array)||
        out.data.length!==3*on||out.data.some(v=>!Number.isFinite(v)))throw Error('ASTRA_MODEL_OUTPUT_INVALID');
      const cw=rw*outputScale,ch=rh*outputScale,data=new Uint8ClampedArray(cw*ch*4);
      for(let y=0;y<ch;y++){checkAbort(signal);for(let x=0;x<cw;x++){
        const i=(top*outputScale+y)*ow+left*outputScale+x,o=(y*cw+x)*4;
        for(let c=0;c<3;c++)data[o+c]=Math.round(clamp((out.data[c*on+i]-outRange[0])/(outRange[1]-outRange[0])*255,0,255));
        data[o+3]=255;
      }}
      return {width:cw,height:ch,data};
    }finally{for(const t of Object.values(result||{}))t.dispose?.();for(const t of tensors)t.dispose?.();}
  }
  return Object.freeze({task,modelSHA256:digest,outputScale,stochastic:Boolean(noiseInput),masked:Boolean(maskInput),
    async run(pixels,{mask,seed=1,controls={},tiled=false,signal}={}){
      checkAbort(signal);if(closed||busy)throw Error(closed?'ASTRA_MODEL_CLOSED':'ASTRA_MODEL_BUSY');
      const source=astraFrame(pixels),holes=maskInput?astraMask(mask,source):null;
      if(!maskInput&&mask!==undefined)throw Error('ASTRA_MODEL_UNEXPECTED_MASK');
      if(!Number.isInteger(seed)||seed<0||seed>4294967295||typeof controls!=='object'||!controls||
        typeof tiled!=='boolean'||
        Array.isArray(controls)||Object.keys(controls).some(k=>!fields.some(f=>f.name===k))||
        fields.some(f=>Object.hasOwn(controls,f.name)&&(!Number.isFinite(controls[f.name])||controls[f.name]<f.min||controls[f.name]>f.max)))
        throw Error('ASTRA_MODEL_CONTROLS_INVALID');
      const params={...controls};busy=true;
      try{
        if(!tiled)return await inference(source,holes,seed,params,signal);
        const ow=source.width*outputScale,oh=source.height*outputScale;
        if(ow*oh>40_000_000)throw Error('ASTRA_OUTPUT_CAPACITY');
        const output=new Uint8ClampedArray(ow*oh*4),halo=Math.min(32,Math.floor(Math.min(width,height)/8));
        const coreW=width-2*halo,coreH=height-2*halo;
        for(let cy=0;cy<source.height;cy+=coreH)for(let cx=0;cx<source.width;cx+=coreW){
          checkAbort(signal);const data=new Uint8ClampedArray(width*height*4),tileMask=holes?new Uint8Array(width*height):undefined;
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const sx=clamp(cx+x-halo,0,source.width-1),sy=clamp(cy+y-halo,0,source.height-1),p=sy*source.width+sx,i=y*width+x;
            data.set(source.data.subarray(p*4,p*4+4),i*4);if(tileMask)tileMask[i]=holes[p];
          }
          const tile=await inference({width,height,data},tileMask,(seed^cx^Math.imul(cy,65537))>>>0,params,signal);
          const cw=Math.min(coreW,source.width-cx)*outputScale,ch=Math.min(coreH,source.height-cy)*outputScale;
          for(let y=0;y<ch;y++){
            const from=((halo*outputScale+y)*tile.width+halo*outputScale)*4;
            output.set(tile.data.subarray(from,from+cw*4),((cy*outputScale+y)*ow+cx*outputScale)*4);
          }
        }
        return {width:ow,height:oh,data:output};
      }finally{busy=false;}
    },
    async close(){if(busy)throw Error('ASTRA_MODEL_BUSY');if(!closed){closed=true;await session.release();}}
  });
}
