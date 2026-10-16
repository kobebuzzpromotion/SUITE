import {mapPreviewClick} from './preview-coordinate.mjs';
import {MAX_PIXELS} from './processing/pure.mjs';
import {projectCanvasExpansion} from './processing/canvas-expand-projection.mjs';
import {sceneGeometryInverse} from './processing/scene-geometry-contract.mjs';
import {certifyLiquifyField,liquifyOutputToSource,liquifySourceToOutput} from './processing/web-manual-liquify-map.mjs';
import {createLensCoordinateMap,lensOutputToSource,lensSourceToOutput} from './processing/lens-coordinate.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const floorProjection = value => Math.floor(value + 1e-9);
const clampUnit = value => Math.max(0, Math.min(1, value));
const insideUnit = value => value >= -1e-12 && value <= 1 + 1e-12;

function inverseMatrix(m) {
  const [a,b,c,d,e,f,g,h,i]=m;
  const A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
  if(!finite(det)||Math.abs(det)<1e-12)throw Error('LOCAL_BRUSH_SCENE_SINGULAR');
  const result=[A,c*h-b*i,b*f-c*e,B,a*i-c*g,c*d-a*f,C,b*g-a*h,a*e-b*d].map(value=>value/det);
  if(result.some(value=>!finite(value)))throw Error('LOCAL_BRUSH_SCENE_MATRIX');
  return result;
}

function projectPoint(matrix,x,y) {
  if(!matrix)return {x,y};
  const denominator=matrix[6]*x+matrix[7]*y+matrix[8];
  if(!finite(denominator)||Math.abs(denominator)<1e-8)throw Error('LOCAL_BRUSH_SCENE_HORIZON');
  const u=(matrix[0]*x+matrix[1]*y+matrix[2])/denominator;
  const v=(matrix[3]*x+matrix[4]*y+matrix[5])/denominator;
  if(!finite(u)||!finite(v)||!insideUnit(u)||!insideUnit(v))throw Error('LOCAL_BRUSH_SCENE_OUTSIDE_CONTENT');
  return {x:clampUnit(u),y:clampUnit(v)};
}

