import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeTIFF, MAX_TIFF_PIXELS} from '../src/export-tiff.mjs';

// Independent, deliberately small TIFF-IFD reader for the tags this writer emits.
function read(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteOrder = String.fromCharCode(bytes[0], bytes[1]);
  assert.ok(byteOrder === 'II' || byteOrder === 'MM');
  const le = byteOrder === 'II', u16 = at => view.getUint16(at, le), u32 = at => view.getUint32(at, le);
  assert.equal(u16(2), 42);
  const ifd = u32(4), count = u16(ifd), tags = new Map();
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12, tag = u16(at), type = u16(at + 2), length = u32(at + 4);
    assert.ok(tag > previous, 'IFD tags sorted ascending'); previous = tag;
    const size = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 0;
    assert.ok(size > 0);
    const valueAt = length * size <= 4 ? at + 8 : u32(at + 8);
    assert.ok(valueAt + length * size <= bytes.length);
    let values = [];
    for (let n = 0; n < length; n++) values.push(type === 3 ? u16(valueAt + n * 2) : type === 4 ? u32(valueAt + n * 4) : [u32(valueAt + n * 8), u32(valueAt + n * 8 + 4)]);
    tags.set(tag, values);
  }
  assert.equal(u32(ifd + 2 + count * 12), 0, 'one complete IFD');
  const width = tags.get(256)[0], height = tags.get(257)[0], samples = tags.get(277)[0], depth = tags.get(258)[0];
  const rowsPerStrip = tags.get(278)[0], offsets = tags.get(273), sizes = tags.get(279), pixelBytes = [];
  assert.equal(offsets.length, sizes.length);
  for (let s = 0; s < offsets.length; s++) {
    assert.ok(offsets[s] + sizes[s] <= bytes.length);
    assert.equal(sizes[s], Math.min(rowsPerStrip, height - s * rowsPerStrip) * width * samples * depth / 8);
    pixelBytes.push(...bytes.subarray(offsets[s], offsets[s] + sizes[s]));
  }
  return {byteOrder, tags, width, height, samples, depth, pixelBytes, u16};
}

const input = (data, overrides = {}) => ({width: data.length / 4, height: 1, data, ...overrides});

test('TIFF01 / little-endian RGB8 uncompressed output exactly round-trips opaque RGBA8 colors', () => {
  const source = new Uint8Array([10, 20, 30, 255, 255, 0, 128, 255]);
  const copy = source.slice();
  const output = encodeTIFF(input(source, {channels: 'RGB'}));
  const tiff = read(output.bytes);
  assert.equal(output.mimeType, 'image/tiff');
  assert.equal(output.bitDepthProvenance, 'RGBA8_SOURCE');
  assert.equal(tiff.byteOrder, 'II');
  assert.deepEqual([tiff.width, tiff.height, tiff.samples, tiff.depth], [2, 1, 3, 8]);
  assert.deepEqual(tiff.tags.get(258), [8, 8, 8]);
  assert.deepEqual(tiff.tags.get(259), [1]);
  assert.deepEqual(tiff.tags.get(262), [2]);
  assert.deepEqual(tiff.tags.get(284), [1]);
  assert.equal(tiff.tags.has(338), false);
  assert.deepEqual(tiff.pixelBytes, [10, 20, 30, 255, 0, 128]);
  assert.deepEqual(source, copy);
});

test('TIFF02 / big-endian RGBA8 stores straight alpha and hidden RGB without mutation', () => {
  const source = new Uint8ClampedArray([99, 88, 77, 0, 15, 25, 35, 127]);
  const copy = source.slice();
  const output = encodeTIFF(input(source, {channels: 'RGBA', byteOrder: 'MM'}));
  const tiff = read(output.bytes);
  assert.equal(tiff.byteOrder, 'MM');
  assert.deepEqual(tiff.tags.get(258), [8, 8, 8, 8]);
  assert.deepEqual(tiff.tags.get(338), [2]); // unassociated alpha
  assert.deepEqual(tiff.pixelBytes, [...source]);
  assert.deepEqual(source, copy);
});

test('TIFF03 / 16-bit samples only expand the existing 8-bit lattice, in both byte orders', () => {
  const source = new Uint8Array([0, 1, 128, 255]);
  for (const byteOrder of ['II', 'MM']) {
    const output = encodeTIFF(input(source, {channels: 'RGBA', bitsPerSample: 16, byteOrder}));
    const tiff = read(output.bytes), view = new DataView(Uint8Array.from(tiff.pixelBytes).buffer);
    assert.equal(output.bitDepthProvenance, 'RGBA8_EXPANDED_TO_16');
    assert.deepEqual(tiff.tags.get(258), [16, 16, 16, 16]);
    assert.deepEqual(Array.from({length: 4}, (_, i) => view.getUint16(i * 2, byteOrder === 'II')), [0, 257, 32896, 65535]);
  }
  const rgb = read(encodeTIFF(input(source, {channels: 'RGB', bitsPerSample: 16})).bytes);
  assert.deepEqual(rgb.tags.get(258), [16, 16, 16]);
  const rgbView = new DataView(Uint8Array.from(rgb.pixelBytes).buffer);
  assert.deepEqual([0, 1, 2].map(i => rgbView.getUint16(i * 2, true)), [0, 257, 32896]);
  assert.deepEqual([...source], [0, 1, 128, 255]);
});

