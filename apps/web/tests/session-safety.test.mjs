import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, checksum} from '../src/session.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment, defaultCropSettings} from '../../../dist/apps/backend/src/crop-export.js';
import {renderPixels, makeProxyPixels} from '../src/processing/pure.mjs';
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
    render: async (p, doc, options) => {calls.push(['render', !!doc.parameters.extendedParameters.portrait]); return renderPixels(p, doc, {...options, validateRecipe, resolutionAssessment});},
    encode: async (p, options) => {calls.push(['encode', options.format]); return new Blob([p.data], {type: `image/${options.format}`});}
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
