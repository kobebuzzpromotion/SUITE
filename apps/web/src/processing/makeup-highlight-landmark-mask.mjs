import {assertPixels, checkAbort} from './pure.mjs';

export const MAKEUP_HIGHLIGHT_LANDMARK_VERSION = 'suite-provisional-highlight-landmark-mask-1';
const MAX_PIXELS = 8_000_000;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const BINDING = ['assetID', 'originalSHA256', 'personID', 'savedRevision',
  'sourceWidth', 'sourceHeight', 'modelSHA256', 'inventoryID'];
const ZONES = ['forehead', 'bridge', 'leftCheek', 'rightCheek', 'chin'];
const finite = x => typeof x === 'number' && Number.isFinite(x);
const shared = data => Object.prototype.toString.call(data.buffer) === '[object SharedArrayBuffer]';
function fail(code) { throw Error(`MAKEUP_HIGHLIGHT_LANDMARK_${code}`); }
function exact(value, keys) {
  return value && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return d?.enumerable && Object.hasOwn(d, 'value');
    });
}
function checkedBinding(value) {
  if (!exact(value, BINDING) ||
      !['assetID', 'personID', 'inventoryID'].every(k => typeof value[k] === 'string' && UUID.test(value[k])) ||
      !['originalSHA256', 'modelSHA256'].every(k => typeof value[k] === 'string' && SHA.test(value[k])) ||
      !Number.isSafeInteger(value.savedRevision) || value.savedRevision < 1 ||
      !Number.isSafeInteger(value.sourceWidth) || value.sourceWidth < 1 ||
      !Number.isSafeInteger(value.sourceHeight) || value.sourceHeight < 1 ||
      !Number.isSafeInteger(value.sourceWidth * value.sourceHeight)) fail('BINDING_INVALID');
  return value;
}
function matching(a, b) {
  checkedBinding(a); checkedBinding(b);
  if (!BINDING.every(key => key.endsWith('SHA256') ?
    a[key].toLowerCase() === b[key].toLowerCase() : a[key] === b[key])) fail('BINDING_MISMATCH');
}
function point(value) {
  return exact(value, ['x', 'y']) && finite(value.x) && finite(value.y) &&
    value.x > 0 && value.x < 1 && value.y > 0 && value.y < 1;
}

/**
 * Pure, non-authoritative candidate coverage from EXPLICIT five facial zones.
 * No facial detector, identity/consent verifier, source decode or model inference
 * is supplied. All binding/evidence fields are structural caller assertions.
 * An authenticated host must separately prove the selected person, rights,
 * current inventory/model, pose/occlusion and source/frame/mask provenance.
 *
 * document = {engineVersion,binding,landmarks,evidence}; landmarks are normalized
 * upright source coordinates; evidence = {pose:'frontal',occluded:false}.
 * runtime = {binding,width,height}; skinMask = {binding,width,height,data}.
 * skinMask is binary allowed skin (eyes/mouth/hair/background excluded) at the
 * target resolution. This module never guesses skin from RGB or a face oval.
 *
 * The five zones, ellipse sizes and falloff below are provisional SUITE choices,
 * not published Evoto anatomy or strength values. Intensity remains a separate
 * pixel-stage control; coverage does not double-apply intensity. Output is NOT
 * labelled owner-manual strokes: the existing manual Highlight kernel must not
 * be tricked into accepting it by rewriting its provenance.
 */
