import {assertPixels, checkAbort, srgbToLinear, linearToSrgb} from './pure.mjs';

/** Display-referred, manually placed radial vignette. Not lens-profile correction. */
export const VIGNETTE_ALGORITHM_VERSION = 'suite-srgb8-manual-vignette-1';
const clamp = value => Math.max(0, Math.min(1, value));
const DEFAULT_CONTROLS=Object.freeze({midpoint:50,roundness:0,feather:50,highlights:0});

export function validateVignetteAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < -100 || amount > 100)
    throw Error('VIGNETTE_RANGE');
  return amount;
}

/**
 * Numeric Amount remains supported. For shape control use an object with a
 * required Amount and optional Midpoint, Roundness, Feather and Highlights.
 * These are SUITE 8-bit sRGB controls, not Evoto-compatible pixel formulas.
 */
export function validateVignetteSettings(value){
  if(typeof value==='number')return {amount:validateVignetteAmount(value),...DEFAULT_CONTROLS};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('VIGNETTE_SETTINGS_INVALID');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&!(Object.getPrototypeOf(prototype)===null&&
    Object.hasOwn(prototype,'constructor')&&prototype.constructor?.name==='Object'))throw Error('VIGNETTE_SETTINGS_INVALID');
  if(!Object.hasOwn(value,'amount')||Reflect.ownKeys(value).some(key=>
    typeof key!=='string'||!['amount','midpoint','roundness','feather','highlights'].includes(key)))
    throw Error('VIGNETTE_SETTINGS_INVALID');
  const settings={amount:validateVignetteAmount(value.amount),...DEFAULT_CONTROLS};
  for(const [key,min,max] of [['midpoint',0,100],['roundness',-100,100],['feather',0,100],['highlights',0,100]]){
    if(!Object.hasOwn(value,key))continue;
    const number=value[key];
    if(typeof number!=='number'||!Number.isFinite(number)||number<min||number>max)throw Error('VIGNETTE_RANGE');
    settings[key]=number;
  }
  return settings;
}

/** Negative Amount darkens edges; positive Amount brightens them. Center stays unchanged. */
export function applyVignette(pixels, amountOrSettings = 0, {signal} = {}) {
  assertPixels(pixels);
  checkAbort(signal);
  const {amount,midpoint,roundness,feather,highlights}=validateVignetteSettings(amountOrSettings);
  const {width, height} = pixels;
  const data = pixels.data.slice();
  if (amount !== 0 && (width > 1 || height > 1)) {
    const halfWidth = (width - 1) / 2, halfHeight = (height - 1) / 2;
    const axes = Number(width > 1) + Number(height > 1);
    const strength = Math.abs(amount) / 100 * 0.75;
    const start = 0.25 - (midpoint - 50) / 250;
    const span = 0.75 * Math.max(0.02, feather / 50);
    for (let y = 0; y < height; y++) {
      if (y % 32 === 0) checkAbort(signal);
      const dy = height > 1 ? (y - halfHeight) / halfHeight : 0;
      for (let x = 0; x < width; x++) {
        if (x % 16384 === 0) checkAbort(signal);
        const offset = (y * width + x) * 4;
        // Straight-alpha RGB is never mixed with neighboring pixels. Hidden
        // RGB remains hidden and cannot bleed into visible edge pixels.
        if (pixels.data[offset + 3] === 0) continue;
        const dx = width > 1 ? (x - halfWidth) / halfWidth : 0;
        const circular = Math.sqrt((dx * dx + dy * dy) / axes);
        // Negative Roundness approaches a rectangular superellipse; positive
        // Roundness concentrates falloff toward the corners. Zero is the old
        // circular radial profile.
        const other = roundness < 0 ? Math.max(Math.abs(dx),Math.abs(dy)) :
          (Math.abs(dx)+Math.abs(dy))/axes;
        const radius = circular + (other-circular)*Math.abs(roundness)/100;
        const t = clamp((radius - start) / span);
        let weight = t * t * (3 - 2 * t) * strength;
        if (weight === 0) continue;
        if(amount<0&&highlights>0){
          const luminance=.2126*srgbToLinear(pixels.data[offset]/255)+
            .7152*srgbToLinear(pixels.data[offset+1]/255)+
            .0722*srgbToLinear(pixels.data[offset+2]/255);
          const h=clamp((luminance-.35)/.55),highlightMask=h*h*(3-2*h);
          weight*=1-highlights/100*highlightMask;
        }
        for (let channel = 0; channel < 3; channel++) {
          const linear = srgbToLinear(pixels.data[offset + channel] / 255);
          const adjusted = amount < 0 ? linear * (1 - weight) : linear + (1 - linear) * weight;
          data[offset + channel] = Math.round(clamp(linearToSrgb(clamp(adjusted))) * 255);
        }
      }
    }
  }
  checkAbort(signal);
  return {width, height, data,
    ...(Object.hasOwn(pixels, 'sourceWidth') ? {sourceWidth: pixels.sourceWidth, sourceHeight: pixels.sourceHeight} : {})};
}
