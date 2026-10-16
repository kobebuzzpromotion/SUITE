/**
 * Position of a left-to-right Levels midpoint control, independent of Recipe.
 * This is SUITE's UI scale, not a claim about another editor's numeric scale.
 * The existing Recipe gamma is intentionally unchanged: gamma > 1 brightens.
 * Log spacing places neutral gamma 1 at the visual center and makes moving the
 * handle right darken the image. Do not round before storing a Recipe value.
 */
export const LEVELS_MIDPOINT_POSITION = Object.freeze({minimum: 0, neutral: 50, maximum: 100});

function finiteRange(value, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    throw Error('LEVELS_MIDPOINT_VALUE_INVALID');
  return value;
}

/** 0 (bright) -> gamma 10; 50 (neutral) -> gamma 1; 100 (dark) -> gamma 0.1. */
export function levelsMidpointPositionToGamma(position) {
  finiteRange(position, 0, 100);
  if (position === 0) return 10;
  if (position === 50) return 1;
  if (position === 100) return 0.1;
  return 10 ** (1 - position / 50);
}

/** Inverse for every gamma accepted by existing Levels Recipes. */
export function levelsGammaToMidpointPosition(gamma) {
  finiteRange(gamma, 0.1, 10);
  if (gamma === 10) return 0;
  if (gamma === 1) return 50;
  if (gamma === 0.1) return 100;
  return 50 * (1 - Math.log10(gamma));
}
