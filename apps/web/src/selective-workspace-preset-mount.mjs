import {WorkspaceSessionClient} from './workspace-session-client.mjs';
import {WorkspacePresetClient} from './workspace-preset-client.mjs';
import {mergeSavedSelectiveColor} from './batch-selective-color-sync.mjs';
import {validateSelectiveColor} from './processing/selective-color.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/iu;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const abort = signal => {if (signal?.aborted) throw new DOMException('Selective Preset cancelled', 'AbortError');};
const selectiveOf = body => body?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.selectiveColor;
const neutral = () => ({schemaVersion: 1, parameters: {exposure: 0, contrast: 1,
  saturation: 1, rotationDegrees: 0, extendedParameters: {},
  processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}});

function checkedSelective(body) {
  validateRecipe(body);
  const source = selectiveOf(body);
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw Error('SELECTIVE_PRESET_SAVED_SETTINGS_REQUIRED');
  return validateSelectiveColor(source);
}
function selectiveOnly(body) {
  const selectiveColor = checkedSelective(body);
  const result = neutral();
  result.parameters.extendedParameters.postDecodeAdjustments = {schemaVersion: 1,
    engineVersion: 'suite-srgb8-color-detail-1', color: {selectiveColor}};
  result.parameters.processingOrder.splice(3, 0, 'postDecodeAdjustments');
  validateRecipe(result);
  return result;
}

