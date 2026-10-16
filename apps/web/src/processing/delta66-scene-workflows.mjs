import {assertPixels,checkAbort} from './pure.mjs';
import {assertAnalysisMask} from './subject-segmentation.mjs';
import {generateSceneEdit,sceneMask,selectedSceneFaceMask} from './delta66-scene-edit.mjs';
import {replaceSceneSky} from './delta66-scene-background.mjs';
import {sceneRegionBounds,planLocatedCrop,locateFaceCrop} from './delta66-scene-geometry.mjs';
/** Consume real semantic segmentation without inventing authorization. */
export async function detectSceneRegion(pixels,segmenter,label,{signal}={}){
  assertPixels(pixels);if(typeof segmenter?.segment!=='function'||typeof label!=='string'||!label)throw Error('SCENE_SEGMENTER_REQUIRED');
  const result=await segmenter.segment({...pixels,data:pixels.data.slice()},{signal});checkAbort(signal);assertAnalysisMask(result,pixels);
  if(!Array.isArray(result.analysis?.labels)||!result.analysis.labels.length||result.analysis.labels.some(v=>v!==label))throw Error('SCENE_SEGMENTER_LABEL_MISMATCH');
  return {mask:new Uint8Array(result.data),analysis:structuredClone(result.analysis)};
}
export async function locateSceneCrop(pixels,{kind='face',faceIndex,segmenter,label,settings,signal}={}){
  if(kind==='face')return locateFaceCrop(pixels,{faceIndex,settings,signal});
  if(!['head','subject'].includes(kind)||typeof label!=='string')throw Error('SCENE_CROP_REGION');
  // Host supplies the dedicated head or person segmentation label/model; a
  // face oval is never silently relabelled as the whole head or subject.
  const {mask,analysis}=await detectSceneRegion(pixels,segmenter,label,{signal});
  return {crop:planLocatedCrop(pixels,sceneRegionBounds(pixels,mask),settings),boundsKind:kind,analysis};
}
export async function extractSceneSubject(pixels,{mode='auto',segmenters,subjectLabel='person',objectsMask,includeDisconnected=false,signal}={}){
  if(!['auto','natural','precise'].includes(mode)||!segmenters?.[mode])throw Error('SCENE_EXTRACTION_MODEL_REQUIRED');
  // Modes select actual independently configured model/quality paths. They do
  // not relabel identical threshold settings as three different AI systems.
  const detected=await detectSceneRegion(pixels,segmenters[mode],subjectLabel,{signal});
  return {...detected,mode,mask:objectsMask?extendSceneSubject(pixels,detected.mask,objectsMask,{includeDisconnected,signal}):detected.mask};
}
/** Include only object components touching the selected subject, or all
 * supplied object components. No inferred ownership or semantic identity. */
export function extendSceneSubject(pixels,subjectMask,objectsMask,{includeDisconnected=false,signal}={}){
  sceneMask(pixels,subjectMask);sceneMask(pixels,objectsMask);if(typeof includeDisconnected!=='boolean'||pixels.width*pixels.height>8_000_000)throw Error('SCENE_OBJECT_OPTIONS');
  const {width:w,height:h}=pixels,out=subjectMask.slice(),visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let start=0;start<w*h;start++){if(!(start%w))checkAbort(signal);if(visited[start]||objectsMask[start]<128)continue;let head=0,tail=1,touches=false;queue[0]=start;visited[start]=1;
    while(head<tail){if(!(head%4096))checkAbort(signal);const i=queue[head++],x=i%w,y=Math.floor(i/w);if(subjectMask[i]>=128)touches=true;
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const j=yy*w+xx;if(subjectMask[j]>=128)touches=true;if(!visited[j]&&objectsMask[j]>=128){visited[j]=1;queue[tail++]=j;}}}
    if(touches||includeDisconnected)for(let k=0;k<tail;k++){const i=queue[k];out[i]=Math.max(out[i],objectsMask[i]);}
  }return out;
}
/** Smart and Quick are different specialized model tasks, not strength names for one filter. */
export async function removeSceneRegion(pixels,{mode='quick',model,mask,protectMask,edgeRadius=0,seed=1,signal}={}){
  if(!['quick','magic'].includes(mode))throw Error('SCENE_REMOVAL_MODE');
  return generateSceneEdit(pixels,{task:`smart-removal-${mode}`,model,mask,protectMask,edgeRadius:mode==='magic'?edgeRadius:0,seeds:[seed],signal});
}
export async function generateSceneSky(pixels,sky,{model,segmenter,skyLabel='sky',count=1,seeds,signal,...options}={}){
  const {mask,analysis}=await detectSceneRegion(pixels,segmenter,skyLabel,{signal});if(!mask.some(v=>v>=128))throw Error('SCENE_NO_DETECTABLE_SKY');
  const prepared=replaceSceneSky(pixels,sky,mask,{...options,signal});
  return {analysis,candidates:await generateSceneEdit(prepared,{task:'sky-replacement',model,mask,count,seeds,signal})};
}
/** Face index belongs only to this fresh detection. Explicit visibility mask is
 * required: face mesh does not establish foreground-object occlusion. */
