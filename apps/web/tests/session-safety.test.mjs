import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, checksum} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment, defaultCropSettings} from '../../../dist/apps/backend/src/crop-export.js';
import {renderPixels, makeProxyPixels} from '../src/processing/pure.mjs';
import {expandCanvasPixels} from '../src/processing/canvas-expand.mjs';
import {projectCanvasExpansion} from '../src/processing/canvas-expand-projection.mjs';
import {resizeExportPixels} from '../src/export-size.mjs';
import {ASSET_A, ASSET_B, PERSON_A, WHEN, detection, portrait, recipe, syntheticPixels, deferred} from './fixtures.mjs';

// Fake API/storage/decoder for deterministic state faults ONLY. No actual RAW decode/backend/browser claim.
async function fixture({withPortrait = false, pixels = syntheticPixels(), sessionOptions = {}, allowOpenFailure = false} = {}) {
  const bytes = new TextEncoder().encode('NON_RAW session state-only bytes').buffer;
  const sha = await checksum(bytes), asset = {id: ASSET_A, name: 'state-only.raw', sha256: sha, size: bytes.byteLength};
  const other = {...asset, id: ASSET_B}, reference = {...portrait(), originalSHA256: sha};
  const initial = recipe(withPortrait ? reference : null), remote = new Map([[asset.id, {revision: 1, body: structuredClone(initial)}]]);
  const cache = new Map([[asset.id, {asset, proxy: structuredClone(pixels), history: [initial], cursor: 0, revision: 1, reference: withPortrait ? reference : null, dirty: false}]]);
  const calls = [], api = {
    listAssets: async () => [asset, other], createAsset: async () => other,
    putOriginal: async (id, buffer) => {calls.push(['putOriginal', id, buffer.slice(0)]); return other;},
    getOriginal: async () => {calls.push(['getOriginal']); return bytes.slice(0);}, getRecipe: async id => structuredClone(remote.get(id) || null),
    saveRecipe: async (id, expected, body) => {const current = remote.get(id)?.revision || 0;
      if (expected !== current) throw Error('REVISION_CONFLICT');
      const saved = {revision: current + 1, body: structuredClone(body)}; remote.set(id, saved); return structuredClone(saved);}
  };
  const storage = {get: async id => structuredClone(cache.get(id)), put: async (id, value) => {cache.set(id, structuredClone(value));}};
  const processing = {
    syntheticTestOnly: true, // This injected fake never invokes an installed detector or decodes RAW.
    decodeRaw: async (buffer, {mode} = {}) => {calls.push(['decode', mode]);
      if (!['proxy', 'final'].includes(mode)) throw Error('INVALID_DECODE_MODE');
      return {pixels: structuredClone(pixels), provenance: {fixture: 'NON_RAW_SYNTHETIC'}, metadata: {fixture: true}};},
    makeProxy: async (p, edge) => makeProxyPixels(p, edge), detectPeople: async () => {calls.push(['detectPeople']); return [detection(), detection(0.6)];},
    render: async (p, doc, options) => {calls.push(['render', !!doc.parameters.extendedParameters.portrait]);
      const rendered=renderPixels(p,doc,{...options,validateRecipe,resolutionAssessment});
      const expand=doc.parameters.extendedParameters.canvasExpand;
      return expand?expandCanvasPixels(rendered,projectCanvasExpansion(rendered,expand)):rendered;},
    resizeForExport: async (p, settings, options) => {calls.push(['resizeForExport',settings.kind]);return resizeExportPixels(p,settings,options);},
    encode: async (p, options) => {calls.push(['encode', options.format,p.width,p.height]); return new Blob([p.data], {type: `image/${options.format}`});}
  };
  let urls = 0; const urlAPI = {createObjectURL: () => `blob:synthetic-${++urls}`, revokeObjectURL() {}};
  const session = new EditorSession({api, processing, storage, urlAPI, clock: () => WHEN,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY', ...sessionOptions});
  await session.initialize(); let openError;
  try {await session.openAsset(asset.id);} catch (error) {if (!allowOpenFailure) throw error; openError = error;}
  return {session, api, storage, processing, asset, other, bytes, cache, remote, calls, reference, openError};
}

test('WEB-ST01 / MOCK_STATE: snapshots are isolated from observer mutation', async () => {
  const {session} = await fixture(); const exposed = session.state; exposed.recipe.parameters.exposure = 4;
  assert.equal(session.state.recipe.parameters.exposure, 0);
});

test('WEB-ST02 / MOCK_STATE: global edit undo redo and reload retain exact saved values', async () => {
  const {session} = await fixture(); await session.setAdjustment('exposure', 1);
  await session.undo(); assert.equal(session.state.recipe.parameters.exposure, 0);
  await session.redo(); assert.equal(session.state.recipe.parameters.exposure, 1);
  await session.save(); await session.reload(); assert.equal(session.state.recipe.parameters.exposure, 1); assert.equal(session.state.dirty, false);
});

test('WEB-ST03 / MOCK_STATE: save conflict keeps unsaved recipe and does not mark clean', async () => {
  const {session, api, cache, asset} = await fixture(); await session.setAdjustment('exposure', 1);
  const before = structuredClone(cache.get(asset.id)); api.saveRecipe = async () => {throw Error('REVISION_CONFLICT');};
  await assert.rejects(session.save(), /REVISION_CONFLICT/);
  assert.equal(session.state.dirty, true); assert.equal(session.state.recipe.parameters.exposure, 1);
  assert.deepEqual(cache.get(asset.id), before); assert.equal(session.state.busy, null);
});

test('WEB-ST04 / MOCK_STATE: quota failure does not overwrite already durable unsaved draft', async () => {
  const {session, storage, cache, asset} = await fixture(); await session.setAdjustment('exposure', 0.5);
  const before = structuredClone(cache.get(asset.id)); storage.put = async () => {throw Error('QuotaExceededError');};
  await assert.rejects(session.setAdjustment('contrast', 1.5), /Quota/);
  assert.equal(session.state.recipe.parameters.exposure, 0.5); assert.equal(session.state.dirty, true);
  assert.deepEqual(cache.get(asset.id), before);
});

test('WEB-ST05 / MOCK_STATE: unknown person selection clears previous selected UUID', async () => {
  const {session} = await fixture({withPortrait: true}); await session.detectPeople(); await session.selectPerson(PERSON_A);
  await assert.rejects(session.selectPerson(ASSET_B), /UNKNOWN_PERSON/); assert.equal(session.state.selectedPersonID, null);
});

test('WEB-ST06 / MOCK_STATE: missing face during revalidation clears previous selection without recipe replacement', async () => {
  const {session, processing} = await fixture({withPortrait: true}); await session.detectPeople(); await session.selectPerson(PERSON_A);
  const before = session.state.recipe; processing.detectPeople = async () => [detection()];
  await assert.rejects(session.detectPeople(), /INVENTORY/);
  assert.equal(session.state.selectedPersonID, null); assert.deepEqual(session.state.recipe, before);
});

test('WEB-ST07 / MOCK_STATE: same-asset hidden history UUID tamper is refused on reload', async () => {
  const {session, cache, asset, reference} = await fixture({withPortrait: true});
  const cached = cache.get(asset.id); cached.dirty = true;
  const changed = structuredClone(reference); changed.targets[0].id = ASSET_B;
  cached.history = [recipe(changed), recipe(reference)]; cached.cursor = 1;
  await assert.rejects(session.reload(), /PERSON_BINDING/); assert.deepEqual(cache.get(asset.id).history[0], recipe(changed));
});

test('WEB-ST08 / MOCK_STATE: export refuses changed server revision without adopting it', async () => {
  const {session, remote, asset} = await fixture(); const before = session.state.recipe;
  remote.set(asset.id, {revision: 2, body: recipe()});
  await assert.rejects(session.exportFinal({format: 'png'}), /FIXED_RECIPE_MISMATCH/);
  assert.deepEqual(session.state.recipe, before); assert.equal(session.state.revision, 1); assert.equal(session.state.exporting, false);
});

test('WEB-ST09 / MOCK_STATE: corrupted Original checksum prevents decode and output', async () => {
  const {session, api, calls} = await fixture(); api.getOriginal = async () => new Uint8Array([1, 2, 3]).buffer;
  await assert.rejects(session.exportFinal({format: 'png'}), /CHECKSUM/);
  assert.equal(calls.some(c => c[0] === 'decode'), false); assert.equal(session.state.exporting, false);
});

test('WEB-ST10 / MOCK_STATE: cancellation during decode refuses publish even if decoder resolves later', async () => {
  const {session, processing, bytes} = await fixture(); const gate = deferred(), entered = deferred();
  processing.decodeRaw = async () => {entered.resolve(); return gate.promise;};
  const exporting = session.exportFinal({format: 'png'}); await entered.promise; session.cancelExport();
  gate.resolve({pixels: syntheticPixels(), provenance: {fixture: 'NON_RAW'}});
  await assert.rejects(exporting, /ABORT/); assert.equal(session.state.exporting, false);
  assert.equal(new TextDecoder().decode(bytes), 'NON_RAW session state-only bytes');
});

test('WEB-ST11 / MOCK_STATE: concurrent edits are gated before pending persistence to prevent lost update', async () => {
  const {session, storage} = await fixture(); const gate = deferred(), entered = deferred(), write = storage.put;
  storage.put = async (...args) => {entered.resolve(); await gate.promise; return write(...args);};
  const first = session.setAdjustment('exposure', 1); await entered.promise;
  const second = session.setAdjustment('contrast', 1.5);
  gate.resolve();
  await assert.rejects(second, /OPERATION_IN_PROGRESS/); await first;
  assert.equal(session.state.recipe.parameters.exposure, 1);
});

test('WEB-ST12 / MOCK_STATE: mismatched dirty cache revision cannot silently discard the draft', async () => {
  const {session, cache, asset, remote} = await fixture(); const cached = cache.get(asset.id);
  cached.dirty = true; cached.history = [recipe()]; cached.history[0].parameters.exposure = 1.5;
  remote.set(asset.id, {revision: 2, body: recipe()});
  await assert.rejects(session.reload(), /CONFLICT|DRAFT|REVISION/);
  assert.equal(cache.get(asset.id).history[0].parameters.exposure, 1.5); assert.equal(cache.get(asset.id).dirty, true);
});

test('WEB-ST13 / MOCK_STATE: import calls agreed proxy decoder mode with explicitly NON_RAW fake decoder', async () => {
  const {session, api, bytes, calls, other} = await fixture(); api.getRecipe = async () => null;
  const file = {name: 'explicitly-nonraw-test-fixture.dng', size: bytes.byteLength, arrayBuffer: async () => bytes.slice(0)};
  await session.importRaw(file); // Decoder here is explicitly a numerical fake, not RAW evidence.
  assert.ok(calls.some(c => c[0] === 'decode' && c[1] === 'proxy'));
  assert.equal(session.state.asset.id, other.id); assert.equal(calls.filter(c => c[0] === 'putOriginal').length, 1);
});

test('WEB-ST14 / MOCK_STATE: cold-cache reopen uses the agreed proxy decoder mode', async () => {
  const {session, cache, calls, asset} = await fixture(); cache.delete(asset.id);
  await session.reload(); assert.ok(calls.some(c => c[0] === 'decode' && c[1] === 'proxy'));
});

test('WEB-ST15 / MOCK_STATE: source-copy mutation by decoder cannot change retained Original bytes', async () => {
  const {session, processing, bytes} = await fixture(); const before = new Uint8Array(bytes).slice();
  processing.decodeRaw = async input => {new Uint8Array(input).fill(0); return {pixels: syntheticPixels(), provenance: {fixture: 'NON_RAW'}};};
  const output = await session.exportFinal({format: 'png'}); assert.ok(output.size > 0);
  assert.deepEqual(new Uint8Array(bytes), before);
});

test('WEB-ST16 / MOCK_STATE: decode failure after immutable upload keeps uploaded bytes and prior asset', async () => {
  const {session, processing, bytes, calls, asset} = await fixture();
  processing.decodeRaw = async () => {throw Error('UNSUPPORTED_RAW_FIXTURE');};
  const file = {name: 'explicitly-nonraw-test-fixture.dng', size: bytes.byteLength, arrayBuffer: async () => bytes.slice(0)};
  await assert.rejects(session.importRaw(file), /UNSUPPORTED_RAW_FIXTURE/);
  const uploaded = calls.find(c => c[0] === 'putOriginal'); assert.ok(uploaded);
  assert.deepEqual(new Uint8Array(uploaded[2]), new Uint8Array(bytes));
  assert.equal(session.state.asset.id, asset.id); assert.equal(session.state.busy, null);
});

test('WEB-ST17 / MOCK_STATE: failed new-asset preview cannot display prior-asset pixels as the new asset', async () => {
  const {session, cache, other, processing} = await fixture(); assert.ok(session.state.afterURL);
  cache.set(other.id, {asset: other, proxy: syntheticPixels(), history: [recipe()], cursor: 0, revision: 0, reference: null, dirty: false});
  processing.render = async () => {throw Error('RENDER_FAILURE');};
  await assert.rejects(session.openAsset(other.id), /RENDER_FAILURE/);
  assert.equal(session.state.afterURL, null); assert.equal(session.state.beforeURL, null);
  assert.equal(session.state.selectedPersonID, null); assert.equal(session.state.busy, null);
});

test('WEB-ST18 / MOCK_STATE: failed edited preview clears stale pixels but retains the new durable draft', async () => {
  const {session, cache, asset, processing} = await fixture(); processing.render = async () => {throw Error('RENDER_FAILURE');};
  await assert.rejects(session.setAdjustment('exposure', 1), /RENDER_FAILURE/);
  assert.equal(session.state.afterURL, null); assert.equal(session.state.beforeURL, null);
  assert.equal(session.state.recipe.parameters.exposure, 1); assert.equal(session.state.dirty, true);
  assert.equal(cache.get(asset.id).history.at(-1).parameters.exposure, 1);
});

test('WEB-ST19 / MOCK_STATE: self-consistent corrupted cache inventory cannot override authoritative saved person geometry', async () => {
  const {session, cache, asset, reference} = await fixture({withPortrait: true});
  const altered = structuredClone(reference), first = structuredClone(altered.targets[0].anchor);
  altered.targets[0].anchor = structuredClone(altered.targets[1].anchor); altered.targets[1].anchor = first;
  const cached = cache.get(asset.id); cached.reference = altered; cached.history = [recipe(altered)]; cached.cursor = 0; cached.dirty = true;
  const damaged = structuredClone(cached);
  await assert.rejects(session.reload(), /BINDING|INVENTORY/);
  assert.deepEqual(cache.get(asset.id), damaged); assert.equal(session.state.selectedPersonID, null);
});

test('WEB-ST20 / MOCK_STATE: person edit Undo/reanalysis/Redo retains known UUIDs and geometry', async () => {
  const {session, reference} = await fixture({withPortrait: true});
  await session.detectPeople(); await session.selectPerson(PERSON_A); await session.setAdjustment('faceBrightness', 1.5);
  await session.undo(); assert.equal(session.state.recipe.parameters.extendedParameters.portrait.targets[0].value, 1);
  await session.detectPeople(); assert.deepEqual(session.state.people.map(t => ({id: t.id, anchor: t.anchor})), reference.targets.map(t => ({id: t.id, anchor: t.anchor})));
  await session.redo(); const p = session.state.recipe.parameters.extendedParameters.portrait;
  assert.equal(p.targets[0].value, 1.5); assert.deepEqual(p.targets.map(t => ({id: t.id, anchor: t.anchor})), reference.targets.map(t => ({id: t.id, anchor: t.anchor})));
});

test('WEB-ST21 / MOCK_STATE: incomplete fresh Final person inventory refuses output despite valid saved targets', async () => {
  const {session, processing} = await fixture({withPortrait: true}); processing.detectPeople = async () => [detection()];
  await assert.rejects(session.exportFinal({format: 'png'}), /INVENTORY/);
  assert.equal(session.state.exporting, false); assert.equal(session.state.selectedPersonID, null);
  assert.equal(session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status === 'PASS_PIPELINE_ONLY'), false);
});

test('WEB-ST22 / MOCK_STATE: server revision changes during encode cannot publish stale Final', async () => {
  const {session, processing, remote, asset} = await fixture();
  processing.encode = async () => {remote.set(asset.id, {revision: 2, body: recipe()}); return new Blob(['NON_IMAGE_OUTPUT']);};
  await assert.rejects(session.exportFinal({format: 'png'}), /FIXED_RECIPE_MISMATCH/);
  assert.equal(session.state.revision, 1); assert.equal(session.state.exporting, false);
  assert.equal(session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status === 'PASS_PIPELINE_ONLY'), false);
});

