import {assertPixels, checkAbort} from './pure.mjs';
import {applyManualTeethWhitening} from './manual-teeth-whitening.mjs';
import {createMaskedInpaintONNX} from './masked-inpaint-onnx.mjs';
import {checkedRegion, clamp, copyFrame, extractSeedRegion, localMean, luminance,
  number, repairRegion, warpRegion} from './region-repair-core.mjs';

export const TEETH_ADJUSTMENTS_VERSION = 'suite-teeth-local-repair-alignment-1';

/** Seed connected light, low-red pixels inside an explicit inner-mouth mask.
 * Requires visible natural teeth seeds. It can miss stained teeth or include
 * specular highlights; result is a selection proposal, not a dental model. */
export function extractTeethRegion(frame, innerMouth, seeds, {minBrightness = 55,
  maxRedExcess = 35, tolerance = 90, signal} = {}) {
  number(minBrightness, 0, 255); number(maxRedExcess, 0, 100);
  const allowed = checkedRegion(frame, innerMouth, undefined, signal);
  const light = luminance(frame);
  for (let i = 0; i < allowed.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const p = i * 4;
    if (light[i] < minBrightness || frame.data[p] - frame.data[p + 1] > maxRedExcess) allowed[i] = 0;
  }
  return extractSeedRegion(frame, allowed, seeds, {tolerance, signal});
}

/** Dark/stained local residuals, not braces diagnosis or automatic gap repair. */
export function detectTeethFlaws(frame, teeth, {threshold = 20, radius = 3, signal} = {}) {
  number(threshold, 1, 100);
  const coverage = checkedRegion(frame, teeth, undefined, signal), luma = luminance(frame);
  const mean = localMean(luma, coverage, frame.width, frame.height, radius, signal);
  const out = new Uint8Array(coverage.length);
  for (let i = 0; i < out.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    if (mean[i] - luma[i] > threshold) out[i] = coverage[i];
  }
  return out;
}

/** Build limited five-level row alignment from explicitly identified tooth
 * centers and radii. Neither tooth detection nor age inference is performed.
 * Levels move existing pixels; they do not generate missing dental anatomy. */
export function teethAlignmentControls(rows, level, adultConfirmed, width, height) {
  if (adultConfirmed !== true) throw Error('TEETH_ADULT_CONFIRMATION_REQUIRED');
  if (!Number.isSafeInteger(level) || level < 1 || level > 5 ||
      !Array.isArray(rows) || !rows.length || rows.length > 2)
    throw Error('TEETH_ALIGNMENT_INPUT_INVALID');
  const controls = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2 || row.length > 16) throw Error('TEETH_ROW_INVALID');
    const points = row.map(p => {
      number(p?.x, 0, width - 1); number(p?.y, 0, height - 1);
      number(p?.radius, 2, Math.max(width, height)); return {...p};
    }).sort((a, b) => a.x - b.x);
    if (points.some((p, i) => i && p.x === points[i - 1].x)) throw Error('TEETH_ROW_DEGENERATE');
    const first = points[0], last = points[points.length - 1];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], fraction = i / (points.length - 1);
      const targetX = first.x + (last.x - first.x) * fraction;
      // Retain row tilt instead of flattening all teeth horizontally.
      const targetY = first.y + (last.y - first.y) * fraction;
      controls.push({...p, dx: clamp(targetX - p.x, -p.radius * .18, p.radius * .18) * level / 5,
        dy: clamp(targetY - p.y, -p.radius * .18, p.radius * .18) * level / 5});
    }
  }
  return controls;
}

/** Natural-teeth adjustments. Edge defects require explicit source and target
 * control points; no expansion into unselected lips/gums. Whitening reuses the
 * existing Asset/person/Recipe-bound processor. No generated teeth accepted. */
