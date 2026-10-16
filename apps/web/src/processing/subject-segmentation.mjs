import {ImageSegmenter, FilesetResolver} from '@mediapipe/tasks-vision';
import {assertPixels, checkAbort} from './pure.mjs';

// Model bytes, their expected digest and semantic labels must come from the
// application's model inventory. No download, remote inference or guessed class
// number is performed here. This is analysis, NOT an authorization attestation.
export async function createSubjectSegmenter({modelAssetBuffer, modelSHA256,
  foregroundLabels, wasmRoot = '/vendor/mediapipe/'} = {}, {signal} = {}) {
  checkAbort(signal);
  if (!(modelAssetBuffer instanceof Uint8Array) || !modelAssetBuffer.length ||
      modelAssetBuffer.length > 256 * 1024 * 1024 ||
      typeof modelSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(modelSHA256) ||
      !Array.isArray(foregroundLabels) || !foregroundLabels.length ||
      foregroundLabels.some(x => typeof x !== 'string' || !x.length) ||
      new Set(foregroundLabels).size !== foregroundLabels.length)
    throw Error('SEGMENTER_MODEL_CONTRACT_INVALID');
  const bytes = new Uint8Array(modelAssetBuffer), requested = [...foregroundLabels];
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2, '0')).join('');
  checkAbort(signal);
  if (digest !== modelSHA256.toLowerCase()) throw Error('SEGMENTER_MODEL_DIGEST_MISMATCH');
  const files = await FilesetResolver.forVisionTasks(wasmRoot);
  checkAbort(signal);
  const detector = await ImageSegmenter.createFromOptions(files, {
    baseOptions: {modelAssetBuffer: bytes, delegate: 'CPU'}, runningMode: 'IMAGE',
    outputConfidenceMasks: true, outputCategoryMask: false,
  });
  const labels = detector.getLabels();
  const indices = requested.map(label => labels.indexOf(label));
  if (indices.some(i => i < 0) || labels.length !== new Set(labels).size) {
    detector.close(); throw Error('SEGMENTER_SEMANTIC_LABELS_MISSING');
  }
  let closed = false;
  return Object.freeze({
    async segment(pixels, {signal} = {}) {
      assertPixels(pixels); checkAbort(signal);
      if (closed) throw Error('SEGMENTER_CLOSED');
      const {width, height} = pixels;
      if (width * height > 8_000_000) throw Error('SEGMENTER_CAPACITY');
      if (typeof OffscreenCanvas === 'undefined') throw Error('SEGMENTER_CANVAS_UNAVAILABLE');
      const source = new Uint8ClampedArray(pixels.data);
      const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
      if (!context) throw Error('SEGMENTER_CANVAS_UNAVAILABLE');
      context.putImageData(new ImageData(source, width, height), 0, 0);
      const result = detector.segment(canvas);
      try {
        checkAbort(signal);
        const masks = indices.map(i => result.confidenceMasks?.[i]);
        if (masks.some(m => !m || m.width < 1 || m.height < 1))
          throw Error('SEGMENTER_RESULT_INVALID');
        const planes = masks.map(m => m.getAsFloat32Array());
        if (planes.some((p, i) => p.length !== masks[i].width * masks[i].height ||
            p.some(v => !Number.isFinite(v) || v < 0 || v > 1)))
          throw Error('SEGMENTER_CONFIDENCE_INVALID');
        const data = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
          if (!(y & 31)) checkAbort(signal);
          for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (!source[i * 4 + 3]) continue;
            let probability = 0;
            for (let k = 0; k < masks.length; k++) {
              const m = masks[k], p = planes[k];
              const xx = Math.max(0, Math.min(m.width - 1, (x + .5) * m.width / width - .5));
              const yy = Math.max(0, Math.min(m.height - 1, (y + .5) * m.height / height - .5));
              const a = Math.floor(xx), b = Math.floor(yy), u = xx - a, v = yy - b;
              const c = Math.min(a + 1, m.width - 1), d = Math.min(b + 1, m.height - 1);
              probability += (p[b * m.width + a] * (1 - u) + p[b * m.width + c] * u) * (1 - v) +
                (p[d * m.width + a] * (1 - u) + p[d * m.width + c] * u) * v;
            }
            data[i] = Math.round(Math.min(1, probability) * 255);
          }
        }
        return {width, height, data, analysis: {modelSHA256: digest, labels: [...requested],
          source: 'mediapipe-image-segmenter', authorization: 'not-attested'}};
      } finally { result.close(); }
    },
    close() { if (!closed) { closed = true; detector.close(); } },
  });
}

export function assertAnalysisMask(mask, pixels) {
  assertPixels(pixels);
  if (!mask || mask.width !== pixels.width || mask.height !== pixels.height ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== pixels.width * pixels.height)
    throw Error('ANALYSIS_MASK_INVALID');
}

// Probability threshold is an explicit editing parameter, never a claim that
// all people or clothing have been correctly identified.
export function thresholdAnalysisMask(mask, threshold = .5) {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1 ||
      !Number.isSafeInteger(mask?.width) || !Number.isSafeInteger(mask?.height) ||
      mask.width < 1 || mask.height < 1 || mask.width * mask.height > 8_000_000 ||
      !(mask.data instanceof Uint8Array || mask.data instanceof Uint8ClampedArray) ||
      mask.data.length !== mask.width * mask.height) throw Error('ANALYSIS_THRESHOLD_INVALID');
  return {width: mask.width, height: mask.height,
    data: Uint8Array.from(mask.data, x => x >= threshold * 255 ? 255 : 0)};
}