test('WEB-ST23 / SYNTHETIC_MOCK_STATE: rotate-crop Undo/Redo save/reload fixed export retains source pixels and NON_RAW bytes', async () => {
  const pixels = syntheticPixels(120, 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) {const i = (y * 120 + x) * 4; pixels.data[i] = x; pixels.data[i + 1] = y;}
  const beforePixels = pixels.data.slice(), f = await fixture({pixels}), {session, bytes} = f;
  const beforeOriginal = new Uint8Array(bytes).slice();
  await session.setAdjustment('rotationDegrees', 90); await session.setAdjustment('cropRatio', '4:5');
  const fixed = session.state.recipe, crop = fixed.parameters.extendedParameters.crop;
  assert.equal(crop.rotation, 90); assert.equal(crop.custom_size, false); assert.equal(crop.requested_dpi, 96);
  assert.equal(crop.width_mm, undefined); assert.equal(crop.height_mm, undefined);
  assert.ok(Math.abs(crop.crop_rect.y - 1 / 12) < 1e-12);
  assert.deepEqual(resolutionAssessment(120, 80, crop).available, {width: 80, height: 100});
  await session.undo(); assert.equal(session.state.recipe.parameters.extendedParameters.crop, undefined);
  assert.equal(session.state.recipe.parameters.rotationDegrees, 90);
  await session.redo(); assert.deepEqual(session.state.recipe, fixed);
  await session.save(); await session.reload(); assert.deepEqual(session.state.recipe, fixed);
  const output = await session.exportFinal({format: 'png'}), rgba = new Uint8Array(await output.arrayBuffer());
  // Fake encoder wraps actual rendered RGBA; this is not a PNG/RAW decoding assertion.
  assert.equal(rgba.length, 80 * 100 * 4);
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [109, 0, 64, 255]);
  assert.deepEqual(Array.from(rgba.slice(-4)), [10, 79, 64, 255]);
  const again = await session.exportFinal({format: 'png'}); assert.deepEqual(new Uint8Array(await again.arrayBuffer()), rgba);
  assert.deepEqual(pixels.data, beforePixels); assert.deepEqual(new Uint8Array(bytes), beforeOriginal);
});

