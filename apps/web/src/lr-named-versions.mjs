import {BrowserDraftStore} from './api-client.mjs';
import {createCloudWorkspaceClient} from './delta66-workflow-workspace-client.mjs';

const positive=v=>Number.isSafeInteger(v)&&v>0;
function id(v){if(typeof v!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))throw Error('NAMED_VERSION_ID');return v;}
function name(v){if(typeof v!=='string'||!v.trim()||v.trim().length>120||/[\u0000-\u001f\u007f]/.test(v))throw Error('NAMED_VERSION_NAME');return v.trim();}
function abort(signal){if(signal?.aborted)throw new DOMException('Named versions cancelled','AbortError');}
const empty=()=>({schemaVersion:1,revision:0,entries:[],comparison:{left:null,right:null}});
function document(input){
  const d=structuredClone(input??empty());
  if(d.schemaVersion!==1||!Number.isSafeInteger(d.revision)||d.revision<0||!Array.isArray(d.entries)||d.entries.length>1000||!d.comparison)throw Error('NAMED_VERSION_DOCUMENT');
  const seen=new Set();
  for(const e of d.entries){
    id(e.id);id(e.recipeId);name(e.name);
    if(seen.has(e.id)||!positive(e.recipeVersion)||typeof e.createdAt!=='string'||typeof e.updatedAt!=='string'||
      !Number.isFinite(Date.parse(e.createdAt))||!Number.isFinite(Date.parse(e.updatedAt))||
      Object.keys(e).sort().join(',')!=='createdAt,id,name,recipeId,recipeVersion,updatedAt')throw Error('NAMED_VERSION_ENTRY');
    seen.add(e.id);
  }
  if(Object.keys(d).sort().join(',')!=='comparison,entries,revision,schemaVersion'||
    Object.keys(d.comparison).sort().join(',')!=='left,right'||
    [d.comparison.left,d.comparison.right].some(v=>v!==null&&!seen.has(v)))throw Error('NAMED_VERSION_COMPARISON');
  return d;
}

/** Local, account-scoped names of actual saved workspace Recipe revisions.
 * This does not copy Recipes, mutate Originals, restore a Recipe, create an auto
 * history, render previews, or authorize access from stored metadata. Branches
 * are excluded. Resolve/compare always re-fetch the existing authenticated history.
 * Names and comparison choices are browser-local only, NOT cross-device synced.
 * The signed-in host must supply stable scope per account/tenant and dispose this
 * instance on account changes. No tokens, bodies, pixels or signed URLs are stored.
 * workspaceConfig uses createCloudWorkspaceClient's existing session/token contract.
 * No new backend route or database schema is implied by this module.
 */
