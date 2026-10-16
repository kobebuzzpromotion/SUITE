/**
 * Node Workspace manual-culling client. This is not the public Trial/Cloud D1
 * editor, and makes no AI culling, RAW, Recipe or selection-storage claim.
 * The server, not a caller-supplied user ID, authenticates the bearer subject.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const own = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const id = value => {if (typeof value !== 'string' || !UUID.test(value)) throw Error('CULLING_ID_INVALID');return value;};
const label = (value, max) => {if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw Error('CULLING_INPUT_INVALID');return value;};
const version = value => {if (!Number.isSafeInteger(value) || value < 0) throw Error('CULLING_VERSION_INVALID');return value;};
const writableVersion = value => {version(value);if(value===Number.MAX_SAFE_INTEGER)throw Error('CULLING_VERSION_INVALID');return value;};
const failResponse = () => {throw Error('CULLING_RESPONSE_INVALID');};
const abort = signal => {if(signal?.aborted)throw new DOMException('Culling request cancelled','AbortError');};

function markFields(value) {
  if (!own(value,['rating','flag','colorLabel','tags','segmentId']) ||
      !Number.isSafeInteger(value.rating) || value.rating < 0 || value.rating > 5 ||
      !['none','pick','reject'].includes(value.flag) ||
      !Array.isArray(value.tags) || value.tags.length > 32 || Object.keys(value.tags).length !== value.tags.length)
    throw Error('CULLING_INPUT_INVALID');
  const tags=value.tags.map(item=>label(item,120));
  if(new Set(tags).size!==tags.length)throw Error('CULLING_INPUT_INVALID');
  return {rating:value.rating,flag:value.flag,colorLabel:value.colorLabel===null?null:label(value.colorLabel,120),
    tags,segmentId:value.segmentId===null?null:label(value.segmentId,128)};
}
function verifiedMark(value,assetId) {
  if (!own(value,['assetId','rating','flag','colorLabel','tags','segmentId']) || value.assetId!==assetId) failResponse();
  try{const fields=markFields({rating:value.rating,flag:value.flag,colorLabel:value.colorLabel,tags:value.tags,segmentId:value.segmentId});return Object.freeze({assetId,...fields,tags:Object.freeze(fields.tags)});}
  catch{failResponse();}
}
function verifiedSegment(value) {
  if(!own(value,['id','name']))failResponse();
  try{return Object.freeze({id:label(value.id,128),name:label(value.name,120)});}
  catch{failResponse();}
}
function scope({workspaceId,projectId,assetId}={}){
  id(workspaceId);id(projectId);if(assetId!==undefined)id(assetId);
  const project=`/v1/workspaces/${workspaceId}/projects/${projectId}`;
  return assetId===undefined?project:`${project}/assets/${assetId}`;
}
function responseCode(value,status){return typeof value?.error==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value.error)?value.error:`HTTP_${status}`;}

export class WorkspaceCullingHTTPError extends Error {
  constructor(status,code){super(code);this.name='WorkspaceCullingHTTPError';this.status=status;this.code=code;}
}

export class WorkspaceCullingClient {
  constructor({baseURL=globalThis.location?.origin,tokenProvider,fetchImpl=globalThis.fetch}={}){
    let parsed;
    try{parsed=new URL(baseURL);}catch{throw Error('CULLING_BASE_URL_INVALID');}
    const loopback=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
    if((parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&loopback)) || parsed.username || parsed.password ||
       parsed.search || parsed.hash || parsed.pathname!=='/' || typeof tokenProvider!=='function' || typeof fetchImpl!=='function')
      throw Error('CULLING_CLIENT_CONFIG_INVALID');
    this.baseURL=parsed.origin;this.tokenProvider=tokenProvider;this.fetchImpl=fetchImpl;
  }
  async #request(path,{method='GET',payload,signal}={}){
    abort(signal);
    const target=new URL(path,this.baseURL+'/');
    if(target.origin!==this.baseURL || !target.pathname.startsWith('/v1/workspaces/'))throw Error('CULLING_PATH_INVALID');
    const token=await this.tokenProvider({signal});abort(signal);
    if(typeof token!=='string'||token.length<1||token.length>8192||/\s/.test(token))throw Error('CULLING_TOKEN_INVALID');
    const response=await this.fetchImpl(target.toString(),{method,signal,credentials:'omit',
      cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      headers:{Authorization:`Bearer ${token}`,...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    abort(signal);
    if(response?.redirected===true)throw Error('CULLING_RESPONSE_REDIRECTED');
    let value;try{value=await response.json();}catch{if(response.ok)failResponse();value={};}
    if(!response.ok)throw new WorkspaceCullingHTTPError(response.status,responseCode(value,response.status));
    if(!value||typeof value!=='object'||Array.isArray(value))failResponse();
    return value;
  }
  async getProjectPage({workspaceId,projectId,limit=100,after=null,signal}={}){
    const path=scope({workspaceId,projectId});
    if(!Number.isSafeInteger(limit)||limit<1||limit>200||(after!==null&&typeof after!=='string'))throw Error('CULLING_PAGE_INVALID');
    if(after!==null)id(after);
    const query=new URLSearchParams({limit:String(limit),...(after===null?{}:{after})});
    const result=await this.#request(`${path}/culling?${query}`,{signal}),page=result.culling;
    if(!own(result,['culling'])||!own(page,['workspaceId','projectId','version','segments','marks','nextAfter'])||
       page.workspaceId!==workspaceId||page.projectId!==projectId||!Array.isArray(page.segments)||
       page.segments.length>1000||!Array.isArray(page.marks)||page.marks.length>limit)failResponse();
    try{version(page.version);if(page.nextAfter!==null)id(page.nextAfter);}catch{failResponse();}
    const segments=page.segments.map(verifiedSegment),seen=new Set();
    if(segments.some(segment=>{if(seen.has(segment.id))return true;seen.add(segment.id);return false;}))failResponse();
    const marks=page.marks.map(mark=>{try{id(mark.assetId);}catch{failResponse();}return verifiedMark(mark,mark.assetId);});
    if(marks.some((mark,index)=>index>0&&marks[index-1].assetId>=mark.assetId || after!==null&&mark.assetId<=after))failResponse();
    if(marks.some(mark=>mark.segmentId!==null&&!seen.has(mark.segmentId)))failResponse();
    if(page.nextAfter!==null&&page.nextAfter!==marks.at(-1)?.assetId)failResponse();
    return Object.freeze({workspaceId,projectId,version:page.version,segments:Object.freeze(segments),marks:Object.freeze(marks),nextAfter:page.nextAfter});
  }
  async getAssetMark({workspaceId,projectId,assetId,signal}={}){
    const result=await this.#request(`${scope({workspaceId,projectId,assetId})}/culling`,{signal});
    if(!own(result,['version','mark']))failResponse();
    try{version(result.version);}catch{failResponse();}
    return Object.freeze({version:result.version,mark:verifiedMark(result.mark,assetId)});
  }
  /** Collect transient metadata, then let Node Workspace atomically recheck it. Never a Final grant. */
  async preflightExportSelection({workspaceId,projectId,expectedCullingVersion,orderedAssetIds,signal}={}){
    const projectPath=scope({workspaceId,projectId});writableVersion(expectedCullingVersion);
    if(!Array.isArray(orderedAssetIds)||orderedAssetIds.length<1||orderedAssetIds.length>20||
       Reflect.ownKeys(orderedAssetIds).length!==orderedAssetIds.length+1||
       !Array.from({length:orderedAssetIds.length},(_,index)=>Object.hasOwn(orderedAssetIds,index)).every(Boolean)||
       orderedAssetIds.some(assetId=>{try{id(assetId);return false;}catch{return true;}})||
       new Set(orderedAssetIds.map(assetId=>assetId.toLowerCase())).size!==orderedAssetIds.length)
      throw Error('CULLING_PREFLIGHT_INPUT_INVALID');
    const listed=await this.#request(`${projectPath}/assets`,{signal});
    if(!own(listed,['assets','representation','proxyTransport'])||!Array.isArray(listed.assets)||
       listed.assets.length>10000||listed.representation!=='PROXY_METADATA_ONLY'||
       listed.proxyTransport!=='NOT_CONNECTED')failResponse();
    const assetById=new Map();
    for(const asset of listed.assets){
      if(typeof asset?.id!=='string'||!UUID.test(asset.id)||asset.tenantId!==workspaceId||
         typeof asset.sha256!=='string'||!SHA256.test(asset.sha256)||asset.deletedAt!==null||
         assetById.has(asset.id))failResponse();
      assetById.set(asset.id,asset);
    }
    const orderedAssets=[],expectedHeadIds=[];
    for(const assetId of orderedAssetIds){
      abort(signal);
      const asset=assetById.get(assetId);if(!asset)throw Error('CULLING_PREFLIGHT_ASSET_UNVERIFIED');
      const response=await this.#request(`${projectPath}/assets/${assetId}/recipe`,{signal});
      if(!own(response,['recipe'])||!response.recipe||typeof response.recipe!=='object'||
         response.recipe.assetId!==assetId||response.recipe.workspaceId!==workspaceId||
         response.recipe.projectId!==projectId||response.recipe.branch!==false||
         typeof response.recipe.id!=='string'||!UUID.test(response.recipe.id)||
         !Number.isSafeInteger(response.recipe.version)||response.recipe.version<1||
         response.recipe.version>=Number.MAX_SAFE_INTEGER)failResponse();
      orderedAssets.push({assetId,expectedOriginalSHA256:asset.sha256,
        expectedRecipeVersion:response.recipe.version});
      expectedHeadIds.push(response.recipe.id);
    }
    const result=await this.#request(`${projectPath}/culling/export-preflight`,{method:'POST',
      payload:{expectedCullingVersion,orderedAssets},signal});
    const preflight=result.preflight;
    if(!own(result,['preflight'])||!own(preflight,['workspaceId','projectId','cullingVersion','orderedAssets',
        'status','authoritativeForFinal'])||preflight.workspaceId!==workspaceId||
        preflight.projectId!==projectId||preflight.cullingVersion!==expectedCullingVersion||
        preflight.status!=='PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL'||preflight.authoritativeForFinal!==false||
        !Array.isArray(preflight.orderedAssets)||preflight.orderedAssets.length!==orderedAssets.length)
      failResponse();
    const checked=preflight.orderedAssets.map((item,index)=>{
      if(!own(item,['assetId','originalSHA256','recipeVersion','recipeVersionId'])||
         item.assetId!==orderedAssets[index].assetId||
         typeof item.originalSHA256!=='string'||!SHA256.test(item.originalSHA256)||
         item.originalSHA256.toLowerCase()!==orderedAssets[index].expectedOriginalSHA256.toLowerCase()||
         item.recipeVersion!==orderedAssets[index].expectedRecipeVersion||
         item.recipeVersionId!==expectedHeadIds[index])failResponse();
      return Object.freeze({assetId:item.assetId,originalSHA256:item.originalSHA256,
        recipeVersion:item.recipeVersion,recipeVersionId:item.recipeVersionId});
    });
    return Object.freeze({workspaceId,projectId,cullingVersion:expectedCullingVersion,
      orderedAssets:Object.freeze(checked),status:preflight.status,authoritativeForFinal:false});
  }
  async saveAssetMark({workspaceId,projectId,assetId,baseVersion,rating,flag,colorLabel,tags,segmentId,signal}={}){
    const path=scope({workspaceId,projectId,assetId});writableVersion(baseVersion);
    const fields=markFields({rating,flag,colorLabel,tags,segmentId});
    const result=await this.#request(`${path}/culling`,{method:'PUT',payload:{baseVersion,...fields},signal});
    if(!own(result,['culling'])||!own(result.culling,['version','mark'])||result.culling.version!==baseVersion+1)failResponse();
    const saved=verifiedMark(result.culling.mark,assetId);
    if(['rating','flag','colorLabel','tags','segmentId'].some(key=>JSON.stringify(saved[key])!==JSON.stringify(fields[key])))failResponse();
    return Object.freeze({version:result.culling.version,mark:saved});
  }
  async createSegment({workspaceId,projectId,baseVersion,id:segmentId,name,signal}={}){
    const path=scope({workspaceId,projectId});writableVersion(baseVersion);label(segmentId,128);label(name,120);
    const result=await this.#request(`${path}/culling/segments`,{method:'POST',payload:{baseVersion,id:segmentId,name},signal});
    if(!own(result,['culling'])||!own(result.culling,['version','segment'])||result.culling.version!==baseVersion+1)failResponse();
    const segment=verifiedSegment(result.culling.segment);if(segment.id!==segmentId||segment.name!==name)failResponse();
    return Object.freeze({version:result.culling.version,segment});
  }
  async renameSegment({workspaceId,projectId,segmentId,baseVersion,name,signal}={}){
    const path=scope({workspaceId,projectId});writableVersion(baseVersion);label(segmentId,128);label(name,120);
    const result=await this.#request(`${path}/culling/segments/${encodeURIComponent(segmentId)}`,{method:'PATCH',payload:{baseVersion,name},signal});
    if(!own(result,['culling'])||!own(result.culling,['version','segment'])||result.culling.version!==baseVersion+1)failResponse();
    const segment=verifiedSegment(result.culling.segment);if(segment.id!==segmentId||segment.name!==name)failResponse();
    return Object.freeze({version:result.culling.version,segment});
  }
  async reorderSegments({workspaceId,projectId,baseVersion,orderedIds,signal}={}){
    const path=scope({workspaceId,projectId});writableVersion(baseVersion);
    if(!Array.isArray(orderedIds)||orderedIds.length>1000||Object.keys(orderedIds).length!==orderedIds.length||
       orderedIds.some(item=>{try{label(item,128);return false;}catch{return true;}})||new Set(orderedIds).size!==orderedIds.length)
      throw Error('CULLING_INPUT_INVALID');
    const result=await this.#request(`${path}/culling/segments/order`,{method:'PUT',payload:{baseVersion,orderedIds},signal});
    if(!own(result,['culling'])||!own(result.culling,['version','segments'])||result.culling.version!==baseVersion+1||
       !Array.isArray(result.culling.segments)||result.culling.segments.length!==orderedIds.length)failResponse();
    const segments=result.culling.segments.map(verifiedSegment);
    if(segments.some((segment,index)=>segment.id!==orderedIds[index]))failResponse();
    return Object.freeze({version:result.culling.version,segments:Object.freeze(segments)});
  }
}