test('WEB-ST24 / SYNTHETIC_MOCK_STATE: all offered crop ratios recenter after rotation; Original removes Crop only', async () => {
  const {session} = await fixture({pixels: syntheticPixels(120, 80)});
  for (const [ratio, expected] of [['1:1', 1], ['4:5', 0.8], ['3:2', 1.5]]) {
    await session.setAdjustment('cropRatio', ratio);
    assert.equal(session.state.recipe.parameters.extendedParameters.crop.preset_id, 'ratio.' + ratio);
    for (const rotation of [0, 90, 180, 270, 0]) {
      await session.setAdjustment('rotationDegrees', rotation);
      const crop = session.state.recipe.parameters.extendedParameters.crop, rect = crop.crop_rect;
      const w = rotation % 180 ? 80 : 120, h = rotation % 180 ? 120 : 80;
      assert.ok(Math.abs(w * rect.width / (h * rect.height) - expected) < 1e-12);
      assert.ok(Math.abs(rect.x - (1 - rect.width) / 2) < 1e-12); assert.ok(Math.abs(rect.y - (1 - rect.height) / 2) < 1e-12);
      assert.equal(crop.rotation, rotation);
    }
  }
  await session.setAdjustment('rotationDegrees', 90); await session.setAdjustment('cropRatio', 'original');
  assert.equal(session.state.recipe.parameters.extendedParameters.crop, undefined);
  assert.equal(session.state.recipe.parameters.processingOrder.includes('crop'), false);
  assert.equal(session.state.recipe.parameters.rotationDegrees, 90);
  await assert.rejects(session.setAdjustment('cropRatio', 'A0'), /CROP_RATIO_UNSUPPORTED/);
});

test('WEB-ST25 / MOCK_STATE: global range endpoints accepted and illegal values rejected without changing draft', async () => {
  const {session} = await fixture({pixels: syntheticPixels(4, 4)});
  for (const [key, values] of [['exposure', [-4, 4]], ['contrast', [0, 2]], ['saturation', [0, 2]],
    ['rotationDegrees', [-270, -180, -90, 0, 90, 180, 270]]]) {
    for (const value of values) {await session.setAdjustment(key, value); assert.equal(session.state.recipe.parameters[key], value);}
  }
  for (const [key, values] of [['exposure', [-4.001, 4.001]], ['contrast', [-0.001, 2.001]], ['saturation', [-0.001, 2.001]], ['rotationDegrees', [-360, 360, 45]]]) {
    for (const value of [...values, NaN, Infinity, '1']) {const before = session.state.recipe;
      await assert.rejects(session.setAdjustment(key, value), /ADJUSTMENT_RANGE/); assert.deepEqual(session.state.recipe, before);}
  }
});

