import {assertPixels, checkAbort} from './pure.mjs';
import {applyBackgroundComposite, validateSubjectMatte} from './background-composite.mjs';
import {ADD_SHADOW_BACKGROUND_SOURCE, ADD_SHADOW_MAX_PIXELS} from './add-shadow.mjs';
import {scaleAddShadowSettings} from './add-shadow-geometry.mjs';
import {ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS} from './add-shadow-manual-contract.mjs';
import {placeAddShadowBackdrop, validateAddShadowBackdropPlacement} from
  './add-shadow-backdrop-placement.mjs';

/**
 * A transport planner, NOT an authorization or image-decoding service.
 * The caller must get selectionEvidence and decoded frames from a fresh,
 * authenticated owner/backdrop path. A self-declared digest or provenance is
 * insufficient to establish who selected the image or which Blob decoded to
 * these RGBA pixels. This planner itself does not start a Worker.
 */
export const ADD_SHADOW_RUNTIME_VERSION = 'suite-add-shadow-runtime-explicit-image-3';
const INPUT_KEYS = ['original', 'selectedBackground', 'subjectMask', 'binding',
  'selectionEvidence', 'settings', 'target'];
const BINDING_KEYS = ['assetID', 'originalSHA256', 'savedRevision',
  'sourceWidth', 'sourceHeight', 'backdropID', 'backdropSHA256'];
const SELECTION_KEYS = ['kind', ...BINDING_KEYS, 'target', 'width', 'height', 'pixelsSHA256'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const ownData = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
};
const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => ownData(value, key));
const noAccessors = value => object(value) && Reflect.ownKeys(value).every(key =>
  ownData(value, key));