function geometry({naturalWidth, naturalHeight, uprightWidth, uprightHeight,
  rotationDegrees = 0, crop, canvasExpand, sceneGeometry, sourceWidth, sourceHeight, liquifyField, lensGeometry}) {
  if (!Number.isSafeInteger(uprightWidth) || !Number.isSafeInteger(uprightHeight) ||
      uprightWidth < 1 || uprightHeight < 1 || uprightWidth * uprightHeight > MAX_PIXELS)
    throw Error('LOCAL_BRUSH_SOURCE_DIMENSIONS_INVALID');
  if (!Number.isSafeInteger(rotationDegrees) || rotationDegrees % 90 !== 0)
    throw Error('LOCAL_BRUSH_ROTATION_INVALID');
  if(liquifyField!==undefined){
    if(liquifyField?.width!==uprightWidth||liquifyField?.height!==uprightHeight)throw Error('LOCAL_BRUSH_LIQUIFY_FRAME_MISMATCH');
    certifyLiquifyField(liquifyField);
  }
  // The lens raster is the upright processing Proxy, not Original metadata.
  // Shared core verifies invertibility and all RGB donors, using green as the
  // scalar-mask coordinate reference. Shading-only legacy settings are identity.
  const lensMap=lensGeometry===undefined?null:createLensCoordinateMap(lensGeometry,uprightWidth,uprightHeight);
  let sceneInverse=null,sceneForward=null;
  if(sceneGeometry!==undefined){
    // Proxy rounding must not change the homography's physical aspect ratio.
    // Callers must supply canonical Original dimensions for this new path.
    if(!Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight)||sourceWidth<1||sourceHeight<1)
      throw Error('LOCAL_BRUSH_SCENE_SOURCE_DIMENSIONS_REQUIRED');
    sceneInverse=sceneGeometryInverse(sceneGeometry,sourceWidth/sourceHeight);
    if(!Array.isArray(sceneInverse)||sceneInverse.length!==9||sceneInverse.some(value=>!finite(value)))
      throw Error('LOCAL_BRUSH_SCENE_MATRIX');
    sceneForward=inverseMatrix(sceneInverse);
  }
  const turns = ((rotationDegrees / 90) % 4 + 4) % 4;
  const rotatedWidth = turns % 2 ? uprightHeight : uprightWidth;
  const rotatedHeight = turns % 2 ? uprightWidth : uprightHeight;
  let left = 0, top = 0, width = rotatedWidth, height = rotatedHeight;
  if (crop !== undefined && crop !== null) {
    const rect = crop?.crop_rect;
    if (!rect || typeof rect !== 'object' || Array.isArray(rect) ||
        !['x', 'y', 'width', 'height'].every(key => finite(rect[key])) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
        rect.x + rect.width > 1 + 1e-12 || rect.y + rect.height > 1 + 1e-12 ||
        crop.rotation !== rotationDegrees)
      throw Error('LOCAL_BRUSH_CROP_INVALID');
    left = floorProjection(rect.x * rotatedWidth);
    top = floorProjection(rect.y * rotatedHeight);
    width = floorProjection(rect.width * rotatedWidth);
    height = floorProjection(rect.height * rotatedHeight);
    if (width < 1 || height < 1 || left < 0 || top < 0 ||
        left + width > rotatedWidth || top + height > rotatedHeight)
      throw Error('LOCAL_BRUSH_CROP_PROJECTION_INVALID');
  }
  // Worker expands the already rotated/cropped frame. Use its exact rounded
  // Proxy/Final margin projection, never the canonical Original dimensions.
  const margins = canvasExpand === undefined || canvasExpand === null ?
    {left: 0, right: 0, top: 0, bottom: 0} :
    projectCanvasExpansion({width, height}, canvasExpand).margins;
  if (naturalWidth !== width + margins.left + margins.right ||
      naturalHeight !== height + margins.top + margins.bottom)
    throw Error('LOCAL_BRUSH_AFTER_DIMENSIONS_MISMATCH');
  return {turns, rotatedWidth, rotatedHeight, left, top, width, height, margins,
    naturalWidth, naturalHeight,sceneInverse,sceneForward,liquifyField,lensMap};
}

function sourceFromAfter(afterX, afterY, frame) {
  if (!finite(afterX) || !finite(afterY) || !insideUnit(afterX) || !insideUnit(afterY))
    throw Error('LOCAL_BRUSH_AFTER_POINT_INVALID');
  const cropX = afterX * frame.naturalWidth - frame.margins.left;
  const cropY = afterY * frame.naturalHeight - frame.margins.top;
  if (cropX < -1e-12 || cropX > frame.width + 1e-12 ||
      cropY < -1e-12 || cropY > frame.height + 1e-12)
    throw Error('LOCAL_BRUSH_OUTSIDE_IMAGE_CONTENT');
  const rx = (frame.left + Math.max(0, Math.min(frame.width, cropX))) / frame.rotatedWidth;
  const ry = (frame.top + Math.max(0, Math.min(frame.height, cropY))) / frame.rotatedHeight;
  const x = [rx, 1 - ry, 1 - rx, ry][frame.turns];
  const y = [ry, rx, 1 - ry, 1 - rx][frame.turns];
  if (!insideUnit(x) || !insideUnit(y)) throw Error('LOCAL_BRUSH_POINT_OUTSIDE_SOURCE');
  // Undo margins -> crop -> rotation -> homography -> lens -> actual Liquify.
  let source=projectPoint(frame.sceneInverse,clampUnit(x),clampUnit(y));
  if(frame.lensMap)source=lensOutputToSource(frame.lensMap,source);
  return Object.freeze(frame.liquifyField?liquifyOutputToSource(frame.liquifyField,source):source);
}

