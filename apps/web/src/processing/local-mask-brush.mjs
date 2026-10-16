import {checkAbort, MAX_PIXELS} from './pure.mjs';

export const LOCAL_BRUSH_VERSION = 'suite-normalized-coverage-brush-1';
export const MAX_BRUSH_STROKES = 64;
export const MAX_BRUSH_POINTS = 4096;
const MAX_BRUSH_WORK = 96_000_000;

function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key)))
    throw Error('LOCAL_BRUSH_INPUT_INVALID');
}

function bounds(ax, ay, bx, by, radius, width, height) {
  const left = Math.max(0, Math.floor(Math.min(ax, bx) - radius - .5));
  const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius + .5));
  const top = Math.max(0, Math.floor(Math.min(ay, by) - radius - .5));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius + .5));
  return {left, right, top, bottom, area: (right - left + 1) * (bottom - top + 1)};
}

/**
 * Rasterize user-authored normalized strokes into one-byte coverage. A stroke
 * is {points:[{x,y}], radius:(0,.5], hardness:[0,1], mode:'add'|'erase'}.
 * Radius is a fraction of the shorter output edge; a .75-pixel minimum keeps
 * tiny Proxy strokes visible. Each polyline segment is a continuous capsule,
 * not spaced dabs. Add uses maximum coverage; erase multiplies the existing
 * coverage by the inverse stroke opacity. This is not semantic segmentation.
 */
export function rasterizeLocalBrushMask({width, height, strokes, signal, workBudget} = {}) {
  // Optional per-operation shared counter; old callers retain the same limit.
  if(workBudget!==undefined){
    const descriptor=workBudget&&typeof workBudget==='object'?Object.getOwnPropertyDescriptor(workBudget,'remaining'):null;
    if(!workBudget||![Object.prototype,null].includes(Object.getPrototypeOf(workBudget))||
        Reflect.ownKeys(workBudget).length!==1||!descriptor?.enumerable||!descriptor.writable||
        !Object.hasOwn(descriptor,'value')||!Number.isSafeInteger(descriptor.value)||descriptor.value<0||descriptor.value>MAX_BRUSH_WORK)
      throw Error('LOCAL_BRUSH_WORK_BUDGET_INVALID');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_PIXELS) throw Error('LOCAL_BRUSH_DIMENSIONS_INVALID');
  if (!Array.isArray(strokes) || strokes.length > MAX_BRUSH_STROKES)
    throw Error('LOCAL_BRUSH_STROKES_INVALID');
  checkAbort(signal);
  let totalPoints = 0, estimatedWork = 0;
  const plans = strokes.map(stroke => {
    checkAbort(signal);
    shape(stroke, ['points', 'radius', 'hardness', 'mode']);
    if (!Array.isArray(stroke.points) || !stroke.points.length ||
        !['add', 'erase'].includes(stroke.mode) ||
        typeof stroke.radius !== 'number' || !Number.isFinite(stroke.radius) ||
        stroke.radius <= 0 || stroke.radius > .5 ||
        typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
        stroke.hardness < 0 || stroke.hardness > 1)
      throw Error('LOCAL_BRUSH_STROKE_INVALID');
    totalPoints += stroke.points.length;
    if (totalPoints > MAX_BRUSH_POINTS) throw Error('LOCAL_BRUSH_TOO_MANY_POINTS');
    const points = stroke.points.map(point => {
      shape(point, ['x', 'y']);
      if (typeof point.x !== 'number' || !Number.isFinite(point.x) || point.x < 0 || point.x > 1 ||
          typeof point.y !== 'number' || !Number.isFinite(point.y) || point.y < 0 || point.y > 1)
        throw Error('LOCAL_BRUSH_POINT_INVALID');
      return {x: point.x * width, y: point.y * height};
    });
    const radius = Math.max(.75, stroke.radius * Math.min(width, height));
    const segments = [];
    let union = null;
    for (let index = 0; index < points.length; index++) {
      if ((index & 0x3f) === 0) checkAbort(signal);
      const a = points[Math.max(0, index - 1)], b = points[index];
      const box = bounds(a.x, a.y, b.x, b.y, radius, width, height);
      estimatedWork += box.area;
      union = union ? {left: Math.min(union.left, box.left), right: Math.max(union.right, box.right),
        top: Math.min(union.top, box.top), bottom: Math.max(union.bottom, box.bottom)} : box;
      segments.push({ax: a.x, ay: a.y, bx: b.x, by: b.y, box});
    }
    const unionArea = (union.right - union.left + 1) * (union.bottom - union.top + 1);
    estimatedWork += unionArea * 2;
    if (estimatedWork > MAX_BRUSH_WORK) throw Error('LOCAL_BRUSH_WORK_LIMIT');
    return {mode: stroke.mode, hardness: stroke.hardness, radius, segments, union};
  });
  if(workBudget!==undefined){
    if(estimatedWork>workBudget.remaining)throw Error('LOCAL_BRUSH_WORK_LIMIT');
    workBudget.remaining-=estimatedWork;
  }
  const count = width * height;
  const data = new Uint8Array(count), strokeData = new Uint8Array(count);
  let checked = 0;
  const poll = () => {if ((++checked & 0x3fff) === 0) checkAbort(signal);};
  for (const plan of plans) {
    checkAbort(signal);
    const {union, radius, hardness} = plan;
    for (let y = union.top; y <= union.bottom; y++) {
      checkAbort(signal);
      strokeData.fill(0, y * width + union.left, y * width + union.right + 1);
    }
    for (const segment of plan.segments) {
      const {ax, ay, bx, by, box} = segment;
      const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
      for (let y = box.top; y <= box.bottom; y++) {
        checkAbort(signal);
        for (let x = box.left; x <= box.right; x++) {
          poll();
          const px = x + .5, py = y + .5;
          const t = lengthSquared ? Math.max(0, Math.min(1,
            ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
          const distance = Math.hypot(px - ax - t * dx, py - ay - t * dy);
          const core = radius * hardness;
          const amount = distance <= core ? 255 : distance >= radius ? 0 :
            Math.round(255 * (radius - distance) / (radius - core));
          const at = y * width + x;
          if (amount > strokeData[at]) strokeData[at] = amount;
        }
      }
    }
    for (let y = union.top; y <= union.bottom; y++) {
      checkAbort(signal);
      for (let x = union.left; x <= union.right; x++) {
        poll();
        const at = y * width + x, amount = strokeData[at];
        if (plan.mode === 'add') data[at] = Math.max(data[at], amount);
        else data[at] = Math.round(data[at] * (255 - amount) / 255);
      }
    }
  }
  checkAbort(signal);
  return {width, height, data};
}