function inputShape(input) {
  if (!object(input) || !INPUT_KEYS.every(key => ownData(input, key)) ||
      Reflect.ownKeys(input).some(key => !INPUT_KEYS.includes(key) &&
        !['signal', 'backdropPlacement'].includes(key)) ||
      ['signal', 'backdropPlacement'].some(key => Object.hasOwn(input, key) && !ownData(input, key)))
    throw Error('ADD_SHADOW_RUNTIME_INPUT_INVALID');
}
function expectedDimensions(binding, target) {
  if (target === 'source') return {width: binding.sourceWidth, height: binding.sourceHeight};
  if (target !== 'proxy') throw Error('ADD_SHADOW_RUNTIME_TARGET_INVALID');
  const scale = Math.min(1, 1600 / Math.max(binding.sourceWidth, binding.sourceHeight));
  return {width: Math.max(1, Math.round(binding.sourceWidth * scale)),
    height: Math.max(1, Math.round(binding.sourceHeight * scale))};
}
function validatedBinding(binding) {
  if (!exact(binding, BINDING_KEYS) || !UUID.test(binding.assetID) ||
      !SHA.test(binding.originalSHA256) ||
      !Number.isSafeInteger(binding.savedRevision) || binding.savedRevision < 1 ||
      !Number.isSafeInteger(binding.sourceWidth) || binding.sourceWidth < 1 ||
      !Number.isSafeInteger(binding.sourceHeight) || binding.sourceHeight < 1 ||
      binding.sourceWidth * binding.sourceHeight > ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS ||
      !UUID.test(binding.backdropID) || !SHA.test(binding.backdropSHA256))
    throw Error('ADD_SHADOW_RUNTIME_BINDING_INVALID');
  return Object.fromEntries(BINDING_KEYS.map(key => [key, binding[key]]));
}
async function sha256(data, signal) {
  checkAbort(signal);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('ADD_SHADOW_RUNTIME_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await subtle.digest('SHA-256', data));
  checkAbort(signal);
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns structured-cloneable arguments for the `applyBoundAddShadow`
 * Worker case. No Worker is started here and no processing success is claimed.
 */
export async function prepareAddShadowWorkerRuntime(input) {
  inputShape(input);
  const {original, selectedBackground, subjectMask, selectionEvidence,
    settings, target, signal} = input;
  checkAbort(signal);
  const binding = validatedBinding(input.binding);
  const expected = expectedDimensions(binding, target);
  if (!noAccessors(original) || !noAccessors(selectedBackground) ||
      !exact(subjectMask, ['width', 'height', 'data', 'provenance']) ||
      !exact(subjectMask.provenance,
        ['kind', 'source', 'assetID', 'originalSHA256', 'savedRevision', 'width', 'height']))
    throw Error('ADD_SHADOW_RUNTIME_INPUT_INVALID');
  assertPixels(original);
  assertPixels(selectedBackground);
  const placement = Object.hasOwn(input, 'backdropPlacement') ?
    validateAddShadowBackdropPlacement(input.backdropPlacement) : null;
  if (original.width !== expected.width || original.height !== expected.height ||
      (!placement && (selectedBackground.width !== expected.width ||
        selectedBackground.height !== expected.height)))
    throw Error('ADD_SHADOW_RUNTIME_TARGET_DIMENSIONS_MISMATCH');
  if (expected.width * expected.height > ADD_SHADOW_MAX_PIXELS ||
      selectedBackground.width * selectedBackground.height > ADD_SHADOW_MAX_PIXELS)
    throw Error('ADD_SHADOW_RUNTIME_CAPACITY');
  const matteContext = {assetID: binding.assetID,
    originalSHA256: binding.originalSHA256, savedRevision: binding.savedRevision};
  validateSubjectMatte(subjectMask, matteContext, expected.width, expected.height);
  if (!exact(selectionEvidence, SELECTION_KEYS) ||
      selectionEvidence.kind !== 'owner-selected-image-backdrop-frame' ||
      selectionEvidence.target !== target ||
      selectionEvidence.width !== selectedBackground.width ||
      selectionEvidence.height !== selectedBackground.height ||
      !SHA.test(selectionEvidence.pixelsSHA256) ||
      BINDING_KEYS.some(key => selectionEvidence[key] !== binding[key]))
    throw Error('ADD_SHADOW_RUNTIME_SELECTION_MISMATCH');
  // Saved controls use source pixels; only the transient Worker arguments are
  // resized. Source rendering and the persisted document stay unchanged.
  const safeSettings = scaleAddShadowSettings(settings,
    binding.sourceWidth, binding.sourceHeight, target);
  // Snapshot before the first await. A caller cannot swap pixels/mask/settings
  // while a digest is pending and obtain a different Worker payload.
  const source = {width: expected.width, height: expected.height,
    data: new Uint8ClampedArray(original.data)};
  const backdrop = {width: selectedBackground.width, height: selectedBackground.height,
    data: new Uint8ClampedArray(selectedBackground.data)};
  const subject = {width: expected.width, height: expected.height,
    data: new Uint8Array(subjectMask.data), provenance: {
      kind: subjectMask.provenance.kind, source: subjectMask.provenance.source,
      ...matteContext, width: expected.width, height: expected.height
    }};
  const expectedPixelsSHA256 = selectionEvidence.pixelsSHA256.toLowerCase();
  if (await sha256(backdrop.data, signal) !== expectedPixelsSHA256)
    throw Error('ADD_SHADOW_RUNTIME_BACKDROP_PIXELS_MISMATCH');
  // Evidence describes the received frame, not a fabricated resized frame.
  // Only place the immutable snapshot after its supplied digest matches. The
  // authenticated caller still owns provenance and any persistence of placement.
  const placedBackdrop = placement ? placeAddShadowBackdrop(backdrop,
    expected.width, expected.height, placement, {signal}) : backdrop;
  const composite = applyBackgroundComposite(source, placedBackdrop, subject, matteContext, {signal});
  const compositeSHA256 = await sha256(composite.data, signal);
  const bound = {assetID: binding.assetID, originalSHA256: binding.originalSHA256,
    savedRevision: binding.savedRevision, backdropID: binding.backdropID,
    backdropSHA256: binding.backdropSHA256};
  const backgroundEvidence = {kind: 'composited-replacement-background',
    source: ADD_SHADOW_BACKGROUND_SOURCE, ...bound, width: expected.width,
    height: expected.height, compositeSHA256};
  checkAbort(signal);
  return {method: 'applyBoundAddShadow', target,
    sourceWidth: binding.sourceWidth, sourceHeight: binding.sourceHeight,
    args: [composite, subject, backgroundEvidence, bound, safeSettings]};
}
