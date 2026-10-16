// A deployment approval is a review record, not a generic feature flag. Keep the
// exact SDK/model binding here so a later asset update fails closed.
export const PERSON_PRIVACY_BLOCKED = 'PRIVACY_REVIEW_REQUIRED';
export const PERSON_PRIVACY_APPROVED = 'PRODUCTION_PERSON_APPROVED';
export const PERSON_MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
export const PERSON_SDK_VERSION = '@mediapipe/tasks-vision@1.0.1';

export function personProcessingStatus(env = {}) {
  return env.SUITE_PERSON_PRIVACY_DECISION === 'APPROVED' &&
    env.SUITE_PERSON_PRIVACY_SDK === PERSON_SDK_VERSION &&
    env.SUITE_PERSON_PRIVACY_MODEL_SHA256 === PERSON_MODEL_SHA256 &&
    typeof env.SUITE_PERSON_PRIVACY_EVIDENCE_SHA256 === 'string' &&
    /^[a-f0-9]{64}$/.test(env.SUITE_PERSON_PRIVACY_EVIDENCE_SHA256)
    ? PERSON_PRIVACY_APPROVED : PERSON_PRIVACY_BLOCKED;
}
