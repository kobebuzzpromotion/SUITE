import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {resolveExportNamingContext} from './export-naming-context.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const METHODS = new Set(['original-effect-preset', 'original-effect-custom']);
const abort = signal => {if (signal?.aborted) throw new DOMException('Preset naming cancelled', 'AbortError');};
const fail = code => {throw Error(`WORKSPACE_EFFECT_NAMING_${code}`);};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const sameJSON = (left, right) => {
  try {return JSON.stringify(left) === JSON.stringify(right);} catch {return false;}
};
const validVersion = value => Number.isSafeInteger(value) && value >= 1;

/**
 * Read-only Node Workspace naming evidence. A successful return is not Final
 * authorization: repeat this gate immediately before/after export and use the
 * independent export permission/Original-byte checks in the Final path.
 */
export async function readWorkspaceEffectPresetNamingInput({baseURL, tokenProvider,
  fetchImpl = globalThis.fetch, workspaceId, projectId, expectedSubject,
  expectedTenantId, state, method, signal} = {}) {
  if (!METHODS.has(method) || !UUID.test(workspaceId ?? '') ||
      !UUID.test(projectId ?? '') || !plain(state) || state.dirty !== false ||
      !validVersion(state.revision) || !plain(state.asset) ||
      !UUID.test(state.asset.id ?? '') || !SHA.test(state.asset.sha256 ?? '') ||
      !Number.isSafeInteger(state.asset.size) || state.asset.size < 1 ||
      typeof state.asset.name !== 'string' || !state.asset.name.trim() ||
      !plain(state.recipe)) fail('INPUT_INVALID');
  const client = new WorkspaceSessionClient({baseURL, tokenProvider, fetchImpl});
  // Pin the caller's selection across awaits; do not trust an in-flight UI
  // mutation, a catalogue entry, or the caller's claimed saved Recipe alone.
  const selected = {id: state.asset.id, name: state.asset.name,
    sha256: state.asset.sha256.toLowerCase(), size: state.asset.size,
    revision: state.revision, recipe: state.recipe};
  const recipeJSON = JSON.stringify(selected.recipe);
  if (!recipeJSON || recipeJSON.length > 2_000_000) fail('INPUT_INVALID');
  const root = `/v1/workspaces/${workspaceId}`;
  const assetPath = `/projects/${projectId}/assets`;

  async function read(path) {
    abort(signal);
    let token;
    try {token = await tokenProvider({signal});} catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') abort(signal);
      fail('TOKEN_UNAVAILABLE');
    }
    if (typeof token !== 'string' || !token || token.length > 8192 || /\s/u.test(token))
      fail('TOKEN_INVALID');
    await new WorkspaceSessionClient({baseURL: client.baseURL,
      tokenProvider: () => token, fetchImpl}).getFreshSession({workspaceId,
      expectedSubject, expectedTenantId, access: 'edit', signal});
    abort(signal);
    let response;
    try {response = await fetchImpl(`${client.baseURL}${root}${path}`, {method: 'GET',
      signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', headers: {Authorization: `Bearer ${token}`}});
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') abort(signal);
      fail('REQUEST_FAILED');
    }
    abort(signal);
    if (!response || response.redirected === true || response.status !== 200 || response.ok !== true)
      fail('AUTHORITY_UNAVAILABLE');
    let body;
    try {body = await response.json();} catch {fail('RESPONSE_INVALID');}
    if (!plain(body)) fail('RESPONSE_INVALID');
    return body;
  }
  async function asset() {
    const result = await read(assetPath);
    if (!Array.isArray(result.assets) || result.assets.length > 10_000) fail('ASSET_UNAVAILABLE');
    const matches = result.assets.filter(item => item?.id === selected.id);
    if (matches.length !== 1) fail('ASSET_UNAVAILABLE');
    const item = matches[0];
    if (item.tenantId !== workspaceId || item.deletedAt !== null || item.cloudSafe !== true ||
        item.name !== selected.name || item.sha256?.toLowerCase() !== selected.sha256 ||
        item.size !== selected.size || typeof item.originalKey !== 'string' || !item.originalKey)
      fail('ASSET_CHANGED');
    return item;
  }
  async function saved() {
    const result = await read(`${assetPath}/${selected.id}/recipe`);
    const item = result.recipe;
    if (!plain(item) || item.workspaceId !== workspaceId || item.projectId !== projectId ||
        item.assetId !== selected.id || item.version !== selected.revision || item.branch !== false ||
        !plain(item.body) || !sameJSON(item.body, selected.recipe) ||
        !plain(item.presetSnapshot) || !UUID.test(item.presetSnapshot.id ?? '') ||
        !validVersion(item.presetSnapshot.version) || !plain(item.presetSnapshot.body))
      fail('SAVED_RECIPE_UNAVAILABLE');
    return item;
  }
  async function preset(snapshot) {
    const result = await read(`/presets/${snapshot.id}`);
    const item = result.preset;
    if (!plain(item) || item.workspaceId !== workspaceId || item.id !== snapshot.id ||
        !['PERSONAL', 'WORKSPACE'].includes(item.scope) || item.deletedAt !== null ||
        (item.scope === 'PERSONAL' && item.ownerUserId !== expectedSubject) ||
        item.version !== snapshot.version || !plain(item.body) ||
        !sameJSON(item.body, snapshot.body) ||
        typeof item.name !== 'string' || !item.name.trim())
      fail('PRESET_CHANGED');
    return item;
  }
  await asset();
  const firstSaved = await saved();
  const firstPreset = await preset(firstSaved.presetSnapshot);
  // Re-read all mutable authority after the multi-request operation. This is
  // still a non-atomic preflight and is never represented as a Final grant.
  await asset();
  const finalSaved = await saved();
  const finalPreset = await preset(finalSaved.presetSnapshot);
  if (!sameJSON(firstSaved, finalSaved) || !sameJSON(firstPreset, finalPreset) ||
      state.dirty !== false || state.revision !== selected.revision ||
      state.asset?.id !== selected.id || state.asset.name !== selected.name ||
      state.asset.sha256?.toLowerCase() !== selected.sha256 ||
      state.asset.size !== selected.size || JSON.stringify(state.recipe) !== recipeJSON)
    fail('STATE_CHANGED');
  abort(signal);
  const pinnedState = {asset: {id: selected.id, name: selected.name},
    revision: selected.revision, dirty: false, recipe: selected.recipe};
  const namingContext = resolveExportNamingContext({state: pinnedState, method,
    workspaceRecipeVersion: finalSaved, workspacePreset: finalPreset});
  return Object.freeze({namingContext,
    binding: Object.freeze({workspaceId, projectId, assetID: selected.id,
      originalSHA256: selected.sha256, savedRevision: selected.revision,
      presetID: finalPreset.id, presetVersion: finalPreset.version}),
    verification: 'WORKSPACE_EFFECT_PRESET_NAME_NOT_FINAL_AUTHORITY'});
}
