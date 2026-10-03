// Synthetic numerical/state fixtures only. Never RAW, real photographs or detector-quality evidence.
export const ASSET_A = '11111111-1111-4111-8111-111111111111';
export const ASSET_B = '22222222-2222-4222-8222-222222222222';
export const PERSON_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const PERSON_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SHA = 'a'.repeat(64);
export const WHEN = '2026-10-03T01:00:00.000Z';
export function syntheticPixels(width = 100, height = 100, value = 64) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255; }
  return {width, height, data};
}
export function detection(x = 0.1) {
  return {anchor: {x, y: 0.2, width: 0.2, height: 0.3}, complete: true,
    mask: [{x, y: 0.5}, {x: x + 0.2, y: 0.5}, {x: x + 0.2, y: 0.8}, {x, y: 0.8}]};
}
export function portrait(assetID = ASSET_A, firstValue = 1, secondValue = 0) {
  return {schemaVersion: 1, engineVersion: 'web-libraw-mediapipe-face-exposure-1', assetID,
    originalSHA256: SHA, createdAt: WHEN, updatedAt: WHEN,
    targets: [{id: PERSON_A, anchor: detection().anchor, adjustmentType: 'face_brightness', value: firstValue},
      {id: PERSON_B, anchor: detection(0.6).anchor, adjustmentType: 'face_brightness', value: secondValue}]};
}
export function recipe(portraitValue = null) {
  return {schemaVersion: 1, parameters: {exposure: 0, contrast: 1, saturation: 1, rotationDegrees: 0,
    extendedParameters: portraitValue ? {portrait: portraitValue} : {}, processingOrder: ['exposure', 'contrast', 'saturation', 'rotation']}};
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {resolve = a; reject = b;});
  return {promise, resolve, reject};
}
