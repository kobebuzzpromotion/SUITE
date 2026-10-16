import {assertPixels, checkAbort} from './pure.mjs';
import {CLIPPING_MASK} from './histogram.mjs';

// Display-only warnings over decoded/rendered sRGB8, not RAW sensor clipping.
export const CLIPPING_OVERLAY_COLORS = Object.freeze({
  shadow: Object.freeze([24, 95, 255, 160]),
  highlight: Object.freeze([255, 48, 48, 160]),
  both: Object.freeze([199, 45, 232, 192]),
});

const KNOWN_BITS = CLIPPING_MASK.SHADOW_ANY | CLIPPING_MASK.HIGHLIGHT_ANY |
  CLIPPING_MASK.SHADOW_ALL | CLIPPING_MASK.HIGHLIGHT_ALL;

/**
 * Turn analyzeHistogram(pixels, {includeMask: true}) into a transparent RGBA8
 * overlay at exactly the source dimensions. The colors encode ANY-channel
 * warnings; ALL-channel bits never hide the corresponding warning. Original
 * alpha attenuates overlay alpha so transparent source pixels stay invisible.
 * Inputs are never modified and the output owns its own buffer.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * @param {{width:number,height:number,mask:Uint8Array}} analysis
 * @param {{signal?:AbortSignal}} options
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function createClippingOverlay(pixels, analysis, {signal} = {}) {
  assertPixels(pixels);
  const count = pixels.width * pixels.height;
  if (!analysis || analysis.width !== pixels.width || analysis.height !== pixels.height ||
      !(analysis.mask instanceof Uint8Array) || analysis.mask.length !== count) {
    throw Error('INVALID_CLIPPING_OVERLAY_MASK');
  }
  checkAbort(signal);
  const output = new Uint8ClampedArray(count * 4);
  const source = pixels.data, mask = analysis.mask;
  for (let index = 0; index < count; index++) {
    if ((index & 0x3fff) === 0) checkAbort(signal);
    const bits = mask[index];
    if ((bits & ~KNOWN_BITS) ||
        ((bits & CLIPPING_MASK.SHADOW_ALL) && !(bits & CLIPPING_MASK.SHADOW_ANY)) ||
        ((bits & CLIPPING_MASK.HIGHLIGHT_ALL) && !(bits & CLIPPING_MASK.HIGHLIGHT_ANY))) {
      throw Error('INVALID_CLIPPING_OVERLAY_MASK');
    }
    const offset = index * 4;
    const sourceAlpha = source[offset + 3];
    if (!sourceAlpha || !bits) continue;
    const shadow = !!(bits & CLIPPING_MASK.SHADOW_ANY);
    const highlight = !!(bits & CLIPPING_MASK.HIGHLIGHT_ANY);
    const color = shadow && highlight ? CLIPPING_OVERLAY_COLORS.both :
      shadow ? CLIPPING_OVERLAY_COLORS.shadow : CLIPPING_OVERLAY_COLORS.highlight;
    output[offset] = color[0];
    output[offset + 1] = color[1];
    output[offset + 2] = color[2];
    output[offset + 3] = Math.round(color[3] * sourceAlpha / 255);
  }
  checkAbort(signal);
  return {width: pixels.width, height: pixels.height, data: output};
}
