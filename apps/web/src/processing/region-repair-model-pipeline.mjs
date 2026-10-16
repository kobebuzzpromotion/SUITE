import {assertPixels, checkAbort} from './pure.mjs';
import {createSubjectSegmenter, thresholdAnalysisMask} from './subject-segmentation.mjs';
import {createHandRegionDetector} from './region-repair-hand-detector.mjs';
import {checkedRegion, copyFrame} from './region-repair-core.mjs';
import {applyClothingAdjustments} from './clothing-adjustments.mjs';
import {applyHandsAdjustments} from './hands-adjustments.mjs';
import {applyTeethAdjustments} from './teeth-adjustments.mjs';
import {estimateTeethRows} from './region-repair-teeth-geometry.mjs';

/** Real segmentation -> selected region -> existing pixel processors.
 * Model inventory must supply garment/hand/teeth semantic labels respectively;
 * person segmentation or a face oval is not a substitute for those classes.
 * Owner selection restricts analysis to one intended person/garment. The model
 * output cannot manufacture manual provenance, identity or permission claims.
 */
export async function createRegionRepairModelPipeline({kind, segmentation,
  handLandmarks, threshold = .6} = {}, {signal} = {}) {
  if (!['clothing', 'hands', 'teeth'].includes(kind) || !Number.isFinite(threshold) ||
      threshold <= 0 || threshold >= 1) throw Error('REGION_MODEL_PIPELINE_INVALID');
  const segmenter = await createSubjectSegmenter(segmentation, {signal});
  let detector;
  try {
    if (kind === 'hands' && handLandmarks) detector = await createHandRegionDetector(handLandmarks, {signal});
    checkAbort(signal);
  } catch (error) {segmenter.close(); detector?.close(); throw error;}
  let closed = false;
  return Object.freeze({
    async apply(frame, ownerMask, settings, context, {signal, ...options} = {}) {
      checkAbort(signal); assertPixels(frame);
      if (closed) throw Error('REGION_MODEL_PIPELINE_CLOSED');
      const source = copyFrame(frame);
      // Snapshot caller-owned settings/geometry before asynchronous model work.
      const fixed = structuredClone({ownerMask, settings, context, options});
      const selected = checkedRegion(source, fixed.ownerMask?.data, fixed.options.protection, signal);
      const analysis = await segmenter.segment(source, {signal});
      checkAbort(signal);
      if (closed) throw Error('REGION_MODEL_PIPELINE_CLOSED');
      const mask = thresholdAnalysisMask(analysis, threshold);
      for (let i = 0; i < mask.data.length; i++) {
        if ((i & 16383) === 0) checkAbort(signal);
        mask.data[i] = Math.round(mask.data[i] * selected[i] / 255);
      }
      if (!mask.data.some(Boolean)) throw Error('REGION_MODEL_SELECTION_EMPTY');
      // The narrowed mask is an intersection with supplied owner coverage;
      // no manual document or provenance is synthesized from model output.
      const narrowed = {...fixed.ownerMask, data: mask.data};
      const operationOptions = {...fixed.options, protection: undefined, signal};
      let pixels, hand, geometry;
      if (kind === 'clothing') pixels = applyClothingAdjustments(source, mask.data, fixed.settings, operationOptions);
      else if (kind === 'teeth') {
        if (fixed.settings?.alignment && !operationOptions.rows) {
          geometry = estimateTeethRows(source, mask.data, {signal});
          if (geometry.needsManual) {
            const error = Error('TEETH_INSTANCE_SELECTION_REQUIRED');
            error.analysis = geometry; throw error;
          }
          operationOptions.rows = geometry.rows;
        }
        pixels = applyTeethAdjustments(source, narrowed, fixed.settings, fixed.context, operationOptions);
      }
      else if (detector && fixed.settings?.reshape) {
        const result = detector.apply(source, narrowed, fixed.settings, fixed.context, operationOptions);
        pixels = result.pixels; hand = result.hand;
      } else pixels = applyHandsAdjustments(source, narrowed, fixed.settings, fixed.context, operationOptions);
      checkAbort(signal);
      return {pixels, mask, hand, geometry, analysis: analysis.analysis};
    },
    close() {if (!closed) {closed = true; segmenter.close(); detector?.close();}}
  });
}
