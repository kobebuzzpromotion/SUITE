import {assertPixels, checkAbort} from './pure.mjs';

export const CLIPPING_MASK = Object.freeze({
  SHADOW_ANY: 1,
  HIGHLIGHT_ANY: 2,
  SHADOW_ALL: 4,
  HIGHLIGHT_ALL: 8,
});

function thresholds(shadowThreshold, highlightThreshold) {
  if (!Number.isInteger(shadowThreshold) || !Number.isInteger(highlightThreshold) ||
      shadowThreshold < 0 || highlightThreshold > 255 || shadowThreshold >= highlightThreshold) {
    throw Error('INVALID_HISTOGRAM_CLIP_THRESHOLDS');
  }
}

/**
 * Analyze the actual decoded/rendered RGBA8 pixels in one pass. This does not inspect
 * sensor RAW values or recover clipped RAW channels. Fully transparent pixels are
 * excluded; every nonzero-alpha pixel has one vote (no unpremultiplication or
 * compositing). The luma bins use Rec.709 coefficients on encoded sRGB bytes,
 * i.e. display-oriented Y', not scene-linear luminance.
 *
 * Clipping has both ANY-channel and ALL-channel counts. The former warns about an
 * individual RGB channel hitting a rail; the latter indicates an RGB triplet at
 * that rail. Neither is a claim that the original RAW has lost information.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * @param {{shadowThreshold?:number,highlightThreshold?:number,includeMask?:boolean,signal?:AbortSignal}} options
 */
export function analyzeHistogram(pixels, {
  shadowThreshold = 0,
  highlightThreshold = 255,
  includeMask = false,
  signal,
} = {}) {
  assertPixels(pixels);
  thresholds(shadowThreshold, highlightThreshold);
  if (typeof includeMask !== 'boolean') throw Error('INVALID_HISTOGRAM_MASK_OPTION');
  checkAbort(signal);

  const count = pixels.width * pixels.height;
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const mask = includeMask ? new Uint8Array(count) : undefined;
  const shadow = {red: 0, green: 0, blue: 0, anyChannel: 0, allChannels: 0};
  const highlight = {red: 0, green: 0, blue: 0, anyChannel: 0, allChannels: 0};
  let includedPixels = 0;
  let ignoredTransparentPixels = 0;
  const data = pixels.data;

  for (let index = 0; index < count; index++) {
    if ((index & 0x3fff) === 0) checkAbort(signal);
    const offset = index * 4;
    if (data[offset + 3] === 0) {
      ignoredTransparentPixels++;
      continue;
    }
    includedPixels++;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    red[r]++; green[g]++; blue[b]++;
    luma[Math.round(.2126 * r + .7152 * g + .0722 * b)]++;

    const sr = r <= shadowThreshold, sg = g <= shadowThreshold, sb = b <= shadowThreshold;
    const hr = r >= highlightThreshold, hg = g >= highlightThreshold, hb = b >= highlightThreshold;
    if (sr) shadow.red++;
    if (sg) shadow.green++;
    if (sb) shadow.blue++;
    if (hr) highlight.red++;
    if (hg) highlight.green++;
    if (hb) highlight.blue++;
    const shadowAny = sr || sg || sb, highlightAny = hr || hg || hb;
    const shadowAll = sr && sg && sb, highlightAll = hr && hg && hb;
    if (shadowAny) shadow.anyChannel++;
    if (highlightAny) highlight.anyChannel++;
    if (shadowAll) shadow.allChannels++;
    if (highlightAll) highlight.allChannels++;
    if (mask) mask[index] =
      (shadowAny ? CLIPPING_MASK.SHADOW_ANY : 0) |
      (highlightAny ? CLIPPING_MASK.HIGHLIGHT_ANY : 0) |
      (shadowAll ? CLIPPING_MASK.SHADOW_ALL : 0) |
      (highlightAll ? CLIPPING_MASK.HIGHLIGHT_ALL : 0);
  }
  checkAbort(signal);
  return {
    width: pixels.width,
    height: pixels.height,
    colorSpace: 'decoded-or-rendered-sRGB8',
    lumaBasis: 'Rec.709 encoded RGB Y-prime',
    alphaPolicy: 'ignore-alpha-zero; nonzero-alpha-one-vote',
    includedPixels,
    ignoredTransparentPixels,
    bins: {red, green, blue, luma},
    clipping: {shadowThreshold, highlightThreshold, shadow, highlight},
    ...(mask ? {mask} : {}),
  };
}