export async function generateSceneFace(pixels,{task,model,faceIndex,visibleMask,editMask,glareSegmenter,glareLabel='eyeglass-glare',seed=1,regularGlareAlreadyApplied=false,signal}={}){
  if(!['face-shadow-removal','strong-glare-removal','relight-natural','relight-golden'].includes(task))throw Error('SCENE_FACE_TASK');
  if(task==='strong-glare-removal'&&regularGlareAlreadyApplied)throw Error('SCENE_GLARE_NEEDS_PRE_REGULAR_SOURCE');
  sceneMask(pixels,visibleMask);
  if(task==='strong-glare-removal'&&!editMask){const detectedGlare=await detectSceneRegion(pixels,glareSegmenter,glareLabel,{signal});editMask=detectedGlare.mask;}
  if(editMask)sceneMask(pixels,editMask);const detected=await selectedSceneFaceMask(pixels,faceIndex,{signal});
  const mask=Uint8Array.from(detected.mask,(v,i)=>Math.round(v*visibleMask[i]/255*(editMask?editMask[i]/255:1)));
  return {faceIndex,detectorSHA256:detected.modelSHA256,candidates:await generateSceneEdit(pixels,{task,model,mask,seeds:[seed],signal})};
}
/** Belly silhouette/extent is explicit, not fabricated from face landmarks. */
export async function generateSceneBelly(pixels,{model,bellyMask,bellySegmenter,bellyLabel='abdomen',selectedPersonMask,protectMask,seed=1,signal}={}){
  if(!bellyMask){sceneMask(pixels,selectedPersonMask);const detected=await detectSceneRegion(pixels,bellySegmenter,bellyLabel,{signal});bellyMask=Uint8Array.from(detected.mask,(v,i)=>Math.round(v*selectedPersonMask[i]/255));}
  return generateSceneEdit(pixels,{task:'belly-slimming',model,mask:bellyMask,protectMask,seeds:[seed],signal});
}
export async function generateSceneColor(pixels,{mode='auto-color',model,seed=1,signal}={}){
  assertPixels(pixels);if(!['auto-color','white-balance'].includes(mode))throw Error('SCENE_COLOR_TASK');
  return generateSceneEdit(pixels,{task:mode,model,mask:new Uint8Array(pixels.width*pixels.height).fill(255),seeds:[seed],signal});
}
export async function cleanSceneBackdrop(pixels,{model,backgroundMask,distractionMask,protectMask,seed=1,signal}={}){
  sceneMask(pixels,backgroundMask);if(distractionMask)sceneMask(pixels,distractionMask);
  const mask=Uint8Array.from(backgroundMask,(v,i)=>Math.round(v*(distractionMask?distractionMask[i]/255:1)));
  return generateSceneEdit(pixels,{task:'backdrop-clean',model,mask,protectMask,seeds:[seed],signal});
}
/** Bounded sequential batch; review/save remains the host's responsibility. */
export async function generateSceneBatch(items,options={}){
  if(!Array.isArray(items)||!items.length||items.length>20)throw Error('SCENE_BATCH_SIZE');const results=[];let retained=0;
  for(const item of items){checkAbort(options.signal);assertPixels(item.pixels);retained+=item.pixels.width*item.pixels.height*(options.count||1);if(retained>24_000_000)throw Error('SCENE_BATCH_MEMORY_LIMIT');results.push(await generateSceneEdit(item.pixels,{...options,mask:item.mask,protectMask:item.protectMask}));}return results;
}
