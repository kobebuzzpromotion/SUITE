/**
 * A deliberately narrow, unconnected HDR pixel foundation.
 *
 * Input channels are linear-light Rec.709/sRGB primaries in reference-white
 * units: 1.0 is SDR white, 2.0 is one stop above it. `sdrWhiteNits` records
 * the caller's reference white; it does not claim calibrated monitor output.
 * This module neither decodes RAW/HEIF nor writes an HDR-capable image format.
 */
export const HDR_COLOR_SPACE = 'LINEAR_SRGB_REC709';
export const HDR_SOURCE_ENCODING = 'HDR_LINEAR_FLOAT32';
export const MAX_HDR_PIXELS = 16_000_000;
export const MAX_HDR_CHANNEL = 65_504;

const storage = new WeakMap();
const FRAME_KEYS = new Set(['width', 'height', 'pixels', 'colorSpace', 'sdrWhiteNits', 'headroomStops', 'sourceEncoding', 'signal']);

function fail(code) {throw new Error(code);}
function abort(signal) {if (signal?.aborted) throw new DOMException('HDR_ABORTED', 'AbortError');}
function validSignal(signal) {
  if (signal !== undefined && (signal === null || typeof signal !== 'object' || typeof signal.aborted !== 'boolean')) fail('INVALID_HDR_SIGNAL');
}
function validShape(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length ||
      Reflect.ownKeys(input).some(key => !FRAME_KEYS.has(key))) fail('INVALID_HDR_FRAME_INPUT');
}

/**
 * Accepts only a caller-labelled floating HDR decode, never an RGBA8 buffer.
 * The label is an interface requirement, not independent proof of provenance;
 * source decoding/bit depth must be verified at the integration boundary.
 */
export function createHDRFrame(input) {
  validShape(input);
  const {width, height, pixels, colorSpace, sdrWhiteNits, headroomStops, sourceEncoding, signal} = input;
  validSignal(signal);
  abort(signal);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_HDR_PIXELS) fail('INVALID_HDR_DIMENSIONS');
  if (colorSpace !== HDR_COLOR_SPACE || sourceEncoding !== HDR_SOURCE_ENCODING) fail('UNSUPPORTED_HDR_ENCODING');
  if (!Number.isFinite(sdrWhiteNits) || sdrWhiteNits < 80 || sdrWhiteNits > 500) fail('INVALID_HDR_WHITE');
  if (!Number.isFinite(headroomStops) || headroomStops < 1 || headroomStops > 8) fail('INVALID_HDR_HEADROOM');
  if (!(pixels instanceof Float32Array) || pixels.length !== width * height * 3) fail('INVALID_HDR_PIXELS');
  const copy = new Float32Array(pixels.length);
  let hasHDRContent = false;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if ((offset & 0x3fff) === 0) abort(signal);
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[offset + channel];
      if (!Number.isFinite(value) || value < 0 || value > MAX_HDR_CHANNEL) fail('INVALID_HDR_CHANNEL');
      copy[offset + channel] = value;
      if (value > 1) hasHDRContent = true;
    }
  }
  abort(signal);
  const frame = Object.freeze({width, height, colorSpace, sdrWhiteNits, headroomStops, sourceEncoding,
    hasHDRContent, get pixels() {return new Float32Array(storage.get(frame));}});
  storage.set(frame, copy);
  return frame;
}

function srgbEncode(linear) {
  const bounded = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (bounded <= 0.0031308 ? 12.92 * bounded : 1.055 * bounded ** (1 / 2.4) - 0.055));
}

/**
 * SUITE's deterministic, SDR-only preview curve; not Adobe's proprietary
 * appearance mapping. SDR white maps to 75% linear display intensity, leaving
 * the remaining 25% for logarithmically compressed highlights up to headroom.
 * Values beyond display headroom clip in the preview; HDR source stays intact.
 */
export function toneMapSDRPreview(frame, {signal} = {}) {
  const pixels = storage.get(frame);
  if (!pixels) fail('INVALID_HDR_FRAME');
  validSignal(signal);
  abort(signal);
  const data = new Uint8ClampedArray(frame.width * frame.height * 4);
  const ceiling = 2 ** frame.headroomStops;
  let clippedPixels = 0;
  for (let i = 0, out = 0; i < pixels.length; i += 3, out += 4) {
    if ((i & 0x3fff) === 0) abort(signal);
    let clipped = false;
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[i + channel];
      clipped ||= value > ceiling;
      const bounded = Math.min(value, ceiling);
      const mapped = bounded <= 1 ? 0.75 * bounded : 0.75 + 0.25 * Math.log2(bounded) / frame.headroomStops;
      data[out + channel] = srgbEncode(mapped);
    }
    data[out + 3] = 255;
    if (clipped) clippedPixels++;
  }
  abort(signal);
  return {width: frame.width, height: frame.height, data, clippedPixels, format: 'SDR_SRGB_RGBA8_PREVIEW'};
}
