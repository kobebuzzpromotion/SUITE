import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspacePresetClient} from './workspace-preset-client.mjs';
import {mergeSavedVignette} from './batch-vignette-sync.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/iu;
const FIVE = ['amount', 'midpoint', 'roundness', 'feather', 'highlights'];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const abort = signal => {if (signal?.aborted) throw new DOMException('Vignette Preset cancelled', 'AbortError');};
const vignetteOf = body => body?.parameters?.extendedParameters?.postCropAdjustments?.vignette;
const neutral = () => ({schemaVersion: 1, parameters: {exposure: 0, contrast: 1,
  saturation: 1, rotationDegrees: 0, extendedParameters: {},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});

function vignetteOnly(body) {
  validateRecipe(body);
  const value = vignetteOf(body);
  // Amount-only is a real legacy Recipe, not an incomplete five-control preset.
  if (!exact(value, ['amount']) && !exact(value, FIVE))
    throw Error('VIGNETTE_PRESET_CONTROLS_REQUIRED');
  const result = neutral();
  result.parameters.extendedParameters.postCropAdjustments = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-manual-vignette-1', vignette: structuredClone(value)};
  validateRecipe(result);
  return result;
}

/**
 * Node Workspace host injection only. A selected ID or caller token is not
 * authority: every operation uses a fresh JWT membership gate and the server
 * performs the atomic Asset SHA, Preset-version and Recipe-CAS checks.
 */
export function mountVignetteWorkspacePreset({container, baseURL, workspaceId, projectId,
  expectedSubject, expectedTenantId, tokenProvider, selectionProvider,
  fetchImpl = globalThis.fetch, documentRef = globalThis.document} = {}) {
  if (!container || typeof container.replaceChildren !== 'function' ||
      !documentRef || typeof documentRef.createElement !== 'function' ||
      [workspaceId, projectId].some(value => typeof value !== 'string' || !UUID.test(value)) ||
      typeof tokenProvider !== 'function' || typeof selectionProvider !== 'function')
    throw Error('VIGNETTE_PRESET_MOUNT_CONFIG_INVALID');
  const sessionClient = new WorkspaceSessionClient({baseURL, tokenProvider, fetchImpl});
  const origin = sessionClient.baseURL;
  let disposed = false;
  async function selected() {
    if (disposed) throw Error('VIGNETTE_PRESET_MOUNT_DISPOSED');
    let value;
    try {value = await selectionProvider();} catch {throw Error('VIGNETTE_PRESET_SELECTION_UNAVAILABLE');}
    if (!exact(value, ['workspaceId', 'projectId', 'assetId']) ||
        value.workspaceId !== workspaceId || value.projectId !== projectId ||
        typeof value.assetId !== 'string' || !UUID.test(value.assetId))
      throw Error('VIGNETTE_PRESET_SELECTION_CHANGED');
    return value.assetId;
  }
  const scopedTokenProvider = async ({signal} = {}) => {
    abort(signal); await selected();
    const token = await tokenProvider({signal}); abort(signal);
    await selected(); return token;
  };
  const workspace = new WorkspacePresetClient({baseURL, workspaceId, expectedSubject,
    expectedTenantId, tokenProvider: scopedTokenProvider, fetchImpl});
  function normalized(raw, kind, mode) {
    if (raw?.scope !== kind || typeof raw.id !== 'string' || !UUID.test(raw.id) ||
        !Number.isSafeInteger(raw.version) || raw.version < 1 ||
        !raw.body)
      throw Error('VIGNETTE_PRESET_INVALID');
    validateRecipe(raw.body);
    const value = vignetteOf(raw.body);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('VIGNETTE_PRESET_CONTROLS_REQUIRED');
    let pure = false;
    try {pure = equal(vignetteOnly(raw.body), raw.body);} catch { /* Legacy partial Full presets remain valid. */ }
    if (mode === 'vignette-only' && !pure) throw Error('VIGNETTE_PRESET_NOT_PURE');
    return Object.freeze({kind, mode: pure ? 'vignette-only' : 'full', id: raw.id, version: raw.version,
      name: raw.name, recipe: structuredClone(raw.body)});
  }
  function checkScope(kind, mode) {
    if (!['PERSONAL', 'WORKSPACE'].includes(kind)) throw Error('VIGNETTE_PRESET_SCOPE_INVALID');
    if (!['full', 'vignette-only'].includes(mode)) throw Error('VIGNETTE_PRESET_MODE_INVALID');
  }
  async function scopedGet(path, assetId, {signal} = {}) {
    abort(signal);
    if (await selected() !== assetId) throw Error('VIGNETTE_PRESET_SELECTION_CHANGED');
    const token = await scopedTokenProvider({signal});
    const gate = new WorkspaceSessionClient({baseURL: origin,
      tokenProvider: () => token, fetchImpl});
    await gate.getFreshSession({workspaceId, expectedSubject, expectedTenantId,
      access: 'edit', signal});
    abort(signal);
    const response = await fetchImpl(`${origin}/v1/workspaces/${workspaceId}/projects/${projectId}${path}`,
      {method: 'GET', signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: {Authorization: `Bearer ${token}`}});
    abort(signal);
    if (!response?.ok || response.redirected === true) throw Error('VIGNETTE_PRESET_ASSET_UNAVAILABLE');
    const body = await response.json(); abort(signal);
    if (await selected() !== assetId) throw Error('VIGNETTE_PRESET_SELECTION_CHANGED');
    return body;
  }
  async function fixedAsset({signal} = {}) {
    const assetId = await selected();
    const list = await scopedGet('/assets', assetId, {signal});
    if (!Array.isArray(list?.assets)) throw Error('VIGNETTE_PRESET_ASSET_RESPONSE_INVALID');
    const matches = list.assets.filter(item => item?.id === assetId);
    if (matches.length !== 1 || matches[0].deletedAt !== null ||
        typeof matches[0].sha256 !== 'string' || !SHA.test(matches[0].sha256))
      throw Error('VIGNETTE_PRESET_ASSET_UNAVAILABLE');
    const result = await scopedGet(`/assets/${assetId}/recipe`, assetId, {signal});
    const stored = result?.recipe;
    if (!stored || stored.assetId !== assetId || stored.projectId !== projectId ||
        stored.workspaceId !== workspaceId || stored.branch !== false ||
        !Number.isSafeInteger(stored.version) || stored.version < 1 || !stored.body)
      throw Error('VIGNETTE_PRESET_SAVED_RECIPE_REQUIRED');
    validateRecipe(stored.body);
    return {assetId, sha256: matches[0].sha256.toLowerCase(), version: stored.version,
      body: structuredClone(stored.body)};
  }
  async function save({kind, name, mode = 'vignette-only', signal} = {}) {
    checkScope(kind, mode);
    abort(signal);
    const before = await fixedAsset({signal});
    const body = mode === 'vignette-only' ? vignetteOnly(before.body) : before.body;
    if (mode === 'full' && !vignetteOf(body)) throw Error('VIGNETTE_PRESET_CONTROLS_REQUIRED');
    const preset = (await workspace.createPreset({scope: kind, name,
      body, signal})).preset;
    const after = await fixedAsset({signal});
    if (after.assetId !== before.assetId || after.sha256 !== before.sha256 ||
        after.version !== before.version || !equal(after.body, before.body))
      throw Error('VIGNETTE_PRESET_SAVE_UNVERIFIED');
    const reloaded = await reload({kind, mode, id: preset.id, signal});
    if (reloaded.version !== preset.version || !equal(reloaded.recipe, body))
      throw Error('VIGNETTE_PRESET_SAVE_UNVERIFIED');
    return reloaded;
  }
  async function reload({kind, mode = 'vignette-only', id, signal} = {}) {
    abort(signal); await selected();
    checkScope(kind, mode);
    const preset = (await workspace.getPreset(id, {signal})).preset;
    await selected(); abort(signal);
    return normalized(preset, kind, mode);
  }
  async function list({kind, mode = 'vignette-only', signal} = {}) {
    abort(signal); await selected();
    checkScope(kind, mode);
    const rows = (await workspace.listPresets({signal})).presets;
    await selected(); abort(signal);
    return rows.filter(item => item.scope === kind).flatMap(item => {
      try {return [normalized(item, kind, mode)];} catch {return [];}
    });
  }
  async function apply({kind, mode = 'vignette-only', id, version, signal} = {}) {
    checkScope(kind, mode);
    const before = await fixedAsset({signal});
    const preset = await reload({kind, mode, id, signal});
    if (preset.version !== version) throw Error('VIGNETTE_PRESET_VERSION_CONFLICT');
    const expected = mode === 'vignette-only' ?
      mergeSavedVignette(preset.recipe, before.body) : preset.recipe;
    const options = {presetId: id,
      expectedPresetVersion: version, projectId, assetId: before.assetId,
      baseVersion: before.version, expectedOriginalSHA256: before.sha256, signal};
    const result = mode === 'vignette-only' ?
      await workspace.applyVignettePresetVersioned(options) :
      await workspace.applyPresetVersioned(options);
    const after = await fixedAsset({signal});
    if (after.assetId !== before.assetId || after.sha256 !== before.sha256 ||
        after.version !== before.version + 1 || !equal(after.body, expected) ||
        result.version?.version !== after.version || result.version?.branch !== false)
      throw Error('VIGNETTE_PRESET_APPLY_UNVERIFIED');
    return Object.freeze({outcome: 'saved', mode, preset, version: after.version,
      recipe: after.body, assetId: after.assetId, sha256: after.sha256});
  }
  const panel = documentRef.createElement('section');
  panel.className = 'vignette-workspace-preset';
  panel.innerHTML = '<h3>Vignette Preset · Node Workspace</h3><label>保存先<select data-vignette-preset-scope><option value="PERSONAL">Personal</option><option value="WORKSPACE">Workspace</option></select></label><label>適用方式<select data-vignette-preset-mode><option value="vignette-only">Vignetteのみ（他の調整を保持）</option><option value="full">Preset全体（既存調整を置換）</option></select></label><label>名前<input data-vignette-preset-name maxlength="120" autocomplete="off"></label><button type="button" data-vignette-preset-save>保存済み写真からPreset作成</button><button type="button" data-vignette-preset-refresh>Presetを再取得</button><label>適用するPreset<select data-vignette-preset-list></select></label><button type="button" data-vignette-preset-apply>選んだPresetを保存済み写真へ適用</button><p role="status" aria-live="polite" data-vignette-preset-status>本人Workspace接続待ち</p>';
  container.replaceChildren(panel);
  const scope = panel.querySelector('[data-vignette-preset-scope]');
  const mode = panel.querySelector('[data-vignette-preset-mode]');
  const name = panel.querySelector('[data-vignette-preset-name]');
  const options = panel.querySelector('[data-vignette-preset-list]');
  const status = panel.querySelector('[data-vignette-preset-status]');
  let pending = false, items = [];
  async function action(callback) {
    if (pending || disposed) return;
    pending = true;
    for (const button of panel.querySelectorAll('button')) button.disabled = true;
    status.textContent = '確認中…';
    try {status.textContent = await callback();}
    catch (error) {status.textContent = error?.message || 'VIGNETTE_PRESET_OPERATION_FAILED';}
    finally {pending = false; if (!disposed) for (const button of panel.querySelectorAll('button')) button.disabled = false;}
  }
  const controller = new AbortController();
  panel.querySelector('[data-vignette-preset-save]').addEventListener('click', () => void action(async () => {
    const preset = await save({kind: scope.value, mode: mode.value, name: name.value, signal: controller.signal});
    items = await list({kind: scope.value, mode: mode.value, signal: controller.signal}); renderOptions();
    options.value = preset.id; return `保存確認済み · version ${preset.version}`;
  }), {signal: controller.signal});
  panel.querySelector('[data-vignette-preset-refresh]').addEventListener('click', () => void action(async () => {
    items = await list({kind: scope.value, mode: mode.value, signal: controller.signal}); renderOptions();
    return `${items.length} 件を再取得`;
  }), {signal: controller.signal});
  panel.querySelector('[data-vignette-preset-apply]').addEventListener('click', () => void action(async () => {
    const chosen = items.find(item => item.id === options.value && item.kind === scope.value);
    if (!chosen) throw Error('VIGNETTE_PRESET_SELECTION_REQUIRED');
    const result = await apply({kind: chosen.kind, mode: mode.value, id: chosen.id,
      version: chosen.version, signal: controller.signal});
    return `適用・保存確認済み · Recipe version ${result.version}`;
  }), {signal: controller.signal});
  scope.addEventListener('change', () => {items = []; renderOptions();
    status.textContent = '保存先を変更しました。再取得してください。';}, {signal: controller.signal});
  mode?.addEventListener('change', () => {items = []; renderOptions();
    status.textContent = '適用方式を変更しました。再取得してください。';}, {signal: controller.signal});
  function renderOptions() {options.replaceChildren(); for (const item of items) {
    const option = documentRef.createElement('option'); option.value = item.id;
    option.textContent = `${item.name} · version ${item.version}`; options.append(option);
  }}
  return Object.freeze({save, reload, list, apply, dispose() {if (disposed) return;
    disposed = true; controller.abort(); container.replaceChildren();}});
}
