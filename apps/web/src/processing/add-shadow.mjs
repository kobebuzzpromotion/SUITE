import {assertPixels, checkAbort} from './pure.mjs';
import {validateSubjectMatte} from './background-composite.mjs';

/**
 * SUITE's deterministic 8-bit shadow over an ALREADY composited replacement
 * background. The caller must supply a verified subject alpha mask and explicit
 * pixel offsets. No subject detection, background exchange, scene inference,
 * RAW processing, or pixel parity with another editor is performed here.
 */
export const ADD_SHADOW_VERSION = 'suite-srgb8-explicit-mask-shadow-1';
export const ADD_SHADOW_MAX_PIXELS = 8_000_000;
export const ADD_SHADOW_MODES = Object.freeze(['none', 'soft', 'hard', 'drop']);
export const ADD_SHADOW_BLENDS = Object.freeze(['normal', 'multiply']);
export const ADD_SHADOW_BACKGROUND_SOURCE = 'owner-selected-image-backdrop';
const SETTINGS = ['mode', 'opacity', 'blur', 'gradient', 'blend', 'offsetX', 'offsetY', 'shadowColor'];
const BINDING_KEYS = ['assetID', 'originalSHA256', 'savedRevision', 'backdropID', 'backdropSHA256'];
const BACKGROUND_EVIDENCE_KEYS = ['kind', 'source', ...BINDING_KEYS, 'width', 'height', 'compositeSHA256'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length &&
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const validID = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validSHA = value => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

/**
 * Binding claims for a manually selected image backdrop and subject matte.
 * The caller must derive binding/evidence from an authenticated Asset and
 * backdrop-selection service. Matching JSON alone is not authentication.
 * The composite digest detects a stale or swapped RGBA frame, not whether the
 * claimed source image was actually used to make that frame.
 */
export async function applyBoundAddShadow(background, subjectMask, backgroundEvidence,
  binding, input, {signal} = {}) {
  checkAbort(signal);
  assertPixels(background);
  const {width, height} = background;
  if (width * height > ADD_SHADOW_MAX_PIXELS) throw Error('ADD_SHADOW_CAPACITY');
  if (!exact(binding, BINDING_KEYS) || !validID(binding.assetID) ||
      !validSHA(binding.originalSHA256) ||
      !Number.isSafeInteger(binding.savedRevision) || binding.savedRevision < 1 ||
      !validID(binding.backdropID) || !validSHA(binding.backdropSHA256))
    throw Error('ADD_SHADOW_BINDING_INVALID');
  validateSubjectMatte(subjectMask, {
    assetID: binding.assetID,
    originalSHA256: binding.originalSHA256,
    savedRevision: binding.savedRevision
  }, width, height);
  if (!exact(backgroundEvidence, BACKGROUND_EVIDENCE_KEYS) ||
      backgroundEvidence.kind !== 'composited-replacement-background' ||
      backgroundEvidence.source !== ADD_SHADOW_BACKGROUND_SOURCE ||
      backgroundEvidence.width !== width || backgroundEvidence.height !== height ||
      !validSHA(backgroundEvidence.compositeSHA256) ||
      BINDING_KEYS.some(key => backgroundEvidence[key] !== binding[key]))
    throw Error('ADD_SHADOW_BACKGROUND_PROVENANCE_MISMATCH');
  // Validate controls before the asynchronous digest, including mode None.
  const settings = validateAddShadowSettings(input);
  const expectedSHA256 = backgroundEvidence.compositeSHA256.toLowerCase();
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('ADD_SHADOW_CRYPTO_UNAVAILABLE');
  // Snapshot both buffers before awaiting: no later caller mutation may change
  // which composite was checked or which silhouette is rendered.
  const frozenBackground = {width, height, data: new Uint8ClampedArray(background.data)};
  const frozenSubject = {width, height, data: new Uint8Array(subjectMask.data)};
  const hash = new Uint8Array(await subtle.digest('SHA-256', frozenBackground.data));
  checkAbort(signal);
  const actualSHA256 = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
  if (actualSHA256 !== expectedSHA256)
    throw Error('ADD_SHADOW_BACKGROUND_PIXELS_MISMATCH');
  return applyAddShadow(frozenBackground, frozenSubject, settings, {signal});
}

export function validateAddShadowSettings(input) {
  if (!exact(input, SETTINGS) || !ADD_SHADOW_MODES.includes(input.mode) ||
      !ADD_SHADOW_BLENDS.includes(input.blend) ||
      !integer(input.opacity, 0, 100) || !integer(input.blur, 0, 64) ||
      !integer(input.gradient, 0, 100) ||
      !integer(input.offsetX, -256, 256) || !integer(input.offsetY, -256, 256) ||
      !Array.isArray(input.shadowColor) || input.shadowColor.length !== 3 ||
      Object.keys(input.shadowColor).length !== 3 ||
      !input.shadowColor.every(channel => integer(channel, 0, 255)))
    throw Error('ADD_SHADOW_SETTINGS_INVALID');
  return Object.freeze({...input, shadowColor: Object.freeze([...input.shadowColor])});
}

function validateInput(background, subjectMask) {
  assertPixels(background);
  if (background.width * background.height > ADD_SHADOW_MAX_PIXELS)
    throw Error('ADD_SHADOW_CAPACITY');
  if (!exact(subjectMask, ['width', 'height', 'data']) ||
      subjectMask.width !== background.width || subjectMask.height !== background.height ||
      !(subjectMask.data instanceof Uint8Array || subjectMask.data instanceof Uint8ClampedArray) ||
      subjectMask.data.length !== background.width * background.height)
    throw Error('ADD_SHADOW_MASK_INVALID');
}

const at = (data, width, height, x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : data[y * width + x];

function silhouette(mask, width, height, settings, signal) {
  const result = new Float32Array(width * height), {offsetX, offsetY, mode} = settings;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const original = mask[y * width + x];
      if (original > 0) {left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);}
      let value = at(mask, width, height, x - offsetX, y - offsetY);
      // Hard has a short, explicitly directional extrusion. Drop remains a
      // flat displaced silhouette; Soft is a broadly diffused silhouette.
      if (mode === 'hard') {
        value = Math.max(value,
          at(mask, width, height, x - Math.round(offsetX / 2), y - Math.round(offsetY / 2)),
          at(mask, width, height, x - Math.round(offsetX / 4), y - Math.round(offsetY / 4)));
      }
      result[y * width + x] = value;
    }
  }
  return {field: result, bounds: right < left ? null : {left, top, right, bottom}};
}