test('WEB-ST26 / SYNTHETIC_MOCK_STATE: tiny ratio Crop fails without zero-sized image or partial export success', async () => {
  const {session} = await fixture({pixels: syntheticPixels(1, 1)});
  await assert.rejects(session.setAdjustment('cropRatio', '4:5'));
  assert.equal(session.state.afterURL, null); assert.equal(session.state.dirty, true);
  await assert.rejects(session.exportFinal({format: 'png'}), /SAVE_REQUIRED/);
  assert.equal(session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status === 'PASS_PIPELINE_ONLY'), false);
});

test('WEB-ST27 / SYNTHETIC_MOCK_STATE: session derives one Crop from full source dimensions despite rounded Proxy', async () => {
  const full = syntheticPixels(17, 11), proxy = makeProxyPixels(full, 8), {session, processing} = await fixture({pixels: proxy});
  processing.decodeRaw = async () => ({pixels: structuredClone(full), provenance: {fixture: 'NON_RAW_SYNTHETIC'}});
  await session.setAdjustment('cropRatio', '1:1');
  let crop = session.state.recipe.parameters.extendedParameters.crop;
  assert.ok(Math.abs(crop.crop_rect.width - 11 / 17) < 1e-12);
  await session.setAdjustment('rotationDegrees', 90);
  crop = session.state.recipe.parameters.extendedParameters.crop;
  assert.ok(Math.abs(crop.crop_rect.height - 11 / 17) < 1e-12);
  const frozen = session.state.recipe; await session.save(); await session.reload();
  const final = await session.exportFinal({format: 'png'});
  assert.equal(final.size, 11 * 11 * 4); assert.deepEqual(session.state.recipe, frozen);
});

test('WEB-ST28 / SYNTHETIC_MOCK_STATE: free Crop preserves selected region through rotation Undo/Redo save/reload and fixed export', async () => {
  const pixels = syntheticPixels(120, 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) {const i = (y * 120 + x) * 4; pixels.data[i] = x; pixels.data[i + 1] = y;}
  const beforePixels = pixels.data.slice(), {session, remote, asset, bytes} = await fixture({pixels}), beforeBytes = new Uint8Array(bytes).slice();
  const savedFree = recipe(); savedFree.parameters.processingOrder.push('crop');
  const originalRect = {x: 0.25, y: 0.125, width: 0.5, height: 0.5};
  savedFree.parameters.extendedParameters.crop = {...defaultCropSettings(), preset_id: 'ratio.free', preset_name: 'Free', crop_rect: originalRect};
  assert.equal(savedFree.parameters.extendedParameters.crop.crop_ratio, undefined);
  validateRecipe(savedFree); remote.set(asset.id, {revision: 1, body: savedFree}); await session.reload();
  await session.setAdjustment('rotationDegrees', 90);
  const fixed = session.state.recipe;
  assert.deepEqual(fixed.parameters.extendedParameters.crop.crop_rect, {x: 0.125, y: 0.25, width: 0.5, height: 0.5});
  assert.equal(fixed.parameters.extendedParameters.crop.crop_ratio, undefined);
  await session.undo(); assert.deepEqual(session.state.recipe, savedFree);
  await session.redo(); assert.deepEqual(session.state.recipe, fixed);
  await session.save(); await session.reload(); assert.deepEqual(session.state.recipe, fixed);
  const output = await session.exportFinal({format: 'png'}), rgba = new Uint8Array(await output.arrayBuffer());
  assert.equal(rgba.length, 40 * 60 * 4);
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [89, 10, 64, 255]);
  assert.deepEqual(Array.from(rgba.slice(-4)), [30, 49, 64, 255]);
  for (const rotation of [180, 270, 0]) await session.setAdjustment('rotationDegrees', rotation);
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.crop.crop_rect, originalRect);
  assert.deepEqual(pixels.data, beforePixels); assert.deepEqual(new Uint8Array(bytes), beforeBytes);
});

test('WEB-ST29 / PRIVACY_MOCK_STATE: unknown status and synthetic token without explicit fake marker are refused', () => {
  for (const status of ['CONFIRMED', 'APPROVED', '', null, false]) {
    assert.throws(() => new EditorSession({processing: {syntheticTestOnly: true}, personProcessingStatus: status}), /PERSON_PRIVACY_CONFIGURATION_INVALID/);
  }
  for (const processing of [{}, {syntheticTestOnly: false}, {syntheticTestOnly: 'true'}]) {
    assert.throws(() => new EditorSession({processing, personProcessingStatus: 'SYNTHETIC_TEST_ONLY'}), /PERSON_PRIVACY_CONFIGURATION_INVALID/);
  }
  assert.equal(new EditorSession({processing: {}}).state.personProcessingStatus, 'PRIVACY_REVIEW_REQUIRED');
});

test('WEB-ST30 / PRIVACY_MOCK_STATE: default person detection refuses before detector and clears stale selection', async () => {
  const {session, calls, cache, asset, bytes} = await fixture({sessionOptions: {personProcessingStatus: undefined}});
  const before = session.state.recipe, stored = structuredClone(cache.get(asset.id)), original = new Uint8Array(bytes).slice();
  // Seed a stale in-memory selection to verify rejection cleanup, not a valid detection claim.
  session.data.selectedPersonID = PERSON_A; session.data.people = [{id: PERSON_A}]; session.detections = [detection()]; calls.length = 0;
  await assert.rejects(session.detectPeople(), /PERSON_PRIVACY_REVIEW_REQUIRED/);
  assert.equal(session.state.selectedPersonID, null); assert.deepEqual(session.state.people, []); assert.deepEqual(session.detections, []);
  assert.deepEqual(calls, []); assert.deepEqual(session.state.recipe, before); assert.deepEqual(cache.get(asset.id), stored);
  assert.deepEqual(new Uint8Array(bytes), original);
  assert.ok(session.state.evidence.some(e => e.test_id === 'WEB_PERSON_PRIVACY' && e.status === 'REJECT'));
});

test('WEB-ST31 / PRIVACY_MOCK_STATE: saved portrait reopen keeps body and history but cannot detect or render portrait', async () => {
  const {session, openError, calls, asset, cache, remote, reference} = await fixture({withPortrait: true,
    sessionOptions: {personProcessingStatus: undefined}, allowOpenFailure: true});
  assert.match(openError.message, /PERSON_PRIVACY_REVIEW_REQUIRED/);
  assert.deepEqual(session.state.recipe, recipe(reference)); assert.deepEqual(session.history, [recipe(reference)]);
  assert.deepEqual(remote.get(asset.id).body, recipe(reference)); assert.deepEqual(cache.get(asset.id).history, [recipe(reference)]);
  assert.equal(session.state.afterURL, null); assert.equal(session.state.beforeURL, null); assert.equal(session.state.selectedPersonID, null);
  assert.equal(session.state.busy, null); assert.equal(session.state.dirty, false);
  assert.equal(calls.some(c => c[0] === 'detectPeople' || c[0] === 'render'), false);
});

