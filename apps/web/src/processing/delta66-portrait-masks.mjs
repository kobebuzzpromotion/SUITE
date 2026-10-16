import {assertPixels,checkAbort,srgbToLinear,linearToSrgb} from './pure.mjs';
import {rasterizeLocalBrushMask} from './local-mask-brush.mjs';
import {extractSeedRegion,copyFrame,clamp,luminance} from './region-repair-core.mjs';
import {applyColorAdjustments} from './color-adjustments.mjs';
import {applyPointCurves} from './point-curves.mjs';
import {applyDetailAdjustments} from './detail-adjustments.mjs';
import {applyLevels} from './levels.mjs';
import {createSubjectSegmenter} from './subject-segmentation.mjs';
import {createPortraitGradientCoverage} from './portrait-gradient-mask.mjs';
export function portraitMask(mask,frame){assertPixels(frame);if(frame.width*frame.height>8_000_000||
  !(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||mask.length!==frame.width*frame.height||
  !(mask.buffer instanceof ArrayBuffer))throw Error('PORTRAIT_MASK');return new Uint8Array(mask);}
const number=(v,a,b)=>{if(!Number.isFinite(v)||v<a||v>b)throw Error('PORTRAIT_VALUE');return v;};
export function combinePortraitMasks(a,b,operation='add'){
  if(!(a instanceof Uint8Array)||!(b instanceof Uint8Array)||a.length!==b.length||!['add','subtract','intersect','replace'].includes(operation))throw Error('PORTRAIT_MASK_COMBINE');
  return Uint8Array.from(a,(v,i)=>operation==='replace'?b[i]:operation==='add'?Math.max(v,b[i]):operation==='subtract'?Math.round(v*(1-b[i]/255)):Math.round(v*b[i]/255));
}
export function makePortraitMask(frame,spec,{signal}={}){
  assertPixels(frame);const {width,height}=frame;if(width*height>8_000_000)throw Error('PORTRAIT_CAPACITY');
  let out=new Uint8Array(width*height);
  if(spec?.kind==='brush'){
    out=rasterizeLocalBrushMask({width,height,strokes:spec.strokes,signal}).data;
    const opacity=number(spec.flow??1,0,1)*number(spec.density??1,0,1);out=out.map(v=>Math.round(v*opacity));
  }else if(spec?.kind==='linear'||spec?.kind==='radial'){
    out=createPortraitGradientCoverage(frame,spec,{signal});
  }else if(spec?.kind==='luminance'){
    const limits=spec.limits;if(!Array.isArray(limits)||limits.length!==4||limits.some((v,i)=>!Number.isFinite(v)||v<0||v>1||i&&v<limits[i-1]))throw Error('PORTRAIT_LUMA_LIMITS');
    const luma=luminance(frame),[a,b,c,d]=limits;
    for(let i=0;i<out.length;i++){if(!(i&16383))checkAbort(signal);const v=luma[i]/255;
      out[i]=Math.round(255*Math.min(v<a?0:v>=b?1:(v-a)/Math.max(1e-9,b-a),v>d?0:v<=c?1:(d-v)/Math.max(1e-9,d-c)));}
  }else throw Error('PORTRAIT_MASK_KIND');
  for(let i=0;i<out.length;i++)out[i]=frame.data[i*4+3]?(spec.invert?255-out[i]:out[i]):0;
  return out;
}
// Sliding-window min/max is linear-time even at the documented 500px radius.
function extreme(source,width,height,radius,max,signal){
  const filter=(input,horizontal)=>{const output=new Uint8Array(input.length),lines=horizontal?height:width,size=horizontal?width:height;
    const queue=new Int32Array(size);for(let line=0;line<lines;line++){checkAbort(signal);let head=0,tail=0,added=-1;
      const at=p=>horizontal?line*width+p:p*width+line;
      for(let p=0;p<size;p++){
        const end=Math.min(size-1,p+radius);while(added<end){const k=++added;while(tail>head&&(max?input[at(queue[tail-1])]<=input[at(k)]:input[at(queue[tail-1])]>=input[at(k)]))tail--;queue[tail++]=k;}
        while(tail>head&&queue[head]<p-radius)head++;output[at(p)]=input[at(queue[head])];
      }}return output;};return filter(filter(source,true),false);
}
function boxBlurMask(source,width,height,radius,signal){
  const pass=(input,horizontal)=>{const out=new Float32Array(input.length),lines=horizontal?height:width,size=horizontal?width:height;
    for(let line=0;line<lines;line++){checkAbort(signal);const at=p=>horizontal?line*width+p:p*width+line;let sum=0,last=-1,start=0;
      for(let p=0;p<size;p++){const end=Math.min(size-1,p+radius);while(last<end)sum+=input[at(++last)];while(start<Math.max(0,p-radius))sum-=input[at(start++)];out[at(p)]=sum/(end-start+1);}}
    return out;};return Uint8Array.from(pass(pass(source,true),false),Math.round);
}
export function refinePortraitMask(frame,mask,{expand=0,contract=0,smooth=0,feather=0,invert=false,signal}={}){
  let out=portraitMask(mask,frame);for(const v of [expand,contract,smooth])if(!Number.isInteger(v)||v<0||v>500)throw Error('PORTRAIT_MORPHOLOGY_RADIUS');
  number(feather,0,1000.9);
  if(expand)out=extreme(out,frame.width,frame.height,expand,true,signal);
  if(contract)out=extreme(out,frame.width,frame.height,contract,false,signal);
  if(smooth)out=boxBlurMask(out,frame.width,frame.height,smooth,signal);
  if(feather)out=boxBlurMask(out,frame.width,frame.height,Math.ceil(feather),signal);
  for(let i=0;i<out.length;i++)out[i]=frame.data[i*4+3]?(invert?255-out[i]:out[i]):0;return out;
}
export function smartPortraitSelection(frame,{seeds,box,negativeSeeds=[],tolerance=45,refinement={}}, {signal}={}){
  assertPixels(frame);if(frame.width*frame.height>8_000_000)throw Error('PORTRAIT_SELECTION_BUFFER_CAPACITY');
  const domain=new Uint8Array(frame.width*frame.height);domain.fill(255);
  if(box){for(const k of ['x','y','width','height'])number(box[k],0,1);if(box.width<=0||box.height<=0||box.x+box.width>1||box.y+box.height>1)throw Error('PORTRAIT_SELECTION_BOX');
    for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)if((x+.5)/frame.width<box.x||(x+.5)/frame.width>box.x+box.width||(y+.5)/frame.height<box.y||(y+.5)/frame.height>box.y+box.height)domain[y*frame.width+x]=0;}
  // Image-driven connected color segmentation, not semantic object recognition.
  const anchors=seeds?.length?seeds:box?[{x:Math.min(frame.width-1,Math.floor((box.x+box.width/2)*frame.width)),y:Math.min(frame.height-1,Math.floor((box.y+box.height/2)*frame.height))}]:[];
  const positive=extractSeedRegion(frame,domain,anchors,{tolerance,signal});
  const result=negativeSeeds.length?combinePortraitMasks(positive,extractSeedRegion(frame,domain,negativeSeeds,{tolerance,signal}),'subtract'):positive;
  return refinePortraitMask(frame,result,{...refinement,signal});
}
export function samplePortraitLuminance(frame,{x,y}){assertPixels(frame);number(x,0,1);number(y,0,1);const i=(Math.min(frame.height-1,Math.floor(y*frame.height))*frame.width+Math.min(frame.width-1,Math.floor(x*frame.width)))*4;
  if(!frame.data[i+3])throw Error('PORTRAIT_SAMPLE_TRANSPARENT');return (.2126*frame.data[i]+.7152*frame.data[i+1]+.0722*frame.data[i+2])/255;}
