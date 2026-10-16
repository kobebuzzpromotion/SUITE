import {WorkspaceSessionClient} from './workspace-session-client.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const abort = signal => {if (signal?.aborted) throw new DOMException('Preset request cancelled', 'AbortError');};
const invalid = () => {throw Error('WORKSPACE_PRESET_RESPONSE_INVALID');};
const version = (value, zero = false) => Number.isSafeInteger(value) && value >= (zero ? 0 : 1) && value < Number.MAX_SAFE_INTEGER;
function id(value) {if (typeof value !== 'string' || !UUID.test(value)) throw Error('WORKSPACE_PRESET_ID_INVALID'); return value;}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 ||
      /[\u0000-\u001f\u007f]/u.test(value)) throw Error('WORKSPACE_PRESET_NAME_INVALID');
  return value.trim();
}
function recipe(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw Error('WORKSPACE_PRESET_RECIPE_INVALID');
  try {return JSON.parse(JSON.stringify(value));} catch {throw Error('WORKSPACE_PRESET_RECIPE_INVALID');}
}
function checkedPreset(value, workspaceId, subject) {
  if (!own(value, ['id', 'workspaceId', 'scope', 'ownerUserId', 'name', 'version',
    'body', 'createdAt', 'updatedAt', 'deletedAt']) ||
      !UUID.test(value.id) || value.workspaceId !== workspaceId ||
      !['PERSONAL', 'WORKSPACE'].includes(value.scope) ||
      typeof value.ownerUserId !== 'string' || !value.ownerUserId ||
      value.scope === 'PERSONAL' && value.ownerUserId !== subject ||
      typeof value.name !== 'string' || !value.name.trim() ||
      !version(value.version) || value.deletedAt !== null ||
      value.body === null || typeof value.body !== 'object' || Array.isArray(value.body) ||
      typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') invalid();
  return value;
}
function errorCode(value, status) {
  return typeof value?.error === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value.error)
    ? value.error : `HTTP_${status}`;
}
export class WorkspacePresetHTTPError extends Error {
  constructor(status, code) {super(code); this.name = 'WorkspacePresetHTTPError'; this.status = status; this.code = code;}
}

/**
 * Node Workspace-only adapter for createPresetFacade. The host supplies a new
 * bearer for every operation. A single ephemeral bearer is used for both the
 * fresh Session check and ensuing request, so a token-provider identity swap
 * cannot turn a gate for one subject into an action by another.
 */