/** After contain CSS pointer -> pre-rotation/pre-Crop source-normalized point. */
export function mapAfterToLocalBrushPoint({afterRect, beforeRect, naturalWidth, naturalHeight,
  clientX, clientY, view = 'after', uprightWidth, uprightHeight,
  rotationDegrees = 0, crop, canvasExpand, sceneGeometry, sourceWidth, sourceHeight, liquifyField, lensGeometry} = {}) {
  const frame = geometry({naturalWidth, naturalHeight, uprightWidth, uprightHeight,
    rotationDegrees, crop, canvasExpand,sceneGeometry,sourceWidth,sourceHeight,liquifyField,lensGeometry});
  const after = mapPreviewClick({afterRect, beforeRect, naturalWidth, naturalHeight,
    clientX, clientY, view});
  return sourceFromAfter(after.x, after.y, frame);
}

/** Keyboard/focus After-normalized point -> source-normalized point; no CSS box. */
export function mapAfterImagePointToLocalBrushPoint({afterX, afterY, naturalWidth,
  naturalHeight, view = 'after', uprightWidth, uprightHeight, rotationDegrees = 0,
  crop, canvasExpand, sceneGeometry, sourceWidth, sourceHeight, liquifyField, lensGeometry} = {}) {
  if (view !== 'after' && view !== 'split') throw Error('PREVIEW_AFTER_REQUIRED');
  const frame = geometry({naturalWidth, naturalHeight, uprightWidth, uprightHeight,
    rotationDegrees, crop, canvasExpand,sceneGeometry,sourceWidth,sourceHeight,liquifyField,lensGeometry});
  return sourceFromAfter(afterX, afterY, frame);
}

/** Saved source-normalized stroke point -> After contain CSS position. */
export function mapLocalBrushPointToAfter({x, y, afterRect, beforeRect, naturalWidth,
  naturalHeight, view = 'after', uprightWidth, uprightHeight, rotationDegrees = 0,
  crop, canvasExpand, sceneGeometry, sourceWidth, sourceHeight, liquifyField, lensGeometry} = {}) {
  if (!finite(x) || !finite(y) || !insideUnit(x) || !insideUnit(y))
    throw Error('LOCAL_BRUSH_SOURCE_POINT_INVALID');
  const frame = geometry({naturalWidth, naturalHeight, uprightWidth, uprightHeight,
    rotationDegrees, crop, canvasExpand,sceneGeometry,sourceWidth,sourceHeight,liquifyField,lensGeometry});
  // Forward actual Liquify -> lens -> homography -> rotation/crop/margins.
  if(frame.liquifyField)({x,y}=liquifySourceToOutput(frame.liquifyField,{x,y}));
  if(frame.lensMap)({x,y}=lensSourceToOutput(frame.lensMap,{x,y}));
  ({x,y}=projectPoint(frame.sceneForward,x,y));
  const rx = [x, y, 1 - x, 1 - y][frame.turns];
  const ry = [y, 1 - x, 1 - y, x][frame.turns];
  const cropX = rx * frame.rotatedWidth - frame.left;
  const cropY = ry * frame.rotatedHeight - frame.top;
  if (cropX < -1e-12 || cropX > frame.width + 1e-12 ||
      cropY < -1e-12 || cropY > frame.height + 1e-12)
    throw Error('LOCAL_BRUSH_OUTSIDE_CROP');
  const afterX = (frame.margins.left + cropX) / naturalWidth;
  const afterY = (frame.margins.top + cropY) / naturalHeight;
  const scale = Math.min(afterRect?.width / naturalWidth, afterRect?.height / naturalHeight);
  const clientX = afterRect?.left + (afterRect.width - naturalWidth * scale) / 2 +
    afterX * naturalWidth * scale;
  const clientY = afterRect?.top + (afterRect.height - naturalHeight * scale) / 2 +
    afterY * naturalHeight * scale;
  // Reuse existing Before/contain/stale-box checks for saved-stroke overlays.
  mapPreviewClick({afterRect, beforeRect, naturalWidth, naturalHeight,
    clientX, clientY, view});
  return Object.freeze({clientX, clientY, afterX, afterY});
}

/** One checked frame for exact source-mask projection; no requested field rebuild. */
export function createAfterToLocalBrushMapper(options){
  const frame=geometry(options);
  return (afterX,afterY)=>sourceFromAfter(afterX,afterY,frame);
}
