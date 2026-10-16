import {assertPixels, checkAbort} from './pure.mjs';
import {LEVELS_CHANNELS, validateLevels} from './levels.mjs';

export const LEVELS_SAMPLE_VERSION = 'suite-srgb8-levels-endpoint-sample-1';

/**
 * Pure black/white eyedropper calculation over the displayed straight-alpha
 * RGBA8 frame. x/y are normalized image coordinates in [0, 1]; the right and
 * bottom edges belong to the final pixel. Nonzero alpha is sampled as stored,
 * without compositing or recovering RAW scene data. For the shared/master
 * channel, Rec.709 coefficients on encoded sRGB bytes produce one Y' code;
 * individual channels use their own byte. This is a SUITE sampling definition,
 * not a claim of pixel-for-pixel compatibility with another editor.
 *
 * Return a setAdjustment-compatible key/value only. The caller owns the actual
 * Recipe edit and must rerender from its unedited base instead of resampling a
 * compounded frame.
 */
export function sampleLevelsEndpoint(pixels, options = {}) {
  assertPixels(pixels);
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Reflect.ownKeys(options).some(key => typeof key !== 'string' ||
        !['x', 'y', 'channel', 'endpoint', 'levels', 'signal'].includes(key)))
    throw Error('LEVELS_SAMPLE_OPTIONS_INVALID');
  const {x, y, channel = 'master', endpoint, levels = {}, signal} = options;
  checkAbort(signal);
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1 ||
      typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1)
    throw Error('LEVELS_SAMPLE_COORDINATE_INVALID');
  if (!LEVELS_CHANNELS.includes(channel)) throw Error('LEVELS_SAMPLE_CHANNEL_INVALID');
  if (endpoint !== 'black' && endpoint !== 'white') throw Error('LEVELS_SAMPLE_ENDPOINT_INVALID');
  const normalized = validateLevels(levels);
  const pixelX = Math.min(pixels.width - 1, Math.floor(x * pixels.width));
  const pixelY = Math.min(pixels.height - 1, Math.floor(y * pixels.height));
  const offset = (pixelY * pixels.width + pixelX) * 4;
  const data = pixels.data;
  if (data[offset + 3] === 0) throw Error('LEVELS_SAMPLE_TRANSPARENT');
  const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
  const value = channel === 'master'
    ? Math.round(.2126 * red + .7152 * green + .0722 * blue)
    : {red, green, blue}[channel];
  const current = normalized[channel];
  if (endpoint === 'black' ? value >= current.inputWhite : value <= current.inputBlack)
    throw Error('LEVELS_ENDPOINT_ORDER');
  checkAbort(signal);
  return Object.freeze({key: `levels.${channel}.${endpoint === 'black' ? 'inputBlack' : 'inputWhite'}`,
    value, pixel: Object.freeze({x: pixelX, y: pixelY}),
    sample: Object.freeze({red, green, blue, alpha: data[offset + 3]})});
}
