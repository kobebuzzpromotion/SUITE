import {assertPixels, checkAbort} from './pure.mjs';
import {createSubjectSegmenter, assertAnalysisMask} from './subject-segmentation.mjs';
import {createMaskedInpaintONNX} from './masked-inpaint-onnx.mjs';

/** Body-hair-specific segmentation + selected skin region + real local inpaint.
 * Dedicated labels/models are required: scalp hair or dark-line heuristics are
 * not substituted for body hair. A host may limit the model to arms explicitly.
 * No photo is transmitted, persisted, or billed by this processing module. */
export async function createBodyHairRemoval({hairModel, skinModel, inpainting,
  supportedRegion} = {}, {signal} = {}) {
  if (!['arms', 'legs', 'body'].includes(supportedRegion)) throw Error('BODY_HAIR_REGION_CONTRACT_REQUIRED');
  const hair = await createSubjectSegmenter(hairModel, {signal});
  let skin, model;
  try {
    skin = await createSubjectSegmenter(skinModel, {signal});
    model = await createMaskedInpaintONNX(inpainting, {signal});
  } catch (error) { hair.close(); skin?.close(); throw error; }
  let closed = false, busy = false;
  return Object.freeze({
    async generate(frame, {region, selectedRegion, protectionMask, strength = 1, signal} = {}) {
      assertPixels(frame); checkAbort(signal);
      if (closed || busy) throw Error(closed ? 'BODY_HAIR_CLOSED' : 'BODY_HAIR_BUSY');
      if (region !== supportedRegion || !Number.isFinite(strength) || strength < 0 || strength > 1 ||
          frame.width * frame.height > 8_000_000) throw Error('BODY_HAIR_SETTINGS');
      assertAnalysisMask(selectedRegion, frame);
      if (protectionMask) assertAnalysisMask(protectionMask, frame);
      const source = {width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data)};
      const selected = new Uint8Array(selectedRegion.data), protect = protectionMask && new Uint8Array(protectionMask.data);
      busy = true;
      try {
        const hairResult = await hair.segment(source, {signal}); checkAbort(signal);
        const skinResult = await skin.segment(source, {signal}); checkAbort(signal);
        const data = new Uint8Array(selected.length);
        for (let i = 0; i < data.length; i++) {
          if (!(i & 16383)) checkAbort(signal);
          // The skin model must include hair-bearing skin, not only bare pixels.
          if (!source.data[i * 4 + 3] || skinResult.data[i] < 128 || hairResult.data[i] < 128) continue;
          data[i] = Math.round(selected[i] * (1 - (protect?.[i] ?? 0) / 255));
        }
        const mask = {width: source.width, height: source.height, data};
        if (!data.some(Boolean) || strength === 0) return {pixels: source, mask, status: 'no-change'};
        const generated = await model.inpaint(source, mask, {signal}); checkAbort(signal);
        const output = new Uint8ClampedArray(source.data);
        for (let i = 0; i < data.length; i++) {
          if (!(i & 16383)) checkAbort(signal);
          if (!data[i]) continue;
          for (let c = 0; c < 3; c++) output[i * 4 + c] = Math.round(source.data[i * 4 + c] +
            (generated.data[i * 4 + c] - source.data[i * 4 + c]) * strength);
        }
        return {pixels: {...source, data: output}, mask, status: 'generated', modelSHA256: model.modelSHA256,
          analysis: {hair: hairResult.analysis, skin: skinResult.analysis}, requiresCanonicalAssetPersistence: true};
      } finally { busy = false; }
    },
    async close() {
      if (busy) throw Error('BODY_HAIR_BUSY');
      if (!closed) { closed = true; hair.close(); skin.close(); await model.close(); }
    },
  });
}
