import {BrowserLocalAPI} from './browser-local-api.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {checkAbort} from './processing/pure.mjs';
import {prepareBrowserLocalHandToneHistory,prepareBrowserLocalClothingSpotHistory,prepareBrowserLocalManualSourceHistory} from './browser-local-hand-tone-history.mjs';

const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
const canonical=value=>JSON.stringify(sort(value));
const excluded=['portrait','blushManual','contactsIrisManual','eyelinerManual','eyeshadowManual','faceDecorationsManual','bwEdgeManual','addShadowManual','originalShadowManual'];

/** Resolve a current draft's unchanged legacy manual document against actual
 * local saved history. Other current tonal edits are retained. This does not
 * certify the current HEAD or perform Save: host must independently maintain
 * its latest revision/CAS and pin API/current state inside guard(). */
export async function prepareBrowserLocalManualRuntime({api,recipe,expectedAsset,target,guard,signal}={}){
  if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||
      !['proxy','source'].includes(target)||typeof guard!=='function'||
      typeof api.databaseName!=='string'||!api.databaseName||api.databaseName.length>512)
    throw Error('LOCAL_MANUAL_RUNTIME_CONTRACT');
  expectedAsset=structuredClone(expectedAsset);
  const current=structuredClone(recipe);validateRecipe(current);
  const extra=current.parameters.extendedParameters,branches=['handToneManual','clothingSpotManual'].filter(key=>Object.hasOwn(extra,key));
  if(branches.length!==1||excluded.some(key=>Object.hasOwn(extra,key)))throw Error('LOCAL_MANUAL_RUNTIME_MIXED_OR_MISSING');
  const branch=branches[0],documentJSON=canonical(extra[branch]),databaseName=api.databaseName,factory=api.factory,crypto=api.crypto;
  const check=()=>{checkAbort(signal);guard();if(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.databaseName!==databaseName||api.factory!==factory||api.crypto!==crypto)throw Error('LOCAL_MANUAL_RUNTIME_SCOPE_CHANGED');};
  const read=async task=>{check();const result=await task();check();return result;};
  const rows=await read(()=>BrowserLocalAPI.prototype.getRecipeHistory.call(api,expectedAsset?.id,{signal}));
  if(!Array.isArray(rows))throw Error('LOCAL_MANUAL_RUNTIME_HISTORY_INVALID');
  // Latest matching document is deterministic, but its revision is evidence of
  // that saved row only: it is never relabelled as the host's current revision.
  const candidates=rows.filter(row=>row?.branch!==true&&Number.isSafeInteger(row?.revision)&&row.revision>0&&
    row.body?.parameters?.extendedParameters&&Object.hasOwn(row.body.parameters.extendedParameters,branch)&&
    canonical(row.body.parameters.extendedParameters[branch])===documentJSON&&
    !excluded.some(key=>Object.hasOwn(row.body.parameters.extendedParameters,key))&&
    !Object.hasOwn(row.body.parameters.extendedParameters,branch==='handToneManual'?'clothingSpotManual':'handToneManual'));
  candidates.sort((a,b)=>b.revision-a.revision);
  if(!candidates.length)throw Error('LOCAL_MANUAL_RUNTIME_DOCUMENT_NOT_SAVED');
  const selected=candidates[0];validateRecipe(selected.body);
  const digest=await read(()=>globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(selected.body))));
  const bodySHA256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  const options={api,selection:{assetId:expectedAsset.id,revision:selected.revision,bodySHA256},expectedAsset,guard:check,signal};
  const prepared=target==='source'?await prepareBrowserLocalManualSourceHistory(options,branch):
    await (branch==='handToneManual'?prepareBrowserLocalHandToneHistory:prepareBrowserLocalClothingSpotHistory)(options);
  check();
  // Only after verified rendering remove the one consumed branch, from the
  // CURRENT draft copy, not from the historic row with obsolete tonal edits.
  const renderRecipe=structuredClone(current);delete renderRecipe.parameters.extendedParameters[branch];
  const recheck=async()=>{check();await prepared.recheck();check();};
  await recheck();
  return {pixels:prepared.pixels,recipe:renderRecipe,recheck};
}
