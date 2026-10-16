import {assertPixels, checkAbort, srgbToLinear, linearToSrgb} from './pure.mjs';

const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** SUITE calibration format, NOT an Adobe/Lensfun file parser. Coefficients map
 * undistorted output to distorted input; radius unit = half the shorter image side.
 * Calibration geometry is upright and uncropped. A manual correction profile uses
 * the same explicit convention. Host supplies licensed/calibrated profiles. */
export function validateLensProfile(input) {
  const p = structuredClone(input);
  if (!p || p.schemaVersion !== 1 || p.coordinateSpace !== 'upright-uncropped' ||
      p.mapping !== 'output-to-input' || !identity(p.id) || !identity(p.camera) || !identity(p.lens) ||
      !finite(p.focalLength, 1, 3000) || !finite(p.aperture, .5, 128) ||
      !finite(p.aspectRatio, .1, 10) || !Array.isArray(p.center) || p.center.length !== 2 ||
      !p.center.every(v => finite(v, 0, 1))) throw Error('LENS_PROFILE_INVALID');
  for (const [key, length, limit] of [['radial', 3, 4], ['tangential', 2, 1], ['vignette', 3, 8]]) {
    if (!Array.isArray(p[key]) || p[key].length !== length || !p[key].every(v => finite(v, -limit, limit)))
      throw Error('LENS_PROFILE_COEFFICIENTS_INVALID');
  }
  if (!Array.isArray(p.channelScale) || p.channelScale.length !== 3 ||
      !p.channelScale.every(v => finite(v, .8, 1.2))) throw Error('LENS_PROFILE_CHANNEL_SCALE_INVALID');
  return p;
}

/** Exact metadata matching only. Ambiguous/missing profiles never silently fall back. */
export function selectLensProfile(profiles, metadata, {profileId} = {}) {
  if (!Array.isArray(profiles) || profiles.length > 10000) throw Error('LENS_PROFILE_LIBRARY_INVALID');
  const candidates = profiles.map(validateLensProfile).filter(p => profileId !== undefined
    ? p.id === profileId : p.camera === metadata?.camera && p.lens === metadata?.lens &&
      Math.abs(p.focalLength - metadata?.focalLength) < .01 && Math.abs(p.aperture - metadata?.aperture) < .01);
  if (candidates.length !== 1) throw Error(candidates.length ? 'LENS_PROFILE_AMBIGUOUS' : 'LENS_PROFILE_NOT_FOUND');
  return {profile: candidates[0], selection: profileId === undefined ? 'exact-metadata' : 'explicit-profile'};
}

// Largest all-valid rectangle via histogram/monotone stack, O(width*height).
// Returned rectangle is the pixel domain, not an automatic change to saved Crop.
export function largestLensValidCrop(valid, width, height, {signal} = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > 24_000_000 || !(valid instanceof Uint8Array) || valid.length !== width * height)
    throw Error('LENS_VALIDITY_INVALID');
  const heights = new Uint32Array(width), stack = new Int32Array(width + 1);
  let best = {x: 0, y: 0, width: 0, height: 0}, area = 0;
  for (let y = 0; y < height; y++) {
    checkAbort(signal);
    for (let x = 0; x < width; x++) heights[x] = valid[y * width + x] ? heights[x] + 1 : 0;
    let top = -1;
    for (let x = 0; x <= width; x++) {
      const h = x === width ? 0 : heights[x];
      while (top >= 0 && heights[stack[top]] > h) {
        const bar = stack[top--], start = top < 0 ? 0 : stack[top] + 1, w = x - start;
        if (w * heights[bar] > area) { area = w * heights[bar]; best = {x: start, y: y + 1 - heights[bar], width: w, height: heights[bar]}; }
      }
      if (x < width) stack[++top] = x;
    }
  }
  return area ? {...best, normalized: {x: best.x / width, y: best.y / height,
    width: best.width / width, height: best.height / height}} : null;
}

/** Shared pixel-center polynomial used by both rendering and brush mapping.
 * Caller validates profile/settings. Returns RGB donor coordinates. */
export function lensSampleCoordinates(p,width,height,x,y,distortion,chromatic){
  if(distortion===0&&chromatic===0)return [[x,y],[x,y],[x,y]];
  const radius=Math.min(width,height)/2,cx=p.center[0]*width-.5,cy=p.center[1]*height-.5;
  const nx=(x-cx)/radius,ny=(y-cy)/radius,r2=nx*nx+ny*ny;
  const [k1,k2,k3]=p.radial,[t1,t2]=p.tangential;
  const factor=1+distortion*(k1*r2+k2*r2*r2+k3*r2*r2*r2);
  const mx=nx*factor+distortion*(2*t1*nx*ny+t2*(r2+2*nx*nx));
  const my=ny*factor+distortion*(t1*(r2+2*ny*ny)+2*t2*nx*ny);
  return p.channelScale.map(scale=>{const s=1+chromatic*(scale-1);return [cx+mx*radius*s,cy+my*radius*s];});
}

