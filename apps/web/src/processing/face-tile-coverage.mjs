import {checkAbort, intersectionOverUnion, validateDetections, MAX_FACES} from './pure.mjs';

const TRANSFORMS = Object.freeze(['normal', 'mirror', 'cw90', 'ccw90']);
function invalid() { throw Error('INVALID_FACE_COVERAGE_PASS'); }
function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > 100_000_000) invalid();
}
function checkPass(pass, width, height) {
  if (!pass || !TRANSFORMS.includes(pass.transform) || !pass.tile) invalid();
  const {x, y, width: w, height: h} = pass.tile;
  if (![x, y, w, h].every(Number.isSafeInteger) || x < 0 || y < 0 || w < 1 || h < 1 ||
      x + w > width || y + h > height) invalid();
}
// Match faces.mjs's fixed 8-tile plan without importing its model/LibRaw graph.
function faceTilePlan(width, height) {
  if (width < 640 || height < 640) return [];
  const tileWidth = Math.min(width, Math.max(512, Math.round(width * .34)));
  const tileHeight = Math.min(height, Math.max(512, Math.round(height * .62)));
  const maxX = width - tileWidth, maxY = height - tileHeight;
  const xs = [0, Math.round(maxX / 3), Math.round(maxX * 2 / 3), maxX];
  const ys = [0, maxY];
  return ys.flatMap(y => xs.map(x => ({x, y, width: tileWidth, height: tileHeight})))
    .filter((tile, index, all) => all.findIndex(other => other.x === tile.x && other.y === tile.y) === index);
}
function detectionFromLandmarks(points, indices) {
  if (!Array.isArray(points) || points.length < 468 || points.some(p => !Number.isFinite(p?.x) ||
      !Number.isFinite(p?.y) || !Number.isFinite(p?.z) || p.x <= 0 || p.y <= 0 ||
      p.x >= 1 || p.y >= 1)) throw Error('PARTIAL_OR_INVALID_FACE');
  const mask = indices.map(index => ({x: points[index]?.x, y: points[index]?.y}));
  if (mask.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error('PARTIAL_OR_INVALID_FACE');
  const x = Math.min(...mask.map(p => p.x)), top = Math.min(...mask.map(p => p.y));
  const right = Math.max(...mask.map(p => p.x)), bottom = Math.max(...mask.map(p => p.y));
  if (x <= .005 || top <= .005 || right >= .995 || bottom >= .995 ||
      right - x < .01 || bottom - top < .01) throw Error('PARTIAL_OR_TOO_SMALL_FACE');
  const detection = {anchor: {x, y: 1 - bottom, width: right - x,
    height: bottom - top}, mask, complete: true};
  validateDetections([detection]);
  return detection;
}

/** Bounded analysis-copy passes. Never modifies Original, Proxy, or Recipe. */
export function faceCoveragePasses(width, height, transforms = TRANSFORMS) {
  dimensions(width, height);
  if (!Array.isArray(transforms) || transforms.length < 1 || transforms.length > 4 ||
      transforms.some(t => !TRANSFORMS.includes(t)) || new Set(transforms).size !== transforms.length) invalid();
  const tiles = faceTilePlan(width, height);
  return Object.freeze(tiles.flatMap(tile => transforms.map(transform =>
    Object.freeze({tile: Object.freeze({...tile}), transform}))));
}

// Inverse of drawImage/Canvas transforms. Image coordinates are top-left.
export function projectCoveragePoint(point, pass, width, height) {
  dimensions(width, height); checkPass(pass, width, height);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x <= 0 || point.x >= 1 || point.y <= 0 || point.y >= 1) invalid();
  let x = point.x, y = point.y;
  if (pass.transform === 'mirror') x = 1 - x;
  if (pass.transform === 'cw90') { x = point.y; y = 1 - point.x; }
  if (pass.transform === 'ccw90') { x = 1 - point.y; y = point.x; }
  return Object.freeze({x: (pass.tile.x + x * pass.tile.width) / width,
    y: (pass.tile.y + y * pass.tile.height) / height});
}

