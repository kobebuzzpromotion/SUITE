import {parseCubeLUT} from './delta66-preset-cube.mjs';

const MAX_BYTES = 33554432;
const DATABASE = 'suite-local-luts-v1';
const STORE = 'cubeBytes';
const abort = signal => {
  if (signal?.aborted) throw new DOMException('LUT operation cancelled', 'AbortError');
};
function requireRuntime() {
  if (!globalThis.crypto?.subtle?.digest) throw Error('LOCAL_LUT_CRYPTO_UNAVAILABLE');
  if (!globalThis.indexedDB?.open) throw Error('LOCAL_LUT_STORAGE_UNAVAILABLE');
}
function reference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== 2 || !['sha256', 'byteLength'].every(key => {
        const d = Object.getOwnPropertyDescriptor(value, key);
        return d?.enumerable && Object.hasOwn(d, 'value');
      }) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > MAX_BYTES)
    throw Error('INVALID_LOCAL_LUT_REFERENCE');
  return {sha256: value.sha256, byteLength: value.byteLength};
}
function copyBytes(input) {
  if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) throw Error('LOCAL_LUT_BYTES_INVALID');
  if (input.byteLength < 1 || input.byteLength > MAX_BYTES) throw Error('LOCAL_LUT_BYTES_INVALID');
  return input instanceof ArrayBuffer ? new Uint8Array(input.slice(0)) : new Uint8Array(input);
}
async function validate(bytes, signal) {
  abort(signal);
  const decoded = parseCubeLUT(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  abort(signal);
  const sha256 = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  return {decoded, lutRef: {sha256, byteLength: bytes.byteLength}};
}
function open(signal) {
  abort(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, db) => {
      if (settled) {db?.close(); return;}
      settled = true; signal?.removeEventListener('abort', cancelled);
      if (error) reject(error); else resolve(db);
    };
    const cancelled = () => finish(new DOMException('LUT operation cancelled', 'AbortError'));
    const request = indexedDB.open(DATABASE, 1);
    signal?.addEventListener('abort', cancelled, {once: true});
    request.onupgradeneeded = () => {
      if (settled) {request.transaction.abort(); return;}
      request.result.createObjectStore(STORE);
    };
    request.onblocked = () => finish(Error('LOCAL_LUT_STORAGE_BLOCKED'));
    request.onerror = () => finish(request.error || Error('LOCAL_LUT_STORAGE_UNAVAILABLE'));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      finish(null, request.result);
    };
  });
}
async function transaction(mode, key, bytes, signal) {
  const db = await open(signal);
  try {
    abort(signal);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result, failure;
      const cancelled = () => {
        failure = new DOMException('LUT operation cancelled', 'AbortError');
        try {tx.abort();} catch { /* Transaction completion wins after commit. */ }
      };
      const cleanup = () => signal?.removeEventListener('abort', cancelled);
      tx.oncomplete = () => {cleanup(); resolve(result);};
      tx.onabort = () => {cleanup(); reject(failure || tx.error || Error('LOCAL_LUT_STORAGE_FAILED'));};
      tx.onerror = () => {failure ||= tx.error || Error('LOCAL_LUT_STORAGE_FAILED');};
      signal?.addEventListener('abort', cancelled, {once: true});
      const request = mode === 'readonly' ? tx.objectStore(STORE).get(key) : tx.objectStore(STORE).put(bytes, key);
      request.onsuccess = () => {result = request.result;};
    });
  } finally {db.close();}
}

/** Same-browser persistence only: no Cloud Safe, account sync or shared-preset rights. */
export async function saveLocalLUT(input, {signal} = {}) {
  requireRuntime(); abort(signal);
  const bytes = copyBytes(input);
  const {lutRef} = await validate(bytes, signal);
  await transaction('readwrite', lutRef.sha256, bytes, signal);
  abort(signal);
  return lutRef;
}

/** Resolve and revalidate every persisted byte; missing/corrupt data never becomes identity. */
export async function loadLocalLUT(input, {signal} = {}) {
  return (await loadVerified(input, signal)).decoded;
}

/** Verified original bytes for explicit user-controlled local backup only. */
export async function loadLocalLUTBytes(input, {signal} = {}) {
  return (await loadVerified(input, signal)).bytes;
}
async function loadVerified(input, signal) {
  requireRuntime(); abort(signal);
  const expected = reference(input);
  const stored = await transaction('readonly', expected.sha256, undefined, signal);
  if (stored === undefined) throw Error('LOCAL_LUT_NOT_FOUND');
  const bytes = copyBytes(stored);
  if (bytes.byteLength !== expected.byteLength) throw Error('LOCAL_LUT_LENGTH_MISMATCH');
  const {decoded, lutRef} = await validate(bytes, signal);
  if (lutRef.sha256 !== expected.sha256) throw Error('LOCAL_LUT_SHA_MISMATCH');
  return {bytes, decoded};
}