export class WorkspacePresetClient {
  constructor({baseURL = globalThis.location?.origin, workspaceId, expectedSubject,
    expectedTenantId, tokenProvider, fetchImpl = globalThis.fetch} = {}) {
    const config = new WorkspaceSessionClient({baseURL, tokenProvider, fetchImpl});
    id(workspaceId);
    if (typeof expectedSubject !== 'string' || !expectedSubject ||
        typeof expectedTenantId !== 'string' || !expectedTenantId)
      throw Error('WORKSPACE_PRESET_CONFIG_INVALID');
    this.baseURL = config.baseURL;
    this.workspaceId = workspaceId;
    this.expectedSubject = expectedSubject;
    this.expectedTenantId = expectedTenantId;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    Object.freeze(this);
  }
  async #request(suffix, {method = 'GET', body, access = 'read', signal} = {}) {
    abort(signal);
    let token;
    try {token = await this.tokenProvider({signal});} catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Preset request cancelled', 'AbortError');
      throw Error('WORKSPACE_PRESET_TOKEN_UNAVAILABLE');
    }
    abort(signal);
    if (typeof token !== 'string' || !token || token.length > 8192 || /\s/u.test(token))
      throw Error('WORKSPACE_PRESET_TOKEN_INVALID');
    const gate = new WorkspaceSessionClient({baseURL: this.baseURL,
      tokenProvider: () => token, fetchImpl: this.fetchImpl});
    await gate.getFreshSession({workspaceId: this.workspaceId, expectedSubject: this.expectedSubject,
      expectedTenantId: this.expectedTenantId, access, signal});
    abort(signal);
    const url = `${this.baseURL}/v1/workspaces/${this.workspaceId}${suffix}`;
    let response;
    try {
      response = await this.fetchImpl(url, {method, signal, credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        }, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Preset request cancelled', 'AbortError');
      throw Error('WORKSPACE_PRESET_REQUEST_FAILED');
    }
    abort(signal);
    if (!response || typeof response.ok !== 'boolean' || !Number.isSafeInteger(response.status) ||
        response.redirected === true) invalid();
    let value;
    try {value = await response.json();} catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Preset request cancelled', 'AbortError');
      if (response.ok) invalid();
    }
    abort(signal);
    if (!response.ok) throw new WorkspacePresetHTTPError(response.status, errorCode(value, response.status));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
    return value;
  }
  async listPresets({signal} = {}) {
    const result = await this.#request('/presets', {signal});
    if (!own(result, ['presets']) || !Array.isArray(result.presets)) invalid();
    return {presets: result.presets.map(p => checkedPreset(p, this.workspaceId, this.expectedSubject))};
  }
  async getPreset(presetId, {signal} = {}) {
    id(presetId);
    const result = await this.#request(`/presets/${presetId}`, {signal});
    if (!own(result, ['preset'])) invalid();
    const preset = checkedPreset(result.preset, this.workspaceId, this.expectedSubject);
    if (preset.id !== presetId) invalid();
    return {preset};
  }
  async createPreset({scope, name: presetName, body, signal} = {}) {
    if (!['PERSONAL', 'WORKSPACE'].includes(scope)) throw Error('WORKSPACE_PRESET_SCOPE_INVALID');
    const request = {scope, name: name(presetName), body: recipe(body)};
    const result = await this.#request('/presets', {method: 'POST', body: request, access: 'edit', signal});
    if (!own(result, ['preset'])) invalid();
    const preset = checkedPreset(result.preset, this.workspaceId, this.expectedSubject);
    if (preset.scope !== scope || preset.name !== request.name || preset.version !== 1) invalid();
    return {preset};
  }
  async updatePreset(presetId, {baseVersion, name: presetName, body, signal} = {}) {
    id(presetId);
    if (!version(baseVersion)) throw Error('WORKSPACE_PRESET_VERSION_INVALID');
    const request = {baseVersion, name: name(presetName), body: recipe(body)};
    const result = await this.#request(`/presets/${presetId}`, {method: 'PATCH', body: request, access: 'edit', signal});
    if (!own(result, ['preset'])) invalid();
    const preset = checkedPreset(result.preset, this.workspaceId, this.expectedSubject);
    if (preset.id !== presetId || preset.version !== baseVersion + 1 || preset.name !== request.name) invalid();
    return {preset};
  }
  async deletePreset(presetId, {signal} = {}) {
    id(presetId);
    const result = await this.#request(`/presets/${presetId}`, {method: 'DELETE', access: 'edit', signal});
    if (!own(result, ['deleted', 'recipeSnapshotsRetained']) ||
        result.deleted !== true || result.recipeSnapshotsRetained !== true) invalid();
    return result;
  }
  async applyPresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion, true))
      throw Error('WORKSPACE_PRESET_VERSION_INVALID');
    if (expectedOriginalSHA256 !== undefined &&
        (typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256)))
      throw Error('WORKSPACE_PRESET_ORIGINAL_SHA_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      ...(expectedOriginalSHA256 === undefined ? {} :
        {expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()})};
    const path = `/projects/${projectId}/assets/${assetId}/preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion ||
        !version(result.version.version) ||
        (expectedOriginalSHA256 !== undefined &&
          (result.version.branch !== false || result.version.version !== baseVersion + 1))) invalid();
    return result;
  }
  /** Atomic Glow-only merge route. Unlike applyPresetVersioned, never replaces other target edits. */
  async applyGlowPresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_GLOW_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/glow-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
  /** Atomic Grain-only merge. The caller must pin the saved target and Original. */
  async applyGrainPresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_GRAIN_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/grain-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
  /** Atomic six-value Calibration-only merge; never replaces other target edits. */
  async applyCalibrationPresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_CALIBRATION_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/calibration-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
  /** Atomic four-channel RGB Levels-only merge; target Recipe and Original are pinned. */
  async applyLevelsPresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_LEVELS_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/levels-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
  /** Atomic 9-family CMYK Selective Color-only merge; never full-Replaces target edits. */
  async applySelectivePresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_SELECTIVE_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/selective-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
  /** Atomic post-crop Vignette-only merge; target Recipe and Original are pinned. */
  async applyVignettePresetVersioned({presetId, expectedPresetVersion, projectId,
    assetId, baseVersion, expectedOriginalSHA256, signal} = {}) {
    id(presetId); id(projectId); id(assetId);
    if (!version(expectedPresetVersion) || !version(baseVersion) ||
        typeof expectedOriginalSHA256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(expectedOriginalSHA256))
      throw Error('WORKSPACE_VIGNETTE_PRESET_INPUT_INVALID');
    const request = {baseVersion, presetId, expectedPresetVersion,
      expectedOriginalSHA256: expectedOriginalSHA256.toLowerCase()};
    const path = `/projects/${projectId}/assets/${assetId}/vignette-preset`;
    const result = await this.#request(path, {method: 'POST', body: request, access: 'edit', signal});
    if (result.outcome !== 'saved' || !result.version || result.version.branch !== false ||
        result.version.workspaceId !== this.workspaceId ||
        result.version.projectId !== projectId || result.version.assetId !== assetId ||
        result.version.version !== baseVersion + 1 ||
        result.version.presetSnapshot?.id !== presetId ||
        result.version.presetSnapshot?.version !== expectedPresetVersion)
      invalid();
    return result;
  }
}
