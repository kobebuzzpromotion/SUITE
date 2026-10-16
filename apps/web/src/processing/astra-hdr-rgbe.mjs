import {createHDRFrame, HDR_COLOR_SPACE, HDR_SOURCE_ENCODING, MAX_HDR_PIXELS} from './hdr-frame.mjs';
import {checkAbort} from './pure.mjs';

// Radiance RGBE file IO, not HEIF/AVIF/RAW decoding or display calibration.
// Reference format: https://radsite.lbl.gov/radiance/refer/filefmts.pdf
// Supports standard -Y +X orientation, flat and modern per-channel RLE.
// Unsupported colorimetry/exposure/orientation is rejected, never guessed.
const PRIMARIES = '0.6400 0.3300 0.3000 0.6000 0.1500 0.0600 0.3127 0.3290';
export function decodeRadianceHDR(input, {sdrWhiteNits = 203, headroomStops = 4,
  assumeRec709 = false, signal} = {}) {
  if (!(input instanceof Uint8Array) || input.length > 96 * 1024 * 1024) throw Error('RGBE_INPUT');
  const bytes = new Uint8Array(input); let position = 0;
  const line = () => {
    const start = position;
    while (position < bytes.length && bytes[position] !== 10 && position - start < 8192) position++;
    if (position >= bytes.length || position - start >= 8192) throw Error('RGBE_HEADER');
    return new TextDecoder('ascii').decode(bytes.subarray(start, position++)).replace(/\r$/, '');
  };
  if (!['#?RADIANCE', '#?RGBE'].includes(line())) throw Error('RGBE_SIGNATURE');
  let format = false, rec709 = false, headerBytes = 0;
  for (;;) {
    const value = line(); headerBytes += value.length;
    if (headerBytes > 32768) throw Error('RGBE_HEADER_CAPACITY');
    if (!value) break;
    if (value.startsWith('FORMAT=')) { if (value !== 'FORMAT=32-bit_rle_rgbe') throw Error('RGBE_FORMAT'); format = true; }
    if (value.startsWith('PRIMARIES=')) {
      const values = value.slice(10).trim().split(/\s+/).map(Number);
      const expected = PRIMARIES.split(' ').map(Number);
      if (values.length !== 8 || values.some((v, i) => !Number.isFinite(v) || Math.abs(v - expected[i]) > .0001))
        throw Error('RGBE_PRIMARIES_UNSUPPORTED');
      rec709 = true;
    }
    if (value.startsWith('EXPOSURE=') && Number(value.slice(9)) !== 1) throw Error('RGBE_EXPOSURE_UNSUPPORTED');
    if (value.startsWith('COLORCORR=') && value.slice(10).trim().split(/\s+/).some(v => Number(v) !== 1))
      throw Error('RGBE_COLORCORR_UNSUPPORTED');
  }
  if (!format || (!rec709 && !assumeRec709)) throw Error('RGBE_COLORSPACE_REQUIRED');
  const match = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!match) throw Error('RGBE_ORIENTATION_UNSUPPORTED');
  const height = Number(match[1]), width = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_HDR_PIXELS) throw Error('RGBE_DIMENSIONS');
  const pixels = new Float32Array(width * height * 3), scanline = new Uint8Array(width * 4);
  const next = () => { if (position >= bytes.length) throw Error('RGBE_TRUNCATED'); return bytes[position++]; };
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    const a = next(), b = next(), c = next(), d = next();
    if (width >= 8 && width <= 32767 && a === 2 && b === 2 && !(c & 128)) {
      if ((c << 8 | d) !== width) throw Error('RGBE_SCANLINE_WIDTH');
      for (let channel = 0; channel < 4; channel++) {
        let x = 0;
        while (x < width) {
          const code = next(), count = code > 128 ? code - 128 : code;
          if (!count || x + count > width) throw Error('RGBE_RLE');
          if (code > 128) { const value = next(); for (let k = 0; k < count; k++) scanline[(x++) * 4 + channel] = value; }
          else for (let k = 0; k < count; k++) scanline[(x++) * 4 + channel] = next();
        }
      }
    } else {
      scanline.set([a, b, c, d]);
      for (let i = 4; i < scanline.length; i++) scanline[i] = next();
      for (let x = 0; x < width; x++) if (scanline[x * 4] === 1 && scanline[x * 4 + 1] === 1 && scanline[x * 4 + 2] === 1)
        throw Error('RGBE_LEGACY_RUN_UNSUPPORTED');
    }
    for (let x = 0; x < width; x++) {
      const offset = x * 4, exponent = scanline[offset + 3], factor = exponent ? 2 ** (exponent - 136) : 0;
      for (let channel = 0; channel < 3; channel++) pixels[(y * width + x) * 3 + channel] =
        exponent ? (scanline[offset + channel] + .5) * factor : 0;
    }
  }
  if (position !== bytes.length) throw Error('RGBE_TRAILING_DATA');
  return createHDRFrame({width, height, pixels, colorSpace: HDR_COLOR_SPACE,
    sourceEncoding: HDR_SOURCE_ENCODING, sdrWhiteNits, headroomStops, signal});
}

export function encodeRadianceHDR(frame, {signal} = {}) {
  const source = createHDRFrame({width: frame?.width, height: frame?.height, pixels: frame?.pixels,
    colorSpace: frame?.colorSpace, sourceEncoding: frame?.sourceEncoding,
    sdrWhiteNits: frame?.sdrWhiteNits, headroomStops: frame?.headroomStops, signal});
  const {width, height} = source, pixels = source.pixels;
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nPRIMARIES=${PRIMARIES}\n\n-Y ${height} +X ${width}\n`);
  const rle = width >= 8 && width <= 32767;
  const size = header.length + height * (width * 4 + (rle ? 4 + 4 * Math.ceil(width / 128) : 0));
  const out = new Uint8Array(size); out.set(header); let cursor = header.length;
  const row = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    checkAbort(signal); row.fill(0);
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3, m = Math.max(pixels[p], pixels[p + 1], pixels[p + 2]);
      if (m < 1e-32) continue;
      const exponent = Math.floor(Math.log2(m)) + 1, factor = 2 ** (8 - exponent);
      for (let c = 0; c < 3; c++) row[x * 4 + c] = Math.min(255, Math.floor(pixels[p + c] * factor));
      row[x * 4 + 3] = exponent + 128;
    }
    if (!rle) { out.set(row, cursor); cursor += row.length; continue; }
    out.set([2, 2, width >> 8, width & 255], cursor); cursor += 4;
    // Literal RLE packets are valid and bounded, avoiding an encoder heuristic.
    for (let c = 0; c < 4; c++) for (let x = 0; x < width;) {
      const n = Math.min(128, width - x); out[cursor++] = n;
      for (let k = 0; k < n; k++) out[cursor++] = row[(x++) * 4 + c];
    }
  }
  return out;
}
