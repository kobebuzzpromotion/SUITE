import {assertPixels, checkAbort} from './pure.mjs';
import {createSubjectSegmenter, assertAnalysisMask} from './subject-segmentation.mjs';
import {applyOriginalShadow} from './original-shadow.mjs';
import {applyAddShadow, validateAddShadowSettings} from './add-shadow.mjs';
import {placeAddShadowBackdrop} from './add-shadow-backdrop-placement.mjs';

/** Semantic shadow extraction is a dedicated model contract, not thresholding
 * all dark background pixels. Weights/classes must be supplied by the inventory.
 * Retained and newly cast shadows have separate controls and a fixed order. */
export async function createOriginalShadowProcessor({subjectModel, shadowModel} = {}, {signal} = {}) {
  const subject = await createSubjectSegmenter(subjectModel, {signal});
  let shadow;
  try { shadow = await createSubjectSegmenter(shadowModel, {signal}); }
  catch (error) { subject.close(); throw error; }
  let closed = false;
  return Object.freeze({
    async render(original, replacement, {retainOpacity = 100, addedShadow,
      placement, excludeShadowMask, signal} = {}) {
      checkAbort(signal); assertPixels(original); assertPixels(replacement);
      if (closed) throw Error('ORIGINAL_SHADOW_PROCESSOR_CLOSED');
      if (!Number.isInteger(retainOpacity) || retainOpacity < 0 || retainOpacity > 100 ||
          original.width * original.height > 8_000_000) throw Error('ORIGINAL_SHADOW_SETTINGS');
      const {width, height} = original;
      const source = {width, height, data: new Uint8ClampedArray(original.data)};
      const background = {width: replacement.width, height: replacement.height,
        data: new Uint8ClampedArray(replacement.data)};
      const options = addedShadow ? validateAddShadowSettings(addedShadow) : null;
      if (excludeShadowMask) assertAnalysisMask(excludeShadowMask, source);
      const excluded = excludeShadowMask && new Uint8Array(excludeShadowMask.data);
      const backdrop = placement ? placeAddShadowBackdrop(background, width, height, placement, {signal}) : background;
      if (backdrop.width !== width || backdrop.height !== height) throw Error('ORIGINAL_SHADOW_BACKDROP_DIMENSIONS');
      const subjectResult = await subject.segment(source, {signal}); checkAbort(signal);
      const shadowResult = await shadow.segment(source, {signal}); checkAbort(signal);
      if (closed) throw Error('ORIGINAL_SHADOW_PROCESSOR_CLOSED');
      assertAnalysisMask(subjectResult, source); assertAnalysisMask(shadowResult, source);
      const matte = {width, height, data: new Uint8Array(subjectResult.data)};
      const shadows = {width, height, data: new Uint8Array(shadowResult.data)};
      for (let i = 0; i < matte.data.length; i++) {
        if (!(i & 16383)) checkAbort(signal);
        // Remove low-probability classifier noise; keep genuine soft boundaries.
        matte.data[i] = Math.round(Math.max(0, (matte.data[i] - 8) / 247) * source.data[i * 4 + 3]);
        if (matte.data[i] || !source.data[i * 4 + 3]) shadows.data[i] = 0;
        else if (excluded) shadows.data[i] = Math.round(shadows.data[i] * (1 - excluded[i] / 255));
      }
      let result = applyOriginalShadow(source, backdrop, matte, shadows, {opacity: retainOpacity, signal});
      if (options) result = applyAddShadow(result, matte, options, {signal});
      const data = new Uint8ClampedArray(result.data);
      for (let i = 0; i < matte.data.length; i++) {
        if (!(i & 16383)) checkAbort(signal);
        const p = i * 4, a = matte.data[i] / 255, b = result.data[p + 3] / 255, alpha = a + b * (1 - a);
        data[p + 3] = Math.round(alpha * 255);
        for (let c = 0; c < 3; c++) data[p + c] = alpha ?
          Math.round((source.data[p + c] * a + result.data[p + c] * b * (1 - a)) / alpha) : 0;
      }
      return {pixels: {width, height, data}, subjectMask: matte, shadowMask: shadows,
        analysis: {subject: subjectResult.analysis, shadow: shadowResult.analysis},
        order: ['retain-original-shadow', 'add-shadow', 'composite-subject']};
    },
    close() { if (!closed) { closed = true; subject.close(); shadow.close(); } },
  });
}
