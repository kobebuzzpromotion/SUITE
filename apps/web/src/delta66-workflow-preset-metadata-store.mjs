import {BrowserDraftStore} from './api-client.mjs';
import {updatePresetLibrary,presetCatalogMetadata} from './delta66-preset-library.mjs';

const empty=()=>({schemaVersion:1,version:0,groups:[],entries:[]});
/** Actual local persistence using the existing browser store. This is explicitly NOT cloud
 * metadata sync: current ws_presets/ws_preset_versions have no group/hot/category columns
 * or route. Never smuggle metadata into a Recipe, name, entitlement or shared preset body.
 * Scope must be supplied by the signed-in host per tenant/workspace/user; data grants no rights.
 */
export function createLocalPresetMetadataStore({scope}={}){
  if(typeof scope!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(scope))throw Error('PRESET_METADATA_SCOPE_REQUIRED');
  const store=new BrowserDraftStore(`preset-library-${scope}`),key='catalog-metadata';
  async function read(){
    const document=(await store.get(key))??empty();presetCatalogMetadata(document);
    return {document:structuredClone(document),storage:'browser-local-only',cloudSynchronized:false};
  }
  async function apply({baseVersion,operation}={}){
    // Detach the operation before waiting for IndexedDB so caller mutation cannot change intent.
    const change=structuredClone(operation),db=await store.db();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),records=tx.objectStore('drafts');let result,error;
      tx.onabort=()=>reject(error??tx.error??Error('PRESET_METADATA_SAVE_ABORTED'));
      tx.onerror=()=>{error??=tx.error;};
      tx.oncomplete=()=>resolve({document:result,storage:'browser-local-only',cloudSynchronized:false});
      const request=records.get(key);
      request.onsuccess=()=>{
        try{
          result=updatePresetLibrary(request.result??empty(),{baseVersion,operation:change});
          if(new TextEncoder().encode(JSON.stringify(result)).length>2*1024*1024)throw Error('PRESET_METADATA_SIZE_LIMIT');
          records.put(result,key);
        }catch(cause){error=cause;tx.abort();}
      };
    });
  }
  return Object.freeze({read,apply});
}