test('WEB-ST32 / PRIVACY_MOCK_STATE: portrait Final refuses before Original fetch decode detector render or encode', async () => {
  const {session, calls, bytes, cache, remote, asset} = await fixture({withPortrait: true,
    sessionOptions: {personProcessingStatus: undefined}, allowOpenFailure: true});
  const body = session.state.recipe, stored = structuredClone(cache.get(asset.id)), server = structuredClone(remote.get(asset.id)), original = new Uint8Array(bytes).slice();
  session.data.selectedPersonID = PERSON_A; session.detections = [detection()]; calls.length = 0;
  await assert.rejects(session.exportFinal({format: 'png'}), /PERSON_PRIVACY_REVIEW_REQUIRED/);
  assert.deepEqual(calls, []); assert.equal(session.state.exporting, false); assert.equal(session.state.selectedPersonID, null);
  assert.deepEqual(session.state.recipe, body); assert.deepEqual(cache.get(asset.id), stored); assert.deepEqual(remote.get(asset.id), server);
  assert.deepEqual(new Uint8Array(bytes), original);
  assert.equal(session.state.evidence.some(e => e.test_id === 'WEB_FINAL_EXPORT' && e.status === 'PASS_PIPELINE_ONLY'), false);
});

test('WEB-ST33 / PRIVACY_MOCK_STATE: person selection and adjustment reject without changing saved or draft body', async () => {
  const {session, calls, cache, remote, asset} = await fixture({withPortrait: true,
    sessionOptions: {personProcessingStatus: undefined}, allowOpenFailure: true});
  const body = session.state.recipe, stored = structuredClone(cache.get(asset.id)), server = structuredClone(remote.get(asset.id)); calls.length = 0;
  for (const action of [() => session.selectPerson(PERSON_A), () => session.setAdjustment('faceBrightness', 2)]) {
    session.data.selectedPersonID = PERSON_A; session.detections = [detection()];
    await assert.rejects(action(), /PERSON_PRIVACY_REVIEW_REQUIRED/); assert.equal(session.state.selectedPersonID, null);
  }
  assert.deepEqual(calls, []); assert.deepEqual(session.state.recipe, body); assert.deepEqual(cache.get(asset.id), stored);
  assert.deepEqual(remote.get(asset.id), server); assert.equal(session.state.dirty, false);
});

test('WEB-ST34 / PRIVACY_MOCK_STATE: default block does not disable nonportrait global save reload or synthetic Final', async () => {
  const {session, calls, bytes} = await fixture({sessionOptions: {personProcessingStatus: undefined}}), original = new Uint8Array(bytes).slice();
  await session.setAdjustment('exposure', 1); await session.undo(); await session.redo(); await session.save(); await session.reload();
  assert.equal(session.state.recipe.parameters.exposure, 1);
  const output = await session.exportFinal({format: 'png'}); assert.ok(output.size > 0);
  assert.equal(calls.some(c => c[0] === 'detectPeople' || (c[0] === 'render' && c[1])), false);
  assert.equal(session.state.personProcessingStatus, 'PRIVACY_REVIEW_REQUIRED'); assert.deepEqual(new Uint8Array(bytes), original);
});

test('WEB-ST35 / ARTIFICIAL_ONLY: explicit production approval reaches portrait edit, save, reload and fixed Final', async () => {
  const {session,calls,remote,asset,bytes}=await fixture({withPortrait:true,sessionOptions:{personProcessingStatus:'PRODUCTION_PERSON_APPROVED'}});
  await session.detectPeople();await session.selectPerson(PERSON_A);
  await session.setAdjustment('faceBrightness',1);await session.save();await session.reload();
  const output=await session.exportFinal({format:'png'});
  assert.ok(output.size>0);assert.equal(session.state.personProcessingStatus,'PRODUCTION_PERSON_APPROVED');
  assert.ok(calls.some(c=>c[0]==='detectPeople'));assert.ok(calls.some(c=>c[0]==='render'&&c[1]));
  assert.equal(remote.get(asset.id).body.parameters.extendedParameters.portrait.targets.find(t=>t.id===PERSON_A).value,1);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST36 / ARTIFICIAL_ONLY: tone curve pixel output survives Undo/Redo, save/reload and fixed Final',async()=>{
  const {session,bytes}=await fixture();
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('curve.shadows',70);
  assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve.shadows,70);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments,undefined);
  await session.redo();await session.save();await session.reload();
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.toneCurve.shadows,70);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST37 / ARTIFICIAL_ONLY: temperature, tint and denoise survive CAS save/reload and fixed Final',async()=>{
  const {session,bytes,remote,asset}=await fixture();
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('color.temperature',35);
  await session.setAdjustment('color.tint',-20);
  await session.setAdjustment('detail.denoise',40);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail,undefined);
  await session.redo();await session.save();await session.reload();
  const extra=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments;
  assert.equal(extra.color.temperature,35);assert.equal(extra.color.tint,-20);assert.equal(extra.detail.denoise,40);
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments,extra);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST38 / ARTIFICIAL_ONLY: grain is an actual saved and repeatable Final effect',async()=>{
  const {session,bytes,remote,asset}=await fixture();
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('detail.grain',80);
  const first=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.grain;
  assert.equal(first.amount,80);assert.ok(Number.isSafeInteger(first.seed));
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.detail.grain,first);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  const repeated=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);assert.deepEqual(repeated,changed);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST39 / ARTIFICIAL_ONLY: RGB Levels survives Undo/Redo, save/reload and fixed Final',async()=>{
  const {session,bytes,remote,asset}=await fixture();
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('levels.master.inputBlack',20);
  await session.setAdjustment('levels.red.gamma',1.5);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.levels.red,undefined);
  await session.redo();await session.save();await session.reload();
  const levels=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.levels;
  assert.equal(levels.master.inputBlack,20);assert.equal(levels.red.gamma,1.5);
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.levels,levels);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST40 / ARTIFICIAL_ONLY: export sizing changes Final bytes without changing Recipe or Original',async()=>{
  const {session,bytes,calls}=await fixture({pixels:syntheticPixels(8,6)});
  const prior=session.state.recipe;
  const original=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  const reduced=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50}})).arrayBuffer());
  assert.equal(original.byteLength,8*6*4);assert.equal(reduced.byteLength,4*3*4);
  assert.deepEqual(calls.filter(call=>call[0]==='resizeForExport'),[['resizeForExport','percentage']]);
  assert.deepEqual(calls.at(-1),['encode','png',4,3]);
  assert.deepEqual(session.state.recipe,prior);assert.equal(session.state.dirty,false);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
  const again=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50}})).arrayBuffer());
  assert.deepEqual(again,reduced);
});

test('WEB-ST41 / ARTIFICIAL_ONLY: invalid export size rejects without encoding or mutating state',async()=>{
  const {session,calls}=await fixture({pixels:syntheticPixels(8,6)});const prior=session.state.recipe,encodesBefore=calls.filter(call=>call[0]==='encode').length;
  await assert.rejects(session.exportFinal({format:'png',size:{kind:'width',value:10}}),/EXPORT_SIZE_WIDTH_INVALID/);
  assert.equal(calls.filter(call=>call[0]==='encode').length,encodesBefore);assert.deepEqual(session.state.recipe,prior);
  assert.equal(session.state.exporting,false);
});

