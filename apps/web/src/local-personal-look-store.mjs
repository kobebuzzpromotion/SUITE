import {validatePersonalLook} from './local-personal-look-contract.mjs';
const check=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
function row(value){
  if(!value||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||!value.name.trim()||value.name.length>80)
    throw Error('LOCAL_LOOK_RECORD_INVALID');
  return {id:value.id,name:value.name,document:validatePersonalLook(value.document)};
}
async function open(){
  if(!globalThis.indexedDB)throw Error('LOCAL_LOOK_STORAGE_UNAVAILABLE');
  return new Promise((resolve,reject)=>{let failed=false;const r=indexedDB.open('suite-anonymous-personal-look-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('looks',{keyPath:'id'});
    r.onsuccess=()=>{if(failed)r.result.close();else resolve(r.result);};r.onerror=()=>reject(r.error);
    r.onblocked=()=>{failed=true;reject(Error('LOCAL_LOOK_STORAGE_BLOCKED'));};});
}
async function transaction(mode,work,{signal}={}){
  check(signal);const db=await open();
  try{check(signal);return await new Promise((resolve,reject)=>{
    const tx=db.transaction('looks',mode);let result,error;
    const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
    const clean=()=>signal?.removeEventListener('abort',abort);
    tx.oncomplete=()=>{clean();try{check(signal);resolve(result);}catch(e){reject(e);}};
    tx.onabort=()=>{clean();reject(error??tx.error??new DOMException('Cancelled','AbortError'));};
    tx.onerror=()=>{error??=tx.error;};
    try{work(tx.objectStore('looks'),value=>{result=value;},e=>{error=e;abort();});}catch(e){error=e;abort();}
  });}finally{db.close();}
}
export function listLocalPersonalLooks(options){return transaction('readonly',(store,done,fail)=>{
  const r=store.getAll();r.onsuccess=()=>{try{done(r.result.map(row));}catch(e){fail(e);}};
},options);}
export function saveLocalPersonalLook(value,options){const clean=row(value);return transaction('readwrite',(store,done,fail)=>{
  const count=store.count();count.onsuccess=()=>{const existing=store.get(clean.id);existing.onsuccess=()=>{
    if(!existing.result&&count.result>=50){fail(Error('LOCAL_LOOK_LIMIT_50'));return;}store.put(clean);done(clean);};};
},options);}
/** Import creates a fresh identity; add (never put) also rejects UUID collisions. */
export function importLocalPersonalLook(value,options){
  const clean=row({id:crypto.randomUUID(),name:value.name,document:value.document});
  return transaction('readwrite',(store,done,fail)=>{const count=store.count();count.onsuccess=()=>{
    if(count.result>=50){fail(Error('LOCAL_LOOK_LIMIT_50'));return;}store.add(clean);done(clean);
  };},options);
}
// Compare a normalized snapshot inside the write transaction. Another tab's
// rename/replacement/removal must not silently target a different library row.
function sameRow(actual,expected){
  if(!actual)throw Error('LOCAL_LOOK_SELECTION_STALE');
  if(JSON.stringify(row(actual))!==JSON.stringify(expected))throw Error('LOCAL_LOOK_SELECTION_STALE');
}
export function duplicateLocalPersonalLook(expected,{signal,guard}={}){
  const source=row(expected),copy=row({id:crypto.randomUUID(),name:source.name.slice(0,75)+' (複製)',document:source.document});
  if(guard!==undefined&&typeof guard!=='function')throw Error('LOCAL_LOOK_GUARD_INVALID');
  check(signal);guard?.();
  return transaction('readwrite',(store,done,fail)=>{
    const get=store.get(source.id);get.onsuccess=()=>{try{sameRow(get.result,source);check(signal);guard?.();
      const count=store.count();count.onsuccess=()=>{try{
        check(signal);guard?.();if(count.result>=50)throw Error('LOCAL_LOOK_LIMIT_50');
        store.add(copy);done(copy);
      }catch(error){fail(error);}};
    }catch(error){fail(error);}};
  },{signal});
}
export function deleteLocalPersonalLook(expected,{signal,guard}={}){
  const selected=row(expected);
  if(guard!==undefined&&typeof guard!=='function')throw Error('LOCAL_LOOK_GUARD_INVALID');
  check(signal);guard?.();
  return transaction('readwrite',(store,done,fail)=>{
    const get=store.get(selected.id);get.onsuccess=()=>{try{
      sameRow(get.result,selected);check(signal);guard?.();store.delete(selected.id);done({id:selected.id});
    }catch(error){fail(error);}};
  },{signal});
}
