import {assertPixels, checkAbort} from './pure.mjs';

/** CLIP-style byte BPE, with explicit vocabulary/merges and normalization.
 * Only this tokenizer family is supported; SentencePiece/WordPiece vocabularies
 * are not interchangeable. Model/tokenizer assets must be supplied together.
 */
export function createCullingBPETokenizer({vocabulary, merges, bosID, eosID, padID,
  contextLength, normalization, endOfWord = '</w>', truncate = false} = {}) {
  if (!vocabulary || ![Object.prototype,null].includes(Object.getPrototypeOf(vocabulary)) ||
      !Array.isArray(merges) || merges.length > 200000 || !Number.isSafeInteger(contextLength) ||
      contextLength < 4 || contextLength > 512 || !['lowercase-nfkc','none'].includes(normalization) ||
      typeof endOfWord !== 'string' || !endOfWord.length || typeof truncate !== 'boolean')
    throw Error('CULLING_TOKENIZER_CONTRACT_INVALID');
  const entries = Object.entries(vocabulary);
  if (!entries.length || entries.length > 500000 || entries.some(([token,id]) => !token || !Number.isSafeInteger(id) || id < 0 || id > 2147483647))
    throw Error('CULLING_VOCABULARY_INVALID');
  const ids = new Set(entries.map(([,id]) => id));
  if (ids.size !== entries.length || ![bosID,eosID,padID].every(id => Number.isSafeInteger(id) && ids.has(id)))
    throw Error('CULLING_SPECIAL_TOKEN_INVALID');
  const vocab = new Map(entries), ranks = new Map();
  for (const pair of merges) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(token => typeof token !== 'string' || !token.length))
      throw Error('CULLING_BPE_MERGE_INVALID');
    const key = JSON.stringify(pair);
    if (ranks.has(key)) throw Error('CULLING_BPE_DUPLICATE_MERGE');
    ranks.set(key,ranks.size);
  }
  // Standard reversible GPT/CLIP byte-to-Unicode alphabet.
  const bytes = [...Array.from({length:94},(_,i)=>i+33),...Array.from({length:12},(_,i)=>i+161),
    ...Array.from({length:82},(_,i)=>i+174)];
  const chars = [...bytes]; let extra = 0;
  for (let i=0;i<256;i++) if (!bytes.includes(i)) {bytes.push(i);chars.push(256+extra++);}
  const encoder = new Map(bytes.map((byte,i)=>[byte,String.fromCodePoint(chars[i])]));
  const utf8 = new TextEncoder();
  return Object.freeze({encode(text) {
    if (typeof text !== 'string' || text.length > 100000) throw Error('CULLING_TEXT_INVALID');
    const cleaned = (normalization === 'lowercase-nfkc' ? text.normalize('NFKC').toLowerCase() : text).replace(/\s+/gu,' ').trim();
    const words = cleaned.match(/'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu) ?? [];
    const output = [bosID];
    for (const word of words) {
      let symbols = [...utf8.encode(word)].map(byte=>encoder.get(byte));
      if (symbols.length > 4096) throw Error('CULLING_TOKEN_TOO_LONG');
      if (!symbols.length) continue;
      symbols[symbols.length-1] += endOfWord;
      while (symbols.length > 1) {
        let best = Infinity, left, right;
        for (let i=0;i<symbols.length-1;i++) {
          const rank = ranks.get(JSON.stringify([symbols[i],symbols[i+1]]));
          if (rank !== undefined && rank < best) {best=rank;left=symbols[i];right=symbols[i+1];}
        }
        if (!Number.isFinite(best)) break;
        const next=[];
        for(let i=0;i<symbols.length;i++) {
          if(symbols[i]===left && symbols[i+1]===right){next.push(left+right);i++;}
          else next.push(symbols[i]);
        }
        symbols=next;
      }
      for (const symbol of symbols) {
        const id=vocab.get(symbol);if(id===undefined)throw Error('CULLING_BPE_TOKEN_MISSING');output.push(id);
      }
    }
    if(output.length+1>contextLength && !truncate)throw Error('CULLING_TEXT_CONTEXT_EXCEEDED');
    output.length=Math.min(output.length,contextLength-1);output.push(eosID);
    const mask=Array(contextLength).fill(0);for(let i=0;i<output.length;i++)mask[i]=1;
    while(output.length<contextLength)output.push(padID);
    return {ids:output,attentionMask:mask};
  }});
}