test('WEB-ST42 / ARTIFICIAL_ONLY: Glow affects pixels and survives Undo/Redo, save/reload and fixed Final',async()=>{
  const {session,remote,asset,bytes}=await fixture({pixels:syntheticPixels(8,8,200)});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('glow.intensity',70);
  await session.setAdjustment('glow.radius',3);
  await session.setAdjustment('glow.threshold',100);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow.threshold,undefined);
  await session.redo();await session.save();await session.reload();
  const glow=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow;
  assert.deepEqual(glow,{intensity:70,radius:3,threshold:100});
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.glow,glow);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),changed);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST43 / ARTIFICIAL_ONLY: RGB point curve affects Final and survives history and durable reload',async()=>{
  const {session,remote,asset,bytes}=await fixture({pixels:syntheticPixels(8,8,64)});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  const points=[{x:0,y:0},{x:128,y:200},{x:255,y:255}];
  await session.setPointCurve('master',points);
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.master,points);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.pointCurves.master,points);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),changed);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
});

test('WEB-ST44 / ARTIFICIAL_ONLY: invalid point curve rejects before history or Final mutation',async()=>{
  const {session}=await fixture();const before=session.state;
  await assert.rejects(session.setPointCurve('master',[{x:1,y:1},{x:255,y:255}]),/INVALID_POST_DECODE_ADJUSTMENTS/);
  await assert.rejects(session.setPointCurve('cyan',[{x:0,y:0},{x:255,y:255}]),/POINT_CURVE_CHANNEL_UNSUPPORTED/);
  assert.deepEqual(session.state.recipe,before.recipe);assert.equal(session.state.canUndo,before.canUndo);assert.equal(session.state.dirty,before.dirty);
});

test('WEB-ST45 / ARTIFICIAL_ONLY: post-crop vignette changes Final and survives history and durable reload',async()=>{
  const {session,remote,asset,bytes}=await fixture({pixels:syntheticPixels(8,8,160)});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('vignette.amount',-75);
  assert.equal(session.state.recipe.parameters.extendedParameters.postCropAdjustments.vignette.amount,-75);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postCropAdjustments,undefined);
  await session.redo();await session.save();await session.reload();
  assert.equal(remote.get(asset.id).body.parameters.extendedParameters.postCropAdjustments.vignette.amount,-75);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  assert.deepEqual(new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer()),changed);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
  await session.setAdjustment('vignette.amount',0);
  assert.equal(session.state.recipe.parameters.extendedParameters.postCropAdjustments,undefined);
});

test('WEB-ST46 / ARTIFICIAL_ONLY: invalid vignette rejects without mutating Recipe or history',async()=>{
  const {session}=await fixture();const before=session.state;
  await assert.rejects(session.setAdjustment('vignette.amount',101),/ADJUSTMENT_RANGE/);
  await assert.rejects(session.setAdjustment('vignette.amount',Number.NaN),/ADJUSTMENT_RANGE/);
  assert.deepEqual(session.state.recipe,before.recipe);assert.equal(session.state.canUndo,before.canUndo);
});

test('WEB-ST47 / ARTIFICIAL_ONLY: manual canvas expansion changes Final dimensions and survives history and reload',async()=>{
  const {session,remote,asset,bytes}=await fixture({pixels:syntheticPixels(8,8,160)});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('canvas.left',25);
  const margins=session.state.recipe.parameters.extendedParameters.canvasExpand.margins;
  assert.deepEqual(margins,{left:.25,right:0,top:0,bottom:0});
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.canvasExpand,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.canvasExpand.margins,margins);
  const expanded=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.equal(expanded.byteLength,10*8*4);assert.equal(base.byteLength,8*8*4);
  assert.deepEqual([...expanded.slice(0,4)],[255,255,255,255]);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
  await session.setCanvasExpansion(null);assert.equal(session.state.recipe.parameters.extendedParameters.canvasExpand,undefined);
});

test('WEB-ST48 / ARTIFICIAL_ONLY: invalid canvas percentages reject before Recipe or history mutation',async()=>{
  const {session}=await fixture();const before=session.state;
  await assert.rejects(session.setAdjustment('canvas.left',201),/ADJUSTMENT_RANGE/);
  await assert.rejects(session.setAdjustment('canvas.unknown',25),/CANVAS_EDGE_UNSUPPORTED/);
  await assert.rejects(session.setCanvasExpansion({margins:{left:0,right:0,top:0,bottom:0},background:[256,0,0,255]}),/INVALID_CANVAS_EXPAND_BACKGROUND/);
  assert.deepEqual(session.state.recipe,before.recipe);assert.equal(session.state.canUndo,before.canUndo);
});

test('WEB-ST49 / ARTIFICIAL_ONLY: all post-crop vignette controls persist and affect fixed Final',async()=>{
  const {session,remote,asset}=await fixture({pixels:syntheticPixels(15,15,200)});
  await session.setAdjustment('vignette.amount',-80);
  await session.save();
  const amountOnly=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('vignette.midpoint',75);
  await session.setAdjustment('vignette.roundness',-60);
  await session.setAdjustment('vignette.feather',80);
  await session.setAdjustment('vignette.highlights',65);
  const controls=session.state.recipe.parameters.extendedParameters.postCropAdjustments.vignette;
  assert.deepEqual(controls,{amount:-80,midpoint:75,roundness:-60,feather:80,highlights:65});
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postCropAdjustments.vignette.highlights,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postCropAdjustments.vignette,controls);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,amountOnly);
  await assert.rejects(session.setAdjustment('vignette.midpoint',101),/ADJUSTMENT_RANGE/);
});

test('WEB-ST50 / ARTIFICIAL_ONLY: RGB primary calibration changes Final and survives save/reload and history',async()=>{
  const pixels=syntheticPixels(8,8);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=180;pixels.data[i+1]=80;pixels.data[i+2]=40;}
  const {session,remote,asset,bytes}=await fixture({pixels});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('calibration.red.hue',50);
  await session.setAdjustment('calibration.green.saturation',-30);
  const expected={red:{hue:50},green:{saturation:-30}};
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.calibration,expected);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.calibration.green,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.calibration,expected);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  assert.deepEqual(new Uint8Array(bytes),new TextEncoder().encode('NON_RAW session state-only bytes'));
  await assert.rejects(session.setAdjustment('calibration.red.hue',101),/ADJUSTMENT_RANGE/);
});

test('WEB-ST51 / ARTIFICIAL_ONLY: selective color group, ink and method change fixed Final and survive reload',async()=>{
  const pixels=syntheticPixels(8,8);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=210;pixels.data[i+1]=40;pixels.data[i+2]=35;}
  const {session,remote,asset}=await fixture({pixels});
  const base=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setAdjustment('selective.reds.cyan',65);
  await session.setSelectiveColorMethod('absolute');
  const selective=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor;
  assert.deepEqual(selective,{ranges:{reds:{cyan:65}},method:'absolute'});
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor.method,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.selectiveColor,selective);
  const changed=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(changed,base);
  await assert.rejects(session.setAdjustment('selective.reds.cyan',101),/ADJUSTMENT_RANGE/);
  await assert.rejects(session.setAdjustment('selective.invalid.cyan',10),/UNSUPPORTED_ADJUSTMENT/);
  await assert.rejects(session.setSelectiveColorMethod('invalid'),/SELECTIVE_COLOR_METHOD_UNSUPPORTED/);
});

