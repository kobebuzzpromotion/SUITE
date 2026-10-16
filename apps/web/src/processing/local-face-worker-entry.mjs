import {installLocalFaceWorkerHost} from './local-face-worker-host.mjs';

// Fixed same-origin runtime artifact, not a model download or caller URL.
// No initialization occurs until an explicit initialize request reaches the host.
installLocalFaceWorkerHost(self,{
  async loadModule(){
    try{
      const base=new URL('/runtime_assets/suite-face-core/',self.location.origin);
      const entry=new URL('SuiteFaceCoreWasm.mjs',base);
      const imported=await import(/* @vite-ignore */ entry.href);
      if(typeof imported.default!=='function')throw Error('MISSING_FACTORY');
      return await imported.default({
        locateFile(name){
          if(name!=='SuiteFaceCoreWasm.wasm')throw Error('LOCAL_FACE_RUNTIME_NOT_READY');
          return new URL(name,base).href;
        },
        // Do not expose runtime diagnostic payloads or model paths in UI logs.
        print(){},printErr(){}
      });
    }catch{throw Error('LOCAL_FACE_RUNTIME_NOT_READY');}
  }
});
