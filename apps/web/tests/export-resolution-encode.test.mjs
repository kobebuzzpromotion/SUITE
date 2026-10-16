import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from '../src/processing/encode.mjs';
import {readExportResolution} from '../src/export-resolution.mjs';

// Actual 2 x 1 encoded samples; shared with export-resolution.test.mjs.
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k=';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg==';
const fixture = (format) => new Blob([Uint8Array.from(Buffer.from(
  format === 'jpeg' ? JPEG_BASE64 : PNG_BASE64, 'base64'))],
{type: format === 'jpeg' ? 'image/jpeg' : 'image/png'});
const pixels = () => ({width: 2, height: 1, data: new Uint8ClampedArray([
  255, 0, 0, 0, 0, 0, 255, 255,
])});

async function withMockCanvas(blobFactory, run) {
  const savedCanvas = globalThis.OffscreenCanvas, savedImageData = globalThis.ImageData;
  const observations = {canvasCount: 0, images: [], converts: []};
  globalThis.ImageData = class {constructor(data, width, height) {this.data=data;this.width=width;this.height=height;}};
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {this.width=width;this.height=height;observations.canvasCount++;}
    getContext(name, options) {
      assert.equal(name,'2d');assert.deepEqual(options,{colorSpace:'srgb'});
      return {putImageData(image,x,y){assert.deepEqual([x,y],[0,0]);observations.images.push(image);}};
    }
    async convertToBlob(options) {observations.converts.push(options);return blobFactory(options);}
  };
  try {return await run(observations);} finally {
    if (savedCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = savedCanvas;
    if (savedImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = savedImageData;
  }
}

test('EXPORT-ENCODE-RES-01 / LEGACY: omitted resolution returns original encoder Blob unchanged', async () => {
  const original = fixture('png'), input = pixels(), copy = input.data.slice();
  await withMockCanvas(() => original, async observed => {
    const output = await encode(input,{format:'png'});
    assert.strictEqual(output,original);
    assert.equal(observed.canvasCount,1);
    assert.deepEqual([...observed.images[0].data], [...input.data]);
    assert.deepEqual(observed.converts,[{type:'image/png',quality:.95}]);
  });
  assert.deepEqual(input.data,copy);
});

test('EXPORT-ENCODE-RES-02 / JFIF: optional PPI writes actual density while retaining legacy export settings', async () => {
  const input = pixels(), before = input.data.slice(), settings = {
    format:'jpeg',bit_depth:8,color_space:'sRGB',tiff_compression:'none',
    metadata:'remove',requested_dpi:96,jpeg_quality:95,
  };
  let validated = 0;
  await withMockCanvas(() => fixture('jpeg'), async observed => {
    const output = await encode(input,{format:'jpeg',quality:.95,settings,resolution:{unit:'ppi',value:300}},
      supplied => {assert.strictEqual(supplied,settings);validated++;});
    assert.equal(output.type,'image/jpeg');
    assert.deepEqual(readExportResolution(new Uint8Array(await output.arrayBuffer()),'jpeg'),
      {format:'jpeg',width:2,height:1,unit:'ppi',x:300,y:300});
    assert.deepEqual([...observed.images[0].data],[255,255,255,255,0,0,255,255]);
  });
  assert.equal(validated,1);
  assert.equal(settings.requested_dpi,96);
  assert.equal(settings.metadata,'remove');
  assert.deepEqual(input.data,before);
});

test('EXPORT-ENCODE-RES-03 / PNG: optional PPC writes pHYs and preserves source alpha', async () => {
  const input = pixels();
  await withMockCanvas(() => fixture('png'), async observed => {
    const output = await encode(input,{format:'png',resolution:{unit:'ppc',value:120}});
    assert.equal(output.type,'image/png');
    assert.deepEqual(readExportResolution(new Uint8Array(await output.arrayBuffer()),'png'),
      {format:'png',width:2,height:1,unit:'ppm',x:12000,y:12000});
    assert.deepEqual([...observed.images[0].data],[...input.data]);
  });
});

test('EXPORT-ENCODE-RES-04 / FAIL_CLOSED: invalid options, JFIF absence, MIME and dimension mismatch reject', async () => {
  await withMockCanvas(() => fixture('jpeg'), async observed => {
    for(const resolution of [null,{unit:'ppi',value:0},{unit:'ppi',value:72.5},
      {unit:'dpi',value:300},{unit:'ppi',value:300,unknown:true}]) {
      await assert.rejects(() => encode(pixels(),{format:'jpeg',resolution}),/EXPORT_RESOLUTION_SETTINGS_INVALID/);
    }
    assert.equal(observed.canvasCount,0);
  });
  await withMockCanvas(async () => new Blob([await fixture('png').arrayBuffer()],{type:'image/jpeg'}), async () => {
    await assert.rejects(() => encode(pixels(),{format:'jpeg',resolution:{unit:'ppi',value:300}}),
      /EXPORT_RESOLUTION_JFIF_REQUIRED/);
  });
  await withMockCanvas(() => fixture('png'), async () => {
    await assert.rejects(() => encode(pixels(),{format:'jpeg',resolution:{unit:'ppi',value:300}}),
      /ENCODER_FORMAT_MISMATCH/);
  });
  await withMockCanvas(() => fixture('jpeg'), async () => {
    await assert.rejects(() => encode({width:1,height:1,data:new Uint8ClampedArray(4)},
      {format:'jpeg',resolution:{unit:'ppi',value:300}}),/ENCODED_DIMENSION_MISMATCH/);
  });
});

test('EXPORT-ENCODE-RES-05 / ABORT: cancellation before encode or after Blob generation releases no result', async () => {
  const cancelled = new AbortController();cancelled.abort();
  await withMockCanvas(() => fixture('jpeg'), async observed => {
    await assert.rejects(() => encode(pixels(),{format:'jpeg',resolution:{unit:'ppi',value:300},
      signal:cancelled.signal}),{name:'AbortError'});
    assert.equal(observed.canvasCount,0);
  });
  const later = new AbortController();
  await withMockCanvas(() => {later.abort();return fixture('png');}, async () => {
    await assert.rejects(() => encode(pixels(),{format:'png',resolution:{unit:'ppi',value:300},
      signal:later.signal}),{name:'AbortError'});
  });
});
