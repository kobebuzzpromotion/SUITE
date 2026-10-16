import {TrialClient} from './trial-client.mjs';
import {createProcessing} from './processing/index.mjs';
import {ADD_SHADOW_MAX_PIXELS} from './processing/add-shadow.mjs';
import {assertInputBuffer, assertPixels, sourceDimensions, MAX_INPUT_BYTES, MAX_PIXELS, MAX_SOURCE_PIXELS} from './processing/pure.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const BINDING_KEYS = ['assetID', 'originalSHA256', 'savedRevision',
  'sourceWidth', 'sourceHeight', 'backdropID', 'backdropSHA256'];
const abortError = () => new DOMException('Backdrop read cancelled', 'AbortError');
function checkAbort(signal) {if (signal?.aborted) throw abortError();}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
}
async function read(task, signal) {
  checkAbort(signal);
  const pending = Promise.resolve().then(task);
  if (!signal) return pending;
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, {once: true});
    if (signal.aborted) onAbort();
  });
  try {const result = await Promise.race([pending, cancelled]); checkAbort(signal); return result;}
  finally {signal.removeEventListener('abort', onAbort);}
}
async function sha256(bytes, signal) {
  checkAbort(signal);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('ADD_SHADOW_BACKDROP_CRYPTO_UNAVAILABLE');
  const hash = new Uint8Array(await read(() => subtle.digest('SHA-256', bytes), signal));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}
function sessionIdentity(session, first) {
  const principal = session?.principal;
  if (session?.mode !== 'INVITED_LOCAL_TRIAL' || !UUID.test(principal?.id) ||
      principal?.tenantId !== `trial-${principal.id}`)
    throw Error(session?.endedReason || 'ADD_SHADOW_BACKDROP_SESSION_REQUIRED');
  if (first && (first.id !== principal.id || first.tenantId !== principal.tenantId))
    throw Error('ADD_SHADOW_BACKDROP_SESSION_CHANGED');
  return Object.freeze({id: principal.id, tenantId: principal.tenantId});
}
function listedAsset(assets, id, hash, first) {
  if (!Array.isArray(assets)) throw Error('ADD_SHADOW_BACKDROP_ASSET_LIST_INVALID');
  const matches = assets.filter(item => item?.id === id);
  if (matches.length !== 1 || matches[0].deletedAt !== null ||
      matches[0].cloudSafe !== true)
    throw Error('ADD_SHADOW_BACKDROP_ASSET_UNAVAILABLE');
  const asset = matches[0];
  if (!SHA.test(asset.sha256) || asset.sha256.toLowerCase() !== hash ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 ||
      asset.size > MAX_INPUT_BYTES || first && asset.size !== first.size)
    throw Error('ADD_SHADOW_BACKDROP_ORIGINAL_CHANGED');
  return Object.freeze({size: asset.size});
}
function savedRecipe(saved, revision) {
  if (!saved || saved.revision !== revision || saved.body == null)
    throw Error('ADD_SHADOW_BACKDROP_REVISION_CONFLICT');
}
async function permission(api, id, action, signal) {
  const result = await read(() => api.assertPermission(id, action), signal);
  if (result?.authorized !== true) throw Error('ADD_SHADOW_BACKDROP_PERMISSION_DENIED');
}
async function original(api, id, hash, asset, signal) {
  const bytes = await read(() => api.getOriginal(id, {signal}), signal);
  assertInputBuffer(bytes);
  if (bytes.byteLength !== asset.size || await sha256(bytes, signal) !== hash)
    throw Error('ADD_SHADOW_BACKDROP_ORIGINAL_CHANGED');
  return bytes;
}
function verifiedFrame(decoded, hash, width, height, mode, maxPixels = ADD_SHADOW_MAX_PIXELS) {
  const pixels = decoded?.pixels;
  assertPixels(pixels);
  const source = sourceDimensions(pixels);
  if (decoded?.provenance?.sourceSHA256 !== hash ||
      decoded.provenance?.sourceRepresentation !== 'original-camera-raw' ||
      decoded.provenance?.thumbnailFallback !== false ||
      decoded.provenance?.mode !== mode ||
      source.width !== width || source.height !== height ||
      mode === 'final' && (pixels.width !== width || pixels.height !== height) ||
      pixels.width * pixels.height > maxPixels)
    throw Error('ADD_SHADOW_BACKDROP_DECODE_MISMATCH');
  return {width:pixels.width, height:pixels.height, data: new Uint8ClampedArray(pixels.data),
    sourceWidth:source.width, sourceHeight:source.height};
}
function targetFrame(pixels, width, height) {
  assertPixels(pixels);
  if (pixels.width !== width || pixels.height !== height ||
      pixels.width * pixels.height > ADD_SHADOW_MAX_PIXELS)
    throw Error('ADD_SHADOW_BACKDROP_TARGET_DIMENSIONS_MISMATCH');
  const source = sourceDimensions(pixels);
  return {width, height, data: new Uint8ClampedArray(pixels.data),
    sourceWidth:source.width, sourceHeight:source.height};
}

/**
 * Read-only local Trial Gate. `binding` and `selectedBackdropID` are caller
 * choices, not authorization: both Originals and permissions are fetched
 * afresh from Trial. Only the product's real LibRaw Worker may create RGBA.
 * Identically sized upright decoded images are required; automatic backdrop
 * alignment/resizing is deliberately not inferred. The result is a snapshot,
 * not a permission capability for a later save or Final operation.
 */