/** Zero-padding box blur: no off-frame content is invented by edge clamping. */
function blurField(field, width, height, radius, signal) {
  if (radius === 0) return field;
  const horizontal = new Float32Array(field.length), divisor = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= radius && x < width; x++) sum += field[row + x];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / divisor;
      if (x + radius + 1 < width) sum += field[row + x + radius + 1];
      if (x - radius >= 0) sum -= field[row + x - radius];
    }
  }
  for (let x = 0; x < width; x++) {
    if ((x & 31) === 0) checkAbort(signal);
    let sum = 0;
    for (let y = 0; y <= radius && y < height; y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      field[y * width + x] = sum / divisor;
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
    }
  }
  checkAbort(signal);
  return field;
}

function gradientFactor(x, y, bounds, settings) {
  if (settings.gradient === 0 || bounds === null) return 1;
  const horizontal = Math.abs(settings.offsetX) > Math.abs(settings.offsetY);
  const position = horizontal ? x : y;
  const start = horizontal ? bounds.left + settings.offsetX : bounds.top + settings.offsetY;
  const end = horizontal ? bounds.right + settings.offsetX : bounds.bottom + settings.offsetY;
  const span = Math.max(1, end - start);
  const backwards = horizontal ? settings.offsetX < 0 : settings.offsetY < 0;
  const fraction = Math.max(0, Math.min(1, (position - start) / span));
  return 1 - settings.gradient / 100 * (backwards ? 1 - fraction : fraction);
}

export function applyAddShadow(background, subjectMask, input, {signal} = {}) {
  checkAbort(signal); validateInput(background, subjectMask);
  const settings = validateAddShadowSettings(input);
  const {width, height} = background, out = new Uint8ClampedArray(background.data);
  const result = {...background, data: out};
  if (settings.mode === 'none' || settings.opacity === 0) return result;
  const {field, bounds} = silhouette(subjectMask.data, width, height, settings, signal);
  if (bounds === null) return result;
  const radius = settings.mode === 'soft' ? Math.min(96, settings.blur * 2 + 2) :
    settings.mode === 'hard' ? Math.floor(settings.blur / 4) : settings.blur;
  blurField(field, width, height, radius, signal);
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) checkAbort(signal);
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x, offset = pixel * 4;
      // An existing subject pixel and an alpha-zero background pixel are never
      // darkened, nor is hidden RGB or source alpha altered.
      if (subjectMask.data[pixel] > 0 || background.data[offset + 3] === 0) continue;
      const strength = field[pixel] / 255 * settings.opacity / 100 * gradientFactor(x, y, bounds, settings);
      if (strength <= 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const base = background.data[offset + channel], ink = settings.shadowColor[channel];
        out[offset + channel] = settings.blend === 'normal' ? base * (1 - strength) + ink * strength :
          base * (1 - strength) + base * ink / 255 * strength;
      }
    }
  }
  checkAbort(signal);
  return result;
}
