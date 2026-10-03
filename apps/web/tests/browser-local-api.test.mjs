import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, webcrypto} from 'node:crypto';
import {BrowserLocalAPI} from '../src/browser-local-api.mjs';
import {EditorSession} from '../src/session.mjs';
import {renderPixels} from '../src/processing/pure.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {recipe, syntheticPixels} from './fixtures.mjs';

// An asynchronous, transactional IndexedDB test double. Inputs are synthetic
// bytes, not real camera RAW; browser quota/power-loss behavior needs real QA.
const clone = value => structuredClone(value);
const cryptoAdapter = {subtle: webcrypto.subtle, randomUUID};
const bytes = () => new TextEncoder().encode('SYNTHETIC_NON_RAW_BROWSER_LOCAL').buffer;
const digest = async buffer => Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', buffer)),
  byte => byte.toString(16).padStart(2, '0')).join('');

class FakeTransaction {
  constructor(database, names, mode, factory) {
    this.database = database;
    this.mode = mode;
    this.factory = factory;
    this.names = new Set(names);
    this.pending = 0;
    this.aborted = false;
    this.completed = false;
    this.stores = new Map(names.map(name => [name,
      new Map([...database.stores.get(name)].map(([key, value]) => [key, clone(value)]))]));
    this.scheduleCompletion();
  }

  scheduleCompletion() {
    setTimeout(() => {
      if (this.aborted || this.completed) return;
      if (this.pending) {this.scheduleCompletion(); return;}
      this.completed = true;
      if (this.mode === 'readwrite') {
        for (const [name, values] of this.stores) this.database.stores.set(name, values);
      }
      this.oncomplete?.();
    }, 0);
  }

  abort() {
    if (this.aborted || this.completed) throw Error('TRANSACTION_INACTIVE');
    this.aborted = true;
    queueMicrotask(() => this.onabort?.());
  }

  objectStore(name) {
    if (!this.names.has(name)) throw Error('STORE_NOT_IN_TRANSACTION');
    const map = this.stores.get(name);
    const run = (operation, write = false) => {
      const request = {result: undefined, error: null, onsuccess: null, onerror: null};
      this.pending++;
      queueMicrotask(() => {
        if (this.aborted) {this.pending--; return;}
        try {
          if (write && this.factory.failNextWriteStore === name) {
            this.factory.failNextWriteStore = null;
            throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
          }
          request.result = operation();
          request.onsuccess?.();
        } catch (cause) {
          request.error = cause;
          this.error = cause;
          request.onerror?.();
          this.onerror?.();
          this.abort();
        } finally {this.pending--;}
      });
      return request;
    };
    return {
      get: key => run(() => clone(map.get(key))),
      getAll: () => run(() => [...map.values()].map(clone)),
      getAllKeys: () => run(() => [...map.keys()]),
      add: value => run(() => {
        if (this.mode !== 'readwrite') throw Error('READ_ONLY');
        if (map.has(value.id)) throw new DOMException('Duplicate key', 'ConstraintError');
        map.set(value.id, clone(value));
        return value.id;
      }, true),
      put: value => run(() => {
        if (this.mode !== 'readwrite') throw Error('READ_ONLY');
        map.set(value.id, clone(value));
        return value.id;
      }, true),
    };
  }
}

class FakeDatabase {
  constructor(factory) {
    this.factory = factory;
    this.stores = new Map();
    this.objectStoreNames = {contains: name => this.stores.has(name)};
  }
  createObjectStore(name) {this.stores.set(name, new Map());}
  transaction(names, mode = 'readonly') {return new FakeTransaction(this, names, mode, this.factory);}
  close() {}
}

class FakeIndexedDB {
  constructor() {this.databases = new Map(); this.failNextWriteStore = null;}
  open(name, version) {
    const request = {result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null};
    queueMicrotask(() => {
      const fresh = !this.databases.has(name);
      if (fresh) this.databases.set(name, new FakeDatabase(this));
      request.result = this.databases.get(name);
      if (fresh) request.onupgradeneeded?.();
      queueMicrotask(() => request.onsuccess?.());
    });
    return request;
  }
}

function setup() {
  const indexedDB = new FakeIndexedDB();
  const options = {indexedDB, crypto: cryptoAdapter, databaseName: `test-${randomUUID()}`,
    clock: () => '2026-10-03T00:00:00.000Z'};
  return {indexedDB, options, api: new BrowserLocalAPI(options)};
}

