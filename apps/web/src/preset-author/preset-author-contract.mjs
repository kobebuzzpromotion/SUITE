const TRANSITIONS = Object.freeze({
  DRAFT: new Set(["SUBMITTED", "WITHDRAWN"]),
  SUBMITTED: new Set(["CHANGES_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"]),
  CHANGES_REQUESTED: new Set(["SUBMITTED", "WITHDRAWN"]),
  APPROVED: new Set(["PUBLISHED", "ARCHIVED"]),
  PUBLISHED: new Set(["ARCHIVED"]),
  REJECTED: new Set(["ARCHIVED"]),
  WITHDRAWN: new Set(["ARCHIVED"]),
  ARCHIVED: new Set(),
});

const GLOBAL_STAGES = Object.freeze(["exposure", "contrast", "saturation"]);
const POST_DECODE_STAGE = "postDecodeAdjustments";
const ACCEPTED_INPUT_STAGES = Object.freeze([...GLOBAL_STAGES, POST_DECODE_STAGE, "rotation"]);
const POST_DECODE_ENGINE = "suite-srgb8-color-detail-1";
const TONE_FIELDS = new Set(["highlights", "shadows", "whites", "blacks", "vibrance"]);
const HSL_COLORS = new Set(["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]);
const HSL_FIELDS = new Set(["hue", "saturation", "luminance"]);
const DETAIL_FIELDS = new Set(["clarity", "texture", "sharpness"]);

function record(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function finiteInRange(value, minimum, maximum, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

/** Only the existing, actually rendered sRGB8 controls may cross the preset boundary. */
function portablePostDecode(value) {
  const adjustment = record(value, "INVALID_POST_DECODE_PRESET");
  if (adjustment.schemaVersion !== 1 || adjustment.engineVersion !== POST_DECODE_ENGINE ||
      Object.keys(adjustment).some(key => !["schemaVersion", "engineVersion", "color", "detail"].includes(key))) {
    throw new Error("INVALID_POST_DECODE_PRESET");
  }
  let controls = 0;
  const output = {schemaVersion: 1, engineVersion: POST_DECODE_ENGINE};
  if (adjustment.color !== undefined) {
    const color = record(adjustment.color, "INVALID_POST_DECODE_PRESET");
    if (Object.keys(color).some(key => !TONE_FIELDS.has(key) && key !== "hsl")) throw new Error("INVALID_POST_DECODE_PRESET");
    const copy = {};
    for (const key of TONE_FIELDS) if (Object.hasOwn(color, key)) {
      copy[key] = finiteInRange(color[key], -100, 100, "INVALID_POST_DECODE_PRESET"); controls++;
    }
    if (color.hsl !== undefined) {
      const hsl = record(color.hsl, "INVALID_POST_DECODE_PRESET");
      if (Object.keys(hsl).some(key => !HSL_COLORS.has(key))) throw new Error("INVALID_POST_DECODE_PRESET");
      const channels = {};
      for (const key of HSL_COLORS) if (Object.hasOwn(hsl, key)) {
        const fields = record(hsl[key], "INVALID_POST_DECODE_PRESET");
        if (!Object.keys(fields).length || Object.keys(fields).some(field => !HSL_FIELDS.has(field))) throw new Error("INVALID_POST_DECODE_PRESET");
        const channel = {};
        for (const field of HSL_FIELDS) if (Object.hasOwn(fields, field)) {
          channel[field] = finiteInRange(fields[field], -100, 100, "INVALID_POST_DECODE_PRESET"); controls++;
        }
        channels[key] = channel;
      }
      if (!Object.keys(channels).length) throw new Error("INVALID_POST_DECODE_PRESET");
      copy.hsl = channels;
    }
    if (!Object.keys(copy).length) throw new Error("INVALID_POST_DECODE_PRESET");
    output.color = copy;
  }
  if (adjustment.detail !== undefined) {
    const detail = record(adjustment.detail, "INVALID_POST_DECODE_PRESET");
    if (!Object.keys(detail).length || Object.keys(detail).some(key => !DETAIL_FIELDS.has(key))) throw new Error("INVALID_POST_DECODE_PRESET");
    const copy = {};
    for (const key of DETAIL_FIELDS) if (Object.hasOwn(detail, key)) {
      copy[key] = finiteInRange(detail[key], key === "sharpness" ? 0 : -100, 100, "INVALID_POST_DECODE_PRESET"); controls++;
    }
    output.detail = copy;
  }
  if (!controls) throw new Error("INVALID_POST_DECODE_PRESET");
  return output;
}

/**
 * Produces a portable Recipe-v1 body from the currently rendered global adjustments.
 * Photo-local identity, crop, portrait, export and unknown extension data are rejected,
 * never silently copied into a shared preset.
 */
export function portablePresetRecipe(recipe) {
  const envelope = record(recipe, "INVALID_RECIPE");
  if (envelope.schemaVersion !== 1 || Object.keys(envelope).some(key => !["schemaVersion", "parameters"].includes(key))) {
    throw new Error("UNSUPPORTED_RECIPE_SCHEMA");
  }
  const parameters = record(envelope.parameters, "INVALID_PARAMETERS");
  const expected = ["exposure", "contrast", "saturation", "rotationDegrees", "extendedParameters", "processingOrder"];
  if (expected.some(key => !Object.hasOwn(parameters, key)) || Object.keys(parameters).some(key => !expected.includes(key))) {
    throw new Error("INVALID_RECIPE_FIELDS");
  }
  const extensions = record(parameters.extendedParameters, "INVALID_EXTENSIONS");
  if (Object.keys(extensions).some(key => key !== POST_DECODE_STAGE)) throw new Error("PHOTO_LOCAL_OR_UNSUPPORTED_EXTENSION");
  if (parameters.rotationDegrees !== 0) throw new Error("PHOTO_LOCAL_ROTATION");
  if (!Array.isArray(parameters.processingOrder) || parameters.processingOrder.some(stage => !ACCEPTED_INPUT_STAGES.includes(stage)) ||
      new Set(parameters.processingOrder).size !== parameters.processingOrder.length) {
    throw new Error("UNSUPPORTED_PROCESSING_STAGE");
  }
  const hasPostDecode = Object.hasOwn(extensions, POST_DECODE_STAGE);
  if (hasPostDecode !== parameters.processingOrder.includes(POST_DECODE_STAGE)) throw new Error("UNSUPPORTED_PROCESSING_STAGE");
  if (hasPostDecode) {
    const index = parameters.processingOrder.indexOf(POST_DECODE_STAGE);
    if (parameters.processingOrder.some((stage, i) => (GLOBAL_STAGES.includes(stage) && i > index) || (stage === "rotation" && i < index))) {
      throw new Error("UNSUPPORTED_PROCESSING_STAGE");
    }
  }

  const exposure = finiteInRange(parameters.exposure, -4, 4, "INVALID_EXPOSURE");
  const contrast = finiteInRange(parameters.contrast, 0, 2, "INVALID_CONTRAST");
  const saturation = finiteInRange(parameters.saturation, 0, 2, "INVALID_SATURATION");
  const processingOrder = GLOBAL_STAGES.filter(stage => {
    const value = {exposure, contrast, saturation}[stage];
    const neutral = {exposure: 0, contrast: 1, saturation: 1}[stage];
    return value !== neutral;
  });
  const postDecode = hasPostDecode ? portablePostDecode(extensions.postDecodeAdjustments) : undefined;
  if (postDecode) processingOrder.push(POST_DECODE_STAGE);

  return {
    schemaVersion: 1,
    parameters: {
      exposure,
      contrast,
      saturation,
      rotationDegrees: 0,
      extendedParameters: postDecode ? {[POST_DECODE_STAGE]: postDecode} : {},
      processingOrder,
    },
  };
}

export function createSubmission({presetId, presetVersion, authorUserId, authorCreditName, recipe, now}) {
  if (typeof presetId !== "string" || !presetId.trim()) throw new Error("INVALID_PRESET_ID");
  if (!Number.isSafeInteger(presetVersion) || presetVersion < 1) throw new Error("INVALID_PRESET_VERSION");
  if (typeof authorUserId !== "string" || !authorUserId.trim()) throw new Error("INVALID_AUTHOR");
  if (typeof authorCreditName !== "string" || !authorCreditName.trim() || authorCreditName.length > 80) {
    throw new Error("INVALID_CREDIT_NAME");
  }
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) throw new Error("INVALID_TIMESTAMP");
  return Object.freeze({
    presetId,
    presetVersion,
    authorUserId,
    authorCreditName: authorCreditName.trim(),
    recipe: portablePresetRecipe(recipe),
    state: "SUBMITTED",
    submittedAt: now,
  });
}

export function transitionSubmission(submission, {to, actorUserId, actorRole, expectedPresetVersion}) {
  const current = record(submission, "INVALID_SUBMISSION");
  if (expectedPresetVersion !== current.presetVersion) throw new Error("PRESET_VERSION_CONFLICT");
  if (!TRANSITIONS[current.state]?.has(to)) throw new Error("INVALID_SUBMISSION_TRANSITION");
  const authorAction = to === "SUBMITTED" || to === "WITHDRAWN";
  if (authorAction && actorUserId !== current.authorUserId) throw new Error("FORBIDDEN_AUTHOR_ACTION");
  if (!authorAction && actorRole !== "OWNER" && actorRole !== "ADMIN") throw new Error("FORBIDDEN_REVIEW_ACTION");
  return Object.freeze({...current, state: to});
}
