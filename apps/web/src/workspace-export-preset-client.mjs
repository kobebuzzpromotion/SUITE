import {WorkspaceSessionClient} from './workspace-session-client.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TENANT=/^[A-Za-z0-9_-]{1,128}$/u;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const own=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return (proto===null||Object.getPrototypeOf(proto)===null)&&
    Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
};
const abort=signal=>{if(signal?.aborted)throw new DOMException('Export Preset request cancelled','AbortError');};
const invalid=()=>{throw Error('WORKSPACE_EXPORT_PRESET_RESPONSE_INVALID');};
const positive=(value,max)=>Number.isSafeInteger(value)&&value>=1&&value<=max;
const validVersion=value=>positive(value,Number.MAX_SAFE_INTEGER-1);
const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw Error('WORKSPACE_EXPORT_PRESET_ID_INVALID');return value;};
function name(value){
  if(typeof value!=='string'||!value||value.length>120||value.trim()!==value||/[\u0000-\u001f\u007f\\/]/u.test(value))
    throw Error('WORKSPACE_EXPORT_PRESET_NAME_INVALID');
  return value;
}
function instant(value){return typeof value==='string'&&ISO.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
/** A typed snapshot of current SUITE export-only options, not Final application evidence. */
export function validateWorkspaceExportPresetSettings(value){
  if(!own(value,['format','size','resolution','outputSharpening'])||!['jpeg','png','tiff'].includes(value.format))
    throw Error('WORKSPACE_EXPORT_PRESET_SETTINGS_INVALID');
  let size;
  if(own(value.size,['kind'])&&value.size.kind==='original')size={kind:'original'};
  else if(own(value.size,['kind','value'])&&value.size.kind==='percentage'&&positive(value.size.value,100))
    size={kind:'percentage',value:value.size.value};
  else if(own(value.size,['kind','value'])&&['width','height','long-edge','short-edge'].includes(value.size.kind)&&positive(value.size.value,16384))
    size={kind:value.size.kind,value:value.size.value};
  else if(own(value.size,['kind','width','height'])&&['fit','dimensions'].includes(value.size.kind)&&
      positive(value.size.width,16384)&&positive(value.size.height,16384))
    size={kind:value.size.kind,width:value.size.width,height:value.size.height};
  else if(value.size?.kind==='exact-dimensions'&&positive(value.size.width,16384)&&positive(value.size.height,16384)&&
      ['pad','crop','stretch'].includes(value.size.strategy)&&
      own(value.size,value.size.strategy==='pad'?['kind','width','height','strategy','background']:['kind','width','height','strategy'])&&
      (value.size.strategy!=='pad'||['[255,255,255]','[128,128,128]','[0,0,0]'].includes(JSON.stringify(value.size.background))))
    size={kind:'exact-dimensions',width:value.size.width,height:value.size.height,strategy:value.size.strategy,
      ...(value.size.strategy==='pad'?{background:Object.freeze([...value.size.background])}:{})};
  else throw Error('WORKSPACE_EXPORT_PRESET_SETTINGS_INVALID');
  let resolution=null;
  if(value.resolution!==null){
    if(!own(value.resolution,['unit','value'])||!['ppi','ppc'].includes(value.resolution.unit)||
        !positive(value.resolution.value,65535))throw Error('WORKSPACE_EXPORT_PRESET_SETTINGS_INVALID');
    resolution={unit:value.resolution.unit,value:value.resolution.value};
  }
  let outputSharpening;
  if(own(value.outputSharpening,['kind'])&&value.outputSharpening.kind==='none')
    outputSharpening={kind:'none'};
  else if(own(value.outputSharpening,['kind','strength'])&&['screen','print'].includes(value.outputSharpening.kind)&&
      ['low','standard','high'].includes(value.outputSharpening.strength))
    outputSharpening={kind:value.outputSharpening.kind,strength:value.outputSharpening.strength};
  else if(own(value.outputSharpening,['kind','gain','radiusPx','thresholdLuma'])&&
      value.outputSharpening.kind==='manual'&&
      typeof value.outputSharpening.gain==='number'&&Number.isFinite(value.outputSharpening.gain)&&
      value.outputSharpening.gain>=0&&value.outputSharpening.gain<=2&&
      typeof value.outputSharpening.radiusPx==='number'&&Number.isFinite(value.outputSharpening.radiusPx)&&
      value.outputSharpening.radiusPx>=0.5&&value.outputSharpening.radiusPx<=3&&
      typeof value.outputSharpening.thresholdLuma==='number'&&Number.isFinite(value.outputSharpening.thresholdLuma)&&
      value.outputSharpening.thresholdLuma>=0&&value.outputSharpening.thresholdLuma<=64)
    outputSharpening={kind:'manual',gain:value.outputSharpening.gain,
      radiusPx:value.outputSharpening.radiusPx,thresholdLuma:value.outputSharpening.thresholdLuma};
  else throw Error('WORKSPACE_EXPORT_PRESET_SETTINGS_INVALID');
  return Object.freeze({format:value.format,size:Object.freeze(size),resolution:resolution&&Object.freeze(resolution),
    outputSharpening:Object.freeze(outputSharpening)});
}
function checkedPreset(value,workspaceId,subject){
  if(!own(value,['id','workspaceId','scope','ownerUserId','name','version','settings','createdAt','updatedAt'])||
      typeof value.id!=='string'||!UUID.test(value.id)||value.workspaceId!==workspaceId||
      !['PERSONAL','WORKSPACE'].includes(value.scope)||
      typeof value.ownerUserId!=='string'||!value.ownerUserId||value.ownerUserId.length>512||
      /[\u0000-\u001f\u007f]/u.test(value.ownerUserId)||
      value.scope==='PERSONAL'&&value.ownerUserId!==subject||!validVersion(value.version)||
      !instant(value.createdAt)||!instant(value.updatedAt)||value.updatedAt<value.createdAt)invalid();
  try{name(value.name);}catch{invalid();}
  let settings;try{settings=validateWorkspaceExportPresetSettings(value.settings);}catch{invalid();}
  return Object.freeze({id:value.id,workspaceId:value.workspaceId,scope:value.scope,
    ownerUserId:value.ownerUserId,name:value.name,version:value.version,settings,
    createdAt:value.createdAt,updatedAt:value.updatedAt});
}
function responseError(body,status){
  return typeof body?.error==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/u.test(body.error)?body.error:`HTTP_${status}`;
}
export class WorkspaceExportPresetHTTPError extends Error{
  constructor(status,code){super(code);this.name='WorkspaceExportPresetHTTPError';this.status=status;this.code=code;}
}

/** Node Workspace only. Neither tokens nor results are cached as Final authority. */
export class WorkspaceExportPresetClient{
  constructor({baseURL=globalThis.location?.origin,workspaceId,expectedSubject,expectedTenantId,
    tokenProvider,fetchImpl=globalThis.fetch}={}){
    const config=new WorkspaceSessionClient({baseURL,tokenProvider,fetchImpl});
    id(workspaceId);
    if(typeof expectedSubject!=='string'||!expectedSubject||expectedSubject.length>512||
        /[\u0000-\u001f\u007f]/u.test(expectedSubject)||
        typeof expectedTenantId!=='string'||!TENANT.test(expectedTenantId)||
        (globalThis.location?.origin&&config.baseURL!==globalThis.location.origin))
      throw Error('WORKSPACE_EXPORT_PRESET_CONFIG_INVALID');
    this.baseURL=config.baseURL;this.workspaceId=workspaceId;this.expectedSubject=expectedSubject;
    this.expectedTenantId=expectedTenantId;this.tokenProvider=tokenProvider;
    // Enforce the same origin for the gate and the action, even with an injected fetch.
    this.fetchImpl=async(url,options)=>{
      let requested;try{requested=new URL(url);}catch{throw Error('WORKSPACE_EXPORT_PRESET_ORIGIN_INVALID');}
      if(requested.origin!==config.baseURL)throw Error('WORKSPACE_EXPORT_PRESET_ORIGIN_INVALID');
      const response=await fetchImpl(url,options);
      if(response?.redirected===true||response?.status>=300&&response.status<400)
        throw Error('WORKSPACE_EXPORT_PRESET_REDIRECT_REJECTED');
      if(response?.url){
        let final;try{final=new URL(response.url);}catch{throw Error('WORKSPACE_EXPORT_PRESET_ORIGIN_INVALID');}
        if(final.origin!==config.baseURL)throw Error('WORKSPACE_EXPORT_PRESET_ORIGIN_INVALID');
      }
      return response;
    };
    Object.freeze(this);
  }
  async #request(suffix,{method='GET',body,signal}={}){
    abort(signal);
    let token;
    try{token=await this.tokenProvider({signal});}catch(error){
      if(signal?.aborted||error?.name==='AbortError')throw new DOMException('Export Preset request cancelled','AbortError');
      throw Error('WORKSPACE_EXPORT_PRESET_TOKEN_UNAVAILABLE');
    }
    abort(signal);
    if(typeof token!=='string'||!token||token.length>8192||/\s/u.test(token))throw Error('WORKSPACE_EXPORT_PRESET_TOKEN_INVALID');
    const gate=new WorkspaceSessionClient({baseURL:this.baseURL,tokenProvider:()=>token,fetchImpl:this.fetchImpl});
    await gate.getFreshSession({workspaceId:this.workspaceId,expectedSubject:this.expectedSubject,
      expectedTenantId:this.expectedTenantId,access:'edit',signal});
    abort(signal);
    const url=`${this.baseURL}/v1/workspaces/${this.workspaceId}${suffix}`;
    let response;
    try{response=await this.fetchImpl(url,{method,signal,credentials:'omit',cache:'no-store',
      redirect:'error',referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`,
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch(error){
      if(signal?.aborted||error?.name==='AbortError')throw new DOMException('Export Preset request cancelled','AbortError');
      throw Error('WORKSPACE_EXPORT_PRESET_REQUEST_FAILED');
    }
    abort(signal);
    if(!response||typeof response.ok!=='boolean'||!Number.isSafeInteger(response.status)||
        response.status<200||response.status>599||response.redirected===true)invalid();
    let result;
    try{result=await response.json();}catch(error){
      if(signal?.aborted||error?.name==='AbortError')throw new DOMException('Export Preset request cancelled','AbortError');
      if(response.ok)invalid();
    }
    abort(signal);
    if(!response.ok)throw new WorkspaceExportPresetHTTPError(response.status,responseError(result,response.status));
    if(response.status!==(method==='POST'?201:200))invalid();
    return result;
  }
  async listExportPresets({signal}={}){
    const body=await this.#request('/export-presets',{signal});
    if(!own(body,['presets'])||!Array.isArray(body.presets)||body.presets.length>1000)invalid();
    const seen=new Set();
    const presets=body.presets.map(value=>{
      const preset=checkedPreset(value,this.workspaceId,this.expectedSubject);
      if(seen.has(preset.id))invalid();seen.add(preset.id);return preset;
    });
    return Object.freeze({presets:Object.freeze(presets)});
  }
  async getExportPreset(presetId,{signal}={}){
    id(presetId);
    const body=await this.#request(`/export-presets/${presetId}`,{signal});
    if(!own(body,['preset']))invalid();
    const preset=checkedPreset(body.preset,this.workspaceId,this.expectedSubject);
    if(preset.id!==presetId)invalid();
    return Object.freeze({preset});
  }
  async createExportPreset({scope,name:presetName,settings,signal}={}){
    if(!['PERSONAL','WORKSPACE'].includes(scope))throw Error('WORKSPACE_EXPORT_PRESET_SCOPE_INVALID');
    const request={scope,name:name(presetName),settings:validateWorkspaceExportPresetSettings(settings)};
    const body=await this.#request('/export-presets',{method:'POST',body:request,signal});
    if(!own(body,['preset']))invalid();
    const preset=checkedPreset(body.preset,this.workspaceId,this.expectedSubject);
    if(preset.scope!==scope||preset.name!==request.name||preset.version!==1||
        preset.scope==='PERSONAL'&&preset.ownerUserId!==this.expectedSubject||
        JSON.stringify(preset.settings)!==JSON.stringify(request.settings))invalid();
    return Object.freeze({preset});
  }
  async updateExportPreset(presetId,{baseVersion,name:presetName,settings,signal}={}){
    id(presetId);if(!validVersion(baseVersion))throw Error('WORKSPACE_EXPORT_PRESET_VERSION_INVALID');
    const request={baseVersion,name:name(presetName),settings:validateWorkspaceExportPresetSettings(settings)};
    const body=await this.#request(`/export-presets/${presetId}`,{method:'PATCH',body:request,signal});
    if(!own(body,['preset']))invalid();
    const preset=checkedPreset(body.preset,this.workspaceId,this.expectedSubject);
    if(preset.id!==presetId||preset.version!==baseVersion+1||preset.name!==request.name||
        JSON.stringify(preset.settings)!==JSON.stringify(request.settings))invalid();
    return Object.freeze({preset});
  }
}
