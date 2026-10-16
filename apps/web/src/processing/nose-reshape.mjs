import {assertPixels, checkAbort} from './pure.mjs';

// SUITE-specific 2D deformation, not a detector, 3D reconstruction or an
// implementation of Evoto's unpublished ranges/formulae. All six controls
// use independent normalized [-1, 1] amounts, neutral at zero.
export const NOSE_RESHAPE_VERSION = 'suite-explicit-nose-landmarks-warp-1';
export const NOSE_RESHAPE_CONTROLS = Object.freeze([
  'size', 'length', 'horizontal', 'bridge', 'width', 'tip'
]);
const MAX_PIXELS = 8_000_000;
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const POINTS = ['bridgeTop', 'bridgeBottom', 'leftWing', 'rightWing', 'tip'];
const BINDING = ['assetID', 'originalSHA256', 'personID', 'savedRevision',
  'sourceWidth', 'sourceHeight', 'modelSHA256'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function exact(value, keys) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d?.enumerable && Object.hasOwn(d, 'value');
  });
}
function reject(code) { throw Error(`NOSE_RESHAPE_${code}`); }
function shared(data) {
  return Object.prototype.toString.call(data.buffer) === '[object SharedArrayBuffer]';
}
function snapshot(pixels, document, mask) {
  assertPixels(pixels);
  if (pixels.width * pixels.height > MAX_PIXELS || shared(pixels.data)) reject('CAPACITY');
  if (!exact(document, ['engineVersion', 'binding', 'landmarks', 'settings']) ||
      document.engineVersion !== NOSE_RESHAPE_VERSION ||
      !exact(document.binding, BINDING) || !exact(document.landmarks, POINTS) ||
      !exact(document.settings, NOSE_RESHAPE_CONTROLS)) reject('DOCUMENT_INVALID');
  const b = document.binding;
  if (typeof b.assetID !== 'string' || !ID.test(b.assetID) ||
      typeof b.personID !== 'string' || !ID.test(b.personID) ||
      typeof b.originalSHA256 !== 'string' || !SHA.test(b.originalSHA256) ||
      typeof b.modelSHA256 !== 'string' || !SHA.test(b.modelSHA256) ||
      !Number.isSafeInteger(b.savedRevision) || b.savedRevision < 1 ||
      !Number.isSafeInteger(b.sourceWidth) || b.sourceWidth < pixels.width ||
      !Number.isSafeInteger(b.sourceHeight) || b.sourceHeight < pixels.height ||
      !Number.isSafeInteger(b.sourceWidth * b.sourceHeight)) reject('BINDING_INVALID');
  // Accept source or uncropped uniform proxy with integer rounding only.
  const scale = Math.min(pixels.width / b.sourceWidth, pixels.height / b.sourceHeight);
  if (Math.abs(pixels.width - b.sourceWidth * scale) > 1 ||
      Math.abs(pixels.height - b.sourceHeight * scale) > 1 ||
      (Object.hasOwn(pixels, 'sourceWidth') && pixels.sourceWidth !== b.sourceWidth) ||
      (Object.hasOwn(pixels, 'sourceHeight') && pixels.sourceHeight !== b.sourceHeight))
    reject('DIMENSIONS_MISMATCH');
  const landmarks = {};
  for (const name of POINTS) {
    const p = document.landmarks[name];
    if (!exact(p, ['x', 'y']) || !finite(p.x) || !finite(p.y) ||
        p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1) reject('LANDMARK_INVALID');
    landmarks[name] = Object.freeze({x: p.x, y: p.y});
  }
  const settings = {};
  for (const key of NOSE_RESHAPE_CONTROLS) {
    if (!finite(document.settings[key]) || Math.abs(document.settings[key]) > 1)
      reject('SETTINGS_INVALID');
    settings[key] = document.settings[key];
  }
  if (!exact(mask, ['width', 'height', 'data']) || mask.width !== pixels.width ||
      mask.height !== pixels.height || !(mask.data instanceof Uint8Array ||
      mask.data instanceof Uint8ClampedArray) || mask.data.length !== pixels.width * pixels.height ||
      shared(mask.data)) reject('MASK_INVALID');
  let selected = 0;
  for (const value of mask.data) {
    if (value !== 0 && value !== 255) reject('MASK_MUST_BE_BINARY');
    if (value) selected++;
  }
  if (!selected || selected === mask.data.length) reject('MASK_AMBIGUOUS');
  return {frame: {width: pixels.width, height: pixels.height, data: pixels.data.slice()},
    document: Object.freeze({engineVersion: NOSE_RESHAPE_VERSION,
      binding: Object.freeze({...b}), landmarks: Object.freeze(landmarks),
      settings: Object.freeze(settings)}), mask: mask.data.slice()};
}
function geometry(document) {
  // Source pixel geometry avoids stretching a rotated axis on non-square frames.
  const {sourceWidth: w, sourceHeight: h} = document.binding;
  const points = Object.fromEntries(POINTS.map(k => [k,
    {x: document.landmarks[k].x * w, y: document.landmarks[k].y * h}]));
  const top = points.bridgeTop, tip = points.tip;
  const length = Math.hypot(tip.x - top.x, tip.y - top.y);
  if (length < Math.min(w, h) * .005 || length > Math.min(w, h) * .35)
    reject('GEOMETRY_INVALID');
  const vy = {x: (tip.x - top.x) / length, y: (tip.y - top.y) / length};
  const vx = {x: vy.y, y: -vy.x};
  const local = p => ({x: (p.x - top.x) * vx.x + (p.y - top.y) * vx.y,
    y: (p.x - top.x) * vy.x + (p.y - top.y) * vy.y});
  const left = local(points.leftWing), right = local(points.rightWing);
  const bridge = local(points.bridgeBottom);
  const breadth = right.x - left.x;
  if (left.x >= 0 || right.x <= 0 || breadth < length * .15 || breadth > length * 2 ||
      Math.abs(left.y - right.y) > length * .35 ||
      left.y < length * .45 || left.y > length * 1.35 ||
      right.y < length * .45 || right.y > length * 1.35 ||
      bridge.y < length * .2 || bridge.y > length * .85 ||
      Math.abs(bridge.x) > breadth * .25) reject('GEOMETRY_AMBIGUOUS');
  return {top, vx, vy, length, breadth, bridge, local};
}
const falloff = r2 => r2 >= 1 ? 0 : (1 - r2) ** 3;
function inverse(x, y, g, s) {
  const {length: l, breadth: b} = g;
  const overall = falloff((x / (b * .9)) ** 2 + ((y - l * .55) / (l * .85)) ** 2);
  const bridge = falloff((x / (b * .45)) ** 2 +
    ((y - g.bridge.y * .55) / (g.bridge.y * .8)) ** 2);
  const tip = falloff((x / (b * .5)) ** 2 + ((y - l) / (l * .35)) ** 2);
  // Inverse maps sample the untouched source once. Width/bridge act only on X;
  // length is anchored at bridgeTop; tip scales only a local tip ellipse.
  let sx = x - s.horizontal * b * .12 * overall;
  let sy = y;
  sx /= 1 + .12 * s.size * overall;
  sy = l * .55 + (sy - l * .55) / (1 + .12 * s.size * overall);
  sy /= 1 + .12 * s.length * overall;
  sx /= 1 + .12 * s.width * overall;
  sx /= 1 + .12 * s.bridge * bridge;
  sx /= 1 + .12 * s.tip * tip;
  sy = l + (sy - l) / (1 + .12 * s.tip * tip);
  return {x: sx, y: sy, active: overall || bridge || tip};
}
function render(input, signal) {
  const {frame, document, mask} = input;
  const {width, height, data} = frame, b = document.binding;
  const g = geometry(document), s = document.settings;
  const output = {width, height, data: data.slice()};
  if (width !== b.sourceWidth || height !== b.sourceHeight) {
    output.sourceWidth = b.sourceWidth; output.sourceHeight = b.sourceHeight;
  }
  if (NOSE_RESHAPE_CONTROLS.every(key => s[key] === 0)) return output;
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const index = y * width + x, at = index * 4;
      if (!mask[index] || !data[at + 3]) continue;
      const p = g.local({x: (x + .5) * b.sourceWidth / width,
        y: (y + .5) * b.sourceHeight / height});
      const sample = inverse(p.x, p.y, g, s);
      if (!sample.active) continue;
      const sx = (g.top.x + sample.x * g.vx.x + sample.y * g.vy.x) * width / b.sourceWidth - .5;
      const sy = (g.top.y + sample.x * g.vx.y + sample.y * g.vy.y) * height / b.sourceHeight - .5;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
      const tx = sx - x0, ty = sy - y0;
      const donors = [[y0 * width + x0, (1 - tx) * (1 - ty)],
        [y0 * width + x1, tx * (1 - ty)], [y1 * width + x0, (1 - tx) * ty],
        [y1 * width + x1, tx * ty]];
      // Protected pixels are never donors; alpha-weighting excludes hidden RGB.
      if (donors.some(([i, weight]) => weight > 0 && !mask[i])) continue;
      let alpha = 0; const rgb = [0, 0, 0];
      for (const [i, weight] of donors) {
        const wa = weight * data[i * 4 + 3] / 255;
        alpha += wa;
        for (let c = 0; c < 3; c++) rgb[c] += data[i * 4 + c] * wa;
      }
      if (alpha > 0) for (let c = 0; c < 3; c++)
        output.data[at + c] = clamp(Math.round(rgb[c] / alpha), 0, 255);
    }
  }
  checkAbort(signal);
  return output;
}

/**
 * Host-injected authority boundary. There is deliberately no default authority
 * and no JSON `ownerConfirmed` bypass. The trusted host must verify fresh person
 * consent/edit rights, source/frame provenance, model/landmark inventory, pose,
 * occlusion and mask binding for this exact request. It must reject a mere face
 * oval from faces.mjs. This dependency is NOT a supplied authentication system.
 * A caller installing a permissive verifier does not obtain product authority.
 * The verifier sees copies; it cannot mutate the privately held render input.
 */
export function createNoseReshapeProcessor({authorize} = {}) {
  if (typeof authorize !== 'function') reject('AUTHORITY_UNAVAILABLE');
  return async function applyNoseReshape(pixels, document, mask, {signal} = {}) {
    checkAbort(signal);
    const input = snapshot(pixels, document, mask);
    geometry(input.document);
    const request = {operation: 'nose-reshape', document: input.document,
      frame: {...input.frame, data: input.frame.data.slice()},
      mask: {width: input.frame.width, height: input.frame.height, data: input.mask.slice()}};
    if (await authorize(request, {signal}) !== true) reject('NOT_AUTHORIZED');
    checkAbort(signal);
    return render(input, signal);
  };
}
