import {assertPixels,assertInputBuffer,checkAbort} from './pure.mjs';
export * from './pure.mjs';
export function createProcessing({workerURL='/processing-worker.js',timeoutMs=120000}={}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('INVALID_WORKER_TIMEOUT');
  const active=new Set();let disposed=false,sequence=0;
  function call(method,args,signal) {
    return new Promise((resolve,reject)=>{
      let worker,timer,finished=false;
      const complete=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(worker){worker.terminate();active.delete(cancel);}error?reject(error):resolve(value);};
      const abort=()=>complete(new DOMException('Processing cancelled','AbortError'));
      const cancel=()=>complete(new DOMException('Processing disposed','AbortError'));
      try {checkAbort(signal);if(disposed)throw Error('PROCESSING_DISPOSED');if(typeof Worker==='undefined')throw Error('BROWSER_WORKER_UNAVAILABLE');
        worker=new Worker(workerURL);active.add(cancel);const id=++sequence;
        worker.onmessage=({data})=>{if(data.id!==id)return;if(data.error){const error=new Error(data.error.message);error.name=data.error.name;error.code=data.error.code;complete(error);}else complete(null,data.result);};
        worker.onerror=e=>complete(new Error(e.message||'PROCESSING_WORKER_FAILED'));
        worker.onmessageerror=()=>complete(new Error('PROCESSING_TRANSFER_FAILED'));
        signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>complete(new Error('PROCESSING_TIMEOUT')),timeoutMs);
        // Transfer only owned copies: callers' immutable Original and unedited base remain intact.
        const owned=args.map(a=>a instanceof ArrayBuffer?a.slice(0):a?.data instanceof Uint8ClampedArray?{...a,data:a.data.slice()}:a);
        const transfer=owned.flatMap(a=>a instanceof ArrayBuffer?[a]:a?.data instanceof Uint8ClampedArray?[a.data.buffer]:[]);
        worker.postMessage({id,method,args:owned},transfer);
      }catch(error){complete(error);}
    });
  }
  return {
    async decodeRaw(buffer,{signal,mode='final'}={}){assertInputBuffer(buffer);return call('decodeRaw',[buffer,{mode}],signal);},
    async makeProxy(pixels,maxEdge=1600){assertPixels(pixels);return call('makeProxy',[pixels,maxEdge]);},
    async detectPeople(pixels,{signal}={}){assertPixels(pixels);return call('detectPeople',[pixels,{}],signal);},
    async render(pixels,recipe,{detections=[],signal}={}){assertPixels(pixels);return call('render',[pixels,recipe,{detections}],signal);},
    async encode(pixels,{signal,...options}={}){assertPixels(pixels);return call('encode',[pixels,options],signal);},
    dispose(){disposed=true;for(const cancel of [...active])cancel();}
  };
}
