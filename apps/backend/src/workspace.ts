import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {DatabaseSync, type SQLOutputValue} from 'node:sqlite';
import {validateRecipe} from './photo-policy.js';
import {validatePortraitBinding, validatePortraitContinuity} from './portrait-recipe.js';
import type {Asset} from './repository.js';

/** Actor identity and verified invitation email must originate from server authentication. */
export interface WorkspaceActor {userId: string}
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type WorkspacePermission = 'read' | 'edit' | 'export' | 'select' | 'manage-members' | 'manage-projects' | 'manage-presets' | 'publish-gallery' | 'delete' | 'owner' | 'audit';
export interface Workspace {id: string; name: string; createdBy: string; createdAt: string; deletedAt: string | null}
export interface WorkspaceMember {workspaceId: string; userId: string; role: WorkspaceRole; joinedAt: string; removedAt: string | null}
export interface WorkspaceInvitation {id: string; workspaceId: string; email: string; role: Exclude<WorkspaceRole, 'OWNER'>; state: 'pending' | 'accepted' | 'revoked'; expiresAt: string; createdBy: string; acceptedBy: string | null; createdAt: string}
export interface WorkspaceProject {id: string; workspaceId: string; name: string; createdBy: string; createdAt: string; deletedAt: string | null}
export interface RecipeDifference {path: string; before?: unknown; after?: unknown}
export interface TeamRecipeVersion {id: string; workspaceId: string; projectId: string; assetId: string; editorUserId: string; createdAt: string; updatedAt: string; version: number; parentVersion: number; branch: boolean; body: Record<string, unknown>; changedFields: RecipeDifference[]; presetSnapshot: {id: string; version: number; body: Record<string, unknown>} | null}
export interface TeamRecipeSaveResult {outcome: 'saved' | 'conflict'; version: TeamRecipeVersion; currentVersion: number; diff: RecipeDifference[]}
export type PresetScope = 'PERSONAL' | 'WORKSPACE' | 'COMMUNITY';
export interface TeamPreset {id: string; workspaceId: string; scope: PresetScope; ownerUserId: string; name: string; version: number; body: Record<string, unknown>; createdAt: string; updatedAt: string; deletedAt: string | null}
export type WorkspaceExportSize = {kind: 'original'} | {kind: 'percentage' | 'width' | 'height' | 'long-edge' | 'short-edge'; value: number} | {kind: 'fit' | 'dimensions'; width: number; height: number} | {kind: 'exact-dimensions'; width: number; height: number; strategy: 'crop' | 'stretch'} | {kind: 'exact-dimensions'; width: number; height: number; strategy: 'pad'; background: number[]};
export type WorkspaceOutputSharpening = {kind: 'none'} | {kind: 'screen' | 'print'; strength: 'low' | 'standard' | 'high'} | {kind: 'manual'; gain: number; radiusPx: number; thresholdLuma: number};
export interface WorkspaceExportPresetSettings {format: 'jpeg' | 'png' | 'tiff'; size: WorkspaceExportSize; resolution: {unit: 'ppi' | 'ppc'; value: number} | null; outputSharpening: WorkspaceOutputSharpening}
export interface WorkspaceExportPreset {id: string; workspaceId: string; scope: 'PERSONAL' | 'WORKSPACE'; ownerUserId: string; name: string; version: number; settings: WorkspaceExportPresetSettings; createdAt: string; updatedAt: string}
export interface TeamSelection {workspaceId: string; projectId: string; assetId: string; version: number; selected: boolean; editorUserId: string; updatedAt: string}
export interface CullingMark {assetId: string; rating: number; flag: 'none' | 'pick' | 'reject'; colorLabel: string | null; tags: string[]; segmentId: string | null}
export interface CullingSegment {id: string; name: string}
export interface CullingPage {workspaceId: string; projectId: string; version: number; segments: CullingSegment[]; marks: CullingMark[]; nextAfter: string | null}
export interface CullingExportPreflight {workspaceId: string; projectId: string; cullingVersion: number;
  orderedAssets: {assetId: string; originalSHA256: string; recipeVersion: number; recipeVersionId: string}[];
  status: 'PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL'; authoritativeForFinal: false}
export interface WorkspaceGallery {id: string; workspaceId: string; projectId: string; ownerUserId: string; title: string; assetIds: string[]; allowDownload: boolean; clientSelection: boolean; expiresAt: string | null; publishedBy: string | null; publishedAt: string | null; createdAt: string; deletedAt: string | null}
export interface WorkspaceAuditEvent {id: number; workspaceId: string; actorUserId: string; action: string; targetId: string; createdAt: string; details: Record<string, unknown>}
export type WorkspaceAssetLookup = (workspaceId: string, assetId: string, includeDeleted?: boolean) => Asset;
type Row = Record<string, SQLOutputValue>;
const roles: WorkspaceRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];
const permissions: Record<WorkspacePermission, readonly WorkspaceRole[]> = {
  read: roles, edit: ['OWNER', 'ADMIN', 'EDITOR'], export: ['OWNER', 'ADMIN', 'EDITOR'], select: roles,
  'manage-members': ['OWNER', 'ADMIN'], 'manage-projects': ['OWNER', 'ADMIN'], 'manage-presets': ['OWNER', 'ADMIN'],
  'publish-gallery': ['OWNER', 'ADMIN'], delete: ['OWNER', 'ADMIN'], owner: ['OWNER'], audit: ['OWNER', 'ADMIN'],
};
const text = (value: unknown, max = 255): string => {if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_INPUT'); return value.trim();};
const subject = (actor: WorkspaceActor): string => {
  // Authenticated subjects are opaque identifiers. Trimming could impersonate a different subject.
  if (typeof actor?.userId !== 'string' || !actor.userId || actor.userId.length > 512 || /[\u0000-\u001f\u007f]/.test(actor.userId)) throw new Error('INVALID_SUBJECT');
  return actor.userId;
};
const revision = (value: number): void => {if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new Error('INVALID_REVISION');};
const nullable = (value: SQLOutputValue | undefined): string | null => value === null || value === undefined ? null : String(value);
const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex');
const normalizedEmail = (value: string): string => {const result = text(value, 320).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('INVALID_EMAIL'); return result;};
const exportRecord = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === null || Object.getPrototypeOf(proto) === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
};
const exportInteger = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= max;
function exportPresetName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 120 || value.trim() !== value || /[\u0000-\u001f\u007f\\/]/u.test(value)) throw Error('INVALID_EXPORT_PRESET_NAME');
  return value;
}
/** Storage contract for the current Web Final options, not evidence that a preset was applied. */
function exportPresetSettingsJSON(value: unknown): string {
  if (!exportRecord(value, ['format', 'size', 'resolution', 'outputSharpening']) ||
      !['jpeg', 'png', 'tiff'].includes(value.format as string)) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  const size = value.size;
  if (!exportRecord(size, ['kind']) && !exportRecord(size, ['kind', 'value']) && !exportRecord(size, ['kind', 'width', 'height']) && !exportRecord(size, ['kind', 'width', 'height', 'strategy']) && !exportRecord(size, ['kind', 'width', 'height', 'strategy', 'background'])) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  if (size.kind === 'original') {
    if (!exportRecord(size, ['kind'])) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  } else if (size.kind === 'percentage') {
    if (!exportRecord(size, ['kind', 'value']) || !exportInteger(size.value, 100)) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  } else if (['width', 'height', 'long-edge', 'short-edge'].includes(size.kind as string)) {
    if (!exportRecord(size, ['kind', 'value']) || !exportInteger(size.value, 16_384)) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  } else if (size.kind === 'fit' || size.kind === 'dimensions') {
    if (!exportRecord(size, ['kind', 'width', 'height']) || !exportInteger(size.width, 16_384) || !exportInteger(size.height, 16_384)) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  } else if (size.kind === 'exact-dimensions') {
    const pad = size.strategy === 'pad';
    if (!exportRecord(size, pad ? ['kind', 'width', 'height', 'strategy', 'background'] : ['kind', 'width', 'height', 'strategy']) ||
        !['pad', 'crop', 'stretch'].includes(size.strategy as string) || !exportInteger(size.width, 16_384) || !exportInteger(size.height, 16_384) ||
        (pad && !['[255,255,255]', '[128,128,128]', '[0,0,0]'].includes(JSON.stringify(size.background)))) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  } else throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  const resolution = value.resolution;
  if (resolution !== null && (!exportRecord(resolution, ['unit', 'value']) ||
      !['ppi', 'ppc'].includes(resolution.unit as string) || !exportInteger(resolution.value, 65_535))) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  const sharpening = value.outputSharpening;
  if (exportRecord(sharpening, ['kind']) && sharpening.kind === 'none') {
    // Valid neutral output stage.
  } else if (exportRecord(sharpening, ['kind', 'strength']) && ['screen', 'print'].includes(sharpening.kind as string) &&
      ['low', 'standard', 'high'].includes(sharpening.strength as string)) {
    // SUITE-owned named export effects, not external vendor numeric parity.
  } else if (exportRecord(sharpening, ['kind', 'gain', 'radiusPx', 'thresholdLuma']) && sharpening.kind === 'manual' &&
      [sharpening.gain, sharpening.radiusPx, sharpening.thresholdLuma].every(number => typeof number === 'number' && Number.isFinite(number)) &&
      (sharpening.gain as number) >= 0 && (sharpening.gain as number) <= 2 &&
      (sharpening.radiusPx as number) >= 0.5 && (sharpening.radiusPx as number) <= 3 &&
      (sharpening.thresholdLuma as number) >= 0 && (sharpening.thresholdLuma as number) <= 64) {
    // Existing SUITE manual range remains unchanged.
  } else throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  const encoded = JSON.stringify(value);
  if (encoded.length > 4096) throw Error('INVALID_EXPORT_PRESET_SETTINGS');
  return encoded;
}
const exactCulling = (value: unknown, keys: string[]): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const cullingText = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('INVALID_CULLING_INPUT');
  return value;
};
function cullingMarkInput(value: unknown): Omit<CullingMark, 'assetId'> {
  if (!exactCulling(value, ['rating', 'flag', 'colorLabel', 'tags', 'segmentId']) ||
      Reflect.ownKeys(value).length !== 5 || !Number.isSafeInteger(value.rating) ||
      (value.rating as number) < 0 || (value.rating as number) > 5 ||
      !['none', 'pick', 'reject'].includes(value.flag as string) ||
      !Array.isArray(value.tags) || value.tags.length > 32) throw new Error('INVALID_CULLING_INPUT');
  if (Object.keys(value.tags).length !== value.tags.length) throw new Error('INVALID_CULLING_INPUT');
  const tags = value.tags.map(tag => cullingText(tag, 120));
  if (new Set(tags).size !== tags.length) throw new Error('INVALID_CULLING_INPUT');
  const colorLabel = value.colorLabel === null ? null : cullingText(value.colorLabel, 120);
  const segmentId = value.segmentId === null ? null : cullingText(value.segmentId, 128);
  return {rating: value.rating as number, flag: value.flag as CullingMark['flag'], colorLabel, tags, segmentId};
}

