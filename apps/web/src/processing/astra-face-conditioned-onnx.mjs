import {checkAbort} from './pure.mjs';
import {checkedFaceFrame,checkedModelBytes,copyFaceFrame,sampleRGB,cosine} from './astra-face-core.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {polygonCenter} from './face-feature-geometry.mjs';

// Real inference for a documented, host-supplied face-edit model with image and
// condition tensors. It does not turn a generic inpainting network into a pose
// or expression model. A capability contract and digest-pinned weights must be
// supplied together. No network endpoint, weights or runtime is silently added.
export async function createConditionedFaceONNX({ort,modelAssetBuffer,modelSHA256,
  feature,imageInput,conditionInput,imageOutput,width,height,inputRange,outputRange,
  conditionFields,sessionOptions={executionProviders:['wasm']}}={}, {signal}={}){
  const range=r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[0]<r[1];
  if(typeof ort?.InferenceSession?.create!=='function'||typeof ort?.Tensor!=='function'||
    !['expression','head-pose'].includes(feature)||![imageInput,conditionInput,imageOutput].every(x=>typeof x==='string'&&x)||
    imageInput===conditionInput||!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width*height>1_048_576||
    !range(inputRange)||!range(outputRange)||!Array.isArray(conditionFields)||!conditionFields.length||conditionFields.length>64||
    conditionFields.some(f=>typeof f?.name!=='string'||!f.name||!Number.isFinite(f.min)||!Number.isFinite(f.max)||f.min>=f.max)||
    new Set(conditionFields.map(f=>f.name)).size!==conditionFields.length)throw Error('FACE_CONDITIONED_MODEL_CONTRACT');
  const fields=structuredClone(conditionFields),inRange=[...inputRange],outRange=[...outputRange];
  const model=await checkedModelBytes(modelAssetBuffer,modelSHA256);checkAbort(signal);
  const session=await ort.InferenceSession.create(model.bytes,sessionOptions);
  if(session.inputNames.length!==2||!session.inputNames.includes(imageInput)||!session.inputNames.includes(conditionInput)||
    !session.outputNames.includes(imageOutput)){await session.release();throw Error('FACE_CONDITIONED_MODEL_IO');}
  let busy=false,closed=false;
  return Object.freeze({feature,modelSHA256:model.digest,conditionNames:Object.freeze(fields.map(f=>f.name)),
    async generate(pixels,mask,conditions,{signal}={}){
      checkedFaceFrame(pixels);checkAbort(signal);
      if(busy||closed)throw Error('FACE_CONDITIONED_MODEL_UNAVAILABLE');
      if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||mask.length!==pixels.width*pixels.height||
        !conditions||Object.keys(conditions).length!==fields.length)throw Error('FACE_CONDITIONED_INPUT');
      const values=fields.map(f=>{const v=conditions[f.name];if(!Number.isFinite(v)||v<f.min||v>f.max)
        throw Error('FACE_CONDITIONED_VALUE');return v;});
      const source=copyFaceFrame(pixels),coverage=new Uint8Array(mask),output=copyFaceFrame(source);
      let x0=source.width,y0=source.height,x1=-1,y1=-1;
      for(let i=0;i<coverage.length;i++)if(coverage[i]&&source.data[i*4+3]){
        const x=i%source.width,y=Math.floor(i/source.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
      if(x1<x0)throw Error('FACE_CONDITIONED_EMPTY_MASK');
      const pad=Math.ceil(Math.max(x1-x0+1,y1-y0+1)*.15);
      x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(source.width-1,x1+pad);y1=Math.min(source.height-1,y1+pad);
      const cropW=x1-x0+1,cropH=y1-y0+1,scale=Math.min(width/cropW,height/cropH);
      const rw=Math.max(1,Math.round(cropW*scale)),rh=Math.max(1,Math.round(cropH*scale));
      const left=Math.floor((width-rw)/2),top=Math.floor((height-rh)/2),n=width*height;
      const tensorData=new Float32Array(n*3);
      for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
        const sx=Math.max(x0,Math.min(x1,x0+(x-left+.5)*cropW/rw-.5));
        const sy=Math.max(y0,Math.min(y1,y0+(y-top+.5)*cropH/rh-.5));
        const rgb=sampleRGB(source,sx,sy)??[0,0,0];
        for(let c=0;c<3;c++)tensorData[c*n+y*width+x]=inRange[0]+rgb[c]/255*(inRange[1]-inRange[0]);
      }}
      const image=new ort.Tensor('float32',tensorData,[1,3,height,width]);
      const condition=new ort.Tensor('float32',Float32Array.from(values),[1,values.length]);
      let result;busy=true;try{
        result=await session.run({[imageInput]:image,[conditionInput]:condition},[imageOutput]);checkAbort(signal);
        const t=result[imageOutput];
        if(t?.type!=='float32'||!(t.data instanceof Float32Array)||t.data.length!==n*3||
          t.dims.length!==4||t.dims.some((v,i)=>v!==[1,3,height,width][i])||t.data.some(v=>!Number.isFinite(v)))
          throw Error('FACE_CONDITIONED_OUTPUT');
        for(let y=y0;y<=y1;y++){checkAbort(signal);for(let x=x0;x<=x1;x++){
          const i=y*source.width+x,a=coverage[i]/255;if(!a||!source.data[i*4+3])continue;
          const xx=Math.max(left,Math.min(left+rw-1,left+(x-x0+.5)*rw/cropW-.5));
          const yy=Math.max(top,Math.min(top+rh-1,top+(y-y0+.5)*rh/cropH-.5));
          const ax=Math.floor(xx),ay=Math.floor(yy),bx=Math.min(width-1,ax+1),by=Math.min(height-1,ay+1),u=xx-ax,v=yy-ay;
          for(let c=0;c<3;c++){
            const o=c*n,z=(t.data[o+ay*width+ax]*(1-u)+t.data[o+ay*width+bx]*u)*(1-v)+
              (t.data[o+by*width+ax]*(1-u)+t.data[o+by*width+bx]*u)*v;
            const code=Math.max(0,Math.min(255,(z-outRange[0])/(outRange[1]-outRange[0])*255));
            output.data[i*4+c]=Math.round(source.data[i*4+c]*(1-a)+code*a);
          }
        }}return output;
      }finally{image.dispose?.();condition.dispose?.();for(const t of Object.values(result??{}))t.dispose?.();busy=false;}
    },async close(){if(busy)throw Error('FACE_CONDITIONED_MODEL_BUSY');if(!closed){closed=true;await session.release();}}
  });
}

export async function enforceFaceIdentity(before,after,face,embedder,threshold,{signal}={}){
  if(typeof embedder?.embed!=='function'||!Number.isFinite(threshold)||threshold<0||threshold>1)
    throw Error('FACE_IDENTITY_MODEL_REQUIRED');
  const inventory=await detectFaceFeatures(after,{signal}),center=polygonCenter(face.oval);
  const candidates=inventory.faces.map(f=>({face:f,d:Math.hypot(polygonCenter(f.oval).x-center.x,polygonCenter(f.oval).y-center.y)}))
    .sort((a,b)=>a.d-b.d);
  if(!candidates.length||candidates[0].d>.15||candidates[1]&&candidates[1].d-candidates[0].d<.02)
    throw Error('FACE_IDENTITY_TARGET_AMBIGUOUS');
  const a=await embedder.embed(before,face,{signal}),b=await embedder.embed(after,candidates[0].face,{signal});
  const score=cosine(a,b);if(score<threshold)throw Error('FACE_IDENTITY_CHANGE_REJECTED');
  return {score,modelSHA256:embedder.modelSHA256,threshold};
}