export function portraitLuminanceMap(frame){assertPixels(frame);const out=copyFrame(frame),values=luminance(frame);for(let i=0;i<values.length;i++)for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(values[i]);return out;}
export function quickPortraitBrush(frame,mask,{points,size=30,softness=.5,erase=false,flow=1,density=1},{signal}={}){
  number(size,1,300);number(softness,0,1);const stroke=makePortraitMask(frame,{kind:'brush',strokes:[{points,radius:Math.min(.5,size/2/Math.min(frame.width,frame.height)),hardness:1-softness,mode:'add'}],flow,density},{signal});
  return combinePortraitMasks(portraitMask(mask,frame),stroke,erase?'subtract':'add');
}
function basic(frame,values,signal){const {exposure=0,contrast=0,saturation=0,...color}=values;number(exposure,-5,5);number(contrast,-100,100);number(saturation,-100,100);
  const out=copyFrame(frame),gain=2**exposure;
  for(let i=0;i<out.data.length;i+=4){if(!(i&65535))checkAbort(signal);if(!out.data[i+3])continue;
    const rgb=[0,1,2].map(c=>linearToSrgb(clamp(srgbToLinear(frame.data[i+c]/255)*gain,0,1))),l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for(let c=0;c<3;c++)out.data[i+c]=Math.round(clamp(((l+(rgb[c]-l)*(1+saturation/100))-.5)*(1+contrast/100)+.5,0,1)*255);}
  return applyColorAdjustments(out,color,{signal});}
