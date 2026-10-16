import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, checksum, neutralRecipe} from '../src/session.mjs';
import {analyzeHistogram} from '../src/processing/histogram.mjs';
import {createClippingOverlay} from '../src/processing/clipping-overlay.mjs';
import {calculateHistogramToneDrag, HISTOGRAM_TONE_REGIONS} from '../src/histogram-tone-drag.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

// Contract-level synthetic RGBA8/Original only. This is not a RAW, browser,
// hardware display, Cloud, or Adobe pixel-equivalence test.
const id = '55555555-5555-4555-8555-555555555555';
const original = new TextEncoder().encode('HISTOGRAM_COMPLETION_SYNTHETIC_NON_RAW').buffer;
const rgba = new Uint8ClampedArray([
  0, 0, 0, 255, 255, 255, 255, 255, 70, 100, 130, 255,
  255, 0, 30, 255, 255, 0, 0, 0, 120, 130, 140, 255,
]);
const frame = () => ({width: 3, height: 2, data: rgba.slice()});
const decodeBlob = async blob => new Uint8ClampedArray(await blob.arrayBuffer());

async function fixture() {
  const asset = {id, name: 'audit.nonraw', sha256: await checksum(original), size: original.byteLength};
  let saved = {assetId: id, revision: 1, body: neutralRecipe()};
  let cache = {asset: structuredClone(asset), proxy: frame(), history: [structuredClone(saved.body)],
    cursor: 0, revision: 1, reference: null, dirty: false};
  const encoded = [];
  const api = {
    async listAssets() { return [structuredClone(asset)]; },
    async getRecipe(candidate) { return candidate === id ? structuredClone(saved) : null; },
    async getOriginal(candidate) { if (candidate !== id) throw Error('UNKNOWN_ASSET'); return original.slice(0); },
    async assertPermission(candidate, action) {
      if (candidate !== id || !['edit', 'export'].includes(action)) throw Error('DENIED');
      return {authorized: true};
    },
    async saveRecipe(candidate, revision, body) {
      if (candidate !== id || revision !== saved.revision) throw Error('REVISION_CONFLICT');
      saved = {assetId: id, revision: revision + 1, body: structuredClone(body)};
      return structuredClone(saved);
    },
  };
  const storage = {
    async get(candidate) { return candidate === id ? structuredClone(cache) : undefined; },
    async put(candidate, value) { if (candidate !== id) throw Error('UNKNOWN_ASSET'); cache = structuredClone(value); },
  };
  const processing = {
    async decodeRaw(_bytes, {mode}) {
      if (mode !== 'final') throw Error('SYNTHETIC_FINAL_ONLY');
      return {pixels: frame(), provenance: {fixture: 'SYNTHETIC_NON_RAW'}};
    },
    async render(pixels, recipe, options) {
      return renderPixels(pixels, recipe, {...options, validateRecipe, resolutionAssessment});
    },
    async encode(pixels, {format}) {
      const copy = pixels.data.slice();
      encoded.push({format, pixels: copy});
      return new Blob([copy], {type: format === 'png' ? 'image/png' : 'image/jpeg'});
    },
  };
  let nextURL = 0;
  const session = new EditorSession({api, storage, processing,
    urlAPI: {createObjectURL: () => `blob:hist-audit-${++nextURL}`, revokeObjectURL: () => {}}});
  await session.initialize();
  await session.openAsset(id);
  return {session, asset, api, processing, encoded, saved: () => structuredClone(saved)};
}

test('HIST-AUDIT-01 / SYNTHETIC: four channels and photo warning are Preview-only; Final stays rendered pixels', async () => {
  const {session, asset, encoded} = await fixture();
  const displayed = session.previewPixels;
  const histogram = analyzeHistogram(displayed, {includeMask: true});
  const overlay = createClippingOverlay(displayed, histogram);
  assert.equal(session.state.histogram.includedPixels, 5);
  for (const channel of ['luma', 'red', 'green', 'blue'])
    assert.equal(session.state.histogram.bins[channel].reduce((a, b) => a + b, 0), 5);
  assert.equal(session.state.histogram.clipping.shadow.anyChannel, 2);
  assert.equal(session.state.histogram.clipping.highlight.anyChannel, 2);
  assert.equal(overlay.data[3] > 0, true); // blue black warning
  assert.equal(overlay.data[7] > 0, true); // red white warning
  assert.equal(overlay.data[19], 0); // fully transparent source pixel
  assert.equal(session.state.histogram.mask, undefined); // large mask is not public session state
  assert.ok(session.state.clippingOverlayURL);
  assert.deepEqual(encoded.at(-1).pixels, overlay.data);
  const before = structuredClone(session.state.recipe);
  const final = await session.exportFinal({format: 'png'});
  assert.deepEqual(await decodeBlob(final), displayed.data);
  assert.notDeepEqual(await decodeBlob(final), overlay.data);
  assert.deepEqual(session.state.recipe, before);
  assert.equal(await checksum(original), asset.sha256);
});

test('HIST-AUDIT-02 / SYNTHETIC: five tone regions use existing Recipe keys through Undo/Redo, CAS Save, Reload and Final', async () => {
  const {session, asset, saved} = await fixture();
  const initialFinal = await decodeBlob(await session.exportFinal({format: 'png'}));
  const keys = Object.keys(HISTOGRAM_TONE_REGIONS);
  assert.deepEqual(keys, ['blacks', 'shadows', 'exposure', 'highlights', 'whites']);
  for (const region of keys) {
    const {key, value} = calculateHistogramToneDrag({region, startValue: 0, deltaX: 10, dragWidth: 200});
    await session.setAdjustment(key, value);
  }
  assert.equal(session.state.dirty, true);
  const completeRecipe = structuredClone(session.state.recipe);
  await session.undo();
  assert.notDeepEqual(session.state.recipe, completeRecipe);
  await session.redo();
  assert.deepEqual(session.state.recipe, completeRecipe);
  await session.save();
  assert.equal(session.state.revision, 2);
  assert.deepEqual(saved().body, completeRecipe);
  await session.reload();
  assert.deepEqual(session.state.recipe, completeRecipe);
  const tonedFinal = await decodeBlob(await session.exportFinal({format: 'png'}));
  assert.notDeepEqual(tonedFinal, initialFinal);
  assert.equal(await checksum(original), asset.sha256);
});
