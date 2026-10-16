import {checkAbort,MAX_PIXELS} from './pure.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
/** Raw gradient coverage only; caller applies inversion and source alpha.
 * Coordinates refer to the entire untransformed frame, never a flattened strip. */
export function createPortraitGradientCoverage({width,height},spec,{signal}={}){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_PIXELS)throw Error('PORTRAIT_GRADIENT_DIMENSIONS');
  if(!['linear','radial'].includes(spec?.kind))throw Error('PORTRAIT_MASK_KIND');
  const {from,to}=spec;for(const p of [from,to])if(!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('PORTRAIT_GRADIENT_POINTS');
  const dx=(to.x-from.x)*width,dy=(to.y-from.y)*height,len2=dx*dx+dy*dy;if(len2<1)throw Error('PORTRAIT_GRADIENT_SIZE');
  checkAbort(signal);const out=new Uint8Array(width*height);
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    if(!(x&16383))checkAbort(signal);
    const px=x+.5-from.x*width,py=y+.5-from.y*height;
    const t=spec.kind==='linear'?clamp((px*dx+py*dy)/len2):clamp(1-Math.hypot(px,py)/Math.sqrt(len2));
    out[y*width+x]=Math.round(255*t*t*(3-2*t));
  }}return out;
}