export function rasterizeMakeupHighlightLandmarkMask(pixels, document, runtime, skinMask, {signal} = {}) {
  checkAbort(signal);
  if (!exact(document, ['engineVersion', 'binding', 'landmarks', 'evidence']) ||
      document.engineVersion !== MAKEUP_HIGHLIGHT_LANDMARK_VERSION ||
      !exact(document.landmarks, ZONES) || !ZONES.every(k => point(document.landmarks[k])) ||
      !exact(document.evidence, ['pose', 'occluded']) ||
      document.evidence.pose !== 'frontal' || document.evidence.occluded !== false)
    fail('LANDMARK_INVENTORY_UNAVAILABLE');
  if (!exact(runtime, ['binding', 'width', 'height'])) fail('RUNTIME_INVALID');
  matching(document.binding, runtime.binding);
  const binding = document.binding;
  assertPixels(pixels);
  if (pixels.width * pixels.height > MAX_PIXELS || shared(pixels.data)) fail('CAPACITY');
  if (runtime.width !== pixels.width || runtime.height !== pixels.height ||
      pixels.width > binding.sourceWidth || pixels.height > binding.sourceHeight)
    fail('DIMENSIONS_MISMATCH');
  const scale = Math.min(pixels.width / binding.sourceWidth, pixels.height / binding.sourceHeight);
  if (Math.abs(pixels.width - binding.sourceWidth * scale) > 1 ||
      Math.abs(pixels.height - binding.sourceHeight * scale) > 1 ||
      (Object.hasOwn(pixels, 'sourceWidth') && pixels.sourceWidth !== binding.sourceWidth) ||
      (Object.hasOwn(pixels, 'sourceHeight') && pixels.sourceHeight !== binding.sourceHeight))
    fail('DIMENSIONS_MISMATCH');
  if (!exact(skinMask, ['binding', 'width', 'height', 'data']) ||
      skinMask.width !== pixels.width || skinMask.height !== pixels.height ||
      !(skinMask.data instanceof Uint8Array || skinMask.data instanceof Uint8ClampedArray) ||
      skinMask.data.length !== pixels.width * pixels.height || shared(skinMask.data))
    fail('SKIN_MASK_INVALID');
  matching(binding, skinMask.binding);
  let allowed = 0;
  for (let i = 0; i < skinMask.data.length; i++) {
    if ((i & 16383) === 0) checkAbort(signal);
    if (![0, 255].includes(skinMask.data[i])) fail('SKIN_MASK_NOT_BINARY');
    if (skinMask.data[i]) allowed++;
  }
  if (!allowed || allowed === skinMask.data.length) fail('SKIN_MASK_AMBIGUOUS');
  const locations = Object.fromEntries(ZONES.map(k => [k, {
    x: document.landmarks[k].x * binding.sourceWidth,
    y: document.landmarks[k].y * binding.sourceHeight
  }]));
  const a = locations.forehead, c = locations.chin;
  const height = Math.hypot(c.x - a.x, c.y - a.y);
  if (height < Math.min(binding.sourceWidth, binding.sourceHeight) * .02 ||
      height > Math.min(binding.sourceWidth, binding.sourceHeight) * .8)
    fail('FACE_GEOMETRY_INVALID');
  const vy = {x: (c.x - a.x) / height, y: (c.y - a.y) / height};
  const vx = {x: vy.y, y: -vy.x};
  const local = p => ({x: (p.x - a.x) * vx.x + (p.y - a.y) * vx.y,
    y: (p.x - a.x) * vy.x + (p.y - a.y) * vy.y});
  const left = local(locations.leftCheek), right = local(locations.rightCheek);
  const bridge = local(locations.bridge), width = right.x - left.x;
  if (left.x >= 0 || right.x <= 0 || width < height * .3 || width > height * 1.6 ||
      Math.abs(left.y - right.y) > height * .2 ||
      left.y < height * .2 || left.y > height * .85 ||
      right.y < height * .2 || right.y > height * .85 ||
      bridge.y < height * .15 || bridge.y > height * .65 ||
      Math.abs(bridge.x) > width * .2) fail('FACE_GEOMETRY_AMBIGUOUS');
  const dimensions = {forehead: [.20 * width, .12 * height],
    bridge: [.06 * width, .13 * height], leftCheek: [.17 * width, .09 * height],
    rightCheek: [.17 * width, .09 * height], chin: [.13 * width, .07 * height]};
  const data = new Uint8Array(pixels.width * pixels.height);
  for (const key of ZONES) {
    const center = locations[key], [rx, ry] = dimensions[key];
    const extentX = Math.abs(vx.x) * rx + Math.abs(vy.x) * ry;
    const extentY = Math.abs(vx.y) * rx + Math.abs(vy.y) * ry;
    const minX = Math.max(0, Math.floor((center.x - extentX) * pixels.width / binding.sourceWidth));
    const maxX = Math.min(pixels.width - 1, Math.ceil((center.x + extentX) * pixels.width / binding.sourceWidth));
    const minY = Math.max(0, Math.floor((center.y - extentY) * pixels.height / binding.sourceHeight));
    const maxY = Math.min(pixels.height - 1, Math.ceil((center.y + extentY) * pixels.height / binding.sourceHeight));
    for (let y = minY; y <= maxY; y++) {
      checkAbort(signal);
      for (let x = minX; x <= maxX; x++) {
        const index = y * pixels.width + x;
        if (!skinMask.data[index] || !pixels.data[index * 4 + 3]) continue;
        const dx = (x + .5) * binding.sourceWidth / pixels.width - center.x;
        const dy = (y + .5) * binding.sourceHeight / pixels.height - center.y;
        const r2 = ((dx * vx.x + dy * vx.y) / rx) ** 2 +
          ((dx * vy.x + dy * vy.y) / ry) ** 2;
        if (r2 < 1) data[index] = Math.max(data[index], Math.round(255 * (1 - r2) ** 2));
      }
    }
  }
  if (!data.some(v => v > 0)) fail('EMPTY_COVERAGE');
  checkAbort(signal);
  return {width: pixels.width, height: pixels.height, data,
    provenance: Object.freeze({kind: 'suite-provisional-landmark-highlight-mask',
      engineVersion: MAKEUP_HIGHLIGHT_LANDMARK_VERSION,
      binding: Object.freeze({...binding}), authority: 'caller-assertions-only'})};
}
