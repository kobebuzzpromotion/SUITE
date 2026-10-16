import {checkAbort} from './pure.mjs';
import {checkedRegion, copyFrame, extractSeedRegion, localMean, luminance,
  number, repairRegion, smoothRegionBands, warpRegion} from './region-repair-core.mjs';
export {applyManualClothingSpot} from './manual-clothing-spot.mjs';

export const CLOTHING_ADJUSTMENTS_VERSION = 'suite-clothing-multiscale-1';
export const extractClothingRegion = extractSeedRegion;

/** High-contrast isolated flecks inside a supplied garment. Seams/patterns can
 * also trigger: returned proposals need correction/review, not AI certainty. */
export function detectClothingFlecks(frame, garment, {threshold = 30, radius = 3,
  maxComponentPixels = 48, protection, signal} = {}) {
  number(threshold, 1, 255);
  if (!Number.isSafeInteger(maxComponentPixels) || maxComponentPixels < 1 || maxComponentPixels > 512)
    throw Error('CLOTHING_COMPONENT_LIMIT_INVALID');
  const coverage = checkedRegion(frame, garment, protection, signal);
  const luma = luminance(frame), mean = localMean(luma, coverage, frame.width, frame.height, radius, signal);
  const candidate = new Uint8Array(coverage.length), output = new Uint8Array(coverage.length);
  for (let i = 0; i < candidate.length; i++)
    if (coverage[i] && Math.abs(luma[i] - mean[i]) >= threshold) candidate[i] = 1;
  const queue = new Uint32Array(coverage.length);
  for (let start = 0; start < candidate.length; start++) {
    if ((start & 16383) === 0) checkAbort(signal);
    if (!candidate[start]) continue;
    let head = 0, tail = 1; queue[0] = start; candidate[start] = 0;
    while (head < tail) {
      if ((head & 4095) === 0) checkAbort(signal);
      const i = queue[head++];
      for (const j of [i % frame.width ? i - 1 : -1,
        i % frame.width < frame.width - 1 ? i + 1 : -1, i - frame.width, i + frame.width])
        if (j >= 0 && j < candidate.length && candidate[j]) {candidate[j] = 0; queue[tail++] = j;}
    }
    if (tail <= maxComponentPixels) for (let k = 0; k < tail; k++) output[queue[k]] = coverage[queue[k]];
  }
  return output;
}

/** All controls use 0..1. Fine/coarse depend on dewrinkle. Edge controls are
 * explicit target-space displacement handles, refinements restrict their mask.
 * Protection excludes both destination edits and warp sampling. No age/gender
 * classification, automatic garment recognition or learned cloth reconstruction.
 */
export function applyClothingAdjustments(frame, garment, settings, {
  defects, edgeMask, edgeControls = [], protection, signal} = {}) {
  const {dewrinkle = 0, fineWrinkles = 0, coarseWrinkles = 0,
    blemishes = 0, edgeSmoothing = 0, radius = 4} = settings ?? {};
  for (const value of [dewrinkle, fineWrinkles, coarseWrinkles, blemishes, edgeSmoothing]) number(value, 0, 1);
  if (!dewrinkle && (fineWrinkles || coarseWrinkles)) throw Error('CLOTHING_PARENT_EFFECT_REQUIRED');
  const coverage = checkedRegion(frame, garment, protection, signal);
  let out = dewrinkle ? smoothRegionBands(frame, coverage,
    {fine: dewrinkle * (.35 + .65 * fineWrinkles), coarse: dewrinkle * coarseWrinkles, radius, signal}) : copyFrame(frame);
  if (blemishes) {
    const selected = defects ?? detectClothingFlecks(frame, coverage, {signal});
    out = repairRegion(out, selected, coverage, {strength: blemishes, signal});
  }
  if (edgeSmoothing) {
    if (!edgeMask || !edgeControls.length) throw Error('CLOTHING_EDGE_SELECTION_REQUIRED');
    const edges = checkedRegion(frame, edgeMask, protection, signal);
    for (let i = 0; i < edges.length; i++) edges[i] = Math.round(edges[i] * coverage[i] / 255);
    out = warpRegion(out, edges, edgeControls, {strength: edgeSmoothing, signal});
  }
  return out;
}
