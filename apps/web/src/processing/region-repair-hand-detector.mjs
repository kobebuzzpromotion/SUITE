import {HandLandmarker, FilesetResolver} from '@mediapipe/tasks-vision';
import {assertPixels, checkAbort} from './pure.mjs';
import {applyHandsAdjustments} from './hands-adjustments.mjs';

/** Real MediaPipe IMAGE inference. Requires a licensed .task model, expected
 * SHA256 and deployed Tasks Vision WASM assets; no model is bundled/downloaded.
 * Handedness is model output, not identity, consent or authenticated ownership.
 */
export async function createHandRegionDetector({modelAssetBuffer, modelSHA256,
  wasmRoot, numHands = 2, confidence = .6} = {}, {signal} = {}) {
  checkAbort(signal);
  if (!(modelAssetBuffer instanceof Uint8Array) || !modelAssetBuffer.length ||
      modelAssetBuffer.length > 256 * 1024 * 1024 ||
      typeof modelSHA256 !== 'string' || !/^[0-9a-f]{64}$/i.test(modelSHA256) ||
      typeof wasmRoot !== 'string' || !wasmRoot.length ||
      !Number.isSafeInteger(numHands) || numHands < 1 || numHands > 8 ||
      !Number.isFinite(confidence) || confidence <= 0 || confidence > 1)
    throw Error('HAND_DETECTOR_MODEL_INVALID');
  const bytes = new Uint8Array(modelAssetBuffer);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');
  checkAbort(signal);
  if (digest !== modelSHA256.toLowerCase()) throw Error('HAND_DETECTOR_DIGEST_MISMATCH');
  const files = await FilesetResolver.forVisionTasks(wasmRoot);
  checkAbort(signal);
  const detector = await HandLandmarker.createFromOptions(files, {
    baseOptions: {modelAssetBuffer: bytes, delegate: 'CPU'}, runningMode: 'IMAGE', numHands,
    minHandDetectionConfidence: confidence, minHandPresenceConfidence: confidence,
    minTrackingConfidence: confidence});
  try {checkAbort(signal);} catch (error) {detector.close(); throw error;}
  let closed = false;
  function detect(frame, {signal} = {}) {
    checkAbort(signal); assertPixels(frame);
    if (closed) throw Error('HAND_DETECTOR_CLOSED');
    if (frame.width * frame.height > 8_000_000 || !(frame.data.buffer instanceof ArrayBuffer))
      throw Error('HAND_DETECTOR_FRAME_INVALID');
    if (typeof OffscreenCanvas === 'undefined' || typeof ImageData === 'undefined')
      throw Error('HAND_DETECTOR_CANVAS_UNAVAILABLE');
    const canvas = new OffscreenCanvas(frame.width, frame.height), context = canvas.getContext('2d');
    if (!context) throw Error('HAND_DETECTOR_CANVAS_UNAVAILABLE');
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
    const result = detector.detect(canvas);
    checkAbort(signal);
    if (!Array.isArray(result.landmarks) || result.landmarks.length > numHands)
      throw Error('HAND_DETECTOR_RESULT_INVALID');
    const hands = result.landmarks.map((points, index) => {
      if (!Array.isArray(points) || points.length !== 21 || points.some(p =>
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
        throw Error('HAND_DETECTOR_LANDMARKS_INVALID');
      const category = result.handedness?.[index]?.[0];
      if (!category || !Number.isFinite(category.score) || category.score < 0 || category.score > 1)
        throw Error('HAND_DETECTOR_HANDEDNESS_INVALID');
      return {index, landmarks: points.map(p => ({x: p.x * (frame.width - 1),
        y: p.y * (frame.height - 1), z: p.z})),
        handedness: category.categoryName, handednessScore: category.score};
    });
    return {hands, analysis: {modelSHA256: digest, source: 'mediapipe-hand-landmarker',
      coordinateSpace: 'target-pixels', authorization: 'not-attested'}};
  }
  return Object.freeze({detect,
    /** Caller retains manual hand/forearm mask + binding. Auto landmarks replace
     * only the reshape geometry; multiple hands require an explicit index. */
    apply(frame, mask, settings, context, {handIndex, signal, ...options} = {}) {
      const result = detect(frame, {signal});
      const chosen = handIndex ?? (result.hands.length === 1 ? 0 : undefined);
      if (!Number.isSafeInteger(chosen) || chosen < 0 || chosen >= result.hands.length)
        throw Error('HAND_DETECTOR_SELECTION_REQUIRED');
      const pixels = applyHandsAdjustments(frame, mask, settings, context,
        {...options, controls: undefined, landmarks: result.hands[chosen].landmarks, signal});
      return {pixels, hand: result.hands[chosen], analysis: result.analysis};
    },
    close() {if (!closed) {closed = true; detector.close();}}});
}