export async function readTrialAddShadowBackdrop(options) {
  if (!exact(options, ['api', 'binding', 'selectedBackdropID', 'target']) &&
      !exact(options, ['api', 'binding', 'selectedBackdropID', 'target', 'signal']))
    throw Error('ADD_SHADOW_BACKDROP_INPUT_INVALID');
  const {api, selectedBackdropID, target, signal} = options;
  const claim = options.binding;
  if (!(api instanceof TrialClient) || !exact(claim, BINDING_KEYS) ||
      !UUID.test(claim.assetID) || !SHA.test(claim.originalSHA256) ||
      !UUID.test(claim.backdropID) || !SHA.test(claim.backdropSHA256) ||
      claim.assetID === claim.backdropID ||
      selectedBackdropID !== claim.backdropID ||
      !Number.isSafeInteger(claim.savedRevision) || claim.savedRevision < 1 ||
      !Number.isSafeInteger(claim.sourceWidth) || claim.sourceWidth < 1 ||
      !Number.isSafeInteger(claim.sourceHeight) || claim.sourceHeight < 1 ||
      // Canonical Original metadata may exceed the effect's 8MP frame budget.
      // Proxy reads may decode up to 24MP but must shrink before the 8MP effect.
      // Source reads retain the effect's actual-buffer limit.
      claim.sourceWidth * claim.sourceHeight > MAX_SOURCE_PIXELS ||
      !['source', 'proxy'].includes(target) ||
      signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function'))
    throw Error('ADD_SHADOW_BACKDROP_INPUT_INVALID');
  const binding = Object.freeze({...claim,
    originalSHA256: claim.originalSHA256.toLowerCase(),
    backdropSHA256: claim.backdropSHA256.toLowerCase()});
  checkAbort(signal);
  const principal = sessionIdentity(await read(() => api.getSession(), signal));
  const listed = await read(() => api.listAssets(), signal);
  const sourceAsset = listedAsset(listed, binding.assetID, binding.originalSHA256);
  const backdropAsset = listedAsset(listed, binding.backdropID, binding.backdropSHA256);
  savedRecipe(await read(() => api.getRecipe(binding.assetID), signal), binding.savedRevision);
  await permission(api, binding.assetID, 'edit', signal);
  await permission(api, binding.backdropID, 'export', signal);
  const sourceBytes = await original(api, binding.assetID,
    binding.originalSHA256, sourceAsset, signal);
  const backdropBytes = await original(api, binding.backdropID,
    binding.backdropSHA256, backdropAsset, signal);
  const processing = createProcessing();
  let source, backdrop;
  try {
    const decodeMaxPixels = target === 'proxy' ? MAX_PIXELS : ADD_SHADOW_MAX_PIXELS;
    const decodeMode = target === 'proxy' ? 'proxy' : 'final';
    // Decode each verified byte snapshot rather than trusting an arbitrary
    // caller-supplied RGBA frame, digest, or decoder callback.
    source = verifiedFrame(await read(() => processing.decodeRaw(sourceBytes.slice(0),
      {mode: decodeMode, signal}), signal), binding.originalSHA256,
    binding.sourceWidth, binding.sourceHeight, decodeMode, decodeMaxPixels);
    backdrop = verifiedFrame(await read(() => processing.decodeRaw(backdropBytes.slice(0),
      {mode: decodeMode, signal}), signal), binding.backdropSHA256,
    binding.sourceWidth, binding.sourceHeight, decodeMode, decodeMaxPixels);
    if (target === 'proxy') {
      // Full decoded frames are intermediate only. Both must pass makeProxy
      // and the actual 8MP target-frame check before any mask/render caller.
      const scale = Math.min(1, 1600 / Math.max(binding.sourceWidth, binding.sourceHeight));
      const width = Math.max(1, Math.round(binding.sourceWidth * scale));
      const height = Math.max(1, Math.round(binding.sourceHeight * scale));
      source = targetFrame(await read(() => processing.makeProxy(source, 1600), signal), width, height);
      backdrop = targetFrame(await read(() => processing.makeProxy(backdrop, 1600), signal), width, height);
    }
  } finally {processing.dispose();}
  const listedAfter = await read(() => api.listAssets(), signal);
  listedAsset(listedAfter, binding.assetID, binding.originalSHA256, sourceAsset);
  listedAsset(listedAfter, binding.backdropID, binding.backdropSHA256, backdropAsset);
  savedRecipe(await read(() => api.getRecipe(binding.assetID), signal), binding.savedRevision);
  sessionIdentity(await read(() => api.getSession(), signal), principal);
  await permission(api, binding.assetID, 'edit', signal);
  await permission(api, binding.backdropID, 'export', signal);
  sessionIdentity(await read(() => api.getSession(), signal), principal);
  const pixelsSHA256 = await sha256(backdrop.data, signal);
  const sourcePixelsSHA256 = await sha256(source.data, signal);
  checkAbort(signal);
  const selectionEvidence = Object.freeze({kind: 'owner-selected-image-backdrop-frame',
    ...binding, target, width: backdrop.width, height: backdrop.height, pixelsSHA256});
  return {original: source, selectedBackground: backdrop, binding,
    selectionEvidence, sourcePixelsSHA256,
    verification: 'TRIAL_FRESH_ORIGINAL_LIBRAW_READ_ONLY_NOT_SAVE_AUTHORITY'};
}