export function portraitMaskOverlay(frame,mask,{color=[255,40,120],opacity=.5,visible=true}={}){
  const m=portraitMask(mask,frame),out=copyFrame(frame);number(opacity,0,1);if(!Array.isArray(color)||color.length!==3||color.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('PORTRAIT_OVERLAY_COLOR');
  if(visible)for(let i=0;i<m.length;i++){const a=m[i]/255*opacity;for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(frame.data[i*4+c]*(1-a)+color[c]*a);}return out;
}
function grade(frame,settings,signal){
  const out=copyFrame(frame);for(const key of ['shadows','midtones','highlights']){const v=settings[key]??[0,0,0];if(!Array.isArray(v)||v.length!==3||v.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('PORTRAIT_GRADE');}
  for(let i=0;i<frame.data.length;i+=4){if(!(i&65535))checkAbort(signal);if(!frame.data[i+3])continue;
    const l=(frame.data[i]+frame.data[i+1]+frame.data[i+2])/765,w=[(1-l)**2,2*l*(1-l),l*l];
    for(let c=0;c<3;c++)out.data[i+c]=Math.round(clamp(frame.data[i+c]+64*['shadows','midtones','highlights'].reduce((s,k,j)=>s+(settings[k]?.[c]??0)*w[j],0),0,255));}return out;
}
export function applyPortraitAdjustmentStack(frame,mask,stack,{platform='desktop',signal}={}){
  const coverage=portraitMask(mask,frame);if(!Array.isArray(stack)||stack.length>32)throw Error('PORTRAIT_STACK');let out=copyFrame(frame);
  for(const step of stack){checkAbort(signal);let adjusted;
    if(step.kind==='basic'||step.kind==='hsl'){if(platform==='ipad'&&step.values?.toneCurve)throw Error('IPAD_PARAMETRIC_CURVE_UNSUPPORTED');adjusted=step.kind==='basic'?basic(out,step.values,signal):applyColorAdjustments(out,step.values,{signal});}
    else if(step.kind==='curves')adjusted=applyPointCurves(out,step.values,{signal});
    else if(step.kind==='levels')adjusted=applyLevels(out,step.values,{signal});
    else if(step.kind==='detail')adjusted=applyDetailAdjustments(out,step.values,{signal});
    else if(step.kind==='grading')adjusted=grade(out,step.values,signal);
    else throw Error('PORTRAIT_STACK_OPERATION');
    for(let i=0;i<coverage.length;i++){const a=coverage[i]/255;for(let c=0;c<3;c++)adjusted.data[i*4+c]=Math.round(out.data[i*4+c]*(1-a)+adjusted.data[i*4+c]*a);}out=adjusted;
  }return out;
}
export function createPortraitMaskLayers(frame){assertPixels(frame);frame=copyFrame(frame);const layers=new Map();return Object.freeze({
  put(id,mask,{visible=true,stack=[],mode='replace'}={}){if(typeof id!=='string'||!id||layers.size>=64&&!layers.has(id))throw Error('PORTRAIT_LAYER_ID');const m=portraitMask(mask,frame),prior=layers.get(id);
    if(!['replace','add','subtract','intersect'].includes(mode))throw Error('PORTRAIT_LAYER_MODE');
    layers.set(id,{mask:prior?combinePortraitMasks(prior.mask,m,mode):m,visible:Boolean(visible),stack:structuredClone(stack)});},
  remove(id){layers.delete(id);},setVisible(id,visible){if(!layers.has(id))throw Error('PORTRAIT_LAYER_MISSING');layers.get(id).visible=Boolean(visible);},
  clear(){layers.clear();},snapshot(){return [...layers].map(([id,v])=>({id,...structuredClone(v)}));},
  render(options={}){let output=copyFrame(frame);for(const v of layers.values())if(v.visible)output=applyPortraitAdjustmentStack(output,v.mask,v.stack,options);return output;}
});}
export const PORTRAIT_SEMANTIC_REGIONS=Object.freeze(['person','ears','tops','innerLayer','dress','bottoms','shoes','headwear','gloves','bag','jewelry','faceSkin','bodySkin','neck','hair','pet','background','reef','petImageLeftEye','petImageRightEye','petImageLeftIris','petImageRightIris']);
// Real ImageSegmenter adapters; a model MUST document the requested labels.
// All-person masks are unions; a selected individual requires an instance mask.
export async function createPortraitSemanticMasks({modelAssetBuffer,modelSHA256,labelsByRegion,wasmRoot},{signal}={}){
  const labels=structuredClone(labelsByRegion);if(!labels||Object.keys(labels).some(k=>!PORTRAIT_SEMANTIC_REGIONS.includes(k)))throw Error('PORTRAIT_SEMANTIC_LABELS');
  const bytes=new Uint8Array(modelAssetBuffer),cache=new Map();let closed=false;
  return Object.freeze({async detect(frame,regions,{instanceMask,signal}={}){
    if(closed||!Array.isArray(regions)||!regions.length||regions.length>18)throw Error('PORTRAIT_SEMANTIC_REQUEST');assertPixels(frame);
    const scope=instanceMask===undefined?null:portraitMask(instanceMask,frame),result={};
    for(const region of regions){checkAbort(signal);if(!Array.isArray(labels[region])||!labels[region].length)throw Error(`PORTRAIT_MODEL_LABEL_UNAVAILABLE:${region}`);
      let segmenter=cache.get(region);if(!segmenter){if(cache.size>=3){const [key,value]=cache.entries().next().value;value.close();cache.delete(key);}
        segmenter=await createSubjectSegmenter({modelAssetBuffer:bytes,modelSHA256,foregroundLabels:labels[region],wasmRoot},{signal});cache.set(region,segmenter);}
      const found=await segmenter.segment(frame,{signal});const mask=new Uint8Array(found.data);if(scope)for(let i=0;i<mask.length;i++)mask[i]=Math.round(mask[i]*scope[i]/255);result[region]=mask;
    }return result;},close(){for(const s of cache.values())s.close();cache.clear();bytes.fill(0);closed=true;}
  });
}
export function combineSkinRegions(masks){const parts=['faceSkin','bodySkin','neck'].map(k=>masks[k]);if(parts.some(m=>!(m instanceof Uint8Array)))throw Error('PORTRAIT_SKIN_PARTS');return parts.reduce((a,b)=>combinePortraitMasks(a,b));}
export async function syncPortraitSemanticAdjustments(items,analyzer,regions,stack,{signal}={}){
  if(!Array.isArray(items)||items.length>1000)throw Error('PORTRAIT_SYNC');const results=[];
  for(const item of items){checkAbort(signal);const masks=await analyzer.detect(item.pixels,regions,{instanceMask:item.instanceMask,signal});
    const combined=Object.values(masks).reduce((a,b)=>combinePortraitMasks(a,b));
    results.push({id:item.id,pixels:applyPortraitAdjustmentStack(item.pixels,combined,stack,{signal})});}return results;
}
