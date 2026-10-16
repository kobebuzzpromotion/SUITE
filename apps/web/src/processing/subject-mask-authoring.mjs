import {assertPixels, checkAbort} from './pure.mjs';
import {validateSubjectMatte} from './background-composite.mjs';

/** Manual coverage authoring, not subject recognition or Local Levels masking. */
export const SUBJECT_MASK_AUTHORING_VERSION = 'suite-explicit-owner-subject-strokes-1';
export const SUBJECT_MASK_MAX_PIXELS = 8_000_000;
export const SUBJECT_MASK_MAX_STROKES = 64;
export const SUBJECT_MASK_MAX_POINTS = 4096;
export const SUBJECT_MASK_MAX_WORK = 96_000_000;

const exact = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const unit = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && value <= 1;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dense = (value, min, max) => Array.isArray(value) && value.length >= min &&
  value.length <= max && Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({length: value.length}, (_, index) => Object.hasOwn(value, index)).every(Boolean);
function validContext(context) {
  if (!exact(context, ['assetID', 'originalSHA256', 'savedRevision']) ||
      typeof context.assetID !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.assetID) ||
      typeof context.originalSHA256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(context.originalSHA256) ||
      !Number.isSafeInteger(context.savedRevision) || context.savedRevision < 1)
    throw Error('SUBJECT_MASK_CONTEXT_INVALID');
}

function strokePlan(stroke, width, height) {
  if (!exact(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
      !['ADD', 'ERASE'].includes(stroke.operation) ||
      !dense(stroke.path, 1, SUBJECT_MASK_MAX_POINTS) ||
      !Number.isFinite(stroke.radiusFraction) ||
      stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
      !unit(stroke.hardness)) throw Error('SUBJECT_MASK_STROKE_INVALID');
  const points = stroke.path.map(point => {
    if (!exact(point, ['u', 'v']) || !unit(point.u) || !unit(point.v))
      throw Error('SUBJECT_MASK_POINT_INVALID');
    return {x: point.u * width, y: point.v * height};
  });
  const radius = Math.max(.75, stroke.radiusFraction * Math.min(width, height));
  const segments = [];
  let union = null, work = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[Math.max(0, index - 1)], b = points[index];
    const left = clamp(Math.floor(Math.min(a.x, b.x) - radius - 1), 0, width - 1);
    const right = clamp(Math.ceil(Math.max(a.x, b.x) + radius + 1), 0, width - 1);
    const top = clamp(Math.floor(Math.min(a.y, b.y) - radius - 1), 0, height - 1);
    const bottom = clamp(Math.ceil(Math.max(a.y, b.y) + radius + 1), 0, height - 1);
    const box = {left, right, top, bottom};
    work += (right - left + 1) * (bottom - top + 1);
    union = union ? {left: Math.min(union.left, left), right: Math.max(union.right, right),
      top: Math.min(union.top, top), bottom: Math.max(union.bottom, bottom)} : box;
    segments.push({a, b, box});
  }
  work += 2 * (union.right - union.left + 1) * (union.bottom - union.top + 1);
  return {operation: stroke.operation, hardness: stroke.hardness, radius, segments, union, work};
}

/**
 * The caller must authenticate the owner and attest that they reviewed these
 * strokes. `ownerConfirmed` is an assertion, not an authentication mechanism.
 * Output provenance can be consumed by the explicit-mask composite, but no
 * automatic subject segmentation or AI face/person inference occurs here.
 */
export function assertSubjectStrokeWork(strokeGroups, width, height, {signal} = {}) {
  let work = 0;
  for (const strokes of strokeGroups) {
    if (!dense(strokes, 1, SUBJECT_MASK_MAX_STROKES)) throw Error('SUBJECT_MASK_STROKES_INVALID');
    for (const stroke of strokes) {
      checkAbort(signal);
      work += strokePlan(stroke, width, height).work;
      if (work > SUBJECT_MASK_MAX_WORK) throw Error('SUBJECT_MASK_WORK_LIMIT');
    }
  }
  return work;
}

