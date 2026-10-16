import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {cloudCapacityView} from './delta66-workflow-cloud.mjs';

const uuid=value=>{if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error('CLOUD_WORKSPACE_ID_INVALID');return value;};
const abort=signal=>{if(signal?.aborted)throw new DOMException('Workspace cancelled','AbortError');};
const positive=value=>Number.isSafeInteger(value)&&value>0;
/** Actual existing workspace-server routes only. No new cloud provider/ACL/schema is defined.
 * One fresh bearer is used for BOTH the existing session gate and each following request.
 */
export function createCloudWorkspaceClient({workspaceId,expectedSubject,expectedTenantId,...config}={}){
  uuid(workspaceId);const gate=new WorkspaceSessionClient(config);
  async function request(path,{method='GET',body,signal}={}){
    abort(signal);const token=await gate.tokenProvider({signal});abort(signal);
    const current=new WorkspaceSessionClient({baseURL:gate.baseURL,fetchImpl:gate.fetchImpl,tokenProvider:()=>token});
    await current.getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:method==='GET'?'read':'edit',signal});
    abort(signal);
    const response=await gate.fetchImpl(`${gate.baseURL}/v1/workspaces/${workspaceId}${path}`,{method,signal,
      credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    abort(signal);
    if(!response||response.redirected)throw Error('CLOUD_WORKSPACE_RESPONSE_INVALID');
    const result=await response.json();abort(signal);
    if(!response.ok){
      const error=Error(typeof result?.error==='string'&&/^[A-Z0-9_]{1,100}$/.test(result.error)?result.error:`CLOUD_WORKSPACE_HTTP_${response.status}`);
      error.status=response.status;
      // Existing Recipe conflicts may record a branch. Never retry as a blind overwrite.
      if(response.status===409&&result.outcome==='conflict')error.recipeConflict=structuredClone(result);
      throw error;
    }
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('CLOUD_WORKSPACE_RESPONSE_INVALID');
    return result;
  }
  async function listProjects({signal}={}){
    const result=await request('/projects',{signal});
    if(!Array.isArray(result.projects)||result.projects.length>100000)throw Error('CLOUD_PROJECT_LIST_INVALID');
    const seen=new Set();
    for(const row of result.projects){
      uuid(row.id);
      if(row.workspaceId!==workspaceId||row.deletedAt!==null||typeof row.name!=='string'||seen.has(row.id))throw Error('CLOUD_PROJECT_SCOPE_MISMATCH');
      seen.add(row.id);
    }
    return structuredClone(result.projects);
  }
  async function storage({signal}={}){
    const result=await request('/storage',{signal});
    if(result.usage?.workspaceId!==workspaceId||result.billing!=='NOT_CONNECTED'||!result.entitlements||
        typeof result.entitlements!=='object')throw Error('CLOUD_STORAGE_RESPONSE_INVALID');
    for(const key of ['MOBILE','DESKTOP','ALL','STUDIO','CLOUD_STORAGE','GENERATIVE_AI'])
      if(typeof result.entitlements[key]!=='boolean')throw Error('CLOUD_ENTITLEMENT_RESPONSE_INVALID');
    return {...structuredClone(result),capacity:cloudCapacityView(result.usage)};
  }
  const assetPath=(projectId,assetId)=>`/projects/${uuid(projectId)}/assets/${uuid(assetId)}`;
  function checkedVersion(row,projectId,assetId){
    if(!row||row.workspaceId!==workspaceId||row.projectId!==projectId||row.assetId!==assetId||
        !positive(row.version)||typeof row.branch!=='boolean'||!row.body||typeof row.body!=='object'||Array.isArray(row.body))
      throw Error('CLOUD_RECIPE_SCOPE_MISMATCH');
    return row;
  }
  async function history({projectId,assetId,signal}={}){
    const result=await request(`${assetPath(projectId,assetId)}/versions`,{signal});
    if(!Array.isArray(result.versions)||result.versions.length>100000)throw Error('CLOUD_RECIPE_HISTORY_INVALID');
    const seen=new Set();
    for(const row of result.versions){checkedVersion(row,projectId,assetId);if(seen.has(row.version))throw Error('CLOUD_RECIPE_HISTORY_DUPLICATE');seen.add(row.version);}
    return structuredClone(result.versions);
  }
  async function restoreRecipe({projectId,assetId,historicalVersion,expectedCurrentVersion,confirmed=false,signal}={}){
    if(confirmed!==true||!positive(historicalVersion)||!positive(expectedCurrentVersion)||
        historicalVersion>=expectedCurrentVersion)throw Error('CLOUD_RESTORE_INPUT_INVALID');
    const path=assetPath(projectId,assetId),versions=await history({projectId,assetId,signal});
    const selected=versions.find(row=>row.version===historicalVersion&&!row.branch);
    if(!selected)throw Error('CLOUD_RESTORE_VERSION_NOT_FOUND');
    const latest=await request(`${path}/recipe`,{signal});
    checkedVersion(latest.recipe,projectId,assetId);
    if(latest.recipe.version!==expectedCurrentVersion)throw Error('CLOUD_RESTORE_HEAD_CHANGED');
    const saved=await request(`${path}/recipe`,{method:'PUT',body:{baseVersion:expectedCurrentVersion,recipe:selected.body},signal});
    checkedVersion(saved.version,projectId,assetId);
    if(saved.outcome!=='saved'||saved.version.branch||saved.version.parentVersion!==expectedCurrentVersion)
      throw Error('CLOUD_RESTORE_SAVE_MISMATCH');
    try{
      const readback=await history({projectId,assetId,signal}),row=readback.find(item=>item.version===saved.version.version);
      if(!row||row.id!==saved.version.id||JSON.stringify(row.body)!==JSON.stringify(selected.body))throw Error('CLOUD_RESTORE_READBACK_MISMATCH');
      return {version:row,restoredFromVersion:historicalVersion,originalUnchanged:true};
    }catch(error){if(error&&typeof error==='object')error.savedRecipeVersion=saved.version.version;throw error;}
  }
  return Object.freeze({listProjects,storage,history,restoreRecipe});
}
