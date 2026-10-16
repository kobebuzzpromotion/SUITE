import {assertPixels,checkAbort} from './pure.mjs';
import {buildPointCurveLUT,applyPointCurves} from './point-curves.mjs';
const BANDS=['shadows','darks','lights','highlights'];
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
function points(value){if(!Array.isArray(value)||value.length>16)throw Error('CURVE_16_POINT_LIMIT');buildPointCurveLUT(value);return value.map(p=>({...p}));}

/** Explicit 16-point editing adapter; existing 32-point saved curves are not
 * truncated or migrated. Existing RGB kernel remains the sole RGB implementation. */
export function editCurvePoint(curve,{operation,x,y}){
  const copy=points(curve);
  if(!['upsert','remove'].includes(operation)||!Number.isInteger(x)||x<0||x>255)throw Error('CURVE_EDIT_INVALID');
  const index=copy.findIndex(p=>p.x===x);
  if(operation==='remove'){
    if(x===0||x===255||index<0)throw Error('CURVE_REMOVE_ENDPOINT_OR_MISSING');copy.splice(index,1);
  }else{
    if(!Number.isInteger(y)||y<0||y>255)throw Error('CURVE_EDIT_OUTPUT_INVALID');
    if(index<0)copy.push({x,y});else copy[index]={x,y};copy.sort((a,b)=>a.x-b.x);
  }
  return points(copy);
}
export function adjustCurveOnImage(pixels,curve,{x,y,channel='luma',delta},{signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=pixels.width||y<0||y>=pixels.height||
    !['luma','master','red','green','blue'].includes(channel)||!Number.isFinite(delta)||Math.abs(delta)>255)
    throw Error('CURVE_IMAGE_SELECTION_INVALID');
  const o=(y*pixels.width+x)*4;if(!pixels.data[o+3])throw Error('CURVE_IMAGE_TRANSPARENT');
  const input=channel==='red'?pixels.data[o]:channel==='green'?pixels.data[o+1]:channel==='blue'?pixels.data[o+2]:
    clamp(.2126*pixels.data[o]+.7152*pixels.data[o+1]+.0722*pixels.data[o+2]);
  const lut=buildPointCurveLUT(points(curve));
  return editCurvePoint(curve,{operation:'upsert',x:input,y:clamp(lut[input]+delta)});
}
/** Four independent smooth tonal bands plus luminance curve. This is a new
 * explicit stage; do not also apply the legacy three-band parametric stage.
 * Luma preserves channel differences until gamut clipping; not scene-linear HDR.
 * RGB/master curves reuse applyPointCurves and its existing Refine Saturation. */
export function applyExtendedCurves(pixels,{rgb={},luma,tonalBands={}}={}, {signal}={}){
  assertPixels(pixels);checkAbort(signal);
  if(!tonalBands||typeof tonalBands!=='object'||Array.isArray(tonalBands)||
    Object.keys(tonalBands).some(k=>!BANDS.includes(k)))throw Error('CURVE_BANDS_INVALID');
  const amounts=BANDS.map(k=>tonalBands[k]??0);
  if(amounts.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('CURVE_BAND_RANGE');
  for(const key of ['master','red','green','blue'])if(rgb[key])points(rgb[key]);
  const frame=applyPointCurves(pixels,rgb,{signal}),data=frame.data;
  const lut=luma?buildPointCurveLUT(points(luma)):null;
  if(!lut&&amounts.every(v=>v===0))return frame;
  for(let i=0;i<data.length;i+=4){
    if((i&16383)===0)checkAbort(signal);if(!data[i+3])continue;
    const original=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],t=original/255;
    let shift=0;
    for(let k=0;k<4;k++){const distance=Math.abs(t-(k+.5)/4)/.375;
      if(distance<1)shift+=amounts[k]/100*(1-distance)**2*48;}
    const y=Math.max(0,Math.min(255,original+shift)),a=Math.floor(y),b=Math.min(255,a+1);
    const mapped=lut?lut[a]*(1-(y-a))+lut[b]*(y-a):y;
    for(let c=0;c<3;c++)data[i+c]=clamp(data[i+c]+mapped-original);
  }
  checkAbort(signal);return frame;
}