async function imported(api, original = bytes()) {
  const asset = await api.createAsset({name: 'synthetic.NEF', sha256: await digest(original), size: original.byteLength});
  return {asset: await api.putOriginal(asset.id, original), original};
}

test('BROWSER-LOCAL01 / MOCK_INDEXEDDB NON_RAW: pending import is hidden; committed Original recovers after API restart', async () => {
  const {api, options} = setup(), original = bytes();
  const pending = await api.createAsset({name: 'synthetic.NEF', sha256: await digest(original), size: original.byteLength});
  assert.equal(pending.cloudSafe, false);
  assert.equal(pending.storage, 'BROWSER_LOCAL_ONLY');
  assert.deepEqual(await api.listAssets(), []);
  await assert.rejects(api.getOriginal(pending.id), /LOCAL_ORIGINAL_MISSING/);
  await api.putOriginal(pending.id, original);
  const restarted = new BrowserLocalAPI(options);
  assert.deepEqual(await restarted.listAssets(), [pending]);
  assert.deepEqual(new Uint8Array(await restarted.getOriginal(pending.id)), new Uint8Array(original));
  assert.equal(await restarted.getRecipe(pending.id), null);
});

test('BROWSER-LOCAL02 / MOCK_INDEXEDDB NON_RAW: wrong bytes cannot commit and an idempotent retry never overwrites Original', async () => {
  const {api} = setup(), original = bytes();
  const pending = await api.createAsset({name: 'synthetic.NEF', sha256: await digest(original), size: original.byteLength});
  const wrong = original.slice(0); new Uint8Array(wrong)[0] ^= 1;
  await assert.rejects(api.putOriginal(pending.id, wrong), /ORIGINAL_CHECKSUM_MISMATCH/);
  assert.deepEqual(await api.listAssets(), []);
  await api.putOriginal(pending.id, original);
  await api.putOriginal(pending.id, original);
  await assert.rejects(api.putOriginal(pending.id, wrong), /ORIGINAL_CHECKSUM_MISMATCH/);
  const returned = await api.getOriginal(pending.id); new Uint8Array(returned)[0] ^= 1;
  assert.deepEqual(new Uint8Array(await api.getOriginal(pending.id)), new Uint8Array(original));
});

test('BROWSER-LOCAL03 / MOCK_INDEXEDDB NON_RAW: Recipe v1 CAS keeps append-only versions and restores the latest revision', async () => {
  const {api, options, indexedDB} = setup(), {asset, original} = await imported(api);
  const first = recipe(); first.parameters.exposure = 0.5;
  const saved1 = await api.saveRecipe(asset.id, 0, first);
  assert.deepEqual(saved1, {revision: 1, body: first});
  const second = recipe(); second.parameters.exposure = 1;
  await assert.rejects(api.saveRecipe(asset.id, 0, second), /REVISION_CONFLICT/);
  assert.deepEqual(await api.getRecipe(asset.id), saved1);
  const saved2 = await api.saveRecipe(asset.id, 1, second);
  assert.deepEqual(saved2, {revision: 2, body: second});
  first.parameters.exposure = 4;
  saved2.body.parameters.exposure = 4;
  const restarted = new BrowserLocalAPI(options);
  assert.deepEqual(await restarted.getRecipe(asset.id), {revision: 2, body: second});
  const versions = indexedDB.databases.get(options.databaseName).stores.get('recipeVersions');
  assert.equal(versions.size, 2);
  assert.deepEqual(JSON.parse(versions.get(`${asset.id}:1`).body).parameters.exposure, 0.5);
  assert.deepEqual(new Uint8Array(await restarted.getOriginal(asset.id)), new Uint8Array(original));
});

