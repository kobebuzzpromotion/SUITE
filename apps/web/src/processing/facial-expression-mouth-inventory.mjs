import {FaceLandmarker} from '@mediapipe/tasks-vision';
import {PERSON_MODEL_SHA256, PERSON_SDK_VERSION} from '../person-privacy.mjs';

// MediaPipe's official FACE_LANDMARKS_LIPS outer-upper path. The numbers and
// connections are verified against the installed Tasks Vision topology below;
// they are not an inferred face-oval mask or a smile/occlusion classifier.
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/vision/face_landmarker.py
const UPPER_OUTER = Object.freeze([61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]);
const UPPER_INNER_CENTER = 13;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{64}$/iu;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = code => {throw Error(`MOUTH_INVENTORY_${code}`);};
const abort = signal => {if (signal?.aborted) throw new DOMException('Mouth inventory cancelled', 'AbortError');};
const point = source => Object.freeze({x: source.x, y: source.y, z: source.z});

function officialTopology() {
  const lips = FaceLandmarker.FACE_LANDMARKS_LIPS;
  if (!Array.isArray(lips) || lips.length < 20) fail('TOPOLOGY_UNAVAILABLE');
  const edges = new Set(lips.map(edge => [Math.min(edge.start, edge.end),
    Math.max(edge.start, edge.end)].join(':')));
  for (let index = 1; index < UPPER_OUTER.length; index++) {
    const a = UPPER_OUTER[index - 1], b = UPPER_OUTER[index];
    if (!edges.has([Math.min(a, b), Math.max(a, b)].join(':'))) fail('TOPOLOGY_CHANGED');
  }
  if (!edges.has('13:82') || !edges.has('13:312')) fail('TOPOLOGY_CHANGED');
  const oval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
  if (!Array.isArray(oval) || oval.length < 20) fail('TOPOLOGY_UNAVAILABLE');
  return [...new Set(oval.flatMap(edge => [edge.start, edge.end]))];
}

function checkedAnchor(value) {
  if (!value || !['x', 'y', 'width', 'height'].every(key => finite(value[key])) ||
      value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0 ||
      value.x + value.width > 1 || value.y + value.height > 1) fail('PERSON_ANCHOR_INVALID');
  return value;
}
function intersectionOverUnion(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height / (a.width * a.height + b.width * b.height - width * height);
}

/**
 * Read-only topology candidate, never an authorization, visibility, frontal
 * pose, expression or usable mouth mask assertion. The present bundled model
 * returns no independent proof that lips are unobstructed. Product callers
 * must not treat this candidate as a verified inventory.
 */
export function inspectFacialExpressionMouthLandmarks({assetID, personID, originalSHA256,
  modelSHA256, sourceWidth, sourceHeight, frameWidth, frameHeight,
  personAnchor, faceLandmarks, signal} = {}) {
  abort(signal);
  if (typeof assetID !== 'string' || !UUID.test(assetID) ||
      typeof personID !== 'string' || !UUID.test(personID) ||
      typeof originalSHA256 !== 'string' || !SHA.test(originalSHA256)) fail('BINDING_INVALID');
  if (modelSHA256 !== PERSON_MODEL_SHA256) fail('MODEL_SHA_MISMATCH');
  if (![sourceWidth, sourceHeight, frameWidth, frameHeight].every(Number.isSafeInteger) ||
      sourceWidth < 1 || sourceHeight < 1 || sourceWidth * sourceHeight > 24_000_000 ||
      frameWidth !== sourceWidth || frameHeight !== sourceHeight) fail('FULL_FRAME_REQUIRED');
  const person = checkedAnchor(personAnchor);
  if (!Array.isArray(faceLandmarks) || faceLandmarks.length !== 1) fail('SINGLE_FACE_REQUIRED');
  const landmarks = faceLandmarks[0];
  if (!Array.isArray(landmarks) || landmarks.length < 468 || landmarks.length > 478 ||
      Array.from(landmarks).some(item => !item || !finite(item.x) || !finite(item.y) || !finite(item.z) ||
        item.x <= 0 || item.y <= 0 || item.x >= 1 || item.y >= 1)) fail('LANDMARKS_INVALID');
  const oval = officialTopology();
  if (oval.some(index => index >= landmarks.length)) fail('TOPOLOGY_CHANGED');
  const left = Math.min(...oval.map(index => landmarks[index].x));
  const right = Math.max(...oval.map(index => landmarks[index].x));
  const top = Math.min(...oval.map(index => landmarks[index].y));
  const bottom = Math.max(...oval.map(index => landmarks[index].y));
  const anchor = {x: left, y: 1 - bottom, width: right - left, height: bottom - top};
  if (anchor.width < .01 || anchor.height < .01 ||
      intersectionOverUnion(anchor, person) < .8) fail('PERSON_MATCH_AMBIGUOUS');
  const upper = UPPER_OUTER.map(index => landmarks[index]);
  const corner61 = upper[0], corner291 = upper.at(-1), outerCenter = landmarks[0];
  const innerCenter = landmarks[UPPER_INNER_CENTER];
  const width = corner291.x - corner61.x;
  if (width < .015 || width > anchor.width * .85 ||
      outerCenter.x <= corner61.x || outerCenter.x >= corner291.x ||
      innerCenter.x <= corner61.x || innerCenter.x >= corner291.x ||
      outerCenter.y >= innerCenter.y ||
      upper.some(p => p.x < anchor.x || p.x > anchor.x + anchor.width ||
        p.y < top || p.y > bottom)) fail('MOUTH_GEOMETRY_AMBIGUOUS');
  abort(signal);
  return Object.freeze({status: 'TOPOLOGY_ONLY_POSE_OCCLUSION_UNVERIFIED',
    binding: Object.freeze({assetID, personID, originalSHA256: originalSHA256.toLowerCase(),
      modelSHA256, sourceWidth, sourceHeight, frameWidth, frameHeight}),
    provenance: Object.freeze({sdk: PERSON_SDK_VERSION,
      topology: 'FaceLandmarker.FACE_LANDMARKS_LIPS; outer upper 61..291; inner center 13',
      orientationRequirement: 'upright-unmirrored-upper-left-not-verified', faceCount: 1}),
    corner61: point(corner61), corner291: point(corner291),
    upperOuter: Object.freeze(upper.map(point)), upperInnerCenter: point(innerCenter)});
}

/** No current verifier can prove frontal pose and unoccluded mouth. */
export function requireVerifiedFacialExpressionMouthInventory(candidate) {
  if (candidate?.status !== 'TOPOLOGY_ONLY_POSE_OCCLUSION_UNVERIFIED') fail('CANDIDATE_INVALID');
  fail('POSE_OCCLUSION_PROOF_UNAVAILABLE');
}
