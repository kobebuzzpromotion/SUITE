import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
/** Existing backend protocol only. No production provider or authentication claim. */
export class APIClient {
  get supportsRecipeHistory(){return true;}
  constructor({baseURL='',fetcher=(...args)=>globalThis.fetch(...args),requestHeader='X-Suite-QA'}={}){this.baseURL=baseURL;this.fetcher=fetcher;this.requestHeader=requestHeader;}
  async request(path,{method='GET',body,signal,headers={}}={}) {
    const binary=body instanceof Blob||body instanceof ArrayBuffer;
    const response=await this.fetcher(this.baseURL+path,{method,credentials:'same-origin',signal,
      headers:{[this.requestHeader]:'1',...(body&&!binary?{'Content-Type':'application/json'}:{}),...headers},body:body?(binary?body:JSON.stringify(body)):undefined});
    if(!response.ok){let detail;try{detail=await response.json();}catch{}throw Error(detail?.error||'HTTP_'+response.status);}
    return path.includes('/original?')?response.arrayBuffer():response.json();
  }
  async listAssets(){return (await this.request('/v1/assets')).assets;}
  createAsset(input){return this.request('/v1/assets',{method:'POST',body:input});}
  putOriginal(id,body){return this.request('/v1/assets/'+id+'/original',{method:'PUT',body});}
  getOriginal(id,{signal}={}){return this.request('/v1/assets/'+id+'/original?purpose=high-precision',{signal});}
  async getRecipe(id){return (await this.request('/v1/assets/'+id+'/recipe')).recipe;}
  async getRecipeHistory(id,{signal}={}){
    if(typeof id!=='string'||!id)throw Error('INVALID_ASSET');
    if(signal?.aborted)throw new DOMException('Recipe history cancelled','AbortError');
    const response=await this.request('/v1/assets/'+encodeURIComponent(id)+'/recipe/history',{signal});
    if(signal?.aborted)throw new DOMException('Recipe history cancelled','AbortError');
    if(!Array.isArray(response?.history))throw Error('RECIPE_HISTORY_INVALID');
    if(response.history.length>1000)throw Error('RECIPE_HISTORY_LIMIT');
    let prior=0,bytes=0;
    for(const row of response.history){
      if(!row||Array.isArray(row)||Object.keys(row).some(key=>!['revision','body'].includes(key))||
          !Number.isSafeInteger(row.revision)||row.revision!==prior+1||!row.body)
        throw Error('RECIPE_HISTORY_INVALID');
      validateRecipe(row.body);
      bytes+=new TextEncoder().encode(JSON.stringify(row.body)).byteLength;
      if(bytes>16*1024*1024)throw Error('RECIPE_HISTORY_LIMIT');
      prior=row.revision;
    }
    return response.history;
  }
  saveRecipe(id,expectedRevision,recipe){return this.request('/v1/assets/'+id+'/recipe',{method:'PUT',body:{expectedRevision,recipe}});}
}

/** Only Proxy blobs and Recipe/history metadata. No RAW blob in a database, no eviction. */
export class BrowserDraftStore {
  constructor(namespace='local-qa'){this.namespace=namespace;}
  async db(){if(!this.promise)this.promise=new Promise((resolve,reject)=>{const r=indexedDB.open('suite-web-'+this.namespace+'-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.promise;}
  async get(key){const db=await this.db();return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async put(key,value){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('LOCAL_STORAGE_UNAVAILABLE'));tx.onabort=()=>reject(tx.error||Error('LOCAL_STORAGE_UNAVAILABLE'));});}
}