export function createNamedRecipeVersions({scope,workspaceConfig,projectId,assetId}={}){
  if(typeof scope!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(scope))throw Error('NAMED_VERSION_SCOPE');
  id(projectId);id(assetId);const workspaceId=id(workspaceConfig?.workspaceId);
  const client=createCloudWorkspaceClient(workspaceConfig);
  const store=new BrowserDraftStore(`named-versions-${scope}`),key=`${workspaceId}:${projectId}:${assetId}`;
  const result=d=>({document:structuredClone(d),storage:'browser-local-only',cloudSynchronized:false});
  async function read(){return result(document(await store.get(key)));}
  async function history(signal){
    abort(signal);const rows=await client.history({projectId,assetId,signal});abort(signal);
    return rows.filter(row=>!row.branch);
  }
  function reference(entry,rows){
    const row=rows.find(row=>row.version===entry.recipeVersion&&row.id===entry.recipeId);
    if(!row)throw Error('NAMED_VERSION_REFERENCE_UNAVAILABLE');
    return {entry:structuredClone(entry),recipe:structuredClone(row),workspaceId,projectId,assetId};
  }
  async function commit(baseRevision,change,signal){
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0||baseRevision>=Number.MAX_SAFE_INTEGER)throw Error('NAMED_VERSION_REVISION');
    abort(signal);const db=await store.db();abort(signal);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),records=tx.objectStore('drafts');let error,next;
      const cancel=()=>{error=new DOMException('Named versions cancelled','AbortError');try{tx.abort();}catch{/* transaction may already be committed */}};
      const cleanup=()=>signal?.removeEventListener('abort',cancel);
      signal?.addEventListener('abort',cancel,{once:true});
      tx.onabort=()=>{cleanup();reject(error??tx.error??Error('NAMED_VERSION_SAVE_ABORTED'));};
      tx.onerror=()=>{error??=tx.error;};
      tx.oncomplete=()=>{cleanup();resolve(result(next));};
      const request=records.get(key);
      request.onsuccess=()=>{try{
        abort(signal);const current=document(request.result);
        if(current.revision!==baseRevision)throw Error('NAMED_VERSION_CONFLICT');
        change(current);current.revision++;next=document(current);records.put(next,key);
      }catch(cause){error=cause;tx.abort();}};
    });
  }
  async function create({baseRevision,recipeVersion,name:label,signal}={}){
    const safeName=name(label);if(!positive(recipeVersion))throw Error('NAMED_VERSION_RECIPE_VERSION');
    const rows=await history(signal),row=rows.find(v=>v.version===recipeVersion);
    if(!row)throw Error('NAMED_VERSION_REFERENCE_UNAVAILABLE');id(row.id);
    const now=new Date().toISOString(),entry={id:crypto.randomUUID(),recipeId:row.id,recipeVersion,
      name:safeName,createdAt:now,updatedAt:now};
    return commit(baseRevision,d=>{if(d.entries.length>=1000)throw Error('NAMED_VERSION_LIMIT');d.entries.push(entry);},signal);
  }
  async function rename({baseRevision,id:entryId,name:label,signal}={}){
    id(entryId);const safeName=name(label);
    return commit(baseRevision,d=>{const e=d.entries.find(v=>v.id===entryId);if(!e)throw Error('NAMED_VERSION_NOT_FOUND');
      e.name=safeName;e.updatedAt=new Date().toISOString();},signal);
  }
  async function remove({baseRevision,id:entryId,signal}={}){
    id(entryId);return commit(baseRevision,d=>{
      const index=d.entries.findIndex(v=>v.id===entryId);if(index<0)throw Error('NAMED_VERSION_NOT_FOUND');
      d.entries.splice(index,1);for(const side of ['left','right'])if(d.comparison[side]===entryId)d.comparison[side]=null;
    },signal);
  }
  async function selectComparison({baseRevision,left=null,right=null,signal}={}){
    for(const value of [left,right])if(value!==null)id(value);
    // Do network I/O before opening the short IndexedDB transaction. Version CAS
    // rejects a concurrent local rename/delete; fetched history grants no lasting ACL.
    const d=(await read()).document;if(d.revision!==baseRevision)throw Error('NAMED_VERSION_CONFLICT');
    const rows=await history(signal);
    for(const value of [left,right])if(value!==null){const e=d.entries.find(v=>v.id===value);if(!e)throw Error('NAMED_VERSION_NOT_FOUND');reference(e,rows);}
    return commit(baseRevision,current=>{current.comparison={left,right};},signal);
  }
  async function resolve({id:entryId,signal}={}){
    id(entryId);const d=(await read()).document,e=d.entries.find(v=>v.id===entryId);
    if(!e)throw Error('NAMED_VERSION_NOT_FOUND');
    return {...reference(e,await history(signal)),metadataRevision:d.revision,originalUnchanged:true};
  }
  async function compare({signal}={}){
    const d=(await read()).document;
    if(!d.comparison.left||!d.comparison.right)throw Error('NAMED_VERSION_COMPARISON_INCOMPLETE');
    const rows=await history(signal);
    return {left:reference(d.entries.find(e=>e.id===d.comparison.left),rows),
      right:reference(d.entries.find(e=>e.id===d.comparison.right),rows),metadataRevision:d.revision,
      originalUnchanged:true,rendered:false};
  }
  return Object.freeze({read,create,rename,remove,selectComparison,resolve,compare});
}