test('TIFF04 / multistrip image has contiguous, complete rows and correct offsets/counts', () => {
  const width = 2, height = 3000, source = new Uint8Array(width * height * 4);
  for (let i = 0; i < source.length; i++) source[i] = i & 255;
  const tiff = read(encodeTIFF({width, height, data: source, channels: 'RGBA'}).bytes);
  assert.ok(tiff.tags.get(273).length > 1);
  assert.equal(tiff.tags.get(273).length, Math.ceil(height / tiff.tags.get(278)[0]));
  assert.deepEqual(tiff.pixelBytes, [...source]);
});

test('TIFF05 / exact pixels-per-unit metadata distinguishes inch, centimeter, and unspecified', () => {
  const source = new Uint8Array([1, 2, 3, 255]);
  for (const [unit, code, x, y] of [['INCH', 2, 300, 240], ['CENTIMETER', 3, 118, 94]]) {
    const tiff = read(encodeTIFF(input(source, {resolution: {unit, x, y}})).bytes);
    assert.deepEqual(tiff.tags.get(296), [code]);
    assert.deepEqual(tiff.tags.get(282), [[x, 1]]);
    assert.deepEqual(tiff.tags.get(283), [[y, 1]]);
  }
  const unspecified = read(encodeTIFF(input(source)).bytes);
  assert.deepEqual(unspecified.tags.get(296), [1]);
  assert.deepEqual(unspecified.tags.get(282), [[1, 1]]);
});

test('TIFF06 / RGB refuses alpha loss; invalid shapes, dimensions, capacity, or resolution refuse', () => {
  const source = new Uint8Array([1, 2, 3, 0]);
  assert.throws(() => encodeTIFF(input(source, {channels: 'RGB'})), /TIFF_ALPHA_WOULD_BE_LOST/);
  assert.throws(() => encodeTIFF(input(source, {channels: 'CMYK'})), /INVALID_TIFF_CHANNELS/);
  assert.throws(() => encodeTIFF(input(source, {bitsPerSample: 12})), /INVALID_TIFF_DEPTH/);
  assert.throws(() => encodeTIFF(input(source, {byteOrder: 'XX'})), /INVALID_TIFF_BYTE_ORDER/);
  assert.throws(() => encodeTIFF(input(source, {width: 2})), /INVALID_TIFF_PIXELS/);
  assert.throws(() => encodeTIFF(input(source, {width: 0})), /INVALID_TIFF_DIMENSIONS/);
  assert.throws(() => encodeTIFF(input(source, {width: MAX_TIFF_PIXELS + 1})), /INVALID_TIFF_DIMENSIONS/);
  assert.throws(() => encodeTIFF(input(source, {resolution: {unit: 'INCH', x: 0, y: 300}})), /INVALID_TIFF_RESOLUTION/);
  assert.throws(() => encodeTIFF(input(source, {resolution: {unit: 'INCH', x: 300, y: 300, unexpected: 1}})), /INVALID_TIFF_RESOLUTION/);
  assert.throws(() => encodeTIFF({...input(source), metadata: {artist: 'not allowed'}}), /INVALID_TIFF_INPUT/);
  const symbol = input(source); symbol[Symbol('unknown')] = true;
  assert.throws(() => encodeTIFF(symbol), /INVALID_TIFF_INPUT/);
  // Budget is checked before attempting a 128 MiB allocation or reading pixels.
  assert.throws(() => encodeTIFF({width: 4000, height: 4000, data: source, bitsPerSample: 16}), /TIFF_CAPACITY_EXCEEDED/);
});

test('TIFF07 / aborted input and mid-write cancellation return no file or mutated source', () => {
  const source = new Uint8Array(4 * 200 * 200), copy = source.slice();
  const aborted = new AbortController(); aborted.abort();
  assert.throws(() => encodeTIFF({width: 200, height: 200, data: source, signal: aborted.signal}), {name: 'AbortError'});
  let checks = 0;
  const signal = {get aborted() {return ++checks > 8;}};
  assert.throws(() => encodeTIFF({width: 200, height: 200, data: source, signal}), {name: 'AbortError'});
  assert.deepEqual(source, copy);
});
