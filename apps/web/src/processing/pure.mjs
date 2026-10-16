import {applyColorAdjustments} from './color-adjustments.mjs';
import {applyColorCalibration} from './color-calibration.mjs';
import {applySelectiveColor} from './selective-color.mjs';
import {applyDetailAdjustments} from './detail-adjustments.mjs';
import {applyLevels} from './levels.mjs';
import {applyGrain} from './grain.mjs';
import {applyPointCurves} from './point-curves.mjs';
import {applyGlow} from './glow.mjs';
import {applyColorGrading} from './lr-color-grading.mjs';
import {applyPointColorForRender} from './point-color-render.mjs';
import {applyExtendedCurves} from './delta66-color-curves.mjs';
import {applyColorProfile} from './delta66-color-profile.mjs';
import {applySceneBasic,estimateWhiteBalance,applyWhiteBalance,applySceneMatch} from './delta66-scene-color.mjs';
import {applyVignette} from './vignette.mjs';
import {rasterizeLocalBrushMask} from './local-mask-brush.mjs';
import {warpScene} from './delta66-scene-geometry.mjs';
import {sceneGeometryInverse} from './scene-geometry-contract.mjs';
import {applyLocalLevels} from './local-levels.mjs';
import {applyManualMakeup} from './manual-makeup-brush.mjs';
import {applyManualClone} from './manual-clone.mjs';
import {applyManualSkin} from './manual-skin.mjs';
import {applyManualRedEye} from './manual-red-eye.mjs';
import {applyManualHair} from './manual-hair.mjs';
import {applyWebManualTeeth} from './web-manual-teeth.mjs';
import {applyWebManualClothing} from './web-manual-clothing.mjs';
import {applyWebManualBackground} from './web-manual-background.mjs';
import {applyWebManualSpot} from './web-manual-spot.mjs';
import {applyWebDepthRange} from './web-depth-range.mjs';
import {applyWebLensShading,applyWebLensGeometry} from './web-connected-lens.mjs';
import {applyWebManualLiquify} from './web-manual-liquify.mjs';
import {blendLocalLUTMask} from './local-lut-mask.mjs';
import {applyManualEyes} from './manual-eyes.mjs';
import {applyColorRangeLevels} from './color-range-levels.mjs';
import {applySavedPersonalLook} from './personal-look-render.mjs';
export const MAX_PIXELS = 24_000_000;
// Original geometry is metadata. It must not raise the allocation budget for
// decoded/proxy pixels, masks or Final output. Large RAWs require the native
// geometry bridge before their reduced pixels may carry these dimensions.
export const MAX_SOURCE_PIXELS = 96_000_000;
export const MAX_INPUT_BYTES = 128 * 1024 * 1024;
export const MAX_FACES = 8;
export const WEB_ENGINE = 'web-libraw-mediapipe-face-exposure-1';
export function checkAbort(signal) { if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError'); }
export function assertPixels(p) {
  if (!p || !Number.isSafeInteger(p.width) || !Number.isSafeInteger(p.height) || p.width < 1 || p.height < 1 || p.width*p.height > MAX_PIXELS || !(p.data instanceof Uint8ClampedArray) || p.data.length !== p.width*p.height*4) throw Error('INVALID_OR_OVERSIZE_PIXELS');
  const hasWidth=Object.hasOwn(p,'sourceWidth'),hasHeight=Object.hasOwn(p,'sourceHeight');
  if(hasWidth!==hasHeight)throw Error('INVALID_SOURCE_FRAME');
  if(hasWidth && (!Number.isSafeInteger(p.sourceWidth)||!Number.isSafeInteger(p.sourceHeight)||p.sourceWidth<p.width||p.sourceHeight<p.height||!Number.isSafeInteger(p.sourceWidth*p.sourceHeight)||p.sourceWidth*p.sourceHeight>MAX_SOURCE_PIXELS))throw Error('INVALID_SOURCE_FRAME');
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
  // Reusing a rounded Proxy must not shrink it one pixel on each pass.
  if(p.width<=maxEdge&&p.height<=maxEdge)return {width:p.width,height:p.height,data:p.data.slice(),sourceWidth:source.width,sourceHeight:source.height};
  // Normalize from the canonical Original ratio. Half-size RAW dimensions can
  // round odd edges independently; they are a sampling surface, not a new crop
  // coordinate system. Never enlarge beyond the available decoded raster.
  const scale=Math.min(1,p.width/source.width,p.height/source.height,maxEdge/Math.max(source.width,source.height));
  const width=Math.max(1,Math.min(p.width,Math.round(source.width*scale))),height=Math.max(1,Math.min(p.height,Math.round(source.height*scale)));
  const data=new Uint8ClampedArray(width*height*4);
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
export function renderPixels(p,recipe,{detections=[],signal,validateRecipe,resolutionAssessment,
  applyBWEdgeManual,bwEdgeRuntime,bwEdgeTarget,applyLocalSavedBW,localSavedBW,addShadowApplied=false,localLUT}={}) {
  assertPixels(p);checkAbort(signal);if(typeof validateRecipe!=='function')throw Error('SHARED_RECIPE_VALIDATOR_REQUIRED');validateRecipe(recipe);
  const source=sourceDimensions(p);
  const r=recipe.parameters,extra=r.extendedParameters;
  if(localLUT!==undefined&&extra.postDecodeAdjustments?.color?.profile?.kind!=='local-lut')
    throw Error('LOCAL_LUT_RUNTIME_UNEXPECTED');
  if(Object.keys(extra).some(k=>!['webDepthRange','crop','export','portrait','postDecodeAdjustments','postCropAdjustments','canvasExpand','localLevels','manualMakeup','manualClone','manualSkin','manualRedEye','manualHair','manualEyes','webManualTeeth','webManualClothing','webManualBackground','webManualSpot','webLensShading','webManualLiquify','localLUTMask','colorRangeLevels','personalLook','bwEdgeManual','addShadowManual','sceneGeometry'].includes(k))||r.processingOrder.some(k=>!['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'].includes(k)))throw Error('UNSUPPORTED_WEB_ADJUSTMENT');
  if(extra.localLUTMask&&extra.postDecodeAdjustments?.color?.profile?.kind!=='local-lut')throw Error('LOCAL_LUT_MASK_PROFILE_REQUIRED');
  // The async Worker must first apply the freshly bound shadow composite to
  // its Original-equivalent frame. Pure rendering alone may never ignore a
  // saved Add Shadow document or silently render unshadowed pixels.
  if(Boolean(extra.addShadowManual)!==Boolean(addShadowApplied))
    throw Error('ADD_SHADOW_MANUAL_RUNTIME_REQUIRED');
  const hasBWEdgeManual=Object.hasOwn(extra,'bwEdgeManual');
  if(localSavedBW!==undefined&&(!hasBWEdgeManual||bwEdgeRuntime!==undefined||bwEdgeTarget!==undefined||typeof applyLocalSavedBW!=='function'))throw Error('LOCAL_SAVED_BW_RUNTIME_CONFLICT');
  if(hasBWEdgeManual&&localSavedBW===undefined&&(typeof applyBWEdgeManual!=='function'||!bwEdgeRuntime||
      !['proxy','source'].includes(bwEdgeTarget)))throw Error('BW_EDGE_MANUAL_RUNTIME_REQUIRED');
  const fixedOrder=['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'];
  if(r.processingOrder.some((stage,index)=>index>0&&fixedOrder.indexOf(stage)<fixedOrder.indexOf(r.processingOrder[index-1])))throw Error('UNSUPPORTED_WEB_PROCESSING_ORDER');
  if(Math.abs(r.exposure)>4||r.contrast>4||r.saturation>4)throw Error('WEB_ADJUSTMENT_LIMIT');
  const portrait=extra.portrait;
  if(portrait&&portrait.engineVersion!==WEB_ENGINE)throw Error('UNSUPPORTED_PORTRAIT_ENGINE');
  const matches=(portrait?reconcileTargets(portrait.targets,detections):[]).map(({target,detection})=>{
    if(target.adjustmentType!=='face_brightness'||!finite(target.value)||Math.abs(target.value)>4)throw Error('UNSUPPORTED_PERSON_ADJUSTMENT');
    return {detection,delta:2**target.value-1};
  });
  // Fixed transform estimated from the unedited Proxy: apply before the other
  // controls at either resolution, never re-estimate from the Final image.
  const rangeSource=p;
  if(extra.personalLook)p=applySavedPersonalLook(p,extra.personalLook,{signal});
  if(extra.postDecodeAdjustments?.color?.sceneMatch)
    p=applySceneMatch(p,extra.postDecodeAdjustments.color.sceneMatch,{signal});
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
    const {illuminant,whiteBalance,profile,sceneBasic,sceneMatch,calibration,selectiveColor,pointColor,levels,pointCurves,tonalBands,lumaCurve,grading,glow,...color}=extra.postDecodeAdjustments.color||{};
    const {grain,...detail}=extra.postDecodeAdjustments.detail||{};
    if(illuminant&&whiteBalance)throw Error('WHITE_BALANCE_ILLUMINANT_CONFLICT');
    // Auto/selector gains were estimated once from the original Proxy. The
    // normal Preview and original-resolution Final apply the saved values;
    // neither pass performs a new gray-world or neutral-patch estimate.
    if(whiteBalance)pixels=applyWhiteBalance(pixels,whiteBalance,{signal});
    if(illuminant)pixels=applyWhiteBalance(pixels,estimateWhiteBalance(pixels,{mode:illuminant},{signal}),{signal});
    if(profile?.kind==='local-lut'){
      if(!localLUT?.lut||!localLUT.lutRef)throw Error('LOCAL_LUT_RUNTIME_REQUIRED');
      if(localLUT.lutRef.sha256!==profile.lutRef.sha256||
          localLUT.lutRef.byteLength!==profile.lutRef.byteLength)throw Error('LOCAL_LUT_RUNTIME_MISMATCH');
      const graded=applyColorProfile(pixels,{kind:'lut',intensity:profile.intensity,lut:localLUT.lut},{signal});
      pixels=extra.localLUTMask?blendLocalLUTMask(pixels,graded,extra.localLUTMask,{signal}):graded;
    }else if(profile)pixels=applyColorProfile(pixels,profile,{signal});
    if(sceneBasic)pixels=applySceneBasic(pixels,sceneBasic,{signal});
    pixels=applyColorAdjustments(pixels,color,{signal});
    // Primary calibration follows global color controls, before per-channel
    // Levels/curves, so those later controls grade the calibrated result.
    if(calibration)pixels=applyColorCalibration(pixels,calibration,{signal});
    // Selective Color works from the globally adjusted/calibrated RGB. Tone
    // remapping (Levels/Point Curves) grades its output afterward.
    if(selectiveColor)pixels=applySelectiveColor(pixels,selectiveColor,{signal});
    if(pointColor)pixels=applyPointColorForRender(pixels,pointColor.selections,{amount:pointColor.amount,signal});
    if(levels)pixels=applyLevels(pixels,levels,{signal});
    if(pointCurves)pixels=applyPointCurves(pixels,pointCurves,{signal});
    if(tonalBands||lumaCurve){
      if(Object.values(tonalBands??{}).some(v=>v!==0)&&Object.values(color.toneCurve??{}).some(v=>v!==0))throw Error('TONAL_BANDS_LEGACY_CURVE_CONFLICT');
      // RGB/master curves were already applied above. Pass no rgb here:
      // tonal bands and optional luminance curve share exactly one evaluation.
      pixels=applyExtendedCurves(pixels,{...(tonalBands?{tonalBands}:{}),...(lumaCurve?{luma:lumaCurve}:{})},{signal});
    }
    if(grading)pixels=applyColorGrading(pixels,grading,{signal});
    // Pass the complete saved control object to Glow. The processor preserves
    // the legacy three-control branch byte-for-byte; extended controls select
    // the new mode renderer. The preview-only Glow Mask is never composited
    // into Final pixels here.
    if(glow)pixels=applyGlow(pixels,glow,{signal});
    pixels=applyDetailAdjustments(pixels,detail,{signal});
    if(grain){
      const {seed,...grainSettings}=grain;
      // Keep old Amount+Seed Recipes on the numeric API byte-for-byte. Only
      // Recipes carrying tonal/texture controls enter the object API.
      const extended=Object.keys(grainSettings).some(key=>key!=='amount');
      pixels=applyGrain(pixels,extended?grainSettings:grain.amount,{seed,signal});
    }
  }else if(r.processingOrder.includes('postDecodeAdjustments'))throw Error('INVALID_POST_DECODE_ADJUSTMENTS');
  if(extra.colorRangeLevels)pixels=applyColorRangeLevels(pixels,rangeSource,extra.colorRangeLevels,{signal});
  if(extra.webDepthRange)pixels=applyWebDepthRange(pixels,extra.webDepthRange,{signal});
  if(extra.manualClone)pixels=applyManualClone(pixels,extra.manualClone,{signal});
  if(extra.manualSkin)pixels=applyManualSkin(pixels,extra.manualSkin,{signal});
  if(extra.manualRedEye)pixels=applyManualRedEye(pixels,extra.manualRedEye,{signal});
  if(extra.manualEyes)pixels=applyManualEyes(pixels,extra.manualEyes,{signal});
  if(extra.manualHair)pixels=applyManualHair(pixels,extra.manualHair,{signal});
  if(extra.webManualTeeth)pixels=applyWebManualTeeth(pixels,extra.webManualTeeth,{signal});
  if(extra.webManualClothing)pixels=applyWebManualClothing(pixels,extra.webManualClothing,{signal});
  if(extra.webManualBackground)pixels=applyWebManualBackground(pixels,extra.webManualBackground,{signal});
  if(extra.webManualSpot)pixels=applyWebManualSpot(pixels,extra.webManualSpot,{signal});
  if(extra.webLensShading)pixels=applyWebLensShading(pixels,extra.webLensShading,{signal});
  if(extra.manualMakeup)pixels=applyManualMakeup(pixels,extra.manualMakeup,{signal});
  if(extra.localLevels){
    const local=extra.localLevels;
    if(local.schemaVersion!==1||local.engineVersion!=='suite-srgb8-local-levels-coverage-1'||
        local.brushVersion!=='suite-normalized-coverage-brush-1')throw Error('INVALID_LOCAL_LEVELS');
    const mask=rasterizeLocalBrushMask({width:pixels.width,height:pixels.height,strokes:local.strokes,signal});
    pixels=applyLocalLevels(pixels,mask,local.levels,{signal});
  }
  // The saved two-role stroke document is an implicit pre-rotation/crop stage.
  // Keep the legacy processingOrder and all legacy pixels unchanged. The Worker
  // checks binding/provenance; actual authority must come from an authenticated
  // Session/API caller, never from this hook or a claimed allowed flag.
  if(hasBWEdgeManual)pixels=localSavedBW!==undefined?
    applyLocalSavedBW({...pixels,sourceWidth:source.width,sourceHeight:source.height},extra.bwEdgeManual,localSavedBW,{signal}):
    applyBWEdgeManual(pixels,extra.bwEdgeManual,bwEdgeRuntime,{target:bwEdgeTarget,signal});
  // Deform all source-space brush results together, before projective geometry.
  // Retain the actual applied field separately: later spatial stages must not
  // reinterpret it as a field over their cropped/expanded output dimensions.
  let liquifyField;
  if(extra.webManualLiquify){
    const warped=applyWebManualLiquify(pixels,extra.webManualLiquify,{signal});
    pixels=warped.pixels;liquifyField=warped.field;
  }
  if(extra.webLensShading)pixels=applyWebLensGeometry(pixels,extra.webLensShading,{signal});
  if(extra.sceneGeometry){
    const inverse=sceneGeometryInverse(extra.sceneGeometry,source.width/source.height);
    // All face and source-normalized manual masks have already been applied.
    // Preserve canonical dimensions even if a manual processor omits metadata.
    pixels=warpScene({...pixels,sourceWidth:source.width,sourceHeight:source.height},inverse,{signal});
  }
  checkAbort(signal);
  const composed=rotateCropPixels(pixels,r.rotationDegrees,extra.crop,{resolutionAssessment,signal});
  const postCrop=extra.postCropAdjustments;
  if(!postCrop)return liquifyField?{...composed,liquifyField}:composed;
  if(postCrop.schemaVersion!==1||postCrop.engineVersion!=='suite-srgb8-manual-vignette-1'||!postCrop.vignette)
    throw Error('INVALID_POST_CROP_ADJUSTMENTS');
  const finished=applyVignette(composed,postCrop.vignette,{signal});
  return liquifyField?{...finished,liquifyField}:finished;
}
