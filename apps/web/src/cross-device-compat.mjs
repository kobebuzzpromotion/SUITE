// A conservative, data-only preflight for the fields shared by SuiteCore's
// Workspace models and the Node Workspace API. This is not device sync,
// authorization, or a promise that either renderer supports an edit.
import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';

const STAGES = new Set(['whiteBalance', 'tint', 'exposure', 'contrast', 'highlight',
  'shadow', 'white', 'black', 'temperature', 'saturation', 'vibrance', 'hsl',
  'toneCurve', 'sharpness', 'noiseReduction', 'lensCorrection',
  'postDecodeAdjustments', 'crop', 'rotation']);
const RESERVED_EXTENSIONS = new Set(['postDecodeAdjustments', 'postCropAdjustments',
  'canvasExpand', 'localLevels', 'portrait', 'crop', 'export']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code) { throw new Error(`CROSS_DEVICE_${code}`); }
function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(code);
  if (Object.getOwnPropertySymbols(value).length) fail(code);
  return value;
}
function visibleKeys(object, code) {
  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
  return Object.keys(object);
}
function keys(value, required, optional = [], code = 'FIELDS') {
  const object = record(value, code);
  if (visibleKeys(object, code).some(key => ![...required, ...optional].includes(key)) ||
      required.some(key => !Object.hasOwn(object, key))) fail(code);
  return object;
}
function nonempty(value, code = 'VALUE') {
  if (typeof value !== 'string' || !value.trim()) fail(code);
}
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('ID'); }
function version(value, zero = false) {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1)) fail('VERSION');
}
function timestamp(value) {
  // Workspace server serializes Date.toISOString(), never a local timezone.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('TIME');
}
function deletedAt(value) { if (value !== null) timestamp(value); }
function jsonValue(value, depth = 0) {
  if (depth > 32) fail('DEPTH');
  if (typeof value === 'number') { if (!Number.isFinite(value) || Object.is(value, -0)) fail('JSON'); return; }
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1 ||
        Array.from({length: value.length}, (_, index) => !Object.hasOwn(value, index)).some(Boolean)) fail('JSON');
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('JSON');
    }
    value.forEach(item => jsonValue(item, depth + 1)); return;
  }
  const object = record(value, 'JSON');
  if (visibleKeys(object, 'JSON').some(key => !key.length)) fail('JSON');
  for (const item of Object.values(object)) jsonValue(item, depth + 1);
}
function recipe(value) {
  const doc = keys(value, ['schemaVersion', 'parameters'], [], 'RECIPE_FIELDS');
  if (doc.schemaVersion !== 1) fail('SCHEMA');
  const p = keys(doc.parameters, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
    'extendedParameters', 'processingOrder'], [], 'RECIPE_FIELDS');
  for (const name of ['exposure', 'contrast', 'saturation'])
    if (typeof p[name] !== 'number' || !Number.isFinite(p[name]) || Object.is(p[name], -0)) fail('RECIPE_VALUE');
  if (p.contrast < 0 || p.saturation < 0 || !Number.isSafeInteger(p.rotationDegrees)) fail('RECIPE_VALUE');
  if (!Array.isArray(p.processingOrder) ||
      Reflect.ownKeys(p.processingOrder).length !== p.processingOrder.length + 1 ||
      p.processingOrder.some(stage => !STAGES.has(stage)) ||
      new Set(p.processingOrder).size !== p.processingOrder.length) fail('RECIPE_ORDER');
  jsonValue(p.processingOrder);
  for (const [field, neutral, stage] of [['exposure', 0, 'exposure'], ['contrast', 1, 'contrast'],
    ['saturation', 1, 'saturation']])
    if (p[field] !== neutral && !p.processingOrder.includes(stage)) fail('RECIPE_ORDER');
  if (p.rotationDegrees % 360 !== 0 && !p.processingOrder.includes('rotation')) fail('RECIPE_ORDER');
  const extensions = record(p.extendedParameters, 'RECIPE_EXTENSIONS');
  visibleKeys(extensions, 'RECIPE_EXTENSIONS');
  for (const [name, item] of Object.entries(extensions)) {
    // Known processing extensions have additional backend/renderer constraints
    // not enforced by SuiteCore's generic RecipeValue; do not certify them here.
    if (!name.trim() || RESERVED_EXTENSIONS.has(name) || !/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/.test(name))
      fail('RECIPE_EXTENSION_UNVERIFIED');
    jsonValue(item);
  }
  if (p.processingOrder.includes('postDecodeAdjustments')) fail('RECIPE_EXTENSION_UNVERIFIED');
}
function scope(actual, expected, code) {
  if (expected !== undefined && actual !== expected) fail(code);
}
function project(value, context) {
  const p = keys(value, ['id', 'workspaceId', 'name', 'createdBy', 'createdAt', 'deletedAt']);
  uuid(p.id); uuid(p.workspaceId); scope(p.workspaceId, context.workspaceId, 'WORKSPACE');
  nonempty(p.name); nonempty(p.createdBy); timestamp(p.createdAt); deletedAt(p.deletedAt);
}
function asset(value, context) {
  const a = keys(value, ['id', 'tenantId', 'name', 'originalKey', 'sha256', 'size', 'cloudSafe', 'deletedAt']);
  uuid(a.id); uuid(a.tenantId); scope(a.tenantId, context.workspaceId, 'WORKSPACE');
  scope(a.id, context.assetId, 'ASSET');
  nonempty(a.name); nonempty(a.originalKey);
  if (typeof a.sha256 !== 'string' || !SHA256.test(a.sha256)) fail('SHA256');
  scope(a.sha256, context.originalSha256, 'SHA256');
  if (!Number.isSafeInteger(a.size) || a.size <= 0 || typeof a.cloudSafe !== 'boolean') fail('ASSET');
  deletedAt(a.deletedAt);
}
function preset(value, context) {
  const p = keys(value, ['id', 'workspaceId', 'scope', 'ownerUserId', 'name', 'version',
    'body', 'createdAt', 'updatedAt', 'deletedAt']);
  uuid(p.id); uuid(p.workspaceId); scope(p.workspaceId, context.workspaceId, 'WORKSPACE');
  if (!['PERSONAL', 'WORKSPACE'].includes(p.scope)) fail('PRESET_SCOPE'); // COMMUNITY has no publishing service.
  nonempty(p.ownerUserId); nonempty(p.name); version(p.version);
  timestamp(p.createdAt); timestamp(p.updatedAt); deletedAt(p.deletedAt); recipe(p.body);
}
function difference(value) {
  const d = keys(value, ['path'], ['before', 'after']);
  nonempty(d.path);
  if (Object.hasOwn(d, 'before')) jsonValue(d.before);
  if (Object.hasOwn(d, 'after')) jsonValue(d.after);
}
function recipeVersion(value, context) {
  const r = keys(value, ['id', 'workspaceId', 'projectId', 'assetId', 'editorUserId',
    'createdAt', 'updatedAt', 'version', 'parentVersion', 'branch', 'body',
    'changedFields', 'presetSnapshot']);
  for (const key of ['id', 'workspaceId', 'projectId', 'assetId']) uuid(r[key]);
  for (const [key, expected] of [['workspaceId', context.workspaceId],
    ['projectId', context.projectId], ['assetId', context.assetId]]) scope(r[key], expected, key.toUpperCase());
  nonempty(r.editorUserId); timestamp(r.createdAt); timestamp(r.updatedAt);
  version(r.version); version(r.parentVersion, true);
  if (r.parentVersion >= r.version || typeof r.branch !== 'boolean') fail('VERSION');
  recipe(r.body);
  if (!Array.isArray(r.changedFields) ||
      Reflect.ownKeys(r.changedFields).length !== r.changedFields.length + 1) fail('HISTORY');
  jsonValue(r.changedFields);
  r.changedFields.forEach(difference);
  if (r.presetSnapshot !== null) {
    const s = keys(r.presetSnapshot, ['id', 'version', 'body']);
    uuid(s.id); version(s.version); recipe(s.body);
  }
}

