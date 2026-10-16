import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, neutralRecipe} from '../src/session.mjs';
import {analyzeHistogram} from '../src/processing/histogram.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {ASSET_A, ASSET_B, SHA, deferred} from './fixtures.mjs';

// Deterministic RGBA only: no RAW decode, real photograph, browser canvas, or Cloud claim.
function frame(...colors) {
  return {width: colors.length, height: 1, data: new Uint8ClampedArray(colors.flatMap(rgb => [...rgb, 255]))};
}

async function fixture() {
  const assetA = {id: ASSET_A, name: 'synthetic-a.raw', sha256: SHA, size: 1};
  const assetB = {id: ASSET_B, name: 'synthetic-b.raw', sha256: SHA, size: 1};
  const imageA = frame([20, 20, 20], [250, 0, 0]);
  const imageB = frame([210, 210, 210], [0, 255, 0]);
  const cached = new Map([[ASSET_A, {asset: assetA, proxy: imageA, history: [neutralRecipe()], cursor: 0, revision: 0, reference: null, dirty: false}],
    [ASSET_B, {asset: assetB, proxy: imageB, history: [neutralRecipe()], cursor: 0, revision: 0, reference: null, dirty: false}]]);
  const api = {
    listAssets: async () => [assetA, assetB],
    getRecipe: async () => null,
    assertPermission: async () => {},
  };
  const storage = {
    get: async id => structuredClone(cached.get(id)),
    put: async (id, value) => {cached.set(id, structuredClone(value));},
  };
  const rendered = [];
  const processing = {
    render: async (pixels, recipe, options) => {
      const output = renderPixels(pixels, recipe, {...options, validateRecipe, resolutionAssessment});
      rendered.push(structuredClone(output));
      return output;
    },
    encode: async pixels => new Blob([pixels.data], {type: 'image/png'}),
  };
  let url = 0;
  const urlAPI = {createObjectURL: () => `blob:histogram-synthetic-${++url}`, revokeObjectURL: () => {}};
  const session = new EditorSession({api, storage, processing, urlAPI});
  await session.initialize();
  return {session, api, processing, rendered, imageA, imageB};
}

test('HIST-SESSION-01 / SYNTHETIC: histogram follows actually rendered RGBA after an adjustment', async () => {
  const {session, rendered, imageA} = await fixture();
  const originalBytes = imageA.data.slice();
  const states = [];
  session.subscribe(state => states.push({busy: state.busy, histogram: state.histogram}));
  await session.openAsset(ASSET_A);
  assert.deepEqual(session.state.histogram, analyzeHistogram(rendered.at(-1)));
  assert.equal(session.state.histogram.bins.red[250], 1);
  assert.equal(session.state.histogram.clipping.shadow.anyChannel, 1);

  await session.setAdjustment('exposure', -1);
  assert.deepEqual(session.state.histogram, analyzeHistogram(rendered.at(-1)));
  assert.notDeepEqual(rendered.at(-1).data, originalBytes);
  assert.notEqual(session.state.histogram.bins.red[250], 1);
  assert.ok(states.some(s => s.busy === 'preview' && s.histogram === null));
  assert.deepEqual(imageA.data, originalBytes);
});

test('HIST-SESSION-02 / SYNTHETIC: switching assets clears the prior histogram until the new preview commits', async () => {
  const {session, api, imageB} = await fixture();
  await session.openAsset(ASSET_A);
  const first = session.state.histogram;
  const gate = deferred();
  api.getRecipe = async id => id === ASSET_B ? gate.promise : null;
  const switching = session.openAsset(ASSET_B);
  assert.equal(session.state.histogram, null);
  assert.equal(session.state.afterURL, null);
  gate.resolve(null);
  await switching;
  assert.equal(session.state.asset.id, ASSET_B);
  assert.deepEqual(session.state.histogram, analyzeHistogram(imageB));
  assert.notDeepEqual(session.state.histogram.bins.red, first.bins.red);
});

test('HIST-SESSION-03 / SYNTHETIC: preview encoding failure after histogram calculation leaves no stale value', async () => {
  const {session, processing, imageB} = await fixture();
  await session.openAsset(ASSET_A);
  const encode = processing.encode;
  let calls = 0;
  processing.encode = async (...args) => {
    if (++calls === 2) throw Error('SYNTHETIC_ENCODE_FAILURE');
    return encode(...args);
  };
  await assert.rejects(session.openAsset(ASSET_B), /SYNTHETIC_ENCODE_FAILURE/);
  assert.equal(session.state.asset.id, ASSET_B);
  assert.equal(session.state.histogram, null);
  assert.equal(session.state.afterURL, null);
  assert.match(session.state.error, /SYNTHETIC_ENCODE_FAILURE/);
  processing.encode = encode;
  await session.openAsset(ASSET_B);
  assert.deepEqual(session.state.histogram, analyzeHistogram(imageB));
});

test('HIST-SESSION-04 / SYNTHETIC: explicit preview invalidation revokes visible data and clears histogram', async () => {
  const {session} = await fixture();
  await session.openAsset(ASSET_A);
  assert.ok(session.state.histogram);
  assert.ok(session.state.beforeURL);
  assert.ok(session.state.afterURL);
  session.invalidatePreview();
  assert.equal(session.state.histogram, null);
  assert.equal(session.state.beforeURL, null);
  assert.equal(session.state.afterURL, null);
});

test('HIST-SESSION-05 / SYNTHETIC: late previous-asset render cannot replace current-asset histogram', async () => {
  const {session, processing, imageB} = await fixture();
  const originalRender = processing.render;
  const started = deferred(), release = deferred();
  processing.render = async (pixels, ...rest) => {
    if (pixels.data[0] === 20) {started.resolve(); await release.promise;}
    return originalRender(pixels, ...rest);
  };
  const first = session.openAsset(ASSET_A);
  await started.promise;
  await session.openAsset(ASSET_B);
  assert.deepEqual(session.state.histogram, analyzeHistogram(imageB));
  release.resolve();
  await assert.rejects(first, /STALE_OPERATION/);
  assert.equal(session.state.asset.id, ASSET_B);
  assert.deepEqual(session.state.histogram, analyzeHistogram(imageB));
});
