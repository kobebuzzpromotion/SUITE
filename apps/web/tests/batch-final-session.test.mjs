import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSession, checksum, MAX_BATCH_FINAL_ITEMS, MAX_BATCH_FINAL_BYTES} from '../src/session.mjs';
import {recipe, syntheticPixels, deferred} from './fixtures.mjs';

const clone = value => structuredClone(value);
async function fixture() {
  // Mock decoder and non-RAW bytes: this proves state/pipeline control only.
  const originals = new Map([['a', new TextEncoder().encode('NON_RAW A').buffer],
    ['b', new TextEncoder().encode('NON_RAW B').buffer]]);
  const assets = [];
  for (const [id, bytes] of originals) assets.push({id, name: `${id}.RAW`,
    sha256: await checksum(bytes), size: bytes.byteLength, deletedAt: null, cloudSafe: true});
  const remote = new Map(assets.map(asset => [asset.id, {assetId: asset.id,
    revision: 2, body: recipe()}]));
  const cache = new Map(assets.map(asset => [asset.id, {asset: clone(asset),
    proxy: syntheticPixels(4, 4), history: [recipe()], cursor: 0, revision: 2,
    reference: null, dirty: false}]));
  const calls = [];
  const api = {
    async listAssets() {calls.push('list'); return clone(assets);},
    async getRecipe(id) {calls.push(`recipe:${id}`); return clone(remote.get(id) ?? null);},
    async assertPermission(id, action) {calls.push(`permission:${id}:${action}`);
      return {authorized: true};},
    async getOriginal(id) {calls.push(`original:${id}`); return originals.get(id)?.slice(0);},
    async saveRecipe() {throw Error('WRITE_FORBIDDEN');},
  };
  const storage = {async get(id) {calls.push(`cache:${id}`); return clone(cache.get(id));},
    async put() {throw Error('WRITE_FORBIDDEN');}};
  const processing = {
    syntheticTestOnly: true,
    async decodeRaw(bytes, {mode} = {}) {calls.push(`decode:${mode}`);
      return {pixels: syntheticPixels(4, 4), provenance: {fixture: 'NON_RAW'}};},
    async makeProxy(pixels) {return pixels;},
    async render(pixels) {calls.push('render'); return pixels;},
    async encode(pixels, options) {calls.push(`encode:${options.format}`);
      return new Blob([pixels.data], {type: `image/${options.format}`});},
  };
  const urlAPI = {createObjectURL: () => 'blob:mock', revokeObjectURL() {}};
  const session = new EditorSession({api, processing, storage, urlAPI,
    personProcessingStatus: 'SYNTHETIC_TEST_ONLY'});
  await session.initialize();
  await session.openAsset('a');
  calls.length = 0;
  return {session, api, processing, storage, assets, originals, remote, cache, calls};
}

test('BATCH-FINAL-SESSION01 / MOCK_NON_RAW: queue order, fixed saved Recipes and two complete PNG Blobs', async () => {
  const f = await fixture(), before = f.session.state;
  const result = await f.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'});
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.plan.map(item => [item.assetId, item.sequence, item.total]),
    [['b', 1, 2], ['a', 2, 2]]);
  assert.deepEqual(result.items.map(item => item.assetId), ['b', 'a']);
  assert.ok(result.items.every(item => item.blob instanceof Blob && item.blob.type === 'image/png'));
  assert.equal(result.totalBytes, result.items.reduce((sum, item) => sum + item.blob.size, 0));
  for (const id of ['a', 'b']) {
    // Preflight, per-item before/after, then the whole-batch final sweep.
    assert.equal(f.calls.filter(call => call === `permission:${id}:export`).length, 4);
    assert.equal(f.calls.filter(call => call === `recipe:${id}`).length, 4);
    assert.equal(f.calls.filter(call => call === `original:${id}`).length, 3);
  }
  assert.ok(f.calls.indexOf('original:b') < f.calls.indexOf('original:a'));
  assert.equal(f.calls.includes('WRITE_FORBIDDEN'), false);
  assert.equal(f.session.state.asset.id, before.asset.id);
  assert.equal(f.session.state.dirty, before.dirty);
  assert.deepEqual(f.session.state.recipe, before.recipe);
  assert.equal(f.session.state.exporting, false);
});

