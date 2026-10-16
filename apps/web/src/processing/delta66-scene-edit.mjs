import {assertPixels,checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {polygonMask} from './face-feature-geometry.mjs';
const clone=p=>({...p,data:p.data.slice()});
export function sceneMask(pixels,mask){assertPixels(pixels);if(!(mask instanceof Uint8Array)||mask.length!==pixels.width*pixels.height)throw Error('SCENE_MASK_INVALID');return mask;}
/** Coverage utility only: no manual-auth/provenance claim is created. */
export function paintSceneMask(pixels,mask,points,{radius=20,softness=.5,opacity=1,erase=false,signal}={}){
  sceneMask(pixels,mask);if(!Array.isArray(points)||!points.length||points.length>10000||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||!Number.isFinite(radius)||radius<.5||radius>2048||![softness,opacity].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||typeof erase!=='boolean')throw Error('SCENE_BRUSH_INVALID');
  const data=mask.slice(),{width:w,height:h}=pixels;
  // One maximum coverage per stroke prevents sampling-density-dependent opacity.
  const coverage=new Uint8Array(data.length);
  const stamp=(x,y)=>{for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(h-1,Math.ceil(y+radius));yy++)for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(w-1,Math.ceil(x+radius));xx++){
    const d=Math.hypot(xx+.5-x,yy+.5-y)/radius,edge=softness?Math.min(1,(1-d)/softness):1;
    if(d<=1){const i=yy*w+xx;coverage[i]=Math.max(coverage[i],Math.round(Math.max(0,edge)*opacity*255));}}};
  for(let i=0;i<points.length;i++){checkAbort(signal);const b=points[i],a=points[Math.max(0,i-1)],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/Math.max(.5,radius*.25)));
    if(steps>100000)throw Error('SCENE_BRUSH_PATH_LIMIT');for(let j=0;j<=steps;j++)stamp(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps);}
  for(let i=0;i<data.length;i++)data[i]=Math.round(erase?data[i]*(1-coverage[i]/255):data[i]+(255-data[i])*coverage[i]/255);return data;
}
export function refineSceneMask(pixels,mask,{radius=0,protectMask,signal}={}){
  sceneMask(pixels,mask);if(protectMask)sceneMask(pixels,protectMask);if(!Number.isInteger(radius)||radius<0||radius>16)throw Error('SCENE_EDGE_RANGE');
  const out=new Uint8Array(mask.length),{width:w,height:h}=pixels;
  for(let y=0;y<h;y++){checkAbort(signal);for(let x=0;x<w;x++){let sum=0,n=0;for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx++){sum+=mask[yy*w+xx];n++;}const i=y*w+x;out[i]=Math.round(sum/n*(1-(protectMask?.[i]||0)/255));}}return out;
}
/** Task selection is exact. A generic inpaint model cannot silently stand in for relight. */
export async function generateSceneEdit(pixels,{task,model,mask,protectMask,edgeRadius=0,count=1,seeds=[1,2],signal}={}){
  assertPixels(pixels);if(model?.task!==task||typeof model?.generate!=='function'||!Number.isInteger(count)||count<1||count>2)throw Error('SCENE_TASK_MODEL_MISMATCH');
  if(count>1&&model.stochastic!==true)throw Error('SCENE_DETERMINISTIC_ONE_CANDIDATE');
  if(!Array.isArray(seeds)||seeds.length<count||seeds.slice(0,count).some(v=>!Number.isInteger(v)||v<0||v>4294967295)||new Set(seeds.slice(0,count)).size!==count)throw Error('SCENE_SEEDS_INVALID');
  const source=clone(pixels),coverage=refineSceneMask(source,mask,{radius:edgeRadius,protectMask,signal});if(!coverage.some(v=>v))throw Error('SCENE_EMPTY_EDIT_MASK');
  const candidates=[];for(let i=0;i<count;i++){checkAbort(signal);const result=await model.generate(clone(source),coverage.slice(),{seed:seeds[i],signal});assertPixels(result);if(result.width!==source.width||result.height!==source.height)throw Error('SCENE_RESULT_DIMENSIONS');
    // Built-in model already applies coverage. Re-enforce hard exclusions without double feathering.
    const data=result.data.slice();for(let p=0;p<coverage.length;p++){data[p*4+3]=source.data[p*4+3];if(!coverage[p]||!source.data[p*4+3])for(let c=0;c<3;c++)data[p*4+c]=source.data[p*4+c];}
    candidates.push({pixels:{...source,data},task,seed:model.stochastic?seeds[i]:null,modelSHA256:model.modelSHA256,status:'review-required',authorization:'not-attested',identityValidation:'not-performed'});}return candidates;
}
export async function selectedSceneFaceMask(pixels,faceIndex,{signal}={}){
  const result=await detectFaceFeatures(pixels,{signal});if(!Number.isInteger(faceIndex)||!result.faces[faceIndex])throw Error('SCENE_FACE_SELECTION_REQUIRED');
  return {mask:polygonMask(pixels.width,pixels.height,result.faces[faceIndex].oval,{signal}),faceIndex,visibility:'not-proven-by-landmarks',modelSHA256:result.modelSHA256};
}
/** In-memory iterative editor; save returns an intent and pixels, never writes files.
 * segmenter must be host-configured for person labels. Mask is analysis, not authorization. */
export function createPeopleSceneEditor(pixels,{model,segmenter,personLabel='person'}={}){
  assertPixels(pixels);if(model?.task!=='people-removal'||typeof segmenter?.segment!=='function'||typeof personLabel!=='string'||!personLabel)throw Error('SCENE_PEOPLE_DEPENDENCY');
  const original=clone(pixels);let current=clone(pixels),mask=new Uint8Array(pixels.width*pixels.height),pending=null,busy=false;
  const idle=()=>{if(busy)throw Error('SCENE_EDITOR_BUSY');};
  return Object.freeze({
    snapshot(){return {pixels:clone(current),mask:mask.slice(),hasCandidate:!!pending};},
    async redetect({signal}={}){idle();busy=true;try{const r=await segmenter.segment(clone(current),{signal});if(r.width!==current.width||r.height!==current.height||!Array.isArray(r.analysis?.labels)||!r.analysis.labels.length||r.analysis.labels.some(v=>v!==personLabel))throw Error('SCENE_PERSON_LABELS_REQUIRED');sceneMask(current,r.data);mask=r.data.slice();pending=null;return mask.slice();}finally{busy=false;}},
    brush(points,options){idle();mask=paintSceneMask(current,mask,points,options);pending=null;return mask.slice();},
    async generate(options={}){idle();busy=true;try{pending=(await generateSceneEdit(current,{...options,task:'people-removal',model,mask,count:1}))[0].pixels;return clone(pending);}finally{busy=false;}},
    continue(){idle();if(!pending)throw Error('SCENE_NO_CANDIDATE');current=pending;pending=null;mask.fill(0);return clone(current);},
    save(mode='copy'){idle();if(!['copy','current'].includes(mode))throw Error('SCENE_SAVE_MODE');return {mode,pixels:clone(pending||current),originalUnchanged:true};},
    reset(){idle();current=clone(original);pending=null;mask.fill(0);}
  });
}