async function pinnedBytes(config,signal) {
  const bytes=config?.modelAssetBuffer;
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>768*1024*1024||
      !/^[0-9a-f]{64}$/i.test(config.modelSHA256??''))throw Error('CULLING_EMBED_MODEL_INVALID');
  const copy=new Uint8Array(bytes), hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy)),
    v=>v.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);if(hash!==config.modelSHA256.toLowerCase())throw Error('CULLING_EMBED_MODEL_DIGEST');return copy;
}
function imageTensor(frame,config,signal) {
  assertPixels(frame);
  if(frame.width*frame.height>8_000_000||!(frame.data.buffer instanceof ArrayBuffer))throw Error('CULLING_EMBED_FRAME_INVALID');
  const {width,height,mean,std,resize}=config,n=width*height,out=new Float32Array(n*3);
  let cropWidth=frame.width,cropHeight=frame.height;
  if(resize==='center-crop') {
    if(frame.width/frame.height>width/height)cropWidth=frame.height*width/height;
    else cropHeight=frame.width*height/width;
  }
  const left=(frame.width-cropWidth)/2,top=(frame.height-cropHeight)/2;
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const sx=Math.max(0,Math.min(frame.width-1,left+(x+.5)*cropWidth/width-.5));
    const sy=Math.max(0,Math.min(frame.height-1,top+(y+.5)*cropHeight/height-.5));
    const a=Math.floor(sx),b=Math.floor(sy),u=sx-a,v=sy-b;
    const taps=[[a,b,(1-u)*(1-v)],[Math.min(a+1,frame.width-1),b,u*(1-v)],
      [a,Math.min(b+1,frame.height-1),(1-u)*v],[Math.min(a+1,frame.width-1),Math.min(b+1,frame.height-1),u*v]];
    for(let c=0;c<3;c++){
      let value=0;for(const [xx,yy,w] of taps){const p=(yy*frame.width+xx)*4;
        value+=frame.data[p+c]/255*(frame.data[p+3]/255)*w;}
      out[c*n+y*width+x]=(value-mean[c])/std[c];
    }
  }}return out;
}
function normalized(tensor,size) {
  if(tensor?.type!=='float32'||!(tensor.data instanceof Float32Array)||tensor.data.length!==size||
      tensor.dims.length!==2||tensor.dims[0]!==1||tensor.dims[1]!==size)
    throw Error('CULLING_EMBED_RESULT_INVALID');
  const out=new Float32Array(tensor.data);let norm=0;
  for(const value of out){if(!Number.isFinite(value))throw Error('CULLING_EMBED_RESULT_NONFINITE');norm+=value*value;}
  if(norm<1e-12)throw Error('CULLING_EMBED_ZERO');norm=Math.sqrt(norm);
  for(let i=0;i<out.length;i++)out[i]/=norm;return out;
}

/** Real dual-encoder ONNX inference. Model pair, byte-BPE assets and exact IO,
 * normalization must match one shared embedding space. No model is bundled.
 * Other CLIP tokenizer/preprocessing families are explicitly unsupported.
 */
