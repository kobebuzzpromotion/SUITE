import {proposeAutoLight,autoLightAmount,resetAutoLight,AUTO_LIGHT_ALGORITHM} from './processing/lr-auto-light.mjs';

const GLOBALS=['exposure','contrast','saturation'];
const COLOR=['highlights','shadows','whites','blacks','vibrance'];
const KEYS=[...GLOBALS,...COLOR];
export const WEB_AUTO_LIGHT_VERSION='suite-web-auto-light-controls-1';

function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('WEB_AUTO_LIGHT_RECORD');
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('WEB_AUTO_LIGHT_RECORD');
  }
  return value;
}
function checkedControls(value){
  record(value);
  if(Object.keys(value).length!==KEYS.length||KEYS.some(key=>!Object.hasOwn(value,key)))throw Error('WEB_AUTO_LIGHT_CONTROLS');
  for(const key of KEYS){
    const v=value[key],lo=key==='exposure'?-4:GLOBALS.includes(key)?0:-100;
    const hi=key==='exposure'?4:GLOBALS.includes(key)?2:100;
    if(!Number.isFinite(v)||v<lo||v>hi)throw Error('WEB_AUTO_LIGHT_CONTROL_RANGE');
  }
  return Object.fromEntries(KEYS.map(key=>[key,value[key]]));
}

/** Only the eight existing editor controls; no new Recipe field or pixel pass.
 * Caller validates the complete current Recipe through its existing validator.
 * Values outside the editor's 0..2 multipliers are rejected, never silently reset.
 */
export function readWebAutoLightBaseline(recipe){
  record(recipe);const p=record(recipe.parameters),extra=record(p.extendedParameters);
  let color={};
  if(Object.hasOwn(extra,'postDecodeAdjustments')){
    const post=record(extra.postDecodeAdjustments);
    if(post.schemaVersion!==1||post.engineVersion!=='suite-srgb8-color-detail-1')throw Error('WEB_AUTO_LIGHT_ENGINE');
    if(Object.hasOwn(post,'color'))color=record(post.color);
  }
  return checkedControls({...Object.fromEntries(GLOBALS.map(key=>[key,p[key]])),
    ...Object.fromEntries(COLOR.map(key=>[key,Object.hasOwn(color,key)?color[key]:0]))});
}

function toEditorPatch(controls){
  const checked=checkedControls(controls);
  return Object.freeze(Object.fromEntries(KEYS.map(key=>[GLOBALS.includes(key)?key:`color.${key}`,checked[key]])));
}

/** Analyze the UNEDITED decoded Proxy (session.proxy), not previewPixels/after.
 * Baseline is captured once for Amount/reset. Proposal values are absolute
 * targets, not additive deltas. Repeated Amount changes must reuse this result.
 * Host owns asset/SHA/revision checks; this object is not permission evidence.
 */
export function createWebAutoLightProposal(uneditedProxy,recipe,{signal}={}){
  const baseline=Object.freeze(readWebAutoLightBaseline(recipe));
  const proposal=proposeAutoLight(uneditedProxy,{signal});
  const controls=Object.freeze(checkedControls(proposal.controls));
  return Object.freeze({kind:WEB_AUTO_LIGHT_VERSION,algorithm:AUTO_LIGHT_ALGORITHM,
    baseline,proposal:Object.freeze({...proposal,controls}),
    status:proposal.status,adobeEquivalent:false});
}

/** Flat patch keys match Session.setAdjustment. Main must apply all entries to
 * ONE copied Recipe, via its existing setters/validator, then push one history
 * item and rerender once. Calling setAdjustment eight times is not atomic Undo.
 * No applyAutoLight call: normal Preview/Final render these controls exactly once.
 */
export function webAutoLightPatch(result,amount=1){
  record(result);
  if(result.kind!==WEB_AUTO_LIGHT_VERSION||result.algorithm!==AUTO_LIGHT_ALGORITHM)throw Error('WEB_AUTO_LIGHT_RESULT');
  const baseline=checkedControls(result.baseline);
  record(result.proposal);checkedControls(result.proposal.controls);
  return toEditorPatch(autoLightAmount(result.proposal,amount,{baseline}));
}

/** Restore only the eight captured controls; unrelated adjustments are untouched.
 * Host still rejects stale asset/recipe sessions before committing the patch.
 */
export function resetWebAutoLightPatch(result){
  record(result);
  if(result.kind!==WEB_AUTO_LIGHT_VERSION||result.algorithm!==AUTO_LIGHT_ALGORITHM)throw Error('WEB_AUTO_LIGHT_RESULT');
  return toEditorPatch(resetAutoLight(checkedControls(result.baseline)));
}
