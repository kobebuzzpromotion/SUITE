import {assertPixels,checkAbort,srgbToLinear,linearToSrgb} from './pure.mjs';
import {applyColorAdjustments} from './color-adjustments.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const NEUTRAL=Object.freeze({exposure:0,contrast:1,highlights:0,shadows:0,whites:0,blacks:0,saturation:1,vibrance:0});
export const AUTO_LIGHT_ALGORITHM='suite-alpha-weighted-percentiles-1';
function controls(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(NEUTRAL,k)))throw Error('AUTO_LIGHT_CONTROLS');
  const out={...NEUTRAL,...value};for(const [key,v] of Object.entries(out)){
    const [lo,hi]=key==='exposure'?[-4,4]:['contrast','saturation'].includes(key)?[0,4]:[-100,100];
    if(!Number.isFinite(v)||v<lo||v>hi)throw Error('AUTO_LIGHT_CONTROL_RANGE');}return out;
}
/** Deterministic SUITE suggestion, NOT Adobe Sensei or semantic scene analysis.
 * Eight Light/Color controls use visible-pixel linear luminance statistics.
 * It estimates from an unedited decoded base, never recovers clipped RAW data.
 * Transparent RGB is excluded; optional analysis mask is geometric, not permission.
 */
export function proposeAutoLight(pixels,{mask,signal}={}){
  assertPixels(pixels);checkAbort(signal);const n=pixels.width*pixels.height;
  if(mask!==undefined&&(!(mask instanceof Uint8Array)||mask.length!==n))throw Error('AUTO_LIGHT_MASK');
  const histogram=new Float64Array(4096);let total=0,chroma=0,clippedBlack=0,clippedWhite=0;
  for(let i=0;i<n;i++){if(!(i&16383))checkAbort(signal);const o=i*4,w=pixels.data[o+3]/255*(mask?mask[i]/255:1);if(!w)continue;
    const rgb=[pixels.data[o]/255,pixels.data[o+1]/255,pixels.data[o+2]/255],linear=rgb.map(srgbToLinear),y=.2126*linear[0]+.7152*linear[1]+.0722*linear[2];
    histogram[Math.min(4095,Math.floor(y*4096))]+=w;total+=w;const high=Math.max(...rgb),low=Math.min(...rgb);chroma+=w*(high?1-low/high:0);
    if(high<=1/255)clippedBlack+=w;if(low>=254/255)clippedWhite+=w;
  }
  if(!total)throw Error('AUTO_LIGHT_NO_VISIBLE_SAMPLES');
  const quantile=q=>{let count=0;for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=total*q)return (i+.5)/4096;}return 1;};
  const p01=quantile(.01),p10=quantile(.1),p50=quantile(.5),p90=quantile(.9),p99=quantile(.99),spread=p99-p01;
  // Flat/near-black/near-white fields carry insufficient scene information.
  const insufficient=spread<.003||clippedBlack/total>.98||clippedWhite/total>.98;
  let suggested={...NEUTRAL};
  if(!insufficient){
    const exposure=clamp(Math.log2(.18/Math.max(.002,p50)),-2,2),gain=2**exposure;
    const effectiveRange=Math.max(.05,Math.min(1,p99*gain)-Math.min(1,p01*gain));
    suggested={exposure,contrast:clamp(.82/effectiveRange,.9,1.12),
      highlights:clamp((.78-p90*gain)*60,-60,25),shadows:clamp((.06-p10*gain)*180,-20,55),
      whites:clamp((.96-p99*gain)*50,-45,25),blacks:clamp((.008-p01*gain)*200,-35,15),
      saturation:clamp(1+(.35-chroma/total)*.12,.96,1.04),vibrance:clamp((.45-chroma/total)*35,-10,15)};
  }
  return {kind:'suite-auto-light-proposal',algorithm:AUTO_LIGHT_ALGORITHM,controls:controls(suggested),
    analysis:{width:pixels.width,height:pixels.height,visibleWeight:total,luminance:{p01,p10,p50,p90,p99},meanChroma:chroma/total,clippedBlackFraction:clippedBlack/total,clippedWhiteFraction:clippedWhite/total},
    status:insufficient?'neutral-insufficient-tonal-information':'suggested-not-applied',adobeEquivalent:false};
}
/** Amount is a SUITE 0..1 interpolation from explicit baseline to proposal.
 * Multipliers interpolate from 1, not from 0. Reset returns baseline controls;
 * caller rerenders the immutable base rather than undoing pixel arithmetic. */
export function autoLightAmount(proposal,amount=1,{baseline={}}={}){
  if(proposal?.kind!=='suite-auto-light-proposal'||proposal.algorithm!==AUTO_LIGHT_ALGORITHM||!Number.isFinite(amount)||amount<0||amount>1)throw Error('AUTO_LIGHT_PROPOSAL_OR_AMOUNT');
  const a=controls(baseline),b=controls(proposal.controls);return Object.fromEntries(Object.keys(NEUTRAL).map(k=>[k,a[k]+(b[k]-a[k])*amount]));
}
export function resetAutoLight(baseline={}){return controls(baseline);}
/** Independent preview renderer using the shared linear RGB global convention
 * and existing tone/vibrance kernel. No shared Recipe or processing-order edit. */
export function applyAutoLight(pixels,settings,{signal}={}){
  assertPixels(pixels);checkAbort(signal);const p=controls(settings),data=pixels.data.slice();
  if(p.exposure||p.contrast!==1||p.saturation!==1)for(let i=0;i<data.length;i+=4){if(!(i&65535))checkAbort(signal);if(!data[i+3])continue;
    const rgb=[0,1,2].map(c=>(srgbToLinear(pixels.data[i+c]/255)*2**p.exposure-.5)*p.contrast+.5),y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    for(let c=0;c<3;c++)data[i+c]=Math.round(255*clamp(linearToSrgb(clamp(y+(rgb[c]-y)*p.saturation,0,1)),0,1));}
  return applyColorAdjustments({...pixels,data},{highlights:p.highlights,shadows:p.shadows,whites:p.whites,blacks:p.blacks,vibrance:p.vibrance},{signal});
}
