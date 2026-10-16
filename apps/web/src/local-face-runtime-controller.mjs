import {createLocalFaceWorkerClient} from './local-face-worker-client.mjs';

// Mirrors SuiteCore/PinnedFaceModels, not caller-selected hash/length values.
export const LOCAL_FACE_PINNED_MODELS=Object.freeze({
  revision:'47534e27c9851bb1128ccc0102f1145e27f23f98',runtimeVersion:'4.13.0',
  yunet:Object.freeze({sha256:'8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',byteCount:232589}),
  sface:Object.freeze({sha256:'0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',byteCount:38696353})
});
// authorize must query the host's reviewed permission/consent record. Model
// integrity alone never establishes commercial approval or photo permission.
export function createLocalFaceRuntimeController({authorize}={}){
  let client=null,epoch=0,state=Object.freeze({status:'notready',reason:'notInitialized',inferenceCompleted:false}),active=false;
  const listeners=new Set();
  const publish=(status,reason=null,inferenceCompleted=false)=>{
    state=Object.freeze({status,reason,inferenceCompleted});
    for(const listener of listeners){try{listener(state);}catch{}}
  };
  const stop=()=>{client?.dispose();client=null;};
  const check=async(operation,binding,signal)=>{
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(typeof authorize!=='function'||await authorize({operation,models:LOCAL_FACE_PINNED_MODELS,binding},{signal})!==true)
      throw Error('LOCAL_FACE_PERMISSION_NOT_READY');
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  };
  async function run(status,operation,body,{signal,binding}={}){
    if(active||state.status==='closed')throw Error('LOCAL_FACE_UNAVAILABLE');
    active=true;const generation=epoch;let result;
    const current=()=>{if(epoch!==generation||signal?.aborted)throw new DOMException('Cancelled','AbortError');};
    publish(status);
    try{
      current();
      await check(operation,binding,signal);
      current();
      result=await body(current);
      current();
      await check(operation==='initialize'?'release-initialization':'release-analysis',binding,signal);
      current();
      publish('ready',null,operation==='analyze');current();return result;
    }catch(error){
      // A rejected release must not retain sensitive results from the worker.
      for(const face of result?.faces??[]){face.embedding?.fill(0);face.values?.fill(0);}
      if(epoch===generation){stop();publish(error?.name==='AbortError'?'notready':'error',
        error?.name==='AbortError'?'cancelled':/^LOCAL_FACE_[A-Z_]+$/.test(error?.message??'')?error.message:'LOCAL_FACE_FAILED');}
      throw error;
    }finally{active=false;}
  }
  return Object.freeze({
    snapshot:()=>state,
    subscribe(listener){if(typeof listener!=='function')throw Error('LOCAL_FACE_LISTENER');listeners.add(listener);listener(state);return()=>listeners.delete(listener);},
    initialize({yunet,sface},{signal}={}){
      if(active||state.status==='closed')return Promise.reject(Error('LOCAL_FACE_UNAVAILABLE'));
      if(client) return Promise.reject(Error('LOCAL_FACE_ALREADY_INITIALIZED'));
      // Snapshot before awaiting host permission, preventing caller mutation.
      const copy=(bytes,pin)=>{if(!(bytes instanceof Uint8Array)||bytes.length!==pin.byteCount)throw Error('LOCAL_FACE_MODEL_NOT_READY');return {...pin,bytes:bytes.slice()};};
      const models={};try{models.yunet=copy(yunet,LOCAL_FACE_PINNED_MODELS.yunet);models.sface=copy(sface,LOCAL_FACE_PINNED_MODELS.sface);}catch(error){models.yunet?.bytes.fill(0);models.sface?.bytes.fill(0);publish('notready','LOCAL_FACE_MODEL_NOT_READY');return Promise.reject(error);}
      return run('loading','initialize',async()=>{
        client=createLocalFaceWorkerClient(new Worker(new URL('./processing/local-face-worker-entry.mjs',import.meta.url),{type:'module'}));
        return await client.request('initialize',models,{signal});
      },{signal}).finally(()=>{models.yunet.bytes.fill(0);models.sface.bytes.fill(0);});
    },
    analyze(input,{signal,binding}={}){
      if(!client||state.status!=='ready')return Promise.reject(Error('LOCAL_FACE_RUNTIME_NOT_READY'));
      const valid=binding&&typeof binding.assetID==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(binding.assetID)&&
        /^[0-9a-f]{64}$/i.test(binding.originalSHA256??'')&&/^[0-9a-f]{64}$/i.test(binding.analysisSHA256??'');
      if(!valid||!(input?.bgr instanceof Uint8Array)||
        !Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||
        input.width>1600||input.height>1600||input.stride!==input.width*3||
        input.bgr.length!==input.stride*input.height)return Promise.reject(Error('LOCAL_FACE_INPUT'));
      const frame={bgr:input.bgr.slice(),width:input.width,height:input.height,stride:input.stride},fixedBinding=Object.freeze({...binding});
      const fixedClient=client;
      return run('running','analyze',async current=>{
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',frame.bgr)),b=>b.toString(16).padStart(2,'0')).join('');
        current();
        if(digest!==fixedBinding.analysisSHA256.toLowerCase())throw Error('LOCAL_FACE_INPUT_INTEGRITY');
        if(client!==fixedClient)throw new DOMException('Cancelled','AbortError');
        return fixedClient.request('analyze',frame,{signal});
      },{signal,binding:fixedBinding})
        .finally(()=>frame.bgr.fill(0));
    },
    cancel(){if(state.status==='closed')return;epoch++;stop();publish('notready','cancelled');},
    dispose(){epoch++;stop();publish('closed');listeners.clear();}
  });
}
