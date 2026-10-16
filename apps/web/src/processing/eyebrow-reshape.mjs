import {assertPixels, checkAbort} from './pure.mjs';

// SUITE-only geometry on explicit caller-supplied eyebrow landmarks and masks.
// No detection, identity/permission verification, Recipe persistence or app wiring.
// Values are normalized [-1,1], not Evoto slider values or pixel equivalence.
// iPad Height is an optional independent camera-vertical translation, never a
// thickness/scale alias. Position retains this engine's local brow-normal move.
// The official guide describes both as up/down but does not publish their
// difference. These coordinate axes are an explicit SUITE design, not a claim
// about Evoto's private implementation. Old five-field controls are unchanged.
export const EYEBROW_RESHAPE_VERSION = 'suite-explicit-eyebrow-flow-1';
export const EYEBROW_RESHAPE_MAX_PIXELS = 8_000_000;
const FIELDS = ['thickness', 'distance', 'tilt', 'archHeight', 'position'];
const ALL_FIELDS = [...FIELDS, 'height'];
const STEPS = 24;

function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(key => {
        const d = Object.getOwnPropertyDescriptor(value, key);
        return !d || !Object.hasOwn(d, 'value');
      })) throw Error('EYEBROW_RECORD_INVALID');
}
function settings(value) {
  const keys = value && Object.hasOwn(value, 'height') ? ALL_FIELDS : FIELDS;
  record(value, keys);
  if (keys.some(key => typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) || Math.abs(value[key]) > 1))
    throw Error('EYEBROW_CONTROL_INVALID');
  return {...value, height: value.height ?? 0};
}
function point(value, width, height) {
  record(value, ['u', 'v']);
  if (![value.u, value.v].every(n => typeof n === 'number' &&
      Number.isFinite(n) && n > 0 && n < 1)) throw Error('EYEBROW_LANDMARK_INVALID');
  return {x: value.u * (width - 1), y: value.v * (height - 1)};
}
function brow(value, width, height) {
  record(value, ['inner', 'outer', 'arch', 'mask']);
  const inner = point(value.inner, width, height), outer = point(value.outer, width, height);
  const arch = point(value.arch, width, height);
  const dx = outer.x - inner.x, dy = outer.y - inner.y, length = Math.hypot(dx, dy);
  if (length < 4 || length > Math.hypot(width, height) * .5)
    throw Error('EYEBROW_SPAN_INVALID');
  const tx = dx / length, ty = dy / length;
  // The normal points down in image coordinates for either eyebrow.
  const sign = tx >= 0 ? 1 : -1, nx = -ty * sign, ny = tx * sign;
  const archT = ((arch.x - inner.x) * tx + (arch.y - inner.y) * ty) / length;
  const archN = (arch.x - inner.x) * nx + (arch.y - inner.y) * ny;
  if (archT < .15 || archT > .85 || Math.abs(archN) > length * .4)
    throw Error('EYEBROW_ARCH_INVALID');
  if (!(value.mask instanceof Uint8Array || value.mask instanceof Uint8ClampedArray) ||
      value.mask.length !== width * height) throw Error('EYEBROW_MASK_INVALID');
  if ([inner, outer, arch].some(p =>
      value.mask[Math.round(p.y) * width + Math.round(p.x)] !== 255))
    throw Error('EYEBROW_LANDMARK_OUTSIDE_MASK');
  return {inner, outer, archT, archN, length, tx, ty, nx, ny, mask: value.mask.slice()};
}
function coverage(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1), a = x - x0, b = y - y0;
  return ((1 - a) * (1 - b) * mask[y0 * width + x0] +
    a * (1 - b) * mask[y0 * width + x1] +
    (1 - a) * b * mask[y1 * width + x0] + a * b * mask[y1 * width + x1]) / 255;
}
function velocity(brow, controls, width, height, x, y, away) {
  const {inner, length, tx, ty, nx, ny, archT, archN, mask} = brow;
  const t = ((x - inner.x) * tx + (y - inner.y) * ty) / length;
  const n = (x - inner.x) * nx + (y - inner.y) * ny;
  if (t <= -.25 || t >= 1.25 || Math.abs(n) >= length * .45) return [0, 0];
  const along = Math.sin(Math.PI * (t + .25) / 1.5) ** 2;
  const across = Math.cos(Math.PI * n / (length * .9)) ** 2;
  const weight = coverage(mask, width, height, x, y) * along * across;
  const archShape = t <= 0 || t >= 1 ? 0 :
    (t <= archT ? Math.sin(Math.PI * t / (2 * archT)) ** 2 :
      Math.sin(Math.PI * (1 - t) / (2 * (1 - archT))) ** 2);
  const normal = controls.thickness * .35 * (n - archN * archShape) +
    controls.tilt * length * .12 * (1 - Math.max(0, Math.min(1, t))) -
    controls.archHeight * length * .12 * archShape - controls.position * length * .12;
  return [weight * (nx * normal + away * controls.distance * length * .12),
    weight * (ny * normal - controls.height * length * .12)];
}
function inverse(brow, controls, width, height, x, y, away) {
  // Backtrace a bounded, compact-support velocity field: destination pixels
  // sample original pixels, so movement never leaves forward-splat holes.
  for (let step = 0; step < STEPS; step++) {
    const v = velocity(brow, controls, width, height, x, y, away);
    x -= v[0] / STEPS; y -= v[1] / STEPS;
  }
  return [x, y];
}