/** Strict field-preserving JSON roundtrip; no authorization or rendering claim. */
export function roundTripCrossDeviceRecord(kind, value, context = {}) {
  const checks = {recipe, project, asset, preset, recipeVersion};
  if (!Object.hasOwn(checks, kind)) fail('UNSUPPORTED_CONTRACT');
  keys(context, [], ['workspaceId', 'projectId', 'assetId', 'originalSha256'], 'CONTEXT');
  checks[kind](value, context);
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).length > 2_000_000) fail('SIZE');
  return JSON.parse(encoded);
}

/**
 * Build a versioned, per-record capability table without applying or dropping
 * settings. The existing capability preflight is the single source of device
 * support claims; this adapter only gives each finding its exact Recipe path.
 * Both records remain separate so a later UI cannot accidentally replace
 * target-device edits with an incomplete source-device render.
 */
export function planCrossDeviceRecordHandoff({direction, kind, sourceRecord, targetRecord = null} = {}) {
  const sourceReport = preflightCrossDeviceCapabilities({direction, kind, record: sourceRecord});
  const reverseDirection = direction === 'web-to-apple' ? 'apple-to-web' : 'web-to-apple';
  const targetReport = targetRecord === null ? null : preflightCrossDeviceCapabilities({
    direction: reverseDirection, kind, record: targetRecord
  });
  const prefix = kind === 'preset' ? 'body.parameters' : 'parameters';
  const stagePath = (name, index) => {
    if (['exposure', 'contrast', 'saturation'].includes(name)) return `${prefix}.${name}`;
    if (name === 'rotation') return `${prefix}.rotationDegrees`;
    return `${prefix}.processingOrder[${index}]`;
  };
  const extensionPath = name => `${prefix}.extendedParameters[${JSON.stringify(name)}]`;
  const fields = [
    ...sourceReport.stages.map((row, index) => Object.freeze({
      path: stagePath(row.name, index), kind: 'stage', name: row.name,
      assessment: row.assessment, sourceCapability: row.sourceCapability,
      targetCapability: row.targetCapability
    })),
    ...sourceReport.extensions.map(row => Object.freeze({
      path: extensionPath(row.name), kind: 'extension', name: row.name,
      assessment: row.assessment, sourceCapability: row.sourceCapability,
      targetCapability: row.targetCapability
    })),
    Object.freeze({path: `${prefix}.processingOrder`, kind: 'order', name: 'processingOrder',
      assessment: sourceReport.order.assessment,
      sourceCapability: sourceReport.order.sourceCapability,
      targetCapability: sourceReport.order.targetCapability})
  ];
  if (kind === 'preset') fields.push(Object.freeze({
    path: 'scope', kind: 'preset', name: 'scope', assessment: sourceReport.preset.assessment,
    sourceCapability: 'present', targetCapability: sourceReport.preset.assessment === 'supported' ? 'present' : 'unsupported'
  }));
  const unsupportedFields = Object.freeze(fields.filter(field => field.assessment === 'unsupported'));
  const unverifiedFields = Object.freeze(fields.filter(field => field.assessment === 'unverified'));
  return Object.freeze({
    manifestVersion: sourceReport.evidenceVersion,
    reportSchemaVersion: sourceReport.reportSchemaVersion,
    direction, kind, source: sourceReport.source, target: sourceReport.target,
    capabilities: Object.freeze(fields), unsupportedFields, unverifiedFields,
    sourceRecord: sourceReport.preservedRecord,
    targetRecord: targetReport?.preservedRecord ?? null,
    operationAllowed: false, authentication: 'NOT_CHECKED', transfer: 'NOT_CONNECTED',
    renderParity: 'NOT_VERIFIED'
  });
}
