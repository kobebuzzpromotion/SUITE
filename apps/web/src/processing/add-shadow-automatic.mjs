import {assertPixels, checkAbort} from './pure.mjs';
import {applyAddShadow, validateAddShadowSettings} from './add-shadow.mjs';
import {placeAddShadowBackdrop} from './add-shadow-backdrop-placement.mjs';
import {assertAnalysisMask} from './subject-segmentation.mjs';

/** Code-only analysis/composition API. Application authorization remains outside
 * this module. Does not fabricate the manual runtime's verified provenance. */
export async function renderAutomaticAddShadow(original, backdrop, settings,
  {segmenter, backdropPlacement, signal} = {}) {
  assertPixels(original); assertPixels(backdrop); checkAbort(signal);
  const controls = validateAddShadowSettings(settings);
  if (original.width * original.height > 8_000_000) throw Error('ADD_SHADOW_CAPACITY');
  if (typeof segmenter?.segment !== 'function') throw Error('SUBJECT_SEGMENTER_REQUIRED');
  const source = {width: original.width, height: original.height, data: new Uint8ClampedArray(original.data)};
  const background = {width: backdrop.width, height: backdrop.height, data: new Uint8ClampedArray(backdrop.data)};
  const placed = backdropPlacement ? placeAddShadowBackdrop(background, source.width, source.height,
    backdropPlacement, {signal}) : background;
  if (placed.width !== source.width || placed.height !== source.height) throw Error('ADD_SHADOW_BACKDROP_DIMENSIONS');
  const detected = await segmenter.segment(source, {signal}); checkAbort(signal);
  assertAnalysisMask(detected, source);
  const matte = {width: source.width, height: source.height, data: new Uint8Array(detected.data)};
  // Cast the shadow on the replacement background first, then place the subject
  // in front. Original alpha multiplies the segmentation, not the background.
  for (let i = 0; i < matte.data.length; i++) matte.data[i] = Math.round(matte.data[i] * source.data[i * 4 + 3] / 255);
  const shadowed = applyAddShadow(placed, matte, controls, {signal});
  const data = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < matte.data.length; i++) {
    if (!(i & 16383)) checkAbort(signal);
    const o = i * 4, a = matte.data[i] / 255, b = shadowed.data[o + 3] / 255;
    const alpha = a + b * (1 - a);
    data[o + 3] = Math.round(alpha * 255);
    if (alpha) for (let c = 0; c < 3; c++) data[o + c] = Math.round(
      (source.data[o + c] * a + shadowed.data[o + c] * b * (1 - a)) / alpha);
  }
  return {pixels: {width: source.width, height: source.height, data}, subjectMask: matte,
    analysis: detected.analysis ?? null, settings: controls};
}
