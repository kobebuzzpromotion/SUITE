// Post-encode physical-resolution metadata for the two formats supported by
// the Web encoder. No pixel dimensions, compressed scan data or Recipe change.
// PNG pHYs: https://www.w3.org/TR/png-3/#11pHYs
// JPEG JFIF APP0: https://www.w3.org/Graphics/JPEG/jfif.pdf

export const MAX_EXPORT_RESOLUTION_BYTES = 128 * 1024 * 1024;
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const PNG_PHYS_TYPE = Uint8Array.of(112, 72, 89, 115);
const CRC_TABLE = Uint32Array.from({length: 256}, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function validBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > MAX_EXPORT_RESOLUTION_BYTES) {
    throw Error('EXPORT_RESOLUTION_BYTES_INVALID');
  }
  return bytes;
}
function validSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
      Reflect.ownKeys(settings).some(key => !['format', 'unit', 'value'].includes(key)) ||
      !['png', 'jpeg'].includes(settings.format) || !['ppi', 'ppc'].includes(settings.unit) ||
      !Number.isSafeInteger(settings.value) || settings.value < 1 || settings.value > 65535) {
    throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
  }
  return settings;
}
function read32(bytes, at) {
  return (((bytes[at] * 0x1000000) + (bytes[at + 1] << 16) +
    (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0);
}
function put32(bytes, at, value) {
  bytes[at] = value >>> 24; bytes[at + 1] = value >>> 16;
  bytes[at + 2] = value >>> 8; bytes[at + 3] = value;
}
function crc32(bytes, from, to) {
  let crc = 0xffffffff;
  for (let at = from; at < to; at++) crc = CRC_TABLE[(crc ^ bytes[at]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunks(bytes) {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
  const chunks = [];
  let at = 8, seenIDAT = false, seenIEND = false, seenPHYS = false, seenIHDR = false;
  let width, height;
  while (at < bytes.length) {
    if (at + 12 > bytes.length) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
    const length = read32(bytes, at);
    if (length > 0x7fffffff || length > bytes.length - at - 12) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes, at + 4, at + 8 + length) !== read32(bytes, at + 8 + length)) {
      throw Error('EXPORT_RESOLUTION_PNG_INVALID');
    }
    if (!seenIHDR) {
      if (type !== 'IHDR' || length !== 13) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
      width = read32(bytes, at + 8); height = read32(bytes, at + 12);
      if (!width || !height) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
      seenIHDR = true;
    } else if (type === 'IHDR') throw Error('EXPORT_RESOLUTION_PNG_INVALID');
    if (type === 'pHYs') {
      if (seenPHYS || seenIDAT || length !== 9 || ![0, 1].includes(bytes[at + 16])) {
        throw Error('EXPORT_RESOLUTION_PNG_INVALID');
      }
      seenPHYS = true;
    }
    if (type === 'eXIf' || ['acTL', 'fcTL', 'fdAT'].includes(type)) throw Error('EXPORT_RESOLUTION_PNG_UNSUPPORTED');
    if (type === 'IDAT') seenIDAT = true;
    chunks.push({at, length, type});
    at += 12 + length;
    if (type === 'IEND') {
      if (length !== 0 || at !== bytes.length || !seenIDAT) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
      seenIEND = true; break;
    }
  }
  if (!seenIEND) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
  return {chunks, width, height};
}
function jpegHeader(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[3] !== 0xe0 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw Error('EXPORT_RESOLUTION_JFIF_REQUIRED');
  }
  const firstLength = bytes[4] * 256 + bytes[5];
  if (firstLength < 16 || 4 + firstLength > bytes.length ||
      ![74, 70, 73, 70, 0].every((byte, i) => bytes[6 + i] === byte) ||
      bytes[11] !== 1 || firstLength !== 16 + 3 * bytes[18] * bytes[19]) {
    throw Error('EXPORT_RESOLUTION_JFIF_REQUIRED');
  }
  let at = 4 + firstLength, width, height, seenSOS = false;
  while (at < bytes.length - 2) {
    if (bytes[at++] !== 0xff) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (!marker || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) ||
        at + 2 > bytes.length) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
    const length = bytes[at] * 256 + bytes[at + 1], dataAt = at + 2;
    if (length < 2 || length > bytes.length - at) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
    if (marker === 0xe1) throw Error('EXPORT_RESOLUTION_JPEG_UNSUPPORTED_APP1');
    if (marker === 0xe0 && [74, 70, 73, 70, 0].every((byte, i) => bytes[dataAt + i] === byte)) {
      throw Error('EXPORT_RESOLUTION_JPEG_DUPLICATE_JFIF');
    }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7 || width) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
      height = bytes[dataAt + 1] * 256 + bytes[dataAt + 2];
      width = bytes[dataAt + 3] * 256 + bytes[dataAt + 4];
      if (!width || !height) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
    }
    at += length;
    if (marker === 0xda) {seenSOS = true; break;}
  }
  if (!seenSOS || !width || !height) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
  return {width, height};
}

