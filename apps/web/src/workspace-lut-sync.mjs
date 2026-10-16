import {loadSyncedPresetAssets} from './delta66-preset-assets.mjs';

// This adapter is supplied by the authenticated host, never a URL form or local
// account picker. Integrity checks below cannot establish manifest authority.
const METHODS=['getContext','subscribe','listLUTs','getLUTManifest'];
export function workspaceLUTAvailability(host){
  if(!host||METHODS.some(key=>typeof host[key]!=='function'))return {available:false,reason:'実認証済みのLUT資産接続が未設定です。ローカルLUTは利用できます。'};
  try{contextKey(host);return {available:true,reason:''};}catch{return {available:false,reason:'LUT同期にはWorkspaceへのログインが必要です。'};}
}
function contextKey(host){
  const context=host.getContext();
  if(!context||['principalID','workspaceID','sessionID'].some(key=>typeof context[key]!=='string'||!context[key].trim()))throw Error('WORKSPACE_LUT_AUTH_REQUIRED');
  return JSON.stringify([context.principalID,context.workspaceID,context.sessionID]);
}
function cancelled(){return new DOMException('Workspace LUT cancelled','AbortError');}
export function createWorkspaceLUTSync({host,session}={}){
  if(!host||METHODS.some(key=>typeof host[key]!=='function')||typeof session?.subscribe!=='function'||typeof session.applyLocalLUTPreset!=='function')throw Error('WORKSPACE_LUT_CONFIG');
  let active=null,disposed=false,applying=false,applyIdentity=null,expectedRecipe=null;
  const stop=()=>{active?.abort();};
  // Authentication changes invalidate work even when a user logs back into the
  // same account; sessionID must identify the login session, not merely a user.
  const offHost=host.subscribe(stop);
  let observed;
  const stateKey=()=>JSON.stringify([session.state?.asset?.id,session.state?.asset?.sha256,session.state?.revision,session.state?.recipe]);
  const photoKey=()=>JSON.stringify([session.state?.asset?.id,session.state?.asset?.sha256,session.state?.revision]);
  const offSession=session.subscribe(()=>{const next=stateKey();if(observed!==undefined&&next!==observed&&(!applying||photoKey()!==applyIdentity||JSON.stringify(session.state?.recipe)!==expectedRecipe))stop();observed=next;});
  async function run(action,signal){
    if(disposed)throw cancelled();if(active)throw Error('WORKSPACE_LUT_BUSY');
    const identity=contextKey(host),photo=stateKey();const controller=new AbortController();active=controller;
    const forward=()=>controller.abort();signal?.addEventListener('abort',forward,{once:true});if(signal?.aborted)forward();
    const guard=()=>{if(disposed||controller.signal.aborted||contextKey(host)!==identity||stateKey()!==photo)throw cancelled();};
    try{guard();return await action({signal:controller.signal,guard});}
    finally{signal?.removeEventListener('abort',forward);if(active===controller){active=null;applying=false;applyIdentity=null;expectedRecipe=null;}}
  }
  return Object.freeze({
    availability:()=>workspaceLUTAvailability(host),
    async list({signal}={}){return run(async({signal,guard})=>{
      const rows=await host.listLUTs({signal});guard();
      if(!Array.isArray(rows)||rows.length>1000)throw Error('WORKSPACE_LUT_LIST_INVALID');
      const ids=new Set();return rows.map(row=>{
        if(!row||typeof row.id!=='string'||!row.id||row.id.length>256||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>256)throw Error('WORKSPACE_LUT_LIST_INVALID');
        ids.add(row.id);return {id:row.id,name:row.name};
      });
    },signal);},
    async apply(id,{intensity=1,signal}={}){return run(async({signal,guard})=>{
      if(typeof id!=='string'||!id||id.length>256||!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('WORKSPACE_LUT_SELECTION_INVALID');
      const state=session.state;if(!state?.asset||!state.recipe||state.busy||state.exporting)throw Error('WORKSPACE_LUT_PHOTO_REQUIRED');
      const parameters=Object.fromEntries(['exposure','contrast','saturation'].map(key=>[key,state.recipe.parameters[key]]));
      const authority=await host.getLUTManifest(id,{signal});guard();
      // Only this explicitly selected CUBE is downloaded. No whole-library sync,
      // automatic upload, or inference of third-party redistribution permission.
      if(!authority||authority.assetID!==id||!Array.isArray(authority.manifest)||authority.manifest.length!==1||authority.manifest[0]?.id!==id||authority.manifest[0]?.kind!=='cube3d')throw Error('WORKSPACE_LUT_MANIFEST_INVALID');
      const result=await loadSyncedPresetAssets(authority.manifest,{allowedOrigins:authority.allowedOrigins,signal});guard();
      const asset=result[0];const profile={kind:'local-lut',intensity,lutRef:{sha256:asset.sha256,byteLength:asset.bytes.byteLength}};
      // This existing Session entry persists verified bytes, checks photo/revision
      // again after persistence and rolls back a cancelled Recipe application.
      // Cancellation can leave unreferenced bytes locally; do not delete them as
      // another saved Recipe may share the same content-addressed LUT.
      const expected=structuredClone(state.recipe),extra=expected.parameters.extendedParameters;
      const previous=extra.postDecodeAdjustments?.color?.profile;
      extra.postDecodeAdjustments??={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}};
      extra.postDecodeAdjustments.color??={};extra.postDecodeAdjustments.color.profile=profile;
      if(previous?.kind!=='local-lut'||previous.lutRef?.sha256!==profile.lutRef.sha256||previous.lutRef?.byteLength!==profile.lutRef.byteLength)delete extra.localLUTMask;
      const stages=['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'];
      expected.parameters.processingOrder=stages.filter(stage=>['exposure','contrast','saturation','postDecodeAdjustments'].includes(stage)||expected.parameters.processingOrder.includes(stage));
      applying=true;applyIdentity=photoKey();expectedRecipe=JSON.stringify(expected);
      return session.applyLocalLUTPreset({parameters,profile,bytes:asset.bytes},{signal});
    },signal);},
    cancel:stop,
    dispose(){disposed=true;stop();if(typeof offHost==='function')offHost();if(typeof offSession==='function')offSession();}
  });
}
