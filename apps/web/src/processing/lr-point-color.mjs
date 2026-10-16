import {assertPixels,checkAbort} from './pure.mjs';
// SUITE display-referred sRGB8 selection. Independent math, not Adobe parity.
// Hue degrees; S/L in [0,1]. L is HSL lightness, not physical luminance.
const clamp=v=>Math.max(0,Math.min(1,v));
const wrap=h=>((h%360)+360)%360;
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export function assertPointColorFrame(frame){
  assertPixels({width:frame?.width,height:frame?.height,data:frame?.data});
  if(frame.width*frame.height>8_000_000||!(frame.data.buffer instanceof ArrayBuffer))throw Error('POINT_COLOR_BUFFER_CAPACITY');
  if(Object.hasOwn(frame,'sourceWidth')||Object.hasOwn(frame,'sourceHeight')){
    if(!Number.isSafeInteger(frame.sourceWidth)||!Number.isSafeInteger(frame.sourceHeight)||frame.sourceWidth<1||frame.sourceHeight<1||!Number.isSafeInteger(frame.sourceWidth*frame.sourceHeight))throw Error('POINT_COLOR_SOURCE_METADATA');
  }return frame;
}
function number(v,a,b){if(!Number.isFinite(v)||v<a||v>b)throw Error('POINT_COLOR_RANGE');return v;}
export function pointColorHSL(r,g,b){
  for(const v of [r,g,b])number(v,0,1);const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;
  if(d===0)return {h:0,s:0,l};const sector=hi===r?(g-b)/d:hi===g?(b-r)/d+2:(r-g)/d+4;
  return {h:wrap(sector*60),s:d/(1-Math.abs(2*l-1)),l};
}
function rgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,t=wrap(h)/60,x=c*(1-Math.abs(t%2-1)),m=l-c/2;
  return (t<1?[c,x,0]:t<2?[x,c,0]:t<3?[0,c,x]:t<4?[0,x,c]:t<5?[x,0,c]:[c,0,x]).map(v=>clamp(v+m));}
/** Four ordered edges: outer low, full-weight low/high, outer high.
 * Equal edges produce a hard boundary. */
export function validateRangeEdges(edges){if(!Array.isArray(edges)||edges.length!==4)throw Error('POINT_COLOR_EDGES');
  edges.forEach((v,i)=>{number(v,0,1);if(i&&v<edges[i-1])throw Error('POINT_COLOR_EDGES');});return [...edges];}
export function rangeEdgeWeight(value,edges){const [a,b,c,d]=edges;if(value<a||value>d)return 0;
  return (value>=b?1:smooth((value-a)/(b-a)))*(value<=c?1:smooth((d-value)/(d-c)));}
export function validatePointColorSelections(selections){
  if(!Array.isArray(selections)||!selections.length||selections.length>16)throw Error('POINT_COLOR_SELECTIONS');const ids=new Set();
  return selections.map(s=>{if(!s||typeof s.id!=='string'||!s.id||s.id.length>128||ids.has(s.id))throw Error('POINT_COLOR_SELECTION_ID');ids.add(s.id);
    let hue=null;if(s.hue!==null){if(!s.hue)throw Error('POINT_COLOR_HUE');const {center,inner,outer}=s.hue;number(center,0,360);number(inner,0,180);number(outer,inner,180);hue={center:wrap(center),inner,outer};}
    const saturation=validateRangeEdges(s.saturation),lightness=validateRangeEdges(s.lightness),a=s.adjustment??{};
    if(Object.keys(a).some(k=>!['hue','saturation','lightness'].includes(k)))throw Error('POINT_COLOR_ADJUSTMENT');
    return {id:s.id,hue,saturation,lightness,adjustment:{hue:number(a.hue??0,-180,180),saturation:number(a.saturation??0,-100,100),lightness:number(a.lightness??0,-100,100)},enabled:s.enabled!==false};});
}
function weight(hsl,selection){if(!selection.enabled)return 0;let hw=1;
  if(selection.hue){const {center,inner,outer}=selection.hue,d=Math.abs(((hsl.h-center+540)%360)-180);
    // Achromatic pixels have no meaningful hue and are excluded from hue picks.
    if(hsl.s<1/255)return 0;hw=d<=inner?1:d>=outer?0:1-smooth((d-inner)/(outer-inner));}
  return hw*rangeEdgeWeight(hsl.s,selection.saturation)*rangeEdgeWeight(hsl.l,selection.lightness);
}
export function samplePointColor(frame,{x,y,radius=0,id='sample',hueRadius=20,saturationRadius=.15,lightnessRadius=.15,softness=.5}={}){
  assertPointColorFrame(frame);number(x,0,1);number(y,0,1);number(hueRadius,0,180);number(saturationRadius,0,1);number(lightnessRadius,0,1);number(softness,0,1);
  if(!Number.isInteger(radius)||radius<0||radius>32)throw Error('POINT_COLOR_SAMPLE_RADIUS');
  const cx=Math.min(frame.width-1,Math.floor(x*frame.width)),cy=Math.min(frame.height-1,Math.floor(y*frame.height)),sum=[0,0,0];let total=0;
  for(let py=Math.max(0,cy-radius);py<=Math.min(frame.height-1,cy+radius);py++)for(let px=Math.max(0,cx-radius);px<=Math.min(frame.width-1,cx+radius);px++){
    const i=(py*frame.width+px)*4,a=frame.data[i+3]/255;total+=a;for(let c=0;c<3;c++)sum[c]+=frame.data[i+c]/255*a;}
  if(!total)throw Error('POINT_COLOR_TRANSPARENT_SAMPLE');const color=sum.map(v=>v/total),hsl=pointColorHSL(...color),band=(v,r)=>[clamp(v-r),clamp(v-r*(1-softness)),clamp(v+r*(1-softness)),clamp(v+r)];
  const selection={id,hue:hsl.s<1/255?null:{center:hsl.h,inner:hueRadius*(1-softness),outer:hueRadius},saturation:band(hsl.s,saturationRadius),lightness:band(hsl.l,lightnessRadius)};
  return {selection:validatePointColorSelections([selection])[0],sample:{rgb:color,hsl,x,y,radius,coordinateSpace:'normalized-upper-left'}};
}
export function pointColorScope(frame,mask){if(mask===undefined)return null;
  if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||!(mask.buffer instanceof ArrayBuffer)||mask.length!==frame.width*frame.height)throw Error('POINT_COLOR_SCOPE');return mask;}
