import {TrialClient} from './trial-client.mjs';
import {readTrialAddShadowTarget} from './add-shadow-target-gate.mjs';
import {readTrialAddShadowBackdrop} from './add-shadow-backdrop-gate.mjs';
import {validateAddShadowManualDocument} from './processing/add-shadow-manual-contract.mjs';
import {rasterizeAddShadowManualSubjectMask} from './processing/add-shadow-manual-mask.mjs';
import {prepareAddShadowWorkerRuntime} from './processing/add-shadow-runtime.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels} from './processing/pure.mjs';

const INPUT_KEYS = ['api', 'document', 'selectedBackdropID', 'savedRevision',
  'target', 'ownerConfirmed'];
const BINDING_KEYS = ['assetID', 'originalSHA256', 'sourceWidth',
  'sourceHeight', 'backdropID', 'backdropSHA256'];
const abortError = () => new DOMException('Manual shadow cancelled', 'AbortError');
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
function fullBinding(document, savedRevision) {
  return {...document.binding, savedRevision};
}
function sameBinding(left, right) {
  return BINDING_KEYS.every(key => left[key] === right[key]);
}
async function savedDocument(api, document, savedRevision, signal) {
  const saved = await read(() => api.getRecipe(document.binding.assetID), signal);
  const stored = saved?.body?.parameters?.extendedParameters?.addShadowManual;
  if (saved?.revision !== savedRevision || !stored)
    throw Error('ADD_SHADOW_TRIAL_SAVED_DOCUMENT_REQUIRED');
  let checked;
  try {checked = validateAddShadowManualDocument(stored, document.binding, {signal});}
  catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw Error('ADD_SHADOW_TRIAL_SAVED_DOCUMENT_INVALID');
  }
  if (JSON.stringify(checked) !== JSON.stringify(document))
    throw Error('ADD_SHADOW_TRIAL_SAVED_DOCUMENT_CHANGED');
}
async function currentBackground(api, binding, signal) {
  const listed = await read(() => api.listAssets(), signal);
  if (!Array.isArray(listed)) throw Error('ADD_SHADOW_TRIAL_BACKDROP_CHANGED');
  const matches = listed.filter(asset => asset?.id === binding.backdropID);
  if (matches.length !== 1 || matches[0].deletedAt !== null ||
      matches[0].cloudSafe !== true ||
      matches[0].sha256?.toLowerCase() !== binding.backdropSHA256)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_CHANGED');
  const permitted = await read(() => api.assertPermission(binding.backdropID, 'export'), signal);
  if (permitted?.authorized !== true)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_PERMISSION_DENIED');
}
async function currentTarget(api, document, binding, target, first, signal,
  savedRequired = true) {
  const checked = await read(() => readTrialAddShadowTarget({api, binding,
    action: target === 'proxy' ? 'edit' : 'export', signal}), signal);
  if (checked.assetID !== binding.assetID ||
      checked.originalSHA256 !== binding.originalSHA256 ||
      checked.savedRevision !== binding.savedRevision ||
      first && (checked.principal.id !== first.principal.id ||
        checked.principal.tenantId !== first.principal.tenantId))
    throw Error('ADD_SHADOW_TRIAL_TARGET_CHANGED');
  if (savedRequired)
    await savedDocument(api, document, binding.savedRevision, signal);
  await currentBackground(api, binding, signal);
  return checked;
}

/**
 * Fresh two-Asset Gate for normal Recipe rendering. Draft is Preview-only and
 * still pins the current saved base revision; source/Final requires an exact
 * saved document. The returned Original RGBA must be byte-compared with the
 * caller's frame before the Worker may apply the bound runtime.
 */
