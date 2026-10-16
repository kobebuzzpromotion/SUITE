import {checkAbort} from './pure.mjs';
import {assertAnalysisMask} from './subject-segmentation.mjs';
import {astraFrame,astraMask} from './astra-image-model.mjs';
import {requireGenerationModel,generationBinding,generationSeeds,generationCandidate,
  protectedGenerationMask,compositeGeneration} from './astra-generation-core.mjs';

export function editGrassMask(pixels,initial,strokes,{signal}={}){
  const mask=astraMask(initial,pixels),{width,height}=pixels;
  if(!Array.isArray(strokes)||strokes.length>128)throw Error('GRASS_STROKES_INVALID');
  let work=0;
  for(const stroke of strokes){
    if(!stroke||!['add','erase'].includes(stroke.mode)||!Number.isFinite(stroke.radius)||stroke.radius<=0||stroke.radius>.15||
      !Array.isArray(stroke.path)||!stroke.path.length||stroke.path.length>1024||stroke.path.some(p=>
        !p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('GRASS_STROKE_INVALID');
    const radius=stroke.radius*Math.min(width,height);
    for(let i=0;i<stroke.path.length;i++){
      const a=stroke.path[Math.max(0,i-1)],b=stroke.path[i],ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height;
      const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
      const x0=Math.max(0,Math.floor(Math.min(ax,bx)-radius)),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx)+radius));
      const y0=Math.max(0,Math.floor(Math.min(ay,by)-radius)),y1=Math.min(height-1,Math.ceil(Math.max(ay,by)+radius));
      work+=(x1-x0+1)*(y1-y0+1);if(work>32_000_000)throw Error('GRASS_BRUSH_CAPACITY');
      for(let y=y0;y<=y1;y++){checkAbort(signal);for(let x=x0;x<=x1;x++){
        const t=length?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/length)):0;
        if(Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy)<=radius)mask[y*width+x]=stroke.mode==='add'?255:0;
      }}
    }
  }
  return mask;
}
/** Actual semantic lawn segmentation, brush refinement and TWO grass-trained
 * noise-conditioned generations. Segmentation labels must match the model's
 * documented lawn class; a generic foreground/person mask is rejected. */
export async function generateGrassFill(pixels,{segmenter,lawnLabels,model,binding,strokes=[],
  protectionMask,adjustments={temperature:0,tint:0,saturation:0,brightness:0},seeds=[1,2],signal}={}){
  requireGenerationModel(model,'grass-fill',{masked:true,stochastic:true});
  const source=astraFrame(pixels),sourceBinding=generationBinding(binding),protect=astraMask(protectionMask,source);
  const values={...adjustments};
  if(Object.keys(values).length!==4||['temperature','tint','saturation','brightness'].some(k=>
    !Number.isFinite(values[k])||Math.abs(values[k])>1))throw Error('GRASS_ADJUSTMENTS_INVALID');
  if(typeof segmenter?.segment!=='function'||!Array.isArray(lawnLabels)||!lawnLabels.length||
    lawnLabels.some(v=>typeof v!=='string'||!v))throw Error('GRASS_SEGMENTER_REQUIRED');
  const brushSnapshot=structuredClone(strokes),labels=[...lawnLabels];
  const seedList=generationSeeds(seeds,2),detected=await segmenter.segment(source,{signal});checkAbort(signal);
  assertAnalysisMask(detected,source);
  if(!Array.isArray(detected.analysis?.labels)||detected.analysis.labels.length!==labels.length||
    !labels.every(l=>detected.analysis.labels.includes(l)))throw Error('GRASS_MODEL_LABEL_MISMATCH');
  const selected=editGrassMask(source,detected.data,brushSnapshot,{signal});
  const mask=protectedGenerationMask(selected,protect,source);
  if(!mask.some(Boolean))throw Error('GRASS_EMPTY_SELECTION');
  const results=[];
  for(const seed of seedList){
    const raw=await model.run(source,{mask,seed,signal});checkAbort(signal);
    // Adjust only generated grass. The original remains the blending reference.
    for(let y=0;y<raw.height;y++){checkAbort(signal);for(let x=0;x<raw.width;x++){
      const at=(y*raw.width+x)*4,r=raw.data[at],g=raw.data[at+1],b=raw.data[at+2],l=.2126*r+.7152*g+.0722*b;
      const biases=[values.temperature*22+values.tint*8,-values.tint*16,-values.temperature*22+values.tint*8];
      for(let c=0;c<3;c++)raw.data[at+c]=Math.round(Math.max(0,Math.min(255,
        (l+([r,g,b][c]-l)*(1+values.saturation)+biases[c])*2**values.brightness)));
    }}
    const result=compositeGeneration(source,raw,mask,{signal});
    results.push(await generationCandidate(result,{task:'grass-fill',seed,modelSHA256:model.modelSHA256,
      binding:sourceBinding,parameters:{adjustments:values,lawnLabels:labels,segmentationSHA256:detected.analysis.modelSHA256}},{signal}));
  }
  return {mask,results};
}
