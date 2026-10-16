import {assertPixels,checkAbort} from './pure.mjs';
import {checkedRegion,checkedCloneRegion24MP,copyFrame,clamp,number,localMean,smoothRegionBands,repairRegion} from './region-repair-core.mjs';
import {sampleRGB} from './astra-face-core.mjs';
import {createSubjectSegmenter} from './subject-segmentation.mjs';
import {createMaskedInpaintONNX} from './masked-inpaint-onnx.mjs';
export async function createPortraitRepairRuntime(modelContract,{signal}={}){
  const inpainter=await createMaskedInpaintONNX(modelContract,{signal});
  return Object.freeze({inpainter,remove(frame,masks,strengths,options={}){return removePortraitBlemishes(frame,masks,strengths,{...options,inpainter});},close(){return inpainter.close();}});
}
// Semantic classes are explicit model labels, never inferred from brightness alone.
export const PORTRAIT_DEFECTS=Object.freeze(['acne','freckles','moles','shine','darkCircles','eyeBags','nostril','lipFlakes','lipWrinkles','doubleChin','foreheadWrinkles','frownLines','crowFeet','nasalWrinkles','smileLineLeft','smileLineRight','cheekWrinkles','marionetteLines','perioralWrinkles','nasolabialFolds','neckLines','bodyBlemishes','infantBodyBlemishes','armpit','stretchMarks','pregnancyLine','tanLines','grayHair','partLine','strayHairInside','strayHairOutside','frizz','eyeGlare','redVeins']);
export async function detectPortraitDefects(frame,{modelAssetBuffer,modelSHA256,wasmRoot,labelsByDefect},names,{signal}={}){
  if(!Array.isArray(names)||names.some(n=>!PORTRAIT_DEFECTS.includes(n)))throw Error('PORTRAIT_DEFECT_CLASS');const masks={};
  for(const name of names){const labels=labelsByDefect?.[name];if(!Array.isArray(labels)||!labels.length)throw Error('PORTRAIT_DEFECT_MODEL_LABEL_REQUIRED');
    const detector=await createSubjectSegmenter({modelAssetBuffer,modelSHA256,wasmRoot,foregroundLabels:labels},{signal});
    try{const result=await detector.segment(frame,{signal});masks[name]=new Uint8Array(result.data);}finally{detector.close();}}
  return {masks,modelSHA256,source:'semantic-model',authorization:'not-attested'};
}
export function healPortraitClone(frame,mask,options={}){
  return healCloneBounded(frame,mask,options,checkedRegion);
}
/** Explicit 24MP actual-frame entry point. The same global boundary mean and
 * immutable full-frame donor are used, never independent per-tile means.
 * Allocations are one byte coverage + RGBA output, not full-frame float planes. */
