import {assertPixels, checkAbort} from './pure.mjs';

// Deterministic sRGB8 region tools. Masks/points are supplied selections, not
// authenticated anatomy, segmentation-model outputs or permission evidence.
export const REGION_REPAIR_VERSION = 'suite-region-repair-1';
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const copyFrame = frame => ({...frame, data: new Uint8ClampedArray(frame.data)});
export function number(value, lo, hi) {
  if (!Number.isFinite(value) || value < lo || value > hi) throw Error('REGION_SETTING_INVALID');
  return value;
}
export function checkedRegion(frame, mask, protection, signal) {
  return checkedRegionBounded(frame, mask, protection, signal, 8_000_000);
}
/** Explicit full-frame clone path only. Other region algorithms keep their
 * existing 8MP entry point and allocation/work limits. */
export function checkedCloneRegion24MP(frame, mask, protection, signal) {
  return checkedRegionBounded(frame, mask, protection, signal, 24_000_000);
}
function checkedRegionBounded(frame, mask, protection, signal, maxPixels) {
  checkAbort(signal); assertPixels(frame);
  const size = frame.width * frame.height;
  if (size > maxPixels || !(frame.data.buffer instanceof ArrayBuffer))
    throw Error('REGION_FRAME_CAPACITY_OR_SHARED');
  const check = value => {
    if (!(value instanceof Uint8Array || value instanceof Uint8ClampedArray) ||
        value.length !== size || !(value.buffer instanceof ArrayBuffer))
      throw Error('REGION_MASK_INVALID');
  };
  check(mask); if (protection !== undefined) check(protection);
  const coverage = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    coverage[i] = frame.data[i * 4 + 3] ?
      Math.round(mask[i] * (1 - (protection?.[i] ?? 0) / 255)) : 0;
  }
  return coverage;
}
export function luminance(frame) {
  const out = new Float32Array(frame.width * frame.height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = .2126 * frame.data[p] + .7152 * frame.data[p + 1] + .0722 * frame.data[p + 2];
  }
  return out;
}

// Separable normalized box filter; zero-weight pixels never contribute.
export function localMean(values, coverage, width, height, radius, signal) {
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > 128)
    throw Error('REGION_RADIUS_INVALID');
  const sums = new Float32Array(values.length), weights = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    let sum = 0, weight = 0;
    for (let x = 0; x < Math.min(radius, width); x++) {
      const i = y * width + x; sum += values[i] * coverage[i]; weight += coverage[i];
    }
    for (let x = 0; x < width; x++) {
      if (x + radius < width) {const i = y * width + x + radius;
        sum += values[i] * coverage[i]; weight += coverage[i];}
      if (x - radius - 1 >= 0) {const i = y * width + x - radius - 1;
        sum -= values[i] * coverage[i]; weight -= coverage[i];}
      const i = y * width + x; sums[i] = sum; weights[i] = weight;
    }
  }
  const result = new Float32Array(values.length);
  for (let x = 0; x < width; x++) {
    if ((x & 127) === 0) checkAbort(signal);
    let sum = 0, weight = 0;
    for (let y = 0; y < Math.min(radius, height); y++) {
      sum += sums[y * width + x]; weight += weights[y * width + x];
    }
    for (let y = 0; y < height; y++) {
      if (y + radius < height) {sum += sums[(y + radius) * width + x]; weight += weights[(y + radius) * width + x];}
      if (y - radius - 1 >= 0) {sum -= sums[(y - radius - 1) * width + x]; weight -= weights[(y - radius - 1) * width + x];}
      const i = y * width + x; result[i] = weight > 0 ? sum / weight : values[i];
    }
  }
  return result;
}

