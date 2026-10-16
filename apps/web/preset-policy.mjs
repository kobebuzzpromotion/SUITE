import {validateRecipe} from '../../dist/apps/backend/src/photo-policy.js';
import {portablePresetRecipe,createSubmission,transitionSubmission} from './src/preset-author/preset-author-contract.mjs';
export {createSubmission,transitionSubmission};
function exactParameterKeys(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('CORRUPT_PRESET_PARAMETERS');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&!(Object.getPrototypeOf(prototype)===null&&
    Object.hasOwn(prototype,'constructor')&&prototype.constructor?.name==='Object'))throw Error('CORRUPT_PRESET_PARAMETERS');
  const ownKeys=Reflect.ownKeys(value);
  if(ownKeys.some(key=>typeof key!=='string'))throw Error('CORRUPT_PRESET_PARAMETERS');
  const allowed=['exposure','contrast','saturation','postDecodeAdjustments','postCropAdjustments','personalLook'];
  if(['exposure','contrast','saturation'].some(key=>!Object.hasOwn(value,key))||ownKeys.some(key=>!allowed.includes(key)))
    throw Error('CORRUPT_PRESET_PARAMETERS');
  for(const key of ownKeys){const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('CORRUPT_PRESET_PARAMETERS');}
}
export function recipeFromParameters(parameters){
  exactParameterKeys(parameters);
  const {postDecodeAdjustments,postCropAdjustments,personalLook,...globals}=parameters;
  const draft={schemaVersion:1,parameters:{...globals,rotationDegrees:0,extendedParameters:{
    ...(postDecodeAdjustments===undefined?{}:{postDecodeAdjustments}),
    ...(postCropAdjustments===undefined?{}:{postCropAdjustments}),
    ...(Object.hasOwn(parameters,'personalLook')?{personalLook}:{})},
    processingOrder:['exposure','contrast','saturation',...(postDecodeAdjustments===undefined?[]:['postDecodeAdjustments']),'rotation']}};
  // Validate before copying so class instances and unknown nested keys are not
  // laundered into acceptable plain data by structuredClone.
  const verified=portablePresetRecipe(draft);
  return {...draft,parameters:{...draft.parameters,extendedParameters:verified.parameters.extendedParameters}};
}
export function portableParameters(recipe){
  validateRecipe(recipe);
  const order=recipe.parameters.processingOrder,ordered=['exposure','contrast','saturation','postDecodeAdjustments','rotation'];
  if(order.some((s,i)=>ordered.indexOf(s)<0||i>0&&ordered.indexOf(s)<=ordered.indexOf(order[i-1])))throw Error('NON_PORTABLE_PRESET');
  const p=portablePresetRecipe(recipe).parameters;
  return {exposure:p.exposure,contrast:p.contrast,saturation:p.saturation,
    ...(p.extendedParameters.postDecodeAdjustments?{postDecodeAdjustments:p.extendedParameters.postDecodeAdjustments}:{}),
    ...(p.extendedParameters.postCropAdjustments?{postCropAdjustments:p.extendedParameters.postCropAdjustments}:{}),
    ...(Object.hasOwn(p.extendedParameters,'personalLook')?{personalLook:p.extendedParameters.personalLook}:{})};
}
export function checkParameters(value){
  exactParameterKeys(value);
  return portableParameters(recipeFromParameters(value));
}
export function checkVersion(body,id,revision,authorID){
  const keys=['id','authorID','authorName','name','parameters','source','revision','createdAt','updatedAt'];
  if(!body||typeof body!=='object'||Reflect.ownKeys(body).some(key=>typeof key!=='string')||Reflect.ownKeys(body).sort().join(',')!==keys.sort().join(',')||body.id!==id||body.revision!==revision||body.authorID!==authorID||typeof body.authorName!=='string'||!body.authorName.trim()||body.authorName.length>80||typeof body.name!=='string'||!body.name.trim()||body.name.length>120||!Number.isFinite(Date.parse(body.createdAt))||!Number.isFinite(Date.parse(body.updatedAt)))throw Error('CORRUPT_PRESET_VERSION');
  checkParameters(body.parameters);
  const s=body.source;if(!s||typeof s!=='object'||Reflect.ownKeys(s).some(key=>typeof key!=='string')||Reflect.ownKeys(s).sort().join(',')!=='assetID,recipeRevision'||typeof s.assetID!=='string'||!Number.isSafeInteger(s.recipeRevision)||s.recipeRevision<1)throw Error('CORRUPT_PRESET_SOURCE');
  return body;
}
export function adoptionTransition(submitted,actor,decision){
  const submission=createSubmission({presetId:submitted.id,presetVersion:submitted.revision,authorUserId:submitted.authorID,authorCreditName:submitted.authorName,recipe:recipeFromParameters(submitted.parameters),now:submitted.createdAt});
  const options={actorUserId:actor.id,actorRole:'ADMIN',expectedPresetVersion:submitted.revision};
  if(decision==='REJECTED')return transitionSubmission(submission,{...options,to:'REJECTED'});
  const approved=transitionSubmission(submission,{...options,to:'APPROVED'});
  return transitionSubmission(approved,{...options,to:'PUBLISHED'});
}