export function applyTeethAdjustments(frame, mask, settings, context, {
  defects, edgeControls, rows, adultConfirmed = false,
  naturalTeeth = false, protection, signal} = {}) {
  const {whitening = false, brightness = 0, desaturation = 0,
    flaws = 0, edge = 0, alignment = 0} = settings ?? {};
  if (typeof whitening !== 'boolean') throw Error('TEETH_WHITENING_SWITCH_INVALID');
  number(brightness, -100, 100); number(desaturation, 0, 100);
  number(flaws, 0, 1); number(edge, 0, 1);
  if (!Number.isSafeInteger(alignment) || alignment < 0 || alignment > 5)
    throw Error('TEETH_ALIGNMENT_LEVEL_INVALID');
  if (!whitening && (brightness || desaturation)) throw Error('TEETH_WHITENING_PARENT_REQUIRED');
  if ((flaws || edge || alignment) && naturalTeeth !== true) throw Error('TEETH_NATURAL_SELECTION_REQUIRED');
  // Validate supplied legacy mask/binding even with all controls neutral.
  let out = applyManualTeethWhitening(frame, mask, {brightness: 0, desaturation: 0}, context, {signal});
  const coverage = checkedRegion(frame, mask.data, protection, signal);
  if (flaws) out = repairRegion(out, defects ?? detectTeethFlaws(frame, coverage, {signal}),
    coverage, {strength: flaws, signal});
  if (edge) {
    if (!Array.isArray(edgeControls) || !edgeControls.length) throw Error('TEETH_EDGE_CONTROLS_REQUIRED');
    out = warpRegion(out, coverage, edgeControls, {strength: edge, signal});
  }
  if (alignment) out = warpRegion(out, coverage,
    teethAlignmentControls(rows, alignment, adultConfirmed, frame.width, frame.height), {signal});
  if (whitening) out = applyManualTeethWhitening(out, {...mask, data: coverage},
    {brightness, desaturation}, context, {signal});
  return out;
}

/** Composite an EXISTING, explicitly supplied same-frame replacement result.
 * No model generation occurs here. Caller must authenticate result origin and
 * reuse one immutable canonical result for preview/final; face/lips outside
 * approved mask and input alpha remain unchanged. */
export function compositeTeethReplacement(frame, replacement, approvedMask,
  {strength = 1, protection, signal} = {}) {
  number(strength, 0, 1); assertPixels(replacement);
  const coverage = checkedRegion(frame, approvedMask, protection, signal);
  if (replacement.width !== frame.width || replacement.height !== frame.height ||
      !(replacement.data.buffer instanceof ArrayBuffer)) throw Error('TEETH_REPLACEMENT_FRAME_INVALID');
  const out = copyFrame(frame);
  for (let i = 0; i < coverage.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const p = i * 4, weight = coverage[i] / 255 * replacement.data[p + 3] / 255 * strength;
    for (let c = 0; c < 3; c++) out.data[p + c] = Math.round(frame.data[p + c] * (1 - weight) + replacement.data[p + c] * weight);
  }
  return out;
}

/** Actual model-backed replacement path, not a callback stub. Requires a
 * separately supplied, licensed dental image+mask ONNX model and its documented
 * IO/ranges plus ONNX Runtime. A generic inpaint model is not qualified merely
 * by passing this function. The host must assess dental/identity quality and
 * persist this single result as a canonical asset rather than regenerate Final.
 */
export async function createPrettyTeethProcessor(modelOptions, {signal} = {}) {
  const runtime = await createMaskedInpaintONNX(modelOptions, {signal});
  return Object.freeze({modelSHA256: runtime.modelSHA256,
    async generate(frame, mask, context, {protection, signal} = {}) {
      checkAbort(signal);
      // Existing manual-teeth provenance/person/revision checks are structural,
      // not an authorization substitute. No age inference or photo upload.
      const source = applyManualTeethWhitening(frame, mask,
        {brightness: 0, desaturation: 0}, context, {signal});
      const coverage = checkedRegion(source, mask.data, protection, signal);
      if (!coverage.some(Boolean)) throw Error('TEETH_REPLACEMENT_SELECTION_EMPTY');
      const result = await runtime.inpaint(source,
        {width: source.width, height: source.height, data: coverage}, {signal});
      checkAbort(signal);
      return {pixels: {...source, data: result.data}, modelSHA256: runtime.modelSHA256,
        operation: 'model-teeth-replacement', requiresCanonicalAssetPersistence: true};
    },
    close: () => runtime.close()});
}
