import {assertPixels, checkAbort} from './pure.mjs';
import {assertAnalysisMask, thresholdAnalysisMask} from './subject-segmentation.mjs';

const snapshot = p => ({width: p.width, height: p.height, data: new Uint8ClampedArray(p.data)});
const errorCode = error => String(error?.message ?? error);
async function frameDigest(p) {
  const header = new Uint32Array([p.width, p.height]);
  const bytes = new Uint8Array(header.byteLength + p.data.byteLength);
  bytes.set(new Uint8Array(header.buffer)); bytes.set(p.data, header.byteLength);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0')).join('');
}

/** AI Lab People Removal, not a Recipe-copy batch. Generates separate candidate
 * frames in memory; never overwrites/saves an Original. Host must authorize each
 * load, and later persist an explicitly accepted candidate as a derived asset.
 * The segmenter and inpainter have actual local implementations in
 * subject-segmentation.mjs and masked-inpaint-onnx.mjs; weights are host assets. */
export function createPeopleRemovalBatch({segmenter, inpainter, maxRetainedPixels = 16_000_000} = {}) {
  if (typeof segmenter?.segment !== 'function' || typeof inpainter?.inpaint !== 'function' ||
      !Number.isSafeInteger(maxRetainedPixels) || maxRetainedPixels < 1 || maxRetainedPixels > 32_000_000)
    throw Error('PEOPLE_REMOVAL_DEPENDENCIES');
  let running = false, retained = 0, runNumber = 0;
  const candidates = new Map();
  return Object.freeze({
    async run(items, {signal, onProgress} = {}) {
      if (running) throw Error('PEOPLE_REMOVAL_BATCH_BUSY');
      if (!Array.isArray(items) || !items.length || items.length > 1000 ||
          items.some(x => typeof x?.id !== 'string' || !x.id || typeof x.load !== 'function' ||
            !['all-detected', 'selected-mask'].includes(x.selection)) ||
          new Set(items.map(x => x.id)).size !== items.length) throw Error('PEOPLE_REMOVAL_BATCH_ITEMS');
      // Freeze request order/selection before the first await. load is the only
      // photo acquisition boundary, permitting bounded sequential decoding.
      const requests = items.map(x => ({id: x.id, load: x.load, selection: x.selection}));
      const results = [], generation = ++runNumber;
      running = true;
      try {
        for (const item of requests) {
          if (signal?.aborted) {
            results.push({id: item.id, status: 'cancelled'}); continue;
          }
          let row;
          try {
            const loaded = await item.load({signal}); checkAbort(signal);
            assertPixels(loaded?.pixels);
            const pixels = snapshot(loaded.pixels), count = pixels.width * pixels.height;
            if (count > 8_000_000 || retained + count > maxRetainedPixels) throw Error('PEOPLE_REMOVAL_RESULT_CAPACITY');
            // Binding is a stale-result key, not a substitute for host authority.
            if (typeof loaded.originalSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(loaded.originalSHA256) ||
                !Number.isSafeInteger(loaded.revision) || loaded.revision < 1) throw Error('PEOPLE_REMOVAL_SOURCE_BINDING');
            const binding = {id: item.id, originalSHA256: loaded.originalSHA256, revision: loaded.revision};
            let selected;
            if (item.selection === 'selected-mask') {
              assertAnalysisMask(loaded.selectedMask, pixels);
              selected = {width: pixels.width, height: pixels.height, data: new Uint8Array(loaded.selectedMask.data)};
            }
            let keep;
            if (loaded.keepMask) { assertAnalysisMask(loaded.keepMask, pixels); keep = new Uint8Array(loaded.keepMask.data); }
            const detected = await segmenter.segment(pixels, {signal}); checkAbort(signal);
            assertAnalysisMask(detected, pixels);
            const mask = thresholdAnalysisMask(detected);
            let changed = 0;
            for (let i = 0; i < mask.data.length; i++) {
              if (!(i & 16383)) checkAbort(signal);
              if (!pixels.data[i * 4 + 3] || (selected && !selected.data[i]) || (keep && keep[i])) mask.data[i] = 0;
              if (mask.data[i]) changed++;
            }
            if (!changed) { row = {id: item.id, status: 'no-target'}; }
            else {
              if (changed === count) throw Error('PEOPLE_REMOVAL_NO_BACKGROUND_CONTEXT');
              const sourceFrameSHA256 = await frameDigest(pixels); checkAbort(signal);
              const result = await inpainter.inpaint(pixels, mask, {signal}); checkAbort(signal);
              assertPixels(result);
              if (result.width !== pixels.width || result.height !== pixels.height) throw Error('PEOPLE_REMOVAL_RESULT_DIMENSIONS');
              // Bound the effect even if another host inpainting adapter is used.
              const output = snapshot(pixels);
              for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) {
                output.data[i * 4] = result.data[i * 4];
                output.data[i * 4 + 1] = result.data[i * 4 + 1];
                output.data[i * 4 + 2] = result.data[i * 4 + 2];
              }
              const candidateID = `${generation}:${item.id}`;
              candidates.set(candidateID, {binding, sourceFrameSHA256, pixels: output,
                modelSHA256: inpainter.modelSHA256 ?? null});
              retained += count;
              row = {id: item.id, status: 'generated', candidateID, changedPixels: changed};
            }
          } catch (error) {
            row = {id: item.id, status: signal?.aborted ? 'cancelled' : 'failed', error: errorCode(error)};
          }
          results.push(row);
          // Progress display must not convert generated results into failures.
          if (onProgress) { try { onProgress({...row, completed: results.length, total: requests.length}); } catch {} }
        }
        return results;
      } finally { running = false; }
    },
    preview(candidateID) {
      const c = candidates.get(candidateID);
      if (!c) throw Error('PEOPLE_REMOVAL_CANDIDATE_NOT_FOUND');
      return {pixels: snapshot(c.pixels), binding: {...c.binding}, sourceFrameSHA256: c.sourceFrameSHA256};
    },
    accept(candidateID, current) {
      const c = candidates.get(candidateID);
      if (!c) throw Error('PEOPLE_REMOVAL_CANDIDATE_NOT_FOUND');
      if (!current || Object.keys(c.binding).some(k => current[k] !== c.binding[k]) ||
          current.sourceFrameSHA256 !== c.sourceFrameSHA256) throw Error('PEOPLE_REMOVAL_STALE_CANDIDATE');
      const accepted = {kind: 'derived-people-removal', pixels: snapshot(c.pixels),
        binding: {...c.binding}, sourceFrameSHA256: c.sourceFrameSHA256, modelSHA256: c.modelSHA256};
      retained -= c.pixels.width * c.pixels.height; candidates.delete(candidateID);
      return accepted; // No save/charge/network side effect.
    },
    discard(candidateID) {
      const c = candidates.get(candidateID);
      if (c) { retained -= c.pixels.width * c.pixels.height; candidates.delete(candidateID); }
    },
    clear() {
      if (running) throw Error('PEOPLE_REMOVAL_BATCH_BUSY');
      candidates.clear(); retained = 0;
    },
  });
}
