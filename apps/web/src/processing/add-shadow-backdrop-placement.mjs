import {assertPixels, checkAbort} from './pure.mjs';
import {ADD_SHADOW_MAX_PIXELS} from './add-shadow.mjs';

export const ADD_SHADOW_BACKDROP_PLACEMENT_VERSION = 'suite-explicit-backdrop-placement-1';
const exact = (value, keys) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });

export function validateAddShadowBackdropPlacement(input) {
  if (!exact(input, ['mode', 'anchor']) ||
      !['fit', 'cover', 'stretch'].includes(input.mode) ||
      !exact(input.anchor, ['x', 'y']) ||
      ![input.anchor.x, input.anchor.y].every(value =>
        Number.isFinite(value) && value >= 0 && value <= 1))
    throw Error('ADD_SHADOW_BACKDROP_PLACEMENT_INVALID');
  return Object.freeze({mode: input.mode,
    anchor: Object.freeze({x: input.anchor.x, y: input.anchor.y})});
}

/**
 * Explicit RGBA8 placement only; no Asset/SHA/permission/scene assertions.
 * Anchor 0/0 aligns left/top; 1/1 aligns right/bottom. Fit leaves transparent
 * margins, cover crops, stretch changes aspect ratio (anchor has no effect).
 * Bilinear sampling uses premultiplied alpha to avoid transparent RGB fringes.
 * This is not an area-filtered or color-managed high-quality export resampler.
 */
export function placeAddShadowBackdrop(frame, width, height, input, {signal} = {}) {
  checkAbort(signal);
  assertPixels(frame);
  if (!Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1 ||
      width * height > ADD_SHADOW_MAX_PIXELS ||
      frame.width * frame.height > ADD_SHADOW_MAX_PIXELS)
    throw Error('ADD_SHADOW_BACKDROP_PLACEMENT_CAPACITY');
  const placement = validateAddShadowBackdropPlacement(input);
  const data = new Uint8ClampedArray(width * height * 4);
  if (frame.width === width && frame.height === height) {
    data.set(frame.data);
    checkAbort(signal);
    return {width, height, data};
  }
  const ratioX = width / frame.width, ratioY = height / frame.height;
  const uniform = placement.mode === 'cover' ? Math.max(ratioX, ratioY) :
    Math.min(ratioX, ratioY);
  const scaleX = placement.mode === 'stretch' ? ratioX : uniform;
  const scaleY = placement.mode === 'stretch' ? ratioY : uniform;
  const drawnWidth = frame.width * scaleX, drawnHeight = frame.height * scaleY;
  const left = (width - drawnWidth) * placement.anchor.x;
  const top = (height - drawnHeight) * placement.anchor.y;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let x = 0; x < width; x++) {
      if ((x & 4095) === 0) checkAbort(signal);
      const centerX = x + 0.5, centerY = y + 0.5;
      if (centerX < left || centerX >= left + drawnWidth ||
          centerY < top || centerY >= top + drawnHeight) continue;
      const sx = clamp((centerX - left) / scaleX - 0.5, frame.width - 1);
      const sy = clamp((centerY - top) / scaleY - 0.5, frame.height - 1);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(frame.width - 1, x0 + 1);
      const y1 = Math.min(frame.height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (let corner = 0; corner < 4; corner++) {
        const right = (corner & 1) !== 0, bottom = (corner & 2) !== 0;
        const weight = (right ? fx : 1 - fx) * (bottom ? fy : 1 - fy);
        const offset = ((bottom ? y1 : y0) * frame.width + (right ? x1 : x0)) * 4;
        const weightedAlpha = frame.data[offset + 3] * weight;
        alpha += weightedAlpha;
        red += frame.data[offset] * weightedAlpha;
        green += frame.data[offset + 1] * weightedAlpha;
        blue += frame.data[offset + 2] * weightedAlpha;
      }
      const output = (y * width + x) * 4;
      data[output + 3] = Math.round(alpha);
      if (data[output + 3] === 0) continue;
      data[output] = Math.round(red / alpha);
      data[output + 1] = Math.round(green / alpha);
      data[output + 2] = Math.round(blue / alpha);
    }
  }
  checkAbort(signal);
  return {width, height, data};
}
