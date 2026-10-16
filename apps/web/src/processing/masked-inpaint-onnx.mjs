import {assertPixels, checkAbort} from './pure.mjs';
import {assertAnalysisMask} from './subject-segmentation.mjs';

/** Actual local inference adapter for a TWO INPUT NCHW float32 image+mask
 * inpainting model. No model, runtime binary or license is bundled here.
 * Host supplies ONNX Runtime and a digest-pinned model plus its documented IO
 * contract; this does not turn a generic inpainting model into a dental model.
 * API: https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.html */
export async function createMaskedInpaintONNX({ort, modelAssetBuffer, modelSHA256,
  imageInput, maskInput, imageOutput, width, height, inputRange, outputRange,
  maskMeaning, sessionOptions = {executionProviders: ['wasm']}} = {}, {signal} = {}) {
  checkAbort(signal);
  const range = x => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite) && x[1] > x[0];
  if (typeof ort?.InferenceSession?.create !== 'function' || typeof ort?.Tensor !== 'function' ||
      !(modelAssetBuffer instanceof Uint8Array) || !modelAssetBuffer.length ||
      modelAssetBuffer.length > 512 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/i.test(modelSHA256 ?? '') ||
      ![imageInput, maskInput, imageOutput].every(x => typeof x === 'string' && x.length) ||
      imageInput === maskInput || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 8 || height < 8 || width * height > 4_194_304 ||
      !range(inputRange) || !range(outputRange) || !['hole-is-one', 'keep-is-one'].includes(maskMeaning))
    throw Error('INPAINT_MODEL_CONTRACT_INVALID');
  const bytes = new Uint8Array(modelAssetBuffer), low = inputRange[0], high = inputRange[1];
  const outLow = outputRange[0], outHigh = outputRange[1];
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2, '0')).join('');
  checkAbort(signal);
  if (hash !== modelSHA256.toLowerCase()) throw Error('INPAINT_MODEL_DIGEST_MISMATCH');
  const session = await ort.InferenceSession.create(bytes, sessionOptions);
  if (session.inputNames.length !== 2 || !session.inputNames.includes(imageInput) ||
      !session.inputNames.includes(maskInput) || !session.outputNames.includes(imageOutput)) {
    await session.release(); throw Error('INPAINT_MODEL_IO_MISMATCH');
  }
  let closed = false, busy = false;
  return Object.freeze({
    modelSHA256: hash,
    async inpaint(pixels, mask, {signal} = {}) {
      assertPixels(pixels); assertAnalysisMask(mask, pixels); checkAbort(signal);
      if (closed || busy) throw Error(closed ? 'INPAINT_CLOSED' : 'INPAINT_BUSY');
      if (pixels.width * pixels.height > 8_000_000) throw Error('INPAINT_CAPACITY');
      const source = new Uint8ClampedArray(pixels.data), hole = new Uint8Array(mask.data);
      const output = new Uint8ClampedArray(source), n = width * height;
      if (!hole.some(Boolean)) return {width: pixels.width, height: pixels.height, data: output};
      // Letterbox into the model grid; do not distort the source geometry.
      const scale = Math.min(width / pixels.width, height / pixels.height);
      const rw = Math.max(1, Math.round(pixels.width * scale));
      const rh = Math.max(1, Math.round(pixels.height * scale));
      const left = Math.floor((width - rw) / 2), top = Math.floor((height - rh) / 2);
      const rgb = new Float32Array(n * 3), maskTensor = new Float32Array(n);
      for (let y = 0; y < height; y++) {
        if (!(y & 31)) checkAbort(signal);
        for (let x = 0; x < width; x++) {
          const sx = Math.min(pixels.width - 1, Math.max(0, Math.floor((x - left + .5) * pixels.width / rw)));
          const sy = Math.min(pixels.height - 1, Math.max(0, Math.floor((y - top + .5) * pixels.height / rh)));
          const p = sy * pixels.width + sx, i = y * width + x;
          const inside = x >= left && x < left + rw && y >= top && y < top + rh;
          const m = inside && source[p * 4 + 3] ? hole[p] / 255 : 0;
          maskTensor[i] = maskMeaning === 'hole-is-one' ? m : 1 - m;
          for (let c = 0; c < 3; c++) rgb[c * n + i] = low +
            (source[p * 4 + 3] ? source[p * 4 + c] / 255 : 0) * (high - low);
        }
      }
      // Conservative mask projection: a small selected area must not disappear
      // between nearest samples when the photograph is larger than the model.
      if (rw < pixels.width || rh < pixels.height) {
        const projected = new Float32Array(n);
        for (let sy = 0; sy < pixels.height; sy++) {
          if (!(sy & 31)) checkAbort(signal);
          for (let sx = 0; sx < pixels.width; sx++) {
            const p = sy * pixels.width + sx;
            if (!hole[p] || !source[p * 4 + 3]) continue;
            const x = left + Math.min(rw - 1, Math.floor((sx + .5) * rw / pixels.width));
            const y = top + Math.min(rh - 1, Math.floor((sy + .5) * rh / pixels.height));
            projected[y * width + x] = Math.max(projected[y * width + x], hole[p] / 255);
          }
        }
        for (let i = 0; i < n; i++) maskTensor[i] = maskMeaning === 'hole-is-one' ?
          Math.max(maskTensor[i], projected[i]) : Math.min(maskTensor[i], 1 - projected[i]);
      }
      const image = new ort.Tensor('float32', rgb, [1, 3, height, width]);
      const holes = new ort.Tensor('float32', maskTensor, [1, 1, height, width]);
      let results;
      busy = true;
      try {
        checkAbort(signal);
        results = await session.run({[imageInput]: image, [maskInput]: holes}, [imageOutput]);
        checkAbort(signal); // Runtime inference itself need not support cancellation.
        const result = results[imageOutput];
        if (!result || result.type !== 'float32' ||
            result.dims.length !== 4 || result.dims.some((v, i) => v !== [1, 3, height, width][i]) ||
            !(result.data instanceof Float32Array) || result.data.length !== 3 * n ||
            result.data.some(v => !Number.isFinite(v))) throw Error('INPAINT_RESULT_INVALID');
        const data = result.data;
        for (let y = 0; y < pixels.height; y++) {
          if (!(y & 31)) checkAbort(signal);
          for (let x = 0; x < pixels.width; x++) {
            const p = y * pixels.width + x, amount = hole[p] / 255;
            if (!amount || !source[p * 4 + 3]) continue;
            const xx = Math.min(left + rw - 1, Math.max(left, left + (x + .5) * rw / pixels.width - .5));
            const yy = Math.min(top + rh - 1, Math.max(top, top + (y + .5) * rh / pixels.height - .5));
            const a = Math.floor(xx), b = Math.floor(yy), c1 = Math.min(a + 1, width - 1);
            const d = Math.min(b + 1, height - 1), u = xx - a, v = yy - b;
            for (let c = 0; c < 3; c++) {
              const start = c * n;
              const value = (data[start + b * width + a] * (1 - u) + data[start + b * width + c1] * u) * (1 - v) +
                (data[start + d * width + a] * (1 - u) + data[start + d * width + c1] * u) * v;
              const code = Math.max(0, Math.min(255, (value - outLow) / (outHigh - outLow) * 255));
              output[p * 4 + c] = Math.round(source[p * 4 + c] * (1 - amount) + code * amount);
            }
          }
        }
        return {width: pixels.width, height: pixels.height, data: output};
      } finally {
        for (const tensor of Object.values(results ?? {})) tensor.dispose?.();
        image.dispose?.(); holes.dispose?.(); busy = false;
      }
    },
    async close() {
      if (busy) throw Error('INPAINT_BUSY');
      if (!closed) { closed = true; await session.release(); }
    },
  });
}
