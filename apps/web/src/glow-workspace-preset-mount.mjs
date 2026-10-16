import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspacePresetClient} from './workspace-preset-client.mjs';
import {createPresetFacade} from './preset-facade.mjs';
import {mergeSavedGlow} from './batch-glow-sync.mjs';
import {validateGlow} from './processing/glow.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const own=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const abort=signal=>{if(signal?.aborted)throw new DOMException('Glow Preset cancelled','AbortError');};
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,
  rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const glowOf=body=>body?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.glow;
function checkedGlow(body){
  validateRecipe(body);
  const raw=glowOf(body);
  if(!raw||!['whiteMist','blackMist','halation'].includes(raw.mode))
    throw Error('GLOW_PRESET_EXPLICIT_MODE_REQUIRED');
  const valid=validateGlow(raw);
  return {mode:valid.mode,intensity:valid.intensity,radius:valid.radius,
    threshold:valid.threshold,exposure:valid.exposure,diffusion:valid.diffusion,tint:valid.tint};
}
function checkedFullGlow(body){
  validateRecipe(body);
  const raw=glowOf(body);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw Error('GLOW_PRESET_SETTINGS_REQUIRED');
  // Legacy three-control Glow has no explicit mode. Full preserves it verbatim;
  // Glow-only still requires the newer explicit-mode snapshot.
  validateGlow(raw);
  return raw;
}
function glowOnly(body){
  const glow=checkedGlow(body);
  const result=neutral();
  result.parameters.extendedParameters.postDecodeAdjustments={schemaVersion:1,
    engineVersion:'suite-srgb8-color-detail-1',color:{glow}};
  result.parameters.processingOrder.splice(3,0,'postDecodeAdjustments');
  validateRecipe(result);return result;
}

/**
 * Host-injected Node Workspace boundary. The shipped Trial/Cloud Editor has no
 * OIDC host, so this module deliberately does not mount there automatically.
 * The separately versioned Glow-only route merges into the target Recipe;
 * the legacy full-Recipe Workspace Preset route remains untouched.
 */
