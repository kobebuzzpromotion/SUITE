import {TrialClient} from '../trial-client.mjs';
import {validateOriginalShadowManualDocument} from '../original-shadow-manual-recipe.mjs';
import {assertPixels, checkAbort, MAX_INPUT_BYTES} from './pure.mjs';
import {authorSubjectMask} from './subject-mask-authoring.mjs';
import {applyBoundOriginalShadow, ORIGINAL_SHADOW_MASK_SOURCE,
  ORIGINAL_SHADOW_MAX_PIXELS} from './original-shadow.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => {const item = Object.getOwnPropertyDescriptor(value, key);
    return item?.enumerable === true && Object.hasOwn(item, 'value');});
const abortError = () => new DOMException('Original Shadow render cancelled', 'AbortError');
function abort(signal) {if (signal?.aborted) throw abortError();}
async function read(task, signal) {
  abort(signal);
  const pending = Promise.resolve().then(task);
  if (!signal) return pending;
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, {once: true});
    if (signal.aborted) onAbort();
  });
  try {const value = await Promise.race([pending, cancelled]); abort(signal); return value;}
  finally {signal.removeEventListener('abort', onAbort);}
}
function principal(session, first) {
  const p = session?.principal;
  if (session?.mode !== 'INVITED_LOCAL_TRIAL' || !UUID.test(p?.id) ||
      p?.tenantId !== `trial-${p.id}`)
    throw Error(session?.endedReason || 'ORIGINAL_SHADOW_RUNTIME_SESSION_REQUIRED');
  if (first && (p.id !== first.id || p.tenantId !== first.tenantId))
    throw Error('ORIGINAL_SHADOW_RUNTIME_SESSION_CHANGED');
  return Object.freeze({id: p.id, tenantId: p.tenantId});
}
function asset(assets, id, expectedSHA, tenantId, first) {
  if (!Array.isArray(assets)) throw Error('ORIGINAL_SHADOW_RUNTIME_ASSETS_INVALID');
  const matches = assets.filter(item => item?.id === id);
  if (matches.length !== 1 || matches[0].deletedAt !== null ||
      matches[0].cloudSafe !== true || matches[0].tenantId !== tenantId)
    throw Error('ORIGINAL_SHADOW_RUNTIME_ASSET_UNAVAILABLE');
  const found = matches[0];
  if (!SHA.test(found.sha256) ||
      found.sha256.toLowerCase() !== expectedSHA.toLowerCase() ||
      !Number.isSafeInteger(found.size) || found.size < 1 ||
      found.size > MAX_INPUT_BYTES || first && found.size !== first.size)
    throw Error('ORIGINAL_SHADOW_RUNTIME_ORIGINAL_CHANGED');
  return Object.freeze({size: found.size});
}
async function originalDigest(api, id, expectedSHA, size, signal) {
  const bytes = await read(() => api.getOriginal(id, {signal}), signal);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== size)
    throw Error('ORIGINAL_SHADOW_RUNTIME_ORIGINAL_CHANGED');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw Error('ORIGINAL_SHADOW_RUNTIME_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await read(() => subtle.digest('SHA-256', bytes), signal));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== expectedSHA.toLowerCase())
    throw Error('ORIGINAL_SHADOW_RUNTIME_ORIGINAL_CHANGED');
}
function savedManual(saved, revision, target, backdrop) {
  if (saved?.revision !== revision || !saved.body)
    throw Error('ORIGINAL_SHADOW_RUNTIME_REVISION_CONFLICT');
  const document = saved.body?.parameters?.extendedParameters?.originalShadowManual;
  if (!document) throw Error('ORIGINAL_SHADOW_RUNTIME_DOCUMENT_MISSING');
  const binding = document.binding;
  if (!exact(binding, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
    'backdropID', 'backdropSHA256']) || binding.assetID !== target.id ||
      binding.backdropID !== backdrop.id)
    throw Error('ORIGINAL_SHADOW_RUNTIME_BINDING_MISMATCH');
  const validated = validateOriginalShadowManualDocument(document, binding);
  return Object.freeze({document: validated, encoded: JSON.stringify(validated)});
}
function frame(original, composite, binding, representation) {
  assertPixels(original); assertPixels(composite);
  if (original.width !== composite.width || original.height !== composite.height ||
      original.width * original.height > ORIGINAL_SHADOW_MAX_PIXELS)
    throw Error('ORIGINAL_SHADOW_RUNTIME_DIMENSIONS_MISMATCH');
  if (representation === 'original') {
    if (original.width !== binding.sourceWidth || original.height !== binding.sourceHeight)
      throw Error('ORIGINAL_SHADOW_RUNTIME_DIMENSIONS_MISMATCH');
  } else if (representation === 'proxy') {
    if (original.width > binding.sourceWidth || original.height > binding.sourceHeight ||
        (original.width === binding.sourceWidth && original.height === binding.sourceHeight) ||
        original.sourceWidth !== binding.sourceWidth ||
        original.sourceHeight !== binding.sourceHeight ||
        Math.abs(original.width * binding.sourceHeight -
          original.height * binding.sourceWidth) >
          Math.max(binding.sourceWidth, binding.sourceHeight))
      throw Error('ORIGINAL_SHADOW_RUNTIME_DIMENSIONS_MISMATCH');
  } else throw Error('ORIGINAL_SHADOW_RUNTIME_REPRESENTATION_INVALID');
}