export async function prepareTrialManualAddShadowRender(options) {
  const keys = ['api', 'document', 'selectedBackdropID', 'savedRevision',
    'target', 'ownerConfirmed', 'mode'];
  if (!exact(options, keys) && !exact(options, [...keys, 'signal']))
    throw Error('ADD_SHADOW_TRIAL_RENDER_INPUT_INVALID');
  const {api, selectedBackdropID, savedRevision, target, ownerConfirmed,
    mode, signal} = options;
  if (!(api instanceof TrialClient) || !Number.isSafeInteger(savedRevision) ||
      savedRevision < 1 || !['proxy', 'source'].includes(target) ||
      !['draft', 'saved'].includes(mode) ||
      (target === 'source' && mode !== 'saved') || ownerConfirmed !== true)
    throw Error('ADD_SHADOW_TRIAL_RENDER_INPUT_INVALID');
  checkAbort(signal);
  const document = validateAddShadowManualDocument(options.document,
    options.document?.binding, {signal});
  if (selectedBackdropID !== document.binding.backdropID)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_SELECTION_MISMATCH');
  const binding = fullBinding(document, savedRevision);
  const first = await currentTarget(api, document, binding, target,
    null, signal, mode === 'saved');
  const backdrop = await read(() => readTrialAddShadowBackdrop({api, binding,
    selectedBackdropID, target, signal}), signal);
  if (!sameBinding(backdrop.binding, binding) ||
      backdrop.binding.savedRevision !== savedRevision ||
      backdrop.selectionEvidence?.kind !== 'owner-selected-image-backdrop-frame' ||
      backdrop.selectionEvidence?.pixelsSHA256 == null)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_GATE_MISMATCH');
  const subjectMask = rasterizeAddShadowManualSubjectMask(backdrop.original,
    document, document.binding, {target, savedRevision,
      currentRevision: savedRevision, ownerConfirmed: true, signal});
  const runtime = await read(() => prepareAddShadowWorkerRuntime({
    original: backdrop.original, selectedBackground: backdrop.selectedBackground,
    subjectMask, binding, selectionEvidence: backdrop.selectionEvidence,
    settings: document.settings, target, signal}), signal);
  await currentTarget(api, document, binding, target, first, signal,
    mode === 'saved');
  checkAbort(signal);
  return {runtime, original: {width: backdrop.original.width,
    height: backdrop.original.height, data: new Uint8ClampedArray(backdrop.original.data)},
  binding: Object.freeze(binding), mode};
}

/**
 * Explicit local-Trial-only shadow operation. Input contains only a saved
 * typed document and selection IDs, never pixels/digest/permission evidence.
 * Each Gate independently rereads real Trial authority and verified Original
 * bytes; this function is not wired into Editor, save, Final, or legacy render.
 * It does not make an AI segmentation or arbitrary-background resize claim.
 */
export async function runTrialManualAddShadow(options) {
  if (!exact(options, INPUT_KEYS) && !exact(options, [...INPUT_KEYS, 'signal']))
    throw Error('ADD_SHADOW_TRIAL_INPUT_INVALID');
  const {api, selectedBackdropID, savedRevision, target, ownerConfirmed, signal} = options;
  if (!(api instanceof TrialClient) || !Number.isSafeInteger(savedRevision) ||
      savedRevision < 1 || !['proxy', 'source'].includes(target) ||
      ownerConfirmed !== true ||
      signal !== undefined && (signal === null || typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' ||
        typeof signal.removeEventListener !== 'function'))
    throw Error('ADD_SHADOW_TRIAL_INPUT_INVALID');
  checkAbort(signal);
  // The document is a claim until both Gates verify live server state.
  const document = validateAddShadowManualDocument(options.document,
    options.document?.binding, {signal});
  if (selectedBackdropID !== document.binding.backdropID)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_SELECTION_MISMATCH');
  const binding = fullBinding(document, savedRevision);
  const first = await currentTarget(api, document, binding, target, null, signal);
  const backdrop = await read(() => readTrialAddShadowBackdrop({api, binding,
    selectedBackdropID, target, signal}), signal);
  if (!sameBinding(backdrop.binding, binding) ||
      backdrop.binding.savedRevision !== savedRevision ||
      backdrop.selectionEvidence?.kind !== 'owner-selected-image-backdrop-frame' ||
      backdrop.selectionEvidence?.pixelsSHA256 == null)
    throw Error('ADD_SHADOW_TRIAL_BACKDROP_GATE_MISMATCH');
  const subjectMask = rasterizeAddShadowManualSubjectMask(backdrop.original,
    document, document.binding, {target, savedRevision,
      currentRevision: savedRevision, ownerConfirmed: true, signal});
  const runtime = await read(() => prepareAddShadowWorkerRuntime({
    original: backdrop.original, selectedBackground: backdrop.selectedBackground,
    subjectMask, binding, selectionEvidence: backdrop.selectionEvidence,
    settings: document.settings, target, signal}), signal);
  await currentTarget(api, document, binding, target, first, signal);
  const processing = createProcessing();
  let pixels;
  try {pixels = await read(() => processing.applyBoundAddShadow(runtime, {signal}), signal);}
  finally {processing.dispose();}
  assertPixels(pixels);
  if (pixels.width !== backdrop.original.width ||
      pixels.height !== backdrop.original.height)
    throw Error('ADD_SHADOW_TRIAL_RESULT_DIMENSIONS_MISMATCH');
  // The result stays private until a final fresh check; revoked or replaced
  // Assets cannot receive a successful-looking output after Worker completion.
  await currentTarget(api, document, binding, target, first, signal);
  checkAbort(signal);
  return {pixels, target, binding: Object.freeze(binding),
    verification: 'TRIAL_FRESH_MANUAL_SHADOW_READ_ONLY_NOT_SAVE_OR_FINAL_AUTHORITY'};
}
