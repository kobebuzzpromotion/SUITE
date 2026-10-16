import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {checkParameters} from '../preset-policy.mjs';
import {validateGlow} from './processing/glow.mjs';

const STAGE='postDecodeAdjustments';

/** Merge only the published portable Glow payload; keep every target-bound field. */
export function mergeAuthorGlowOnly(recipe,portableParameters){
  validateRecipe(recipe);
  const safe=checkParameters(portableParameters);
  const glow=safe.postDecodeAdjustments?.color?.glow;
  if(!glow||!Object.hasOwn(glow,'mode'))throw Error('AUTHOR_GLOW_PRESET_REQUIRED');
  validateGlow(glow);
  const next=structuredClone(recipe),parameters=next.parameters,extra=parameters.extendedParameters;
  const adjustments=extra[STAGE]??{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{}};
  if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')
    throw Error('AUTHOR_GLOW_TARGET_ENGINE_MISMATCH');
  adjustments.color??={};
  adjustments.color.glow=structuredClone(glow);
  extra[STAGE]=adjustments;
  if(!parameters.processingOrder.includes(STAGE)){
    const at=parameters.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
    parameters.processingOrder.splice(at<0?parameters.processingOrder.length:at,0,STAGE);
  }
  validateRecipe(next);
  return next;
}