test('WEB-ST52 / ARTIFICIAL_ONLY: tonal grain settings are saved, reversible and change fixed Final',async()=>{
  const {session,remote,asset}=await fixture({pixels:syntheticPixels(20,20,128)});
  await session.setAdjustment('detail.grain',60);await session.save();
  const old=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  for(const [key,value] of [['shadows',30],['midtones',40],['highlights',50],['size',55],['roughness',70],['colorVariation',80]])await session.setAdjustment(`grain.${key}`,value);
  const grain=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.grain;
  assert.equal(grain.amount,60);assert.equal(grain.shadows,30);assert.equal(grain.midtones,40);assert.equal(grain.highlights,50);
  assert.equal(grain.size,55);assert.equal(grain.roughness,70);assert.equal(grain.colorVariation,80);
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.detail.grain.colorVariation,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.detail.grain,grain);
  const updated=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(updated,old);
  await assert.rejects(session.setAdjustment('grain.size',101),/ADJUSTMENT_RANGE/);
});

test('WEB-ST53 / MOCK_STATE: batch applies a saved recipe only to an explicitly selected authorized asset',async()=>{
  const {session,api,asset,other,remote,bytes}=await fixture();
  assert.equal(session.batchAvailable,false);
  await assert.rejects(session.batchApplyCurrentRecipe([other.id]),/BATCH_PERMISSION_ADAPTER_REQUIRED/);
  api.assertPermission=async (id,action)=>({authorized:[asset.id,other.id].includes(id)&&action==='edit'});
  assert.equal(session.batchAvailable,true);
  await session.setAdjustment('exposure',1.5);
  await assert.rejects(session.batchApplyCurrentRecipe([other.id]),/SAVE_REQUIRED/);
  await session.save();
  const sourceBefore=structuredClone(remote.get(asset.id));
  const result=await session.batchApplyCurrentRecipe([other.id]);
  assert.equal(result.status,'complete');assert.equal(result.saved,1);
  assert.equal(result.results[0].assetId,other.id);
  assert.deepEqual(remote.get(other.id).body,sourceBefore.body);
  assert.deepEqual(remote.get(asset.id),sourceBefore);
  assert.equal(new TextDecoder().decode(bytes),'NON_RAW session state-only bytes');
  assert.equal(session.state.busy,null);
});

test('WEB-ST54 / MOCK_STATE: denied batch target is refused before reading its Recipe',async()=>{
  const {session,api,other,remote}=await fixture();
  const get=api.getRecipe;let targetRead=false;
  api.getRecipe=async id=>{if(id===other.id)targetRead=true;return get(id);};
  api.assertPermission=async()=>({authorized:false});
  await assert.rejects(session.batchApplyCurrentRecipe([other.id]),/BATCH_PERMISSION_DENIED/);
  assert.equal(targetRead,false);assert.equal(remote.has(other.id),false);
  assert.equal(session.state.busy,null);
});

test('WEB-ST55 / ARTIFICIAL_ONLY: added long, short and dimensions export sizing reach fixed Final',async()=>{
  const {session,bytes}=await fixture({pixels:syntheticPixels(8,6)});
  const prior=session.state.recipe;
  for(const size of [{kind:'long-edge',value:4},{kind:'short-edge',value:3},{kind:'dimensions',width:4,height:3}]){
    const blob=await session.exportFinal({format:'png',size});
    assert.equal(blob.size,4*3*4);
  }
  assert.deepEqual(session.state.recipe,prior);
  assert.equal(session.state.dirty,false);
  assert.equal(new TextDecoder().decode(bytes),'NON_RAW session state-only bytes');
});

test('WEB-ST56 / MOCK_STATE: physical resolution option reaches only fixed Final encoder',async()=>{
  const {session,processing,bytes}=await fixture({pixels:syntheticPixels(8,6)});
  const prior=session.state.recipe,originalEncode=processing.encode,seen=[];
  processing.encode=async (pixels,options)=>{seen.push(options.resolution??null);return originalEncode(pixels,options);};
  await session.exportFinal({format:'png',resolution:{unit:'ppi',value:300}});
  assert.deepEqual(seen.at(-1),{unit:'ppi',value:300});
  assert.deepEqual(session.state.recipe,prior);
  assert.equal(new TextDecoder().decode(bytes),'NON_RAW session state-only bytes');
  const before=seen.length;
  await assert.rejects(session.exportFinal({format:'png',resolution:{unit:'ppi',value:0}}),/EXPORT_RESOLUTION_SETTINGS_INVALID/);
  assert.equal(seen.length,before);
});

test('WEB-ST56B / MOCK_STATE: TIFF8 reaches fixed Final only with its supported quality',async()=>{
  const {session,processing,bytes,asset}=await fixture({pixels:syntheticPixels(8,6)});
  const prior=session.state.recipe,originalEncode=processing.encode,seen=[];
  processing.encode=async (pixels,options)=>{seen.push(options);return originalEncode(pixels,options);};
  const blob=await session.exportFinal({format:'tiff',resolution:{unit:'ppi',value:300}});
  assert.equal(blob.type,'image/tiff');
  assert.equal(seen.at(-1).format,'tiff');assert.equal(seen.at(-1).quality,0.95);
  assert.deepEqual(seen.at(-1).resolution,{unit:'ppi',value:300});
  assert.equal(await checksum(bytes),asset.sha256);assert.deepEqual(session.state.recipe,prior);
  const count=seen.length;
  await assert.rejects(session.exportFinal({format:'tiff',quality:0.8}),/EXPORT_SETTINGS_UNSUPPORTED/);
  await assert.rejects(session.exportFinal({format:'tiff',quality:null}),/EXPORT_SETTINGS_UNSUPPORTED/);
  assert.equal(seen.length,count);
});

test('WEB-ST57 / ARTIFICIAL_ONLY: clipping overlay is preview-only and stale overlay URLs are revoked',async()=>{
  const pixels=syntheticPixels(2,1,0);pixels.data.set([255,255,255,255],4);
  const blobs=new Map(),revoked=[];let next=0;
  const urlAPI={createObjectURL(blob){const url=`blob:clip-${++next}`;blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);}};
  const {session}=await fixture({pixels,sessionOptions:{urlAPI}});
  const first=session.state.clippingOverlayURL;
  assert.ok(first);assert.equal(Object.hasOwn(session.state.histogram,'mask'),false);
  const overlay=new Uint8Array(await blobs.get(first).arrayBuffer());
  assert.equal(overlay[2],255);assert.equal(overlay[4],255);assert.equal(overlay[6],48);
  const final=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.deepEqual([...final],[...pixels.data]);
  await session.setAdjustment('contrast',1.1);
  assert.notEqual(session.state.clippingOverlayURL,first);
  assert.ok(revoked.includes(first));
});