export function authorSubjectMask(original, strokes, context,
  {ownerConfirmed = false, signal} = {}) {
  if (ownerConfirmed !== true) throw Error('SUBJECT_MASK_OWNER_CONFIRMATION_REQUIRED');
  validContext(context);
  const mask = rasterizeSubjectStrokes(original, strokes, {signal});
  mask.provenance = {kind: 'subject-alpha-mask', source: 'verified-manual-subject-matte',
    ...context, width: mask.width, height: mask.height};
  validateSubjectMatte(mask, context, mask.width, mask.height);
  return mask;
}

/** Pure coverage only. No ownership, identity, or verification claims. */
export function rasterizeSubjectStrokes(original, strokes, {signal} = {}) {
  checkAbort(signal);
  assertPixels(original);
  const {width, height} = original;
  if (width * height > SUBJECT_MASK_MAX_PIXELS) throw Error('SUBJECT_MASK_CAPACITY');
  if (!dense(strokes, 1, SUBJECT_MASK_MAX_STROKES))
    throw Error('SUBJECT_MASK_STROKES_INVALID');
  let pointCount = 0, work = 0;
  const plans = strokes.map(stroke => {
    checkAbort(signal);
    const plan = strokePlan(stroke, width, height);
    pointCount += stroke.path.length;work += plan.work;
    if (pointCount > SUBJECT_MASK_MAX_POINTS || work > SUBJECT_MASK_MAX_WORK)
      throw Error('SUBJECT_MASK_WORK_LIMIT');
    return plan;
  });
  if (!plans.some(plan => plan.operation === 'ADD'))
    throw Error('SUBJECT_MASK_STROKES_INVALID');
  const data = new Uint8Array(width * height), strokeData = new Uint8Array(data.length);
  for (const plan of plans) {
    checkAbort(signal);
    const {union, radius, hardness} = plan;
    for (let y = union.top; y <= union.bottom; y++) {
      checkAbort(signal);
      strokeData.fill(0, y * width + union.left, y * width + union.right + 1);
    }
    for (const {a, b, box} of plan.segments) {
      const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
      for (let y = box.top; y <= box.bottom; y++) {
        checkAbort(signal);
        for (let x = box.left; x <= box.right; x++) {
          const pixel = y * width + x;
          if ((pixel & 0x3fff) === 0) checkAbort(signal);
          const px = x + .5, py = y + .5;
          const t = lengthSquared ? clamp(((px - a.x) * dx + (py - a.y) * dy) /
            lengthSquared, 0, 1) : 0;
          const distance = Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
          const core = radius * hardness;
          const amount = distance <= core ? 255 : distance >= radius ? 0 :
            Math.round(255 * (radius - distance) / (radius - core));
          if (amount > strokeData[pixel]) strokeData[pixel] = amount;
        }
      }
    }
    for (let y = union.top; y <= union.bottom; y++) {
      checkAbort(signal);
      for (let x = union.left; x <= union.right; x++) {
        const pixel = y * width + x, coverage = strokeData[pixel];
        if ((pixel & 0x3fff) === 0) checkAbort(signal);
        if (plan.operation === 'ADD') data[pixel] = Math.max(data[pixel], coverage);
        else data[pixel] = Math.round(data[pixel] * (255 - coverage) / 255);
      }
    }
  }
  let nonzero = false;
  for (let pixel = 0; pixel < data.length; pixel++) {
    if ((pixel & 0x3fff) === 0) checkAbort(signal);
    if (original.data[pixel * 4 + 3] === 0) data[pixel] = 0;
    if (data[pixel] > 0) nonzero = true;
  }
  checkAbort(signal);
  if (!nonzero) throw Error('SUBJECT_MASK_EMPTY');
  return {width, height, data};
}
