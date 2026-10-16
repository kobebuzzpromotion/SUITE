import {assertPixels, checkAbort} from './pure.mjs';
import {authorSubjectMask, SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {validateBWEdgeManualContract, BW_EDGE_MANUAL_MAX_PIXELS} from './bw-edge-manual-contract.mjs';

export const BW_EDGE_CORRECTION_MASK_VERSION = 'suite-owner-manual-bw-edge-two-role-masks-1';
const PROXY_MAX_EDGE = 1600;

function targetDimensions(binding, target) {
  if (target === 'source') return {width: binding.sourceWidth, height: binding.sourceHeight};
  if (target !== 'proxy') throw Error('BW_EDGE_MANUAL_TARGET_INVALID');
  // Match makeProxyPixels() for the unrotated, uncropped upright source frame.
  const scale = Math.min(1, PROXY_MAX_EDGE / Math.max(binding.sourceWidth, binding.sourceHeight));
  return {width: Math.max(1, Math.round(binding.sourceWidth * scale)),
    height: Math.max(1, Math.round(binding.sourceHeight * scale))};
}

function workFor(strokes, width, height, signal) {
  let total = 0;
  for (const stroke of strokes) {
    checkAbort(signal);
    const radius = Math.max(.75, stroke.radiusFraction * Math.min(width, height));
    let union = null;
    for (let index = 0; index < stroke.path.length; index++) {
      if ((index & 63) === 0) checkAbort(signal);
      const a = stroke.path[Math.max(0, index - 1)], b = stroke.path[index];
      const ax = a.u * width, bx = b.u * width, ay = a.v * height, by = b.v * height;
      const left = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1));
      const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
      const top = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1));
      const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius + 1));
      total += (right - left + 1) * (bottom - top + 1);
      union = union ? {left: Math.min(union.left, left), right: Math.max(union.right, right),
        top: Math.min(union.top, top), bottom: Math.max(union.bottom, bottom)} :
        {left, right, top, bottom};
      if (total > SUBJECT_MASK_MAX_WORK) throw Error('BW_EDGE_MANUAL_WORK_LIMIT');
    }
    total += 2 * (union.right - union.left + 1) * (union.bottom - union.top + 1);
    if (total > SUBJECT_MASK_MAX_WORK) throw Error('BW_EDGE_MANUAL_WORK_LIMIT');
  }
  return total;
}

/**
 * Rasterize two distinct owner-authored layers from a separately validated
 * document. The caller must obtain genuine permissionEvidence from an
 * authenticated Asset authority; confirmedSelections is not authentication.
 * The target must be the full upright source or its exact 1600px Proxy, never
 * a post-rotation/crop frame. This function neither saves nor edits Original.
 */
export function rasterizeBWEdgeManualMasks(pixels, document, runtime,
  {target, signal} = {}) {
  checkAbort(signal);
  const validated = validateBWEdgeManualContract(document, runtime, {signal});
  const {binding, subjectStrokes, correctionStrokes} = validated.document;
  if (Number.isSafeInteger(pixels?.width) && Number.isSafeInteger(pixels?.height) &&
      pixels.width > 0 && pixels.height > 0 &&
      pixels.width * pixels.height > BW_EDGE_MANUAL_MAX_PIXELS)
    throw Error('BW_EDGE_MANUAL_CAPACITY');
  assertPixels(pixels);
  const expected = targetDimensions(binding, target);
  if (pixels.width !== expected.width || pixels.height !== expected.height)
    throw Error('BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH');
  workFor([...subjectStrokes, ...correctionStrokes], pixels.width, pixels.height, signal);
  const context = {assetID: binding.assetID, originalSHA256: binding.originalSHA256,
    savedRevision: validated.context.savedRevision};
  // authorSubjectMask supplies the exact normalized capsule/feather/erase
  // rules, bounds, alpha-zero suppression and per-layer work/abort checks.
  const subjectMask = authorSubjectMask(pixels, subjectStrokes, context,
    {ownerConfirmed: true, signal});
  const coverage = authorSubjectMask(pixels, correctionStrokes, context,
    {ownerConfirmed: true, signal});
  checkAbort(signal);
  const correctionMask = {width: pixels.width, height: pixels.height,
    data: coverage.data, provenance: Object.freeze({
      kind: validated.maskRoles.correction.kind,
      source: validated.maskRoles.correction.source,
      assetID: binding.assetID, originalSHA256: binding.originalSHA256,
      savedRevision: validated.context.savedRevision,
      sourceWidth: binding.sourceWidth, sourceHeight: binding.sourceHeight,
      target, width: pixels.width, height: pixels.height})};
  return Object.freeze({subjectMask, correctionMask});
}