/** Seed-connected RGB similarity within an explicit search mask. Not semantic recognition. */
export function extractSeedRegion(frame, searchMask, seeds, {tolerance = 45, signal} = {}) {
  const coverage = checkedRegion(frame, searchMask, undefined, signal);
  number(tolerance, 1, 200);
  if (!Array.isArray(seeds) || !seeds.length || seeds.length > 64)
    throw Error('REGION_SEEDS_INVALID');
  const references = seeds.map(point => {
    if (!Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y) ||
        point.x < 0 || point.y < 0 || point.x >= frame.width || point.y >= frame.height)
      throw Error('REGION_SEED_INVALID');
    const i = point.y * frame.width + point.x;
    if (!coverage[i]) throw Error('REGION_SEED_OUTSIDE');
    return i;
  });
  const selected = new Uint8Array(coverage.length), visited = new Uint8Array(coverage.length);
  const queue = new Uint32Array(coverage.length); let head = 0, tail = 0;
  for (const i of references) if (!visited[i]) {visited[i] = 1; queue[tail++] = i;}
  while (head < tail) {
    if ((head & 4095) === 0) checkAbort(signal);
    const i = queue[head++], p = i * 4;
    if (!references.some(ref => {
      const q = ref * 4;
      return Math.hypot(frame.data[p] - frame.data[q], frame.data[p + 1] - frame.data[q + 1],
        frame.data[p + 2] - frame.data[q + 2]) <= tolerance;
    })) continue;
    selected[i] = coverage[i];
    for (const j of [i % frame.width ? i - 1 : -1,
      i % frame.width < frame.width - 1 ? i + 1 : -1, i - frame.width, i + frame.width]) {
      if (j >= 0 && j < coverage.length && coverage[j] && !visited[j]) {
        visited[j] = 1; queue[tail++] = j;
      }
    }
  }
  return selected;
}

/** Remove bounded fine/coarse luma bands while retaining high-frequency texture. */
export function smoothRegionBands(frame, mask, {fine = 0, coarse = 0, radius = 4,
  protection, signal} = {}) {
  number(fine, 0, 1); number(coarse, 0, 1);
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > 32) throw Error('REGION_RADIUS_INVALID');
  const coverage = checkedRegion(frame, mask, protection, signal), luma = luminance(frame);
  const small = localMean(luma, coverage, frame.width, frame.height, Math.max(1, Math.floor(radius / 2)), signal);
  const medium = localMean(luma, coverage, frame.width, frame.height, radius, signal);
  const large = localMean(luma, coverage, frame.width, frame.height, radius * 4, signal);
  const out = copyFrame(frame);
  for (let i = 0; i < coverage.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    const delta = clamp((medium[i] - small[i]) * fine + (large[i] - medium[i]) * coarse, -32, 32) * coverage[i] / 255;
    for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round(frame.data[i * 4 + c] + delta);
  }
  return out;
}

/** Iterative neighbor diffusion from unselected pixels inside the same domain.
 * Broad missing areas without a known boundary fail, never invent texture.
 */
