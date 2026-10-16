/**
 * SUITE's limited histogram-drag mapping for existing Adjustments. This is a
 * UI calculation only: it does not alter pixels or a Recipe. One dragWidth of
 * horizontal movement spans the full control range, regardless of whether the
 * caller uses the complete histogram or the active tone region as dragWidth.
 * It is not a claim of pixel-for-pixel behavior parity with another editor.
 */
export const HISTOGRAM_TONE_REGIONS = Object.freeze({
  blacks: Object.freeze({key: 'color.blacks', min: -100, max: 100, step: 1}),
  shadows: Object.freeze({key: 'color.shadows', min: -100, max: 100, step: 1}),
  exposure: Object.freeze({key: 'exposure', min: -4, max: 4, step: 0.1}),
  highlights: Object.freeze({key: 'color.highlights', min: -100, max: 100, step: 1}),
  whites: Object.freeze({key: 'color.whites', min: -100, max: 100, step: 1}),
});

/**
 * @param {{region:string,startValue:number,deltaX:number,dragWidth:number}} input
 * @returns {{key:string,value:number}}
 */
export function calculateHistogramToneDrag({region, startValue, deltaX, dragWidth} = {}) {
  const name = typeof region === 'string' ? region.toLowerCase() : '';
  const config = Object.hasOwn(HISTOGRAM_TONE_REGIONS, name) ? HISTOGRAM_TONE_REGIONS[name] : null;
  if (!config || typeof startValue !== 'number' || !Number.isFinite(startValue) ||
      startValue < config.min || startValue > config.max ||
      typeof deltaX !== 'number' || !Number.isFinite(deltaX) ||
      typeof dragWidth !== 'number' || !Number.isFinite(dragWidth) || dragWidth <= 0) {
    throw Error('INVALID_HISTOGRAM_TONE_DRAG');
  }
  if (deltaX === 0) return {key: config.key, value: startValue};
  const fraction = Math.max(-1, Math.min(1, deltaX / dragWidth));
  const raw = Math.max(config.min, Math.min(config.max, startValue + fraction * (config.max - config.min)));
  const places = config.step === 0.1 ? 10 : 1;
  // Round half-steps symmetrically: Math.round(-0.5) otherwise becomes -0.
  const snapped = Math.sign(raw) * Math.round(Math.abs(raw) * places) / places;
  return {key: config.key, value: snapped === 0 ? 0 : snapped};
}