/** Host-injected Node Workspace boundary; no Trial/Cloud or OIDC-host fallback. */
export function mountSelectiveWorkspacePreset({container, baseURL, workspaceId, projectId,
  expectedSubject, expectedTenantId, tokenProvider, selectionProvider,
  fetchImpl = globalThis.fetch, documentRef = globalThis.document} = {}) {
  if (!container || typeof container.replaceChildren !== 'function' ||
      !documentRef || typeof documentRef.createElement !== 'function' ||
      [workspaceId, projectId].some(value => typeof value !== 'string' || !UUID.test(value)) ||
      typeof tokenProvider !== 'function' || typeof selectionProvider !== 'function')
    throw Error('SELECTIVE_PRESET_MOUNT_CONFIG_INVALID');
  const sessionClient = new WorkspaceSessionClient({baseURL, tokenProvider, fetchImpl});
  let disposed = false;
  async function selected() {
    if (disposed) throw Error('SELECTIVE_PRESET_MOUNT_DISPOSED');
    let value;
    try {value = await selectionProvider();} catch {throw Error('SELECTIVE_PRESET_SELECTION_UNAVAILABLE');}
    if (!own(value, ['workspaceId', 'projectId', 'assetId']) ||
        value.workspaceId !== workspaceId || value.projectId !== projectId ||
        typeof value.assetId !== 'string' || !UUID.test(value.assetId))
      throw Error('SELECTIVE_PRESET_SELECTION_CHANGED');
    return value.assetId;
  }
  const scopedTokenProvider = async ({signal} = {}) => {
    abort(signal); await selected();
    const token = await tokenProvider({signal}); abort(signal);
    await selected(); return token;
  };
  const workspace = new WorkspacePresetClient({baseURL, workspaceId, expectedSubject,
    expectedTenantId, tokenProvider: scopedTokenProvider, fetchImpl});
  const origin = sessionClient.baseURL;
  async function scopedGet(path, assetId, {signal} = {}) {
    abort(signal);
    if (await selected() !== assetId) throw Error('SELECTIVE_PRESET_SELECTION_CHANGED');
    const token = await scopedTokenProvider({signal});
    const gate = new WorkspaceSessionClient({baseURL: origin, tokenProvider: () => token, fetchImpl});
    await gate.getFreshSession({workspaceId, expectedSubject, expectedTenantId,
      access: 'edit', signal});
    abort(signal);
    const response = await fetchImpl(`${origin}/v1/workspaces/${workspaceId}/projects/${projectId}${path}`,
      {method: 'GET', signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', headers: {Authorization: `Bearer ${token}`}});
    abort(signal);
    if (!response?.ok || response.redirected === true) throw Error('SELECTIVE_PRESET_ASSET_UNAVAILABLE');
    const body = await response.json(); abort(signal);
    if (await selected() !== assetId) throw Error('SELECTIVE_PRESET_SELECTION_CHANGED');
    return body;
  }
  async function fixedAsset({signal} = {}) {
    const assetId = await selected();
    const list = await scopedGet('/assets', assetId, {signal});
    if (!Array.isArray(list?.assets)) throw Error('SELECTIVE_PRESET_ASSET_RESPONSE_INVALID');
    const matches = list.assets.filter(item => item?.id === assetId);
    if (matches.length !== 1 || matches[0].deletedAt != null ||
        typeof matches[0].sha256 !== 'string' || !SHA.test(matches[0].sha256))
      throw Error('SELECTIVE_PRESET_ASSET_UNAVAILABLE');
    const response = await scopedGet(`/assets/${assetId}/recipe`, assetId, {signal});
    const stored = response?.recipe;
    if (!stored || stored.assetId !== assetId || stored.projectId !== projectId ||
        stored.workspaceId !== workspaceId || stored.branch !== false ||
        !Number.isSafeInteger(stored.version) || stored.version < 1 || !stored.body)
      throw Error('SELECTIVE_PRESET_SAVED_RECIPE_REQUIRED');
    validateRecipe(stored.body);
    return {assetId, sha256: matches[0].sha256.toLowerCase(), version: stored.version,
      body: structuredClone(stored.body)};
  }
  function normalized(raw, kind, mode) {
    if (raw?.scope !== kind || !UUID.test(raw.id) ||
        !Number.isSafeInteger(raw.version) || raw.version < 1)
      throw Error('SELECTIVE_PRESET_INVALID');
    checkedSelective(raw.body);
    const pure = same(selectiveOnly(raw.body), raw.body);
    if (mode === 'selective-only' && !pure) throw Error('SELECTIVE_PRESET_NOT_PURE');
    return Object.freeze({kind, mode: pure ? 'selective-only' : 'full', id: raw.id,
      version: raw.version, name: raw.name, recipe: structuredClone(raw.body)});
  }
  function scope(kind, mode) {
    if (!['PERSONAL', 'WORKSPACE'].includes(kind)) throw Error('SELECTIVE_PRESET_SCOPE_INVALID');
    if (!['full', 'selective-only'].includes(mode)) throw Error('SELECTIVE_PRESET_MODE_INVALID');
  }
  async function save({kind, name, mode = 'selective-only', signal} = {}) {
    scope(kind, mode);
    const before = await fixedAsset({signal});
    checkedSelective(before.body);
    const body = mode === 'selective-only' ? selectiveOnly(before.body) : before.body;
    const created = (await workspace.createPreset({scope: kind, name, body, signal})).preset;
    const after = await fixedAsset({signal});
    if (after.assetId !== before.assetId || after.sha256 !== before.sha256 ||
        after.version !== before.version || !same(after.body, before.body))
      throw Error('SELECTIVE_PRESET_SAVE_UNVERIFIED');
    const reloaded = await reload({kind, mode, id: created.id, signal});
    if (reloaded.version !== created.version || !same(reloaded.recipe, body))
      throw Error('SELECTIVE_PRESET_SAVE_UNVERIFIED');
    return reloaded;
  }
  async function reload({kind, mode = 'selective-only', id, signal} = {}) {
    scope(kind, mode); abort(signal); await selected();
    const preset = (await workspace.getPreset(id, {signal})).preset;
    await selected(); abort(signal);
    return normalized(preset, kind, mode);
  }
  async function list({kind, mode = 'selective-only', signal} = {}) {
    scope(kind, mode); abort(signal); await selected();
    const rows = (await workspace.listPresets({signal})).presets;
    await selected(); abort(signal);
    return rows.filter(item => item.scope === kind).flatMap(item => {
      try {return [normalized(item, kind, mode)];} catch {return [];}
    });
  }
  async function apply({kind, mode = 'selective-only', id, version, signal} = {}) {
    scope(kind, mode);
    const before = await fixedAsset({signal});
    const preset = await reload({kind, mode, id, signal});
    if (preset.version !== version) throw Error('SELECTIVE_PRESET_VERSION_CONFLICT');
    const expected = mode === 'selective-only' ?
      mergeSavedSelectiveColor(preset.recipe, before.body) : preset.recipe;
    const options = {presetId: id, expectedPresetVersion: version, projectId,
      assetId: before.assetId, baseVersion: before.version, signal};
    const result = mode === 'selective-only' ?
      await workspace.applySelectivePresetVersioned({...options,
        expectedOriginalSHA256: before.sha256}) :
      await workspace.applyPresetVersioned({...options,
        expectedOriginalSHA256: before.sha256});
    const after = await fixedAsset({signal});
    if (after.assetId !== before.assetId || after.sha256 !== before.sha256 ||
        after.version !== before.version + 1 || !same(after.body, expected) ||
        result.version?.version !== after.version || result.version?.branch !== false)
      throw Error('SELECTIVE_PRESET_APPLY_UNVERIFIED');
    return Object.freeze({outcome: 'saved', mode, preset, version: after.version,
      recipe: after.body, assetId: after.assetId, sha256: after.sha256});
  }
  const panel = documentRef.createElement('section');
  panel.className = 'selective-workspace-preset';
  panel.innerHTML = '<h3>Selective Color Preset · Node Workspace</h3><label>保存先<select data-selective-preset-scope><option value="PERSONAL">Personal</option><option value="WORKSPACE">Workspace</option></select></label><label>適用方式<select data-selective-preset-mode><option value="selective-only">Selective Colorのみ（他の調整を保持）</option><option value="full">Preset全体（既存調整を置換）</option></select></label><label>名前<input data-selective-preset-name maxlength="120" autocomplete="off"></label><button type="button" data-selective-preset-save>保存済み写真からPreset作成</button><button type="button" data-selective-preset-refresh>Presetを再取得</button><label>適用Preset<select data-selective-preset-list></select></label><button type="button" data-selective-preset-apply>選んだPresetを保存済み写真へ適用</button><p role="status" aria-live="polite" data-selective-preset-status>本人Workspace接続待ち</p>';
  container.replaceChildren(panel);
  const control = key => panel.querySelector(`[data-selective-preset-${key}]`);
  const kindControl = control('scope'), modeControl = control('mode');
  const name = control('name'), options = control('list'), status = control('status');
  let pending = false, items = [];
  async function action(callback) {
    if (pending || disposed) return;
    pending = true;
    for (const button of panel.querySelectorAll('button')) button.disabled = true;
    status.textContent = '確認中…';
    try {status.textContent = await callback();}
    catch (error) {status.textContent = error?.message || 'SELECTIVE_PRESET_OPERATION_FAILED';}
    finally {pending = false; if (!disposed)
      for (const button of panel.querySelectorAll('button')) button.disabled = false;}
  }
  const controller = new AbortController();
  control('save').addEventListener('click', () => void action(async () => {
    const preset = await save({kind: kindControl.value, mode: modeControl.value,
      name: name.value, signal: controller.signal});
    items = await list({kind: kindControl.value, mode: modeControl.value,
      signal: controller.signal}); renderOptions(); options.value = preset.id;
    return `保存確認済み · Preset version ${preset.version}`;
  }), {signal: controller.signal});
  control('refresh').addEventListener('click', () => void action(async () => {
    items = await list({kind: kindControl.value, mode: modeControl.value,
      signal: controller.signal}); renderOptions(); return `${items.length} 件を再取得`;
  }), {signal: controller.signal});
  control('apply').addEventListener('click', () => void action(async () => {
    const chosen = items.find(item => item.id === options.value && item.kind === kindControl.value);
    if (!chosen) throw Error('SELECTIVE_PRESET_SELECTION_REQUIRED');
    const result = await apply({kind: chosen.kind, mode: modeControl.value,
      id: chosen.id, version: chosen.version, signal: controller.signal});
    return `適用・保存確認済み · Recipe version ${result.version}`;
  }), {signal: controller.signal});
  for (const picker of [kindControl, modeControl]) picker.addEventListener('change', () => {
    items = []; renderOptions(); status.textContent = '方式を変更しました。再取得してください。';
  }, {signal: controller.signal});
  function renderOptions() {options.replaceChildren(); for (const item of items) {
    const option = documentRef.createElement('option'); option.value = item.id;
    option.textContent = `${item.name} · version ${item.version}`; options.append(option);
  }}
  return Object.freeze({save, reload, list, apply, dispose() {if (disposed) return;
    disposed = true; controller.abort(); container.replaceChildren();}});
}
