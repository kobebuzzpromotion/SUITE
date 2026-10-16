import {importDecodedLookCorpus} from './processing/astra-look-corpus.mjs';
import {trainPersonalizedLook,createPersonalLookAccumulator} from './processing/astra-look-learning.mjs';
import {validatePersonalLook,PERSONAL_LOOK_ENGINE} from './local-personal-look-contract.mjs';
import {assertPixels} from './processing/pure.mjs';
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
const legacy=async({data},token)=>{
  try{
    const input=data?.pairs;
    if(!Array.isArray(input)||input.length<1||input.length>4)throw Error('LOOK_PAIR_COUNT');
    let total=0;const ids=new Set();
    for(const pair of input){
      if(!pair||typeof pair.id!=='string'||!pair.id||ids.has(pair.id))throw Error('LOOK_PAIR_ID');ids.add(pair.id);
      assertPixels(pair.before);assertPixels(pair.after);
      if(pair.before.width!==pair.after.width||pair.before.height!==pair.after.height||
        !(pair.before.data.buffer instanceof ArrayBuffer)||!(pair.after.data.buffer instanceof ArrayBuffer))throw Error('LOOK_PAIR_ALIGNMENT_REQUIRED');
      total+=pair.before.width*pair.before.height;if(total>8_000_000)throw Error('LOOK_CORPUS_PIXEL_LIMIT');
    }
    const manifest=[],decoded=[];
    for(const [index,pair] of input.entries()){
      const beforeID=`before-${index}`,afterID=`after-${index}`;
      manifest.push({id:pair.id,format:'nonraw',beforeID,afterID,
        beforePixelsSHA256:await digest(pair.before.data),afterPixelsSHA256:await digest(pair.after.data)});
      decoded.push({id:beforeID,pixels:pair.before},{id:afterID,pixels:pair.after});
    }
    const pairs=await importDecodedLookCorpus(manifest,decoded);
    const artifact=trainPersonalizedLook(pairs,{mode:'lite',formats:['nonraw']});
    const document=validatePersonalLook({schemaVersion:1,engineVersion:PERSONAL_LOOK_ENGINE,
      coefficients:artifact.models.nonraw.coefficients,strength:1,format:'nonraw'});
    if(token===generation)self.postMessage({document});
  }catch(error){if(token===generation)self.postMessage({error:error?.message||'LOOK_TRAINING_FAILED'});}
};
let accumulator=null,selectedFormat=null,legacyBusy=false,generation=0;
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('LOOK_WORKER_PROTOCOL');}
self.onmessage=async event=>{
  const data=event.data;
  try{
    if(data?.type===undefined){
      if(accumulator||legacyBusy)throw Error('LOOK_WORKER_ORDER');
      legacyBusy=true;const token=++generation;
      try{await legacy(event,token);}finally{legacyBusy=false;}
      return;
    }
    if(legacyBusy)throw Error('LOOK_WORKER_ORDER');
    if(data.type==='start'){
      exact(data,['type','count',...(Object.hasOwn(data,'format')?['format']:[])]);if(accumulator)throw Error('LOOK_WORKER_ORDER');
      const format=Object.hasOwn(data,'format')?data.format:'nonraw';
      if(!['raw','nonraw'].includes(format))throw Error('LOOK_WORKER_PROTOCOL');
      accumulator=createPersonalLookAccumulator({expectedPairs:data.count,mode:data.count===200?'personal':'lite',format});
      selectedFormat=format;
      self.postMessage({type:'ready'});
    }else if(data.type==='pair'){
      exact(data,['type','pair']);if(!accumulator)throw Error('LOOK_WORKER_ORDER');
      exact(data.pair,['id','before','after']);
      const {completed}=accumulator.add({...data.pair,format:selectedFormat});
      self.postMessage({type:'accepted',completed});
    }else if(data.type==='finish'){
      exact(data,['type']);if(!accumulator)throw Error('LOOK_WORKER_ORDER');
      const artifact=accumulator.finish(),format=selectedFormat;accumulator=null;selectedFormat=null;
      const document=validatePersonalLook({schemaVersion:1,engineVersion:PERSONAL_LOOK_ENGINE,
        coefficients:artifact.models[format].coefficients,strength:1,format});
      self.postMessage({document});
    }else throw Error('LOOK_WORKER_PROTOCOL');
  }catch(error){accumulator=null;selectedFormat=null;generation++;self.postMessage({error:error?.message||'LOOK_TRAINING_FAILED'});}
};
