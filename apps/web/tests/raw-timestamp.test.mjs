import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LibRaw} from '@colorhythm/libraw-wasm';
import {decodeRaw, libRawTimestampEvidence} from '../src/processing/raw.mjs';

test('RAW-TIME01: only positive in-range bigint time_t is retained as timezone-unverified evidence', () => {
  assert.deepEqual(libRawTimestampEvidence(1725150600n),
    {libRawTimestampSeconds: '1725150600', libRawTimestampTimezone: 'UNVERIFIED'});
  for (const invalid of [undefined, null, 0n, -1n, 1, '1725150600', NaN,
    4133980800n, 2n ** 63n]) assert.equal(libRawTimestampEvidence(invalid), null);
  assert.deepEqual(libRawTimestampEvidence(4133980799n),
    {libRawTimestampSeconds: '4133980799', libRawTimestampTimezone: 'UNVERIFIED'});
});

test('RAW-TIME02 / MOCK_LIBRAW_NON_RAW: decode reads optional wrapper timestamp without changing pixels, SHA or existing metadata', async () => {
  // No actual camera RAW fixture is used. The installed wrapper class is
  // substituted only for this test; the production method call is exercised.
  const originalFetch = globalThis.fetch;
  const methods = ['setup', 'waitUntilReady', 'open', 'getRawWidth', 'getRawHeight',
    'getIParams', 'getFlip', 'getPixelAspect', 'getImgOther', 'setHalfSize',
    'setUseCameraWb', 'setOutputColor', 'setOutputBps', 'setGamma',
    'setNoAutoBright', 'setBright', 'unpack', 'dcrawProcess',
    'dcrawMakeMemImage', 'dispose'];
  const saved = new Map(methods.map(name => [name, LibRaw.prototype[name]]));
  const initialize = LibRaw.initialize, version = LibRaw.version;
  let timestamp = 1725150600n, opened = false, disposed = 0, metadataRead = 0;
  try {
    globalThis.fetch = async url => {
      assert.equal(url, '/vendor/libraw/libraw.wasm');
      return {ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer};
    };
    LibRaw.initialize = async () => ({});
    LibRaw.version = () => 'MOCK_LIBRAW';
    const replacements = {
      setup: async () => {}, waitUntilReady: async () => {},
      open: () => {opened = true;}, getRawWidth: () => 1, getRawHeight: () => 1,
      getIParams: () => ({raw_count: 1, make: 'RAW Maker', model: 'RAW Model',
        normalized_make: 'Maker', normalized_model: 'Model'}),
      getFlip: () => 0, getPixelAspect: () => 1,
      getImgOther: () => {assert.equal(opened, true); metadataRead++; if (timestamp === 'throws') throw Error('BAD_OPTIONAL_METADATA'); return {timestamp};},
      dcrawMakeMemImage: () => ({type_: 'LIBRAW_IMAGE_BITMAP', bits: 8, colors: 3,
        width: 1, height: 1, data_size: 3, data: new Uint8Array([12, 34, 56])}),
      dispose: () => {disposed++;},
    };
    for (const name of methods) LibRaw.prototype[name] = replacements[name] ?? (() => {});
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const input = bytes.buffer.slice(0), before = bytes.slice();
    const sourceSHA256 = createHash('sha256').update(bytes).digest('hex');
    for (const value of [1725150600n, 0n, 4133980800n, undefined, 'throws']) {
      timestamp = value;
      const result = await decodeRaw(input, {mode: 'proxy'});
      assert.deepEqual(Array.from(result.pixels.data), [12, 34, 56, 255]);
      assert.deepEqual([result.metadata.make, result.metadata.model,
        result.metadata.rawWidth, result.metadata.rawHeight, result.metadata.sourceFlip],
      ['Maker', 'Model', 1, 1, 0]);
      assert.equal(result.provenance.sourceSHA256, sourceSHA256);
      assert.equal(result.provenance.mode, 'proxy');
      assert.equal(Object.hasOwn(result.metadata, 'captureDate'), false);
      if (value === 1725150600n) {
        assert.equal(result.metadata.libRawTimestampSeconds, value.toString());
        assert.equal(result.metadata.libRawTimestampTimezone, 'UNVERIFIED');
      } else {
        assert.equal(Object.hasOwn(result.metadata, 'libRawTimestampSeconds'), false);
        assert.equal(Object.hasOwn(result.metadata, 'libRawTimestampTimezone'), false);
      }
      assert.deepEqual(bytes, before);
    }
    assert.equal(metadataRead, 5);
    assert.equal(disposed, 5);
  } finally {
    globalThis.fetch = originalFetch;
    LibRaw.initialize = initialize;
    LibRaw.version = version;
    for (const [name, method] of saved) LibRaw.prototype[name] = method;
  }
});
