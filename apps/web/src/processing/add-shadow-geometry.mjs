import {ADD_SHADOW_MAX_PIXELS, validateAddShadowSettings} from './add-shadow.mjs';
import {ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS} from './add-shadow-manual-contract.mjs';

export const ADD_SHADOW_GEOMETRY_VERSION = 'suite-source-pixel-shadow-geometry-1';

// These are the radii used by the existing integer-control shadow renderer.
// Convert the effective radius, not the control itself: Soft includes a floor
// and cap, and Hard divides its control by four.
function radius(mode, blur) {
  if (mode === 'soft') return Math.min(96, blur * 2 + 2);
  if (mode === 'hard') return Math.floor(blur / 4);
  return blur;
}

function scaledBlur(mode, blur, scale) {
  const wanted = radius(mode, blur) * scale;
  let best = 0, distance = Infinity;
  for (let candidate = 0; candidate <= 64; candidate++) {
    const next = Math.abs(radius(mode, candidate) - wanted);
    // Equal distances prefer the smaller radius/control. Soft cannot express
    // less than 2 target pixels; this is nearest representable, not parity.
    if (next < distance) {best = candidate; distance = next;}
  }
  return best;
}

const roundOffset = value => value < 0 ? -Math.round(-value) || 0 : Math.round(value);

/**
 * Stored offset/blur controls describe source pixels. Produce transient Worker
 * controls for the existing source or 1600-long-edge proxy representation.
 * Never write these scaled controls back to the saved document or scale twice.
 * Blur uses the nominal isotropic resize factor; offsets use the rounded frame
 * dimensions on each axis. Integer rasterization prevents exact pixel parity.
 */
export function scaleAddShadowSettings(input, sourceWidth, sourceHeight, target) {
  const settings = validateAddShadowSettings(input);
  if (!Number.isSafeInteger(sourceWidth) || sourceWidth < 1 ||
      !Number.isSafeInteger(sourceHeight) || sourceHeight < 1 ||
      sourceWidth * sourceHeight > ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS ||
      target === 'source' && sourceWidth * sourceHeight > ADD_SHADOW_MAX_PIXELS ||
      !['source', 'proxy'].includes(target))
    throw Error('ADD_SHADOW_GEOMETRY_INPUT_INVALID');
  const scale = target === 'source' ? 1 :
    Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  // Includes proxies already at or below the proxy limit. Preserve even blur
  // controls that happen to map to the same effective radius in the renderer.
  if (scale === 1) return settings;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return validateAddShadowSettings({...settings,
    offsetX: roundOffset(settings.offsetX * width / sourceWidth),
    offsetY: roundOffset(settings.offsetY * height / sourceHeight),
    blur: scaledBlur(settings.mode, settings.blur, scale)});
}
