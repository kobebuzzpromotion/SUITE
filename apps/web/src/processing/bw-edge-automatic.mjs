import {assertPixels, checkAbort} from './pure.mjs';
import {applyBlackWhiteEdgeRemoval} from './bw-edge-removal.mjs';
import {assertAnalysisMask, thresholdAnalysisMask} from './subject-segmentation.mjs';

/** Re-detect for each frame/update. Never copy a source photograph's geometry
 * to a target photograph. Brushes are a per-photo correction-area override. */
export async function updateAutomaticBlackWhiteEdges(pixels,
  {segmenter, threshold = .5, includeMask, excludeMask, signal} = {}) {
  assertPixels(pixels); checkAbort(signal);
  if (typeof segmenter?.segment !== 'function') throw Error('SUBJECT_SEGMENTER_REQUIRED');
  const source = {width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data)};
  if (includeMask) assertAnalysisMask(includeMask, source);
  if (excludeMask) assertAnalysisMask(excludeMask, source);
  const included = includeMask && new Uint8Array(includeMask.data);
  const excluded = excludeMask && new Uint8Array(excludeMask.data);
  const analysis = await segmenter.segment(source, {signal}); checkAbort(signal);
  assertAnalysisMask(analysis, source);
  const matte = thresholdAnalysisMask(analysis, threshold);
  const corrected = applyBlackWhiteEdgeRemoval(source, matte, {signal});
  const affected = new Uint8Array(matte.data.length);
  for (let i = 0; i < affected.length; i++) {
    if (!(i & 16383)) checkAbort(signal);
    const offset = i * 4;
    const amount = (included ? included[i] / 255 : 1) * (1 - (excluded ? excluded[i] / 255 : 0));
    let changed = false;
    for (let c = 0; c < 3; c++) {
      corrected.data[offset + c] = Math.round(source.data[offset + c] +
        (corrected.data[offset + c] - source.data[offset + c]) * amount);
      changed ||= corrected.data[offset + c] !== source.data[offset + c];
    }
    if (changed) affected[i] = 255;
  }
  return {pixels: corrected, subjectMask: matte,
    affectedMask: {width: source.width, height: source.height, data: affected},
    analysis: analysis.analysis ?? null};
}

export async function syncAutomaticBlackWhiteEdges(items, {segmenter, threshold = .5, signal,
  onProgress, maxResultPixels = 16_000_000} = {}) {
  if (!Array.isArray(items) || !items.length || items.length > 1000 ||
      items.some(x => typeof x?.id !== 'string' || !x.id.length) ||
      new Set(items.map(x => x.id)).size !== items.length ||
      !Number.isSafeInteger(maxResultPixels) || maxResultPixels < 1 || maxResultPixels > 32_000_000)
    throw Error('BW_EDGE_SYNC_ITEMS');
  const results = [];
  let retainedPixels = 0;
  for (const item of items) {
    checkAbort(signal);
    try {
      assertPixels(item.pixels);
      const count = item.pixels.width * item.pixels.height;
      if (retainedPixels + count > maxResultPixels) throw Error('BW_EDGE_SYNC_RESULT_CAPACITY');
      const result = await updateAutomaticBlackWhiteEdges(item.pixels, {segmenter, threshold, signal});
      results.push({id: item.id, status: 'processed', result});
      retainedPixels += count;
    } catch (error) {
      checkAbort(signal);
      results.push({id: item.id, status: 'failed', error: String(error?.message ?? error)});
    }
    if (onProgress) { try { onProgress({completed: results.length, total: items.length, id: item.id,
      status: results.at(-1).status}); } catch {} }
  }
  return results;
}
