import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EditorSession, checksum, neutralRecipe} from '../src/session.mjs';
import {clippingOverlayURLForSides, nextClippingSides, clippingSidesForAsset,
  clippingControlsDisabled, clippingOverlayVisible, shouldToggleClippingWithJ} from '../src/editor-ui.mjs';
import {CLIPPING_OVERLAY_COLORS} from '../src/processing/clipping-overlay.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';

const assetId = '55555555-5555-4555-8555-555555555556';
const otherAssetId = '55555555-5555-4555-8555-555555555557';
const original = new TextEncoder().encode('HISTOGRAM_SIDES_SYNTHETIC_NON_RAW').buffer;
const otherOriginal = new TextEncoder().encode('HISTOGRAM_SIDES_OTHER_SYNTHETIC_NON_RAW').buffer;
const source = new Uint8ClampedArray([
  0, 0, 0, 255, 255, 255, 255, 255,
  255, 0, 70, 255, 60, 100, 130, 255,
  255, 255, 255, 0, 100, 110, 120, 255,
]);
const frame = () => ({width: 3, height: 2, data: source.slice()});
const sample = (data, index) => [...data.slice(index * 4, index * 4 + 4)];

async function fixture() {
  const asset = {id: assetId, name: 'histogram-sides.nonraw',
    sha256: await checksum(original), size: original.byteLength};
  const otherAsset = {id: otherAssetId, name: 'histogram-sides-other.nonraw',
    sha256: await checksum(otherOriginal), size: otherOriginal.byteLength};
  let saved = {assetId, revision: 1, body: neutralRecipe()};
  const otherSaved = {assetId: otherAssetId, revision: 1, body: neutralRecipe()};
  let cached = {asset: structuredClone(asset), proxy: frame(),
    history: [structuredClone(saved.body)], cursor: 0, revision: 1,
    reference: null, dirty: false};
  let otherCached = {asset: structuredClone(otherAsset), proxy: frame(),
    history: [structuredClone(otherSaved.body)], cursor: 0, revision: 1,
    reference: null, dirty: false};
  const blobs = new Map(), revoked = [];
  let nextURL = 0;
  const session = new EditorSession({
    api: {
      async listAssets() { return [structuredClone(asset), structuredClone(otherAsset)]; },
      async getRecipe(id) { return id === assetId ? structuredClone(saved) :
        id === otherAssetId ? structuredClone(otherSaved) : null; },
      async getOriginal(id) {
        if (id === assetId) return original.slice(0);
        if (id === otherAssetId) return otherOriginal.slice(0);
        throw Error('UNKNOWN_ASSET');
      },
      async assertPermission(id, action) {
        if (![assetId, otherAssetId].includes(id) || !['edit', 'export'].includes(action)) throw Error('DENIED');
        return {authorized: true};
      },
      async saveRecipe(id, revision, body) {
        if (id !== assetId || revision !== saved.revision) throw Error('REVISION_CONFLICT');
        saved = {assetId, revision: revision + 1, body: structuredClone(body)};
        return structuredClone(saved);
      },
    },
    storage: {
      async get(id) { return id === assetId ? structuredClone(cached) :
        id === otherAssetId ? structuredClone(otherCached) : undefined; },
      async put(id, value) {
        if (id === assetId) cached = structuredClone(value);
        else if (id === otherAssetId) otherCached = structuredClone(value);
        else throw Error('UNKNOWN_ASSET');
      },
    },
    processing: {
      async decodeRaw(_bytes, {mode}) {
        if (mode !== 'final') throw Error('SYNTHETIC_FINAL_ONLY');
        return {pixels: frame(), provenance: {fixture: 'SYNTHETIC_NON_RAW'}};
      },
      async render(pixels, recipe, options) {
        return renderPixels(pixels, recipe, {...options, validateRecipe, resolutionAssessment});
      },
      async encode(pixels, {format}) {
        return new Blob([pixels.data.slice()], {type: format === 'png' ? 'image/png' : 'image/jpeg'});
      },
    },
    urlAPI: {
      createObjectURL(blob) {
        const url = `blob:histogram-sides-${++nextURL}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
  });
  await session.initialize();
  await session.openAsset(assetId);
  const pixelsAt = async url => new Uint8ClampedArray(await blobs.get(url).arrayBuffer());
  return {session, saved: () => structuredClone(saved), asset, otherAsset, pixelsAt, revoked};
}

test('HIST-SIDES-01: black/white warnings are separately masked and never touch Original or Final', async () => {
  const {session, asset, pixelsAt} = await fixture();
  const initialRecipe = structuredClone(session.state.recipe);
  const {shadowClippingOverlayURL: shadowURL, highlightClippingOverlayURL: highlightURL,
    clippingOverlayURL: combinedURL} = session.state;
  assert.ok(shadowURL && highlightURL && combinedURL);
  const shadow = await pixelsAt(shadowURL);
  const highlight = await pixelsAt(highlightURL);
  const combined = await pixelsAt(combinedURL);
  assert.deepEqual(sample(shadow, 0), CLIPPING_OVERLAY_COLORS.shadow);
  assert.deepEqual(sample(shadow, 1), [0, 0, 0, 0]);
  assert.deepEqual(sample(highlight, 0), [0, 0, 0, 0]);
  assert.deepEqual(sample(highlight, 1), CLIPPING_OVERLAY_COLORS.highlight);
  assert.deepEqual(sample(shadow, 2), CLIPPING_OVERLAY_COLORS.shadow);
  assert.deepEqual(sample(highlight, 2), CLIPPING_OVERLAY_COLORS.highlight);
  assert.deepEqual(sample(combined, 2), CLIPPING_OVERLAY_COLORS.both);
  for (const pixels of [shadow, highlight, combined]) {
    assert.deepEqual(sample(pixels, 4), [0, 0, 0, 0]);
  }
  assert.deepEqual(new Uint8ClampedArray(await session.exportFinal({format: 'png'}).then(x => x.arrayBuffer())),
    source);
  assert.deepEqual(session.state.recipe, initialRecipe);
  assert.equal(session.state.dirty, false);
  assert.equal(await checksum(original), asset.sha256);
});

test('HIST-SIDES-02: side selection, J all-toggle and Preview URL lifecycle are independent of Recipe', async () => {
  const {session, pixelsAt, revoked, saved} = await fixture();
  const urls = structuredClone({
    clippingOverlayURL: session.state.clippingOverlayURL,
    shadowClippingOverlayURL: session.state.shadowClippingOverlayURL,
    highlightClippingOverlayURL: session.state.highlightClippingOverlayURL,
  });
  const initialRecipe = structuredClone(saved().body);
  let sides = {shadow: false, highlight: false};
  assert.equal(clippingOverlayURLForSides(urls, sides), null);
  sides = nextClippingSides(sides, 'shadow');
  assert.deepEqual(sides, {shadow: true, highlight: false});
  assert.equal(clippingOverlayURLForSides(urls, sides), urls.shadowClippingOverlayURL);
  sides = nextClippingSides(sides, 'highlight');
  assert.equal(clippingOverlayURLForSides(urls, sides), urls.clippingOverlayURL);
  sides = nextClippingSides(sides, 'both');
  assert.deepEqual(sides, {shadow: false, highlight: false});
  sides = nextClippingSides(sides, 'highlight');
  assert.equal(clippingOverlayURLForSides(urls, sides), urls.highlightClippingOverlayURL);
  sides = nextClippingSides(sides, 'both');
  assert.deepEqual(sides, {shadow: true, highlight: true});
  assert.throws(() => nextClippingSides(sides, 'invalid'), /INVALID_CLIPPING_SIDE/);
  await pixelsAt(urls.shadowClippingOverlayURL);
  session.invalidatePreview();
  for (const url of Object.values(urls)) assert.ok(revoked.includes(url));
  assert.equal(session.state.clippingOverlayURL, null);
  assert.equal(session.state.shadowClippingOverlayURL, null);
  assert.equal(session.state.highlightClippingOverlayURL, null);
  assert.deepEqual(saved().body, initialRecipe);
  assert.equal(session.state.dirty, false);
});

test('HIST-SIDES-03: Before/access disable warnings; asset switch resets both; J ignores editing and modifier keys', () => {
  const ids = {clippingOverlayURL: 'combined', shadowClippingOverlayURL: 'shadow',
    highlightClippingOverlayURL: 'highlight'};
  assert.deepEqual(clippingSidesForAsset('asset-a', 'asset-b', {shadow: true, highlight: true}),
    {shadow: false, highlight: false});
  assert.deepEqual(clippingSidesForAsset('asset-a', 'asset-a', {shadow: true, highlight: false}),
    {shadow: true, highlight: false});
  assert.equal(clippingOverlayURLForSides(ids,
    clippingSidesForAsset('asset-a', 'asset-b', {shadow: true, highlight: true})), null);
  for (const condition of [{overlayReady: false}, {overlayReady: true, view: 'before'},
    {overlayReady: true, view: 'after', busy: true},
    {overlayReady: true, view: 'after', blocked: true}]) {
    assert.equal(clippingControlsDisabled(condition), true);
  }
  assert.equal(clippingControlsDisabled({overlayReady: true, view: 'after'}), false);
  const display = {asset: {id: 'asset-a'}, afterURL: 'after', clippingOverlayURL: 'shadow'};
  assert.equal(clippingOverlayVisible(display, {enabled: true, view: 'before'}), false);
  assert.equal(clippingOverlayVisible(display, {enabled: true, view: 'after'}), true);
  assert.equal(clippingOverlayVisible(display, {enabled: true, view: 'after', blocked: true}), false);
  const key = {key: 'j', target: {closest: () => null}};
  assert.equal(shouldToggleClippingWithJ(key), true);
  assert.equal(shouldToggleClippingWithJ({...key, key: 'J'}), true);
  for (const denied of [{disabled: true}, {event: {...key, ctrlKey: true}},
    {event: {...key, altKey: true}}, {event: {...key, metaKey: true}},
    {event: {...key, repeat: true}}, {event: {...key, isComposing: true}},
    {event: {...key, key: 'k'}},
    {event: {...key, target: {closest: () => ({tagName: 'INPUT'})}}}]) {
    assert.equal(shouldToggleClippingWithJ(denied.event ?? key,
      {disabled: denied.disabled ?? false}), false);
  }
});

test('HIST-SIDES-05: switching to another saved Asset revokes old masks and supplies fresh ones', async () => {
  const {session, otherAsset, revoked, pixelsAt} = await fixture();
  const oldURLs = [session.state.clippingOverlayURL, session.state.shadowClippingOverlayURL,
    session.state.highlightClippingOverlayURL];
  await session.openAsset(otherAsset.id);
  assert.equal(session.state.asset.id, otherAsset.id);
  for (const url of oldURLs) assert.ok(revoked.includes(url));
  const newURLs = [session.state.clippingOverlayURL, session.state.shadowClippingOverlayURL,
    session.state.highlightClippingOverlayURL];
  for (const url of newURLs) {
    assert.ok(url && !oldURLs.includes(url));
    assert.equal((await pixelsAt(url)).length, source.length);
  }
  assert.equal(session.state.dirty, false);
  assert.equal(await checksum(otherOriginal), otherAsset.sha256);
});

test('HIST-SIDES-04: two native focusable buttons and 44px CSS targets are present in the product UI', async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL('../src/editor-ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/editorial-editor.css', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /button=element\('button',`suite-clipping-indicator/);
  assert.match(ui, /button\.id=`clipping-\$\{side\}-toggle`/);
  assert.match(ui, /button\.setAttribute\('aria-pressed','false'\)/);
  assert.match(ui, /clippingSidesForAsset\(previewAssetID,state\.asset\?\.id/);
  assert.match(ui, /clippingControlsDisabled\(\{overlayReady,view:mode/);
  assert.match(ui, /shouldToggleClippingWithJ\(event/);
  assert.match(css, /\.editorial-editor \.suite-clipping-indicator \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(css, /\.editorial-editor \.suite-clipping-indicator:focus-visible \{[^}]*outline:/);
});