export function repairRegion(frame, defects, domain, {strength = 1, iterations = 24,
  protection, signal} = {}) {
  number(strength, 0, 1);
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 64)
    throw Error('REGION_REPAIR_ITERATIONS_INVALID');
  const allowed = checkedRegion(frame, domain, protection, signal);
  const damage = checkedRegion(frame, defects, protection, signal);
  const indices = [];
  for (let i = 0; i < damage.length; i++) if (damage[i] && allowed[i]) indices.push(i);
  if (indices.length * iterations > 16_000_000) throw Error('REGION_REPAIR_WORK_CAPACITY');
  if (!indices.length || strength === 0) return copyFrame(frame);
  const known = new Uint8Array(allowed.length);
  for (let i = 0; i < known.length; i++) known[i] = allowed[i] && !damage[i] ? 1 : 0;
  let colors = new Float32Array(frame.data), remaining = indices.length;
  for (let pass = 0; pass < iterations; pass++) {
    checkAbort(signal);
    const next = new Float32Array(colors), newlyKnown = [];
    for (let k = 0; k < indices.length; k++) {
      if ((k & 4095) === 0) checkAbort(signal);
      const i = indices[k], near = [i % frame.width ? i - 1 : -1,
        i % frame.width < frame.width - 1 ? i + 1 : -1, i - frame.width, i + frame.width];
      let total = 0, red = 0, green = 0, blue = 0;
      for (const j of near) if (j >= 0 && j < known.length && known[j] && allowed[j]) {
        const weight = allowed[j] * frame.data[j * 4 + 3]; total += weight;
        red += colors[j * 4] * weight; green += colors[j * 4 + 1] * weight; blue += colors[j * 4 + 2] * weight;
      }
      if (!total) continue;
      next[i * 4] = red / total; next[i * 4 + 1] = green / total; next[i * 4 + 2] = blue / total;
      if (!known[i]) newlyKnown.push(i);
    }
    for (const i of newlyKnown) {known[i] = 1; remaining--;}
    colors = next;
  }
  if (remaining) throw Error('REGION_REPAIR_BOUNDARY_UNREACHABLE');
  const out = copyFrame(frame);
  for (const i of indices) {
    const weight = damage[i] / 255 * allowed[i] / 255 * strength;
    for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round(frame.data[i * 4 + c] * (1 - weight) + colors[i * 4 + c] * weight);
  }
  checkAbort(signal); return out;
}

/** Compact-support inverse warp, bounded displacement, protected sampling. */
export function warpRegion(frame, mask, controls, {strength = 1, protection, signal} = {}) {
  number(strength, 0, 1);
  const coverage = checkedRegion(frame, mask, protection, signal);
  if (!Array.isArray(controls) || controls.length > 64) throw Error('REGION_WARP_CONTROLS_INVALID');
  const points = controls.map(p => {
    number(p?.x, 0, frame.width - 1); number(p?.y, 0, frame.height - 1);
    number(p?.radius, 1, Math.max(frame.width, frame.height));
    number(p?.dx, -p.radius * .2, p.radius * .2); number(p?.dy, -p.radius * .2, p.radius * .2);
    return {...p};
  });
  if (points.length * coverage.length > 80_000_000) throw Error('REGION_WARP_WORK_CAPACITY');
  const out = copyFrame(frame);
  for (let y = 0; y < frame.height; y++) {
    checkAbort(signal);
    for (let x = 0; x < frame.width; x++) {
      const i = y * frame.width + x; if (!coverage[i]) continue;
      let dx = 0, dy = 0, total = 0;
      for (const p of points) {
        const distance = Math.hypot(x - p.x, y - p.y) / p.radius;
        if (distance >= 1) continue;
        const weight = (1 - distance * distance) ** 2;
        dx += p.dx * weight; dy += p.dy * weight; total += weight;
      }
      const scale = strength / Math.max(1, total);
      const sx = x - dx * scale, sy = y - dy * scale;
      if (sx < 0 || sy < 0 || sx > frame.width - 1 || sy > frame.height - 1) continue;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const neighbors = [y0 * frame.width + x0, y0 * frame.width + Math.min(x0 + 1, frame.width - 1),
        Math.min(y0 + 1, frame.height - 1) * frame.width + x0,
        Math.min(y0 + 1, frame.height - 1) * frame.width + Math.min(x0 + 1, frame.width - 1)];
      if (neighbors.some(j => !coverage[j] || !frame.data[j * 4 + 3])) continue;
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let alpha = 0; const rgb = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const a = weights[k] * frame.data[neighbors[k] * 4 + 3]; alpha += a;
        for (let c = 0; c < 3; c++) rgb[c] += frame.data[neighbors[k] * 4 + c] * a;
      }
      const blend = coverage[i] / 255;
      for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round(frame.data[i * 4 + c] * (1 - blend) + rgb[c] / alpha * blend);
    }
  }
  checkAbort(signal); return out;
}
