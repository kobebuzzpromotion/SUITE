import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {createWorkspaceProxyClient} from './workspace-proxy-client.mjs';
import {LOCAL_SHADOW_BRANCHES} from './local-saved-shadow-consent.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(`WORKSPACE_PROXY_EDITOR_${code}`);};
const canonical=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const aborted=()=>new DOMException('Workspace Proxy cancelled','AbortError');
/** Explicit transfer of the pre-render source Proxy. Never installs downloaded pixels,
 * uploads original RAW, or calls that Proxy a rendered saved Recipe result.
 * Context: workspaceId/projectId/expectedSubject/expectedTenantId/tokenProvider.
 */
export async function createWorkspaceProxyEditorHost({session,trialSession,workspaceContext,signal}={}){
  const principal=trialSession?.principal,context=workspaceContext;
  if(trialSession?.mode!=='NODE_WORKSPACE'||!principal||!context||principal.subject!==context.expectedSubject||principal.tenantId!==context.expectedTenantId||!UUID.test(context.workspaceId)||!UUID.test(context.projectId)||typeof context.tokenProvider!=='function'||typeof session?.subscribe!=='function'||typeof session?.processing?.encode!=='function')fail('NODE_IDENTITY_REQUIRED');
  const {workspaceId,projectId,expectedSubject,expectedTenantId,tokenProvider}=context;
  const api=session.api,processing=session.processing,baseURL=globalThis.location?.origin;
  let disposed=false,active=null;
  function identity(){
    if(disposed||signal?.aborted)throw aborted();
    if(trialSession.mode!=='NODE_WORKSPACE'||trialSession.principal!==principal||principal.subject!==expectedSubject||principal.tenantId!==expectedTenantId||context.workspaceId!==workspaceId||context.projectId!==projectId||context.expectedSubject!==expectedSubject||context.expectedTenantId!==expectedTenantId||context.tokenProvider!==tokenProvider||session.api!==api||session.processing!==processing)fail('IDENTITY_CHANGED');
  }
  function eligibility(){
    identity();const state=session.state,p=session.proxy;
    if(!state.asset||!UUID.test(state.asset.id)||!SHA.test(state.asset.sha256)||!Number.isSafeInteger(state.revision)||state.revision<1)fail('SAVED_PHOTO_REQUIRED');
    if(state.dirty)fail('UNSAVED_EDITS');if(state.busy||state.exporting)fail('PHOTO_BUSY');
    if(!p||![p.width,p.height].every(n=>Number.isSafeInteger(n)&&n>0)||p.width*p.height>8_000_000||Math.max(p.width,p.height)>4096||!(p.data instanceof Uint8ClampedArray)||p.data.length!==p.width*p.height*4)fail('SOURCE_PROXY_UNAVAILABLE');
    // Special shadow/restore paths may replace Session.proxy. Do not relabel those
    // pixels as an untouched source merely because the current slider is neutral.
    const recipes=[state.recipe,...(Array.isArray(session.history)?session.history:[])];
    if(recipes.some(r=>LOCAL_SHADOW_BRANCHES.some(key=>Object.hasOwn(r?.parameters?.extendedParameters??{},key))))fail('SPECIAL_SOURCE_PROXY_UNSUPPORTED');
    return {state,proxy:p};
  }
  function snap(){const {state,proxy}=eligibility();return {assetId:state.asset.id,sha256:state.asset.sha256,size:state.asset.size,revision:state.revision,recipe:canonical(state.recipe),proxy,data:proxy.data,width:proxy.width,height:proxy.height,operation:session.operation};}
  function guard(snapshot){
    const {state,proxy}=eligibility();
    if(snapshot&&(state.asset.id!==snapshot.assetId||state.asset.sha256!==snapshot.sha256||state.asset.size!==snapshot.size||state.revision!==snapshot.revision||canonical(state.recipe)!==snapshot.recipe||proxy!==snapshot.proxy||proxy.data!==snapshot.data||proxy.width!==snapshot.width||proxy.height!==snapshot.height||session.operation!==snapshot.operation))fail('PHOTO_CHANGED');
  }
  const guardedTokens=async({signal:opSignal}={})=>{identity();if(opSignal?.aborted)throw aborted();if(active)guard(active.snapshot);const token=await tokenProvider({signal:opSignal??signal});identity();if(active)guard(active.snapshot);return token;};
  const gate=new WorkspaceSessionClient({baseURL,tokenProvider:guardedTokens});
  const client=createWorkspaceProxyClient({baseURL,workspaceId,expectedSubject,expectedTenantId,tokenProvider:guardedTokens});
  async function savedHead(snapshot,operationSignal){
    guard(snapshot);const token=await guardedTokens({signal:operationSignal});
    await new WorkspaceSessionClient({baseURL,tokenProvider:()=>token}).getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:'edit',signal:operationSignal});guard(snapshot);
    const root=`${baseURL}/v1/workspaces/${workspaceId}/projects/${projectId}/assets`;
    const options={signal:operationSignal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`}};
    const response=await fetch(`${root}/${snapshot.assetId}/recipe`,options);guard(snapshot);
    if(!response.ok||response.redirected)fail('HEAD_UNAVAILABLE');const {recipe}=await response.json();guard(snapshot);
    if(!recipe||recipe.workspaceId!==workspaceId||recipe.projectId!==projectId||recipe.assetId!==snapshot.assetId||recipe.version!==snapshot.revision||recipe.branch!==false||canonical(recipe.body)!==snapshot.recipe)fail('HEAD_MISMATCH');
    const assetResponse=await fetch(root,options);guard(snapshot);if(!assetResponse.ok||assetResponse.redirected)fail('ASSET_UNAVAILABLE');
    const {assets}=await assetResponse.json();guard(snapshot);if(!Array.isArray(assets))fail('ASSET_UNAVAILABLE');
    const selected=assets.filter(a=>a.id===snapshot.assetId);if(selected.length!==1||selected[0].tenantId!==workspaceId||selected[0].sha256!==snapshot.sha256||selected[0].size!==snapshot.size||selected[0].deletedAt!==null)fail('ASSET_MISMATCH');
  }
  async function run(operationSignal,action){
    if(active)fail('OPERATION_IN_PROGRESS');const snapshot=snap(),controller=new AbortController(),entry={snapshot,controller};active=entry;
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});operationSignal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted||operationSignal?.aborted)cancel();
    const timer=setInterval(()=>{try{guard(snapshot);}catch{cancel();}},100);
    try{if(controller.signal.aborted)throw aborted();await savedHead(snapshot,controller.signal);const result=await action(snapshot,controller.signal);guard(snapshot);if(controller.signal.aborted)throw aborted();return result;}
    finally{clearInterval(timer);signal?.removeEventListener('abort',cancel);operationSignal?.removeEventListener('abort',cancel);if(active===entry)active=null;}
  }
  await gate.getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:'edit',signal});identity();
  const unsubscribe=session.subscribe(()=>{if(active)try{guard(active.snapshot);}catch{active.controller.abort();}});
  return Object.freeze({
    availability(){try{eligibility();return {available:!active,busy:!!active,blockers:active?['WORKSPACE_PROXY_EDITOR_OPERATION_IN_PROGRESS']:[]};}catch(error){return {available:false,busy:!!active,blockers:[error.name==='AbortError'?'WORKSPACE_PROXY_EDITOR_CANCELLED':error.message]};}},
    async list({signal:operationSignal}={}){return run(operationSignal,async(snapshot,s)=>{const rows=await client.list({projectId,assetId:snapshot.assetId,signal:s});guard(snapshot);return rows;});},
    async upload({signal:operationSignal}={}){return run(operationSignal,async(snapshot,s)=>{
      // Copy only RGBA source pixels; never encode previewPixels/After or deformation fields.
      const pixels={width:snapshot.width,height:snapshot.height,data:new Uint8ClampedArray(snapshot.data)};
      const blob=await processing.encode(pixels,{format:'png',signal:s});guard(snapshot);
      if(!(blob instanceof Blob)||blob.type!=='image/png'||blob.size<1||blob.size>16*1024*1024)fail('PROXY_SIZE_LIMIT');
      const sha256=await digest(await blob.arrayBuffer());guard(snapshot);
      const payload={level:Math.max(snapshot.width,snapshot.height)<=2048?'preview':'high-preview',originalSHA256:snapshot.sha256,recipeVersion:snapshot.revision,sha256,size:blob.size,width:snapshot.width,height:snapshot.height,mimeType:'image/png'};
      const key='suite-workspace-proxy-operation-v1:'+await digest(new TextEncoder().encode(canonical({baseURL,workspaceId,projectId,assetId:snapshot.assetId,expectedSubject,expectedTenantId,payload})));guard(snapshot);
      let cached;try{cached=localStorage.getItem(key);}catch{fail('OPERATION_STORAGE_UNAVAILABLE');}
      let metadata;if(cached){try{metadata=JSON.parse(cached);}catch{fail('OPERATION_STORAGE_INVALID');}const {operationId,...old}=metadata??{};if(!UUID.test(operationId)||canonical(old)!==canonical(payload))fail('OPERATION_STORAGE_INVALID');}
      else{metadata={operationId:crypto.randomUUID(),...payload};try{localStorage.setItem(key,JSON.stringify(metadata));if(localStorage.getItem(key)!==JSON.stringify(metadata))fail('OPERATION_STORAGE_UNAVAILABLE');}catch{fail('OPERATION_STORAGE_UNAVAILABLE');}}
      guard(snapshot);await savedHead(snapshot,s);
      const result=await client.upload({projectId,assetId:snapshot.assetId,metadata,blob,signal:s});guard(snapshot);await savedHead(snapshot,s);return result;
    });},
    dispose(){disposed=true;active?.controller.abort();unsubscribe();},
  });
}
