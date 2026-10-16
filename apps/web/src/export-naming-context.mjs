import {EXPORT_NAMING_METHODS} from './export-naming.mjs';
import {resolveExportQueuePosition} from './export-queue.mjs';
import {readTrialDngCaptureDateNamingInput} from './export-capture-date-naming.mjs';

const verifiedBatchDates = new WeakMap();

// This module derives names from existing, attributable product state. It does
// not treat an Asset list as an export queue, import time as capture time, or a
// preset catalogue entry as proof that the preset was applied/selected.
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function originalFilename(state) {
  const asset = state?.asset;
  if (!record(asset) || typeof asset.id !== 'string' || !asset.id.trim() ||
      typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 4096 ||
      /[\\/\u0000-\u001f\u007f]/u.test(asset.name) || asset.name === '.' || asset.name === '..')
    throw Error('EXPORT_ORIGINAL_NAME_UNAVAILABLE');
  return asset.name;
}

function sameJSON(left, right) {
  // A mismatch is a refusal. False negatives from different JSON key order
  // are preferable to misattributing an edited Recipe to a saved preset.
  try { return JSON.stringify(left) === JSON.stringify(right); }
  catch { return false; }
}

function verifiedEffectPresetName(state, workspaceRecipeVersion, workspacePreset) {
  const saved = workspaceRecipeVersion, preset = workspacePreset;
  const snapshot = saved?.presetSnapshot;
  const presetBody = preset?.body ?? preset?.recipe;
  if (!record(saved) || !record(snapshot) || !record(preset) ||
      !['PERSONAL', 'WORKSPACE'].includes(preset.scope ?? preset.kind) ||
      !record(saved.body) || !record(state.recipe) ||
      !record(snapshot.body) || !record(presetBody) ||
      typeof preset.name !== 'string' || !preset.name.trim() ||
      typeof preset.id !== 'string' || !preset.id ||
      !Number.isSafeInteger(preset.version) || preset.version < 1 ||
      !Number.isSafeInteger(saved.version) || saved.version < 1 ||
      typeof saved.workspaceId !== 'string' || !saved.workspaceId ||
      saved.assetId !== state.asset.id || saved.version !== state.revision ||
      saved.branch === true || state.dirty !== false ||
      snapshot.id !== preset.id || snapshot.version !== preset.version ||
      saved.workspaceId !== preset.workspaceId ||
      !sameJSON(saved.body, state.recipe) || !sameJSON(snapshot.body, presetBody))
    throw Error('EXPORT_EFFECT_PRESET_UNAVAILABLE');
  return preset.name;
}

/**
 * Provide only proven data for normalizeExportNamingForm(). Custom text/name
 * and JPEG/PNG format remain explicit UI inputs; this helper never creates
 * them. Sequence requires an explicitly planned queue and a clean saved
 * Recipe. The synchronous capture-date path remains unavailable; the separate
 * async Trial DNG gate below is required for this naming method. A selected
 * Export Preset remains unavailable.
 * A saved Workspace/PERSONAL preset can be named only while the current clean
 * Recipe exactly matches its applied version and the preset's current version.
 */
export function resolveExportNamingContext({state, method, workspaceRecipeVersion,
  workspacePreset, exportQueuePlan} = {}) {
  if (!EXPORT_NAMING_METHODS.includes(method)) throw Error('EXPORT_NAMING_METHOD_UNSUPPORTED');
  const result = {originalFilename: originalFilename(state)};
  switch (method) {
    case 'custom-count':
    case 'custom-sequence':
      if (state?.dirty !== false || !Number.isSafeInteger(state?.revision) ||
          state.revision < 1 || !record(state?.recipe))
        throw Error('EXPORT_SEQUENCE_SAVED_RECIPE_REQUIRED');
      if (exportQueuePlan === undefined) throw Error('EXPORT_SEQUENCE_UNAVAILABLE');
      Object.assign(result, resolveExportQueuePosition({plan: exportQueuePlan, asset: state.asset}));
      break;
    case 'capture-date-original':
      throw Error('EXPORT_CAPTURE_DATE_UNAVAILABLE');
    case 'original-effect-preset':
    case 'original-effect-export-preset':
    case 'original-effect-custom':
      result.effectPresetName = verifiedEffectPresetName(state, workspaceRecipeVersion, workspacePreset);
      break;
  }
  if (method === 'original-export-preset' || method === 'original-effect-export-preset')
    throw Error('EXPORT_EXPORT_PRESET_UNAVAILABLE');
  return Object.freeze(result);
}

/**
 * All selected photos must independently pass the existing fresh Trial DNG
 * Original/EXIF/Recipe/export-permission gate. The opaque result is tied to
 * the actual branded queue, not to caller-supplied dates or a copied plan.
 * Call both before and after Final; this is naming evidence, not Final auth.
 */
export async function readTrialDngBatchCaptureDateEvidence({api, plan, localStates, signal} = {}) {
  if (!Array.isArray(plan) || plan.length < 2 || plan.length > 20 ||
      !Array.isArray(localStates) || localStates.length !== plan.length)
    throw Error('EXPORT_BATCH_CAPTURE_DATE_SELECTION_INVALID');
  const entries = [];
  for (let index = 0; index < plan.length; index++) {
    const selected = plan[index], state = localStates[index];
    if (!state?.asset || state.asset.id !== selected?.assetId ||
        state.asset.name !== selected.asset.name ||
        state.asset.sha256?.toLowerCase() !== selected.asset.sha256 ||
        state.asset.size !== selected.asset.size || state.dirty !== false ||
        !Number.isSafeInteger(state.revision) || state.revision < 1)
      throw Error('EXPORT_BATCH_CAPTURE_DATE_STATE_MISMATCH');
    resolveExportQueuePosition({plan, asset: state.asset});
    const proof = await readTrialDngCaptureDateNamingInput({api, state, ...(signal ? {signal} : {})});
    if (proof.verification !== 'TRIAL_DNG_EXIF_WALL_DATE_WITH_OFFSET_NOT_FINAL_AUTHORITY' ||
        proof.binding.assetID !== selected.assetId.toLowerCase() ||
        proof.binding.originalSHA256 !== selected.asset.sha256 ||
        proof.binding.savedRevision !== state.revision ||
        proof.namingInput.method !== 'capture-date-original')
      throw Error('EXPORT_BATCH_CAPTURE_DATE_BINDING_MISMATCH');
    entries.push(Object.freeze({assetId: selected.assetId, originalSHA256: selected.asset.sha256,
      revision: state.revision, captureDate: proof.namingInput.captureDate}));
  }
  const evidence = Object.freeze({kind: 'trial-dng-capture-date-batch',
    entries: Object.freeze(entries)});
  verifiedBatchDates.set(evidence, plan);
  return evidence;
}

/** Only an evidence object minted by the fresh Trial gate can name this queue. */
export function captureDateForVerifiedBatch({evidence, plan, asset} = {}) {
  if (!evidence || verifiedBatchDates.get(evidence) !== plan ||
      !Array.isArray(evidence.entries) || evidence.entries.length !== plan.length)
    throw Error('EXPORT_BATCH_CAPTURE_DATE_EVIDENCE_REQUIRED');
  const position = resolveExportQueuePosition({plan, asset});
  const entry = evidence.entries[position.sequence - 1];
  if (entry?.assetId !== asset.id || entry.originalSHA256 !== asset.sha256?.toLowerCase() ||
      typeof entry.captureDate !== 'string')
    throw Error('EXPORT_BATCH_CAPTURE_DATE_BINDING_MISMATCH');
  return entry.captureDate;
}
