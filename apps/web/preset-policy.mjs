import {validateRecipe} from '../../dist/apps/backend/src/photo-policy.js';
import {portablePresetRecipe,createSubmission,transitionSubmission} from './src/preset-author/preset-author-contract.mjs';
export {createSubmission,transitionSubmission};
export function recipeFromParameters(parameters){
  const {postDecodeAdjustments,...globals}=parameters;
  return {schemaVersion:1,parameters:{...globals,rotationDegrees:0,extendedParameters:postDecodeAdjustments===undefined?{}:{postDecodeAdjustments:structuredClone(postDecodeAdjustments)},processingOrder:['exposure','contrast','saturation',...(postDecodeAdjustments===undefined?[]:['postDecodeAdjustments']),'rotation']}};
}
export function portableParameters(recipe){
  validateRecipe(recipe);
  const order=recipe.parameters.processingOrder,ordered=['exposure','contrast','saturation','postDecodeAdjustments','rotation'];
  if(order.some((s,i)=>ordered.indexOf(s)<0||i>0&&ordered.indexOf(s)<=ordered.indexOf(order[i-1])))throw Error('NON_PORTABLE_PRESET');
  const p=portablePresetRecipe(recipe).parameters;
  return {exposure:p.exposure,contrast:p.contrast,saturation:p.saturation,...(p.extendedParameters.postDecodeAdjustments?{postDecodeAdjustments:p.extendedParameters.postDecodeAdjustments}:{})};
}
export function checkParameters(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('CORRUPT_PRESET_PARAMETERS');
  const keys=Object.keys(value).sort().join(',');
  if(keys!=='contrast,exposure,saturation'&&keys!=='contrast,exposure,postDecodeAdjustments,saturation')throw Error('CORRUPT_PRESET_PARAMETERS');
  return portableParameters(recipeFromParameters(value));
}
export function checkVersion(body,id,revision,authorID){
  const keys=['id','authorID','authorName','name','parameters','source','revision','createdAt','updatedAt'];
  if(!body||Object.keys(body).sort().join(',')!==keys.sort().join(',')||body.id!==id||body.revision!==revision||body.authorID!==authorID||typeof body.authorName!=='string'||!body.authorName.trim()||body.authorName.length>80||typeof body.name!=='string'||!body.name.trim()||body.name.length>120||!Number.isFinite(Date.parse(body.createdAt))||!Number.isFinite(Date.parse(body.updatedAt)))throw Error('CORRUPT_PRESET_VERSION');
  checkParameters(body.parameters);
  const s=body.source;if(!s||Object.keys(s).sort().join(',')!=='assetID,recipeRevision'||typeof s.assetID!=='string'||!Number.isSafeInteger(s.recipeRevision)||s.recipeRevision<1)throw Error('CORRUPT_PRESET_SOURCE');
  return body;
}
export function adoptionTransition(submitted,actor,decision){
  const submission=createSubmission({presetId:submitted.id,presetVersion:submitted.revision,authorUserId:submitted.authorID,authorCreditName:submitted.authorName,recipe:recipeFromParameters(submitted.parameters),now:submitted.createdAt});
  const options={actorUserId:actor.id,actorRole:'ADMIN',expectedPresetVersion:submitted.revision};
  if(decision==='REJECTED')return transitionSubmission(submission,{...options,to:'REJECTED'});
  const approved=transitionSubmission(submission,{...options,to:'APPROVED'});
  return transitionSubmission(approved,{...options,to:'PUBLISHED'});
}
