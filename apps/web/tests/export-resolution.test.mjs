import test from 'node:test';
import assert from 'node:assert/strict';
import {readExportResolution, writeExportResolution, writeExportResolutionBlob,
  MAX_EXPORT_RESOLUTION_BYTES} from '../src/export-resolution.mjs';

// Actual 2 x 1 JPEG/PNG encoder output from System.Drawing: one red and one
// blue pixel. These are encoded images, not simulated headers or RAW evidence.
const JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k=';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg==';
const fixture = base64 => Uint8Array.from(Buffer.from(base64, 'base64'));
const jpg = () => fixture(JPEG);
const png = () => fixture(PNG);
const read32 = (bytes, at) => (bytes[at] * 0x1000000 + (bytes[at + 1] << 16) +
  (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
function pngParts(bytes) {
  const chunks = []; let at = 8;
  while (at < bytes.length) {
    const length = read32(bytes, at);
    chunks.push({name: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), at, length});
    at += 12 + length;
  }
  return chunks;
}

test('EXPORT-RES-01 / REAL_JPEG: JFIF PPI and PPC change five metadata bytes only, with readback', () => {
  const original = jpg(), before = original.slice();
  assert.deepEqual(readExportResolution(original, 'jpeg'),
    {format: 'jpeg', width: 2, height: 1, unit: 'ppi', x: 96, y: 96});
  for (const [unit, value, marker] of [['ppi', 300, 1], ['ppc', 120, 2]]) {
    const encoded = writeExportResolution(original, {format: 'jpeg', unit, value});
    assert.deepEqual(readExportResolution(encoded, 'jpeg'),
      {format: 'jpeg', width: 2, height: 1, unit, x: value, y: value});
    assert.equal(encoded[13], marker);
    assert.deepEqual(encoded.subarray(0, 13), original.subarray(0, 13));
    assert.deepEqual(encoded.subarray(18), original.subarray(18));
    assert.notStrictEqual(encoded, original);
  }
  assert.deepEqual(original, before);
});

test('EXPORT-RES-02 / REAL_PNG: pHYs records metres, preserves image bytes, CRC and pixel dimensions', () => {
  const original = png(), before = original.slice();
  const originalParts = pngParts(original);
  assert.deepEqual(readExportResolution(original, 'png'),
    {format: 'png', width: 2, height: 1, unit: 'ppm', x: 3779, y: 3779});
  for (const [unit, value, expected] of [['ppi', 300, 11811], ['ppc', 120, 12000]]) {
    const encoded = writeExportResolution(original, {format: 'png', unit, value});
    assert.deepEqual(readExportResolution(encoded, 'png'),
      {format: 'png', width: 2, height: 1, unit: 'ppm', x: expected, y: expected});
    const parts = pngParts(encoded);
    assert.deepEqual(parts.map(part => part.name), originalParts.map(part => part.name));
    const sourcePhys = originalParts.find(part => part.name === 'pHYs');
    const outputPhys = parts.find(part => part.name === 'pHYs');
    assert.deepEqual(encoded.subarray(0, sourcePhys.at + 8), original.subarray(0, sourcePhys.at + 8));
    assert.deepEqual(encoded.subarray(outputPhys.at + 21), original.subarray(sourcePhys.at + 21));
  }
  assert.deepEqual(original, before);
});

test('EXPORT-RES-03 / REAL_PNG: absent pHYs inserts one legal chunk after IHDR, never a display-only value', () => {
  const source = png(), phys = pngParts(source).find(part => part.name === 'pHYs');
  const without = new Uint8Array(source.length - 21);
  without.set(source.subarray(0, phys.at));
  without.set(source.subarray(phys.at + 21), phys.at);
  assert.throws(() => readExportResolution(without, 'png'), /EXPORT_RESOLUTION_UNSPECIFIED/);
  const encoded = writeExportResolution(without, {format: 'png', unit: 'ppi', value: 300});
  const names = pngParts(encoded).map(part => part.name);
  assert.deepEqual(names.slice(0, 2), ['IHDR', 'pHYs']);
  assert.equal(names.filter(name => name === 'pHYs').length, 1);
  assert.deepEqual(readExportResolution(encoded, 'png'),
    {format: 'png', width: 2, height: 1, unit: 'ppm', x: 11811, y: 11811});
  assert.deepEqual(encoded.subarray(encoded.length - (without.length - 33)), without.subarray(33));
});

test('EXPORT-RES-04 / BLOB: existing encoder Blob can be annotated and reread without changing MIME or original', async () => {
  for (const [bytes, type, settings, expected] of [
    [jpg(), 'image/jpeg', {unit: 'ppi', value: 240}, {unit: 'ppi', x: 240, y: 240}],
    [png(), 'image/png', {unit: 'ppc', value: 100}, {unit: 'ppm', x: 10000, y: 10000}],
  ]) {
    const original = new Blob([bytes], {type});
    const result = await writeExportResolutionBlob(original, settings);
    assert.equal(result.type, type);
    assert.deepEqual(await original.arrayBuffer(), bytes.buffer);
    const actual = readExportResolution(new Uint8Array(await result.arrayBuffer()), type === 'image/png' ? 'png' : 'jpeg');
    assert.deepEqual({...expected, width: 2, height: 1, format: type === 'image/png' ? 'png' : 'jpeg'}, actual);
  }
});

test('EXPORT-RES-05 / FAIL_CLOSED: unsupported formats, malformed requests and conflicting metadata reject', async () => {
  const original = jpg();
  for (const settings of [
    {format: 'tiff', unit: 'ppi', value: 300}, {format: 'jpeg', unit: 'dpi', value: 300},
    {format: 'jpeg', unit: 'ppi', value: 0}, {format: 'jpeg', unit: 'ppc', value: 65536},
    {format: 'jpeg', unit: 'ppi', value: 72.5}, {format: 'jpeg', unit: 'ppi', value: NaN},
    {format: 'jpeg', unit: 'ppi', value: 300, unknown: true},
    {[Symbol('unit')]: 'ppi', format: 'jpeg', unit: 'ppi', value: 300},
  ]) assert.throws(() => writeExportResolution(original, settings), /EXPORT_RESOLUTION_SETTINGS_INVALID/);
  assert.throws(() => readExportResolution(original, 'webp'), /EXPORT_RESOLUTION_FORMAT_UNSUPPORTED/);
  await assert.rejects(() => writeExportResolutionBlob(new Blob([original], {type: 'image/tiff'}),
    {unit: 'ppi', value: 300}), /EXPORT_RESOLUTION_FORMAT_UNSUPPORTED/);
  const exifLike = original.slice(); exifLike[2] = 0xe1;
  assert.throws(() => writeExportResolution(exifLike, {format: 'jpeg', unit: 'ppi', value: 300}),
    /EXPORT_RESOLUTION_JFIF_REQUIRED/);
  const withAPP1 = new Uint8Array(original.length + 4);
  withAPP1.set(original.subarray(0, 20));
  withAPP1.set([0xff, 0xe1, 0, 2], 20);
  withAPP1.set(original.subarray(20), 24);
  assert.throws(() => writeExportResolution(withAPP1, {format: 'jpeg', unit: 'ppi', value: 300}),
    /EXPORT_RESOLUTION_JPEG_UNSUPPORTED_APP1/);
  const damaged = png(); damaged[damaged.length - 5] ^= 1;
  assert.throws(() => writeExportResolution(damaged, {format: 'png', unit: 'ppi', value: 300}),
    /EXPORT_RESOLUTION_PNG_INVALID/);
  assert.deepEqual(original, jpg());
});

test('EXPORT-RES-06 / LIMIT_ABORT: byte ceiling and cancellation never return partially rewritten files', async () => {
  assert.throws(() => writeExportResolution(new Uint8Array(MAX_EXPORT_RESOLUTION_BYTES + 1),
    {format: 'jpeg', unit: 'ppi', value: 300}), /EXPORT_RESOLUTION_BYTES_INVALID/);
  const controller = new AbortController(); controller.abort();
  const source = new Blob([jpg()], {type: 'image/jpeg'});
  await assert.rejects(() => writeExportResolutionBlob(source,
    {unit: 'ppi', value: 300, signal: controller.signal}), {name: 'AbortError'});
  assert.equal(readExportResolution(new Uint8Array(await source.arrayBuffer()), 'jpeg').x, 96);
});
