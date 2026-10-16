import {assertPixels, checkAbort} from './pure.mjs';
import {analyzeHistogram} from './histogram.mjs';
import {LEVELS_CHANNELS} from './levels.mjs';

function channelName(channel) {
  if (!LEVELS_CHANNELS.includes(channel)) throw Error('LEVELS_HISTOGRAM_CHANNEL_INVALID');
  return channel;
}

function samplePoint(pixels, point, signal) {
  if (point === undefined || point === null) return null;
  if (!point || typeof point !== 'object' || Array.isArray(point) ||
      Reflect.ownKeys(point).some(key => typeof key !== 'string' || !['x', 'y'].includes(key)) ||
      !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) ||
      point.x < 0 || point.x >= pixels.width || point.y < 0 || point.y >= pixels.height)
    throw Error('LEVELS_HISTOGRAM_SAMPLE_INVALID');
  checkAbort(signal);
  const offset = (point.y * pixels.width + point.x) * 4;
  const [red, green, blue, alpha] = pixels.data.subarray(offset, offset + 4);
  return Object.freeze({x: point.x, y: point.y, red, green, blue, alpha,
    included: alpha !== 0});
}

/**
 * One preview-frame histogram for RGB Levels. Existing analyzeHistogram owns
 * the RGBA8 scan and transparency policy. Master combines the three RGB bins
 * because Levels Master remaps each RGB channel; it is not luma or a RAW sensor
 * clipping/recovery indicator. Count total is 3 per visible pixel for Master,
 * 1 per visible pixel for an individual color channel.
 */
export function analyzeLevelsHistogram(pixels, {sample, signal, precomputed} = {}) {
  assertPixels(pixels); checkAbort(signal);
  if (precomputed && (precomputed.width !== pixels.width || precomputed.height !== pixels.height ||
      !Number.isSafeInteger(precomputed.includedPixels) || precomputed.includedPixels < 0 ||
      precomputed.includedPixels > pixels.width * pixels.height ||
      !['red', 'green', 'blue'].every(channel =>
        precomputed.bins?.[channel] instanceof Uint32Array && precomputed.bins[channel].length === 256)))
    throw Error('LEVELS_HISTOGRAM_PRECOMPUTED_INVALID');
  const analysis = precomputed || analyzeHistogram(pixels, {signal});
  const master = new Uint32Array(256);
  for (let code = 0; code < 256; code++) {
    if ((code & 63) === 0) checkAbort(signal);
    master[code] = analysis.bins.red[code] + analysis.bins.green[code] + analysis.bins.blue[code];
  }
  const sampled = samplePoint(pixels, sample, signal);
  checkAbort(signal);
  return {
    width: pixels.width, height: pixels.height,
    colorSpace: analysis.colorSpace,
    alphaPolicy: analysis.alphaPolicy,
    masterBasis: 'sum-of-RGB-channel-counts-not-luma',
    includedPixels: analysis.includedPixels,
    ignoredTransparentPixels: analysis.ignoredTransparentPixels,
    bins: {master, red: analysis.bins.red, green: analysis.bins.green, blue: analysis.bins.blue},
    sample: sampled,
  };
}

/** Select display bins without another pixel scan; a transparent sample has no value. */
export function selectLevelsHistogramChannel(histogram, channel = 'master') {
  channelName(channel);
  if (!histogram || !histogram.bins ||
      !['master', 'red', 'green', 'blue'].every(name =>
        histogram.bins[name] instanceof Uint32Array && histogram.bins[name].length === 256) ||
      !Number.isSafeInteger(histogram.includedPixels) || histogram.includedPixels < 0)
    throw Error('LEVELS_HISTOGRAM_INVALID');
  const bins = histogram.bins[channel];
  const peakCount = bins.reduce((peak, count) => Math.max(peak, count), 0);
  const sample = histogram.sample;
  const selectedSample = sample?.included
    ? channel === 'master' ? {red: sample.red, green: sample.green, blue: sample.blue}
      : sample[channel]
    : null;
  return {channel, bins, peakCount, countBasis: channel === 'master' ? 'RGB-channel-votes' : 'pixels',
    includedPixels: histogram.includedPixels, selectedSample};
}