/** Union of independent samples; no sample-order-dependent selection. */
export function pointColorRangeMask(frame,selections,{scope,invert=false,signal}={}){
  assertPointColorFrame(frame);const selected=validatePointColorSelections(selections),domain=pointColorScope(frame,scope),data=new Uint8Array(frame.width*frame.height);
  for(let i=0;i<data.length;i++){if(!(i&8191))checkAbort(signal);const p=i*4;if(!frame.data[p+3])continue;
    const hsl=pointColorHSL(frame.data[p]/255,frame.data[p+1]/255,frame.data[p+2]/255),w=Math.max(...selected.map(s=>weight(hsl,s)));
    data[i]=Math.round(255*(invert?1-w:w)*(domain?domain[i]/255:1));}return {width:frame.width,height:frame.height,data};
}
/** Evaluate all samples against unedited input; overlap uses normalized weighted
 * controls times maximum coverage, preventing double application. */
export function applyPointColor(frame,selections,{amount=1,scope,signal}={}){
  assertPointColorFrame(frame);number(amount,0,1);const selected=validatePointColorSelections(selections),domain=pointColorScope(frame,scope),out={...frame,data:new Uint8ClampedArray(frame.data)};
  for(let i=0;i<frame.width*frame.height;i++){if(!(i&8191))checkAbort(signal);const p=i*4;if(!frame.data[p+3]||!amount||domain&&!domain[i])continue;
    const hsl=pointColorHSL(frame.data[p]/255,frame.data[p+1]/255,frame.data[p+2]/255);let total=0,maximum=0,dh=0,ds=0,dl=0;
    for(const s of selected){const w=weight(hsl,s);total+=w;maximum=Math.max(maximum,w);dh+=w*s.adjustment.hue;ds+=w*s.adjustment.saturation;dl+=w*s.adjustment.lightness;}
    if(!total||!dh&&!ds&&!dl)continue;const a=maximum*amount*(domain?domain[i]/255:1),move=(v,d)=>d>=0?v+(1-v)*d:v*(1+d);
    const adjusted=rgb(hsl.h+dh/total*a,move(hsl.s,ds/total/100*a),move(hsl.l,dl/total/100*a));for(let c=0;c<3;c++)out.data[p+c]=Math.round(adjusted[c]*255);
  }return out;
}
export function visualizePointColorRange(frame,mask,{mode='isolate',overlay=[255,0,160],opacity=.6,signal}={}){
  assertPointColorFrame(frame);const m=pointColorScope(frame,mask?.data??mask);if(!m||!['isolate','overlay','mask'].includes(mode))throw Error('POINT_COLOR_VISUALIZATION');number(opacity,0,1);
  if(!Array.isArray(overlay)||overlay.length!==3)throw Error('POINT_COLOR_OVERLAY');overlay.forEach(v=>number(v,0,255));const out={...frame,data:new Uint8ClampedArray(frame.data)};
  for(let i=0;i<m.length;i++){if(!(i&8191))checkAbort(signal);if(!frame.data[i*4+3])continue;const w=m[i]/255,p=i*4,l=.2126*frame.data[p]+.7152*frame.data[p+1]+.0722*frame.data[p+2];
    for(let c=0;c<3;c++)out.data[p+c]=Math.round(mode==='mask'?m[i]:mode==='overlay'?frame.data[p+c]*(1-w*opacity)+overlay[c]*w*opacity:frame.data[p+c]*w+l*(1-w));}return out;
}
