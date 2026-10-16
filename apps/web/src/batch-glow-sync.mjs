import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding} from '../../../dist/apps/backend/src/portrait-recipe.js';

const clone=value=>structuredClone(value);
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const revisionOf=stored=>stored?.revision??stored?.version;
const STAGE='postDecodeAdjustments';

function selected(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Reflect.ownKeys(value).some(key=>typeof key!=='string'||!['id','sha256','revision'].includes(key))||
      typeof value.id!=='string'||!value.id||value.id.trim()!==value.id||
      typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(value.sha256)||
      !Number.isSafeInteger(value.revision)||value.revision<1)
    throw Error('GLOW_SYNC_SELECTION_INVALID');
  return Object.freeze({id:value.id,sha256:value.sha256.toLowerCase(),revision:value.revision});
}
function assetMatches(assets,identity){
  if(!Array.isArray(assets))throw Error('GLOW_SYNC_ASSET_LIST_INVALID');
  const matches=assets.filter(asset=>asset?.id===identity.id);
  if(matches.length!==1||matches[0].deletedAt!=null)throw Error('GLOW_SYNC_ASSET_UNAVAILABLE');
  if(typeof matches[0].sha256!=='string'||matches[0].sha256.toLowerCase()!==identity.sha256)
    throw Error('GLOW_SYNC_ORIGINAL_CHANGED');
}
function checkedStored(stored,identity){
  if(!stored||stored.branch===true||revisionOf(stored)!==identity.revision||
      (stored.assetId!==undefined&&stored.assetId!==identity.id)||!stored.body)
    throw Error('GLOW_SYNC_REVISION_CONFLICT');
  validateRecipe(stored.body);
  const portrait=stored.body.parameters.extendedParameters?.portrait;
  if(portrait!==undefined)validatePortraitBinding(portrait,identity.id,identity.sha256);
  return stored.body;
}
function authorized(value){if(value?.authorized!==true)throw Error('GLOW_SYNC_PERMISSION_DENIED');}

/** Copy Glow only. The target's other color, detail, geometry, person and asset-bound data stay put. */
export function mergeSavedGlow(sourceRecipe,targetRecipe){
  validateRecipe(sourceRecipe);validateRecipe(targetRecipe);
  const result=clone(targetRecipe);
  const sourceGlow=sourceRecipe.parameters.extendedParameters?.postDecodeAdjustments?.color?.glow;
  const params=result.parameters,extra=params.extendedParameters;
  let adjustments=extra.postDecodeAdjustments;
  if(sourceGlow!==undefined){
    if(!adjustments)adjustments={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1'};
    adjustments.color??={};adjustments.color.glow=clone(sourceGlow);
    extra.postDecodeAdjustments=adjustments;
    if(!params.processingOrder.includes(STAGE)){
      const at=params.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
      params.processingOrder.splice(at<0?params.processingOrder.length:at,0,STAGE);
    }
  }else if(adjustments?.color?.glow!==undefined){
    delete adjustments.color.glow;
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!adjustments.color&&!adjustments.detail){
      delete extra.postDecodeAdjustments;
      params.processingOrder=params.processingOrder.filter(stage=>stage!==STAGE);
    }
  }
  validateRecipe(result);return result;
}

/** Per-target authenticated CAS. A write with uncertain reply is never reported successful. */
export async function applyBatchGlowSync({api,source,targets,expectedSourceRecipe,preflightTarget}={}){
  for(const method of ['listAssets','getRecipe','assertPermission','saveRecipe'])
    if(typeof api?.[method]!=='function')throw Error('GLOW_SYNC_ADAPTER_REQUIRED');
  const fixedSource=selected(source);
  if(!Array.isArray(targets)||targets.length<2||targets.length>20)
    throw Error('GLOW_SYNC_TWO_TARGETS_REQUIRED');
  const fixedTargets=targets.map(selected);
  if(new Set(fixedTargets.map(value=>value.id)).size!==fixedTargets.length||
      fixedTargets.some(value=>value.id===fixedSource.id))throw Error('GLOW_SYNC_SELECTION_INVALID');
  if(preflightTarget!==undefined&&typeof preflightTarget!=='function')
    throw Error('GLOW_SYNC_PREFLIGHT_INVALID');
  assetMatches(await api.listAssets(),fixedSource);
  authorized(await api.assertPermission(fixedSource.id,'edit'));
  const sourceBody=clone(checkedStored(await api.getRecipe(fixedSource.id),fixedSource));
  if(expectedSourceRecipe!==undefined&&!equal(sourceBody,expectedSourceRecipe))
    throw Error('GLOW_SYNC_SOURCE_RECIPE_CHANGED');
  const results=[];
  for(const target of fixedTargets){
    let attempted=false;
    try{
      assetMatches(await api.listAssets(),fixedSource);
      if(!equal(checkedStored(await api.getRecipe(fixedSource.id),fixedSource),sourceBody))
        throw Error('GLOW_SYNC_SOURCE_RECIPE_CHANGED');
      assetMatches(await api.listAssets(),target);
      authorized(await api.assertPermission(target.id,'edit'));
      if(preflightTarget)await preflightTarget(target);
      const targetBody=checkedStored(await api.getRecipe(target.id),target);
      const merged=mergeSavedGlow(sourceBody,targetBody);
      authorized(await api.assertPermission(target.id,'edit'));
      assetMatches(await api.listAssets(),target);
      attempted=true;
      const response=await api.saveRecipe(target.id,target.revision,merged);
      if(response?.outcome==='conflict'){
        results.push({assetId:target.id,status:'conflict',reason:'GLOW_SYNC_REVISION_CONFLICT'});
        continue;
      }
      const saved=response?.outcome==='saved'?response.version:response;
      if(response?.outcome!==undefined&&response.outcome!=='saved')throw Error('GLOW_SYNC_SAVE_MISMATCH');
      if(revisionOf(saved)!==target.revision+1||
          (saved?.assetId!==undefined&&saved.assetId!==target.id)||!equal(saved?.body,merged))
        throw Error('GLOW_SYNC_SAVE_MISMATCH');
      assetMatches(await api.listAssets(),target);
      const verified=await api.getRecipe(target.id);
      if(revisionOf(verified)!==target.revision+1||
          (verified?.assetId!==undefined&&verified.assetId!==target.id)||!equal(verified?.body,merged))
        throw Error('GLOW_SYNC_POSTSAVE_MISMATCH');
      checkedStored(verified,{...target,revision:target.revision+1});
      assetMatches(await api.listAssets(),fixedSource);
      if(!equal(checkedStored(await api.getRecipe(fixedSource.id),fixedSource),sourceBody))
        throw Error('GLOW_SYNC_SOURCE_RECIPE_CHANGED');
      results.push({assetId:target.id,status:'saved',revision:target.revision+1});
    }catch(error){
      results.push({assetId:target.id,status:attempted?'unverified':'failed',
        reason:error?.message||'GLOW_SYNC_TARGET_FAILED'});
    }
  }
  const saved=results.filter(row=>row.status==='saved').length;
  return Object.freeze({status:saved===results.length?'complete':saved?'partial':'failed',
    source:fixedSource,saved,notSaved:results.length-saved,results});
}
