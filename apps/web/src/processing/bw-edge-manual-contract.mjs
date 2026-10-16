import {BW_EDGE_REMOVAL_VERSION} from './bw-edge-removal.mjs';

/** A JSON-only, per-Asset manual selection contract; not an authorization API. */
export const BW_EDGE_MANUAL_MAX_PIXELS = 8_000_000;
// Source metadata permits the planned large-RAW reduced decode range. Actual
// correction masks/buffers retain BW_EDGE_MANUAL_MAX_PIXELS (8MP).
export const BW_EDGE_MANUAL_MAX_SOURCE_PIXELS = 96_000_000;
export const BW_EDGE_MANUAL_MAX_STROKES = 64;
export const BW_EDGE_MANUAL_MAX_POINTS = 4096;
export const BW_EDGE_MANUAL_MAX_JSON_BYTES = 96 * 1024;
export const BW_EDGE_MANUAL_SUBJECT_KIND = 'subject-alpha-mask';
export const BW_EDGE_MANUAL_CORRECTION_KIND = 'bw-edge-correction-mask';
export const BW_EDGE_MANUAL_CORRECTION_SOURCE = 'owner-manual-bw-edge-correction-strokes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const record = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unit = value => typeof value === 'number' && Number.isFinite(value) &&
  value >= 0 && value <= 1;
const positive = value => Number.isSafeInteger(value) && value > 0;

