import {WorkspaceSessionClient} from './workspace-session-client.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const abort=signal=>{if(signal?.aborted)throw new DOMException('Proxy cancelled','AbortError');};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
/** Real Workspace host only; no anonymous fallback, token persistence, RAW upload or Cloud Safe claim. */
export function createWorkspaceProxyClient({workspaceId,expectedSubject,expectedTenantId,...config}={}){
  if(!UUID.test(workspaceId))throw Error('INVALID_PROXY_WORKSPACE');const gate=new WorkspaceSessionClient(config);
  function path(projectId,assetId){if(!UUID.test(projectId)||!UUID.test(assetId))throw Error('INVALID_PROXY_SCOPE');return `/v1/workspaces/${workspaceId}/projects/${projectId}/assets/${assetId}/proxies`;}
  async function request(url,{method='GET',body,signal,binary=false}={}){
    abort(signal);const token=await gate.tokenProvider({signal});abort(signal);
    await new WorkspaceSessionClient({baseURL:gate.baseURL,tokenProvider:()=>token,fetchImpl:gate.fetchImpl}).getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:method==='GET'?'read':'edit',signal});abort(signal);
    const blob=body instanceof Blob;
    const response=await gate.fetchImpl(gate.baseURL+url,{method,signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':blob?body.type:'application/json'})},...(body===undefined?{}:{body:blob?body:JSON.stringify(body)})});abort(signal);
    if(response.redirected||!response.ok)throw Error(`PROXY_HTTP_${response.status}`);
    if(binary){
      const length=Number(response.headers.get('Content-Length'));
      if(!Number.isSafeInteger(length)||length<1||length>16*1024*1024){await response.body?.cancel().catch(()=>{});throw Error('INVALID_PROXY_SIZE');}
      const reader=response.body?.getReader?.();if(!reader)throw Error('INVALID_PROXY_STREAM');
      const chunks=[];let received=0,complete=false;
      const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
      try{
        abort(signal);
        for(;;){
          const {done,value}=await reader.read();abort(signal);if(done)break;
          if(!(value instanceof Uint8Array)||value.byteLength>length-received||value.byteLength>16*1024*1024-received)throw Error('INVALID_PROXY_SIZE');
          received+=value.byteLength;chunks.push(value);
        }
        if(received!==length)throw Error('INVALID_PROXY_SIZE');
        const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        complete=true;return bytes.buffer;
      }finally{
        signal?.removeEventListener('abort',cancel);if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();
      }
    }
    const value=await response.json();abort(signal);return value;
  }
  function checked(r,projectId,assetId){
    if(!r||r.workspaceId!==workspaceId||r.projectId!==projectId||r.assetId!==assetId||!UUID.test(r.operationId)||!SHA.test(r.sha256)||!SHA.test(r.originalSHA256)||!['pending','committed'].includes(r.state)||!['thumbnail','preview','high-preview'].includes(r.level)||!['image/png','image/jpeg'].includes(r.mimeType)||![r.size,r.width,r.height,r.recipeVersion].every(n=>Number.isSafeInteger(n)&&n>0)||r.size>16*1024*1024||r.width*r.height>8_000_000||r.verificationScope!=='PROXY_ONLY_NOT_ORIGINAL_CLOUD_SAFE'||r.resumeMode!=='WHOLE_BLOB_RETRY')throw Error('PROXY_RESPONSE_MISMATCH');return structuredClone(r);
  }
  async function list({projectId,assetId,signal}={}){const value=await request(path(projectId,assetId),{signal});if(!Array.isArray(value.proxies))throw Error('PROXY_RESPONSE_MISMATCH');return value.proxies.map(r=>checked(r,projectId,assetId));}
  async function upload({projectId,assetId,metadata,blob,signal}={}){
    const base=path(projectId,assetId);
    if(!(blob instanceof Blob)||blob.size<1||blob.size>16*1024*1024||blob.type!==metadata?.mimeType||blob.size!==metadata?.size||!UUID.test(metadata?.operationId))throw Error('INVALID_PROXY_UPLOAD');
    abort(signal);if(await hash(await blob.arrayBuffer())!==metadata.sha256)throw Error('PROXY_CHECKSUM_MISMATCH');abort(signal);
    const initial=checked((await request(base,{method:'POST',body:metadata,signal})).proxy,projectId,assetId);
    for(const key of Object.keys(metadata))if(initial[key]!==metadata[key])throw Error('PROXY_RESPONSE_MISMATCH');
    const result=checked((await request(`${base}/${metadata.operationId}/content`,{method:'PUT',body:blob,signal})).proxy,projectId,assetId);
    for(const key of Object.keys(metadata))if(result[key]!==metadata[key])throw Error('PROXY_RESPONSE_MISMATCH');if(result.state!=='committed')throw Error('PROXY_NOT_COMMITTED');return result;
  }
  async function download({projectId,assetId,operationId,expectedOriginalSHA256,expectedRecipeVersion,signal}={}){
    if(!UUID.test(operationId))throw Error('INVALID_PROXY_OPERATION');const base=`${path(projectId,assetId)}/${operationId}`;
    const record=checked((await request(base,{signal})).proxy,projectId,assetId);
    if(record.operationId!==operationId||record.state!=='committed'||record.originalSHA256!==expectedOriginalSHA256||record.recipeVersion!==expectedRecipeVersion)throw Error('PROXY_SOURCE_MISMATCH');
    const bytes=await request(`${base}/content`,{signal,binary:true});if(bytes.byteLength!==record.size||await hash(bytes)!==record.sha256)throw Error('PROXY_CHECKSUM_MISMATCH');abort(signal);
    // Reauthorize after transfer; the server rechecks current recipe on every route.
    const fresh=checked((await request(base,{signal})).proxy,projectId,assetId);if(JSON.stringify(fresh)!==JSON.stringify(record))throw Error('PROXY_CHANGED');return {record,blob:new Blob([bytes],{type:record.mimeType})};
  }
  return Object.freeze({list,upload,download});
}
