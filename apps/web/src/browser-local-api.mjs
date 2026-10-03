import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const DATABASE_VERSION = 1;
const MAX_ORIGINAL_BYTES = 128 * 1024 * 1024;
const STORES = ['assets', 'originals', 'recipeHeads', 'recipeVersions'];
const error = code => new Error(code);
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const versionKey = (assetID, revision) => `${assetID}:${revision}`;

function storageError(cause) {
  if (cause?.name === 'QuotaExceededError') return error('LOCAL_STORAGE_FULL');
  return error('LOCAL_STORAGE_UNAVAILABLE');
}

function publicAsset(record) {
  return {id: record.id, name: record.name, sha256: record.sha256, size: record.size,
    cloudSafe: false, storage: 'BROWSER_LOCAL_ONLY'};
}

function recipeJSON(value) {
  validateRecipe(value);
  const seen = new Set();
  const inspect = item => {
    if (item === null || typeof item === 'boolean' || typeof item === 'string' ||
        typeof item === 'number') return;
    if (typeof item !== 'object') throw error('INVALID_RECIPE_JSON');
    if (seen.has(item)) throw error('INVALID_RECIPE_JSON');
    seen.add(item);
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null) throw error('INVALID_RECIPE_JSON');
    for (const child of Object.values(item)) inspect(child);
    seen.delete(item);
  };
  inspect(value);
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw error('INVALID_RECIPE_JSON');
  validateRecipe(JSON.parse(serialized));
  return serialized;
}

/** Wait for transaction completion, including any dependent requests queued by its handlers. */
function transact(database, storeNames, mode, enqueue) {
  return new Promise((resolve, reject) => {
    let transaction, result, failure;
    try {transaction = database.transaction(storeNames, mode);}
    catch (cause) {reject(storageError(cause)); return;}
    const finish = value => {result = value;};
    const fail = cause => {
      failure = cause instanceof Error ? cause : error(String(cause));
      try {transaction.abort();} catch {reject(failure);}
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure ?? storageError(transaction.error));
    transaction.onerror = () => {failure ??= storageError(transaction.error);};
    try {enqueue(transaction, finish, fail);}
    catch (cause) {fail(cause);}
  });
}

/** Anonymous, same-browser storage only. No account, Cloud Safe, sync or eviction. */
export class BrowserLocalAPI {
  constructor({indexedDB = globalThis.indexedDB, crypto = globalThis.crypto,
    databaseName = 'suite-browser-local-v1', clock = () => new Date().toISOString()} = {}) {
    this.factory = indexedDB;
    this.crypto = crypto;
    this.databaseName = databaseName;
    this.clock = clock;
    this.connection = null;
  }