/** Use the existing plain JSON Recipe envelope; never place workspace fields inside it. */
function recipeJSON(value: unknown): string {
  validateRecipe(value);
  const inspect = (item: unknown): void => {
    if (item !== null && typeof item === 'object') {
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('INVALID_RECIPE_JSON');
      for (const child of Object.values(item)) inspect(child);
    }
  };
  inspect(value);
  const json = JSON.stringify(value);
  if (json.length > 2_000_000) throw new Error('RECIPE_TOO_LARGE');
  validateRecipe(JSON.parse(json));
  return json;
}

/** FULL_REPLACE presets are reusable across photos; a photo-bound manual mask is not. */
function presetRecipeJSON(value: unknown): string {
  const json = recipeJSON(value);
  const body = JSON.parse(json) as Record<string, unknown>;
  const parameters = body.parameters as Record<string, unknown>;
  const extra = parameters.extendedParameters as Record<string, unknown>;
  if (Object.hasOwn(extra, 'bwEdgeManual')) throw new Error('PHOTO_BOUND_BW_EDGE_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'addShadowManual')) throw new Error('PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'originalShadowManual')) throw new Error('PHOTO_BOUND_ORIGINAL_SHADOW_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'teethManual')) throw new Error('PHOTO_BOUND_TEETH_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'makeupHighlightManual')) throw new Error('PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'blushManual')) throw new Error('PHOTO_BOUND_BLUSH_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'faceDecorationsManual')) throw new Error('PHOTO_BOUND_FACE_DECORATIONS_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'contactsIrisManual')) throw new Error('PHOTO_BOUND_CONTACTS_IRIS_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'clothingSpotManual')) throw new Error('PHOTO_BOUND_CLOTHING_SPOT_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'handToneManual')) throw new Error('PHOTO_BOUND_HAND_TONE_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'eyelinerManual')) throw new Error('PHOTO_BOUND_EYELINER_PRESET_FORBIDDEN');
  if (Object.hasOwn(extra, 'eyeshadowManual')) throw new Error('PHOTO_BOUND_EYESHADOW_PRESET_FORBIDDEN');
  return json;
}

