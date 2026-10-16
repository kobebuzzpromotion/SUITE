import {parseCubeLUT} from './delta66-preset-cube.mjs';
import {readLookXMPSubset} from './processing/astra-look-corpus.mjs';

const sha = /^[a-f0-9]{64}$/i;
const abort = signal => { if (signal?.aborted) throw new DOMException('Preset assets cancelled', 'AbortError'); };
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  value => value.toString(16).padStart(2, '0')).join('');

/** Load only the dependencies of a selected, already-authorized synced preset.
 * URLs/manifest must come from the host's existing authenticated asset authority.
 * SHA equality proves byte integrity, NOT ownership, rights or manifest authenticity.
 * No upload endpoint, no entire-library download, no global cache or Recipe mutation.
 * Caller persists verified bytes using its existing asset store after success.
 */
export async function loadSyncedPresetAssets(manifest, {allowedOrigins, cached = new Map(),
  fetchImpl = globalThis.fetch, signal} = {}) {
  abort(signal);
  if (!Array.isArray(manifest) || manifest.length > 32 || !Array.isArray(allowedOrigins) ||
      !allowedOrigins.length || !(cached instanceof Map) || typeof fetchImpl !== 'function')
    throw Error('PRESET_ASSET_CONFIG_INVALID');
  const origins = new Set(allowedOrigins.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== value)
      throw Error('PRESET_ASSET_ORIGIN_INVALID');
    return url.origin;
  }));
  let total = 0;
  const ids = new Set();
  const entries = manifest.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !sha.test(entry.sha256) ||
        !['cube3d', 'xmp-color-subset'].includes(entry.kind) || !Number.isSafeInteger(entry.byteLength) ||
        entry.byteLength < 1 || entry.byteLength > (entry.kind === 'cube3d' ? 32 * 1024 * 1024 : 1024 * 1024))
      throw Error('PRESET_ASSET_MANIFEST_INVALID');
    ids.add(entry.id); total += entry.byteLength;
    if (total > 64 * 1024 * 1024) throw Error('PRESET_ASSET_BUDGET_EXCEEDED');
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !origins.has(url.origin))
      throw Error('PRESET_ASSET_URL_INVALID');
    return {id: entry.id, sha256: entry.sha256.toLowerCase(), kind: entry.kind,
      byteLength: entry.byteLength, url: url.href};
  });
  const output = [];
  for (const entry of entries) {
    abort(signal);
    let bytes;
    if (cached.has(entry.sha256)) {
      const raw = cached.get(entry.sha256);
      if (!(raw instanceof Uint8Array) || raw.byteLength !== entry.byteLength) throw Error('PRESET_ASSET_CACHE_INVALID');
      bytes = new Uint8Array(raw);
    } else {
      const response = await fetchImpl(entry.url, {signal, credentials: 'omit', redirect: 'error',
        cache: 'no-store', referrerPolicy: 'no-referrer'});
      abort(signal);
      if (!response?.ok || response.redirected || !response.body?.getReader) throw Error('PRESET_ASSET_DOWNLOAD_FAILED');
      const contentLength = response.headers?.get('content-length');
      if (contentLength !== null && contentLength !== undefined &&
          (!/^\d+$/.test(contentLength) || Number(contentLength) !== entry.byteLength)) {
        await response.body.cancel(); throw Error('PRESET_ASSET_LENGTH_MISMATCH');
      }
      const reader = response.body.getReader();
      bytes = new Uint8Array(entry.byteLength); let offset = 0;
      try {
        while (true) {
          abort(signal); const part = await reader.read(); abort(signal);
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || offset + part.value.length > bytes.length)
            throw Error('PRESET_ASSET_LENGTH_MISMATCH');
          bytes.set(part.value, offset); offset += part.value.length;
        }
        if (offset !== bytes.length) throw Error('PRESET_ASSET_LENGTH_MISMATCH');
      } catch (error) { try { await reader.cancel(); } catch {} throw error; }
      finally { reader.releaseLock(); }
    }
    abort(signal);
    if (await digest(bytes) !== entry.sha256) throw Error('PRESET_ASSET_SHA_MISMATCH');
    abort(signal);
    const decoded = entry.kind === 'cube3d'
      ? parseCubeLUT(new TextDecoder('utf-8', {fatal: true}).decode(bytes)) : readLookXMPSubset(bytes);
    output.push({id: entry.id, sha256: entry.sha256, kind: entry.kind, bytes, decoded});
  }
  abort(signal);
  return output;
}