export function healPortraitClone24MP(frame,mask,options={}){
  return healCloneBounded(frame,mask,options,checkedCloneRegion24MP);
}
function healCloneBounded(frame,mask,{offsetX,offsetY,heal=true,opacity=1,protection,signal},checkRegion){
  number(opacity,0,1);number(offsetX,-frame.width,frame.width);number(offsetY,-frame.height,frame.height);
  const coverage=checkRegion(frame,mask,protection,signal),out=copyFrame(frame),delta=[0,0,0];let weight=0;
  // Match boundary color in heal mode; clone mode transfers unmodified donor color.
  if(heal)for(let i=0;i<coverage.length;i++){if(!(i&8191))checkAbort(signal);if(!coverage[i])continue;const x=i%frame.width,y=Math.floor(i/frame.width);
    if(x&&x<frame.width-1&&y&&y<frame.height-1&&[i-1,i+1,i-frame.width,i+frame.width].every(j=>coverage[j]>200))continue;
    const rgb=sampleRGB(frame,x+offsetX,y+offsetY);if(!rgb)continue;for(let c=0;c<3;c++)delta[c]+=frame.data[i*4+c]-rgb[c];weight++;}
  for(let i=0;i<coverage.length;i++){if(!(i&8191))checkAbort(signal);if(!coverage[i])continue;const x=i%frame.width,y=Math.floor(i/frame.width),sx=x+offsetX,sy=y+offsetY;
    if(sx<0||sy<0||sx>frame.width-1||sy>frame.height-1)continue;const donor=Math.round(sy)*frame.width+Math.round(sx);if(protection?.[donor])continue;
    const rgb=sampleRGB(frame,sx,sy);if(!rgb)continue;const a=coverage[i]/255*opacity;
    for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(frame.data[i*4+c]*(1-a)+clamp(rgb[c]+(weight?delta[c]/weight:0),0,255)*a);}
  checkAbort(signal);return out;
}
export function healPortraitSpot(frame,mask,domain,options){return repairRegion(frame,mask,domain,options);}
export async function removePortraitBlemishes(frame,defects,strengths,{domain,protection,preserveEyelids,preserveBeard,inpainter,signal}={}){
  assertPixels(frame);let out=copyFrame(frame);const protectedMask=new Uint8Array(frame.width*frame.height);
  for(const m of [protection,preserveEyelids,preserveBeard].filter(Boolean)){checkedRegion(frame,m,undefined,signal);for(let i=0;i<m.length;i++)protectedMask[i]=Math.max(protectedMask[i],m[i]);}
  for(const [name,strength] of Object.entries(strengths)){if(!PORTRAIT_DEFECTS.includes(name)&&!['tattoo','manual','imageLeftEyeBag','imageRightEyeBag','imageLeftDarkCircle','imageRightDarkCircle'].includes(name))throw Error('PORTRAIT_BLEMISH_CONTROL');number(strength,0,100);if(!strength)continue;
    const m=checkedRegion(out,defects[name],protectedMask,signal);for(let i=0;i<m.length;i++)m[i]=Math.round(m[i]*strength/100);
    if(inpainter){out={...out,...await inpainter.inpaint(out,{width:frame.width,height:frame.height,data:m},{signal})};}
    else{if(!domain)throw Error('PORTRAIT_REPAIR_DOMAIN_REQUIRED');out=repairRegion(out,m,domain,{strength:1,protection:protectedMask,signal});}}
  return out;
}
export function preserveChildPortraitTexture(original,repaired,skinMask,{ageGroup,amount=0,radius=3,signal}={}){
  if(!['under3','child'].includes(ageGroup))throw Error('PORTRAIT_EXPLICIT_AGE_GROUP_REQUIRED');number(amount,0,1);assertPixels(repaired);
  if(original.width!==repaired.width||original.height!==repaired.height)throw Error('PORTRAIT_TEXTURE_DIMENSIONS');const m=checkedRegion(original,skinMask,undefined,signal),out=copyFrame(repaired);
  for(let c=0;c<3;c++){const source=Float32Array.from(m,(_,i)=>original.data[i*4+c]),dest=Float32Array.from(m,(_,i)=>repaired.data[i*4+c]);
    const low=localMean(source,m,original.width,original.height,radius,signal),destLow=localMean(dest,m,original.width,original.height,radius,signal);
    for(let i=0;i<m.length;i++){const a=m[i]/255*amount*(ageGroup==='under3'?.8:1);out.data[i*4+c]=Math.round(clamp(dest[i]*(1-a)+(destLow[i]+clamp(source[i]-low[i],-16,16))*a,0,255));}}
  return out;
}
export const PORTRAIT_SKIN_TONES=Object.freeze([[244,219,197],[235,200,175],[217,173,139],[196,145,106],[169,117,81],[140,91,61],[108,69,47],[76,48,34]].map(Object.freeze));
export function samplePortraitComplexion(frame,{x,y,radius=2},{signal}={}){
  assertPixels(frame);number(x,0,1);number(y,0,1);number(radius,0,32);const mask=new Uint8Array(frame.width*frame.height),cx=Math.min(frame.width-1,Math.floor(x*frame.width)),cy=Math.min(frame.height-1,Math.floor(y*frame.height));
  for(let py=Math.max(0,cy-Math.floor(radius));py<=Math.min(frame.height-1,cy+Math.floor(radius));py++)for(let px=Math.max(0,cx-Math.floor(radius));px<=Math.min(frame.width-1,cx+Math.floor(radius));px++)mask[py*frame.width+px]=255;
  checkAbort(signal);return {color:meanColor(frame,mask),referenceMask:mask};
}
export function restorePortraitManual(original,processed,restoreMask,{signal}={}){
  assertPixels(processed);if(original.width!==processed.width||original.height!==processed.height)throw Error('PORTRAIT_RESTORE_DIMENSIONS');
  const mask=checkedRegion(original,restoreMask,undefined,signal),out=copyFrame(processed);
  for(let i=0;i<mask.length;i++){if(!(i&8191))checkAbort(signal);const a=mask[i]/255;for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(processed.data[i*4+c]*(1-a)+original.data[i*4+c]*a);}return out;
}
export function unifyPortraitComplexions(frame,regions,{referenceMask,amount=100,protection,signal}={}){
  number(amount,0,100);if(!Array.isArray(regions)||!regions.length||regions.length>24)throw Error('PORTRAIT_COMPLEXION_REGIONS');
  const masks=regions.map(m=>checkedRegion(frame,m,protection,signal)),union=new Uint8Array(frame.width*frame.height);
  for(const m of masks)for(let i=0;i<m.length;i++)union[i]=Math.max(union[i],m[i]);
  const target=meanColor(frame,referenceMask?checkedRegion(frame,referenceMask,protection,signal):union),acc=[new Float32Array(union.length),new Float32Array(union.length),new Float32Array(union.length)],weights=new Float32Array(union.length);
  for(const m of masks){const current=meanColor(frame,m);for(let i=0;i<m.length;i++){if(!(i&8191))checkAbort(signal);const w=m[i]/255;weights[i]+=w;for(let c=0;c<3;c++)acc[c][i]+=(target[c]-current[c])*w;}}
  const out=copyFrame(frame);for(let i=0;i<union.length;i++)if(weights[i])for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(clamp(frame.data[i*4+c]+acc[c][i]/weights[i]*union[i]/255*amount/100,0,255));return out;
}
function meanColor(frame,mask){const sums=[0,0,0];let count=0;for(let i=0;i<mask.length;i++){const a=mask[i]/255*frame.data[i*4+3]/255;count+=a;for(let c=0;c<3;c++)sums[c]+=frame.data[i*4+c]*a;}if(!count)throw Error('PORTRAIT_EMPTY_SAMPLE');return sums.map(v=>v/count);}
/** Frequency separation and explicit masks: no inferred sex/age/skin ethnicity.
 * Tone palettes and tonal curves are SUITE independent design, not proprietary parity. */
