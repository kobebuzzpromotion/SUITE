import {validateCropSettings, validateExportSettings} from './crop-export.js';
import {validatePortraitRecipe} from './portrait-recipe.js';
import {validateManualMakeup} from './manual-makeup-brush.js';
import {validateManualClone} from './manual-clone.js';
import {validateManualSkin} from './manual-skin.js';
import {validateManualRedEye} from './manual-red-eye.js';
import {validateManualHair} from './manual-hair.js';
import {validateWebManualTeeth} from './web-manual-teeth.js';
import {validateWebManualClothing} from './web-manual-clothing.js';
import {validateWebManualBackground} from './web-manual-background.js';
import {validateWebManualSpot} from './web-manual-spot.js';
import {validateWebRawDenoise} from './web-raw-denoise.js';
import {validateWebDepthRange} from './web-depth-range.js';
import {validateWebLensShading} from './web-connected-lens.js';
import {validateWebManualLiquify} from './web-manual-liquify.js';
import {validateLocalLUTMask} from './local-lut-mask.js';
import {validateManualEyes} from './manual-eyes.js';
import {validateColorRangeLevels} from './color-range-levels.js';
import {validatePersonalLook} from './personal-look.js';
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
  const appleBundle=(p.extendedParameters as Record<string,unknown>).appleLocalBundle;
  if(appleBundle!==undefined){
    if(!appleBundle||typeof appleBundle!=='object'||Array.isArray(appleBundle))throw new Error('INVALID_APPLE_BUNDLE');
    const b=appleBundle as Record<string,unknown>,keys=['schemaVersion','engineVersion','assetID','originalSHA256','bundleSHA256','byteCount'];
    const supportedBundleVersion=(b.schemaVersion===1&&b.engineVersion==='suite-apple-local-bundle-v1')||
      (b.schemaVersion===2&&b.engineVersion==='suite-apple-local-bundle-v2');
    if(Object.keys(b).length!==keys.length||keys.some(k=>!Object.hasOwn(b,k))||!supportedBundleVersion||
      typeof b.assetID!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(b.assetID)||
      ![b.originalSHA256,b.bundleSHA256].every(v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v))||
      !Number.isSafeInteger(b.byteCount)||Number(b.byteCount)<1||Number(b.byteCount)>64*1024*1024||
      Object.keys(p.extendedParameters).length!==1||p.exposure!==0||p.contrast!==1||p.saturation!==1||p.rotationDegrees!==0||
      (p.processingOrder as string[]).length!==0)throw new Error('INVALID_APPLE_BUNDLE');
  }
  const visit = (v: unknown, depth: number, path: string[] = []): void => {
    if (depth > 32) throw new Error('INVALID_RECIPE_DEPTH');
    // Only Point Color's explicit achromatic hue sentinel may be JSON null.
    // The strict selection validator below verifies the surrounding structure.
    if (v === null && path.length === 6 && path[0] === 'postDecodeAdjustments' &&
        path[1] === 'color' && path[2] === 'pointColor' && path[3] === 'selections' &&
        typeof path[4] === 'string' && /^(0|[1-9][0-9]*)$/.test(path[4]) && path[5] === 'hue') return;
    if (typeof v === 'number') {if (!Number.isFinite(v)) throw new Error('INVALID_PARAMETER'); return;}
    if (typeof v === 'boolean' || typeof v === 'string') return;
    if (!v || typeof v !== 'object') throw new Error('INVALID_PARAMETER');
    if (!Array.isArray(v) && Object.keys(v).some(k => !k.length)) throw new Error('INVALID_PARAMETER');
    for (const [key, item] of Object.entries(v)) visit(item, depth + 1, [...path, key]);
  };
  if (Object.keys(p.extendedParameters).some(k => !k.trim())) throw new Error('INVALID_PARAMETER');
  if (Object.keys(p.extendedParameters).some(k => /^teeth/i.test(k) && k !== 'teethManual'))
    throw new Error('INVALID_TEETH_MANUAL_ALIAS');
  if (Object.keys(p.extendedParameters).some(k =>
    /^(?:makeup.*highlight|highlight.*makeup)/i.test(k) && k !== 'makeupHighlightManual'))
    throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /blush/i.test(k) && k !== 'blushManual'))
    throw new Error('INVALID_BLUSH_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /(?:face[\s_-]*decorations?|freckles?)/i.test(k) &&
    k !== 'faceDecorationsManual'))
    throw new Error('INVALID_FACE_DECORATIONS_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /^(?:contacts?|colou?redContacts|irisColou?r)/i.test(k) &&
    k !== 'contactsIrisManual'))
    throw new Error('INVALID_CONTACTS_IRIS_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /(?:clothing|garment)/i.test(k) && k !== 'clothingSpotManual'))
    throw new Error('INVALID_CLOTHING_SPOT_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /hand/i.test(k) && k !== 'handToneManual'))
    throw new Error('INVALID_HAND_TONE_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /(?:eyeliner|eye[_-]?liner|lid[_-]?line)/i.test(k) &&
    k !== 'eyelinerManual'))
    throw new Error('INVALID_EYELINER_MANUAL_ALIAS');
  if (Reflect.ownKeys(p.extendedParameters).some(k =>
    typeof k === 'string' && /(?:eye[\s_-]*shadows?|shadows?[\s_-]*eye)/i.test(k) &&
    k !== 'eyeshadowManual'))
    throw new Error('INVALID_EYESHADOW_MANUAL_ALIAS');
  if (Object.keys(p.extendedParameters).some(k =>
    /^(?:original.*shadow|shadow.*original)/i.test(k) && k !== 'originalShadowManual'))
    throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_ALIAS');
  if (Object.hasOwn(p.extendedParameters, 'makeupHighlightManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'makeupHighlightManual')!, 'value'))
    throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'blushManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'blushManual')!, 'value'))
    throw new Error('INVALID_BLUSH_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'faceDecorationsManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'faceDecorationsManual')!, 'value'))
    throw new Error('INVALID_FACE_DECORATIONS_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'contactsIrisManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'contactsIrisManual')!, 'value'))
    throw new Error('INVALID_CONTACTS_IRIS_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'clothingSpotManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'clothingSpotManual')!, 'value'))
    throw new Error('INVALID_CLOTHING_SPOT_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'handToneManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'handToneManual')!, 'value'))
    throw new Error('INVALID_HAND_TONE_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'eyelinerManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'eyelinerManual')!, 'value'))
    throw new Error('INVALID_EYELINER_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'eyeshadowManual') &&
      !Object.hasOwn(Object.getOwnPropertyDescriptor(p.extendedParameters,
        'eyeshadowManual')!, 'value'))
    throw new Error('INVALID_EYESHADOW_MANUAL');
  if (Object.hasOwn(p.extendedParameters, 'sceneGeometry')) {
    const descriptor = Object.getOwnPropertyDescriptor(p.extendedParameters, 'sceneGeometry');
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      throw new Error('INVALID_SCENE_GEOMETRY');
  }
  // These photo-local stroke formats have bounded shapes below. Avoid an
  // unbounded generic walk before checking their list and point limits.
  for (const [key, validate] of [
    ['manualMakeup', validateManualMakeup],
    ['manualClone', validateManualClone],
    ['manualSkin', validateManualSkin],
    ['manualRedEye', validateManualRedEye],
    ['manualHair', validateManualHair],
    ['webManualTeeth', validateWebManualTeeth],
    ['webManualClothing', validateWebManualClothing],
    ['webManualBackground', validateWebManualBackground],
    ['webManualSpot', validateWebManualSpot],
    ['webRawDenoise', validateWebRawDenoise],
    ['webDepthRange', validateWebDepthRange],
    ['webLensShading', validateWebLensShading],
    ['webManualLiquify', validateWebManualLiquify],
    ['localLUTMask', validateLocalLUTMask],
    ['manualEyes', validateManualEyes],
    ['colorRangeLevels', validateColorRangeLevels],
    ['personalLook', validatePersonalLook],
  ] as const) {
    if (Object.hasOwn(p.extendedParameters, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(p.extendedParameters, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_LOCAL_ADJUSTMENT');
      validate(descriptor.value);
    }
  }
  for (const [key, item] of Object.entries(p.extendedParameters))
    if (key !== 'webDepthRange' && key !== 'webManualSpot' && key !== 'localLUTMask' && key !== 'webManualLiquify' && key !== 'webManualBackground' && key !== 'webManualClothing' && key !== 'webLensShading' && key !== 'webManualTeeth' && key !== 'manualMakeup' && key !== 'manualClone' && key !== 'manualSkin' && key !== 'manualRedEye' && key !== 'manualHair' && key !== 'manualEyes' && key !== 'colorRangeLevels' && key !== 'personalLook' &&
        key !== 'localLevels' && key !== 'bwEdgeManual' && key !== 'addShadowManual' &&
        key !== 'originalShadowManual' &&
        key !== 'teethManual' && key !== 'makeupHighlightManual' &&
        key !== 'blushManual' && key !== 'faceDecorationsManual' &&
        key !== 'contactsIrisManual' &&
        key !== 'clothingSpotManual' &&
        key !== 'handToneManual' && key !== 'eyelinerManual' &&
        key !== 'eyeshadowManual' && key !== 'sceneGeometry') visit(item, 0, [key]);
  const extra = p.extendedParameters as Record<string, unknown>;
  if (Object.hasOwn(extra,'localLUTMask')) {
    const profile=(extra.postDecodeAdjustments as {color?:{profile?:{kind?:unknown}}}|undefined)?.color?.profile;
    if(profile?.kind!=='local-lut')throw new Error('LOCAL_LUT_MASK_PROFILE_REQUIRED');
  }
  // Worker messages may come from another JS realm. Its Object.prototype is
  // distinct from this module's, even for an ordinary JSON object.
  const plainRecord = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || (Object.getPrototypeOf(prototype) === null &&
      Object.hasOwn(prototype, 'constructor') &&
      typeof prototype.constructor === 'function' && prototype.constructor.name === 'Object');
  };
  // Fixed-size geometry is validated without a generic recursive walk: nested
  // getters and arbitrary payloads must not execute before shape validation.
  if (Object.hasOwn(extra, 'sceneGeometry')) {
    const exactData = (value: unknown, keys: string[]): value is Record<string, unknown> =>
      plainRecord(value) && Reflect.ownKeys(value).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
    const geometry = extra.sceneGeometry;
    const manualShape = exactData(geometry, ['schemaVersion', 'engineVersion', 'mode', 'controls']);
    const guidedShape = exactData(geometry, ['schemaVersion', 'engineVersion', 'mode', 'sourcePoints', 'destinationPoints']);
    if ((!manualShape && !guidedShape) || !plainRecord(geometry) ||
        geometry.schemaVersion !== 1 || geometry.engineVersion !== 'suite-scene-geometry-1' ||
        !(manualShape && geometry.mode === 'manual' || guidedShape && geometry.mode === 'guided'))
      throw new Error('INVALID_SCENE_GEOMETRY');
    if (geometry.mode === 'guided') {
      for (const name of ['sourcePoints', 'destinationPoints']) {
        const points = geometry[name];
        if (!Array.isArray(points) || points.length !== 4 || Reflect.ownKeys(points).length !== 5)
          throw new Error('INVALID_SCENE_GEOMETRY_GUIDES');
        for (let index = 0; index < 4; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(points, String(index));
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
              !exactData(descriptor.value, ['x', 'y'])) throw new Error('INVALID_SCENE_GEOMETRY_GUIDES');
          for (const coordinate of ['x', 'y']) {
            const value = descriptor.value[coordinate];
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
              throw new Error('INVALID_SCENE_GEOMETRY_GUIDES');
          }
        }
      }
      // Degenerate correspondences are rejected by the runtime homography solver.
    } else {
    const controls = geometry.controls;
    if (!exactData(controls, ['angle', 'flipX', 'flipY', 'aspect', 'scale', 'x', 'y', 'vertical', 'horizontal']) ||
        typeof controls.flipX !== 'boolean' || typeof controls.flipY !== 'boolean')
      throw new Error('INVALID_SCENE_GEOMETRY_CONTROLS');
    for (const [key, minimum, maximum] of [
      ['angle', -180, 180], ['aspect', 0.2, 5], ['scale', 0.2, 5],
      ['x', -2, 2], ['y', -2, 2], ['vertical', -0.8, 0.8], ['horizontal', -0.8, 0.8],
    ] as const) {
      const value = controls[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
        throw new Error('INVALID_SCENE_GEOMETRY_CONTROLS');
    }
    }
  }
  const postCrop = extra.postCropAdjustments;
  if (postCrop !== undefined) {
    const a = postCrop as Record<string, unknown>;
    if (!plainRecord(a) ||
        Reflect.ownKeys(a).length !== 3 || !Object.hasOwn(a, 'schemaVersion') ||
        !Object.hasOwn(a, 'engineVersion') || !Object.hasOwn(a, 'vignette') ||
        a.schemaVersion !== 1 || a.engineVersion !== 'suite-srgb8-manual-vignette-1')
      throw new Error('INVALID_POST_CROP_ADJUSTMENTS');
    const vignette = a.vignette as Record<string, unknown>;
    if (!plainRecord(vignette) ||
        Reflect.ownKeys(vignette).some(k => typeof k !== 'string' ||
          !['amount', 'midpoint', 'roundness', 'feather', 'highlights'].includes(k)) ||
        !Object.hasOwn(vignette, 'amount') ||
        typeof vignette.amount !== 'number' || !Number.isFinite(vignette.amount) ||
        vignette.amount < -100 || vignette.amount > 100)
      throw new Error('INVALID_POST_CROP_ADJUSTMENTS');
    for (const [key, min] of [['midpoint', 0], ['roundness', -100], ['feather', 0], ['highlights', 0]] as const) {
      if (!Object.hasOwn(vignette, key)) continue;
      const value = vignette[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 100)
        throw new Error('INVALID_POST_CROP_ADJUSTMENTS');
    }
  }
  const canvasExpand = extra.canvasExpand;
  if (canvasExpand !== undefined) {
    const settings = canvasExpand as Record<string, unknown>;
    if (!plainRecord(settings) ||
        Reflect.ownKeys(settings).some(k => typeof k !== 'string' || !['schemaVersion', 'margins', 'background'].includes(k)) ||
        !Object.hasOwn(settings, 'schemaVersion') || !Object.hasOwn(settings, 'margins') ||
        settings.schemaVersion !== 1)
      throw new Error('INVALID_CANVAS_EXPAND');
    const margins = settings.margins as Record<string, unknown>;
    if (!plainRecord(margins) ||
        Reflect.ownKeys(margins).length !== 4 ||
        !['left', 'right', 'top', 'bottom'].every(k => Object.hasOwn(margins, k)))
      throw new Error('INVALID_CANVAS_EXPAND_MARGINS');
    for (const value of Object.values(margins))
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 4)
        throw new Error('INVALID_CANVAS_EXPAND_MARGINS');
    if (Object.hasOwn(settings, 'background')) {
      const background = settings.background;
      if (!Array.isArray(background) || background.length !== 4 ||
          Reflect.ownKeys(background).filter(k => k !== 'length').length !== 4 ||
          ![0, 1, 2, 3].every(index => Object.hasOwn(background, index)) ||
          !background.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 255))
        throw new Error('INVALID_CANVAS_EXPAND_BACKGROUND');
    }
  }
  // Manual B/W edge authoring stores only normalized strokes and an immutable
  // Original binding. Saved revision, owner assertion and permission evidence
  // are runtime/CAS inputs, never part of this Recipe v1 JSON. This is only
  // structural validation; repository and Cloud must recheck the real Asset.
  const bwEdgeManual = extra.bwEdgeManual;
  if (Object.hasOwn(extra, 'bwEdgeManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    if (!exactData(bwEdgeManual, ['schemaVersion', 'engineVersion', 'binding',
      'subjectStrokes', 'correctionStrokes']) || bwEdgeManual.schemaVersion !== 1 ||
        bwEdgeManual.engineVersion !== 'suite-srgb8-explicit-mask-bw-edge-1')
      throw new Error('INVALID_BW_EDGE_MANUAL');
    const bound = bwEdgeManual.binding;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !/^[0-9a-f]{64}$/i.test(bound.originalSHA256) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        // Original dimensions follow the Web source limit, not the 8MP mask buffer limit.
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 96_000_000)
      throw new Error('INVALID_BW_EDGE_MANUAL_BINDING');
    let strokeCount = 0, pointCount = 0;
    const copyStrokes = (value: unknown): unknown[] => {
      if (!denseData(value, 1, 64)) throw new Error('INVALID_BW_EDGE_MANUAL_STROKES');
      strokeCount += value.length;
      if (strokeCount > 64) throw new Error('INVALID_BW_EDGE_MANUAL_CAPACITY');
      let hasAdd = false;
      const copied = Array.prototype.map.call(value, (stroke: unknown) => {
        if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
            (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
            !denseData(stroke.path, 1, 4096) ||
            typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
            stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
            typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
            stroke.hardness < 0 || stroke.hardness > 1)
          throw new Error('INVALID_BW_EDGE_MANUAL_STROKE');
        if (stroke.operation === 'ADD') hasAdd = true;
        pointCount += stroke.path.length;
        if (pointCount > 4096) throw new Error('INVALID_BW_EDGE_MANUAL_CAPACITY');
        const path = Array.prototype.map.call(stroke.path, (point: unknown) => {
          if (!exactData(point, ['u', 'v']) ||
              typeof point.u !== 'number' || !Number.isFinite(point.u) ||
              point.u < 0 || point.u > 1 || typeof point.v !== 'number' ||
              !Number.isFinite(point.v) || point.v < 0 || point.v > 1)
            throw new Error('INVALID_BW_EDGE_MANUAL_POINT');
          return {u: point.u, v: point.v};
        });
        return {operation: stroke.operation, path,
          radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
      });
      if (!hasAdd) throw new Error('INVALID_BW_EDGE_MANUAL_ADD_REQUIRED');
      return copied;
    };
    const subjectStrokes = copyStrokes(bwEdgeManual.subjectStrokes);
    const correctionStrokes = copyStrokes(bwEdgeManual.correctionStrokes);
    const safeDocument = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-explicit-mask-bw-edge-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight},
      subjectStrokes, correctionStrokes};
    if (new TextEncoder().encode(JSON.stringify(safeDocument)).byteLength > 96 * 1024)
      throw new Error('INVALID_BW_EDGE_MANUAL_JSON_LIMIT');
  }
  // This only validates the JSON document. The server must independently
  // authorize both real Assets and enforce photo-bound continuity at save,
  // Preset and cross-Asset copy boundaries; caller-authored IDs are not proof.
  if (Object.hasOwn(extra, 'addShadowManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.addShadowManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'subjectStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-explicit-mask-shadow-1')
      throw new Error('INVALID_ADD_SHADOW_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
      'backdropID', 'backdropSHA256']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.backdropID !== 'string' || !uuid.test(bound.backdropID) ||
        typeof bound.backdropSHA256 !== 'string' || !sha.test(bound.backdropSHA256) ||
        bound.assetID === bound.backdropID ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        // Original metadata may exceed the separately bounded proxy/mask allocation.
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 96_000_000)
      throw new Error('INVALID_ADD_SHADOW_MANUAL_BINDING');
    if (!denseData(document.subjectStrokes, 1, 64))
      throw new Error('INVALID_ADD_SHADOW_MANUAL_STROKES');
    let points = 0, hasAdd = false;
    const strokes = document.subjectStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_ADD_SHADOW_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      points += stroke.path.length;
      if (points > 4096) throw new Error('INVALID_ADD_SHADOW_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_ADD_SHADOW_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_ADD_SHADOW_MANUAL_ADD_REQUIRED');
    const settings = document.settings;
    if (!exactData(settings, ['mode', 'opacity', 'blur', 'gradient', 'blend',
      'offsetX', 'offsetY', 'shadowColor']) ||
        !['none', 'soft', 'hard', 'drop'].includes(settings.mode as string) ||
        !['normal', 'multiply'].includes(settings.blend as string) ||
        !Number.isSafeInteger(settings.opacity) || Number(settings.opacity) < 0 || Number(settings.opacity) > 100 ||
        !Number.isSafeInteger(settings.blur) || Number(settings.blur) < 0 || Number(settings.blur) > 64 ||
        !Number.isSafeInteger(settings.gradient) || Number(settings.gradient) < 0 || Number(settings.gradient) > 100 ||
        !Number.isSafeInteger(settings.offsetX) || Number(settings.offsetX) < -256 || Number(settings.offsetX) > 256 ||
        !Number.isSafeInteger(settings.offsetY) || Number(settings.offsetY) < -256 || Number(settings.offsetY) > 256 ||
        !denseData(settings.shadowColor, 3, 3) ||
        settings.shadowColor.some(channel => typeof channel !== 'number' ||
          !Number.isSafeInteger(channel) || channel < 0 || channel > 255))
      throw new Error('INVALID_ADD_SHADOW_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1, engineVersion: 'suite-srgb8-explicit-mask-shadow-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight,
        backdropID: bound.backdropID, backdropSHA256: bound.backdropSHA256},
      subjectStrokes: strokes,
      settings: {mode: settings.mode, opacity: settings.opacity, blur: settings.blur,
        gradient: settings.gradient, blend: settings.blend, offsetX: settings.offsetX,
        offsetY: settings.offsetY, shadowColor: [...settings.shadowColor]}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_ADD_SHADOW_MANUAL_JSON_LIMIT');
  }
  // Photo-local, owner-drawn subject and original-shadow selections. This is
  // structural validation only; repository/workspace must verify both real
  // Assets and save CAS. No revision, authentication assertion or raster mask
  // belongs in the persisted document.
  if (Object.hasOwn(extra, 'originalShadowManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.originalShadowManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'source', 'binding',
      'subjectStrokes', 'shadowStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-explicit-original-shadow-1' ||
        document.source !== 'owner-manual-input-unverified')
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL');
    const binding = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(binding, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
      'backdropID', 'backdropSHA256']) ||
        typeof binding.assetID !== 'string' || !uuid.test(binding.assetID) ||
        typeof binding.originalSHA256 !== 'string' || !sha.test(binding.originalSHA256) ||
        typeof binding.backdropID !== 'string' || !uuid.test(binding.backdropID) ||
        typeof binding.backdropSHA256 !== 'string' || !sha.test(binding.backdropSHA256) ||
        binding.assetID.toLowerCase() === binding.backdropID.toLowerCase() ||
        !Number.isSafeInteger(binding.sourceWidth) || Number(binding.sourceWidth) < 1 ||
        !Number.isSafeInteger(binding.sourceHeight) || Number(binding.sourceHeight) < 1 ||
        // This does not raise the Original Shadow pixel-operation capacity.
        Number(binding.sourceWidth) * Number(binding.sourceHeight) > 96_000_000)
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_BINDING');
    let strokeCount = 0, pointCount = 0;
    const copyStrokes = (value: unknown): unknown[] => {
      if (!denseData(value, 1, 64)) throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_STROKES');
      strokeCount += value.length;
      if (strokeCount > 64) throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_CAPACITY');
      let hasAdd = false;
      const strokes = value.map(stroke => {
        if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
            (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
            !denseData(stroke.path, 1, 4096) ||
            typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
            stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
            typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
            stroke.hardness < 0 || stroke.hardness > 1)
          throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_STROKE');
        if (stroke.operation === 'ADD') hasAdd = true;
        pointCount += stroke.path.length;
        if (pointCount > 4096) throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_CAPACITY');
        const path = stroke.path.map(point => {
          if (!exactData(point, ['u', 'v']) ||
              typeof point.u !== 'number' || !Number.isFinite(point.u) ||
              point.u < 0 || point.u > 1 ||
              typeof point.v !== 'number' || !Number.isFinite(point.v) ||
              point.v < 0 || point.v > 1)
            throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_POINT');
          return {u: point.u, v: point.v};
        });
        return {operation: stroke.operation, path,
          radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
      });
      if (!hasAdd) throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_ADD_REQUIRED');
      return strokes;
    };
    const subjectStrokes = copyStrokes(document.subjectStrokes);
    const shadowStrokes = copyStrokes(document.shadowStrokes);
    const settings = document.settings;
    if (!exactData(settings, ['opacity']) || !Number.isSafeInteger(settings.opacity) ||
        Number(settings.opacity) < 0 || Number(settings.opacity) > 100)
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1, engineVersion: document.engineVersion,
      source: document.source,
      binding: {assetID: binding.assetID, originalSHA256: binding.originalSHA256,
        sourceWidth: binding.sourceWidth, sourceHeight: binding.sourceHeight,
        backdropID: binding.backdropID, backdropSHA256: binding.backdropSHA256},
      subjectStrokes, shadowStrokes, settings: {opacity: settings.opacity}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_ORIGINAL_SHADOW_MANUAL_JSON_LIMIT');
  }
  // This is a JSON shape check, not a teeth detector or authority check.
  // The saved document contains no bitmap, self-declared authentication or
  // revision; the future product host must establish fresh Asset/person/Recipe
  // authority and trusted manual stroke provenance before rendering.
  if (Object.hasOwn(extra, 'teethManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.teethManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'teethStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-owner-manual-teeth-whitening-1')
      throw new Error('INVALID_TEETH_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
      'personID']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_TEETH_MANUAL_BINDING');
    if (!denseData(document.teethStrokes, 1, 64))
      throw new Error('INVALID_TEETH_MANUAL_STROKES');
    let points = 0, hasAdd = false;
    const strokes = document.teethStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_TEETH_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      points += stroke.path.length;
      if (points > 4096) throw new Error('INVALID_TEETH_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_TEETH_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_TEETH_MANUAL_ADD_REQUIRED');
    const settings = document.settings;
    if (!exactData(settings, ['brightness', 'desaturation']) ||
        typeof settings.brightness !== 'number' || !Number.isFinite(settings.brightness) ||
        settings.brightness < -100 || settings.brightness > 100 ||
        typeof settings.desaturation !== 'number' || !Number.isFinite(settings.desaturation) ||
        settings.desaturation < 0 || settings.desaturation > 100)
      throw new Error('INVALID_TEETH_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-teeth-whitening-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight,
        personID: bound.personID}, teethStrokes: strokes,
      settings: {brightness: settings.brightness, desaturation: settings.desaturation}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_TEETH_MANUAL_JSON_LIMIT');
  }
  // Manual makeup-highlight stores only owner-authored normalized strokes and
  // a photo/person binding. No mask bitmap, saved revision, owner assertion or
  // permission claim belongs in Recipe. This checks JSON shape only; the
  // repository/host must verify fresh Asset, person, rights and stroke origin.
  if (Object.hasOwn(extra, 'makeupHighlightManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.makeupHighlightManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'highlightStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-owner-manual-makeup-highlight-1')
      throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
      'personID']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_BINDING');
    if (!denseData(document.highlightStrokes, 1, 64))
      throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_STROKES');
    let points = 0, hasAdd = false;
    const strokes = document.highlightStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      points += stroke.path.length;
      if (points > 4096) throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_ADD_REQUIRED');
    const settings = document.settings;
    if (!exactData(settings, ['intensity']) ||
        !Number.isSafeInteger(settings.intensity) ||
        Number(settings.intensity) < 0 || Number(settings.intensity) > 100)
      throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-makeup-highlight-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight,
        personID: bound.personID}, highlightStrokes: strokes,
      settings: {intensity: settings.intensity}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_MAKEUP_HIGHLIGHT_MANUAL_JSON_LIMIT');
  }
  // SUITE-only manual cheek color: normalized owner-authored geometry and
  // photo/person binding, never a stored bitmap, revision or authority claim.
  // This validates JSON shape only. Fresh Asset/person/permission and stroke
  // provenance remain the responsibility of the authenticated product host.
  if (Object.hasOwn(extra, 'blushManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.blushManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'cheekStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-owner-manual-blush-color-1')
      throw new Error('INVALID_BLUSH_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight',
      'personID']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_BLUSH_MANUAL_BINDING');
    if (!denseData(document.cheekStrokes, 1, 64))
      throw new Error('INVALID_BLUSH_MANUAL_STROKES');
    let points = 0, hasAdd = false;
    const strokes = document.cheekStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' || !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_BLUSH_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      points += stroke.path.length;
      if (points > 4096) throw new Error('INVALID_BLUSH_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_BLUSH_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_BLUSH_MANUAL_ADD_REQUIRED');
    const settings = document.settings;
    if (!exactData(settings, ['color', 'opacity']))
      throw new Error('INVALID_BLUSH_MANUAL_SETTINGS');
    const color = settings.color;
    if (!exactData(color, ['r', 'g', 'b']) ||
        !['r', 'g', 'b'].every(channel =>
          Number.isSafeInteger(color[channel]) &&
          Number(color[channel]) >= 0 && Number(color[channel]) <= 255) ||
        typeof settings.opacity !== 'number' || !Number.isFinite(settings.opacity) ||
        Object.is(settings.opacity, -0) || settings.opacity < 0 || settings.opacity > 1)
      throw new Error('INVALID_BLUSH_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-blush-color-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight,
        personID: bound.personID}, cheekStrokes: strokes,
      settings: {color: {r: color.r, g: color.g,
        b: color.b}, opacity: settings.opacity}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_BLUSH_MANUAL_JSON_LIMIT');
  }
  // SUITE-only manual freckle dots are photo/person-bound data, not any of
  // Evoto's six materials. The typed JSON contains neither saved revision nor
  // permission/face-location assertions. Fresh authority is a separate gate.
  if (Object.hasOwn(extra, 'faceDecorationsManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const dots = extra.faceDecorationsManual;
    if (!exactData(dots, ['schemaVersion', 'engineVersion', 'binding', 'points']) ||
        dots.schemaVersion !== 1 ||
        dots.engineVersion !== 'suite-srgb8-owner-manual-freckles-1')
      throw new Error('INVALID_FACE_DECORATIONS_MANUAL');
    const bound = dots.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'personID',
      'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_FACE_DECORATIONS_MANUAL_BINDING');
    if (!Array.isArray(dots.points) || dots.points.length < 1 ||
        dots.points.length > 64 ||
        Reflect.ownKeys(dots.points).length !== dots.points.length + 1)
      throw new Error('INVALID_FACE_DECORATIONS_MANUAL_POINTS');
    for (let index = 0; index < dots.points.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(dots.points, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value'))
        throw new Error('INVALID_FACE_DECORATIONS_MANUAL_POINTS');
      const point = descriptor.value;
      if (!exactData(point, ['u', 'v', 'radiusFraction', 'color', 'opacity']))
        throw new Error('INVALID_FACE_DECORATIONS_MANUAL_POINT');
      const color = point.color;
      if (!exactData(color, ['r', 'g', 'b']) ||
          !['u', 'v', 'opacity'].every(key =>
            typeof point[key] === 'number' && Number.isFinite(point[key]) &&
            Number(point[key]) >= 0 && Number(point[key]) <= 1 &&
            !Object.is(point[key], -0)) ||
          typeof point.radiusFraction !== 'number' ||
          !Number.isFinite(point.radiusFraction) ||
          point.radiusFraction < .001 || point.radiusFraction > .05 ||
          !['r', 'g', 'b'].every(key => Number.isSafeInteger(color[key]) &&
            Number(color[key]) >= 0 && Number(color[key]) <= 255))
        throw new Error('INVALID_FACE_DECORATIONS_MANUAL_POINT');
    }
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-freckles-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        personID: bound.personID, sourceWidth: bound.sourceWidth,
        sourceHeight: bound.sourceHeight},
      points: dots.points.map(point => ({u: point.u, v: point.v,
        radiusFraction: point.radiusFraction,
        color: {r: point.color.r, g: point.color.g, b: point.color.b},
        opacity: point.opacity}))};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_FACE_DECORATIONS_MANUAL_JSON_LIMIT');
  }
  // SUITE-only photo/person/eye-bound manual iris color. Two normalized
  // stroke roles remain distinct: ring coverage and pupil exclusion. This
  // checks JSON shape, not an authenticated person, iris location, consent,
  // current Asset/SHA/revision, or either mask's authoring provenance.
  if (Object.hasOwn(extra, 'contactsIrisManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.contactsIrisManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'irisRingStrokes', 'pupilExclusionStrokes', 'settings']) ||
        document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-manual-iris-color-1')
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'personID', 'eye',
      'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        (bound.eye !== 'left' && bound.eye !== 'right') ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL_BINDING');
    let strokeCount = 0, pointCount = 0;
    const strokesFor = (value: unknown, role: 'RING' | 'PUPIL') => {
      if (!denseData(value, 1, 64))
        throw new Error(`INVALID_CONTACTS_IRIS_${role}_STROKES`);
      let hasAdd = false;
      const strokes = value.map(stroke => {
        if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
            (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
            !denseData(stroke.path, 1, 4096) ||
            typeof stroke.radiusFraction !== 'number' ||
            !Number.isFinite(stroke.radiusFraction) ||
            stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
            typeof stroke.hardness !== 'number' ||
            !Number.isFinite(stroke.hardness) ||
            stroke.hardness < 0 || stroke.hardness > 1)
          throw new Error(`INVALID_CONTACTS_IRIS_${role}_STROKE`);
        if (stroke.operation === 'ADD') hasAdd = true;
        strokeCount++;
        pointCount += stroke.path.length;
        if (strokeCount > 64 || pointCount > 4096)
          throw new Error('INVALID_CONTACTS_IRIS_MANUAL_CAPACITY');
        const path = stroke.path.map(point => {
          if (!exactData(point, ['u', 'v']) ||
              typeof point.u !== 'number' || !Number.isFinite(point.u) ||
              point.u < 0 || point.u > 1 ||
              typeof point.v !== 'number' || !Number.isFinite(point.v) ||
              point.v < 0 || point.v > 1)
            throw new Error(`INVALID_CONTACTS_IRIS_${role}_POINT`);
          return {u: point.u, v: point.v};
        });
        return {operation: stroke.operation, path,
          radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
      });
      if (!hasAdd) throw new Error(`INVALID_CONTACTS_IRIS_${role}_ADD_REQUIRED`);
      return strokes;
    };
    const ring = strokesFor(document.irisRingStrokes, 'RING');
    const pupil = strokesFor(document.pupilExclusionStrokes, 'PUPIL');
    const settings = document.settings;
    if (!exactData(settings, ['color', 'amount']))
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL_SETTINGS');
    const color = settings.color;
    if (!exactData(color, ['r', 'g', 'b']) ||
        !['r', 'g', 'b'].every(channel =>
          Number.isSafeInteger(color[channel]) &&
          Number(color[channel]) >= 0 && Number(color[channel]) <= 255) ||
        typeof settings.amount !== 'number' || !Number.isFinite(settings.amount) ||
        Object.is(settings.amount, -0) || settings.amount < 0 || settings.amount > 1)
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1, engineVersion: 'suite-srgb8-manual-iris-color-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        personID: bound.personID, eye: bound.eye,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight},
      irisRingStrokes: ring, pupilExclusionStrokes: pupil,
      settings: {color: {r: color.r, g: color.g, b: color.b}, amount: settings.amount}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_CONTACTS_IRIS_MANUAL_JSON_LIMIT');
  }
  // SUITE-only three-role manual eyeshadow: eye-area coverage and separate
  // iris/pupil exclusions. This validates a photo-bound JSON document, not
  // an authenticated person, actual eye position, Original, privacy consent,
  // permission, saved revision, or rendered image provenance.
  if (Object.hasOwn(extra, 'eyeshadowManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.eyeshadowManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'representation',
      'binding', 'eye', 'strokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-owner-manual-eyeshadow-color-1' ||
        document.representation !== 'normalized-owner-manual-eye-area-protections-v1' ||
        (document.eye !== 'image-left' && document.eye !== 'image-right'))
      throw new Error('INVALID_EYESHADOW_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'personID',
      'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_EYESHADOW_MANUAL_BINDING');
    if (!exactData(document.strokes, ['eyeArea', 'irisProtect', 'pupilProtect']))
      throw new Error('INVALID_EYESHADOW_MANUAL_STROKES');
    let strokeCount = 0, pointCount = 0;
    const unit = (value: unknown) => typeof value === 'number' &&
      Number.isFinite(value) && !Object.is(value, -0) && value >= 0 && value <= 1;
    const strokesFor = (value: unknown, role: string) => {
      if (!denseData(value, 1, 64))
        throw new Error(`INVALID_EYESHADOW_${role}_STROKES`);
      let hasAdd = false;
      const safeStrokes = value.map(stroke => {
        if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
            (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
            !denseData(stroke.path, 1, 4096) ||
            typeof stroke.radiusFraction !== 'number' ||
            !Number.isFinite(stroke.radiusFraction) ||
            stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
            !unit(stroke.hardness))
          throw new Error(`INVALID_EYESHADOW_${role}_STROKE`);
        strokeCount++; pointCount += stroke.path.length;
        if (strokeCount > 64 || pointCount > 4096)
          throw new Error('INVALID_EYESHADOW_MANUAL_CAPACITY');
        if (stroke.operation === 'ADD') hasAdd = true;
        const path = stroke.path.map(point => {
          if (!exactData(point, ['u', 'v']) || !unit(point.u) || !unit(point.v))
            throw new Error(`INVALID_EYESHADOW_${role}_POINT`);
          return {u: point.u, v: point.v};
        });
        return {operation: stroke.operation, path,
          radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
      });
      if (!hasAdd) throw new Error(`INVALID_EYESHADOW_${role}_ADD_REQUIRED`);
      return safeStrokes;
    };
    const area = strokesFor(document.strokes.eyeArea, 'AREA');
    const iris = strokesFor(document.strokes.irisProtect, 'IRIS');
    const pupil = strokesFor(document.strokes.pupilProtect, 'PUPIL');
    const settings = document.settings;
    if (!exactData(settings, ['color', 'opacity']))
      throw new Error('INVALID_EYESHADOW_MANUAL_SETTINGS');
    const color = settings.color;
    if (!exactData(color, ['r', 'g', 'b']) ||
        !['r', 'g', 'b'].every(channel => Number.isSafeInteger(color[channel]) &&
          Number(color[channel]) >= 0 && Number(color[channel]) <= 255) ||
        !unit(settings.opacity))
      throw new Error('INVALID_EYESHADOW_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-eyeshadow-color-1',
      representation: 'normalized-owner-manual-eye-area-protections-v1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        personID: bound.personID, sourceWidth: bound.sourceWidth,
        sourceHeight: bound.sourceHeight}, eye: document.eye,
      strokes: {eyeArea: area, irisProtect: iris, pupilProtect: pupil},
      settings: {color: {r: color.r, g: color.g, b: color.b}, opacity: settings.opacity}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_EYESHADOW_MANUAL_JSON_LIMIT');
  }
  // A photo-local, SUITE-only manual spot document. Rectangles are normalized
  // to the upright full Original; stroke points are local to targetRect (0..1).
  // Shape validation does NOT establish an owner, clothing identity, permission,
  // current Asset/SHA/revision, or consent. Those require a fresh host gate.
  if (Object.hasOwn(extra, 'clothingSpotManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.clothingSpotManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'targetRect', 'referenceRect', 'targetStrokes']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-manual-clothing-spot-1')
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL_BINDING');
    const rect = (value: unknown): Record<'x' | 'y' | 'width' | 'height', number> => {
      if (!exactData(value, ['x', 'y', 'width', 'height']) ||
          !['x', 'y', 'width', 'height'].every(key =>
            typeof value[key] === 'number' && Number.isFinite(value[key])) ||
          Number(value.x) < 0 || Number(value.y) < 0 ||
          Number(value.width) <= 0 || Number(value.height) <= 0 ||
          Number(value.x) + Number(value.width) > 1 ||
          Number(value.y) + Number(value.height) > 1 ||
          Math.round(Number(value.width) * Number(bound.sourceWidth)) < 2 ||
          Math.round(Number(value.height) * Number(bound.sourceHeight)) < 2 ||
          Math.round(Number(value.width) * Number(bound.sourceWidth)) > 256 ||
          Math.round(Number(value.height) * Number(bound.sourceHeight)) > 256)
        throw new Error('INVALID_CLOTHING_SPOT_MANUAL_RECT');
      return {x: Number(value.x), y: Number(value.y),
        width: Number(value.width), height: Number(value.height)};
    };
    const target = rect(document.targetRect), reference = rect(document.referenceRect);
    if (target.width !== reference.width || target.height !== reference.height ||
        (target.x < reference.x + reference.width &&
         reference.x < target.x + target.width &&
         target.y < reference.y + reference.height &&
         reference.y < target.y + target.height))
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL_REGIONS');
    if (!denseData(document.targetStrokes, 1, 64))
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL_STROKES');
    let pointCount = 0, hasAdd = false;
    const strokes = document.targetStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' ||
          !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_CLOTHING_SPOT_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      pointCount += stroke.path.length;
      if (pointCount > 4096) throw new Error('INVALID_CLOTHING_SPOT_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_CLOTHING_SPOT_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_CLOTHING_SPOT_MANUAL_ADD_REQUIRED');
    const safe = {schemaVersion: 1, engineVersion: 'suite-srgb8-manual-clothing-spot-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight},
      targetRect: target, referenceRect: reference, targetStrokes: strokes};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_CLOTHING_SPOT_MANUAL_JSON_LIMIT');
  }
  // SUITE-only local hand/forearm tone. This is a photo-bound normalized
  // drawing, not a bitmap, saved Recipe revision, authenticated owner claim,
  // anatomical hand detection or evidence of present edit permission.
  if (Object.hasOwn(extra, 'handToneManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const document = extra.handToneManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'binding',
      'handStrokes', 'settings']) || document.schemaVersion !== 1 ||
        document.engineVersion !== 'suite-srgb8-owner-manual-hand-tone-1')
      throw new Error('INVALID_HAND_TONE_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_HAND_TONE_MANUAL_BINDING');
    if (!denseData(document.handStrokes, 1, 64))
      throw new Error('INVALID_HAND_TONE_MANUAL_STROKES');
    let points = 0, hasAdd = false;
    const strokes = document.handStrokes.map(stroke => {
      if (!exactData(stroke, ['operation', 'path', 'radiusFraction', 'hardness']) ||
          (stroke.operation !== 'ADD' && stroke.operation !== 'ERASE') ||
          !denseData(stroke.path, 1, 4096) ||
          typeof stroke.radiusFraction !== 'number' ||
          !Number.isFinite(stroke.radiusFraction) ||
          stroke.radiusFraction < .001 || stroke.radiusFraction > .25 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) ||
          stroke.hardness < 0 || stroke.hardness > 1)
        throw new Error('INVALID_HAND_TONE_MANUAL_STROKE');
      if (stroke.operation === 'ADD') hasAdd = true;
      points += stroke.path.length;
      if (points > 4096) throw new Error('INVALID_HAND_TONE_MANUAL_CAPACITY');
      const path = stroke.path.map(point => {
        if (!exactData(point, ['u', 'v']) ||
            typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            point.u < 0 || point.u > 1 ||
            typeof point.v !== 'number' || !Number.isFinite(point.v) ||
            point.v < 0 || point.v > 1)
          throw new Error('INVALID_HAND_TONE_MANUAL_POINT');
        return {u: point.u, v: point.v};
      });
      return {operation: stroke.operation, path,
        radiusFraction: stroke.radiusFraction, hardness: stroke.hardness};
    });
    if (!hasAdd) throw new Error('INVALID_HAND_TONE_MANUAL_ADD_REQUIRED');
    const settings = document.settings;
    if (!exactData(settings, ['strength', 'radiusSourcePixels']) ||
        typeof settings.strength !== 'number' || !Number.isFinite(settings.strength) ||
        Object.is(settings.strength, -0) || settings.strength < 0 || settings.strength > 1 ||
        !Number.isSafeInteger(settings.radiusSourcePixels) ||
        Number(settings.radiusSourcePixels) < 1 || Number(settings.radiusSourcePixels) > 6)
      throw new Error('INVALID_HAND_TONE_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-hand-tone-1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        sourceWidth: bound.sourceWidth, sourceHeight: bound.sourceHeight},
      handStrokes: strokes,
      settings: {strength: settings.strength, radiusSourcePixels: settings.radiusSourcePixels}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_HAND_TONE_MANUAL_JSON_LIMIT');
  }
  // SUITE-only owner-authored, photo/person-bound continuous eyelid line.
  // This admits typed JSON, not a detected eye, consent, actor permission,
  // genuine Original dimensions, or authority to copy it to another photo.
  if (Object.hasOwn(extra, 'eyelinerManual')) {
    const exactData = (item: unknown, keys: string[]): item is Record<string, unknown> =>
      plainRecord(item) && Reflect.ownKeys(item).length === keys.length &&
      keys.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return descriptor !== undefined && descriptor.enumerable === true &&
          Object.hasOwn(descriptor, 'value');
      });
    const denseData = (item: unknown, minimum: number, maximum: number): item is unknown[] => {
      if (!Array.isArray(item) || item.length < minimum || item.length > maximum ||
          Reflect.ownKeys(item).length !== item.length + 1) return false;
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
      }
      return true;
    };
    const unit = (item: unknown): item is number =>
      typeof item === 'number' && Number.isFinite(item) &&
      !Object.is(item, -0) && item >= 0 && item <= 1;
    const document = extra.eyelinerManual;
    if (!exactData(document, ['schemaVersion', 'engineVersion', 'representation',
      'binding', 'eyeTargets', 'settings']) || document.schemaVersion !== 1 ||
      document.engineVersion !== 'suite-srgb8-owner-manual-lid-line-1' ||
      document.representation !== 'normalized-continuous-lid-edge-v1')
      throw new Error('INVALID_EYELINER_MANUAL');
    const bound = document.binding;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sha = /^[0-9a-f]{64}$/i;
    if (!exactData(bound, ['assetID', 'originalSHA256', 'personID',
      'sourceWidth', 'sourceHeight']) ||
        typeof bound.assetID !== 'string' || !uuid.test(bound.assetID) ||
        typeof bound.originalSHA256 !== 'string' || !sha.test(bound.originalSHA256) ||
        typeof bound.personID !== 'string' || !uuid.test(bound.personID) ||
        !Number.isSafeInteger(bound.sourceWidth) || Number(bound.sourceWidth) < 1 ||
        !Number.isSafeInteger(bound.sourceHeight) || Number(bound.sourceHeight) < 1 ||
        !Number.isSafeInteger(Number(bound.sourceWidth) * Number(bound.sourceHeight)) ||
        Number(bound.sourceWidth) * Number(bound.sourceHeight) > 8_000_000)
      throw new Error('INVALID_EYELINER_MANUAL_BINDING');
    if (!denseData(document.eyeTargets, 1, 2))
      throw new Error('INVALID_EYELINER_MANUAL_EYES');
    const sides = new Set<string>(); let vertices = 0;
    const eyes = document.eyeTargets.map(eye => {
      if (!exactData(eye, ['side', 'rect', 'edge', 'wing']) ||
          (eye.side !== 'image-left' && eye.side !== 'image-right') ||
          sides.has(String(eye.side)))
        throw new Error('INVALID_EYELINER_MANUAL_EYE');
      sides.add(String(eye.side));
      const rect = eye.rect;
      if (!exactData(rect, ['x', 'y', 'width', 'height']) ||
          !unit(rect.x) || !unit(rect.y) || !unit(rect.width) ||
          !unit(rect.height) || rect.width <= 0 || rect.height <= 0 ||
          rect.x + rect.width > 1 || rect.y + rect.height > 1)
        throw new Error('INVALID_EYELINER_MANUAL_RECT');
      const rectX = Number(rect.x), rectY = Number(rect.y);
      const rectRight = rectX + Number(rect.width);
      const rectBottom = rectY + Number(rect.height);
      const path = (value: unknown, minimum: number): {u: number; v: number}[] => {
        if (!denseData(value, minimum, 128))
          throw new Error('INVALID_EYELINER_MANUAL_PATH');
        const result = value.map(point => {
          if (!exactData(point, ['u', 'v']) || !unit(point.u) || !unit(point.v) ||
              point.u < rectX || point.u > rectRight ||
              point.v < rectY || point.v > rectBottom)
            throw new Error('INVALID_EYELINER_MANUAL_POINT');
          return {u: point.u, v: point.v};
        });
        if (result.some((point, index) => index > 0 &&
            Math.hypot(point.u - result[index - 1]!.u,
              point.v - result[index - 1]!.v) < 1e-5))
          throw new Error('INVALID_EYELINER_MANUAL_PATH');
        vertices += result.length;
        if (vertices > 256) throw new Error('INVALID_EYELINER_MANUAL_CAPACITY');
        return result;
      };
      const edge = path(eye.edge, 2);
      const wing = eye.wing === null ? null : path(eye.wing, 2);
      if (wing && (wing[0]!.u !== edge.at(-1)!.u || wing[0]!.v !== edge.at(-1)!.v))
        throw new Error('INVALID_EYELINER_MANUAL_WING_DISCONNECTED');
      return {side: eye.side, rect: {x: rect.x, y: rect.y,
        width: rect.width, height: rect.height}, edge, wing};
    });
    if (sides.size === 2) {
      const left = eyes.find(eye => eye.side === 'image-left')!.rect;
      const right = eyes.find(eye => eye.side === 'image-right')!.rect;
      if (left.x + left.width > right.x)
        throw new Error('INVALID_EYELINER_MANUAL_EYES_OVERLAP');
    }
    const settings = document.settings;
    if (!exactData(settings, ['color', 'opacity', 'lineRadiusFraction']) ||
        !exactData(settings.color, ['r', 'g', 'b']) ||
        !['r', 'g', 'b'].every(channel => Number.isSafeInteger(
          (settings.color as Record<string, unknown>)[channel]) &&
          Number((settings.color as Record<string, unknown>)[channel]) >= 0 &&
          Number((settings.color as Record<string, unknown>)[channel]) <= 255) ||
        !unit(settings.opacity) ||
        typeof settings.lineRadiusFraction !== 'number' ||
        !Number.isFinite(settings.lineRadiusFraction) ||
        settings.lineRadiusFraction < .001 || settings.lineRadiusFraction > .03)
      throw new Error('INVALID_EYELINER_MANUAL_SETTINGS');
    const safe = {schemaVersion: 1,
      engineVersion: 'suite-srgb8-owner-manual-lid-line-1',
      representation: 'normalized-continuous-lid-edge-v1',
      binding: {assetID: bound.assetID, originalSHA256: bound.originalSHA256,
        personID: bound.personID, sourceWidth: bound.sourceWidth,
        sourceHeight: bound.sourceHeight}, eyeTargets: eyes,
      settings: {color: {r: (settings.color as Record<string, unknown>).r,
        g: (settings.color as Record<string, unknown>).g,
        b: (settings.color as Record<string, unknown>).b}, opacity: settings.opacity,
      lineRadiusFraction: settings.lineRadiusFraction}};
    if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 96 * 1024)
      throw new Error('INVALID_EYELINER_MANUAL_JSON_LIMIT');
  }
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
      const tones = ['temperature', 'tint', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance'];
      if (Object.keys(color).some(k => ![...tones, 'toneCurve', 'tonalBands', 'hsl', 'levels', 'glow', 'pointCurves', 'calibration', 'selectiveColor', 'grading', 'pointColor', 'profile', 'sceneBasic', 'sceneMatch', 'illuminant', 'whiteBalance', 'lumaCurve'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
      if (Object.hasOwn(color, 'sceneMatch')) {
        const property = Object.getOwnPropertyDescriptor(color, 'sceneMatch');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_SCENE_MATCH');
        const match = property.value as unknown;
        if (!plainRecord(match) || Reflect.ownKeys(match).length !== 3 ||
            !['scale', 'offset', 'amount'].every(key => {
              const descriptor = Object.getOwnPropertyDescriptor(match, key);
              return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
            })) throw new Error('INVALID_SCENE_MATCH');
        const vector = (value: unknown, minimum: number, maximum: number) => {
          if (!Array.isArray(value) || value.length !== 3 || Reflect.ownKeys(value).length !== 4)
            throw new Error('INVALID_SCENE_MATCH');
          for (let i = 0; i < 3; i++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
            if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_SCENE_MATCH');
            range(descriptor.value, minimum, maximum);
          }
        };
        vector(match.scale, 0.5, 2);
        vector(match.offset, -2, 1);
        range(match.amount, 0, 1);
      }
      if (Object.hasOwn(color, 'lumaCurve')) {
        const property = Object.getOwnPropertyDescriptor(color, 'lumaCurve');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_LUMA_CURVE');
        const points = property.value;
        if (!Array.isArray(points) || points.length < 2 || points.length > 16 ||
            Reflect.ownKeys(points).length !== points.length + 1) throw new Error('INVALID_LUMA_CURVE');
        let previousX = -1;
        for (let index = 0; index < points.length; index++) {
          const slot = Object.getOwnPropertyDescriptor(points, String(index));
          if (!slot?.enumerable || !Object.hasOwn(slot, 'value')) throw new Error('INVALID_LUMA_CURVE');
          const point = slot.value;
          if (!plainRecord(point) || Reflect.ownKeys(point).length !== 2 || !['x', 'y'].every(key => {
            const descriptor = Object.getOwnPropertyDescriptor(point, key);
            return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') &&
              Number.isInteger(descriptor.value) && descriptor.value >= 0 && descriptor.value <= 255;
          })) throw new Error('INVALID_LUMA_CURVE');
          const x = point.x as number;
          if (x <= previousX || index === 0 && x !== 0 || index === points.length - 1 && x !== 255)
            throw new Error('INVALID_LUMA_CURVE');
          previousX = x;
        }
      }
      if (Object.hasOwn(color, 'whiteBalance')) {
        if (Object.hasOwn(color, 'illuminant')) throw new Error('WHITE_BALANCE_ILLUMINANT_CONFLICT');
        const property = Object.getOwnPropertyDescriptor(color, 'whiteBalance');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_COLOR_WHITE_BALANCE');
        const balance = property.value as unknown;
        if (!plainRecord(balance) || Reflect.ownKeys(balance).length !== 3 ||
            !['gains', 'domain', 'method'].every(key => {
              const descriptor = Object.getOwnPropertyDescriptor(balance, key);
              return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
            })) throw new Error('INVALID_COLOR_WHITE_BALANCE');
        if (balance.domain !== 'linear-rec709' || !['auto', 'selector'].includes(balance.method as string))
          throw new Error('INVALID_COLOR_WHITE_BALANCE');
        const gains = balance.gains;
        if (!Array.isArray(gains) || gains.length !== 3 || Reflect.ownKeys(gains).length !== 4)
          throw new Error('INVALID_COLOR_WHITE_BALANCE');
        for (let index = 0; index < 3; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(gains, String(index));
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') ||
              typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value) ||
              descriptor.value < 0.25 || descriptor.value > 4) throw new Error('INVALID_COLOR_WHITE_BALANCE');
        }
      }
      for (const key of tones) if (color[key] !== undefined) range(color[key], -100, 100);
      if (Object.hasOwn(color, 'illuminant')) {
        const property = Object.getOwnPropertyDescriptor(color, 'illuminant');
        if (!property?.enumerable || !Object.hasOwn(property, 'value') ||
            typeof property.value !== 'string' ||
            !['daylight', 'cloudy', 'shade', 'tungsten', 'fluorescent', 'flash'].includes(property.value))
          throw new Error('INVALID_COLOR_ILLUMINANT');
      }
      if (Object.hasOwn(color, 'sceneBasic')) {
        const property = Object.getOwnPropertyDescriptor(color, 'sceneBasic');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_SCENE_BASIC');
        const basic = property.value as unknown;
        if (!plainRecord(basic) || !Object.hasOwn(basic, 'brightness') || !Object.hasOwn(basic, 'dehaze') ||
            Reflect.ownKeys(basic).some(key => {
              if (typeof key !== 'string' || !['brightness', 'dehaze'].includes(key)) return true;
              const descriptor = Object.getOwnPropertyDescriptor(basic, key);
              return descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value');
            })) throw new Error('INVALID_SCENE_BASIC');
        range(basic.brightness, -100, 100);
        range(basic.dehaze, -100, 100);
      }
      if (Object.hasOwn(color, 'profile')) {
        const property = Object.getOwnPropertyDescriptor(color, 'profile');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_COLOR_PROFILE');
        const profile = property.value as unknown;
        // Local LUTs carry only an integrity reference, never a CUBE payload.
        if (!plainRecord(profile) || !Object.hasOwn(profile, 'kind') || !Object.hasOwn(profile, 'intensity') ||
            Reflect.ownKeys(profile).some(key => {
              if (typeof key !== 'string' || !['kind', 'intensity', 'lutRef'].includes(key)) return true;
              const descriptor = Object.getOwnPropertyDescriptor(profile, key);
              return descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value');
            })) throw new Error('INVALID_COLOR_PROFILE');
        if (profile.kind !== 'standard' && profile.kind !== 'black-and-white' && profile.kind !== 'local-lut') throw new Error('INVALID_COLOR_PROFILE_KIND');
        range(profile.intensity, 0, 1);
        if (profile.kind === 'local-lut') {
          const ref = profile.lutRef;
          if (!plainRecord(ref) || Reflect.ownKeys(ref).length !== 2 ||
              !['sha256', 'byteLength'].every(key => {
                const descriptor = Object.getOwnPropertyDescriptor(ref, key);
                return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
              }) || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256) ||
              !Number.isSafeInteger(ref.byteLength) || (ref.byteLength as number) < 1 ||
              (ref.byteLength as number) > 33554432) throw new Error('INVALID_LOCAL_LUT_REFERENCE');
        } else if (Object.hasOwn(profile, 'lutRef')) throw new Error('INVALID_COLOR_PROFILE');
      }
      if (Object.hasOwn(color, 'pointColor')) {
        const property = Object.getOwnPropertyDescriptor(color, 'pointColor');
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) throw new Error('INVALID_POINT_COLOR');
        const pointColor = property.value as unknown;
        const fields = (value: unknown, allowed: string[], required: string[] = []): value is Record<string, unknown> =>
          plainRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
          Reflect.ownKeys(value).every(key => {
            if (typeof key !== 'string' || !allowed.includes(key)) return false;
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
          });
        const denseArray = (value: unknown, min: number, max: number): value is unknown[] => {
          if (!Array.isArray(value) || value.length < min || value.length > max ||
              Reflect.ownKeys(value).length !== value.length + 1) return false;
          for (let i = 0; i < value.length; i++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
            if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
          }
          return true;
        };
        if (!fields(pointColor, ['selections', 'amount'], ['selections', 'amount'])) throw new Error('INVALID_POINT_COLOR');
        range(pointColor.amount, 0, 1);
        if (!denseArray(pointColor.selections, 1, 16)) throw new Error('INVALID_POINT_COLOR_SELECTIONS');
        const ids = new Set<string>();
        for (const selection of pointColor.selections) {
          if (!fields(selection, ['id', 'hue', 'saturation', 'lightness', 'adjustment', 'enabled'],
            ['id', 'hue', 'saturation', 'lightness'])) throw new Error('INVALID_POINT_COLOR_SELECTION');
          if (typeof selection.id !== 'string' || !selection.id.length || selection.id.length > 128 || ids.has(selection.id))
            throw new Error('INVALID_POINT_COLOR_SELECTION_ID');
          ids.add(selection.id);
          if (selection.hue !== null) {
            const hue = selection.hue;
            if (!fields(hue, ['center', 'inner', 'outer'], ['center', 'inner', 'outer'])) throw new Error('INVALID_POINT_COLOR_HUE');
            range(hue.center, 0, 360); range(hue.inner, 0, 180); range(hue.outer, hue.inner as number, 180);
          }
          for (const key of ['saturation', 'lightness']) {
            const edges = selection[key];
            if (!denseArray(edges, 4, 4)) throw new Error('INVALID_POINT_COLOR_EDGES');
            for (let i = 0; i < 4; i++) {
              range(edges[i], 0, 1);
              if (i && (edges[i] as number) < (edges[i - 1] as number)) throw new Error('INVALID_POINT_COLOR_EDGES');
            }
          }
          // Omitted adjustment/fields are zero; omitted enabled is true.
          if (Object.hasOwn(selection, 'adjustment')) {
            const adjustment = selection.adjustment;
            if (!fields(adjustment, ['hue', 'saturation', 'lightness'])) throw new Error('INVALID_POINT_COLOR_ADJUSTMENT');
            for (const key of ['hue', 'saturation', 'lightness'])
              if (Object.hasOwn(adjustment, key)) range(adjustment[key], key === 'hue' ? -180 : -100, key === 'hue' ? 180 : 100);
          }
          if (Object.hasOwn(selection, 'enabled') && typeof selection.enabled !== 'boolean') throw new Error('INVALID_POINT_COLOR_ENABLED');
        }
      }
      if (Object.hasOwn(color, 'grading')) {
        // Saved JSON contract for processing/lr-color-grading.mjs. Omitted
        // controls use the kernel defaults; explicit null/undefined is invalid.
        // This extends only grading, leaving existing color contracts unchanged.
        const property = Object.getOwnPropertyDescriptor(color, 'grading');
        if (!property?.enumerable || !Object.hasOwn(property, 'value'))
          throw new Error('INVALID_COLOR_GRADING');
        const grading = property.value as unknown;
        const wheels = ['global', 'shadows', 'midtones', 'highlights'];
        const strictFields = (value: unknown, allowed: string[]): value is Record<string, unknown> =>
          plainRecord(value) && Reflect.ownKeys(value).every(key => {
            if (typeof key !== 'string' || !allowed.includes(key)) return false;
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
          });
        if (!strictFields(grading, [...wheels, 'blending', 'balance', 'amount']))
          throw new Error('INVALID_COLOR_GRADING');
        for (const [key, min, max] of [['blending', 0, 100], ['balance', -100, 100], ['amount', 0, 1]] as const)
          if (Object.hasOwn(grading, key)) range(grading[key], min, max);
        for (const key of wheels) {
          if (!Object.hasOwn(grading, key)) continue;
          const wheel = grading[key];
          if (!strictFields(wheel, ['hue', 'saturation', 'luminance']))
            throw new Error('INVALID_COLOR_GRADING');
          if (Object.hasOwn(wheel, 'hue')) range(wheel.hue, 0, 360);
          if (Object.hasOwn(wheel, 'saturation')) range(wheel.saturation, 0, 100);
          if (Object.hasOwn(wheel, 'luminance')) range(wheel.luminance, -100, 100);
        }
      }
      if (color.selectiveColor !== undefined) {
        const selective = color.selectiveColor;
        if (!plainRecord(selective) || Reflect.ownKeys(selective).some(k =>
          typeof k !== 'string' || !['method', 'ranges'].includes(k)))
          throw new Error('INVALID_SELECTIVE_COLOR');
        const method = Object.hasOwn(selective, 'method') ? selective.method : 'relative';
        if (method !== 'relative' && method !== 'absolute') throw new Error('INVALID_SELECTIVE_COLOR_METHOD');
        const groups = Object.hasOwn(selective, 'ranges') ? selective.ranges : {};
        const names = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'];
        if (!plainRecord(groups) || Reflect.ownKeys(groups).some(k =>
          typeof k !== 'string' || !names.includes(k)))
          throw new Error('INVALID_SELECTIVE_COLOR');
        for (const sliders of Object.values(groups)) {
          if (!plainRecord(sliders) || Reflect.ownKeys(sliders).some(k =>
            typeof k !== 'string' || !['cyan', 'magenta', 'yellow', 'black'].includes(k)))
            throw new Error('INVALID_SELECTIVE_COLOR');
          for (const value of Object.values(sliders))
            if (typeof value !== 'number' || !Number.isInteger(value) || value < -100 || value > 100)
              throw new Error('INVALID_SELECTIVE_COLOR_RANGE');
        }
      }
      if (color.calibration !== undefined) {
        const calibration = color.calibration;
        if (!plainRecord(calibration) || Reflect.ownKeys(calibration).some(k =>
          typeof k !== 'string' || !['red', 'green', 'blue'].includes(k)))
          throw new Error('INVALID_COLOR_CALIBRATION');
        for (const primary of Object.values(calibration)) {
          if (!plainRecord(primary) || Reflect.ownKeys(primary).some(k =>
            typeof k !== 'string' || !['hue', 'saturation'].includes(k)))
            throw new Error('INVALID_COLOR_CALIBRATION');
          for (const value of Object.values(primary))
            if (typeof value !== 'number' || !Number.isInteger(value) || value < -100 || value > 100)
              throw new Error('INVALID_COLOR_CALIBRATION_RANGE');
        }
      }
      if (color.pointCurves !== undefined) {
        const curves = object(color.pointCurves);
        if (!plainRecord(curves) ||
            Reflect.ownKeys(curves).some(k => typeof k !== 'string' || !['master', 'red', 'green', 'blue', 'refineSaturation'].includes(k)))
          throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        if (curves.refineSaturation !== undefined) {
          if (!Number.isSafeInteger(curves.refineSaturation) || (curves.refineSaturation as number) < 0 || (curves.refineSaturation as number) > 100 ||
              !['master', 'red', 'green', 'blue'].some(channel => Object.hasOwn(curves, channel)))
            throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        }
        for (const [channel, points] of Object.entries(curves)) {
          if (channel === 'refineSaturation') continue;
          if (!Array.isArray(points) || points.length < 2 || points.length > 32) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
          let previousX = -1;
          for (const point of points) {
            if (!plainRecord(point) ||
                Reflect.ownKeys(point).length !== 2 || !Object.hasOwn(point, 'x') || !Object.hasOwn(point, 'y') ||
                typeof point.x !== 'number' || typeof point.y !== 'number' ||
                !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) ||
                point.x < 0 || point.x > 255 || point.y < 0 || point.y > 255 || point.x <= previousX)
              throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
            previousX = point.x;
          }
          if ((points[0] as {x: number}).x !== 0 || (points.at(-1) as {x: number}).x !== 255)
            throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        }
      }
      if (color.glow !== undefined) {
        const glow = object(color.glow);
        if (!plainRecord(glow) ||
            Reflect.ownKeys(glow).some(k => typeof k !== 'string' ||
              !['intensity', 'radius', 'threshold', 'mode', 'exposure', 'diffusion', 'tint'].includes(k)))
          throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        const intensity = Object.hasOwn(glow, 'intensity') ? glow.intensity : 0;
        const radius = Object.hasOwn(glow, 'radius') ? glow.radius : 8;
        const threshold = Object.hasOwn(glow, 'threshold') ? glow.threshold : 180;
        range(intensity, 0, 100);
        if (!Number.isSafeInteger(radius) || !Number.isSafeInteger(threshold)) throw new Error('INVALID_POST_DECODE_RANGE');
        range(radius, 1, 64); range(threshold, 0, 255);
        if (Object.hasOwn(glow, 'mode') && !['whiteMist', 'blackMist', 'halation'].includes(glow.mode as string))
          throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        for (const [key, min] of [['exposure', -100], ['diffusion', 0], ['tint', -100]] as const)
          if (Object.hasOwn(glow, key)) range(glow[key], min, 100);
      }
      if (color.levels !== undefined) {
        const levels = object(color.levels);
        if (Object.keys(levels).some(k => !['master', 'red', 'green', 'blue'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        for (const value of Object.values(levels)) {
          const channel = object(value);
          if (Object.keys(channel).some(k => !['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite'].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
          const black = channel.inputBlack ?? 0, white = channel.inputWhite ?? 255, outBlack = channel.outputBlack ?? 0, outWhite = channel.outputWhite ?? 255;
          for (const field of [black, white, outBlack, outWhite]) if (!Number.isSafeInteger(field)) throw new Error('INVALID_POST_DECODE_RANGE');
          range(black, 0, 255); range(white, 0, 255); range(outBlack, 0, 255); range(outWhite, 0, 255); range(channel.gamma ?? 1, 0.1, 10);
          if (Number(black) >= Number(white) || Number(outBlack) > Number(outWhite)) throw new Error('INVALID_POST_DECODE_RANGE');
        }
      }
      let tonalBandsActive = false;
      if (Object.hasOwn(color, 'tonalBands')) {
        const descriptor = Object.getOwnPropertyDescriptor(color, 'tonalBands');
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
          throw new Error('INVALID_TONAL_BANDS');
        const bands = descriptor.value as unknown;
        if (!plainRecord(bands) || Reflect.ownKeys(bands).some(key => {
          if (typeof key !== 'string' || !['shadows', 'darks', 'lights', 'highlights'].includes(key)) return true;
          const field = Object.getOwnPropertyDescriptor(bands, key);
          return field?.enumerable !== true || !Object.hasOwn(field, 'value');
        })) throw new Error('INVALID_TONAL_BANDS');
        // Missing controls are neutral zero. Do not normalize or erase any old
        // toneCurve values: callers must explicitly choose the active system.
        for (const value of Object.values(bands)) {
          range(value, -100, 100);
          if (value !== 0) tonalBandsActive = true;
        }
      }
      if (color.toneCurve !== undefined) {
        const curve=object(color.toneCurve);
        if(Object.keys(curve).some(k=>!['shadows','midtones','highlights'].includes(k)))throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
        if (tonalBandsActive && Object.values(curve).some(value => typeof value === 'number' && Number.isFinite(value) && value !== 0))
          throw new Error('TONAL_BANDS_LEGACY_CURVE_CONFLICT');
        for(const value of Object.values(curve))range(value,-100,100);
      }
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
      const sharpenControls = ['sharpenRadius', 'sharpenDetail', 'sharpenMasking'];
      if (Reflect.ownKeys(detail).some(k => typeof k !== 'string' || !['clarity', 'texture', 'sharpness', 'denoise', 'grain', ...sharpenControls].includes(k))) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
      for (const [key, value] of Object.entries(detail)) {
        if (key === 'grain') {
          const grain = value as Record<string, unknown>;
          const controls = ['shadows', 'midtones', 'highlights', 'size', 'roughness', 'colorVariation'];
          if (!plainRecord(grain) ||
              Reflect.ownKeys(grain).some(k => typeof k !== 'string' || !['amount', 'seed', ...controls].includes(k)) ||
              !Object.hasOwn(grain, 'amount') || !Object.hasOwn(grain, 'seed') ||
              !Number.isSafeInteger(grain.seed)) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
          range(grain.amount, 0, 100); range(grain.seed, 0, 0xffffffff);
          for (const control of controls) if (Object.hasOwn(grain, control)) range(grain[control], 0, 100);
        } else if (sharpenControls.includes(key)) {
          if (!Number.isSafeInteger(value)) throw new Error('INVALID_POST_DECODE_RANGE');
          range(value, 0, 100);
        } else range(value, key === 'sharpness' ? 0 : -100, 100);
      }
    }
    const order = p.processingOrder as string[];
    const index = order.indexOf('postDecodeAdjustments');
    if (order.some((stage, i) => (['exposure', 'contrast', 'saturation'].includes(stage) && i > index) || (['rotation', 'crop'].includes(stage) && i < index))) throw new Error('INVALID_POST_DECODE_ORDER');
  } else if (p.processingOrder.includes('postDecodeAdjustments')) throw new Error('INVALID_POST_DECODE_ADJUSTMENTS');
  // Photo-local Levels stores normalized manual brush strokes, never a Proxy
  // bitmap. Proxy and Final each rasterize the same strokes at their own size.
  // This optional extension adds no processingOrder stage to legacy Recipes.
  const localLevels = extra.localLevels;
  if (localLevels !== undefined) {
    if (!plainRecord(localLevels) ||
        Reflect.ownKeys(localLevels).length !== 5 ||
        !['schemaVersion', 'engineVersion', 'brushVersion', 'strokes', 'levels'].every(k => Object.hasOwn(localLevels, k)) ||
        localLevels.schemaVersion !== 1 ||
        localLevels.engineVersion !== 'suite-srgb8-local-levels-coverage-1' ||
        localLevels.brushVersion !== 'suite-normalized-coverage-brush-1')
      throw new Error('INVALID_LOCAL_LEVELS');
    const dense = (value: unknown, minimum: number, maximum: number): value is unknown[] =>
      Array.isArray(value) && value.length >= minimum && value.length <= maximum &&
      Reflect.ownKeys(value).length === value.length + 1 &&
      Array.from({length: value.length}, (_, index) => Object.hasOwn(value, index)).every(Boolean);
    if (!dense(localLevels.strokes, 1, 64)) throw new Error('INVALID_LOCAL_LEVELS_STROKES');
    let totalPoints = 0;
    for (const stroke of localLevels.strokes) {
      if (!plainRecord(stroke) || Reflect.ownKeys(stroke).length !== 4 ||
          !['points', 'radius', 'hardness', 'mode'].every(k => Object.hasOwn(stroke, k)) ||
          !dense(stroke.points, 1, 4096) ||
          typeof stroke.radius !== 'number' || !Number.isFinite(stroke.radius) || stroke.radius <= 0 || stroke.radius > .5 ||
          typeof stroke.hardness !== 'number' || !Number.isFinite(stroke.hardness) || stroke.hardness < 0 || stroke.hardness > 1 ||
          !['add', 'erase'].includes(stroke.mode as string))
        throw new Error('INVALID_LOCAL_LEVELS_STROKE');
      totalPoints += stroke.points.length;
      if (totalPoints > 4096) throw new Error('INVALID_LOCAL_LEVELS_STROKES');
      for (const point of stroke.points) {
        if (!plainRecord(point) || Reflect.ownKeys(point).length !== 2 ||
            !Object.hasOwn(point, 'x') || !Object.hasOwn(point, 'y') ||
            typeof point.x !== 'number' || !Number.isFinite(point.x) || point.x < 0 || point.x > 1 ||
            typeof point.y !== 'number' || !Number.isFinite(point.y) || point.y < 0 || point.y > 1)
          throw new Error('INVALID_LOCAL_LEVELS_POINT');
      }
    }
    const levels = localLevels.levels;
    if (!plainRecord(levels) || !Reflect.ownKeys(levels).length ||
        Reflect.ownKeys(levels).some(k => typeof k !== 'string' || !['master', 'red', 'green', 'blue'].includes(k)))
      throw new Error('INVALID_LOCAL_LEVELS_CONTROLS');
    for (const channel of Object.values(levels)) {
      if (!plainRecord(channel) || !Reflect.ownKeys(channel).length ||
          Reflect.ownKeys(channel).some(k => typeof k !== 'string' ||
            !['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite'].includes(k)))
        throw new Error('INVALID_LOCAL_LEVELS_CONTROLS');
      const black = channel.inputBlack ?? 0, white = channel.inputWhite ?? 255;
      const outBlack = channel.outputBlack ?? 0, outWhite = channel.outputWhite ?? 255;
      for (const endpoint of [black, white, outBlack, outWhite])
        if (typeof endpoint !== 'number' || !Number.isSafeInteger(endpoint) || endpoint < 0 || endpoint > 255)
          throw new Error('INVALID_LOCAL_LEVELS_CONTROLS');
      const gamma = channel.gamma ?? 1;
      if (typeof gamma !== 'number' || !Number.isFinite(gamma) || gamma < .1 || gamma > 10 ||
          Number(black) >= Number(white) || Number(outBlack) > Number(outWhite))
        throw new Error('INVALID_LOCAL_LEVELS_CONTROLS');
    }
  }
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