export function projectCoverageDetection(detection, pass, width, height) {
  if (!detection?.complete || !Array.isArray(detection.mask)) invalid();
  const mask = detection.mask.map(point => projectCoveragePoint(point, pass, width, height));
  const left = Math.min(...mask.map(p => p.x)), right = Math.max(...mask.map(p => p.x));
  const top = Math.min(...mask.map(p => p.y)), bottom = Math.max(...mask.map(p => p.y));
  const projected = {anchor: {x: left, y: 1 - bottom, width: right - left,
    height: bottom - top}, mask, complete: true};
  validateDetections([projected]);
  return projected;
}

function tileCanvas(source, pass) {
  const scale = Math.min(1, 1024 / Math.max(pass.tile.width, pass.tile.height));
  const w = Math.max(1, Math.round(pass.tile.width * scale));
  const h = Math.max(1, Math.round(pass.tile.height * scale));
  const rotated = pass.transform === 'cw90' || pass.transform === 'ccw90';
  const canvas = new OffscreenCanvas(rotated ? h : w, rotated ? w : h);
  const context = canvas.getContext('2d', {colorSpace: 'srgb'});
  if (!context) throw Error('WORKER_CANVAS_UNAVAILABLE');
  if (pass.transform === 'mirror') { context.translate(w, 0); context.scale(-1, 1); }
  if (pass.transform === 'cw90') { context.translate(h, 0); context.rotate(Math.PI / 2); }
  if (pass.transform === 'ccw90') { context.translate(0, w); context.rotate(-Math.PI / 2); }
  const t = pass.tile;
  context.drawImage(source, t.x, t.y, t.width, t.height, 0, 0, w, h);
  return canvas;
}

/** Returns model candidates, not verified people or stable identities. */
export function probeFaceCoverage(detector, source, passes, indices, {signal} = {}) {
  if (typeof detector?.detect !== 'function' || !source || !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height) || !Array.isArray(passes) || passes.length > 32 ||
      !Array.isArray(indices) || indices.length < 3) invalid();
  dimensions(source.width, source.height);
  const candidates = [], rejected = [];
  for (const pass of passes) {
    checkAbort(signal); checkPass(pass, source.width, source.height);
    const result = detector.detect(tileCanvas(source, pass)); checkAbort(signal);
    if (!Array.isArray(result?.faceLandmarks) || result.faceLandmarks.length >= MAX_FACES)
      throw Error('FACE_COVERAGE_MODEL_RESULT_INVALID');
    for (const points of result.faceLandmarks) {
      try {
        const detection = detectionFromLandmarks(points, indices);
        candidates.push({detection: projectCoverageDetection(detection, pass, source.width, source.height),
          pass});
      } catch (error) {
        if (!['PARTIAL_OR_INVALID_FACE', 'PARTIAL_OR_TOO_SMALL_FACE', 'INVALID_DETECTION_ANCHOR',
          'INVALID_FACE_POLYGON', 'POLYGON_OUTSIDE_FACE', 'DEGENERATE_FACE_POLYGON',
          'SELF_INTERSECTING_FACE_POLYGON'].includes(error.message)) throw error;
        rejected.push({transform: pass.transform, reason: error.message});
      }
    }
  }
  return {candidates, rejected};
}

/** Preserve baseline first. Close, non-identical overlaps fail instead of inventing an ID. */
export function reconcileFaceCoverage(baseline, candidates) {
  if (!Array.isArray(baseline) || !Array.isArray(candidates)) invalid();
  if (baseline.length) validateDetections(baseline);
  const accepted = [...baseline], added = [];
  for (const candidate of candidates) {
    const detection = candidate?.detection;
    validateDetections([detection]);
    let duplicate = false;
    for (const existing of accepted) {
      const overlap = intersectionOverUnion(existing.anchor, detection.anchor);
      if (overlap >= .7) duplicate = true;
      else if (overlap > 0) throw Error('AMBIGUOUS_FACE_COVERAGE_OVERLAP');
    }
    if (!duplicate) {
      accepted.push(detection);
      added.push({detection, pass: candidate.pass, status: 'MODEL_CANDIDATE_MANUAL_REVIEW_REQUIRED'});
    }
    if (accepted.length >= MAX_FACES) throw Error('FACE_COVERAGE_SATURATED_INVENTORY');
  }
  validateDetections(accepted);
  return {detections: accepted, added};
}
