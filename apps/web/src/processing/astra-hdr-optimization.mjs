import {createHDRFrame, HDR_COLOR_SPACE, HDR_SOURCE_ENCODING} from './hdr-frame.mjs';
import {checkAbort} from './pure.mjs';

/** Scene-linear HDR optimization. Never reinterpret 8-bit SDR as captured HDR.
 * Independent global exposure/shoulder algorithm, not another editor's model.
 * A decoded Float32 frame retains values above SDR white through this stage. */
export function optimizeHDR(frame, {exposure = 0, autoExposure = false, key = .18,
  highlightCompression = .5, saturation = 1, signal} = {}) {
  if (!Number.isFinite(exposure) || exposure < -8 || exposure > 8 ||
      typeof autoExposure !== 'boolean' || !Number.isFinite(key) || key < .02 || key > 1 ||
      !Number.isFinite(highlightCompression) || highlightCompression < 0 || highlightCompression > 1 ||
      !Number.isFinite(saturation) || saturation < 0 || saturation > 2) throw Error('HDR_OPTIMIZATION_SETTINGS');
  const verified = createHDRFrame({width: frame?.width, height: frame?.height,
    pixels: frame?.pixels, colorSpace: frame?.colorSpace, sdrWhiteNits: frame?.sdrWhiteNits,
    headroomStops: frame?.headroomStops, sourceEncoding: frame?.sourceEncoding, signal});
  const source = verified.pixels, pixels = new Float32Array(source.length);
  let logSum = 0, nonblack = 0;
  for (let i = 0; i < source.length; i += 3) {
    if (!(i & 16383)) checkAbort(signal);
    const y = .2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2];
    if (y > 1e-6) { logSum += Math.log(y); nonblack++; }
  }
  const automatic = autoExposure && nonblack ? Math.max(-4, Math.min(4,
    Math.log2(key / Math.exp(logSum / nonblack)))) : 0;
  const gain = 2 ** (exposure + automatic), ceiling = 2 ** frame.headroomStops;
  let compressedPixels = 0, gamutLimitedPixels = 0;
  for (let i = 0; i < source.length; i += 3) {
    if (!(i & 16383)) checkAbort(signal);
    const r = source[i] * gain, g = source[i + 1] * gain, b = source[i + 2] * gain;
    const y = .2126 * r + .7152 * g + .0722 * b;
    // Continuous shoulder above reference white; a zero setting leaves HDR
    // highlights unchanged rather than silently tone mapping them to SDR.
    const mapped = y <= 1 || !highlightCompression ? y :
      1 + (y - 1) / (1 + highlightCompression * (y - 1) / (ceiling - 1));
    if (mapped < y) compressedPixels++;
    const ratio = y > 1e-12 ? mapped / y : 1;
    const values = [r, g, b].map(v => Math.max(0, mapped + (v * ratio - mapped) * saturation));
    const peak = Math.max(...values), limit = peak > ceiling ? ceiling / peak : 1;
    if (limit < 1) gamutLimitedPixels++;
    for (let c = 0; c < 3; c++) pixels[i + c] = values[c] * limit;
  }
  return {frame: createHDRFrame({width: frame.width, height: frame.height, pixels,
    colorSpace: HDR_COLOR_SPACE, sourceEncoding: HDR_SOURCE_ENCODING,
    sdrWhiteNits: frame.sdrWhiteNits, headroomStops: frame.headroomStops, signal}),
    report: {appliedExposureStops: exposure + automatic, compressedPixels, gamutLimitedPixels,
      algorithm: 'suite-linear-hdr-exposure-shoulder-1'}};
}
