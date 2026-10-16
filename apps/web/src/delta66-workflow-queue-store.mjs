import {BrowserDraftStore} from './api-client.mjs';

function queueId(id){if(typeof id!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('DELIVERY_QUEUE_ID_INVALID');return `delivery:${id}`;}
function snapshot(input){
  const seen=new Set();
  function inspect(value,depth=0){
    if(depth>32)throw Error('DELIVERY_QUEUE_DEPTH_LIMIT');
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||seen.has(value)||
        !Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('DELIVERY_QUEUE_JSON_ONLY');
    seen.add(value);
    for(const [key,child] of Object.entries(value)){
      if(/^(?:url|token|authorization|credentials|secret|password|pixels|blob|sourceOriginal)$/i.test(key))
        throw Error('DELIVERY_QUEUE_CAPABILITY_OR_PIXELS_FORBIDDEN');
      inspect(child,depth+1);
    }
    seen.delete(value);
  }
  inspect(input);const json=JSON.stringify(input);
  if(new TextEncoder().encode(json).length>1024*1024)throw Error('DELIVERY_QUEUE_SIZE_LIMIT');
  const result=JSON.parse(json);
  if(result.schemaVersion!==1||!result.plan||result.plan.schemaVersion!==1||!Array.isArray(result.plan.jobs)||
      result.plan.jobs.length>1000||!Array.isArray(result.states)||result.states.length!==result.plan.jobs.length||
      Object.keys(result).sort().join(',')!=='plan,schemaVersion,states')throw Error('DELIVERY_QUEUE_DOCUMENT_INVALID');
  const ids=new Set(result.plan.jobs.map(job=>job.id));
  if(ids.size!==result.plan.jobs.length||[...ids].some(id=>typeof id!=='string'||!id))throw Error('DELIVERY_QUEUE_JOBS_INVALID');
  const states=new Set();
  for(const state of result.states){
    if(!ids.has(state.id)||states.has(state.id)||!['queued','running','failed','cancelled','delivered'].includes(state.status)||
        !Number.isSafeInteger(state.attempt)||state.attempt<0)throw Error('DELIVERY_QUEUE_STATE_INVALID');
    states.add(state.id);
  }
  return result;
}

/** Reuses BrowserDraftStore's IndexedDB database/store, in a dedicated caller scope.
 * Atomic read-version/write occurs in ONE readwrite transaction, not get()+put().
 * Stores intent/state only; no Original, rendered pixels, Blob, URL or auth capability.
 * Recovered plans are untrusted intent: replanDeliveryVariants with fresh Assets/Recipes.
 */
export function createDeliveryQueueStore({scope}={}){
  if(typeof scope!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(scope))throw Error('DELIVERY_QUEUE_SCOPE_REQUIRED');
  const storage=new BrowserDraftStore(`delivery-${scope}`);
  async function read(id){
    const row=await storage.get(queueId(id));if(row===undefined)return null;
    if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('DELIVERY_QUEUE_CORRUPT');
    const document=snapshot(row.document);
    return {revision:row.revision,document,requiresFreshReplan:true,
      interruptedJobIds:document.states.filter(state=>state.status==='running').map(state=>state.id)};
  }
  async function write(id,document,{baseRevision}={}){
    const key=queueId(id),safe=snapshot(document);
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0||baseRevision>=Number.MAX_SAFE_INTEGER)throw Error('DELIVERY_QUEUE_REVISION_INVALID');
    const db=await storage.db();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');let error;
      tx.onabort=()=>reject(error??tx.error??Error('DELIVERY_QUEUE_SAVE_ABORTED'));
      tx.onerror=()=>{error??=tx.error;};
      tx.oncomplete=()=>resolve({revision:baseRevision+1,document:structuredClone(safe),storage:'browser-local-only'});
      const request=store.get(key);
      request.onsuccess=()=>{
        if((request.result?.revision??0)!==baseRevision){error=Error('DELIVERY_QUEUE_VERSION_CONFLICT');tx.abort();return;}
        store.put({revision:baseRevision+1,document:safe},key);
      };
    });
  }
  return Object.freeze({read,write});
}
