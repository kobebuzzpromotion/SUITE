import {applyColorAdjustments} from './color-adjustments.mjs';
import {applyDetailAdjustments} from './detail-adjustments.mjs';
export const MAX_PIXELS = 24_000_000;
export const MAX_INPUT_BYTES = 128 * 1024 * 1024;
export const MAX_FACES = 8;
export const WEB_ENGINE = 'web-libraw-mediapipe-face-exposure-1';
export function checkAbort(signal) { if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError'); }
export function assertPixels(p) {
  if (!p || !Number.isSafeInteger(p.width) || !Number.isSafeInteger(p.height) || p.width < 1 || p.height < 1 || p.width*p.height > MAX_PIXELS || !(p.data instanceof Uint8ClampedArray) || p.data.length !== p.width*p.height*4) throw Error('INVALID_OR_OVERSIZE_PIXELS');
  const hasWidth=Object.hasOwn(p,'sourceWidth'),hasHeight=Object.hasOwn(p,'sourceHeight');
  if(hasWidth!==hasHeight)throw Error('INVALID_SOURCE_FRAME');
  if(hasWidth && (!Number.isSafeInteger(p.sourceWidth)||!Number.isSafeInteger(p.sourceHeight)||p.sourceWidth<p.width||p.sourceHeight<p.height||p.sourceWidth*p.sourceHeight>MAX_PIXELS))throw Error('INVALID_SOURCE_FRAME');
  return p;
}
/** Upright unedited-base reference dimensions, not dimensions of a rotated/cropped output. */
export function sourceDimensions(p) {assertPixels(p);return Object.hasOwn(p,'sourceWidth')?{width:p.sourceWidth,height:p.sourceHeight}:{width:p.width,height:p.height};}
export function assertInputBuffer(b) { if (!(b instanceof ArrayBuffer) || !b.byteLength || b.byteLength > MAX_INPUT_BYTES) throw Error('INVALID_OR_OVERSIZE_RAW'); return b; }
const finite = v => typeof v === 'number' && Number.isFinite(v);
function anchor(a) { if (!a || !['x','y','width','height'].every(k=>finite(a[k])) || a.x<0 || a.y<0 || a.width<=0 || a.height<=0 || a.x+a.width>1 || a.y+a.height>1) throw Error('INVALID_DETECTION_ANCHOR'); }
const overlap = (a,b) => Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x) && Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
export function intersectionOverUnion(a,b) { anchor(a); anchor(b); const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)); return area/(a.width*a.height+b.width*b.height-area); }
function cross(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function onSegment(a,b,p) { return Math.abs(cross(a,b,p))<1e-12 && p.x>=Math.min(a.x,b.x)-1e-12 && p.x<=Math.max(a.x,b.x)+1e-12 && p.y>=Math.min(a.y,b.y)-1e-12 && p.y<=Math.max(a.y,b.y)+1e-12; }
function segmentsMeet(a,b,c,d) { return cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0 || onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b); }
export function validatePolygon(polygon,a) {
  anchor(a);
  if (!Array.isArray(polygon) || polygon.length<3 || polygon.length>128) throw Error('INVALID_FACE_POLYGON');
  for (const p of polygon) if (!p || !finite(p.x)||!finite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1||p.x<a.x-1e-9||p.x>a.x+a.width+1e-9||p.y<1-a.y-a.height-1e-9||p.y>1-a.y+1e-9) throw Error('POLYGON_OUTSIDE_FACE');
  let area=0;
  for(let i=0;i<polygon.length;i++) {const a=polygon[i],b=polygon[(i+1)%polygon.length]; if (Math.hypot(a.x-b.x,a.y-b.y)<1e-9) throw Error('DEGENERATE_FACE_POLYGON'); area+=a.x*b.y-b.x*a.y;
    for(let j=i+1;j<polygon.length;j++) if(j!==i+1 && !(i===0&&j===polygon.length-1) && segmentsMeet(a,b,polygon[j],polygon[(j+1)%polygon.length])) throw Error('SELF_INTERSECTING_FACE_POLYGON');
  }
  if(Math.abs(area)<1e-8) throw Error('DEGENERATE_FACE_POLYGON');
  return polygon;
}
export function validateDetections(detections) {
  if(!Array.isArray(detections)||!detections.length||detections.length>=MAX_FACES) throw Error('MISSING_OR_SATURATED_FACE_INVENTORY');
  for(let i=0;i<detections.length;i++) {const d=detections[i]; if(d.complete!==true) throw Error('INCOMPLETE_FACE'); anchor(d.anchor); validatePolygon(d.mask,d.anchor);
    for(let j=0;j<i;j++) if(overlap(d.anchor,detections[j].anchor)) throw Error('OVERLAPPING_FACES');
  }
  return detections;
}
export function reconcileTargets(targets,detections) {
  validateDetections(detections);
  if(!Array.isArray(targets)||targets.length!==detections.length) throw Error('PERSON_INVENTORY_MISMATCH');
  const ids=new Set(),used=new Set();
  return targets.map((t,i)=>{anchor(t.anchor); if(typeof t.id!=='string'||!t.id||ids.has(t.id.toLowerCase())) throw Error('DUPLICATE_OR_MISSING_PERSON_ID'); ids.add(t.id.toLowerCase());
    for(let j=0;j<i;j++) if(overlap(t.anchor,targets[j].anchor)) throw Error('OVERLAPPING_TARGETS');
    const matches=detections.map((d,index)=>({d,index})).filter(({d})=>intersectionOverUnion(t.anchor,d.anchor)>=0.5);
    if(matches.length!==1||used.has(matches[0].index)) throw Error('AMBIGUOUS_OR_MISSING_PERSON'); used.add(matches[0].index); return {target:t,detection:matches[0].d,index:matches[0].index};
  });
}
export function pointInPolygon(x,y,p) { let inside=false; for(let i=0,j=p.length-1;i<p.length;j=i++) {const a=p[j],b=p[i]; if(onSegment(a,b,{x,y})) return true; if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;} return inside; }
export function polygonWeight(x,y,p,feather=0.012) {
  if(!pointInPolygon(x,y,p)) return 0;
  let distance=Infinity;
  for(let i=0;i<p.length;i++) {const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}
  const t=feather>0?Math.min(1,distance/feather):1;return t*t*(3-2*t);
}
export const srgbToLinear = v => v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
export const linearToSrgb = v => v<=0.0031308?v*12.92:1.055*v**(1/2.4)-0.055;
const clamp = v => Math.max(0,Math.min(1,v));
export function makeProxyPixels(p,maxEdge=1600) {
  assertPixels(p); if(!Number.isSafeInteger(maxEdge)||maxEdge<1||maxEdge>8192) throw Error('INVALID_PROXY_EDGE');
  const source=sourceDimensions(p);
  const scale=Math.min(1,maxEdge/Math.max(p.width,p.height)),width=Math.max(1,Math.round(p.width*scale)),height=Math.max(1,Math.round(p.height*scale)),data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {const sx=Math.min(p.width-1,Math.floor((x+.5)*p.width/width)),sy=Math.min(p.height-1,Math.floor((y+.5)*p.height/height));data.set(p.data.subarray((sy*p.width+sx)*4,(sy*p.width+sx)*4+4),(y*width+x)*4);}
  return {width,height,data,sourceWidth:source.width,sourceHeight:source.height};
}
export function rotateCropPixels(p,rotation=0,crop, {resolutionAssessment,signal}={}) {
  assertPixels(p);checkAbort(signal); if(!Number.isSafeInteger(rotation)||rotation%90!==0) throw Error('UNSUPPORTED_ROTATION');
  const source=sourceDimensions(p);
  const turns=((rotation/90)%4+4)%4,width=turns%2?p.height:p.width,height=turns%2?p.width:p.height,data=turns?new Uint8ClampedArray(p.data.length):p.data.slice();
  if(turns)for(let y=0;y<p.height;y++) {if(y%64===0)checkAbort(signal);for(let x=0;x<p.width;x++) {let dx=x,dy=y;if(turns===1){dx=y;dy=p.width-1-x;}if(turns===2){dx=p.width-1-x;dy=p.height-1-y;}if(turns===3){dx=p.height-1-y;dy=x;}const from=(y*p.width+x)*4,to=(dy*width+dx)*4;for(let c=0;c<4;c++)data[to+c]=p.data[from+c];}}
  if(!crop) return {width,height,data};
  if(typeof resolutionAssessment!=='function') throw Error('SHARED_CROP_VALIDATOR_REQUIRED');
  // Validate the SAME normalized Recipe against canonical upright full-source dimensions.
  // Integer-rounded Proxy dimensions are only a projection surface, not a new Crop reference frame.
  resolutionAssessment(source.width,source.height,crop);const rect=crop.crop_rect;
  if(crop.width_mm!==undefined||crop.height_mm!==undefined) throw Error('UNSUPPORTED_WEB_PHYSICAL_OUTPUT');
  // Existing portable crop_rect is normalized upper-left, after recipe rotation.
  const left=Math.floor(rect.x*width+1e-9),top=Math.floor(rect.y*height+1e-9),w=Math.floor(width*rect.width+1e-9),h=Math.floor(height*rect.height+1e-9);
  if(w<1||h<1)throw Error('CROP_BELOW_REPRESENTATION_RESOLUTION');
  if(left<0||top<0||left+w>width||top+h>height) throw Error('CROP_OUTSIDE_PIXELS');
  const out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)out.set(data.subarray(((top+y)*width+left)*4,((top+y)*width+left+w)*4),y*w*4);
  return {width:w,height:h,data:out};
}
export function renderPixels(p,recipe,{detections=[],signal,validateRecipe,resolutionAssessment}={}) {
  assertPixels(p);checkAbort(signal);if(typeof validateRecipe!=='function')throw Error('SHARED_RECIPE_VALIDATOR_REQUIRED');validateRecipe(recipe);
  const source=sourceDimensions(p);
  const r=recipe.parameters,extra=r.extendedParameters;
  if(Object.keys(extra).some(k=>!['crop','export','portrait','postDecodeAdjustments'].includes(k))||r.processingOrder.some(k=>!['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'].includes(k)))throw Error('UNSUPPORTED_WEB_ADJUSTMENT');
  const fixedOrder=['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'];
  if(r.processingOrder.some((stage,index)=>index>0&&fixedOrder.indexOf(stage)<fixedOrder.indexOf(r.processingOrder[index-1])))throw Error('UNSUPPORTED_WEB_PROCESSING_ORDER');
  if(Math.abs(r.exposure)>4||r.contrast>4||r.saturation>4)throw Error('WEB_ADJUSTMENT_LIMIT');
  const portrait=extra.portrait;
  if(portrait&&portrait.engineVersion!==WEB_ENGINE)throw Error('UNSUPPORTED_PORTRAIT_ENGINE');
  const matches=(portrait?reconcileTargets(portrait.targets,detections):[]).map(({target,detection})=>{
    if(target.adjustmentType!=='face_brightness'||!finite(target.value)||Math.abs(target.value)>4)throw Error('UNSUPPORTED_PERSON_ADJUSTMENT');
    return {detection,delta:2**target.value-1};
  });
  const data=p.data.slice(),globalFactor=2**r.exposure;
  for(let y=0;y<p.height;y++){if(y%32===0)checkAbort(signal);for(let x=0;x<p.width;x++){const i=(y*p.width+x)*4,nx=(x+.5)/p.width,ny=(y+.5)/p.height;
    let factor=1;for(const {delta,detection} of matches){const a=detection.anchor;if(delta!==0&&nx>=a.x&&nx<=a.x+a.width&&ny>=1-a.y-a.height&&ny<=1-a.y)factor+=delta*polygonWeight(nx,ny,detection.mask,Math.min(a.width,a.height)*.08);}
    if(factor===1&&r.exposure===0&&r.contrast===1&&r.saturation===1)continue;
    const multiplier=factor*globalFactor;
    const red=(srgbToLinear(p.data[i]/255)*multiplier-.5)*r.contrast+.5,green=(srgbToLinear(p.data[i+1]/255)*multiplier-.5)*r.contrast+.5,blue=(srgbToLinear(p.data[i+2]/255)*multiplier-.5)*r.contrast+.5;
    const luma=.2126*red+.7152*green+.0722*blue;
    data[i]=Math.round(clamp(linearToSrgb(clamp(luma+(red-luma)*r.saturation)))*255);
    data[i+1]=Math.round(clamp(linearToSrgb(clamp(luma+(green-luma)*r.saturation)))*255);
    data[i+2]=Math.round(clamp(linearToSrgb(clamp(luma+(blue-luma)*r.saturation)))*255);
  }}
  let pixels={width:p.width,height:p.height,data,sourceWidth:source.width,sourceHeight:source.height};
  if(extra.postDecodeAdjustments){
    if(!r.processingOrder.includes('postDecodeAdjustments')||extra.postDecodeAdjustments.schemaVersion!==1||extra.postDecodeAdjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('INVALID_POST_DECODE_ADJUSTMENTS');
    pixels=applyColorAdjustments(pixels,extra.postDecodeAdjustments.color||{},{signal});
    pixels=applyDetailAdjustments(pixels,extra.postDecodeAdjustments.detail||{},{signal});
  }else if(r.processingOrder.includes('postDecodeAdjustments'))throw Error('INVALID_POST_DECODE_ADJUSTMENTS');
  checkAbort(signal);return rotateCropPixels(pixels,r.rotationDegrees,extra.crop,{resolutionAssessment,signal});
}
