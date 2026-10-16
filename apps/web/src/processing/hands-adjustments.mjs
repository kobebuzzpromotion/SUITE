import {checkAbort} from './pure.mjs';
import {applyManualHandTone} from './manual-hand-tone.mjs';
import {checkedRegion, clamp, extractSeedRegion, localMean, luminance,
  number, repairRegion, warpRegion} from './region-repair-core.mjs';

export const HANDS_ADJUSTMENTS_VERSION = 'suite-hand-local-repair-warp-1';
export const extractHandRegion = extractSeedRegion;

/** Dark/blue-green local residual proposal, restricted to an explicit hand/arm.
 * Shadows, creases and tattoos may match too; this is not a vein classifier. */
export function detectHandVeinCandidates(frame, hand, {radius = 5,
  threshold = 8, protection, signal} = {}) {
  number(threshold, 1, 80);
  const coverage = checkedRegion(frame, hand, protection, signal);
  const luma = luminance(frame), mean = localMean(luma, coverage, frame.width, frame.height, radius, signal);
  const red = new Float32Array(coverage.length), blueGreen = new Float32Array(coverage.length);
  for (let i = 0; i < coverage.length; i++) {red[i] = frame.data[i * 4];
    blueGreen[i] = (frame.data[i * 4 + 1] + frame.data[i * 4 + 2]) / 2;}
  const redMean = localMean(red, coverage, frame.width, frame.height, radius, signal);
  const bgMean = localMean(blueGreen, coverage, frame.width, frame.height, radius, signal);
  const mask = new Uint8Array(coverage.length);
  for (let i = 0; i < mask.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const darkness = mean[i] - luma[i];
    const chroma = (blueGreen[i] - red[i]) - (bgMean[i] - redMean[i]);
    if (darkness > threshold && chroma > 1)
      mask[i] = Math.round(coverage[i] * clamp((darkness - threshold) / threshold, 0, 1));
  }
  return mask;
}

/** Build inward side handles from explicit 21-point hand landmarks (target
 * pixels). A detector/owner must supply these; never interpret face points as hands. */
export function handSlimmingControls(points, width, height) {
  if (!Array.isArray(points) || points.length !== 21) throw Error('HAND_LANDMARKS_REQUIRED');
  for (const p of points) {number(p?.x, 0, width - 1); number(p?.y, 0, height - 1);}
  const span = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
  if (span < 4) throw Error('HAND_LANDMARKS_DEGENERATE');
  const controls = [];
  for (const [a, b] of [[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],
    [13,14],[14,15],[15,16],[17,18],[18,19],[19,20]]) {
    const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y, length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const nx = -dy / length, ny = dx / length, halfWidth = span * .075;
    for (const sign of [-1, 1]) {
      const x = (points[a].x + points[b].x) / 2 + nx * halfWidth * sign;
      const y = (points[a].y + points[b].y) / 2 + ny * halfWidth * sign;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      controls.push({x, y, radius: Math.max(2, halfWidth * 2), dx: -nx * halfWidth * .22 * sign,
        dy: -ny * halfWidth * .22 * sign});
    }
  }
  const center = {x: (points[0].x + points[9].x) / 2, y: (points[0].y + points[9].y) / 2};
  for (const index of [5,17]) {
    const p = points[index], radius = span * .65;
    controls.push({x: p.x, y: p.y, radius, dx: clamp((center.x - p.x) * .12, -radius * .2, radius * .2),
      dy: clamp((center.y - p.y) * .12, -radius * .2, radius * .2)});
  }
  return controls;
}

/** Reuses existing bound manual tone processor; optional repair and warp stay
 * inside that same owner-selected hand mask and leave source alpha unchanged. */
export function applyHandsAdjustments(frame, mask, settings, context, {
  veinMask, landmarks, controls, protection, signal} = {}) {
  const {even = 0, vein = 0, reshape = 0, radiusSourcePixels = 4} = settings ?? {};
  for (const value of [even, vein, reshape]) number(value, 0, 1);
  // Validate binding and manual role even if the tone amount is zero.
  let out = applyManualHandTone(frame, mask, {strength: 0, radiusSourcePixels}, context, {signal});
  const coverage = checkedRegion(frame, mask.data, protection, signal);
  if (even) out = applyManualHandTone(frame, {...mask, data: coverage},
    {strength: even, radiusSourcePixels}, context, {signal});
  if (vein) out = repairRegion(out, veinMask ?? detectHandVeinCandidates(frame, coverage, {signal}),
    coverage, {strength: vein, signal});
  if (reshape) out = warpRegion(out, coverage,
    controls ?? handSlimmingControls(landmarks, frame.width, frame.height), {strength: reshape, signal});
  return out;
}
