import {checkAbort} from './pure.mjs';
import {checkedRegion} from './region-repair-core.mjs';

/** Connected visible tooth components, never invented equal-spaced centers.
 * A whole-mouth semantic mask often merges touching teeth: such components
 * require manual separation or a tooth-instance model. Confidence is geometric
 * heuristic quality, not a calibrated model score or dental diagnosis.
 */
export function estimateTeethRows(frame, teethMask, {threshold = 192, signal} = {}) {
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 255)
    throw Error('TEETH_GEOMETRY_THRESHOLD_INVALID');
  const coverage = checkedRegion(frame, teethMask, undefined, signal);
  const visited = new Uint8Array(coverage.length), queue = new Uint32Array(coverage.length);
  const components = [];
  for (let start = 0; start < coverage.length; start++) {
    if ((start & 16383) === 0) checkAbort(signal);
    if (visited[start] || coverage[start] < threshold) continue;
    let head = 0, tail = 1, sx = 0, sy = 0, weight = 0;
    let left = frame.width, right = 0, top = frame.height, bottom = 0;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      if ((head & 4095) === 0) checkAbort(signal);
      const i = queue[head++], x = i % frame.width, y = Math.floor(i / frame.width), w = coverage[i];
      sx += x * w; sy += y * w; weight += w;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const j of [x ? i - 1 : -1, x < frame.width - 1 ? i + 1 : -1,
        i - frame.width, i + frame.width]) {
        if (j >= 0 && j < coverage.length && !visited[j] && coverage[j] >= threshold) {
          visited[j] = 1; queue[tail++] = j;
        }
      }
    }
    if (tail < 4) continue;
    components.push({x: sx / weight, y: sy / weight, radius: Math.max(2, Math.max(right - left + 1, bottom - top + 1) * .7),
      bounds: {left, right, top, bottom}, area: tail});
    if (components.length > 32) return {rows: [], components, confidence: 0, needsManual: true,
      reasons: ['too-many-components-or-noise']};
  }
  const reasons = [];
  if (components.length < 2) reasons.push('touching-teeth-or-insufficient-visible-components');
  if (components.some(c => (c.bounds.right - c.bounds.left + 1) /
      (c.bounds.bottom - c.bounds.top + 1) > 1.6)) reasons.push('wide-component-may-contain-multiple-teeth');
  const heights = components.map(c => c.bounds.bottom - c.bounds.top + 1).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 1;
  if (components.some(c => c.area < medianHeight * medianHeight * .08)) reasons.push('small-fragment-ambiguity');
  const byY = [...components].sort((a, b) => a.y - b.y);
  let gap = 0, split = -1;
  for (let i = 1; i < byY.length; i++) if (byY[i].y - byY[i - 1].y > gap) {
    gap = byY[i].y - byY[i - 1].y; split = i;
  }
  const groups = split > 0 && gap > medianHeight * .55 ? [byY.slice(0, split), byY.slice(split)] : [byY];
  if (groups.some(row => row.length < 2 || row.length > 16)) reasons.push('row-component-count-ambiguous');
  for (const row of groups) {
    row.sort((a, b) => a.x - b.x);
    if (row.some((c, i) => i && c.bounds.left <= row[i - 1].bounds.right))
      reasons.push('components-overlap-horizontal-order');
    if (row.length && Math.max(...row.map(c => c.y)) - Math.min(...row.map(c => c.y)) > medianHeight * .8)
      reasons.push('row-tilt-or-grouping-ambiguous');
  }
  const rows = groups.filter(row => row.length).map(row => row.map(({x, y, radius}) => ({x, y, radius})));
  return {rows, components, confidence: reasons.length ? .2 : .7,
    needsManual: reasons.length > 0, reasons: [...new Set(reasons)]};
}
