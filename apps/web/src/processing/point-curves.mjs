import {assertPixels, checkAbort} from './pure.mjs';

export const POINT_CURVES_ALGORITHM_VERSION = 'suite-srgb8-rgb-point-curves-1';
const CHANNELS = ['master', 'red', 'green', 'blue'];
const KEYS = [...CHANNELS, 'refineSaturation'];
const IDENTITY = Uint8Array.from({length: 256}, (_, value) => value);
const clampByte = value => Math.max(0, Math.min(255, Math.round(value)));

function checkedPoints(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 32) throw Error('INVALID_POINT_CURVE_POINTS');
  let previousX = -1;
  for (const point of points) {
    if (!point || typeof point !== 'object' || Array.isArray(point) ||
        Object.keys(point).length !== 2 || !Object.hasOwn(point, 'x') || !Object.hasOwn(point, 'y') ||
        !Number.isInteger(point.x) || !Number.isInteger(point.y) ||
        point.x < 0 || point.x > 255 || point.y < 0 || point.y > 255 || point.x <= previousX) {
      throw Error('INVALID_POINT_CURVE_POINTS');
    }
    previousX = point.x;
  }
  if (points[0].x !== 0 || points.at(-1).x !== 255) throw Error('INVALID_POINT_CURVE_ENDPOINTS');
  return points;
}

function endpointSlope(firstWidth, nextWidth, firstDelta, nextDelta) {
  let slope = ((2 * firstWidth + nextWidth) * firstDelta - firstWidth * nextDelta) / (firstWidth + nextWidth);
  if (Math.sign(slope) !== Math.sign(firstDelta)) slope = 0;
  else if (Math.sign(firstDelta) !== Math.sign(nextDelta) && Math.abs(slope) > 3 * Math.abs(firstDelta)) slope = 3 * firstDelta;
  return slope;
}

/**
 * Shape-preserving cubic Hermite LUT for explicit 8-bit sRGB control points.
 * A control-point reversal is allowed; local extrema have zero slope and no
 * overshoot. This is a decoded-pixel tone operation, not a RAW sensor curve.
 */
export function buildPointCurveLUT(points) {
  checkedPoints(points);
  const count = points.length;
  const widths = new Float64Array(count - 1);
  const deltas = new Float64Array(count - 1);
  const slopes = new Float64Array(count);
  for (let i = 0; i < count - 1; i++) {
    widths[i] = points[i + 1].x - points[i].x;
    deltas[i] = (points[i + 1].y - points[i].y) / widths[i];
  }
  if (count === 2) slopes.fill(deltas[0]);
  else {
    slopes[0] = endpointSlope(widths[0], widths[1], deltas[0], deltas[1]);
    slopes[count - 1] = endpointSlope(widths[count - 2], widths[count - 3], deltas[count - 2], deltas[count - 3]);
    for (let i = 1; i < count - 1; i++) {
      const left = deltas[i - 1], right = deltas[i];
      if (left === 0 || right === 0 || Math.sign(left) !== Math.sign(right)) continue;
      const weightLeft = 2 * widths[i] + widths[i - 1];
      const weightRight = widths[i] + 2 * widths[i - 1];
      slopes[i] = (weightLeft + weightRight) / (weightLeft / left + weightRight / right);
    }
  }
  const lut = new Uint8Array(256);
  let segment = 0;
  for (let x = 0; x <= 255; x++) {
    while (segment < count - 2 && x > points[segment + 1].x) segment++;
    const width = widths[segment], t = (x - points[segment].x) / width, t2 = t * t, t3 = t2 * t;
    const value = (2 * t3 - 3 * t2 + 1) * points[segment].y +
      (t3 - 2 * t2 + t) * width * slopes[segment] +
      (-2 * t3 + 3 * t2) * points[segment + 1].y +
      (t3 - t2) * width * slopes[segment + 1];
    lut[x] = clampByte(value);
  }
  return lut;
}

/**
 * The master curve is applied first to each channel, then the corresponding
 * red/green/blue curve. Absent channels are identity. Per-pixel operation is
 * one lookup per channel in an already-composed LUT. Alpha and hidden RGB of
 * fully transparent pixels are never changed; the source raster is immutable.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} pixels
 * `refineSaturation` is SUITE's 0..100 chroma-change blend, not an Adobe
 * pixel formula. At 100 or absent the legacy LUT output is byte-identical.
 * At 0 the curve's luma change is kept while original chroma is restored.
 * @param {{master?:Array,red?:Array,green?:Array,blue?:Array,refineSaturation?:number}} curves
 * @param {{signal?:AbortSignal}} options
 */
export function applyPointCurves(pixels, curves = {}, {signal} = {}) {
  assertPixels(pixels);
  if (!curves || typeof curves !== 'object' || Array.isArray(curves) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(curves)) ||
      Object.keys(curves).some(key => !KEYS.includes(key))) throw Error('INVALID_POINT_CURVES');
  const refine=curves.refineSaturation??100;
  if(!Number.isInteger(refine)||refine<0||refine>100)throw Error('INVALID_POINT_CURVE_REFINE_SATURATION');
  checkAbort(signal);
  const master = Object.hasOwn(curves, 'master') ? buildPointCurveLUT(curves.master) : IDENTITY;
  const channels = ['red', 'green', 'blue'].map(channel => Object.hasOwn(curves, channel) ? buildPointCurveLUT(curves[channel]) : IDENTITY);
  const composed = channels.map(lut => Uint8Array.from({length: 256}, (_, value) => lut[master[value]]));
  const data = pixels.data.slice();
  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      if ((x & 0x3fff) === 0) checkAbort(signal);
      const offset = (y * pixels.width + x) * 4;
      if (pixels.data[offset + 3] === 0) continue;
      const red=composed[0][pixels.data[offset]],green=composed[1][pixels.data[offset+1]],blue=composed[2][pixels.data[offset+2]];
      if(refine===100){data[offset]=red;data[offset+1]=green;data[offset+2]=blue;continue;}
      const originalLuma=.2126*pixels.data[offset]+.7152*pixels.data[offset+1]+.0722*pixels.data[offset+2];
      const curvedLuma=.2126*red+.7152*green+.0722*blue;
      const blend=refine/100;
      data[offset]=clampByte((curvedLuma+pixels.data[offset]-originalLuma)*(1-blend)+red*blend);
      data[offset+1]=clampByte((curvedLuma+pixels.data[offset+1]-originalLuma)*(1-blend)+green*blend);
      data[offset+2]=clampByte((curvedLuma+pixels.data[offset+2]-originalLuma)*(1-blend)+blue*blend);
    }
  }
  checkAbort(signal);
  return {width: pixels.width, height: pixels.height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
}