export async function createCullingSemanticEncoder({ort,imageModel,textModel,tokenizer,
  embeddingSize,sessionOptions={executionProviders:['wasm']}}={}, {signal}={}) {
  if(typeof ort?.InferenceSession?.create!=='function'||typeof ort?.Tensor!=='function'||
      !Number.isSafeInteger(embeddingSize)||embeddingSize<16||embeddingSize>4096)
    throw Error('CULLING_EMBED_CONTRACT_INVALID');
  const image=structuredClone({...imageModel,modelAssetBuffer:undefined});
  const text=structuredClone({...textModel,modelAssetBuffer:undefined});
  for(const config of [image,text])if(typeof config.inputName!=='string'||!config.inputName||
      typeof config.outputName!=='string'||!config.outputName)throw Error('CULLING_EMBED_IO_INVALID');
  if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<8||image.height<8||
      image.width*image.height>1_048_576||!['center-crop','stretch'].includes(image.resize)||
      !Array.isArray(image.mean)||!Array.isArray(image.std)||image.mean.length!==3||image.std.length!==3||
      image.mean.some(v=>!Number.isFinite(v))||image.std.some(v=>!Number.isFinite(v)||v<=0)||
      !['int64','int32'].includes(text.tokenType)||
      (text.attentionInput!==undefined&&(typeof text.attentionInput!=='string'||!text.attentionInput||text.attentionInput===text.inputName)))
    throw Error('CULLING_EMBED_PREPROCESS_INVALID');
  const bpe=createCullingBPETokenizer(tokenizer);
  const imageBytes=await pinnedBytes(imageModel,signal),textBytes=await pinnedBytes(textModel,signal);
  const imageSession=await ort.InferenceSession.create(imageBytes,sessionOptions);let textSession;
  try {
    textSession=await ort.InferenceSession.create(textBytes,sessionOptions);checkAbort(signal);
    const textNames=[text.inputName,...(text.attentionInput?[text.attentionInput]:[])];
    if(imageSession.inputNames.length!==1||imageSession.inputNames[0]!==image.inputName||
        !imageSession.outputNames.includes(image.outputName)||textSession.inputNames.length!==textNames.length||
        textNames.some(name=>!textSession.inputNames.includes(name))||!textSession.outputNames.includes(text.outputName))
      throw Error('CULLING_EMBED_MODEL_IO_MISMATCH');
  }catch(error){await imageSession.release();await textSession?.release();throw error;}
  const space=image.modelSHA256.toLowerCase()+':'+text.modelSHA256.toLowerCase();
  let closed=false,busy=false;
  async function run(session,feeds,outputName,signal) {
    if(closed||busy){for(const t of Object.values(feeds))t.dispose?.();throw Error('CULLING_EMBED_UNAVAILABLE');}
    busy=true;let results;
    try{checkAbort(signal);results=await session.run(feeds,[outputName]);checkAbort(signal);
      return {space,vector:normalized(results[outputName],embeddingSize)};
    }finally{for(const t of Object.values(feeds))t.dispose?.();for(const t of Object.values(results??{}))t.dispose?.();busy=false;}
  }
  return Object.freeze({space,
    embedImage(frame,{signal}={}) {
      const data=imageTensor(frame,image,signal),tensor=new ort.Tensor('float32',data,[1,3,image.height,image.width]);
      return run(imageSession,{[image.inputName]:tensor},image.outputName,signal);
    },
    embedText(query,{signal}={}) {
      checkAbort(signal);const encoded=bpe.encode(query),feed={};
      const make=values=>new ort.Tensor(text.tokenType,text.tokenType==='int64'?BigInt64Array.from(values,BigInt):Int32Array.from(values),[1,values.length]);
      feed[text.inputName]=make(encoded.ids);if(text.attentionInput)feed[text.attentionInput]=make(encoded.attentionMask);
      return run(textSession,feed,text.outputName,signal);
    },
    async close(){if(busy)throw Error('CULLING_EMBED_BUSY');if(!closed){closed=true;await imageSession.release();await textSession.release();}}
  });
}

export function rankCullingEmbeddings(query,images,{limit=50,minimumScore=-1}={}) {
  if(!Array.isArray(images)||images.length>100000||!Number.isSafeInteger(limit)||limit<0||limit>100000||
      !Number.isFinite(minimumScore)||minimumScore< -1||minimumScore>1||
      typeof query?.space!=='string'||!(query.vector instanceof Float32Array))throw Error('CULLING_SEMANTIC_QUERY_INVALID');
  const norm=v=>{let sum=0;for(const n of v){if(!Number.isFinite(n))throw Error('CULLING_SEMANTIC_VECTOR_INVALID');sum+=n*n;}
    if(sum<1e-12)throw Error('CULLING_SEMANTIC_ZERO');return Math.sqrt(sum);};
  const queryNorm=norm(query.vector);
  return images.map(image=>{
    if(typeof image.id!=='string'||image.space!==query.space||!(image.vector instanceof Float32Array)||image.vector.length!==query.vector.length)
      throw Error('CULLING_SEMANTIC_SPACE_MISMATCH');
    let score=0;for(let i=0;i<query.vector.length;i++)score+=query.vector[i]*image.vector[i];
    return {id:image.id,score:score/queryNorm/norm(image.vector)};
  }).filter(x=>x.score>=minimumScore).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}

export async function searchCullingByText(encoder,query,images,{signal,...options}={}) {
  const embedding=await encoder.embedText(query,{signal});checkAbort(signal);
  return rankCullingEmbeddings(embedding,images,options);
}