/**
 * Input geometry: {imageLeft,imageRight}; each contains normalized inner/outer/
 * arch points and a full-frame Uint8 mask. Masks must include the permitted skin
 * transition region, exclude eyes, and never overlap. They are not authentication.
 * controls: {linked:true,shared:{five fields}} or {linked:false,imageLeft:{...},
 * imageRight:{...}}. Positive distance separates brows; positive position moves
 * upward; positive archHeight lifts the arch; positive tilt lowers the inner end.
 * Optional height [-1,1] moves camera-vertically up for positive values. It is
 * independent of Position and is preserved in controls, not merged into it.
 * Caller must regenerate masks for each upright source/proxy resolution.
 * Returns new pixels; zero masks, alpha and transparent hidden RGB are unchanged.
 * No inpainting/skin synthesis: unsupported donor geometry fails the whole call.
 */
export function reshapeEyebrows(pixels, geometry, controls, {signal} = {}) {
  checkAbort(signal); assertPixels(pixels);
  const {width, height, data} = pixels, count = width * height;
  if (count > EYEBROW_RESHAPE_MAX_PIXELS) throw Error('EYEBROW_CAPACITY');
  record(geometry, ['imageLeft', 'imageRight']);
  if (controls?.linked === true) record(controls, ['linked', 'shared']);
  else if (controls?.linked === false) record(controls, ['linked', 'imageLeft', 'imageRight']);
  else throw Error('EYEBROW_LINK_MODE_INVALID');
  const left = brow(geometry.imageLeft, width, height), right = brow(geometry.imageRight, width, height);
  if (!(left.outer.x < left.inner.x && left.inner.x < right.inner.x && right.inner.x < right.outer.x))
    throw Error('EYEBROW_SIDE_ORDER_INVALID');
  const values = controls.linked ? [settings(controls.shared), settings(controls.shared)] :
    [settings(controls.imageLeft), settings(controls.imageRight)];
  for (let i = 0; i < count; i++) {
    if ((i & 65535) === 0) checkAbort(signal);
    if (left.mask[i] && right.mask[i]) throw Error('EYEBROW_MASK_OVERLAP');
  }
  const output = data.slice();
  for (const [side, shape] of [left, right].entries()) {
    const params = values[side], away = side === 0 ? -1 : 1;
    if (ALL_FIELDS.every(key => params[key] === 0)) continue;
    for (let y = 0; y < height; y++) {
      checkAbort(signal);
      for (let x = 0; x < width; x++) {
        const index = y * width + x, offset = index * 4;
        if (!shape.mask[index] || data[offset + 3] === 0) continue;
        const [sx, sy] = inverse(shape, params, width, height, x, y, away);
        if (Math.abs(sx - x) + Math.abs(sy - y) < 1e-10) continue;
        // Refuse numerical foldovers or extreme compression from jagged masks.
        const e = .25;
        const xp = inverse(shape, params, width, height, x + e, y, away);
        const xm = inverse(shape, params, width, height, x - e, y, away);
        const yp = inverse(shape, params, width, height, x, y + e, away);
        const ym = inverse(shape, params, width, height, x, y - e, away);
        const determinant = ((xp[0] - xm[0]) * (yp[1] - ym[1]) -
          (yp[0] - ym[0]) * (xp[1] - xm[1])) / (4 * e * e);
        if (!Number.isFinite(determinant) || determinant < .2 || determinant > 5)
          throw Error('EYEBROW_UNSAFE_DEFORMATION');
        if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1)
          throw Error('EYEBROW_DONOR_OUTSIDE_FRAME');
        const x0 = Math.floor(sx), y0 = Math.floor(sy), a = sx - x0, b = sy - y0;
        const taps = [[x0,y0,(1-a)*(1-b)], [Math.min(width-1,x0+1),y0,a*(1-b)],
          [x0,Math.min(height-1,y0+1),(1-a)*b],
          [Math.min(width-1,x0+1),Math.min(height-1,y0+1),a*b]];
        const rgb = [0, 0, 0]; let alphaWeight = 0;
        for (const [xx, yy, weight] of taps) {
          if (weight <= 1e-12) continue;
          const donor = yy * width + xx, o = donor * 4;
          if (!shape.mask[donor]) throw Error('EYEBROW_DONOR_OUTSIDE_MASK');
          const w = weight * data[o + 3];
          alphaWeight += w;
          for (let c = 0; c < 3; c++) rgb[c] += data[o + c] * w;
        }
        if (alphaWeight === 0) throw Error('EYEBROW_DONOR_TRANSPARENT');
        for (let c = 0; c < 3; c++) output[offset + c] = Math.round(rgb[c] / alphaWeight);
      }
    }
  }
  checkAbort(signal);
  return {...pixels, data: output};
}
