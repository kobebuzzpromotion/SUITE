// Caller provides a dedicated bundled Worker, not an arbitrary runtime URL.
// Terminating on cancellation discards synchronous C++ work and releases WASM.
export function createLocalFaceWorkerClient(worker){
  if(typeof worker?.postMessage!=='function'||typeof worker?.terminate!=='function'||typeof worker?.addEventListener!=='function'||typeof worker?.removeEventListener!=='function')throw Error('LOCAL_FACE_RUNTIME_NOT_READY');
  let sequence=0,pending=null,closed=false;
  const abortError=()=>new DOMException('Cancelled','AbortError');
  function stop(error){if(closed)return;closed=true;worker.terminate();worker.removeEventListener('message',message);worker.removeEventListener('error',failed);worker.removeEventListener('messageerror',failed);if(pending){const p=pending;pending=null;p.cleanup();p.reject(error);}}
  function message(event){if(!pending||event.data?.id!==pending.id)return;const p=pending;pending=null;p.cleanup();event.data.error?p.reject(Error(event.data.error)):p.resolve(event.data.result);}
  function failed(){stop(Error('LOCAL_FACE_WORKER_FAILED'));}
  worker.addEventListener('message',message);worker.addEventListener('error',failed);worker.addEventListener('messageerror',failed);
  return Object.freeze({
    request(operation,payload,{signal}={}){
      if(closed||pending)return Promise.reject(Error('LOCAL_FACE_UNAVAILABLE'));
      if(!['initialize','analyze','close'].includes(operation))return Promise.reject(Error('LOCAL_FACE_OPERATION'));
      if(signal?.aborted){stop(abortError());return Promise.reject(abortError());}
      return new Promise((resolve,reject)=>{
        const id=++sequence,abort=()=>stop(abortError());
        const timer=setTimeout(()=>stop(Error('LOCAL_FACE_TIMEOUT')),120000);
        pending={id,resolve,reject,cleanup(){clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
        signal?.addEventListener('abort',abort,{once:true});
        try{worker.postMessage({id,operation,payload});}catch{stop(Error('LOCAL_FACE_TRANSFER'));}
      });
    },dispose(){stop(abortError());}
  });
}
