import {BrowserDraftStore} from './api-client.mjs';
import {createNamedRecipeVersions} from './lr-named-versions.mjs';
import {createCloudWorkspaceClient} from './delta66-workflow-workspace-client.mjs';
import {summarizeSavedVersionAdjustments} from './saved-version-adjustment-summary.mjs';

const abort=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
const label=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>120||/[\u0000-\u001f\u007f]/.test(value))throw Error('NAMED_VERSION_NAME');return value.trim();};
const empty=()=>({schemaVersion:1,revision:0,entries:[],comparison:{left:null,right:null}});
function checked(d){
  if(!d||d.schemaVersion!==1||!Number.isSafeInteger(d.revision)||d.revision<0||!Array.isArray(d.entries)||d.entries.length>1000||!d.comparison)throw Error('NAMED_VERSION_DOCUMENT');
  const ids=new Set();for(const e of d.entries){label(e.name);if(typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isSafeInteger(e.recipeVersion)||e.recipeVersion<1||! /^[0-9a-f]{64}$/.test(e.bodySHA256))throw Error('NAMED_VERSION_ENTRY');ids.add(e.id);}
  for(const id of [d.comparison.left,d.comparison.right])if(id!==null&&!ids.has(id))throw Error('NAMED_VERSION_COMPARISON');
  return d;
}
async function fingerprint(body){
  const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  const data=new TextEncoder().encode(JSON.stringify(sort(body)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Capability-gated contracts, never fake history for an ordinary Editor API.
 * Default: api.getRecipe(assetId) exposes only saved HEAD. Persist names + revision
 * + body hash, not Recipe copies. Older references remain but cannot be resolved.
 * Workspace mode: existing authorized history + lr-named-versions local CAS.
 * Saved-history mode: explicit supportsRecipeHistory + fresh authorized history.
 * scope MUST isolate account/tenant/backend; destroy UI on identity/asset changes.
 * Both modes keep names browser-local; no unimplemented server route is called.
 */
export function createConnectedVersionsController({api,scope,assetId,workspaceConfig,projectId}={}){
  if(typeof scope!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(scope)||typeof assetId!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(assetId))throw Error('NAMED_VERSION_SCOPE');
  if(workspaceConfig){
    const names=createNamedRecipeVersions({scope,workspaceConfig,projectId,assetId}),client=createCloudWorkspaceClient(workspaceConfig);
    return Object.freeze({...names,mode:'workspace-history',async refresh({signal}={}){
      const rows=(await client.history({projectId,assetId,signal})).filter(r=>!r.branch);abort(signal);
      const {document}=await names.read();abort(signal);
      return {document,availableVersions:rows.map(r=>r.version),versionSummaries:[],unavailableEntryIds:document.entries.filter(e=>!rows.some(r=>r.version===e.recipeVersion&&r.id===e.recipeId)).map(e=>e.id)};
    }});
  }
  if(typeof api?.getRecipe!=='function')throw Error('NAMED_VERSION_HEAD_API_REQUIRED');
  const historyMode=api.supportsRecipeHistory===true&&typeof api.getRecipeHistory==='function';
  const store=new BrowserDraftStore(`connected-versions-${scope}`),key=assetId;
  async function head(signal){
    abort(signal);const row=await api.getRecipe(assetId);abort(signal);
    if(row===null)return null;
    if(!row||!Number.isSafeInteger(row.revision)||row.revision<1||!row.body||typeof row.body!=='object'||Array.isArray(row.body))throw Error('NAMED_VERSION_HEAD_INVALID');
    return {...structuredClone(row),bodySHA256:await fingerprint(row.body)};
  }
  async function authorizedRows(signal){
    if(!historyMode){const row=await head(signal);abort(signal);return row?[row]:[];}
    // Capability withdrawal is not a reason to fall back to stale/HEAD data.
    if(api.supportsRecipeHistory!==true||typeof api.getRecipeHistory!=='function')throw Error('NAMED_VERSION_HISTORY_UNAVAILABLE');
    abort(signal);const rows=await api.getRecipeHistory(assetId,{signal});abort(signal);
    if(!Array.isArray(rows))throw Error('NAMED_VERSION_HISTORY_INVALID');
    if(rows.length>1000)throw Error('RECIPE_HISTORY_LIMIT');
    let previous=0,total=0;const result=[];
    for(const row of rows){
      if(!row||!Number.isSafeInteger(row.revision)||row.revision<=previous||row.branch===true||!row.body||typeof row.body!=='object'||Array.isArray(row.body))throw Error('NAMED_VERSION_HISTORY_INVALID');
      previous=row.revision;const snapshot=structuredClone(row);total+=new TextEncoder().encode(JSON.stringify(snapshot.body)).byteLength;
      if(total>16*1024*1024)throw Error('RECIPE_HISTORY_LIMIT');
      result.push({...snapshot,bodySHA256:await fingerprint(snapshot.body)});abort(signal);
    }
    return result;
  }
  async function read(){return {document:checked((await store.get(key))??empty())};}
  async function mutate(baseRevision,change,signal){
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0||baseRevision>=Number.MAX_SAFE_INTEGER)throw Error('NAMED_VERSION_REVISION');
    const currentRows=await authorizedRows(signal);abort(signal);const db=await store.db();abort(signal);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),records=tx.objectStore('drafts');let result,error;
      tx.onabort=()=>reject(error??tx.error??Error('NAMED_VERSION_SAVE_ABORTED'));tx.onerror=()=>{error??=tx.error;};
      tx.oncomplete=()=>resolve({document:structuredClone(result)});
      const request=records.get(key);request.onsuccess=()=>{try{
        abort(signal);const d=checked(request.result??empty());if(d.revision!==baseRevision)throw Error('NAMED_VERSION_CONFLICT');
        change(d,currentRows);d.revision++;result=checked(d);if(JSON.stringify(d).length>1024*1024)throw Error('NAMED_VERSION_LIMIT');records.put(d,key);
      }catch(cause){error=cause;tx.abort();}};
    });
  }
  const matches=(e,row)=>row&&e.recipeVersion===row.revision&&e.bodySHA256===row.bodySHA256;
  async function refresh({signal}={}){
    const rows=await authorizedRows(signal),{document}=await read();abort(signal);
    // Transient labels derived from this authorized body snapshot only. Names
    // storage remains revision+SHA references, never cached Recipe bodies.
    const versionSummaries=rows.map(row=>({revision:row.revision,bodySHA256:row.bodySHA256,
      labels:summarizeSavedVersionAdjustments(row.body)}));
    abort(signal);
    return {document,availableVersions:rows.map(row=>row.revision),versionSummaries,
      unavailableEntryIds:document.entries.filter(e=>!rows.some(row=>matches(e,row))).map(e=>e.id)};
  }
  async function create({baseRevision,recipeVersion,name,signal}={}){
    const safeName=label(name),rows=await authorizedRows(signal),row=rows.find(item=>item.revision===recipeVersion);if(!row)throw Error('NAMED_VERSION_HEAD_CHANGED');
    return mutate(baseRevision,(d,current)=>{if(!current.some(item=>item.revision===row.revision&&item.bodySHA256===row.bodySHA256))throw Error('NAMED_VERSION_HEAD_CHANGED');if(d.entries.length>=1000)throw Error('NAMED_VERSION_LIMIT');d.entries.push({id:crypto.randomUUID(),name:safeName,recipeVersion,bodySHA256:row.bodySHA256});},signal);
  }
  async function rename({baseRevision,id,name,signal}={}){const safeName=label(name);return mutate(baseRevision,d=>{const e=d.entries.find(e=>e.id===id);if(!e)throw Error('NAMED_VERSION_NOT_FOUND');e.name=safeName;},signal);}
  async function remove({baseRevision,id,signal}={}){return mutate(baseRevision,d=>{const i=d.entries.findIndex(e=>e.id===id);if(i<0)throw Error('NAMED_VERSION_NOT_FOUND');d.entries.splice(i,1);for(const side of ['left','right'])if(d.comparison[side]===id)d.comparison[side]=null;},signal);}
  async function selectComparison({baseRevision,left=null,right=null,signal}={}){
    return mutate(baseRevision,(d,rows)=>{for(const id of [left,right])if(id!==null){const e=d.entries.find(e=>e.id===id);if(!e||!rows.some(row=>matches(e,row)))throw Error('NAMED_VERSION_HISTORY_NOT_EXPOSED');}d.comparison={left,right};},signal);
  }
  async function compare({signal}={}){
    const rows=await authorizedRows(signal),{document:d}=await read();abort(signal);
    const side=id=>{const e=d.entries.find(e=>e.id===id),row=e&&rows.find(item=>matches(e,item));if(!row)throw Error('NAMED_VERSION_HISTORY_NOT_EXPOSED');return {entry:structuredClone(e),recipe:structuredClone(row),assetId};};
    return {left:side(d.comparison.left),right:side(d.comparison.right),metadataRevision:d.revision,originalUnchanged:true,rendered:false};
  }
  async function resolve({id,signal}={}){
    if(typeof id!=='string'||!id)throw Error('NAMED_VERSION_NOT_FOUND');
    const rows=await authorizedRows(signal),{document}=await read();abort(signal);
    const entry=document.entries.find(item=>item.id===id);
    if(!entry)throw Error('NAMED_VERSION_NOT_FOUND');
    const recipe=rows.find(row=>matches(entry,row));
    if(!recipe)throw Error('NAMED_VERSION_HISTORY_NOT_EXPOSED');
    // Resolution is fresh read-only evidence, not a restore or write authority.
    return {assetId,entry:structuredClone(entry),recipe:structuredClone(recipe),
      metadataRevision:document.revision,originalUnchanged:true,rendered:false};
  }
  return Object.freeze({mode:historyMode?'saved-history':'saved-head-only',read,refresh,create,rename,remove,selectComparison,compare,resolve});
}