test('BATCH-FINAL-SESSION02 / MOCK_NON_RAW: second Original mismatch rejects all, never returns first Blob', async () => {
  const f = await fixture(), before = f.session.state;
  f.api.getOriginal = async id => {
    f.calls.push(`original:${id}`);
    return id === 'a' ? new Uint8Array([0, 1, 2]).buffer : f.originals.get(id).slice(0);
  };
  await assert.rejects(f.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /RAW_CHECKSUM_MISMATCH/);
  assert.equal(f.calls.filter(call => call === 'encode:png').length, 1);
  assert.equal(f.session.state.asset.id, before.asset.id);
  assert.deepEqual(f.session.state.recipe, before.recipe);
  assert.equal(f.session.state.dirty, before.dirty);
  assert.equal(f.session.state.exporting, false);
  assert.deepEqual(new Uint8Array(f.originals.get('a')),
    new TextEncoder().encode('NON_RAW A'));
});

test('BATCH-FINAL-SESSION03 / MOCK_NON_RAW: changed revision or permission after preflight fails before success', async () => {
  const stale = await fixture();
  let bReads = 0;
  stale.api.getRecipe = async id => {
    stale.calls.push(`recipe:${id}`);
    if (id === 'b' && ++bReads === 2) return {assetId: id, revision: 3, body: recipe()};
    return clone(stale.remote.get(id));
  };
  await assert.rejects(stale.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /EXPORT_BATCH_FIXED_RECIPE_MISMATCH/);
  assert.equal(stale.calls.includes('original:b'), false);

  const denied = await fixture();
  let bPermissions = 0;
  denied.api.assertPermission = async (id, action) => {
    denied.calls.push(`permission:${id}:${action}`);
    return {authorized: id !== 'b' || ++bPermissions < 3};
  };
  await assert.rejects(denied.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /EXPORT_BATCH_PERMISSION_DENIED/);
  assert.equal(denied.calls.includes('original:a'), false);
});

test('BATCH-FINAL-SESSION04 / MOCK_NON_RAW: unsaved local draft, duplicate and too many IDs reject', async () => {
  const dirty = await fixture();
  dirty.cache.get('b').dirty = true;
  await assert.rejects(dirty.session.exportBatchFinal({orderedIds: ['a', 'b'], format: 'png'}),
    /EXPORT_BATCH_UNSAVED_DRAFT/);
  assert.equal(dirty.calls.includes('original:b'), false);

  const duplicate = await fixture();
  await assert.rejects(duplicate.session.exportBatchFinal({orderedIds: ['a', 'a']}),
    /EXPORT_QUEUE_DUPLICATE_SELECTION/);
  assert.equal(duplicate.session.state.exporting, false);
  assert.equal(MAX_BATCH_FINAL_ITEMS, 20);
  await assert.rejects(duplicate.session.exportBatchFinal({orderedIds: Array(21).fill('a')}),
    /EXPORT_BATCH_TOO_LARGE/);
});

test('BATCH-FINAL-SESSION05 / MOCK_NON_RAW: cancellation and concurrent export fail without partial output', async () => {
  const f = await fixture(), entered = deferred(), gate = deferred();
  f.processing.decodeRaw = async (bytes, {mode} = {}) => {
    f.calls.push(`decode:${mode}`); entered.resolve(); return gate.promise;
  };
  const exporting = f.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'});
  await entered.promise;
  await assert.rejects(f.session.exportBatchFinal({orderedIds: ['a', 'b']}),
    /OPERATION_IN_PROGRESS/);
  f.session.cancelExport();
  gate.resolve({pixels: syntheticPixels(4, 4), provenance: {fixture: 'NON_RAW'}});
  await assert.rejects(exporting, /EXPORT_ABORTED/);
  assert.equal(f.session.state.exporting, false);
  assert.equal(f.calls.includes('original:a'), false);
});