function exact(value, keys) {
  if (!record(value) || Reflect.ownKeys(value).length !== keys.length ||
      !keys.every(key => Object.hasOwn(value, key))) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

function dense(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
  }
  return true;
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function bindingCopy(binding) {
  if (!exact(binding, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight']) ||
      typeof binding.assetID !== 'string' || !UUID.test(binding.assetID) ||
      typeof binding.originalSHA256 !== 'string' || !SHA256.test(binding.originalSHA256) ||
      !positive(binding.sourceWidth) || !positive(binding.sourceHeight) ||
      binding.sourceWidth * binding.sourceHeight > BW_EDGE_MANUAL_MAX_SOURCE_PIXELS)
    throw Error('BW_EDGE_MANUAL_BINDING_INVALID');
  return Object.freeze({assetID: binding.assetID, originalSHA256: binding.originalSHA256,
    sourceWidth: binding.sourceWidth, sourceHeight: binding.sourceHeight});
}

function strokeCopy(stroke) {
  if (!exact(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
      !['ADD', 'ERASE'].includes(stroke.operation) ||
      !dense(stroke.path, 1, BW_EDGE_MANUAL_MAX_POINTS) ||
      typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
      stroke.radiusFraction < .001 || stroke.radiusFraction > .25 || !unit(stroke.hardness))
    throw Error('BW_EDGE_MANUAL_STROKE_INVALID');
  const path = stroke.path.map(point => {
    if (!exact(point, ['u', 'v']) || !unit(point.u) || !unit(point.v))
      throw Error('BW_EDGE_MANUAL_POINT_INVALID');
    return Object.freeze({u: point.u, v: point.v});
  });
  return Object.freeze({operation: stroke.operation, path: Object.freeze(path),
    radiusFraction: stroke.radiusFraction, hardness: stroke.hardness});
}

function strokesCopy(strokes, signal) {
  if (!dense(strokes, 1, BW_EDGE_MANUAL_MAX_STROKES))
    throw Error('BW_EDGE_MANUAL_STROKES_INVALID');
  let hasAdd = false, pointCount = 0;
  const copy = strokes.map(stroke => {
    checkAbort(signal);
    const validated = strokeCopy(stroke);
    pointCount += validated.path.length;
    if (pointCount > BW_EDGE_MANUAL_MAX_POINTS)
      throw Error('BW_EDGE_MANUAL_CAPACITY');
    if (validated.operation === 'ADD') hasAdd = true;
    return validated;
  });
  if (!hasAdd) throw Error('BW_EDGE_MANUAL_ADD_REQUIRED');
  return {copy: Object.freeze(copy), pointCount};
}

function sameBinding(left, right) {
  return left.assetID === right.assetID &&
    left.originalSHA256 === right.originalSHA256 &&
    left.sourceWidth === right.sourceWidth && left.sourceHeight === right.sourceHeight;
}

function runtimeCheck(binding, runtime) {
  if (!exact(runtime, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
    'draftBaseRevision', 'savedRevision', 'confirmedSelections', 'permissionEvidence']) ||
      !positive(runtime.draftBaseRevision) || !positive(runtime.savedRevision))
    throw Error('BW_EDGE_MANUAL_RUNTIME_INVALID');
  if (!exact(runtime.confirmedSelections, ['subject', 'correction']) ||
      runtime.confirmedSelections.subject !== true ||
      runtime.confirmedSelections.correction !== true)
    throw Error('BW_EDGE_MANUAL_OWNER_CONFIRMATION_REQUIRED');
  const current = bindingCopy({assetID: runtime.assetID,
    originalSHA256: runtime.originalSHA256, sourceWidth: runtime.sourceWidth,
    sourceHeight: runtime.sourceHeight});
  if (!sameBinding(binding, current)) throw Error('BW_EDGE_MANUAL_BINDING_MISMATCH');
  if (runtime.draftBaseRevision !== runtime.savedRevision)
    throw Error('BW_EDGE_MANUAL_REVISION_MISMATCH');
  const proof = runtime.permissionEvidence;
  if (!exact(proof, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
    'savedRevision', 'action', 'allowed']) ||
      !positive(proof.savedRevision) || !['edit', 'export'].includes(proof.action) ||
      proof.allowed !== true) throw Error('BW_EDGE_MANUAL_PERMISSION_DENIED');
  const authorized = bindingCopy({assetID: proof.assetID,
    originalSHA256: proof.originalSHA256, sourceWidth: proof.sourceWidth,
    sourceHeight: proof.sourceHeight});
  if (!sameBinding(binding, authorized)) throw Error('BW_EDGE_MANUAL_PERMISSION_DENIED');
  if (proof.savedRevision !== runtime.savedRevision)
    throw Error('BW_EDGE_MANUAL_REVISION_MISMATCH');
  return Object.freeze({savedRevision: runtime.savedRevision, action: proof.action});
}

/**
 * Validate both manual selections in upright, pre-rotation/crop full-source
 * coordinates. The caller MUST supply permissionEvidence from a real authenticated
 * Asset/Workspace authority and recheck CAS at save; a caller-created `allowed`
 * flag or `confirmedSelections` assertion is not authentication. This function
 * neither rasterizes nor changes RAW.
 * The two roles remain distinct for later mask provenance verification.
 */
export function validateBWEdgeManualContract(document, runtime, {signal} = {}) {
  checkAbort(signal);
  if (!exact(document, ['schemaVersion', 'engineVersion', 'binding',
    'subjectStrokes', 'correctionStrokes']) || document.schemaVersion !== 1 ||
      document.engineVersion !== BW_EDGE_REMOVAL_VERSION)
    throw Error('BW_EDGE_MANUAL_DOCUMENT_INVALID');
  const binding = bindingCopy(document.binding);
  const context = runtimeCheck(binding, runtime);
  const subject = strokesCopy(document.subjectStrokes, signal);
  const correction = strokesCopy(document.correctionStrokes, signal);
  if (subject.copy.length + correction.copy.length > BW_EDGE_MANUAL_MAX_STROKES ||
      subject.pointCount + correction.pointCount > BW_EDGE_MANUAL_MAX_POINTS)
    throw Error('BW_EDGE_MANUAL_CAPACITY');
  const validatedDocument = Object.freeze({schemaVersion: 1,
    engineVersion: BW_EDGE_REMOVAL_VERSION, binding,
    subjectStrokes: subject.copy, correctionStrokes: correction.copy});
  if (new TextEncoder().encode(JSON.stringify(validatedDocument)).byteLength >
      BW_EDGE_MANUAL_MAX_JSON_BYTES) throw Error('BW_EDGE_MANUAL_JSON_LIMIT');
  checkAbort(signal);
  return Object.freeze({document: validatedDocument, context,
    maskRoles: Object.freeze({subject: Object.freeze({kind: BW_EDGE_MANUAL_SUBJECT_KIND,
      source: 'verified-manual-subject-matte'}),
    correction: Object.freeze({kind: BW_EDGE_MANUAL_CORRECTION_KIND,
      source: BW_EDGE_MANUAL_CORRECTION_SOURCE})})});
}