export function retouchPortraitSkin(frame,skinMask,settings={}, {protection,featureMask,contourMask,complexionReferenceMask,signal}={}){
  const allowed=['fine','coarse','soften','even','sculpt','features','contours','gloss','texture','clarity','toneAmount','temperature','tint','radiance','rosy','complexionAmount','finish','toneIndex','radius'];
  if(Object.keys(settings).some(k=>!allowed.includes(k)))throw Error('PORTRAIT_SKIN_CONTROL');
  const s={fine:0,coarse:0,soften:0,even:0,sculpt:0,features:0,contours:0,gloss:0,texture:0,clarity:0,toneAmount:0,temperature:0,tint:0,radiance:0,rosy:0,complexionAmount:0,finish:'natural',radius:5,...settings};
  for(const k of allowed.filter(k=>!['finish','toneIndex','radius'].includes(k)))number(s[k],-100,100);
  if(!['natural','matte','satin','dewy'].includes(s.finish))throw Error('PORTRAIT_SKIN_FINISH');
  const m=checkedRegion(frame,skinMask,protection,signal),f=featureMask?checkedRegion(frame,featureMask,protection,signal):null,c=contourMask?checkedRegion(frame,contourMask,protection,signal):null;
  if(s.features&&!f||s.contours&&!c||s.sculpt&&(!f||!c))throw Error('PORTRAIT_SCULPT_MASKS_REQUIRED');
  let target;if(s.toneAmount){if(!Number.isInteger(s.toneIndex)||!PORTRAIT_SKIN_TONES[s.toneIndex])throw Error('PORTRAIT_SKIN_TONE');target=PORTRAIT_SKIN_TONES[s.toneIndex];}
  let reference;if(s.complexionAmount){reference=meanColor(frame,checkedRegion(frame,complexionReferenceMask,protection,signal));}
  const mean=meanColor(frame,m),out=smoothRegionBands(frame,m,{fine:clamp((s.fine+s.soften)/100,0,1),coarse:clamp((s.coarse+s.even)/100,0,1),radius:s.radius,protection,signal});
  for(let channel=0;channel<3;channel++){
    const values=Float32Array.from(m,(_,i)=>frame.data[i*4+channel]),low=localMean(values,m,frame.width,frame.height,s.radius,signal);
    for(let i=0;i<m.length;i++){if(!(i&8191))checkAbort(signal);if(!m[i])continue;const a=m[i]/255,p=i*4+channel,brightness=(frame.data[i*4]+frame.data[i*4+1]+frame.data[i*4+2])/765;
      let delta=(values[i]-low[i])*(s.texture+s.clarity)/100;
      delta+=s.radiance*.15+s.rosy*(channel===0?.12:channel===1?-.04:.01)+s.temperature*(channel===0?.12:channel===2?-.12:0)+s.tint*(channel===1?-.1:.04);
      const sheen=Math.max(0,(brightness-.5)*2)**2;delta+=(s.gloss*.3+(s.finish==='matte'?-18:s.finish==='satin'?5:s.finish==='dewy'?15:0))*sheen;
      delta+=((f?.[i]??0)/255*(s.features+s.sculpt)-(c?.[i]??0)/255*(s.contours+s.sculpt))*.15;
      if(target)delta+=(target[channel]-mean[channel])*s.toneAmount/100;if(reference)delta+=(reference[channel]-mean[channel])*s.complexionAmount/100;
      out.data[p]=Math.round(clamp(out.data[p]+delta*a,0,255));}
  }return out;
}