function sample(frame, x, y, channel) {
  const a = Math.floor(x), b = Math.floor(y), u = x - a, v = y - b;
  let value = 0, coverage = 0;
  for (const [xx, yy, w] of [[a, b, (1-u)*(1-v)], [Math.min(a+1, frame.width-1), b, u*(1-v)],
    [a, Math.min(b+1, frame.height-1), (1-u)*v], [Math.min(a+1, frame.width-1), Math.min(b+1, frame.height-1), u*v]]) {
    const at = (yy * frame.width + xx) * 4, weight = w * frame.data[at+3] / 255;
    coverage += weight; value += srgbToLinear(frame.data[at+channel] / 255) * weight;
  }
  return {value: coverage ? value / coverage : 0, coverage};
}

export function applyLensCorrection(frame, input, {distortion = 1, chromatic = 1, shading = 1,
  maximumGain = 8, constrainCrop = false, signal} = {}) {
  assertPixels(frame); checkAbort(signal);
  const p = validateLensProfile(input);
  if (![distortion, chromatic, shading].every(v => finite(v, 0, 1)) || !finite(maximumGain, 1, 16) ||
      typeof constrainCrop !== 'boolean' || Math.abs(frame.width / frame.height / p.aspectRatio - 1) > .002)
    throw Error('LENS_FRAME_OR_SETTINGS_INVALID');
  const radius = Math.min(frame.width, frame.height) / 2, cx = p.center[0] * frame.width - .5,
    cy = p.center[1] * frame.height - .5, data = new Uint8ClampedArray(frame.data.length), valid = new Uint8Array(frame.width * frame.height);
  let clippedSamples = 0;
  for (let y = 0; y < frame.height; y++) {
    checkAbort(signal);
    for (let x = 0; x < frame.width; x++) {
      const nx = (x-cx)/radius, ny = (y-cy)/radius, r2 = nx*nx+ny*ny;
      const [k1,k2,k3] = p.radial, [t1,t2] = p.tangential;
      // Reject folded calibration, not a hidden mirror or extreme crop.
      if (1 + distortion*(3*k1*r2+5*k2*r2*r2+7*k3*r2*r2*r2) <= 0)
        throw Error('LENS_NON_MONOTONIC_PROFILE');
      const transmission = 1 + p.vignette[0]*r2 + p.vignette[1]*r2*r2 + p.vignette[2]*r2*r2*r2;
      if (shading && (!Number.isFinite(transmission) || transmission <= 0)) throw Error('LENS_SHADING_PROFILE_INVALID');
      const gain = shading ? 1 + shading*(1/transmission-1) : 1;
      if (!Number.isFinite(gain) || gain <= 0 || gain > maximumGain) throw Error('LENS_SHADING_GAIN_LIMIT');
      const coordinates = lensSampleCoordinates(p,frame.width,frame.height,x,y,distortion,chromatic);
      if (coordinates.some(([xx,yy]) => !Number.isFinite(xx) || !Number.isFinite(yy) || xx < 0 || yy < 0 || xx > frame.width-1 || yy > frame.height-1)) continue;
      const rgb = coordinates.map(([xx,yy], c) => sample(frame,xx,yy,c)), at = (y*frame.width+x)*4;
      const alpha = Math.min(...rgb.map(c => c.coverage));
      data[at+3] = Math.round(alpha*255); valid[y*frame.width+x] = alpha > 0 ? 255 : 0;
      for (let c = 0; c < 3; c++) { const value = rgb[c].value*gain; if (value > 1) clippedSamples++;
        data[at+c] = alpha ? Math.round(clamp(linearToSrgb(clamp(value,0,1)),0,1)*255) : 0; }
    }
  }
  const crop = largestLensValidCrop(valid,frame.width,frame.height,{signal});
  if (constrainCrop && !crop) throw Error('LENS_NO_VALID_CROP');
  let output = {width: frame.width, height: frame.height, data};
  if (constrainCrop) {
    const cropped = new Uint8ClampedArray(crop.width*crop.height*4);
    for (let y = 0; y < crop.height; y++) {checkAbort(signal); cropped.set(data.subarray(((y+crop.y)*frame.width+crop.x)*4,
      ((y+crop.y)*frame.width+crop.x+crop.width)*4), y*crop.width*4);}
    output = {width: crop.width, height: crop.height, data: cropped};
  }
  return {frame: output, validCrop: crop, provenance: {profileId: p.id, algorithm: 'suite-radial-tangential-rgb-1',
    clippedSamples, originalUnchanged: true, inputRequired: 'upright-uncropped-srgb8', cropped: constrainCrop}};
}
