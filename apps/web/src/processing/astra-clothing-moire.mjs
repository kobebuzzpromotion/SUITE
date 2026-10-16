import {assertPixels, checkAbort} from './pure.mjs';
import {createSubjectSegmenter, assertAnalysisMask} from './subject-segmentation.mjs';
import {createAstraImageModel} from './astra-image-model.mjs';

/** Fabric segmentation followed by a dedicated luminance+chroma de-moire model.
 * Ordinary denoising/sharpening is not advertised as AI fabric restoration.
 * The trained model is responsible for discriminating weave/folds from aliasing;
 * preserving them is a quality target, not something established by this code. */
export async function createClothingMoireRemoval({garmentModel, restorationModel} = {}, {signal} = {}) {
  if (restorationModel?.task !== 'clothing-moire-removal' || (restorationModel.outputScale ?? 1) !== 1)
    throw Error('CLOTHING_MOIRE_MODEL_TASK');
  const segmenter = await createSubjectSegmenter(garmentModel, {signal});
  let model;
  try { model = await createAstraImageModel(restorationModel, {signal}); }
  catch (error) { segmenter.close(); throw error; }
  let closed = false, busy = false;
  return Object.freeze({
    async generate(frame, {selectedGarment, protectionMask, strength = 1, seed = 0, controls = {}, signal} = {}) {
      assertPixels(frame); checkAbort(signal);
      if (closed || busy) throw Error(closed ? 'CLOTHING_MOIRE_CLOSED' : 'CLOTHING_MOIRE_BUSY');
      if (!Number.isFinite(strength) || strength < 0 || strength > 1 || frame.width * frame.height > 8_000_000)
        throw Error('CLOTHING_MOIRE_SETTINGS');
      if (selectedGarment) assertAnalysisMask(selectedGarment, frame);
      if (protectionMask) assertAnalysisMask(protectionMask, frame);
      const source = {width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data)};
      const selected = selectedGarment && new Uint8Array(selectedGarment.data);
      const protect = protectionMask && new Uint8Array(protectionMask.data), parameters = structuredClone(controls);
      busy = true;
      try {
        const semantic = await segmenter.segment(source, {signal}); checkAbort(signal);
        const mask = new Uint8Array(semantic.data);
        for (let i = 0; i < mask.length; i++) {
          if (!(i & 16383)) checkAbort(signal);
          mask[i] = source.data[i * 4 + 3] && mask[i] >= 128 ?
            Math.round(mask[i] * (selected ? selected[i] / 255 : 1) * (1 - (protect?.[i] ?? 0) / 255)) : 0;
        }
        if (!mask.some(Boolean) || !strength) return {pixels: source, status: 'no-change'};
        const generated = await model.run(source, {...(model.masked ? {mask} : {}), seed,
          controls: parameters, tiled: true, signal});
        checkAbort(signal); assertPixels(generated);
        if (generated.width !== source.width || generated.height !== source.height) throw Error('CLOTHING_MOIRE_OUTPUT_SHAPE');
        const data = new Uint8ClampedArray(source.data);
        for (let i = 0; i < mask.length; i++) {
          if (!(i & 16383)) checkAbort(signal);
          const amount = mask[i] / 255 * strength;
          for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(source.data[i * 4 + c] * (1 - amount) +
            generated.data[i * 4 + c] * amount);
        }
        return {pixels: {...source, data}, status: 'generated', mask: {width: source.width, height: source.height, data: mask},
          modelSHA256: model.modelSHA256, analysis: semantic.analysis, requiresCanonicalAssetPersistence: true};
      } finally { busy = false; }
    },
    async close() {
      if (busy) throw Error('CLOTHING_MOIRE_BUSY');
      if (!closed) { closed = true; segmenter.close(); await model.close(); }
    },
  });
}
