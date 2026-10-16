/**
 * A narrow TIFF 6.0 writer for an already rendered RGBA8 Final pixel buffer.
 * It does not decode RAW, preserve source metadata, or provide 16-bit precision.
 * TIFF 6.0: https://image-js.github.io/tiff/media/TIFF6.pdf
 */
export const MAX_TIFF_PIXELS = 16_000_000;
export const MAX_TIFF_BYTES = 120 * 1024 * 1024;

const SHORT = 3, LONG = 4, RATIONAL = 5;
const ALLOWED = new Set(['width', 'height', 'data', 'channels', 'bitsPerSample', 'byteOrder', 'resolution', 'signal']);
const align2 = value => value + (value & 1);
const error = code => {throw Error(code);};
const abort = signal => {if (signal?.aborted) throw new DOMException('TIFF_ABORTED', 'AbortError');};
function exactObject(value, keys, code) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length ||
      Reflect.ownKeys(value).some(key => !keys.has(key))) error(code);
}
function short(view, at, value, little) {view.setUint16(at, value, little);}
function long(view, at, value, little) {view.setUint32(at, value, little);}

/**
 * RGB output refuses transparent input rather than exposing hidden RGB.
 * RGBA uses ExtraSamples=2 (unassociated/straight alpha). Sixteen-bit samples
 * are exactly `sample8 * 257`; this expands an 8-bit lattice, not RAW precision.
 */
export function encodeTIFF(input) {
  exactObject(input, ALLOWED, 'INVALID_TIFF_INPUT');
  const {width, height, data, channels = 'RGBA', bitsPerSample = 8, byteOrder = 'II', resolution, signal} = input;
  if (signal !== undefined && (signal === null || typeof signal !== 'object' || typeof signal.aborted !== 'boolean')) error('INVALID_TIFF_SIGNAL');
  abort(signal);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_TIFF_PIXELS) error('INVALID_TIFF_DIMENSIONS');
  if (channels !== 'RGB' && channels !== 'RGBA') error('INVALID_TIFF_CHANNELS');
  if (bitsPerSample !== 8 && bitsPerSample !== 16) error('INVALID_TIFF_DEPTH');
  if (byteOrder !== 'II' && byteOrder !== 'MM') error('INVALID_TIFF_BYTE_ORDER');
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer) error('INVALID_TIFF_PIXELS');
  let xResolution = 1, yResolution = 1, resolutionUnit = 1;
  if (resolution !== undefined) {
    exactObject(resolution, new Set(['x', 'y', 'unit']), 'INVALID_TIFF_RESOLUTION');
    if (!Number.isSafeInteger(resolution.x) || !Number.isSafeInteger(resolution.y) ||
        resolution.x < 1 || resolution.y < 1 || resolution.x > 1_000_000 || resolution.y > 1_000_000 ||
        !['INCH', 'CENTIMETER'].includes(resolution.unit)) error('INVALID_TIFF_RESOLUTION');
    xResolution = resolution.x;
    yResolution = resolution.y;
    resolutionUnit = resolution.unit === 'INCH' ? 2 : 3;
  }
  const samples = channels === 'RGB' ? 3 : 4, sampleBytes = bitsPerSample / 8;
  const rowBytes = width * samples * sampleBytes, imageBytes = rowBytes * height;
  const rowsPerStrip = Math.max(1, Math.floor(8192 / rowBytes));
  const strips = Math.ceil(height / rowsPerStrip);
  const entryCount = channels === 'RGBA' ? 14 : 13;
  const ifdOffset = 8, ifdBytes = 2 + entryCount * 12 + 4;
  let cursor = ifdOffset + ifdBytes;
  function reserve(length) {cursor = align2(cursor); const at = cursor; cursor += length; return at;}
  const bitsOffset = reserve(samples * 2);
  const stripOffsetsOffset = strips > 1 ? reserve(strips * 4) : 0;
  const stripByteCountsOffset = strips > 1 ? reserve(strips * 4) : 0;
  const xResolutionOffset = reserve(8), yResolutionOffset = reserve(8);
  const pixelOffset = align2(cursor), totalBytes = pixelOffset + imageBytes;
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TIFF_BYTES || totalBytes > 0xffffffff) error('TIFF_CAPACITY_EXCEEDED');
  if (data.length !== width * height * 4) error('INVALID_TIFF_PIXELS');
  // Preflight before allocating the output; a discarded alpha channel is never silent.
  if (channels === 'RGB') for (let i = 3; i < data.length; i += 4) {
    if ((i & 0x3fff) === 3) abort(signal);
    if (data[i] !== 255) error('TIFF_ALPHA_WOULD_BE_LOST');
  }
  abort(signal);
  const bytes = new Uint8Array(totalBytes), view = new DataView(bytes.buffer);
  const little = byteOrder === 'II';
  bytes[0] = bytes[1] = little ? 0x49 : 0x4d;
  short(view, 2, 42, little);
  long(view, 4, ifdOffset, little);
  short(view, ifdOffset, entryCount, little);
  const fields = [
    [256, LONG, 1, width], [257, LONG, 1, height],
    [258, SHORT, samples, bitsOffset], [259, SHORT, 1, 1],
    [262, SHORT, 1, 2], [273, LONG, strips, strips === 1 ? pixelOffset : stripOffsetsOffset],
    [277, SHORT, 1, samples], [278, LONG, 1, rowsPerStrip],
    [279, LONG, strips, strips === 1 ? imageBytes : stripByteCountsOffset],
    [282, RATIONAL, 1, xResolutionOffset], [283, RATIONAL, 1, yResolutionOffset],
    [284, SHORT, 1, 1], [296, SHORT, 1, resolutionUnit]
  ];
  if (channels === 'RGBA') fields.push([338, SHORT, 1, 2]);
  for (let n = 0; n < fields.length; n++) {
    const [tag, type, count, value] = fields[n], at = ifdOffset + 2 + n * 12;
    short(view, at, tag, little);
    short(view, at + 2, type, little);
    long(view, at + 4, count, little);
    if (type === SHORT && count === 1) short(view, at + 8, value, little);
    else long(view, at + 8, value, little);
  }
  long(view, ifdOffset + 2 + fields.length * 12, 0, little);
  for (let sample = 0; sample < samples; sample++) short(view, bitsOffset + sample * 2, bitsPerSample, little);
  long(view, xResolutionOffset, xResolution, little); long(view, xResolutionOffset + 4, 1, little);
  long(view, yResolutionOffset, yResolution, little); long(view, yResolutionOffset + 4, 1, little);
  for (let strip = 0; strip < strips; strip++) {
    abort(signal);
    const row = strip * rowsPerStrip, rows = Math.min(rowsPerStrip, height - row);
    if (strips > 1) {
      long(view, stripOffsetsOffset + strip * 4, pixelOffset + row * rowBytes, little);
      long(view, stripByteCountsOffset + strip * 4, rows * rowBytes, little);
    }
  }
  for (let pixel = 0; pixel < width * height; pixel++) {
    if ((pixel & 0x3fff) === 0) abort(signal);
    const source = pixel * 4, target = pixelOffset + pixel * samples * sampleBytes;
    for (let component = 0; component < samples; component++) {
      const value = data[source + component];
      if (bitsPerSample === 8) bytes[target + component] = value;
      else short(view, target + component * 2, value * 257, little);
    }
  }
  abort(signal);
  return {bytes, mimeType: 'image/tiff', bitDepthProvenance: bitsPerSample === 8 ? 'RGBA8_SOURCE' : 'RGBA8_EXPANDED_TO_16',
    channels, bitsPerSample, byteOrder};
}
