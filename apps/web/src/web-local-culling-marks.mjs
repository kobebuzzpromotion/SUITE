import {BrowserLocalAPI} from './browser-local-api.mjs';
export function cullingMarkScope(api){
  if(!(api instanceof BrowserLocalAPI)||typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512)throw Error('CULLING_MARKS_BROWSER_LOCAL_ONLY');
  return api.databaseName;
}
export function validateCullingMark(mark){
  if(!mark||typeof mark!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(mark))||Reflect.ownKeys(mark).length!==2)throw Error('CULLING_MARK_INVALID');
  const rating=Object.getOwnPropertyDescriptor(mark,'rating'),flag=Object.getOwnPropertyDescriptor(mark,'flag');
  if(!rating||!flag||!Object.hasOwn(rating,'value')||!Object.hasOwn(flag,'value')||!Number.isInteger(rating.value)||rating.value<0||rating.value>5||!['neutral','pick','reject'].includes(flag.value))throw Error('CULLING_MARK_INVALID');
  return {rating:rating.value,flag:flag.value};
}
function key(binding){if(typeof binding?.id!=='string'||!binding.id||binding.id.length>512||!(/^[a-f0-9]{64}$/i).test(binding.originalSHA256??''))throw Error('CULLING_MARK_BINDING');return [binding.id,binding.originalSHA256.toLowerCase()];}
/** IDB origin + actual BrowserLocalAPI database namespace. No shared anonymous
 * namespace for authenticated backends; no analysis/Original/Recipe stored. */
export function createLocalCullingMarks(api){
  const scope=cullingMarkScope(api),factory=api.factory;let pendingDB=null;
  async function database(){if(!pendingDB)pendingDB=new Promise((resolve,reject)=>{if(!factory?.open){reject(Error('CULLING_MARK_STORAGE_UNAVAILABLE'));return;}
    const request=factory.open(`${scope}:manual-culling-marks-v1`,1);let failed=false;
    request.onupgradeneeded=()=>request.result.createObjectStore('marks');
    request.onerror=()=>{failed=true;reject(request.error??Error('CULLING_MARK_STORAGE_UNAVAILABLE'));};
    request.onblocked=()=>{failed=true;reject(Error('CULLING_MARK_STORAGE_BLOCKED'));};
    request.onsuccess=()=>{if(failed){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();pendingDB=null;};resolve(request.result);};
  }).catch(error=>{pendingDB=null;throw error;});return pendingDB;}
  async function transact(bindings,mark,{guard,signal}={}){
    if(typeof guard!=='function')throw Error('CULLING_MARK_GUARD_REQUIRED');
    const check=()=>{if(signal?.aborted)throw new DOMException('評価操作を中断しました','AbortError');if(cullingMarkScope(api)!==scope)throw Error('CULLING_MARK_SCOPE_CHANGED');guard();};
    check();const keys=bindings.map(key),value=mark===undefined?undefined:validateCullingMark(mark),db=await database();check();
    return new Promise((resolve,reject)=>{let tx,failure;const output=[];try{tx=db.transaction('marks',value===undefined?'readonly':'readwrite');}catch(error){reject(error);return;}
      const abort=error=>{failure=error;try{tx.abort();}catch{reject(error);}};
      const onAbort=()=>abort(new DOMException('評価操作を中断しました','AbortError'));
      signal?.addEventListener('abort',onAbort,{once:true});
      const cleanup=()=>signal?.removeEventListener('abort',onAbort);
      tx.onabort=()=>{cleanup();reject(failure??tx.error??Error('CULLING_MARK_TRANSACTION_ABORTED'));};
      tx.onerror=()=>{failure??=tx.error;};
      tx.oncomplete=()=>{cleanup();try{check();resolve(output);}catch(error){reject(error);}};
      try{check();const records=tx.objectStore('marks');keys.forEach((recordKey,i)=>{const request=value===undefined?records.get(recordKey):records.put(value,recordKey);
        request.onsuccess=()=>{try{check();output[i]=value===undefined?(request.result===undefined?null:validateCullingMark(request.result)):value;}catch(error){abort(error);}};
      });}catch(error){abort(error);}
    });
  }
  return Object.freeze({load(bindings,options){return transact(bindings,undefined,options);},async save(binding,mark,options){return (await transact([binding],mark,options))[0];}});
}
