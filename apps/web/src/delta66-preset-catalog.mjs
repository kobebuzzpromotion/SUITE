import {portablePresetRecipe} from './preset-author/preset-author-contract.mjs';

const fail = code => { throw Error(code); };
function label(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value))
    fail('PRESET_CATALOG_LABEL_INVALID');
  return value.trim();
}
function key(value) {
  if (!value || typeof value !== 'object' || !['PERSONAL','WORKSPACE','AUTHOR_DRAFT','AUTHOR_PUBLISHED'].includes(value.kind) ||
      typeof value.id !== 'string' || !value.id || !Number.isSafeInteger(value.version) || value.version < 1)
    fail('PRESET_CATALOG_REFERENCE_INVALID');
  return JSON.stringify([value.kind, value.id, value.version]);
}

/** Display metadata only. 'hot' is an explicit curator choice, never fabricated popularity.
 * Default/Adjusted is explicit catalog metadata, not inferred from owner/scope or version.
 * Entries originate from the existing authenticated preset facade; this does not grant access.
 */
export function selectPresetCatalog(entries, metadata = [], {filter = 'all', group = null, hotOnly = false, query = ''} = {}) {
  if (!Array.isArray(entries) || entries.length > 10000 || !Array.isArray(metadata) || metadata.length > 10000 ||
      !['all','default','adjusted'].includes(filter) || typeof hotOnly !== 'boolean' || typeof query !== 'string' || query.length > 255)
    fail('PRESET_CATALOG_INPUT_INVALID');
  if (group !== null) label(group);
  const meta = new Map(), seen = new Set();
  for (const entry of metadata) {
    const id = key(entry);
    if (meta.has(id) || !['default','adjusted'].includes(entry.category) || typeof entry.hot !== 'boolean' ||
        !Array.isArray(entry.groups) || entry.groups.length > 64) fail('PRESET_CATALOG_METADATA_INVALID');
    meta.set(id, {category: entry.category, hot: entry.hot, groups: [...new Set(entry.groups.map(label))]});
  }
  const needle = query.trim().toLocaleLowerCase();
  return entries.flatMap(entry => {
    const id = key(entry); if (seen.has(id)) fail('PRESET_CATALOG_DUPLICATE'); seen.add(id);
    const name = label(entry.name), info = meta.get(id) ?? {category: 'unclassified', hot: false, groups: []};
    if (filter !== 'all' && info.category !== filter || hotOnly && !info.hot ||
        group !== null && !info.groups.includes(group.trim()) || !name.toLocaleLowerCase().includes(needle)) return [];
    return [{...structuredClone(entry), catalog: structuredClone(info)}];
  });
}

/** Self-contained SUITE portable-color snapshot, including optional validated
 * personalLook coefficients, NOT a bearer/auth token or remote share link.
 * No photo IDs, masks, crop or export settings cross this existing strict portable boundary.
 * Imported data is a draft: user confirmation + existing facade save is still required.
 */
export function encodePortablePresetSnapshot({name, recipe}) {
  const json = JSON.stringify({format: 'suite-portable-preset-1', name: label(name), recipe: portablePresetRecipe(recipe)});
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > 256 * 1024) fail('PRESET_SNAPSHOT_TOO_LARGE');
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'suitepreset1.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePortablePresetSnapshot(token) {
  if (typeof token !== 'string' || token.length > 350000 || !/^suitepreset1\.[A-Za-z0-9_-]+$/.test(token))
    fail('PRESET_SNAPSHOT_INVALID');
  const encoded = token.slice(13), base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  let value;
  try {
    const raw = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    if (raw.length > 256 * 1024) fail('PRESET_SNAPSHOT_TOO_LARGE');
    value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(raw, char => char.charCodeAt(0))));
  } catch { fail('PRESET_SNAPSHOT_INVALID'); }
  if (!value || value.format !== 'suite-portable-preset-1' || Object.keys(value).sort().join(',') !== 'format,name,recipe')
    fail('PRESET_SNAPSHOT_INVALID');
  const result = {name: label(value.name), recipe: portablePresetRecipe(value.recipe)};
  if (encodePortablePresetSnapshot(result) !== token) fail('PRESET_SNAPSHOT_NONCANONICAL');
  return {...result, state: 'untrusted-import-draft', requiresConfirmation: true};
}
