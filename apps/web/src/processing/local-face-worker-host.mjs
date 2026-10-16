import {createLocalFaceWasmBridge} from './local-face-wasm-bridge.mjs';
// Install only in a dedicated worker. A bundled loader must be supplied by the
// application; missing loader is reported as not ready, never a mock inference.
export function installLocalFaceWorkerHost(scope,{loadModule}={}){
  let bridge=null,busy=false;
  scope.onmessage=async({data})=>{
    const {id,operation,payload}=data??{};
    if(!Number.isSafeInteger(id)||id<1)return;
    if(busy){scope.postMessage({id,error:'LOCAL_FACE_BUSY'});return;}
    busy=true;
    try{
      if(operation==='initialize'){
        if(bridge||typeof loadModule!=='function')throw Error('LOCAL_FACE_RUNTIME_NOT_READY');
        bridge=await createLocalFaceWasmBridge(await loadModule(),payload);
        scope.postMessage({id,result:{ready:true,inferenceCompleted:false}});
      }else if(operation==='analyze'){
        if(!bridge)throw Error('LOCAL_FACE_RUNTIME_NOT_READY');
        scope.postMessage({id,result:bridge.analyze(payload)});
      }else if(operation==='close'){
        bridge?.close();bridge=null;scope.postMessage({id,result:{closed:true}});
      }else throw Error('LOCAL_FACE_OPERATION');
    }catch(error){scope.postMessage({id,error:/^LOCAL_FACE_[A-Z_]+$/.test(error?.message??'')?error.message:'LOCAL_FACE_FAILED'});}
    finally{busy=false;}
  };
}