/**
 * Trial-only, fail-closed bridge from a saved two-layer manual document to the
 * explicit Original Shadow pixel primitive. No caller-supplied `allowed` or
 * provenance is accepted: session, live Assets, Recipe revision, two Original
 * byte digests and permissions are read from the authenticated Trial API.
 * The supplied decoded pixels cannot by themselves prove a genuine RAW decode;
 * product Worker/Final must still bind those pixels to verified Original bytes.
 */
export async function renderTrialOriginalShadow(options) {
  if (!exact(options, ['api', 'assetID', 'backdropID', 'savedRevision', 'action',
    'representation', 'original', 'composite']) &&
      !exact(options, ['api', 'assetID', 'backdropID', 'savedRevision', 'action',
        'representation', 'original', 'composite', 'signal']))
    throw Error('ORIGINAL_SHADOW_RUNTIME_INPUT_INVALID');
  const {api, assetID, backdropID, savedRevision, action, representation,
    original, composite, signal} = options;
  if (!(api instanceof TrialClient) || !UUID.test(assetID) ||
      !UUID.test(backdropID) || assetID === backdropID ||
      !Number.isSafeInteger(savedRevision) || savedRevision < 1 ||
      !['edit', 'export'].includes(action) ||
      signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function'))
    throw Error('ORIGINAL_SHADOW_RUNTIME_INPUT_INVALID');
  abort(signal);
  const identity = principal(await read(() => api.getSession(), signal));
  const saved = await read(() => api.getRecipe(assetID), signal);
  const manual = savedManual(saved, savedRevision, {id: assetID}, {id: backdropID});
  const binding = manual.document.binding;
  frame(original, composite, binding, representation);
  const firstAssets = await read(() => api.listAssets(), signal);
  const target = asset(firstAssets, assetID, binding.originalSHA256, identity.tenantId);
  const backdrop = asset(firstAssets, backdropID, binding.backdropSHA256, identity.tenantId);
  await originalDigest(api, assetID, binding.originalSHA256, target.size, signal);
  await originalDigest(api, backdropID, binding.backdropSHA256, backdrop.size, signal);
  const context = Object.freeze({assetID, originalSHA256: binding.originalSHA256,
    savedRevision});
  // The saved document has two independent roles. Reusing the same bounded
  // normalized rasterizer does not relabel a UI-created mask as authentication.
  const subjectMask = authorSubjectMask(original, manual.document.subjectStrokes,
    context, {ownerConfirmed: true, signal});
  const authoredShadow = authorSubjectMask(original, manual.document.shadowStrokes,
    context, {ownerConfirmed: true, signal});
  const shadowMask = Object.freeze({width: authoredShadow.width,
    height: authoredShadow.height, data: authoredShadow.data,
    provenance: Object.freeze({kind: 'original-shadow-mask',
      source: ORIGINAL_SHADOW_MASK_SOURCE, ...context,
      width: authoredShadow.width, height: authoredShadow.height})});
  // Recheck after expensive rasterization: revoke/change must not publish a
  // result. Save CAS and final byte-to-decoded-frame binding remain external.
  const latest = await read(() => api.getRecipe(assetID), signal);
  if (savedManual(latest, savedRevision, {id: assetID}, {id: backdropID}).encoded !==
      manual.encoded)
    throw Error('ORIGINAL_SHADOW_RUNTIME_REVISION_CONFLICT');
  const lastAssets = await read(() => api.listAssets(), signal);
  asset(lastAssets, assetID, binding.originalSHA256, identity.tenantId, target);
  asset(lastAssets, backdropID, binding.backdropSHA256, identity.tenantId, backdrop);
  await originalDigest(api, assetID, binding.originalSHA256, target.size, signal);
  await originalDigest(api, backdropID, binding.backdropSHA256, backdrop.size, signal);
  principal(await read(() => api.getSession(), signal), identity);
  const targetPermission = await read(() => api.assertPermission(assetID, action), signal);
  const backdropPermission = await read(() => api.assertPermission(backdropID, 'export'), signal);
  if (targetPermission?.authorized !== true || backdropPermission?.authorized !== true)
    throw Error('ORIGINAL_SHADOW_RUNTIME_PERMISSION_DENIED');
  abort(signal);
  const pixels = applyBoundOriginalShadow(original, composite, subjectMask,
    shadowMask, context, {opacity: manual.document.settings.opacity, signal});
  checkAbort(signal);
  return Object.freeze({pixels, subjectMask, shadowMask,
    representation, savedRevision});
}
