import {checkAbort} from './pure.mjs';
import {createSubjectSegmenter} from './subject-segmentation.mjs';
import {checkedRegion, clamp, copyFrame, localMean, luminance, number} from './region-repair-core.mjs';
import {createAstraImageModel} from './astra-image-model.mjs';

export const GOLDEN_BLONDE_VERSION = 'suite-segmented-golden-blonde-1';

/** Golden-blonde recoloring, preserving hair geometry and high-frequency
 * luminance detail. This is an actual color transform, not generated strands,
 * bleaching physics, hidden-hair reconstruction or an Evoto model replica. */
export function applyGoldenBlonde(frame, hairMask, {strength = .8, lift = .5,
  warmth = .65, protection, signal} = {}) {
  for (const value of [strength, lift, warmth]) number(value, 0, 1);
  const coverage = checkedRegion(frame, hairMask, protection, signal);
  const out = copyFrame(frame);
  if (!strength || !coverage.some(Boolean)) return out;
  const y = luminance(frame), base = localMean(y, coverage, frame.width, frame.height, 4, signal);
  const gold = [1, .88-.16*warmth, .72-.34*warmth];
  const goldY = .2126*gold[0]+.7152*gold[1]+.0722*gold[2];
  for (let i = 0; i < coverage.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const amount = coverage[i]/255*strength;
    if (!amount) continue;
    const low = base[i]/255;
    const liftedBase = low+(Math.sqrt(low)-low)*lift;
    const desiredY = clamp(liftedBase+(y[i]-base[i])/255, 0, 1);
    // Highlights remain nearly neutral; dark detail remains legible.
    const highlight = clamp((desiredY-.7)/.3, 0, 1)*.75;
    const color = gold.map(channel => desiredY*(channel/goldY*(1-highlight)+highlight));
    const maximum = Math.max(...color), gamut = maximum > 1 ? 1/maximum : 1;
    for (let c = 0; c < 3; c++) out.data[i*4+c] = Math.round(
      frame.data[i*4+c]*(1-amount)+255*color[c]*gamut*amount);
  }
  return out;
}

/** Segmentation model must contain an actual hair class declared in its label
 * inventory. Caller supplies one selected person's approved region; class
 * labels alone cannot distinguish multiple people's hair or authorize edits. */
export async function createGoldenBlondeProcessor(segmentationOptions, {signal} = {}) {
  const segmenter = await createSubjectSegmenter(segmentationOptions, {signal});
  let closed = false;
  return Object.freeze({
    async apply(frame, selectedPersonMask, {signal, ...settings} = {}) {
      if (closed) throw Error('GOLDEN_BLONDE_CLOSED');
      const selected = checkedRegion(frame, selectedPersonMask, undefined, signal);
      const source = copyFrame(frame), fixed = structuredClone(settings);
      const result = await segmenter.segment(source, {signal});
      checkAbort(signal);
      if (closed) throw Error('GOLDEN_BLONDE_CLOSED');
      const hairMask = new Uint8Array(result.data.length);
      for (let i = 0; i < hairMask.length; i++) hairMask[i] = Math.round(result.data[i]*selected[i]/255);
      if (!hairMask.some(Boolean)) throw Error('GOLDEN_BLONDE_HAIR_NOT_FOUND');
      return {pixels: applyGoldenBlonde(source, hairMask, {...fixed, signal}),
        hairMask: {width: frame.width, height: frame.height, data: hairMask},
        analysis: result.analysis, engineVersion: GOLDEN_BLONDE_VERSION,
        operation: 'segmented-color-transform', geometryChanged: false};
    },
    close() {if (!closed) {closed = true; segmenter.close();}}
  });
}

/** Task-trained image-to-image strand generation followed by hair-only RGB
 * compositing. Requires dedicated golden-blonde-hair weights; the task name
 * alone does not qualify a generic model. Store one canonical result for Final.
 */
export async function createGoldenBlondeGenerator({segmentation,model}={}, {signal}={}) {
  if(model?.task!=='golden-blonde-hair'||(model.outputScale??1)!==1)
    throw Error('GOLDEN_BLONDE_GENERATOR_CONTRACT');
  const segmenter=await createSubjectSegmenter(segmentation,{signal});let generator;
  try{generator=await createAstraImageModel(model,{signal});checkAbort(signal);}
  catch(error){segmenter.close();await generator?.close();throw error;}
  let closed=false,busy=false;
  return Object.freeze({
    async generate(frame,selectedPersonMask,{seed=1,strength=1,controls={},protection,signal}={}){
      if(closed||busy)throw Error('GOLDEN_BLONDE_GENERATOR_UNAVAILABLE');
      number(strength,0,1);const selected=checkedRegion(frame,selectedPersonMask,protection,signal);
      const source=copyFrame(frame),fixed=structuredClone(controls);busy=true;
      try{
        const analysis=await segmenter.segment(source,{signal});checkAbort(signal);
        const mask=Uint8Array.from(analysis.data,(value,i)=>Math.round(value*selected[i]/255));
        if(!mask.some(Boolean))throw Error('GOLDEN_BLONDE_HAIR_NOT_FOUND');
        const generated=await generator.run(source,{...(generator.masked?{mask}:{}),seed,controls:fixed,tiled:true,signal});
        checkAbort(signal);
        if(generated.width!==source.width||generated.height!==source.height)throw Error('GOLDEN_BLONDE_RESULT_DIMENSIONS');
        const out=copyFrame(source);
        for(let i=0;i<mask.length;i++){
          if((i&16383)===0)checkAbort(signal);
          const weight=mask[i]/255*strength;
          for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(source.data[i*4+c]*(1-weight)+generated.data[i*4+c]*weight);
        }
        return {pixels:out,hairMask:{width:source.width,height:source.height,data:mask},seed,
          analysis:analysis.analysis,modelSHA256:generator.modelSHA256,
          operation:'task-model-golden-blonde-generation',requiresCanonicalAssetPersistence:true};
      }finally{busy=false;}
    },
    async close(){if(busy)throw Error('GOLDEN_BLONDE_GENERATOR_BUSY');if(!closed){closed=true;segmenter.close();await generator.close();}}
  });
}