/** Read physically encoded density; PNG reports integer pixels/metre, JPEG its JFIF unit. */
export function readExportResolution(input, format) {
  const bytes = validBytes(input);
  if (format === 'png') {
    const {chunks, width, height} = pngChunks(bytes);
    const phys = chunks.find(chunk => chunk.type === 'pHYs');
    if (!phys || bytes[phys.at + 16] !== 1) throw Error('EXPORT_RESOLUTION_UNSPECIFIED');
    const x = read32(bytes, phys.at + 8), y = read32(bytes, phys.at + 12);
    if (!x || !y) throw Error('EXPORT_RESOLUTION_PNG_INVALID');
    return {format, width, height, unit: 'ppm', x, y};
  }
  if (format === 'jpeg') {
    const {width, height} = jpegHeader(bytes);
    const unit = bytes[13] === 1 ? 'ppi' : bytes[13] === 2 ? 'ppc' : null;
    if (!unit) throw Error('EXPORT_RESOLUTION_UNSPECIFIED');
    const x = bytes[14] * 256 + bytes[15], y = bytes[16] * 256 + bytes[17];
    if (!x || !y) throw Error('EXPORT_RESOLUTION_JPEG_INVALID');
    return {format, width, height, unit, x, y};
  }
  throw Error('EXPORT_RESOLUTION_FORMAT_UNSUPPORTED');
}

/** Return a detached encoded file with actual density metadata and self-verify it. */
export function writeExportResolution(input, rawSettings) {
  const bytes = validBytes(input), settings = validSettings(rawSettings);
  const {format, unit, value} = settings;
  let output, target;
  if (format === 'png') {
    const {chunks} = pngChunks(bytes);
    target = Math.round(value * (unit === 'ppi' ? 10000 / 254 : 100));
    if (!target || target > 0xffffffff) throw Error('EXPORT_RESOLUTION_RANGE');
    const phys = chunks.find(chunk => chunk.type === 'pHYs');
    if (phys) {
      output = bytes.slice();
      put32(output, phys.at + 8, target); put32(output, phys.at + 12, target);
      output[phys.at + 16] = 1;
      put32(output, phys.at + 17, crc32(output, phys.at + 4, phys.at + 17));
    } else {
      const afterIHDR = chunks[0].at + 12 + chunks[0].length;
      const chunk = new Uint8Array(21);
      put32(chunk, 0, 9); chunk.set(PNG_PHYS_TYPE, 4);
      put32(chunk, 8, target); put32(chunk, 12, target); chunk[16] = 1;
      put32(chunk, 17, crc32(chunk, 4, 17));
      output = new Uint8Array(bytes.length + chunk.length);
      output.set(bytes.subarray(0, afterIHDR)); output.set(chunk, afterIHDR);
      output.set(bytes.subarray(afterIHDR), afterIHDR + chunk.length);
    }
  } else {
    jpegHeader(bytes);
    output = bytes.slice(); target = value;
    output[13] = unit === 'ppi' ? 1 : 2;
    output[14] = value >>> 8; output[15] = value;
    output[16] = value >>> 8; output[17] = value;
  }
  const verified = readExportResolution(output, format);
  if (verified.x !== target || verified.y !== target ||
      (format === 'jpeg' && verified.unit !== unit)) throw Error('EXPORT_RESOLUTION_WRITE_FAILED');
  return output;
}

/** Convenience adapter for the existing encoder's Blob, without changing it. */
export async function writeExportResolutionBlob(blob, {unit, value, signal} = {}) {
  if (!(blob instanceof Blob)) throw Error('EXPORT_RESOLUTION_BLOB_INVALID');
  const format = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpeg' : null;
  if (!format) throw Error('EXPORT_RESOLUTION_FORMAT_UNSUPPORTED');
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const encoded = writeExportResolution(new Uint8Array(await blob.arrayBuffer()), {format, unit, value});
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  return new Blob([encoded], {type: blob.type});
}
