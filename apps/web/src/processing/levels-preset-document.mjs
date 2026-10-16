import {validateLevels} from './levels.mjs';

// Portable processing payload only. This does NOT publish Community content,
// bypass the existing facade, change a store, or establish permission to apply.
// All four scopes share exactly the same global Levels arithmetic payload.
export const LEVELS_PRESET_SCOPES = Object.freeze(['PERSONAL', 'WORKSPACE', 'AUTHOR', 'COMMUNITY']);
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 200;
export function createLevelsPresetDocument({id, name, scope, version = 1, levels}) {
  if (!text(id) || !text(name) || !LEVELS_PRESET_SCOPES.includes(scope) ||
      !Number.isSafeInteger(version) || version < 1) throw Error('LEVELS_PRESET_METADATA');
  return {format: 'suite-global-levels-preset', formatVersion: 1,
    id, name, scope, version, levels: validateLevels(levels)};
}
export function validateLevelsPresetDocument(value) {
  const keys = ['format', 'formatVersion', 'id', 'name', 'scope', 'version', 'levels'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k)) ||
      value.format !== 'suite-global-levels-preset' || value.formatVersion !== 1)
    throw Error('LEVELS_PRESET_DOCUMENT');
  return createLevelsPresetDocument(value);
}
export function encodeLevelsPresetDocument(value) {
  return JSON.stringify(validateLevelsPresetDocument(value));
}
export function decodeLevelsPresetDocument(json) {
  if (typeof json !== 'string' || json.length > 8192) throw Error('LEVELS_PRESET_DOCUMENT_SIZE');
  return validateLevelsPresetDocument(JSON.parse(json));
}
/** Replaces global Levels only; photo-specific Local masks and all unrelated
 * Recipe fields remain detached copies. Store/host handles scope permissions. */
export function mergeLevelsPresetDocument(recipe, document, {expectedVersion} = {}) {
  const preset = validateLevelsPresetDocument(document);
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(recipe))) throw Error('LEVELS_PRESET_RECIPE');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== preset.version)
    throw Error('LEVELS_PRESET_VERSION_CONFLICT');
  return {...structuredClone(recipe), levels: validateLevels(preset.levels)};
}
