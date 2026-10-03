import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EditorSession, checksum} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {CROP_RATIOS, resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, recipe, syntheticPixels} from './fixtures.mjs';

// This fixture models session state with synthetic RGBA and NON_RAW bytes. Its
// encoder returns raw RGBA in a Blob, so these tests make no PNG/RAW or print claim.
const copy = value => structuredClone(value);
const fixedIDs = ['ratio.1:1', 'ratio.3:2', 'ratio.2:3', 'ratio.4:3', 'ratio.3:4',
  'ratio.5:4', 'ratio.4:5', 'ratio.16:9', 'ratio.9:16'];
const fixedRatios = CROP_RATIOS.filter(entry => entry.ratio);

function sourcePixels() {
  const pixels = syntheticPixels(120, 80, 41);
  for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
    const index = (y * pixels.width + x) * 4;
    pixels.data[index] = x;
    pixels.data[index + 1] = y;
  }
  return pixels;
}

function centered(width, height, ratio) {
  const target = ratio.width / ratio.height;
  const frame = width / height;
  const cropWidth = Math.min(1, target / frame);
  const cropHeight = Math.min(1, frame / target);
  return {x: (1 - cropWidth) / 2, y: (1 - cropHeight) / 2,
    width: cropWidth, height: cropHeight};
}

function closeRect(actual, expected) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-12, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}

async function fixture() {
  const pixels = sourcePixels(), initial = recipe();
  const original = new TextEncoder().encode('NON_RAW fixed-ratio session fixture').buffer;
  const asset = {id: ASSET_A, name: 'NON_RAW_synthetic.bin', sha256: await checksum(original), size: original.byteLength};
  const remote = new Map([[asset.id, {revision: 1, body: copy(initial)}]]);
  const cache = new Map([[asset.id, {asset, proxy: copy(pixels), history: [copy(initial)],
    cursor: 0, revision: 1, reference: null, dirty: false}]]);
  const calls = [];
  const api = {
    listAssets: async () => [asset],
    getRecipe: async id => copy(remote.get(id)),
    saveRecipe: async (id, expectedRevision, body) => {
      const prior = remote.get(id);
      if (expectedRevision !== prior.revision) throw Error('REVISION_CONFLICT');
      const saved = {revision: prior.revision + 1, body: copy(body)};
      remote.set(id, saved);
      return copy(saved);
    },
    getOriginal: async () => {calls.push(['original']); return original.slice(0);},
  };
  const storage = {
    get: async id => copy(cache.get(id)),
    put: async (id, value) => {cache.set(id, copy(value));},
  };
  const processing = {
    decodeRaw: async (_bytes, options) => {
      calls.push(['decode', options.mode]);
      return {pixels: copy(pixels), provenance: {fixture: 'NON_RAW_SYNTHETIC'}};
    },
    render: async (input, body, options) => {
      calls.push(['render', copy(body)]);
      return renderPixels(input, body, {...options, validateRecipe, resolutionAssessment});
    },
    encode: async output => new Blob([output.data]),
  };
  let objectURL = 0;
  const session = new EditorSession({api, processing, storage,
    urlAPI: {createObjectURL: () => `blob:synthetic-${++objectURL}`, revokeObjectURL() {}}});
  await session.initialize();
  await session.openAsset(asset.id);
  return {session, pixels, original, remote, calls};
}

test('CROP-FIXED-CATALOG: exactly nine fixed ratios match the Web Editor options', () => {
  assert.deepEqual(fixedRatios.map(entry => entry.id), fixedIDs);
  assert.equal(fixedRatios.length, 9);
  const uiSource = readFileSync(new URL('../src/editor-ui.mjs', import.meta.url), 'utf8');
  const select = uiSource.match(/<select id="crop-ratio">([\s\S]*?)<\/select>/);
  assert.ok(select, 'Web Editor crop selector is present');
  const values = [...select[1].matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(values, ['original', ...fixedIDs.map(id => id.slice('ratio.'.length))]);
});

for (const preset of fixedRatios) {
  test(`CROP-FIXED-${preset.id}: centered Crop, rotation, Undo/Redo, reload and fixed Final (NON_RAW synthetic)`, async () => {
    const f = await fixture();
    const beforePixels = f.pixels.data.slice(), beforeOriginal = new Uint8Array(f.original).slice();
    const ratio = preset.ratio;

    await f.session.setAdjustment('cropRatio', preset.id.slice('ratio.'.length));
    const unrotated = f.session.state.recipe;
    const first = unrotated.parameters.extendedParameters.crop;
    assert.equal(first.preset_id, preset.id);
    assert.equal(first.preset_name, preset.name);
    assert.deepEqual(first.crop_ratio, ratio);
    assert.equal(first.rotation, 0);
    closeRect(first.crop_rect, centered(120, 80, ratio));

    await f.session.setAdjustment('rotationDegrees', 90);
    const rotated = f.session.state.recipe, crop = rotated.parameters.extendedParameters.crop;
    assert.equal(crop.rotation, 90);
    assert.equal(crop.orientation, ratio.width < ratio.height ? 'portrait' : 'landscape');
    assert.equal(crop.custom_size, false);
    assert.equal(crop.requested_dpi, 96);
    assert.equal(crop.width_mm, undefined);
    assert.equal(crop.height_mm, undefined);
    assert.deepEqual(crop.crop_ratio, ratio);
    closeRect(crop.crop_rect, centered(80, 120, ratio));
    assert.equal(rotated.parameters.processingOrder.at(-1), 'crop');
    validateRecipe(rotated);

    await f.session.undo();
    assert.deepEqual(f.session.state.recipe, unrotated);
    await f.session.redo();
    assert.deepEqual(f.session.state.recipe, rotated);
    await f.session.save();
    const saved = copy(f.remote.get(ASSET_A));
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.body, rotated);
    await f.session.reload();
    assert.deepEqual(f.session.state.recipe, rotated);
    assert.equal(f.session.state.dirty, false);

    const beforeFinal = f.calls.length;
    const output = await f.session.exportFinal({format: 'png'});
    const finalCalls = f.calls.slice(beforeFinal);
    assert.deepEqual(finalCalls.map(call => call[0]), ['original', 'decode', 'render']);
    assert.equal(finalCalls[1][1], 'final');
    assert.deepEqual(finalCalls[2][1], saved.body);

    const rect = crop.crop_rect;
    const left = Math.floor(rect.x * 80 + 1e-9), top = Math.floor(rect.y * 120 + 1e-9);
    const width = Math.floor(rect.width * 80 + 1e-9), height = Math.floor(rect.height * 120 + 1e-9);
    const rgba = new Uint8Array(await output.arrayBuffer());
    assert.equal(rgba.length, width * height * 4);
    // After +90 degrees: rotated (x,y) samples upright (119-y,x).
    assert.deepEqual([...rgba.slice(0, 4)], [119 - top, left, 41, 255]);
    assert.deepEqual([...rgba.slice(-4)], [119 - (top + height - 1), left + width - 1, 41, 255]);
    assert.deepEqual(f.pixels.data, beforePixels);
    assert.deepEqual(new Uint8Array(f.original), beforeOriginal);
    assert.deepEqual(f.session.state.recipe, saved.body);
  });
}