test('BATCH-FINAL-SESSION06 / MOCK_NON_RAW: MIME and aggregate byte limit fail closed', async () => {
  const wrong = await fixture();
  wrong.processing.encode = async pixels => new Blob([pixels.data], {type: 'image/jpeg'});
  await assert.rejects(wrong.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /EXPORT_BATCH_BLOB_INVALID/);

  const oversize = await fixture();
  class HugeBlob extends Blob {get size() {return MAX_BATCH_FINAL_BYTES;}}
  oversize.processing.encode = async () => new HugeBlob([1], {type: 'image/png'});
  await assert.rejects(oversize.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /EXPORT_BATCH_TOTAL_BYTES_EXCEEDED/);
  assert.equal(oversize.session.state.exporting, false);
});

test('BATCH-FINAL-SESSION07 / MOCK_NON_RAW: a Portrait Recipe cannot borrow another Asset’s person approval', async () => {
  const f = await fixture();
  // Deliberately only a portrait candidate: the batch gate precedes all
  // person detection/rendering and never treats session-wide approval as proof.
  f.cache.get('b').history[0].parameters.extendedParameters.portrait = {};
  await assert.rejects(f.session.exportBatchFinal({orderedIds: ['b', 'a'], format: 'png'}),
    /EXPORT_BATCH_PERSON_REVIEW_REQUIRED/);
  assert.equal(f.calls.some(call => call.startsWith('original:')), false);
  assert.equal(f.calls.includes('render'), false);
  assert.equal(f.session.state.asset.id, 'a');
  assert.equal(f.session.state.exporting, false);
});

test('BATCH-FINAL-SESSION08 / MOCK_NON_RAW: sequential JPEG uses the same explicit order and MIME contract', async () => {
  const f = await fixture();
  const result = await f.session.exportBatchFinal({orderedIds: ['a', 'b'], format: 'jpeg'});
  assert.deepEqual(result.items.map(item => item.assetId), ['a', 'b']);
  assert.ok(result.items.every(item => item.blob.type === 'image/jpeg' && item.blob.size > 0));
  assert.equal(f.calls.filter(call => call === 'encode:jpeg').length, 2);
});

test('BATCH-FINAL-SESSION09 / MOCK_NON_RAW: export-only output sharpening applies to each Final before encode and never changes saved Recipes',async()=>{
  const f=await fixture(),before=f.session.state.recipe;
  f.processing.applyExportOutputSharpening=async(pixels,settings,{signal})=>{
    assert.equal(signal.aborted,false);
    assert.deepEqual(settings,{kind:'manual',gain:1,radiusPx:1,thresholdLuma:0});
    f.calls.push('outputSharpen');
    const data=pixels.data.slice();data[0]=data[0]===0?1:0;
    return {...pixels,data};
  };
  const result=await f.session.exportBatchFinal({orderedIds:['b','a'],format:'png',
    outputSharpening:{kind:'manual',gain:1,radiusPx:1,thresholdLuma:0}});
  assert.equal(result.items.length,2);
  assert.deepEqual(f.calls.filter(call=>call==='outputSharpen'||call==='encode:png'),
    ['outputSharpen','encode:png','outputSharpen','encode:png']);
  assert.deepEqual(f.session.state.recipe,before);
  assert.ok([...f.remote.values()].every(item=>!Object.hasOwn(item.body.parameters.extendedParameters,'outputSharpening')));
});

test('BATCH-FINAL-SESSION10 / MOCK_NON_RAW: unavailable or failed output processor releases no partial Blob',async()=>{
  const settings={kind:'manual',gain:1,radiusPx:1,thresholdLuma:0};
  const absent=await fixture();
  await assert.rejects(absent.session.exportBatchFinal({orderedIds:['b','a'],format:'png',outputSharpening:settings}),
    /OUTPUT_SHARPENING_PROCESSOR_UNAVAILABLE/);
  assert.equal(absent.calls.some(call=>call==='encode:png'),false);
  const failed=await fixture();let items=0;
  failed.processing.applyExportOutputSharpening=async pixels=>{
    if(++items===2)throw Error('OUTPUT_SHARPENING_FAILURE');
    return pixels;
  };
  await assert.rejects(failed.session.exportBatchFinal({orderedIds:['b','a'],format:'png',outputSharpening:settings}),
    /OUTPUT_SHARPENING_FAILURE/);
  assert.equal(failed.calls.filter(call=>call==='encode:png').length,1);
  assert.equal(failed.session.state.exporting,false);
});