test('BROWSER-LOCAL04 / MOCK_INDEXEDDB NON_RAW: quota abort leaves prior Original and Recipe head intact', async () => {
  const {api, indexedDB} = setup(), original = bytes();
  const pending = await api.createAsset({name: 'synthetic.NEF', sha256: await digest(original), size: original.byteLength});
  indexedDB.failNextWriteStore = 'originals';
  await assert.rejects(api.putOriginal(pending.id, original), /LOCAL_STORAGE_FULL/);
  assert.deepEqual(await api.listAssets(), []);
  const asset = await api.putOriginal(pending.id, original);
  const saved = await api.saveRecipe(asset.id, 0, recipe());
  const changed = recipe(); changed.parameters.exposure = 1;
  indexedDB.failNextWriteStore = 'recipeVersions';
  await assert.rejects(api.saveRecipe(asset.id, 1, changed), /LOCAL_STORAGE_FULL/);
  assert.deepEqual(await api.getRecipe(asset.id), saved);
  assert.deepEqual(new Uint8Array(await api.getOriginal(asset.id)), new Uint8Array(original));
});

test('BROWSER-LOCAL05 / MOCK_INDEXEDDB NON_RAW: damaged Original or Recipe refuses read without eviction', async () => {
  const {api, options, indexedDB} = setup(), {asset} = await imported(api);
  const saved = await api.saveRecipe(asset.id, 0, recipe());
  const database = indexedDB.databases.get(options.databaseName);
  database.stores.get('recipeVersions').get(`${asset.id}:1`).body = '{"damaged":true}';
  await assert.rejects(api.getRecipe(asset.id), /LOCAL_RECIPE_CORRUPT/);
  assert.equal(database.stores.get('recipeVersions').size, 1);
  assert.equal(database.stores.get('recipeHeads').get(asset.id).revision, saved.revision);
  const damaged = bytes(); new Uint8Array(damaged)[0] ^= 1;
  database.stores.get('originals').get(asset.id).bytes = damaged;
  await assert.rejects(api.getOriginal(asset.id), /LOCAL_ORIGINAL_CORRUPT/);
  await assert.rejects(api.putOriginal(asset.id, bytes()), /LOCAL_ORIGINAL_CORRUPT/);
  assert.equal(database.stores.get('assets').size, 1);
});

test('BROWSER-LOCAL06 / MOCK_INDEXEDDB NON_RAW: invalid metadata, Recipe and aborted reads fail before durable mutation', async () => {
  const {api} = setup();
  await assert.rejects(api.createAsset({name: '', sha256: 'bad', size: 0}), /INVALID_ASSET/);
  const {asset, original} = await imported(api);
  const invalid = recipe(); invalid.parameters.extendedParameters.crop = {unknown: true};
  await assert.rejects(api.saveRecipe(asset.id, 0, invalid));
  assert.equal(await api.getRecipe(asset.id), null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.getOriginal(asset.id, {signal: controller.signal}), /OPERATION_ABORTED/);
  assert.deepEqual(new Uint8Array(await api.getOriginal(asset.id)), new Uint8Array(original));
});

test('BROWSER-LOCAL07 / MOCK_INDEXEDDB NON_RAW: EditorSession imports, saves, reopens without proxy cache and runs fixed Final', async () => {
  const {api, options} = setup(), original = bytes();
  const processing = {
    decodeRaw: async () => ({pixels: syntheticPixels(12, 8, 72), provenance: {fixture: 'NON_RAW_SYNTHETIC'}}),
    makeProxy: async pixels => pixels,
    render: async (pixels, body, settings) => renderPixels(pixels, body,
      {...settings, validateRecipe, resolutionAssessment}),
    encode: async pixels => new Blob([pixels.data]),
  };
  let objectURL = 0;
  const urlAPI = {createObjectURL: () => `blob:synthetic-${++objectURL}`, revokeObjectURL() {}};
  const storage = {get: async () => undefined, put: async () => {}};
  const session = new EditorSession({api, processing, storage, urlAPI});
  await session.initialize();
  await session.importRaw({name: 'synthetic.NEF', size: original.byteLength,
    arrayBuffer: async () => original.slice(0)});
  const id = session.state.asset.id;
  await session.setAdjustment('exposure', 0.5);
  await session.save();

  const fresh = new EditorSession({api: new BrowserLocalAPI(options), processing, storage, urlAPI});
  await fresh.initialize();
  await fresh.openAsset(id);
  assert.equal(fresh.state.recipe.parameters.exposure, 0.5);
  assert.equal(fresh.state.revision, 1);
  assert.equal(fresh.state.dirty, false);
  const output = await fresh.exportFinal({format: 'png'});
  assert.equal(output.size, 12 * 8 * 4);
  assert.deepEqual(new Uint8Array(await api.getOriginal(id)), new Uint8Array(original));
});