test('WEB-ST58 / ARTIFICIAL_ONLY: extended Glow mode and controls survive history, save and fixed Final',async()=>{
  const pixels=syntheticPixels(8,8,210);
  const {session,remote,asset}=await fixture({pixels});
  await session.setAdjustment('glow.intensity',75);await session.save();
  const legacy=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.setGlowMode('halation');
  await session.setAdjustment('glow.exposure',20);
  await session.setAdjustment('glow.diffusion',40);
  await session.setAdjustment('glow.tint',-30);
  const glow=session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow;
  assert.deepEqual(glow,{intensity:75,mode:'halation',exposure:20,diffusion:40,tint:-30});
  await session.undo();assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow.tint,undefined);
  await session.redo();await session.save();await session.reload();
  assert.deepEqual(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.glow,glow);
  const extended=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(extended,legacy);
  await assert.rejects(session.setAdjustment('glow.diffusion',101),/ADJUSTMENT_RANGE/);
  await assert.rejects(session.setGlowMode('unknown'),/GLOW_MODE_UNSUPPORTED/);
  await session.setGlowMode('legacy');
  assert.deepEqual(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.glow,{intensity:75});
});

test('WEB-ST59 / ARTIFICIAL_ONLY: Glow mask is preview-only and stale mask URLs are revoked',async()=>{
  const pixels=syntheticPixels(8,8,210),blobs=new Map(),revoked=[];let next=0;
  const urlAPI={createObjectURL(blob){const url=`blob:glow-mask-${++next}`;blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);}};
  const {session}=await fixture({pixels,sessionOptions:{urlAPI}});
  assert.equal(session.state.glowMaskURL,null);
  await session.setAdjustment('glow.intensity',80);
  assert.equal(session.state.glowMaskURL,null,'legacy Glow must not show an unapproved mode mask');
  await session.setGlowMode('whiteMist');
  const first=session.state.glowMaskURL;
  assert.ok(first,'explicit Glow mode with positive intensity has a mask');
  const mask=new Uint8Array(await blobs.get(first).arrayBuffer());
  assert.equal(mask.length,pixels.data.length);
  assert.ok(mask.some((value,index)=>index%4===3&&value>0),'mask identifies affected pixels');
  await session.save();
  const finalBefore=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  await session.refreshPreview();
  const finalAfter=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.deepEqual(finalAfter,finalBefore,'preview mask generation never changes Final pixels');
  assert.notEqual(session.state.glowMaskURL,first);
  assert.ok(revoked.includes(first));
  const second=session.state.glowMaskURL;
  await session.setGlowMode('legacy');
  assert.equal(session.state.glowMaskURL,null);
  assert.ok(revoked.includes(second));
});

test('WEB-ST60 / ARTIFICIAL_ONLY: Levels eyedropper samples current After pixels and saves only the selected endpoint',async()=>{
  const pixels=syntheticPixels(2,1,0);
  pixels.data.set([20,20,20,255,235,235,235,255]);
  const {session,remote,asset}=await fixture({pixels});
  const original=pixels.data.slice();
  const black=await session.sampleLevelsAt({x:0,y:0,channel:'master',endpoint:'black'});
  assert.deepEqual({key:black.key,value:black.value},{key:'levels.master.inputBlack',value:20});
  assert.equal(session.state.recipe.parameters.extendedParameters.postDecodeAdjustments.color.levels.master.inputBlack,20);
  const white=await session.sampleLevelsAt({x:1,y:0,channel:'red',endpoint:'white'});
  assert.equal(white.key,'levels.red.inputWhite');
  assert.ok(white.value>20&&white.value<=255);
  await session.save();
  assert.equal(remote.get(asset.id).body.parameters.extendedParameters.postDecodeAdjustments.color.levels.red.inputWhite,white.value);
  const final=new Uint8Array(await (await session.exportFinal({format:'png'})).arrayBuffer());
  assert.notDeepEqual(final,original);
  assert.deepEqual(pixels.data,original,'the source pixels are never edited by sampling');
  await assert.rejects(session.sampleLevelsAt({x:0,y:0,channel:'master',endpoint:'white'}),/LEVELS_ENDPOINT_ORDER/);
  assert.equal(session.state.dirty,false);
});

test('WEB-ST61 / ARTIFICIAL_ONLY: Levels histogram is tied to After preview and cleared on invalidation',async()=>{
  const pixels=syntheticPixels(2,1,0);
  pixels.data.set([20,40,60,255,200,180,160,0]);
  const {session}=await fixture({pixels});
  const histogram=session.state.levelsHistogram;
  assert.equal(histogram.includedPixels,1);
  assert.equal(histogram.bins.master[20],1);
  assert.equal(histogram.bins.red[200],0,'transparent pixels are excluded');
  assert.equal(Object.hasOwn(histogram,'mask'),false);
  session.invalidatePreview();
  assert.equal(session.state.levelsHistogram,null);
  assert.equal(session.previewPixels,null);
});

test('WEB-ST62 / ARTIFICIAL_ONLY: explicit output sharpening runs after Final resize and before encoding without changing Recipe',async()=>{
  const {session,processing,calls}=await fixture();
  const saved=structuredClone(session.state.recipe);
  const settings={kind:'manual',gain:0.8,radiusPx:1.2,thresholdLuma:2};
  processing.applyExportOutputSharpening=async(pixels,received,{signal})=>{
    assert.equal(signal.aborted,false);
    assert.deepEqual(received,settings);
    calls.push(['outputSharpen',pixels.width,pixels.height]);
    const data=pixels.data.slice();data[0]=data[0]===0?1:0;
    return {...pixels,data};
  };
  const normal=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50}})).arrayBuffer());
  calls.length=0;
  const adjusted=new Uint8Array(await (await session.exportFinal({format:'png',size:{kind:'percentage',value:50},outputSharpening:settings})).arrayBuffer());
  assert.notDeepEqual(adjusted,normal);
  assert.deepEqual(calls.filter(item=>['resizeForExport','outputSharpen','encode'].includes(item[0])).map(item=>item[0]),
    ['resizeForExport','outputSharpen','encode']);
  assert.deepEqual(session.state.recipe,saved,'export-only settings must never enter the saved Recipe');
});

test('WEB-ST63 / ARTIFICIAL_ONLY: unsupported output sharpening fails closed before Final work',async()=>{
  const {session,processing,calls}=await fixture();
  await assert.rejects(session.exportFinal({format:'png',outputSharpening:{kind:'screen',strength:'high'}}),
    /OUTPUT_SHARPENING_PRESET_UNSUPPORTED/);
  assert.equal(calls.some(item=>item[0]==='decode'),false);
  await assert.rejects(session.exportFinal({format:'png',outputSharpening:{kind:'manual',gain:1,radiusPx:1,thresholdLuma:0}}),
    /OUTPUT_SHARPENING_PROCESSOR_UNAVAILABLE/);
  assert.equal(processing.applyExportOutputSharpening,undefined);
});

test('WEB-ST64 / MOCK_STATE: unauthenticated adapter cannot author a bound B/W Edge Recipe',async()=>{
  const {session,storage,asset,calls}=await fixture();
  const before=session.state;
  assert.equal(session.bwEdgeManualAvailable,false);
  await assert.rejects(session.setBWEdgeManualStrokes({subjectStrokes:[],correctionStrokes:[]}),
    /BW_EDGE_AUTHENTICATED_TRIAL_REQUIRED/);
  assert.deepEqual(session.state.recipe,before.recipe);
  assert.equal(session.state.dirty,false);
  assert.equal((await storage.get(asset.id)).revision,before.revision);
  assert.equal(calls.some(item=>item[0]==='putOriginal'),false);
});
