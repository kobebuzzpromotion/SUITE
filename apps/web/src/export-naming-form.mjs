import {buildExportFilename, EXPORT_NAMING_METHODS, sanitizeExportNamePart} from './export-naming.mjs';

const FORM_FIELDS = Object.freeze([
  'originalFilename', 'format', 'method', 'customName', 'customText',
  'sequence', 'total', 'captureDate', 'effectPresetName', 'exportPresetName', 'existingNames',
]);

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || (Object.getPrototypeOf(prototype) === null &&
    Object.hasOwn(prototype, 'constructor') && prototype.constructor?.name === 'Object');
}

function requiredPart(value, label) {
  try { return sanitizeExportNamePart(value); }
  catch (error) {
    if (error?.message === 'EXPORT_NAME_REQUIRED') throw Error(`EXPORT_${label}_REQUIRED`);
    throw error;
  }
}

function requiredSequence(value, label) {
  if (value === undefined || value === null || value === '' ||
      (typeof value === 'string' && !value.trim())) throw Error(`EXPORT_${label}_REQUIRED`);
  const normalized = typeof value === 'string' && /^[0-9]+$/.test(value.trim())
    ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1) throw Error('EXPORT_SEQUENCE_INVALID');
  return normalized;
}

function existingNames(value) {
  if (value === undefined) return [];
  if (value === null || typeof value === 'string' || typeof value?.[Symbol.iterator] !== 'function')
    throw Error('EXPORT_EXISTING_NAMES_INVALID');
  const names = Array.from(value);
  if (names.some(name => typeof name !== 'string')) throw Error('EXPORT_EXISTING_NAMES_INVALID');
  return names;
}

function plan(input) {
  if (!plainRecord(input) || Reflect.ownKeys(input).some(key =>
    typeof key !== 'string' || !FORM_FIELDS.includes(key))) throw Error('EXPORT_NAMING_FORM_INVALID');
  if (typeof input.originalFilename !== 'string' || !input.originalFilename.trim())
    throw Error('EXPORT_ORIGINAL_NAME_REQUIRED');
  if (typeof input.format !== 'string' || !input.format) throw Error('EXPORT_FORMAT_REQUIRED');
  if (typeof input.method !== 'string' || !input.method) throw Error('EXPORT_NAMING_METHOD_REQUIRED');
  if (!EXPORT_NAMING_METHODS.includes(input.method)) throw Error('EXPORT_NAMING_METHOD_UNSUPPORTED');

  const options = {
    originalFilename: input.originalFilename, format: input.format, method: input.method,
    existingNames: existingNames(input.existingNames),
  };
  switch (input.method) {
    case 'custom-count':
    case 'custom-sequence':
      options.customName = requiredPart(input.customName, 'CUSTOM_NAME');
      options.sequence = requiredSequence(input.sequence, 'SEQUENCE');
      options.total = requiredSequence(input.total, 'TOTAL');
      if (options.sequence > options.total) throw Error('EXPORT_SEQUENCE_INVALID');
      break;
    case 'capture-date-original':
      if (typeof input.captureDate !== 'string' || !input.captureDate.trim())
        throw Error('EXPORT_CAPTURE_DATE_REQUIRED');
      options.captureDate = input.captureDate.trim();
      break;
    case 'original-custom':
      options.customText = requiredPart(input.customText, 'CUSTOM_TEXT');
      break;
    case 'original-effect-preset':
      options.effectPresetName = requiredPart(input.effectPresetName, 'EFFECT_PRESET_NAME');
      break;
    case 'original-export-preset':
      options.exportPresetName = requiredPart(input.exportPresetName, 'EXPORT_PRESET_NAME');
      break;
    case 'original-effect-export-preset':
      options.effectPresetName = requiredPart(input.effectPresetName, 'EFFECT_PRESET_NAME');
      options.exportPresetName = requiredPart(input.exportPresetName, 'EXPORT_PRESET_NAME');
      break;
    case 'original-effect-custom':
      options.effectPresetName = requiredPart(input.effectPresetName, 'EFFECT_PRESET_NAME');
      options.customText = requiredPart(input.customText, 'CUSTOM_TEXT');
      break;
  }
  // The established planner owns date validity, filename sanitation, byte
  // limits and collisions. This adapter never invents missing metadata.
  return {options, filename: buildExportFilename(options)};
}

/** Validate form-provided values, including browser string sequence fields. */
export function normalizeExportNamingForm(input) { return plan(input).options; }

/** Build a safe filename directly from UI inputs using the existing planner. */
export function buildExportFilenameFromForm(input) { return plan(input).filename; }