  async database() {
    if (!this.factory?.open || !this.crypto?.subtle?.digest || !this.crypto?.randomUUID) {
      throw error('LOCAL_STORAGE_UNAVAILABLE');
    }
    if (!this.connection) {
      this.connection = new Promise((resolve, reject) => {
        let request;
        try {request = this.factory.open(this.databaseName, DATABASE_VERSION);}
        catch (cause) {reject(storageError(cause)); return;}
        request.onupgradeneeded = () => {
          for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name, {keyPath: 'id'});
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {database.close(); this.connection = null;};
          resolve(database);
        };
        request.onerror = () => reject(storageError(request.error));
        request.onblocked = () => reject(error('LOCAL_DATABASE_BLOCKED'));
      }).catch(cause => {this.connection = null; throw cause;});
    }
    return this.connection;
  }

  async digest(buffer) {return hex(await this.crypto.subtle.digest('SHA-256', buffer));}

  async listAssets() {
    const database = await this.database();
    return transact(database, ['assets', 'originals'], 'readonly', (tx, finish) => {
      let assets, originalIDs;
      const complete = () => {
        if (assets && originalIDs) {
          const present = new Set(originalIDs);
          finish(assets.filter(item => item.state === 'READY' && present.has(item.id)).map(publicAsset));
        }
      };
      const a = tx.objectStore('assets').getAll();
      a.onsuccess = () => {assets = a.result; complete();};
      const o = tx.objectStore('originals').getAllKeys();
      o.onsuccess = () => {originalIDs = o.result; complete();};
    });
  }

  async createAsset(input) {
    if (!input || Object.keys(input).sort().join(',') !== 'name,sha256,size' ||
        typeof input.name !== 'string' || !input.name.trim() || input.name.length > 255 ||
        /[\x00-\x1f]/.test(input.name) || typeof input.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(input.sha256) || !Number.isSafeInteger(input.size) ||
        input.size < 1 || input.size > MAX_ORIGINAL_BYTES) throw error('INVALID_ASSET');
    const database = await this.database();
    const record = {id: this.crypto.randomUUID(), name: input.name, sha256: input.sha256.toLowerCase(),
      size: input.size, createdAt: this.clock(), state: 'PENDING_ORIGINAL'};
    return transact(database, ['assets'], 'readwrite', (tx, finish) => {
      tx.objectStore('assets').add(record);
      finish(publicAsset(record));
    });
  }

  async putOriginal(id, input) {
    if (typeof id !== 'string' || !(input instanceof ArrayBuffer) || input.byteLength < 1 ||
        input.byteLength > MAX_ORIGINAL_BYTES) throw error('INVALID_ORIGINAL');
    const bytes = input.slice(0), digest = await this.digest(bytes), database = await this.database();
    const result = await transact(database, ['assets', 'originals'], 'readwrite', (tx, finish, fail) => {
      const assets = tx.objectStore('assets'), originals = tx.objectStore('originals');
      const a = assets.get(id);
      a.onsuccess = () => {
        const record = a.result;
        if (!record) {fail(error('ASSET_NOT_FOUND')); return;}
        if (record.size !== bytes.byteLength || record.sha256 !== digest) {
          fail(error('ORIGINAL_CHECKSUM_MISMATCH')); return;
        }
        const o = originals.get(id);
        o.onsuccess = () => {
          if (record.state === 'READY') {
            if (!o.result || o.result.size !== record.size || o.result.sha256 !== record.sha256) {
              fail(error('LOCAL_ORIGINAL_MISSING')); return;
            }
            finish({asset: publicAsset(record), alreadyStored: true});
            return;
          }
          if (record.state !== 'PENDING_ORIGINAL' || o.result) {fail(error('LOCAL_ASSET_CORRUPT')); return;}
          originals.add({id, bytes, sha256: digest, size: bytes.byteLength});
          const ready = {...record, state: 'READY'};
          assets.put(ready);
          finish({asset: publicAsset(ready), alreadyStored: false});
        };
      };
    });
    // A retry never rewrites the Original. Verify the already stored bytes before
    // reporting it as committed, including when its metadata still looks valid.
    if (result.alreadyStored) await this.getOriginal(id);
    return result.asset;
  }

  async getOriginal(id, {signal} = {}) {
    if (signal?.aborted) throw error('OPERATION_ABORTED');
    const database = await this.database();
    const stored = await transact(database, ['assets', 'originals'], 'readonly', (tx, finish, fail) => {
      const a = tx.objectStore('assets').get(id), o = tx.objectStore('originals').get(id);
      let asset, original, gotAsset = false, gotOriginal = false;
      const complete = () => {
        if (!gotAsset || !gotOriginal) return;
        if (!asset || asset.state !== 'READY' || !original) {fail(error('LOCAL_ORIGINAL_MISSING')); return;}
        finish({asset, original});
      };
      a.onsuccess = () => {asset = a.result; gotAsset = true; complete();};
      o.onsuccess = () => {original = o.result; gotOriginal = true; complete();};
    });
    const {asset, original} = stored;
    if (!(original.bytes instanceof ArrayBuffer) || original.size !== asset.size ||
        original.sha256 !== asset.sha256 || original.bytes.byteLength !== asset.size ||
        await this.digest(original.bytes) !== asset.sha256) throw error('LOCAL_ORIGINAL_CORRUPT');
    if (signal?.aborted) throw error('OPERATION_ABORTED');
    return original.bytes.slice(0);
  }

  async getRecipe(id) {
    const database = await this.database();
    const stored = await transact(database, ['assets', 'originals', 'recipeHeads', 'recipeVersions'],
      'readonly', (tx, finish, fail) => {
        const a = tx.objectStore('assets').get(id), o = tx.objectStore('originals').get(id);
        let asset, original, gotAsset = false, gotOriginal = false;
        const ready = () => {
          if (!gotAsset || !gotOriginal) return;
          if (!asset || asset.state !== 'READY' || !original) {fail(error('LOCAL_ORIGINAL_MISSING')); return;}
          const h = tx.objectStore('recipeHeads').get(id);
          h.onsuccess = () => {
            if (!h.result) {finish(null); return;}
            const revision = h.result.revision;
            if (!Number.isSafeInteger(revision) || revision < 1) {fail(error('LOCAL_RECIPE_CORRUPT')); return;}
            const v = tx.objectStore('recipeVersions').get(versionKey(id, revision));
            v.onsuccess = () => {
              if (!v.result || v.result.assetID !== id || v.result.revision !== revision) {
                fail(error('LOCAL_RECIPE_CORRUPT')); return;
              }
              finish(v.result);
            };
          };
        };
        a.onsuccess = () => {asset = a.result; gotAsset = true; ready();};
        o.onsuccess = () => {original = o.result; gotOriginal = true; ready();};
      });
    if (!stored) return null;
    if (typeof stored.body !== 'string' || typeof stored.sha256 !== 'string' ||
        await this.digest(new TextEncoder().encode(stored.body)) !== stored.sha256) {
      throw error('LOCAL_RECIPE_CORRUPT');
    }
    let body;
    try {body = JSON.parse(stored.body); validateRecipe(body);}
    catch {throw error('LOCAL_RECIPE_CORRUPT');}
    return {revision: stored.revision, body};
  }

  async saveRecipe(id, expectedRevision, recipe) {
    if (typeof id !== 'string' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw error('INVALID_REVISION');
    }
    const body = recipeJSON(recipe);
    const digest = await this.digest(new TextEncoder().encode(body)), database = await this.database();
    return transact(database, ['assets', 'originals', 'recipeHeads', 'recipeVersions'],
      'readwrite', (tx, finish, fail) => {
        const a = tx.objectStore('assets').get(id), o = tx.objectStore('originals').get(id);
        let asset, original, gotAsset = false, gotOriginal = false;
        const ready = () => {
          if (!gotAsset || !gotOriginal) return;
          if (!asset || asset.state !== 'READY' || !original) {fail(error('LOCAL_ORIGINAL_MISSING')); return;}
          const heads = tx.objectStore('recipeHeads'), versions = tx.objectStore('recipeVersions');
          const h = heads.get(id);
          h.onsuccess = () => {
            const current = h.result?.revision ?? 0;
            if (!Number.isSafeInteger(current) || current < 0) {fail(error('LOCAL_RECIPE_CORRUPT')); return;}
            if (current !== expectedRevision) {fail(error('REVISION_CONFLICT')); return;}
            const revision = current + 1;
            if (!Number.isSafeInteger(revision)) {fail(error('INVALID_REVISION')); return;}
            versions.add({id: versionKey(id, revision), assetID: id, revision, body, sha256: digest,
              createdAt: this.clock()});
            heads.put({id, revision});
            finish({revision, body: JSON.parse(body)});
          };
        };
        a.onsuccess = () => {asset = a.result; gotAsset = true; ready();};
        o.onsuccess = () => {original = o.result; gotOriginal = true; ready();};
      });
  }
}
