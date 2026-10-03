import {validateCropSettings, validateExportSettings} from './crop-export.js';
import {validatePortraitRecipe} from './portrait-recipe.js';
export type Representation = 'original' | 'thumbnail' | 'preview' | 'proxy' | 'recipe' | 'generated' | 'export';
export type PhotoIntent = 'library' | 'select' | 'edit' | 'final-jpeg' | 'final-tiff' | 'high-precision' | 'redevelop';
export const originalIntents: readonly PhotoIntent[] = ['final-jpeg', 'final-tiff', 'high-precision', 'redevelop'];
export function representationFor(intent: PhotoIntent): Representation {
  return originalIntents.includes(intent) ? 'original' : intent === 'library' ? 'thumbnail' : 'proxy';
}
export interface CloudEvidence {
  checksumVerified: boolean; objectPersisted: boolean; metadataCommitted: boolean; permissionVerified: boolean;
  uploadCompleted: boolean; sizeMatched: boolean; ownerWorkspaceConfirmed: boolean;
}
export function isCloudSafe(e: CloudEvidence): boolean {
  return e.checksumVerified === true && e.objectPersisted === true && e.metadataCommitted === true && e.permissionVerified === true && e.uploadCompleted === true && e.sizeMatched === true && e.ownerWorkspaceConfirmed === true;
}
export function exportReadiness(input: {originalLocal: boolean; checksumValid: boolean; cloudSafe: boolean; online: boolean; fetchFailed: boolean}) {
  if (input.originalLocal && input.checksumValid) return {state: 'ready', representation: 'original'} as const;
  if (input.cloudSafe && input.online && !input.fetchFailed) return {state: 'fetch-original', representation: 'original'} as const;
  return {state: 'waiting-for-original', message: 'Original取得待ち'} as const;
}
export function mayEvict(input: {kind: Representation; pinned: boolean; recoverable: boolean; cloudSafe: boolean; originalEvictionOptIn: boolean}): boolean {
  if (input.pinned || !input.recoverable || input.kind === 'recipe') return false;
  if (input.kind === 'original') return input.cloudSafe && input.originalEvictionOptIn;
  return input.kind === 'proxy' || input.kind === 'thumbnail' || input.kind === 'preview' || input.kind === 'export';
}
export function validateRecipe(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RECIPE');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !data.parameters || typeof data.parameters !== 'object' || Array.isArray(data.parameters)) throw new Error('INVALID_RECIPE');
  if (Object.keys(data).some(key => !['schemaVersion', 'parameters'].includes(key))) throw new Error('INVALID_RECIPE_FIELDS');
  const p = data.parameters as Record<string, unknown>;
  const known = new Set(['exposure', 'contrast', 'saturation', 'rotation', 'whiteBalance', 'tint', 'highlight', 'shadow', 'white', 'black', 'temperature', 'vibrance', 'hsl', 'toneCurve', 'sharpness', 'noiseReduction', 'lensCorrection', 'crop', 'postDecodeAdjustments']);
  const fields = ['exposure', 'contrast', 'saturation', 'rotationDegrees', 'extendedParameters', 'processingOrder'];
  if (Object.keys(p).some(k => !fields.includes(k)) || fields.some(k => !(k in p))) throw new Error('INVALID_RECIPE_FIELDS');
  for (const name of ['exposure', 'contrast', 'saturation', 'rotationDegrees']) if (typeof p[name] !== 'number' || !Number.isFinite(p[name])) throw new Error('INVALID_PARAMETER');
  if (!Number.isSafeInteger(p.rotationDegrees) || Number(p.contrast) < 0 || Number(p.saturation) < 0) throw new Error('INVALID_PARAMETER');
  if (!Array.isArray(p.processingOrder) || p.processingOrder.some(s => typeof s !== 'string' || !known.has(s)) || new Set(p.processingOrder).size !== p.processingOrder.length) throw new Error('INVALID_PIPELINE');
  for (const [field, stage, neutral] of [['exposure', 'exposure', 0], ['contrast', 'contrast', 1], ['saturation', 'saturation', 1]] as const) {
    if (p[field] !== neutral && !p.processingOrder.includes(stage)) throw new Error('INVALID_PIPELINE');
  }
  if (Number(p.rotationDegrees) % 360 !== 0 && !p.processingOrder.includes('rotation')) throw new Error('INVALID_PIPELINE');
  if (!p.extendedParameters || typeof p.extendedParameters !== 'object' || Array.isArray(p.extendedParameters)) throw new Error('INVALID_PARAMETER');
  const visit = (v: unknown, depth: number): void => {
    if (depth > 32) throw new Error('INVALID_RECIPE_DEPTH');
    if (typeof v === 'number') {if (!Number.isFinite(v)) throw new Error('INVALID_PARAMETER'); return;}
    if (typeof v === 'boolean' || typeof v === 'string') return;
    if (!v || typeof v !== 'object') throw new Error('INVALID_PARAMETER');
    if (!Array.isArray(v) && Object.keys(v).some(k => !k.length)) throw new Error('INVALID_PARAMETER');
    for (const item of Object.values(v)) visit(item, depth + 1);
  };
  if (Object.keys(p.extendedParameters).some(k => !k.trim())) throw new Error('INVALID_PARAMETER');
  for (const item of Object.values(p.extendedParameters)) visit(item, 0);
  const extra = p.extendedParameters as Record<string, unknown>;
  const postDecode = extra.postDecodeAdjustments;
  if (postDecode !== undefined) {
    if (!p.processingOrder.includes('postDecodeAdjustments')) throw new Error('INVALID_PIPELINE');
    if (!postDecode || typeof postDecode !== 'object' || Array.isArray(postDecode)) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
    const a = postDecode as Record<string, unknown>;
    if (a.schemaVersion !== 1 || a.engineVersion !== 'suite-srgb8-color-detail-1' || Object.keys(a).some(k => !['schemaVersion', 'engineVersion', 'color', 'detail'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
    const range = (v: unknown, min: number, max: number): void => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('INVALID_POST_DECODE_RANGE'); };
    const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS'); return v as Record<string, unknown>; };
    if (a.color !== undefined) {
      const color = object(a.color);
      const tones = ['highlights', 'shadows', 'whites', 'blacks', 'vibrance'];
      if (Object.keys(color).some(k => ![...tones, 'hsl'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
      for (const key of tones) if (color[key] !== undefined) range(color[key], -100, 100);
      if (color.hsl !== undefined) {
        const hsl = object(color.hsl);
        const colors = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
        if (Object.keys(hsl).some(k => !colors.includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        for (const channel of Object.values(hsl)) {
          const fields = object(channel);
          if (Object.keys(fields).some(k => !['hue', 'saturation', 'luminance'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
          for (const value of Object.values(fields)) range(value, -100, 100);
        }
      }
    }
    if (a.detail !== undefined) {
      const detail = object(a.detail);
      if (Object.keys(detail).some(k => !['clarity', 'texture', 'sharpness'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
      for (const [key, value] of Object.entries(detail)) range(value, key === 'sharpness' ? 0 : -100, 100);
    }
    const order = p.processingOrder as string[];
    const index = order.indexOf('postDecodeAdjustments');
    if (order.some((stage, i) => (['exposure', 'contrast', 'saturation'].includes(stage) && i > index) || (['rotation', 'crop'].includes(stage) && i < index))) throw new Error('INVALID_POST_DECODE_ORDER');
  } else if (p.processingOrder.includes('postDecodeAdjustments')) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
  if (Object.hasOwn(extra, 'portrait')) validatePortraitRecipe(extra.portrait);
  if (Object.hasOwn(extra, 'crop')) {
    validateCropSettings(extra.crop);
    if (extra.crop.rotation !== p.rotationDegrees || p.processingOrder.at(-1) !== 'crop') throw new Error('INVALID_CROP_ROTATION_OR_ORDER');
  }
  if (Object.hasOwn(extra, 'export')) {
    validateExportSettings(extra.export);
    if (Object.hasOwn(extra, 'crop')) {
      validateCropSettings(extra.crop);
      if (extra.crop.requested_dpi !== extra.export.requested_dpi) throw new Error('INVALID_CROP_EXPORT_DPI_MISMATCH');
    }
  }
}
