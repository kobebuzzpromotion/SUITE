import {assertPixels,sourceDimensions,checkAbort} from './pure.mjs';
import {rasterizeSubjectStrokes,assertSubjectStrokeWork} from './subject-mask-authoring.mjs';
import {applyBlackWhiteEdgeManualArea} from './bw-edge-manual-area.mjs';

const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const canonical=v=>JSON.stringify(sort(v));
const KEYS=['document','assetID','originalSHA256','sourceWidth','sourceHeight','target'];
/** Structural pixel binding only. Not authorization; the BrowserLocal host
 * must independently verify its actual history, bytes and revocable consent. */
export function validateLocalSavedBW(pixels,document,local,{signal}={}) {
  checkAbort(signal);assertPixels(pixels);
  if(!local||![Object.prototype,null].includes(Object.getPrototypeOf(local))||
      Reflect.ownKeys(local).length!==KEYS.length||!KEYS.every(k=>Object.hasOwn(local,k))||
      !['source','proxy'].includes(local.target)||!document||canonical(document)!==canonical(local.document))throw Error('LOCAL_SAVED_BW_DOCUMENT_MISMATCH');
  const b=document.binding,d=sourceDimensions(pixels);
  if(!b||b.assetID!==local.assetID||typeof local.originalSHA256!=='string'||
      b.originalSHA256?.toLowerCase()!==local.originalSHA256.toLowerCase()||
      b.sourceWidth!==local.sourceWidth||b.sourceHeight!==local.sourceHeight||
      !Number.isSafeInteger(local.sourceWidth)||!Number.isSafeInteger(local.sourceHeight)||
      local.sourceWidth<1||local.sourceHeight<1||local.sourceWidth*local.sourceHeight>8_000_000||
      d.width!==local.sourceWidth||d.height!==local.sourceHeight)throw Error('LOCAL_SAVED_BW_BINDING_MISMATCH');
  const scale=local.target==='source'?1:Math.min(1,1600/Math.max(local.sourceWidth,local.sourceHeight));
  if(pixels.width!==Math.max(1,Math.round(local.sourceWidth*scale))||pixels.height!==Math.max(1,Math.round(local.sourceHeight*scale)))throw Error('LOCAL_SAVED_BW_DIMENSIONS_MISMATCH');
  return local;
}

/** Same pre-geometry stage and existing two-role BW arithmetic; no fake proof. */
export function applyLocalSavedBW(pixels,document,local,{signal}={}) {
  validateLocalSavedBW(pixels,document,local,{signal});
  assertSubjectStrokeWork([document.subjectStrokes,document.correctionStrokes],pixels.width,pixels.height,{signal});
  const subject=rasterizeSubjectStrokes(pixels,document.subjectStrokes,{signal});
  const correction=rasterizeSubjectStrokes(pixels,document.correctionStrokes,{signal});
  return applyBlackWhiteEdgeManualArea(pixels,subject,correction,{signal});
}
