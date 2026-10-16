import {checkAbort} from './pure.mjs';
import {alignedFaceTensor,checkedModelBytes,cosine} from './astra-face-core.mjs';

// Embeddings only compare an expressly supplied gallery. This never predicts a
// name, demographic attribute or identity from external sources. Thresholds and
// alignment/normalization come from the supplied model contract, not guesses.
export async function createFaceEmbeddingONNX({ort,modelAssetBuffer,modelSHA256,inputName,outputName,
  width,height,reference,range,channelOrder='RGB',embeddingSize,sessionOptions={executionProviders:['wasm']}}={}, {signal}={}){
  checkAbort(signal);if(typeof ort?.InferenceSession?.create!=='function'||typeof ort.Tensor!=='function'||
    !Number.isInteger(embeddingSize)||embeddingSize<16||embeddingSize>4096||
    typeof inputName!=='string'||typeof outputName!=='string')throw Error('FACE_EMBEDDING_CONTRACT');
  const model=await checkedModelBytes(modelAssetBuffer,modelSHA256);checkAbort(signal);
  const contract=structuredClone({width,height,reference,range,channelOrder});
  const session=await ort.InferenceSession.create(model.bytes,sessionOptions);
  if(session.inputNames.length!==1||session.inputNames[0]!==inputName||!session.outputNames.includes(outputName)){
    await session.release();throw Error('FACE_EMBEDDING_IO');}
  let closed=false,busy=false;
  return Object.freeze({modelSHA256:model.digest,
    async embed(pixels,face,{signal}={}){
      if(closed||busy)throw Error('FACE_EMBEDDING_UNAVAILABLE');checkAbort(signal);
      const tensor=new ort.Tensor('float32',alignedFaceTensor(pixels,face,contract,signal),[1,3,height,width]);
      let result;busy=true;try{
        result=await session.run({[inputName]:tensor},[outputName]);checkAbort(signal);
        const t=result[outputName];if(t?.type!=='float32'||!(t.data instanceof Float32Array)||
          t.data.length!==embeddingSize||t.dims.length!==2||t.dims[0]!==1||t.dims[1]!==embeddingSize)
          throw Error('FACE_EMBEDDING_OUTPUT');
        const vector=new Float32Array(t.data);let norm=0;
        for(const v of vector){if(!Number.isFinite(v))throw Error('FACE_EMBEDDING_OUTPUT');norm+=v*v;}
        if(norm<1e-12)throw Error('FACE_EMBEDDING_ZERO');norm=Math.sqrt(norm);
        for(let i=0;i<vector.length;i++)vector[i]/=norm;return vector;
      }finally{tensor.dispose?.();for(const t of Object.values(result??{}))t.dispose?.();busy=false;}
    },async close(){if(busy)throw Error('FACE_EMBEDDING_BUSY');if(!closed){closed=true;await session.release();}}
  });
}
export function matchFaceGallery(embedding,gallery,{threshold,margin,modelSHA256}){
  if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(margin)||margin<0||margin>1||
    !Array.isArray(gallery)||gallery.length<1||gallery.length>10000)throw Error('FACE_GALLERY_CONTRACT');
  const scores=new Map();
  for(const entry of gallery){
    if(typeof entry?.personID!=='string'||!entry.personID||entry.modelSHA256!==modelSHA256)
      throw Error('FACE_GALLERY_MODEL_OR_PERSON');
    const score=cosine(embedding,entry.embedding);scores.set(entry.personID,Math.max(scores.get(entry.personID)??-1,score));
  }
  const ranked=[...scores].map(([personID,score])=>({personID,score})).sort((a,b)=>b.score-a.score||a.personID.localeCompare(b.personID));
  const best=ranked[0],gap=best.score-(ranked[1]?.score??-1);
  return best.score>=threshold&&gap>=margin?{status:'matched',...best,gap}:{status:'unknown',bestScore:best.score,gap};
}
export function createFaceRecognition({embedder,authorize,threshold,margin}={}){
  if(typeof embedder?.embed!=='function'||typeof authorize!=='function'||!Number.isFinite(threshold)||threshold<0||threshold>1||
    !Number.isFinite(margin)||margin<0||margin>1)throw Error('FACE_RECOGNITION_DEPENDENCIES');
  const gallery=[];
  return Object.freeze({
    async enroll(pixels,face,{personID,binding},{signal}={}){
      if(typeof personID!=='string'||!personID||gallery.length>=10000)throw Error('FACE_GALLERY_PERSON');
      const request={operation:'enroll-explicit-gallery',personID,binding};
      if(await authorize(request,{signal})!==true)throw Error('FACE_RECOGNITION_NOT_AUTHORIZED');
      const embedding=await embedder.embed(pixels,face,{signal});checkAbort(signal);
      if(await authorize(request,{signal})!==true)throw Error('FACE_RECOGNITION_NOT_AUTHORIZED');
      gallery.push({personID,embedding:new Float32Array(embedding),modelSHA256:embedder.modelSHA256});return {personID};
    },
    async recognize(pixels,face,binding,{signal}={}){
      if(await authorize({operation:'compare-explicit-gallery',binding},{signal})!==true)throw Error('FACE_RECOGNITION_NOT_AUTHORIZED');
      const vector=await embedder.embed(pixels,face,{signal});checkAbort(signal);
      const result=matchFaceGallery(vector,gallery,{threshold,margin,modelSHA256:embedder.modelSHA256});
      if(await authorize({operation:'release-gallery-match',binding,personID:result.personID??null},{signal})!==true)
        throw Error('FACE_RECOGNITION_NOT_AUTHORIZED');return result;
    },
    remove(personID){for(let i=gallery.length-1;i>=0;i--)if(gallery[i].personID===personID){gallery[i].embedding.fill(0);gallery.splice(i,1);}},
    clear(){for(const entry of gallery)entry.embedding.fill(0);gallery.length=0;}
  });
}