export function mountGlowWorkspacePreset({container,baseURL,workspaceId,projectId,
  expectedSubject,expectedTenantId,tokenProvider,selectionProvider,
  fetchImpl=globalThis.fetch,documentRef=globalThis.document}={}){
  if(!container||typeof container.replaceChildren!=='function'||
      !documentRef||typeof documentRef.createElement!=='function'||
      [workspaceId,projectId].some(value=>typeof value!=='string'||!UUID.test(value))||
      typeof tokenProvider!=='function'||typeof selectionProvider!=='function')
    throw Error('GLOW_PRESET_MOUNT_CONFIG_INVALID');
  const sessionClient=new WorkspaceSessionClient({baseURL,tokenProvider,fetchImpl});
  let disposed=false;
  async function selected(){
    if(disposed)throw Error('GLOW_PRESET_MOUNT_DISPOSED');
    let value;
    try{value=await selectionProvider();}catch{throw Error('GLOW_PRESET_SELECTION_UNAVAILABLE');}
    if(!own(value,['workspaceId','projectId','assetId'])||
        value.workspaceId!==workspaceId||value.projectId!==projectId||
        typeof value.assetId!=='string'||!UUID.test(value.assetId))
      throw Error('GLOW_PRESET_SELECTION_CHANGED');
    return value.assetId;
  }
  const scopedTokenProvider=async({signal}={})=>{
    abort(signal);await selected();
    const token=await tokenProvider({signal});abort(signal);
    await selected();return token;
  };
  const workspace=new WorkspacePresetClient({baseURL,workspaceId,expectedSubject,
    expectedTenantId,tokenProvider:scopedTokenProvider,fetchImpl});
  const facade=createPresetFacade({workspace});
  const origin=sessionClient.baseURL;
  function checkScope(kind,mode){
    if(!['PERSONAL','WORKSPACE'].includes(kind))throw Error('GLOW_PRESET_SCOPE_INVALID');
    if(!['full','glow-only'].includes(mode))throw Error('GLOW_PRESET_MODE_INVALID');
  }
  function normalized(preset,mode){
    checkedFullGlow(preset.recipe);
    let pure=false;
    try{pure=same(glowOnly(preset.recipe),preset.recipe);}catch{/* Legacy sparse Full remains valid. */}
    if(mode==='glow-only'&&!pure)throw Error('GLOW_PRESET_NOT_PURE');
    return Object.freeze({...preset,mode:pure?'glow-only':'full'});
  }
  async function scopedGet(path,assetId,{signal}={}){
    abort(signal);
    if(await selected()!==assetId)throw Error('GLOW_PRESET_SELECTION_CHANGED');
    const token=await scopedTokenProvider({signal});
    const gate=new WorkspaceSessionClient({baseURL:origin,tokenProvider:()=>token,fetchImpl});
    await gate.getFreshSession({workspaceId,expectedSubject,expectedTenantId,access:'edit',signal});
    abort(signal);
    const response=await fetchImpl(`${origin}/v1/workspaces/${workspaceId}/projects/${projectId}${path}`,
      {method:'GET',signal,credentials:'omit',cache:'no-store',redirect:'error',
        referrerPolicy:'no-referrer',headers:{Authorization:`Bearer ${token}`}});
    abort(signal);
    if(!response?.ok||response.redirected===true)throw Error('GLOW_PRESET_ASSET_UNAVAILABLE');
    const body=await response.json();abort(signal);
    if(await selected()!==assetId)throw Error('GLOW_PRESET_SELECTION_CHANGED');
    return body;
  }
  async function fixedAsset({signal}={}){
    const assetId=await selected();
    const list=await scopedGet('/assets',assetId,{signal});
    if(!Array.isArray(list?.assets))throw Error('GLOW_PRESET_ASSET_RESPONSE_INVALID');
    const matches=list.assets.filter(item=>item?.id===assetId);
    if(matches.length!==1||matches[0].deletedAt!=null||
        typeof matches[0].sha256!=='string'||!SHA.test(matches[0].sha256))
      throw Error('GLOW_PRESET_ASSET_UNAVAILABLE');
    const result=await scopedGet(`/assets/${assetId}/recipe`,assetId,{signal});
    const stored=result?.recipe;
    if(!stored||stored.assetId!==assetId||stored.projectId!==projectId||
        stored.workspaceId!==workspaceId||stored.branch!==false||!Number.isSafeInteger(stored.version)||
        stored.version<1||!stored.body)throw Error('GLOW_PRESET_SAVED_RECIPE_REQUIRED');
    validateRecipe(stored.body);
    return {assetId,sha256:matches[0].sha256.toLowerCase(),version:stored.version,
      body:structuredClone(stored.body)};
  }
  async function save({kind,name,mode='glow-only',signal}={}){
    checkScope(kind,mode);abort(signal);
    const before=await fixedAsset({signal});
    const body=mode==='glow-only'?glowOnly(before.body):before.body;
    if(mode==='full')checkedFullGlow(body);
    const preset=await facade.save({kind,name,recipe:body});abort(signal);
    const after=await fixedAsset({signal});
    if(after.assetId!==before.assetId||after.sha256!==before.sha256||
        after.version!==before.version||!same(after.body,before.body))
      throw Error('GLOW_PRESET_SAVE_UNVERIFIED');
    const reloaded=await reload({kind,mode,id:preset.id,signal});
    if(reloaded.version!==preset.version||!same(reloaded.recipe,body))
      throw Error('GLOW_PRESET_SAVE_UNVERIFIED');
    return reloaded;
  }
  async function reload({kind,mode='glow-only',id,signal}={}){
    abort(signal);await selected();
    checkScope(kind,mode);
    const preset=await facade.reload({kind,id});
    await selected();abort(signal);return normalized(preset,mode);
  }
  async function list({kind,mode='glow-only',signal}={}){
    abort(signal);await selected();
    checkScope(kind,mode);
    const rows=await facade.list({kind});
    await selected();abort(signal);
    return rows.flatMap(item=>{try{return [normalized(item,mode)];}catch{return [];}});
  }
  async function apply({kind,mode='glow-only',id,version,signal}={}){
    checkScope(kind,mode);
    const before=await fixedAsset({signal});
    const preset=await reload({kind,mode,id,signal});
    if(preset.version!==version)throw Error('GLOW_PRESET_VERSION_CONFLICT');
    const expected=mode==='glow-only'?mergeSavedGlow(preset.recipe,before.body):preset.recipe;
    const options={presetId:id,
      expectedPresetVersion:version,projectId,assetId:before.assetId,
      baseVersion:before.version,expectedOriginalSHA256:before.sha256,signal};
    const result=mode==='glow-only'?await workspace.applyGlowPresetVersioned(options):
      await workspace.applyPresetVersioned(options);
    const after=await fixedAsset({signal});
    if(after.assetId!==before.assetId||after.sha256!==before.sha256||
        after.version!==before.version+1||!same(after.body,expected)||
        result.version?.version!==after.version||result.version?.branch!==false)
      throw Error('GLOW_PRESET_APPLY_UNVERIFIED');
    return Object.freeze({outcome:'saved',mode,preset,version:after.version,recipe:after.body,
      assetId:after.assetId,sha256:after.sha256});
  }
  const panel=documentRef.createElement('section');panel.className='glow-workspace-preset';
  panel.innerHTML='<h3>Glow Preset · Node Workspace</h3><label>保存先<select data-glow-preset-scope><option value="PERSONAL">Personal</option><option value="WORKSPACE">Workspace</option></select></label><label>適用方式<select data-glow-preset-mode><option value="glow-only">Glowのみ（他の調整を保持）</option><option value="full">Preset全体（既存調整を置換）</option></select></label><label>名前<input data-glow-preset-name maxlength="120" autocomplete="off"></label><button type="button" data-glow-preset-save>保存済み写真からPreset作成</button><button type="button" data-glow-preset-refresh>Presetを再取得</button><label>適用するPreset<select data-glow-preset-list></select></label><button type="button" data-glow-preset-apply>選んだPresetを保存済み写真へ適用</button><p role="status" aria-live="polite" data-glow-preset-status>本人Workspace接続待ち</p>';
  container.replaceChildren(panel);
  const scope=panel.querySelector('[data-glow-preset-scope]');
  const mode=panel.querySelector('[data-glow-preset-mode]');
  const name=panel.querySelector('[data-glow-preset-name]');
  const options=panel.querySelector('[data-glow-preset-list]');
  const status=panel.querySelector('[data-glow-preset-status]');
  let pending=false,items=[];
  async function action(callback){
    if(pending||disposed)return;
    pending=true;for(const button of panel.querySelectorAll('button'))button.disabled=true;
    status.textContent='確認中…';
    try{status.textContent=await callback();}
    catch(error){status.textContent=error?.message||'GLOW_PRESET_OPERATION_FAILED';}
    finally{pending=false;if(!disposed)for(const button of panel.querySelectorAll('button'))button.disabled=false;}
  }
  const controller=new AbortController();
  panel.querySelector('[data-glow-preset-save]').addEventListener('click',()=>void action(async()=>{
    const preset=await save({kind:scope.value,mode:mode.value,name:name.value,signal:controller.signal});
    items=await list({kind:scope.value,mode:mode.value,signal:controller.signal});renderOptions();
    options.value=preset.id;return `保存確認済み · version ${preset.version}`;
  }),{signal:controller.signal});
  panel.querySelector('[data-glow-preset-refresh]').addEventListener('click',()=>void action(async()=>{
    items=await list({kind:scope.value,mode:mode.value,signal:controller.signal});renderOptions();return `${items.length} 件を再取得`;
  }),{signal:controller.signal});
  panel.querySelector('[data-glow-preset-apply]').addEventListener('click',()=>void action(async()=>{
    const chosen=items.find(item=>item.id===options.value&&item.kind===scope.value);
    if(!chosen)throw Error('GLOW_PRESET_SELECTION_REQUIRED');
    const result=await apply({kind:chosen.kind,mode:mode.value,id:chosen.id,version:chosen.version,
      signal:controller.signal});
    return `適用・保存確認済み · Recipe version ${result.version}`;
  }),{signal:controller.signal});
  scope.addEventListener('change',()=>{items=[];renderOptions();status.textContent='保存先を変更しました。再取得してください。';},
    {signal:controller.signal});
  mode.addEventListener('change',()=>{items=[];renderOptions();status.textContent='適用方式を変更しました。再取得してください。';},
    {signal:controller.signal});
  function renderOptions(){options.replaceChildren();for(const item of items){
    const option=documentRef.createElement('option');option.value=item.id;
    option.textContent=`${item.name} · version ${item.version}`;options.append(option);
  }}
  return Object.freeze({save,reload,list,apply,dispose(){if(disposed)return;disposed=true;
    controller.abort();container.replaceChildren();}});
}