const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
/** An explicit Glow-only snapshot, never a general full-Recipe preset. */
function glowOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']))
    throw new Error('INVALID_GLOW_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postDecodeAdjustments'])) throw new Error('INVALID_GLOW_ONLY_PRESET');
  const adjustments = extra.postDecodeAdjustments;
  if (!exactKeys(adjustments, ['schemaVersion', 'engineVersion', 'color']) ||
      adjustments.schemaVersion !== 1 || adjustments.engineVersion !== 'suite-srgb8-color-detail-1' ||
      !exactKeys(adjustments.color, ['glow']) ||
      !exactKeys(adjustments.color.glow, ['mode', 'intensity', 'radius', 'threshold',
        'exposure', 'diffusion', 'tint'])) throw new Error('INVALID_GLOW_ONLY_PRESET');
  return body;
}
function mergeGlowOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  const sourceStage = sourceExtra.postDecodeAdjustments as Record<string, unknown>;
  const glow = (sourceStage.color as Record<string, unknown>).glow;
  const adjustments = (extra.postDecodeAdjustments ?? {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1'}) as Record<string, unknown>;
  const color = (adjustments.color ?? {}) as Record<string, unknown>;
  color.glow = glow;
  adjustments.color = color;
  extra.postDecodeAdjustments = adjustments;
  const order = params.processingOrder as string[];
  if (!order.includes('postDecodeAdjustments')) {
    const stop = order.findIndex(stage => stage === 'rotation' || stage === 'crop');
    order.splice(stop < 0 ? order.length : stop, 0, 'postDecodeAdjustments');
  }
  validateRecipe(merged);
  return merged;
}

/** A neutral, portable eight-field Grain snapshot: amount + six controls + seed. */
function grainOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']))
    throw new Error('INVALID_GRAIN_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postDecodeAdjustments'])) throw new Error('INVALID_GRAIN_ONLY_PRESET');
  const adjustments = extra.postDecodeAdjustments;
  if (!exactKeys(adjustments, ['schemaVersion', 'engineVersion', 'detail']) ||
      adjustments.schemaVersion !== 1 || adjustments.engineVersion !== 'suite-srgb8-color-detail-1' ||
      !exactKeys(adjustments.detail, ['grain']) ||
      !exactKeys(adjustments.detail.grain, ['amount', 'seed', 'shadows', 'midtones',
        'highlights', 'size', 'roughness', 'colorVariation']))
    throw new Error('INVALID_GRAIN_ONLY_PRESET');
  return body;
}
function mergeGrainOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  const sourceStage = sourceExtra.postDecodeAdjustments as Record<string, unknown>;
  const grain = (sourceStage.detail as Record<string, unknown>).grain;
  const adjustments = (extra.postDecodeAdjustments ?? {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1'}) as Record<string, unknown>;
  const detail = (adjustments.detail ?? {}) as Record<string, unknown>;
  detail.grain = grain;
  adjustments.detail = detail;
  extra.postDecodeAdjustments = adjustments;
  const order = params.processingOrder as string[];
  if (!order.includes('postDecodeAdjustments')) {
    const stop = order.findIndex(stage => stage === 'rotation' || stage === 'crop');
    order.splice(stop < 0 ? order.length : stop, 0, 'postDecodeAdjustments');
  }
  validateRecipe(merged);
  return merged;
}

/** A neutral portable preset containing exactly the six RGB primary controls. */
function calibrationOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']))
    throw new Error('INVALID_CALIBRATION_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postDecodeAdjustments']))
    throw new Error('INVALID_CALIBRATION_ONLY_PRESET');
  const adjustments = extra.postDecodeAdjustments;
  if (!exactKeys(adjustments, ['schemaVersion', 'engineVersion', 'color']) ||
      adjustments.schemaVersion !== 1 || adjustments.engineVersion !== 'suite-srgb8-color-detail-1' ||
      !exactKeys(adjustments.color, ['calibration']))
    throw new Error('INVALID_CALIBRATION_ONLY_PRESET');
  const color = adjustments.color;
  if (!exactKeys(color.calibration, ['red', 'green', 'blue']))
    throw new Error('INVALID_CALIBRATION_ONLY_PRESET');
  const calibration = color.calibration;
  if (!['red', 'green', 'blue'].every(primary =>
    exactKeys(calibration[primary], ['hue', 'saturation'])))
    throw new Error('INVALID_CALIBRATION_ONLY_PRESET');
  return body;
}
function mergeCalibrationOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  const sourceStage = sourceExtra.postDecodeAdjustments as Record<string, unknown>;
  const calibration = (sourceStage.color as Record<string, unknown>).calibration;
  const adjustments = (extra.postDecodeAdjustments ?? {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1'}) as Record<string, unknown>;
  const color = (adjustments.color ?? {}) as Record<string, unknown>;
  color.calibration = calibration;
  adjustments.color = color;
  extra.postDecodeAdjustments = adjustments;
  const order = params.processingOrder as string[];
  if (!order.includes('postDecodeAdjustments')) {
    const stop = order.findIndex(stage => stage === 'rotation' || stage === 'crop');
    order.splice(stop < 0 ? order.length : stop, 0, 'postDecodeAdjustments');
  }
  validateRecipe(merged);
  return merged;
}

/** A portable four-channel, five-control RGB Levels snapshot with no other edit. */
function levelsOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']))
    throw new Error('INVALID_LEVELS_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postDecodeAdjustments']))
    throw new Error('INVALID_LEVELS_ONLY_PRESET');
  const adjustments = extra.postDecodeAdjustments;
  if (!exactKeys(adjustments, ['schemaVersion', 'engineVersion', 'color']) ||
      adjustments.schemaVersion !== 1 || adjustments.engineVersion !== 'suite-srgb8-color-detail-1' ||
      !exactKeys(adjustments.color, ['levels']))
    throw new Error('INVALID_LEVELS_ONLY_PRESET');
  const levels = adjustments.color.levels;
  if (!exactKeys(levels, ['master', 'red', 'green', 'blue']) ||
      !['master', 'red', 'green', 'blue'].every(channel =>
        exactKeys(levels[channel], ['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite'])))
    throw new Error('INVALID_LEVELS_ONLY_PRESET');
  return body;
}
function mergeLevelsOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  const sourceStage = sourceExtra.postDecodeAdjustments as Record<string, unknown>;
  const levels = (sourceStage.color as Record<string, unknown>).levels;
  const adjustments = (extra.postDecodeAdjustments ?? {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1'}) as Record<string, unknown>;
  const color = (adjustments.color ?? {}) as Record<string, unknown>;
  color.levels = levels;
  adjustments.color = color;
  extra.postDecodeAdjustments = adjustments;
  const order = params.processingOrder as string[];
  if (!order.includes('postDecodeAdjustments')) {
    const stop = order.findIndex(stage => stage === 'rotation' || stage === 'crop');
    order.splice(stop < 0 ? order.length : stop, 0, 'postDecodeAdjustments');
  }
  validateRecipe(merged);
  return merged;
}

/** A portable Selective Color snapshot: one method and all 9 CMYK families. */
function selectiveOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'postDecodeAdjustments', 'rotation']))
    throw new Error('INVALID_SELECTIVE_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postDecodeAdjustments'])) throw new Error('INVALID_SELECTIVE_ONLY_PRESET');
  const adjustments = extra.postDecodeAdjustments;
  if (!exactKeys(adjustments, ['schemaVersion', 'engineVersion', 'color']) ||
      adjustments.schemaVersion !== 1 || adjustments.engineVersion !== 'suite-srgb8-color-detail-1' ||
      !exactKeys(adjustments.color, ['selectiveColor'])) throw new Error('INVALID_SELECTIVE_ONLY_PRESET');
  const selective = adjustments.color.selectiveColor as Record<string, unknown>;
  if (!exactKeys(selective, ['method', 'ranges']) ||
      !['relative', 'absolute'].includes(selective.method as string)) throw new Error('INVALID_SELECTIVE_ONLY_PRESET');
  const names = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'];
  const ranges = selective.ranges as Record<string, unknown>;
  if (!exactKeys(ranges, names) || !names.every(name =>
    exactKeys(ranges[name], ['cyan', 'magenta', 'yellow', 'black'])))
    throw new Error('INVALID_SELECTIVE_ONLY_PRESET');
  return body;
}
function mergeSelectiveOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  const sourceStage = sourceExtra.postDecodeAdjustments as Record<string, unknown>;
  const selective = (sourceStage.color as Record<string, unknown>).selectiveColor;
  const adjustments = (extra.postDecodeAdjustments ?? {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1'}) as Record<string, unknown>;
  const color = (adjustments.color ?? {}) as Record<string, unknown>;
  color.selectiveColor = selective;
  adjustments.color = color;
  extra.postDecodeAdjustments = adjustments;
  const order = params.processingOrder as string[];
  if (!order.includes('postDecodeAdjustments')) {
    const stop = order.findIndex(stage => stage === 'rotation' || stage === 'crop');
    order.splice(stop < 0 ? order.length : stop, 0, 'postDecodeAdjustments');
  }
  validateRecipe(merged);
  return merged;
}

/** A portable post-crop Vignette snapshot, without a new processingOrder stage. */
function vignetteOnlyPreset(value: unknown): Record<string, unknown> {
  const body = JSON.parse(presetRecipeJSON(value)) as Record<string, unknown>;
  const params = body.parameters;
  if (!exactKeys(body, ['schemaVersion', 'parameters']) || body.schemaVersion !== 1 ||
      !exactKeys(params, ['exposure', 'contrast', 'saturation', 'rotationDegrees',
        'extendedParameters', 'processingOrder']) ||
      params.exposure !== 0 || params.contrast !== 1 || params.saturation !== 1 ||
      params.rotationDegrees !== 0 ||
      JSON.stringify(params.processingOrder) !== JSON.stringify(
        ['exposure', 'contrast', 'saturation', 'rotation']))
    throw new Error('INVALID_VIGNETTE_ONLY_PRESET');
  const extra = params.extendedParameters;
  if (!exactKeys(extra, ['postCropAdjustments']))
    throw new Error('INVALID_VIGNETTE_ONLY_PRESET');
  const postCrop = extra.postCropAdjustments;
  if (!exactKeys(postCrop, ['schemaVersion', 'engineVersion', 'vignette']) ||
      postCrop.schemaVersion !== 1 ||
      postCrop.engineVersion !== 'suite-srgb8-manual-vignette-1')
    throw new Error('INVALID_VIGNETTE_ONLY_PRESET');
  const vignette = postCrop.vignette;
  if (!exactKeys(vignette, ['amount']) &&
      !exactKeys(vignette, ['amount', 'midpoint', 'roundness', 'feather', 'highlights']))
    throw new Error('INVALID_VIGNETTE_ONLY_PRESET');
  // presetRecipeJSON has already checked every control's finite range.
  return body;
}
function mergeVignetteOnly(preset: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged = JSON.parse(recipeJSON(target)) as Record<string, unknown>;
  const params = merged.parameters as Record<string, unknown>;
  const extra = params.extendedParameters as Record<string, unknown>;
  const sourceExtra = (preset.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
  extra.postCropAdjustments = sourceExtra.postCropAdjustments;
  validateRecipe(merged);
  return merged;
}

export function recipeDifferences(before: unknown, after: unknown, path = ''): RecipeDifference[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(key => recipeDifferences(a[key], b[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  }
  return [{path: path || '/', ...(before === undefined ? {} : {before}), ...(after === undefined ? {} : {after})}];
}

/** Supplemental metadata only. Original bytes and existing storage contracts remain owned by AssetRepository/Storage. */
export class WorkspaceRepository {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly assetLookup: WorkspaceAssetLookup, private readonly clock: () => Date = () => new Date()) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS ws_workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS ws_members(workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN','EDITOR','VIEWER')),joined_at TEXT NOT NULL,removed_at TEXT,PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE IF NOT EXISTS ws_invitations(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('ADMIN','EDITOR','VIEWER')),token_hash TEXT NOT NULL UNIQUE,state TEXT NOT NULL CHECK(state IN ('pending','accepted','revoked')),expires_at TEXT NOT NULL,created_by TEXT NOT NULL,accepted_by TEXT,created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS ws_pending_invitation ON ws_invitations(workspace_id,email) WHERE state='pending';
      CREATE TABLE IF NOT EXISTS ws_projects(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,UNIQUE(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_assets(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,original_key TEXT NOT NULL,sha256 TEXT NOT NULL,registered_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,PRIMARY KEY(workspace_id,project_id,asset_id),UNIQUE(workspace_id,asset_id),FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_recipe_heads(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_recipe_versions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,parent_version INTEGER NOT NULL,editor_user_id TEXT NOT NULL,created_at TEXT NOT NULL,branch INTEGER NOT NULL,body TEXT NOT NULL,changed_fields TEXT NOT NULL,preset_snapshot TEXT,UNIQUE(workspace_id,project_id,asset_id,version),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_presets(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),scope TEXT NOT NULL CHECK(scope IN ('PERSONAL','WORKSPACE','COMMUNITY')),owner_user_id TEXT NOT NULL,created_at TEXT NOT NULL,current_version INTEGER NOT NULL,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS ws_preset_versions(preset_id TEXT NOT NULL REFERENCES ws_presets(id),version INTEGER NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,editor_user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(preset_id,version));
      CREATE TABLE IF NOT EXISTS ws_export_presets(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),scope TEXT NOT NULL CHECK(scope IN ('PERSONAL','WORKSPACE')),owner_user_id TEXT NOT NULL,created_at TEXT NOT NULL,current_version INTEGER NOT NULL CHECK(current_version>0));
      CREATE INDEX IF NOT EXISTS ws_export_presets_workspace ON ws_export_presets(workspace_id,created_at,id);
      CREATE TABLE IF NOT EXISTS ws_export_preset_versions(preset_id TEXT NOT NULL REFERENCES ws_export_presets(id),version INTEGER NOT NULL CHECK(version>0),name TEXT NOT NULL,settings TEXT NOT NULL,editor_user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(preset_id,version));
      CREATE TABLE IF NOT EXISTS ws_selections(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,version INTEGER NOT NULL,selected INTEGER NOT NULL,editor_user_id TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_culling_heads(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),PRIMARY KEY(workspace_id,project_id),FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_culling_marks(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 5),flag TEXT NOT NULL CHECK(flag IN ('none','pick','reject')),color_label TEXT,tags_json TEXT NOT NULL,editor_user_id TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id));
      CREATE TABLE IF NOT EXISTS ws_culling_segments(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,segment_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER NOT NULL,PRIMARY KEY(workspace_id,project_id,segment_id),FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_culling_assignments(workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,asset_id TEXT NOT NULL,segment_id TEXT NOT NULL,PRIMARY KEY(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,asset_id) REFERENCES ws_assets(workspace_id,project_id,asset_id),FOREIGN KEY(workspace_id,project_id,segment_id) REFERENCES ws_culling_segments(workspace_id,project_id,segment_id));
      CREATE TABLE IF NOT EXISTS ws_galleries(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,project_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,title TEXT NOT NULL,asset_ids TEXT NOT NULL,allow_download INTEGER NOT NULL,client_selection INTEGER NOT NULL,expires_at TEXT,published_by TEXT,published_at TEXT,created_at TEXT NOT NULL,deleted_at TEXT,FOREIGN KEY(workspace_id,project_id) REFERENCES ws_projects(workspace_id,id));
      CREATE TABLE IF NOT EXISTS ws_audit(id INTEGER PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES ws_workspaces(id),actor_user_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL,details TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS ws_recipe_immutable_update BEFORE UPDATE ON ws_recipe_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECIPE_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_recipe_immutable_delete BEFORE DELETE ON ws_recipe_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECIPE_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_preset_immutable_update BEFORE UPDATE ON ws_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_preset_immutable_delete BEFORE DELETE ON ws_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_export_preset_immutable_update BEFORE UPDATE ON ws_export_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EXPORT_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_export_preset_immutable_delete BEFORE DELETE ON ws_export_preset_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EXPORT_PRESET_VERSION'); END;
      CREATE TRIGGER IF NOT EXISTS ws_audit_immutable_update BEFORE UPDATE ON ws_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
      CREATE TRIGGER IF NOT EXISTS ws_audit_immutable_delete BEFORE DELETE ON ws_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
    `);
  }
  close(): void {this.db.close();}
  /** Internal routing probe, not an authorization decision or public enumeration endpoint. */
  hasWorkspace(workspaceId: string): boolean {return !!this.db.prepare('SELECT 1 FROM ws_workspaces WHERE id=?').get(workspaceId);}
  private now(): string {return this.clock().toISOString();}
  private transaction<T>(operation: () => T): T {this.db.exec('BEGIN IMMEDIATE'); try {const result = operation(); this.db.exec('COMMIT'); return result;} catch (error) {this.db.exec('ROLLBACK'); throw error;}}
  private log(actor: WorkspaceActor, workspaceId: string, action: string, targetId: string, details: Record<string, unknown> = {}): void {this.db.prepare('INSERT INTO ws_audit(workspace_id,actor_user_id,action,target_id,created_at,details) VALUES(?,?,?,?,?,?)').run(workspaceId, subject(actor), action, targetId, this.now(), JSON.stringify(details));}
  private workspace(row: Row): Workspace {return {id: String(row.id), name: String(row.name), createdBy: String(row.created_by), createdAt: String(row.created_at), deletedAt: nullable(row.deleted_at)};}
  private member(row: Row): WorkspaceMember {return {workspaceId: String(row.workspace_id), userId: String(row.user_id), role: String(row.role) as WorkspaceRole, joinedAt: String(row.joined_at), removedAt: nullable(row.removed_at)};}
  private invitation(row: Row): WorkspaceInvitation {return {id: String(row.id), workspaceId: String(row.workspace_id), email: String(row.email), role: String(row.role) as WorkspaceInvitation['role'], state: String(row.state) as WorkspaceInvitation['state'], expiresAt: String(row.expires_at), createdBy: String(row.created_by), acceptedBy: nullable(row.accepted_by), createdAt: String(row.created_at)};}
  private project(row: Row): WorkspaceProject {return {id: String(row.id), workspaceId: String(row.workspace_id), name: String(row.name), createdBy: String(row.created_by), createdAt: String(row.created_at), deletedAt: nullable(row.deleted_at)};}
  private requireMember(actor: WorkspaceActor, workspaceId: string, permission: WorkspacePermission, includeDeleted = false): WorkspaceMember {
    const row = this.db.prepare('SELECT m.*,w.deleted_at AS workspace_deleted FROM ws_members m JOIN ws_workspaces w ON w.id=m.workspace_id WHERE m.workspace_id=? AND m.user_id=? AND m.removed_at IS NULL').get(workspaceId, subject(actor));
    if (!row || (!includeDeleted && row.workspace_deleted !== null)) throw new Error('FORBIDDEN');
    const member = this.member(row);
    if (!Object.hasOwn(permissions, permission) || !permissions[permission].includes(member.role)) throw new Error('FORBIDDEN');
    return member;
  }
  authorize(actor: WorkspaceActor, workspaceId: string, permission: WorkspacePermission): WorkspaceMember {return this.requireMember(actor, workspaceId, permission);}
  createWorkspace(actor: WorkspaceActor, name: string): Workspace {return this.transaction(() => {
    const id = randomUUID(), timestamp = this.now(), userId = subject(actor);
    this.db.prepare('INSERT INTO ws_workspaces(id,name,created_by,created_at) VALUES(?,?,?,?)').run(id, text(name), userId, timestamp);
    this.db.prepare("INSERT INTO ws_members(workspace_id,user_id,role,joined_at) VALUES(?,?,'OWNER',?)").run(id, userId, timestamp);
    this.log(actor, id, 'workspace-created', id); return this.getWorkspace(actor, id);
  });}
  listWorkspaces(actor: WorkspaceActor): Workspace[] {return this.db.prepare('SELECT w.* FROM ws_workspaces w JOIN ws_members m ON m.workspace_id=w.id WHERE m.user_id=? AND m.removed_at IS NULL AND w.deleted_at IS NULL ORDER BY w.created_at,w.id').all(subject(actor)).map(row => this.workspace(row));}
  getWorkspace(actor: WorkspaceActor, workspaceId: string): Workspace {this.requireMember(actor, workspaceId, 'read'); return this.workspace(this.db.prepare('SELECT * FROM ws_workspaces WHERE id=?').get(workspaceId)!);}
  listMembers(actor: WorkspaceActor, workspaceId: string): WorkspaceMember[] {this.requireMember(actor, workspaceId, 'read'); return this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND removed_at IS NULL ORDER BY user_id').all(workspaceId).map(row => this.member(row));}
  private mutableMember(actor: WorkspaceActor, workspaceId: string, userId: string, nextRole?: WorkspaceRole): Row {
    const acting = this.requireMember(actor, workspaceId, 'manage-members');
    const row = this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=? AND removed_at IS NULL').get(workspaceId, subject({userId}));
    if (!row) throw new Error('MEMBER_NOT_FOUND');
    if ((row.role === 'OWNER' || nextRole === 'OWNER') && acting.role !== 'OWNER') throw new Error('FORBIDDEN');
    if (row.role === 'OWNER' && nextRole !== 'OWNER' && Number(this.db.prepare("SELECT COUNT(*) AS count FROM ws_members WHERE workspace_id=? AND role='OWNER' AND removed_at IS NULL").get(workspaceId)!.count) <= 1) throw new Error('LAST_OWNER');
    return row;
  }
  setMemberRole(actor: WorkspaceActor, workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember {return this.transaction(() => {if (!roles.includes(role)) throw new Error('INVALID_ROLE'); const previous = this.mutableMember(actor, workspaceId, userId, role); this.db.prepare('UPDATE ws_members SET role=? WHERE workspace_id=? AND user_id=?').run(role, workspaceId, userId); this.log(actor, workspaceId, 'member-role-changed', userId, {from: previous.role, to: role}); return this.member(this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=?').get(workspaceId, userId)!);});}
  removeMember(actor: WorkspaceActor, workspaceId: string, userId: string): void {this.transaction(() => {this.mutableMember(actor, workspaceId, userId); this.db.prepare('UPDATE ws_members SET removed_at=? WHERE workspace_id=? AND user_id=?').run(this.now(), workspaceId, userId); this.log(actor, workspaceId, 'member-removed', userId);});}
  inviteMember(actor: WorkspaceActor, workspaceId: string, input: {email: string; role: Exclude<WorkspaceRole, 'OWNER'>; expiresAt: string}): {invitation: WorkspaceInvitation; token: string} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-members');
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(input.role)) throw new Error('INVALID_ROLE');
    const email = normalizedEmail(input.email), expiresAt = this.futureDate(input.expiresAt), existing = this.db.prepare("SELECT * FROM ws_invitations WHERE workspace_id=? AND email=? AND state='pending'").get(workspaceId, email);
    if (existing && String(existing.expires_at) > this.now()) throw new Error('INVITATION_EXISTS');
    if (existing) {this.db.prepare("UPDATE ws_invitations SET state='revoked' WHERE id=?").run(String(existing.id)); this.log(actor, workspaceId, 'expired-invitation-replaced', String(existing.id));}
    const accepted = this.db.prepare("SELECT 1 FROM ws_invitations i JOIN ws_members m ON m.workspace_id=i.workspace_id AND m.user_id=i.accepted_by WHERE i.workspace_id=? AND i.email=? AND i.state='accepted' AND m.removed_at IS NULL").get(workspaceId, email);
    if (accepted) throw new Error('ALREADY_MEMBER');
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    this.db.prepare("INSERT INTO ws_invitations(id,workspace_id,email,role,token_hash,state,expires_at,created_by,created_at) VALUES(?,?,?,?,?,'pending',?,?,?)").run(id, workspaceId, email, input.role, hashToken(token), expiresAt, subject(actor), this.now());
    this.log(actor, workspaceId, 'member-invited', id, {role: input.role});
    return {invitation: this.invitation(this.db.prepare('SELECT * FROM ws_invitations WHERE id=?').get(id)!), token};
  });}
  private futureDate(value: string): string {const date = new Date(value); if (!Number.isFinite(date.valueOf()) || date.valueOf() <= this.clock().valueOf()) throw new Error('INVALID_EXPIRY'); return date.toISOString();}
  acceptInvitation(actor: WorkspaceActor, workspaceId: string, token: string, verifiedEmail: string): WorkspaceMember {return this.transaction(() => {
    const userId = subject(actor), email = normalizedEmail(verifiedEmail);
    if (typeof token !== 'string' || token.length > 512 || token.length < 32) throw new Error('INVALID_INVITATION');
    const row = this.db.prepare('SELECT i.* FROM ws_invitations i JOIN ws_workspaces w ON w.id=i.workspace_id WHERE i.workspace_id=? AND i.token_hash=? AND w.deleted_at IS NULL').get(workspaceId, hashToken(token));
    if (!row || row.email !== email || row.state === 'revoked') throw new Error('INVALID_INVITATION');
    if (row.state === 'accepted') {if (row.accepted_by !== userId) throw new Error('INVALID_INVITATION'); return this.requireMember(actor, workspaceId, 'read');}
    if (String(row.expires_at) <= this.now()) throw new Error('INVITATION_EXPIRED');
    // A removed/demoted inviter cannot leave a still-usable privilege grant behind.
    this.requireMember({userId: String(row.created_by)}, workspaceId, 'manage-members');
    const existing = this.db.prepare('SELECT * FROM ws_members WHERE workspace_id=? AND user_id=?').get(workspaceId, userId);
    if (existing && existing.removed_at === null) throw new Error('ALREADY_MEMBER');
    this.db.prepare('INSERT INTO ws_members(workspace_id,user_id,role,joined_at,removed_at) VALUES(?,?,?,?,NULL) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,joined_at=excluded.joined_at,removed_at=NULL').run(workspaceId, userId, String(row.role), this.now());
    this.db.prepare("UPDATE ws_invitations SET state='accepted',accepted_by=? WHERE id=?").run(userId, String(row.id));
    this.log(actor, workspaceId, 'invitation-accepted', String(row.id)); return this.requireMember(actor, workspaceId, 'read');
  });}
  listInvitations(actor: WorkspaceActor, workspaceId: string): WorkspaceInvitation[] {this.requireMember(actor, workspaceId, 'manage-members'); return this.db.prepare('SELECT * FROM ws_invitations WHERE workspace_id=? ORDER BY created_at,id').all(workspaceId).map(row => this.invitation(row));}
  revokeInvitation(actor: WorkspaceActor, workspaceId: string, invitationId: string): void {this.transaction(() => {this.requireMember(actor, workspaceId, 'manage-members'); const row = this.db.prepare('SELECT * FROM ws_invitations WHERE workspace_id=? AND id=?').get(workspaceId, invitationId); if (!row || row.state !== 'pending') throw new Error('INVALID_INVITATION'); this.db.prepare("UPDATE ws_invitations SET state='revoked' WHERE id=?").run(invitationId); this.log(actor, workspaceId, 'invitation-revoked', invitationId);});}
  createProject(actor: WorkspaceActor, workspaceId: string, name: string): WorkspaceProject {return this.transaction(() => {this.requireMember(actor, workspaceId, 'manage-projects'); const id = randomUUID(); this.db.prepare('INSERT INTO ws_projects(id,workspace_id,name,created_by,created_at) VALUES(?,?,?,?,?)').run(id, workspaceId, text(name), subject(actor), this.now()); this.log(actor, workspaceId, 'project-created', id); return this.getProject(actor, workspaceId, id);});}
  getProject(actor: WorkspaceActor, workspaceId: string, projectId: string, includeDeleted = false): WorkspaceProject {this.requireMember(actor, workspaceId, includeDeleted ? 'delete' : 'read'); const row = this.db.prepare('SELECT * FROM ws_projects WHERE workspace_id=? AND id=?').get(workspaceId, projectId); if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error('PROJECT_NOT_FOUND'); return this.project(row);}
  listProjects(actor: WorkspaceActor, workspaceId: string): WorkspaceProject[] {this.requireMember(actor, workspaceId, 'read'); return this.db.prepare('SELECT * FROM ws_projects WHERE workspace_id=? AND deleted_at IS NULL ORDER BY created_at,id').all(workspaceId).map(row => this.project(row));}
  registerAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): Asset {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'edit'); this.getProject(actor, workspaceId, projectId);
    const asset = this.resolveAsset(workspaceId, assetId);
    const row = this.db.prepare('SELECT * FROM ws_assets WHERE workspace_id=? AND asset_id=?').get(workspaceId, assetId);
    if (row) {if (row.project_id !== projectId || row.deleted_at !== null) throw new Error('ASSET_ALREADY_REGISTERED'); return this.getAsset(actor, workspaceId, projectId, assetId);}
    this.db.prepare('INSERT INTO ws_assets(workspace_id,project_id,asset_id,original_key,sha256,registered_by,created_at) VALUES(?,?,?,?,?,?,?)').run(workspaceId, projectId, assetId, asset.originalKey, asset.sha256, subject(actor), this.now());
    // Culling pages include the live Asset set. Invalidate an earlier page/CAS
    // snapshot in the same transaction as the registration, including old DBs
    // whose culling head is absent (implicit version 0).
    this.bumpCulling(actor, workspaceId, projectId, this.cullingVersion(workspaceId, projectId), 'culling-asset-registered', assetId);
    this.log(actor, workspaceId, 'asset-registered', assetId, {projectId}); return asset;
  });}
  private resolveAsset(workspaceId: string, assetId: string, includeDeleted = false): Asset {const asset = this.assetLookup(workspaceId, assetId, includeDeleted); if (asset.tenantId !== workspaceId || asset.id !== assetId || (!includeDeleted && asset.deletedAt !== null)) throw new Error('ASSET_NOT_FOUND'); return asset;}
  getAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, includeDeleted = false): Asset {
    this.requireMember(actor, workspaceId, includeDeleted ? 'delete' : 'read'); this.getProject(actor, workspaceId, projectId);
    const row = this.db.prepare('SELECT * FROM ws_assets WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId);
    if (!row || (!includeDeleted && row.deleted_at !== null)) throw new Error('ASSET_NOT_FOUND');
    const asset = this.resolveAsset(workspaceId, assetId, includeDeleted);
    if (asset.originalKey !== row.original_key || asset.sha256 !== row.sha256) throw new Error('ORIGINAL_IDENTITY_CHANGED');
    return {...asset, deletedAt: nullable(row.deleted_at) ?? asset.deletedAt};
  }
  listAssets(actor: WorkspaceActor, workspaceId: string, projectId: string): Asset[] {this.getProject(actor, workspaceId, projectId); return this.db.prepare('SELECT asset_id FROM ws_assets WHERE workspace_id=? AND project_id=? AND deleted_at IS NULL ORDER BY created_at,asset_id').all(workspaceId, projectId).map(row => this.getAsset(actor, workspaceId, projectId, String(row.asset_id)));}
  /** Internal reconciliation accessor only: deleted references remain visible to authorized recovery operations. */
  registeredAssetStates(actor: WorkspaceActor, workspaceId: string, projectId: string): {assetId: string; trashed: boolean}[] {
    this.requireMember(actor, workspaceId, 'delete');
    this.getProject(actor, workspaceId, projectId, true);
    return this.db.prepare('SELECT a.asset_id,a.deleted_at AS asset_deleted,p.deleted_at AS project_deleted FROM ws_assets a JOIN ws_projects p ON p.workspace_id=a.workspace_id AND p.id=a.project_id WHERE a.workspace_id=? AND a.project_id=? ORDER BY a.created_at,a.asset_id').all(workspaceId, projectId).map(row => ({assetId: String(row.asset_id), trashed: row.asset_deleted !== null || row.project_deleted !== null}));
  }
  private recipeVersion(row: Row): TeamRecipeVersion {return {id: String(row.id), workspaceId: String(row.workspace_id), projectId: String(row.project_id), assetId: String(row.asset_id), editorUserId: String(row.editor_user_id), createdAt: String(row.created_at), updatedAt: String(row.created_at), version: Number(row.version), parentVersion: Number(row.parent_version), branch: row.branch === 1, body: JSON.parse(String(row.body)), changedFields: JSON.parse(String(row.changed_fields)), presetSnapshot: row.preset_snapshot === null ? null : JSON.parse(String(row.preset_snapshot))};}
  private portrait(body: Record<string, unknown>): unknown {
    return ((body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>).portrait;
  }
  private validateBWEdgeBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'bwEdgeManual')) return;
    const manual = extra.bwEdgeManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // Recipe validation establishes the binding shape and the 8 MP cap. Asset
    // metadata does not attest decoded dimensions; Final must check those.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_BW_EDGE_MANUAL_BINDING');
  }
  private validateClothingSpotBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'clothingSpotManual')) return;
    const manual = extra.clothingSpotManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // The typed Recipe checks syntax and the 8 MP cap, not ownership. The
    // authenticated getAsset caller provides the current registered Asset/SHA.
    // Asset metadata cannot attest decoded Original dimensions; Final must.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL_BINDING');
  }
  private validateContactsIrisBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'contactsIrisManual')) return;
    const manual = extra.contactsIrisManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // Typed JSON is not identity evidence. The actor-scoped, registered and
    // non-trashed Asset supplies the actual Original SHA inside the transaction.
    // Neither this row nor caller strings attest person, iris or decoded size.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL_BINDING');
  }
  private validateFaceDecorationsBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'faceDecorationsManual')) return;
    const manual = extra.faceDecorationsManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // This actor-scoped, non-trashed registered Asset is the SHA authority
    // inside Recipe CAS. JSON person/face position and source dimensions are
    // not authenticated or decoded-Original evidence.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_FACE_DECORATIONS_MANUAL_BINDING');
  }
  private validateHandToneBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'handToneManual')) return;
    const manual = extra.handToneManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // validateRecipe checks typed bounds only. getAsset supplies the actual
    // registered, non-trashed Asset in the actor's Workspace/Project. Neither
    // a binding string nor metadata dimensions prove a hand or decoded image.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_HAND_TONE_MANUAL_BINDING');
  }
  private validateEyelinerBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'eyelinerManual')) return;
    const manual = extra.eyelinerManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // The typed document does not prove actor identity, a detected eye or
    // decoded Original dimensions. The actor-scoped registered Asset/SHA is
    // checked within the same transaction as Recipe CAS and at history read.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_EYELINER_MANUAL_BINDING');
  }
  private validateEyeshadowBinding(body: Record<string, unknown>, asset: Asset): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'eyeshadowManual')) return;
    const manual = extra.eyeshadowManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    // The actor-scoped, non-trashed registry Asset and SHA are checked in the
    // same transaction as Recipe CAS and again on history read. Typed person,
    // eye and Original dimensions remain unverified caller claims.
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_EYESHADOW_MANUAL_BINDING');
  }
  private validateAddShadowBinding(body: Record<string, unknown>, asset: Asset, workspaceId: string): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'addShadowManual')) return;
    // validateRecipe already checked the exact document shape and bounded size.
    // IDs inside that JSON are claims, not evidence of a registered Asset.
    const manual = extra.addShadowManual as Record<string, unknown>;
    const binding = (manual.binding as Record<string, unknown>);
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_ADD_SHADOW_MANUAL_BINDING');
    const backdropId = String(binding.backdropID);
    const registered = this.db.prepare(`SELECT a.project_id,a.original_key,a.sha256,
      a.deleted_at,p.deleted_at AS project_deleted FROM ws_assets a
      JOIN ws_projects p ON p.workspace_id=a.workspace_id AND p.id=a.project_id
      WHERE a.workspace_id=? AND a.asset_id=?`).get(workspaceId, backdropId);
    if (!registered || registered.deleted_at !== null || registered.project_deleted !== null)
      throw new Error('ADD_SHADOW_BACKGROUND_NOT_FOUND');
    const backdrop = this.resolveAsset(workspaceId, backdropId);
    if (backdrop.originalKey !== registered.original_key ||
        backdrop.sha256.toLowerCase() !== String(registered.sha256).toLowerCase() ||
        String(binding.backdropSHA256).toLowerCase() !== backdrop.sha256.toLowerCase())
      throw new Error('ADD_SHADOW_BACKGROUND_IDENTITY_CHANGED');
  }
  private validateOriginalShadowBinding(body: Record<string, unknown>, asset: Asset, workspaceId: string): void {
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (!Object.hasOwn(extra, 'originalShadowManual')) return;
    const manual = extra.originalShadowManual as Record<string, unknown>;
    const binding = manual.binding as Record<string, unknown>;
    if (String(binding.assetID).toLowerCase() !== asset.id.toLowerCase() ||
        String(binding.originalSHA256).toLowerCase() !== asset.sha256.toLowerCase())
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_BINDING');
    const backdropId = String(binding.backdropID);
    const registered = this.db.prepare(`SELECT a.project_id,a.original_key,a.sha256,
      a.deleted_at,p.deleted_at AS project_deleted FROM ws_assets a
      JOIN ws_projects p ON p.workspace_id=a.workspace_id AND p.id=a.project_id
      WHERE a.workspace_id=? AND a.asset_id=?`).get(workspaceId, backdropId);
    if (!registered || registered.deleted_at !== null || registered.project_deleted !== null)
      throw new Error('ORIGINAL_SHADOW_BACKGROUND_NOT_FOUND');
    const backdrop = this.resolveAsset(workspaceId, backdropId);
    if (backdrop.originalKey !== registered.original_key ||
        backdrop.sha256.toLowerCase() !== String(registered.sha256).toLowerCase() ||
        String(binding.backdropSHA256).toLowerCase() !== backdrop.sha256.toLowerCase())
      throw new Error('ORIGINAL_SHADOW_BACKGROUND_CONFLICT');
  }
  private validatedRecipeHistory(asset: Asset, workspaceId: string, projectId: string): TeamRecipeVersion[] {
    let reference: unknown;
    return this.db.prepare('SELECT * FROM ws_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=? ORDER BY version').all(workspaceId, projectId, asset.id).map(row => {
      const version = this.recipeVersion(row);
      validateRecipe(version.body);
      this.validateBWEdgeBinding(version.body, asset);
      this.validateClothingSpotBinding(version.body, asset);
      this.validateContactsIrisBinding(version.body, asset);
      this.validateFaceDecorationsBinding(version.body, asset);
      this.validateHandToneBinding(version.body, asset);
      this.validateEyelinerBinding(version.body, asset);
      this.validateEyeshadowBinding(version.body, asset);
      this.validateAddShadowBinding(version.body, asset, workspaceId);
      this.validateOriginalShadowBinding(version.body, asset, workspaceId);
      const portrait = this.portrait(version.body);
      if (portrait !== undefined) {
        validatePortraitBinding(portrait, asset.id, asset.sha256);
        if (reference === undefined) reference = portrait;
        else validatePortraitContinuity(reference, portrait);
      }
      return version;
    });
  }
  getRecipeVersion(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, version: number): TeamRecipeVersion {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId); revision(version);
    const found = this.validatedRecipeHistory(asset, workspaceId, projectId).find(item => item.version === version);
    if (!found) throw new Error('VERSION_NOT_FOUND'); return found;
  }
  latestRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamRecipeVersion | null {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId);
    const row = this.db.prepare('SELECT v.* FROM ws_recipe_heads h JOIN ws_recipe_versions v ON v.workspace_id=h.workspace_id AND v.project_id=h.project_id AND v.asset_id=h.asset_id AND v.version=h.version WHERE h.workspace_id=? AND h.project_id=? AND h.asset_id=?').get(workspaceId, projectId, assetId);
    const history = this.validatedRecipeHistory(asset, workspaceId, projectId);
    return row ? history.find(item => item.version === Number(row.version)) ?? null : null;
  }
  recipeHistory(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamRecipeVersion[] {
    const asset = this.getAsset(actor, workspaceId, projectId, assetId);
    return this.validatedRecipeHistory(asset, workspaceId, projectId);
  }
  saveRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; body: unknown; presetId?: string}): TeamRecipeSaveResult {return this.transaction(() => this.commitRecipe(actor, workspaceId, projectId, assetId, input));}
  private commitRecipe(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; body: unknown; presetId?: string; presetMode?: 'GLOW_ONLY' | 'GRAIN_ONLY' | 'CALIBRATION_ONLY' | 'VIGNETTE_ONLY' | 'LEVELS_ONLY' | 'SELECTIVE_ONLY'}): TeamRecipeSaveResult {
    this.requireMember(actor, workspaceId, 'edit'); const asset = this.getAsset(actor, workspaceId, projectId, assetId); revision(input.baseVersion);
    const encoded = recipeJSON(input.body), body = JSON.parse(encoded) as Record<string, unknown>;
    this.validateBWEdgeBinding(body, asset);
    this.validateClothingSpotBinding(body, asset);
    this.validateContactsIrisBinding(body, asset);
    this.validateFaceDecorationsBinding(body, asset);
    this.validateHandToneBinding(body, asset);
    this.validateEyelinerBinding(body, asset);
    this.validateEyeshadowBinding(body, asset);
    this.validateAddShadowBinding(body, asset, workspaceId);
    this.validateOriginalShadowBinding(body, asset, workspaceId);
    const extra = (body.parameters as Record<string, unknown>).extendedParameters as Record<string, unknown>;
    if (Object.hasOwn(extra, 'originalShadowManual') && input.baseVersion === 0)
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_SAVED_BASE');
    // Only private atomic, field-only merge paths may retain an already-bound
    // target Shadow document while recording a Preset snapshot. Full replace
    // still forbids copying a photo-bound Shadow from a Preset.
    if (input.presetId !== undefined && !['GLOW_ONLY', 'GRAIN_ONLY', 'CALIBRATION_ONLY', 'VIGNETTE_ONLY', 'LEVELS_ONLY', 'SELECTIVE_ONLY'].includes(input.presetMode ?? '')) {
      if (Object.hasOwn(extra, 'addShadowManual')) throw new Error('PHOTO_BOUND_ADD_SHADOW_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'originalShadowManual')) throw new Error('PHOTO_BOUND_ORIGINAL_SHADOW_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'teethManual')) throw new Error('PHOTO_BOUND_TEETH_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'makeupHighlightManual')) throw new Error('PHOTO_BOUND_MAKEUP_HIGHLIGHT_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'blushManual')) throw new Error('PHOTO_BOUND_BLUSH_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'contactsIrisManual')) throw new Error('PHOTO_BOUND_CONTACTS_IRIS_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'faceDecorationsManual')) throw new Error('PHOTO_BOUND_FACE_DECORATIONS_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'clothingSpotManual')) throw new Error('PHOTO_BOUND_CLOTHING_SPOT_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'handToneManual')) throw new Error('PHOTO_BOUND_HAND_TONE_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'eyelinerManual')) throw new Error('PHOTO_BOUND_EYELINER_PRESET_FORBIDDEN');
      if (Object.hasOwn(extra, 'eyeshadowManual')) throw new Error('PHOTO_BOUND_EYESHADOW_PRESET_FORBIDDEN');
    }
    const incoming = this.portrait(body);
    if (incoming !== undefined) {
      validatePortraitBinding(incoming, asset.id, asset.sha256);
      const reference = this.validatedRecipeHistory(asset, workspaceId, projectId).map(v => this.portrait(v.body)).find(p => p !== undefined);
      if (reference !== undefined) validatePortraitContinuity(reference, incoming);
    }
    const current = this.latestRecipe(actor, workspaceId, projectId, assetId);
    const base = input.baseVersion === 0 ? null : this.getRecipeVersion(actor, workspaceId, projectId, assetId, input.baseVersion);
    const currentVersion = current?.version ?? 0, conflict = currentVersion !== input.baseVersion;
    if (Object.hasOwn(extra, 'originalShadowManual') && conflict)
      throw new Error('ORIGINAL_SHADOW_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'clothingSpotManual') && conflict)
      throw new Error('CLOTHING_SPOT_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'contactsIrisManual') && conflict)
      throw new Error('CONTACTS_IRIS_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'faceDecorationsManual') && conflict)
      throw new Error('FACE_DECORATIONS_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'handToneManual') && conflict)
      throw new Error('HAND_TONE_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'eyelinerManual') && conflict)
      throw new Error('EYELINER_MANUAL_REVISION_CONFLICT');
    if (Object.hasOwn(extra, 'eyeshadowManual') && conflict)
      throw new Error('EYESHADOW_MANUAL_REVISION_CONFLICT');
    const version = Number(this.db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM ws_recipe_versions WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId)!.version) + 1;
    revision(version);
    const preset = input.presetId === undefined ? null : this.getPreset(actor, workspaceId, input.presetId);
    const presetSnapshot = preset ? {id: preset.id, version: preset.version, body: preset.body} : null;
    const changedFields = recipeDifferences(base?.body ?? {}, body), diff = recipeDifferences(current?.body ?? {}, body), id = randomUUID();
    this.db.prepare('INSERT INTO ws_recipe_versions(id,workspace_id,project_id,asset_id,version,parent_version,editor_user_id,created_at,branch,body,changed_fields,preset_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, workspaceId, projectId, assetId, version, input.baseVersion, subject(actor), this.now(), conflict ? 1 : 0, encoded, JSON.stringify(changedFields), presetSnapshot ? JSON.stringify(presetSnapshot) : null);
    if (!conflict) this.db.prepare('INSERT INTO ws_recipe_heads(workspace_id,project_id,asset_id,version) VALUES(?,?,?,?) ON CONFLICT(workspace_id,project_id,asset_id) DO UPDATE SET version=excluded.version').run(workspaceId, projectId, assetId, version);
    this.log(actor, workspaceId, conflict ? 'recipe-conflict-preserved' : 'recipe-saved', assetId, {projectId, version, baseVersion: input.baseVersion, previousHead: currentVersion, changedFields});
    return {outcome: conflict ? 'conflict' : 'saved', version: this.getRecipeVersion(actor, workspaceId, projectId, assetId, version), currentVersion: conflict ? currentVersion : version, diff};
  }
  applyPreset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, baseVersion: number, presetId: string, expectedPresetVersion?: number, expectedOriginalSHA256?: string): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      if (expectedOriginalSHA256 !== undefined) {
        if (typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedOriginalSHA256))
          throw new Error('INVALID_ORIGINAL_SHA256');
        revision(baseVersion);
        const asset = this.getAsset(actor, workspaceId, projectId, assetId);
        if (asset.sha256.toLowerCase() !== expectedOriginalSHA256.toLowerCase())
          throw new Error('ORIGINAL_IDENTITY_CONFLICT');
        // The legacy SHA-less path still preserves historical conflict branches.
        // Pinned callers must fail before commitRecipe can insert any branch.
        const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
        if ((target?.version ?? 0) !== baseVersion || target?.branch)
          throw new Error('RECIPE_VERSION_CONFLICT');
      }
      const preset = this.getPreset(actor, workspaceId, presetId);
      // Legacy direct callers intentionally use the latest version, but HTTP
      // callers must pin the version the person actually selected. Both the
      // check and Recipe CAS commit run under this same BEGIN IMMEDIATE lock.
      if (expectedPresetVersion !== undefined) {
        revision(expectedPresetVersion);
        if (expectedPresetVersion < 1) throw new Error('INVALID_PRESET_VERSION');
        if (preset.version !== expectedPresetVersion) throw new Error('PRESET_VERSION_CONFLICT');
      }
      // Legacy or externally corrupted rows must not carry a bound mask into
      // another Asset, even though current create/update paths reject it.
      presetRecipeJSON(preset.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId, {baseVersion, body: preset.body, presetId});
    });
  }
  /** Version-pinned Glow merge. Every authority and CAS check precedes any insert. */
  applyGlowPresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_GLOW_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = glowOnlyPreset(preset.body);
      const body = mergeGlowOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId, presetMode: 'GLOW_ONLY'});
    });
  }
  /** Version-pinned Grain-only merge; photo-bound target edits are retained. */
  applyGrainPresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_GRAIN_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = grainOnlyPreset(preset.body);
      const body = mergeGrainOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId, presetMode: 'GRAIN_ONLY'});
    });
  }
  /** Version-pinned six-control Calibration merge; other target edits are retained. */
  applyCalibrationPresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_CALIBRATION_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = calibrationOnlyPreset(preset.body);
      const body = mergeCalibrationOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId, presetMode: 'CALIBRATION_ONLY'});
    });
  }
  /** Version-pinned RGB Levels-only merge; target photo-bound edits are retained. */
  applyLevelsPresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_LEVELS_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = levelsOnlyPreset(preset.body);
      const body = mergeLevelsOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId, presetMode: 'LEVELS_ONLY'});
    });
  }
  /** Version-pinned Selective Color-only merge; other target edits stay bound to their photo. */
  applySelectivePresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_SELECTIVE_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = selectiveOnlyPreset(preset.body);
      const body = mergeSelectiveOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId, presetMode: 'SELECTIVE_ONLY'});
    });
  }
  /** Version-pinned post-crop Vignette merge; target edits and photo-bound values remain intact. */
  applyVignettePresetVersioned(actor: WorkspaceActor, workspaceId: string, projectId: string,
    assetId: string, input: {baseVersion: number; presetId: string;
      expectedPresetVersion: number; expectedOriginalSHA256: string}): TeamRecipeSaveResult {
    return this.transaction(() => {
      this.requireMember(actor, workspaceId, 'edit');
      revision(input.baseVersion); revision(input.expectedPresetVersion);
      if (input.baseVersion < 1 || input.expectedPresetVersion < 1 ||
          typeof input.expectedOriginalSHA256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(input.expectedOriginalSHA256))
        throw new Error('INVALID_VIGNETTE_PRESET_APPLY');
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== input.expectedOriginalSHA256.toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const target = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!target || target.version !== input.baseVersion || target.branch)
        throw new Error('RECIPE_VERSION_CONFLICT');
      const preset = this.getPreset(actor, workspaceId, input.presetId);
      if (preset.version !== input.expectedPresetVersion)
        throw new Error('PRESET_VERSION_CONFLICT');
      const source = vignetteOnlyPreset(preset.body);
      const body = mergeVignetteOnly(source, target.body);
      return this.commitRecipe(actor, workspaceId, projectId, assetId,
        {baseVersion: input.baseVersion, body, presetId: input.presetId,
          presetMode: 'VIGNETTE_ONLY'});
    });
  }
  private exportPreset(row: Row): WorkspaceExportPreset {return {id: String(row.id), workspaceId: String(row.workspace_id), scope: String(row.scope) as WorkspaceExportPreset['scope'], ownerUserId: String(row.owner_user_id), name: String(row.name), version: Number(row.current_version), settings: JSON.parse(String(row.settings)) as WorkspaceExportPresetSettings, createdAt: String(row.created_at), updatedAt: String(row.version_created_at)};}
  /** Separate Export settings snapshots. A saved row is not evidence of Final application. */
  getExportPreset(actor: WorkspaceActor, workspaceId: string, presetId: string): WorkspaceExportPreset {
    this.requireMember(actor, workspaceId, 'export');
    const row = this.db.prepare('SELECT p.*,v.name,v.settings,v.created_at AS version_created_at FROM ws_export_presets p JOIN ws_export_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND p.id=?').get(workspaceId, presetId);
    if (!row || (row.scope === 'PERSONAL' && row.owner_user_id !== subject(actor))) throw Error('EXPORT_PRESET_NOT_FOUND');
    return this.exportPreset(row);
  }
  listExportPresets(actor: WorkspaceActor, workspaceId: string): WorkspaceExportPreset[] {
    this.requireMember(actor, workspaceId, 'export');
    return this.db.prepare("SELECT p.*,v.name,v.settings,v.created_at AS version_created_at FROM ws_export_presets p JOIN ws_export_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND (p.scope='WORKSPACE' OR p.owner_user_id=?) ORDER BY p.created_at,p.id").all(workspaceId, subject(actor)).map(row => this.exportPreset(row));
  }
  createExportPreset(actor: WorkspaceActor, workspaceId: string, input: {scope: WorkspaceExportPreset['scope']; name: string; settings: WorkspaceExportPresetSettings}): WorkspaceExportPreset {return this.transaction(() => {
    if (!exportRecord(input, ['scope', 'name', 'settings']) || !['PERSONAL', 'WORKSPACE'].includes(input.scope)) throw Error('INVALID_EXPORT_PRESET_INPUT');
    this.requireMember(actor, workspaceId, input.scope === 'PERSONAL' ? 'edit' : 'manage-presets');
    const name = exportPresetName(input.name), settings = exportPresetSettingsJSON(input.settings);
    const id = randomUUID(), timestamp = this.now();
    this.db.prepare('INSERT INTO ws_export_presets(id,workspace_id,scope,owner_user_id,created_at,current_version) VALUES(?,?,?,?,?,1)').run(id, workspaceId, input.scope, subject(actor), timestamp);
    this.db.prepare('INSERT INTO ws_export_preset_versions(preset_id,version,name,settings,editor_user_id,created_at) VALUES(?,1,?,?,?,?)').run(id, name, settings, subject(actor), timestamp);
    this.log(actor, workspaceId, 'export-preset-created', id, {scope: input.scope, version: 1});
    return this.getExportPreset(actor, workspaceId, id);
  });}
  updateExportPreset(actor: WorkspaceActor, workspaceId: string, presetId: string, input: {baseVersion: number; name: string; settings: WorkspaceExportPresetSettings}): WorkspaceExportPreset {return this.transaction(() => {
    if (!exportRecord(input, ['baseVersion', 'name', 'settings']) || !Number.isSafeInteger(input.baseVersion) || input.baseVersion < 1 || input.baseVersion >= Number.MAX_SAFE_INTEGER) throw Error('INVALID_EXPORT_PRESET_INPUT');
    const prior = this.getExportPreset(actor, workspaceId, presetId);
    this.requireMember(actor, workspaceId, prior.scope === 'PERSONAL' && prior.ownerUserId === subject(actor) ? 'edit' : 'manage-presets');
    if (prior.version !== input.baseVersion) throw Error('EXPORT_PRESET_VERSION_CONFLICT');
    const name = exportPresetName(input.name), settings = exportPresetSettingsJSON(input.settings);
    const next = prior.version + 1;
    const updated = this.db.prepare('UPDATE ws_export_presets SET current_version=? WHERE id=? AND workspace_id=? AND current_version=?').run(next, presetId, workspaceId, prior.version);
    if (updated.changes !== 1) throw Error('EXPORT_PRESET_VERSION_CONFLICT');
    this.db.prepare('INSERT INTO ws_export_preset_versions(preset_id,version,name,settings,editor_user_id,created_at) VALUES(?,?,?,?,?,?)').run(presetId, next, name, settings, subject(actor), this.now());
    this.log(actor, workspaceId, 'export-preset-updated', presetId, {baseVersion: prior.version, version: next});
    return this.getExportPreset(actor, workspaceId, presetId);
  });}
  private preset(row: Row): TeamPreset {return {id: String(row.id), workspaceId: String(row.workspace_id), scope: String(row.scope) as PresetScope, ownerUserId: String(row.owner_user_id), name: String(row.name), version: Number(row.current_version), body: JSON.parse(String(row.body)), createdAt: String(row.created_at), updatedAt: String(row.version_created_at), deletedAt: nullable(row.deleted_at)};}
  getPreset(actor: WorkspaceActor, workspaceId: string, presetId: string): TeamPreset {
    this.requireMember(actor, workspaceId, 'read');
    const row = this.db.prepare('SELECT p.*,v.name,v.body,v.created_at AS version_created_at FROM ws_presets p JOIN ws_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND p.id=? AND p.deleted_at IS NULL').get(workspaceId, presetId);
    if (!row || (row.scope === 'PERSONAL' && row.owner_user_id !== subject(actor))) throw new Error('PRESET_NOT_FOUND'); return this.preset(row);
  }
  listPresets(actor: WorkspaceActor, workspaceId: string): TeamPreset[] {
    this.requireMember(actor, workspaceId, 'read');
    return this.db.prepare("SELECT p.*,v.name,v.body,v.created_at AS version_created_at FROM ws_presets p JOIN ws_preset_versions v ON v.preset_id=p.id AND v.version=p.current_version WHERE p.workspace_id=? AND p.deleted_at IS NULL AND (p.scope<>'PERSONAL' OR p.owner_user_id=?) ORDER BY p.created_at,p.id").all(workspaceId, subject(actor)).map(row => this.preset(row));
  }
  createPreset(actor: WorkspaceActor, workspaceId: string, input: {name: string; body: unknown; scope?: PresetScope}): TeamPreset {return this.transaction(() => {
    const scope = input.scope ?? 'WORKSPACE';
    if (!['PERSONAL', 'WORKSPACE', 'COMMUNITY'].includes(scope)) throw new Error('INVALID_PRESET_SCOPE');
    // COMMUNITY is a reserved scope, not an implemented public publishing service.
    if (scope === 'COMMUNITY') throw new Error('COMMUNITY_NOT_IMPLEMENTED');
    this.requireMember(actor, workspaceId, scope === 'PERSONAL' ? 'edit' : 'manage-presets');
    const body = presetRecipeJSON(input.body), id = randomUUID(), timestamp = this.now();
    this.db.prepare('INSERT INTO ws_presets(id,workspace_id,scope,owner_user_id,created_at,current_version) VALUES(?,?,?,?,?,1)').run(id, workspaceId, scope, subject(actor), timestamp);
    this.db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,1,?,?,?,?)').run(id, text(input.name), body, subject(actor), timestamp);
    this.log(actor, workspaceId, 'preset-created', id, {scope}); return this.getPreset(actor, workspaceId, id);
  });}
  private requirePresetEditor(actor: WorkspaceActor, workspaceId: string, preset: TeamPreset): void {
    this.requireMember(actor, workspaceId, preset.scope === 'PERSONAL' && preset.ownerUserId === subject(actor) ? 'edit' : 'manage-presets');
  }
  updatePreset(actor: WorkspaceActor, workspaceId: string, presetId: string, input: {baseVersion: number; name: string; body: unknown}): TeamPreset {return this.transaction(() => {
    const existing = this.getPreset(actor, workspaceId, presetId); this.requirePresetEditor(actor, workspaceId, existing); revision(input.baseVersion);
    if (existing.version !== input.baseVersion) throw new Error('PRESET_VERSION_CONFLICT');
    const body = presetRecipeJSON(input.body), version = existing.version + 1; revision(version);
    this.db.prepare('INSERT INTO ws_preset_versions(preset_id,version,name,body,editor_user_id,created_at) VALUES(?,?,?,?,?,?)').run(presetId, version, text(input.name), body, subject(actor), this.now());
    this.db.prepare('UPDATE ws_presets SET current_version=? WHERE id=? AND workspace_id=?').run(version, presetId, workspaceId);
    this.log(actor, workspaceId, 'preset-updated', presetId, {baseVersion: input.baseVersion, version}); return this.getPreset(actor, workspaceId, presetId);
  });}
  deletePreset(actor: WorkspaceActor, workspaceId: string, presetId: string): void {this.transaction(() => {
    const preset = this.getPreset(actor, workspaceId, presetId); this.requirePresetEditor(actor, workspaceId, preset);
    this.db.prepare('UPDATE ws_presets SET deleted_at=? WHERE id=? AND workspace_id=?').run(this.now(), presetId, workspaceId);
    this.log(actor, workspaceId, 'preset-deleted', presetId, {version: preset.version});
  });}
  private selection(row: Row): TeamSelection {return {workspaceId: String(row.workspace_id), projectId: String(row.project_id), assetId: String(row.asset_id), version: Number(row.version), selected: row.selected === 1, editorUserId: String(row.editor_user_id), updatedAt: String(row.updated_at)};}
  getSelection(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): TeamSelection | null {
    this.getAsset(actor, workspaceId, projectId, assetId);
    const row = this.db.prepare('SELECT * FROM ws_selections WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId); return row ? this.selection(row) : null;
  }
  saveSelection(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: {baseVersion: number; selected: boolean}): TeamSelection {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'select'); this.getAsset(actor, workspaceId, projectId, assetId); revision(input.baseVersion);
    if (typeof input.selected !== 'boolean') throw new Error('INVALID_SELECTION');
    const existing = this.getSelection(actor, workspaceId, projectId, assetId); if ((existing?.version ?? 0) !== input.baseVersion) throw new Error('SELECTION_VERSION_CONFLICT');
    const version = input.baseVersion + 1; revision(version);
    this.db.prepare('INSERT INTO ws_selections(workspace_id,project_id,asset_id,version,selected,editor_user_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,project_id,asset_id) DO UPDATE SET version=excluded.version,selected=excluded.selected,editor_user_id=excluded.editor_user_id,updated_at=excluded.updated_at').run(workspaceId, projectId, assetId, version, input.selected ? 1 : 0, subject(actor), this.now());
    this.log(actor, workspaceId, 'selection-saved', assetId, {projectId, version, before: existing?.selected ?? false, after: input.selected}); return this.getSelection(actor, workspaceId, projectId, assetId)!;
  });}
  /** Project-wide CAS is separate from ws_selections: manual marks never copy or overwrite selection. */
  private cullingVersion(workspaceId: string, projectId: string): number {
    const row = this.db.prepare('SELECT version FROM ws_culling_heads WHERE workspace_id=? AND project_id=?').get(workspaceId, projectId);
    const version = row ? Number(row.version) : 0;
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('CULLING_STATE_CORRUPT');
    return version;
  }
  getCullingVersion(actor: WorkspaceActor, workspaceId: string, projectId: string): number {
    this.getProject(actor, workspaceId, projectId);
    return this.cullingVersion(workspaceId, projectId);
  }
  /** A point-in-time Workspace check, not authorization to publish a later Final Blob. */
  preflightCullingExport(actor: WorkspaceActor, workspaceId: string, projectId: string, input: unknown): CullingExportPreflight {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'export');
    this.getProject(actor, workspaceId, projectId);
    if (!exactCulling(input, ['expectedCullingVersion', 'orderedAssets']) || Reflect.ownKeys(input).length !== 2 ||
        !Number.isSafeInteger(input.expectedCullingVersion) || (input.expectedCullingVersion as number) < 0 ||
        (input.expectedCullingVersion as number) >= Number.MAX_SAFE_INTEGER ||
        !Array.isArray(input.orderedAssets) || input.orderedAssets.length < 1 || input.orderedAssets.length > 20)
      throw new Error('INVALID_CULLING_PREFLIGHT');
    const entries = input.orderedAssets as unknown[];
    if (Reflect.ownKeys(entries).length !== entries.length + 1 ||
        !Array.from({length: entries.length}, (_, index) => Object.hasOwn(entries, index)).every(Boolean))
      throw new Error('INVALID_CULLING_PREFLIGHT');
    const expectedVersion = input.expectedCullingVersion as number;
    if (this.cullingVersion(workspaceId, projectId) !== expectedVersion) throw new Error('CULLING_VERSION_CONFLICT');
    const seen = new Set<string>();
    const orderedAssets = entries.map(entry => {
      if (!exactCulling(entry, ['assetId', 'expectedOriginalSHA256', 'expectedRecipeVersion']) || Reflect.ownKeys(entry).length !== 3 ||
          typeof entry.assetId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(entry.assetId) ||
          typeof entry.expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.expectedOriginalSHA256) ||
          !Number.isSafeInteger(entry.expectedRecipeVersion) || (entry.expectedRecipeVersion as number) < 1 ||
          (entry.expectedRecipeVersion as number) >= Number.MAX_SAFE_INTEGER)
        throw new Error('INVALID_CULLING_PREFLIGHT');
      const assetId = (entry.assetId as string).toLowerCase();
      if (seen.has(assetId)) throw new Error('INVALID_CULLING_PREFLIGHT');
      seen.add(assetId);
      const asset = this.getAsset(actor, workspaceId, projectId, assetId);
      if (asset.sha256.toLowerCase() !== (entry.expectedOriginalSHA256 as string).toLowerCase())
        throw new Error('ORIGINAL_IDENTITY_CONFLICT');
      const recipe = this.latestRecipe(actor, workspaceId, projectId, assetId);
      if (!recipe || recipe.branch || recipe.version !== entry.expectedRecipeVersion)
        throw new Error('RECIPE_VERSION_CONFLICT');
      return {assetId, originalSHA256: asset.sha256, recipeVersion: recipe.version, recipeVersionId: recipe.id};
    });
    return {workspaceId, projectId, cullingVersion: expectedVersion, orderedAssets,
      status: 'PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL', authoritativeForFinal: false};
  });}
  private bumpCulling(actor: WorkspaceActor, workspaceId: string, projectId: string, baseVersion: number, action: string, target: string): number {
    revision(baseVersion);
    if (this.cullingVersion(workspaceId, projectId) !== baseVersion) throw new Error('CULLING_VERSION_CONFLICT');
    const version = baseVersion + 1;
    this.db.prepare('INSERT INTO ws_culling_heads(workspace_id,project_id,version) VALUES(?,?,?) ON CONFLICT(workspace_id,project_id) DO UPDATE SET version=excluded.version').run(workspaceId, projectId, version);
    this.log(actor, workspaceId, action, target, {projectId, baseVersion, version});
    return version;
  }
  private cullingSegments(workspaceId: string, projectId: string): CullingSegment[] {
    return this.db.prepare('SELECT segment_id,name FROM ws_culling_segments WHERE workspace_id=? AND project_id=? ORDER BY sort_order,segment_id').all(workspaceId, projectId).map(row => {
      try {return {id: cullingText(row.segment_id, 128), name: cullingText(row.name, 120)};}
      catch {throw new Error('CULLING_STATE_CORRUPT');}
    });
  }
  getCullingPage(actor: WorkspaceActor, workspaceId: string, projectId: string, limit = 100, after: string | null = null): CullingPage {
    this.getProject(actor, workspaceId, projectId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || (after !== null && typeof after !== 'string')) throw new Error('INVALID_CULLING_PAGE');
    const cursor = after === null ? '' : cullingText(after, 128);
    const rows = this.db.prepare('SELECT asset_id FROM ws_assets WHERE workspace_id=? AND project_id=? AND deleted_at IS NULL AND asset_id>? ORDER BY asset_id LIMIT ?').all(workspaceId, projectId, cursor, limit + 1);
    const page = rows.slice(0, limit).map(row => this.getCullingMark(actor, workspaceId, projectId, String(row.asset_id)));
    return {workspaceId, projectId, version: this.cullingVersion(workspaceId, projectId), segments: this.cullingSegments(workspaceId, projectId), marks: page,
      nextAfter: rows.length > limit ? page.at(-1)!.assetId : null};
  }
  getCullingMark(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): CullingMark {
    this.getAsset(actor, workspaceId, projectId, assetId);
    const row = this.db.prepare('SELECT * FROM ws_culling_marks WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId);
    const assigned = this.db.prepare('SELECT segment_id FROM ws_culling_assignments WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId);
    try {
      const tags: unknown = row ? JSON.parse(String(row.tags_json)) : [];
      const mark = cullingMarkInput({rating: row ? Number(row.rating) : 0, flag: row ? String(row.flag) : 'none',
        colorLabel: row ? nullable(row.color_label) : null, tags, segmentId: assigned ? String(assigned.segment_id) : null});
      return {assetId, ...mark};
    } catch {throw new Error('CULLING_STATE_CORRUPT');}
  }
  saveCullingMark(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string, input: unknown): {version: number; mark: CullingMark} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'edit'); this.getAsset(actor, workspaceId, projectId, assetId);
    if (!exactCulling(input, ['baseVersion','rating','flag','colorLabel','tags','segmentId']) || Reflect.ownKeys(input).length !== 6) throw new Error('INVALID_CULLING_INPUT');
    const {baseVersion, ...fields} = input;
    const mark = cullingMarkInput(fields);
    if (mark.segmentId !== null && !this.db.prepare('SELECT 1 FROM ws_culling_segments WHERE workspace_id=? AND project_id=? AND segment_id=?').get(workspaceId, projectId, mark.segmentId)) throw new Error('CULLING_SEGMENT_NOT_FOUND');
    const version = this.bumpCulling(actor, workspaceId, projectId, baseVersion as number, 'culling-mark-saved', assetId);
    this.db.prepare('INSERT INTO ws_culling_marks(workspace_id,project_id,asset_id,rating,flag,color_label,tags_json,editor_user_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,project_id,asset_id) DO UPDATE SET rating=excluded.rating,flag=excluded.flag,color_label=excluded.color_label,tags_json=excluded.tags_json,editor_user_id=excluded.editor_user_id,updated_at=excluded.updated_at').run(workspaceId, projectId, assetId, mark.rating, mark.flag, mark.colorLabel, JSON.stringify(mark.tags), subject(actor), this.now());
    this.db.prepare('DELETE FROM ws_culling_assignments WHERE workspace_id=? AND project_id=? AND asset_id=?').run(workspaceId, projectId, assetId);
    if (mark.segmentId !== null) this.db.prepare('INSERT INTO ws_culling_assignments(workspace_id,project_id,asset_id,segment_id) VALUES(?,?,?,?)').run(workspaceId, projectId, assetId, mark.segmentId);
    return {version, mark: this.getCullingMark(actor, workspaceId, projectId, assetId)};
  });}
  createCullingSegment(actor: WorkspaceActor, workspaceId: string, projectId: string, input: unknown): {version: number; segment: CullingSegment} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId);
    if (!exactCulling(input, ['baseVersion','id','name']) || Reflect.ownKeys(input).length !== 3) throw new Error('INVALID_CULLING_INPUT');
    const id = cullingText(input.id, 128), name = cullingText(input.name, 120);
    const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM ws_culling_segments WHERE workspace_id=? AND project_id=?').get(workspaceId, projectId)!.n);
    if (count >= 1000) throw new Error('CULLING_SEGMENT_LIMIT');
    if (this.db.prepare('SELECT 1 FROM ws_culling_segments WHERE workspace_id=? AND project_id=? AND segment_id=?').get(workspaceId, projectId, id)) throw new Error('CULLING_SEGMENT_EXISTS');
    const version = this.bumpCulling(actor, workspaceId, projectId, input.baseVersion as number, 'culling-segment-created', id);
    this.db.prepare('INSERT INTO ws_culling_segments(workspace_id,project_id,segment_id,name,sort_order) VALUES(?,?,?,?,?)').run(workspaceId, projectId, id, name, count);
    return {version, segment: {id, name}};
  });}
  renameCullingSegment(actor: WorkspaceActor, workspaceId: string, projectId: string, segmentId: string, input: unknown): {version: number; segment: CullingSegment} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId);
    if (!exactCulling(input, ['baseVersion','name']) || Reflect.ownKeys(input).length !== 2) throw new Error('INVALID_CULLING_INPUT');
    cullingText(segmentId, 128); const name = cullingText(input.name, 120);
    if (!this.db.prepare('SELECT 1 FROM ws_culling_segments WHERE workspace_id=? AND project_id=? AND segment_id=?').get(workspaceId, projectId, segmentId)) throw new Error('CULLING_SEGMENT_NOT_FOUND');
    const version = this.bumpCulling(actor, workspaceId, projectId, input.baseVersion as number, 'culling-segment-renamed', segmentId);
    this.db.prepare('UPDATE ws_culling_segments SET name=? WHERE workspace_id=? AND project_id=? AND segment_id=?').run(name, workspaceId, projectId, segmentId);
    return {version, segment: {id: segmentId, name}};
  });}
  reorderCullingSegments(actor: WorkspaceActor, workspaceId: string, projectId: string, input: unknown): {version: number; segments: CullingSegment[]} {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId);
    if (!exactCulling(input, ['baseVersion','orderedIds']) || Reflect.ownKeys(input).length !== 2 || !Array.isArray(input.orderedIds)) throw new Error('INVALID_CULLING_INPUT');
    const current = this.cullingSegments(workspaceId, projectId), ordered = input.orderedIds;
    if (ordered.length !== current.length || new Set(ordered).size !== ordered.length || ordered.some(id => !current.some(segment => segment.id === id))) throw new Error('INVALID_CULLING_INPUT');
    const version = this.bumpCulling(actor, workspaceId, projectId, input.baseVersion as number, 'culling-segments-reordered', projectId);
    ordered.forEach((id, index) => this.db.prepare('UPDATE ws_culling_segments SET sort_order=? WHERE workspace_id=? AND project_id=? AND segment_id=?').run(index, workspaceId, projectId, id));
    return {version, segments: this.cullingSegments(workspaceId, projectId)};
  });}
  trashAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): void {this.transaction(() => {
    this.requireMember(actor, workspaceId, 'delete'); this.getAsset(actor, workspaceId, projectId, assetId);
    this.db.prepare('UPDATE ws_assets SET deleted_at=? WHERE workspace_id=? AND project_id=? AND asset_id=?').run(this.now(), workspaceId, projectId, assetId);
    this.bumpCulling(actor, workspaceId, projectId, this.cullingVersion(workspaceId, projectId), 'culling-asset-trashed', assetId);
    this.log(actor, workspaceId, 'asset-deleted', assetId, {projectId, physicalDeletion: false});
  });}
  restoreAsset(actor: WorkspaceActor, workspaceId: string, projectId: string, assetId: string): Asset {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'delete'); this.getAsset(actor, workspaceId, projectId, assetId, true);
    const wasTrashed = this.db.prepare('SELECT deleted_at FROM ws_assets WHERE workspace_id=? AND project_id=? AND asset_id=?').get(workspaceId, projectId, assetId)!.deleted_at !== null;
    this.db.prepare('UPDATE ws_assets SET deleted_at=NULL WHERE workspace_id=? AND project_id=? AND asset_id=?').run(workspaceId, projectId, assetId);
    if (wasTrashed) this.bumpCulling(actor, workspaceId, projectId, this.cullingVersion(workspaceId, projectId), 'culling-asset-restored', assetId);
    this.log(actor, workspaceId, 'asset-recovered', assetId, {projectId}); return this.getAsset(actor, workspaceId, projectId, assetId);
  });}
  trashProject(actor: WorkspaceActor, workspaceId: string, projectId: string): void {this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId);
    this.db.prepare('UPDATE ws_projects SET deleted_at=? WHERE workspace_id=? AND id=?').run(this.now(), workspaceId, projectId); this.log(actor, workspaceId, 'project-deleted', projectId, {physicalDeletion: false});
  });}
  restoreProject(actor: WorkspaceActor, workspaceId: string, projectId: string): WorkspaceProject {return this.transaction(() => {
    this.requireMember(actor, workspaceId, 'manage-projects'); this.getProject(actor, workspaceId, projectId, true);
    this.db.prepare('UPDATE ws_projects SET deleted_at=NULL WHERE workspace_id=? AND id=?').run(workspaceId, projectId); this.log(actor, workspaceId, 'project-recovered', projectId); return this.getProject(actor, workspaceId, projectId);
  });}
  /** Server integration calls this AFTER a verified operation; never expose arbitrary action/details from HTTP. */
  recordEvent(actor: WorkspaceActor, workspaceId: string, action: 'login' | 'export' | 'storage-plan-changed' | 'billing-changed', targetId: string, details: Record<string, unknown> = {}): void {
    const required: Record<typeof action, WorkspacePermission> = {login: 'read', export: 'export', 'storage-plan-changed': 'owner', 'billing-changed': 'owner'};
    if (!Object.hasOwn(required, action)) throw new Error('INVALID_AUDIT_ACTION');
    this.requireMember(actor, workspaceId, required[action]); this.log(actor, workspaceId, action, text(targetId, 512), details);
  }
  listAudit(actor: WorkspaceActor, workspaceId: string): WorkspaceAuditEvent[] {
    this.requireMember(actor, workspaceId, 'audit'); return this.db.prepare('SELECT * FROM ws_audit WHERE workspace_id=? ORDER BY id').all(workspaceId).map(row => ({id: Number(row.id), workspaceId, actorUserId: String(row.actor_user_id), action: String(row.action), targetId: String(row.target_id), createdAt: String(row.created_at), details: JSON.parse(String(row.details))}));
  }
}
