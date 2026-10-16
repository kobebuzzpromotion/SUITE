import {validateManualMakeup, type ManualMakeupBrush} from './manual-makeup-brush.js';

export interface ManualHair {
  schemaVersion: 1;
  engineVersion: 'suite-manual-hair-1';
  brushVersion: ManualMakeupBrush['brushVersion'];
  strokes: ManualMakeupBrush['strokes'];
  color: {r: number; g: number; b: number};
  amount: number;
  shine: number;
  smooth?: number;
  grayStrokes?: ManualMakeupBrush['strokes'];
  blacken?: number;
}
function fail(): never {throw Error('INVALID_MANUAL_HAIR');}
export function validateManualHair(value: unknown): asserts value is ManualHair {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail();
  const keys=['schemaVersion','engineVersion','brushVersion','strokes','color','amount','shine'];
  if (Object.hasOwn(value,'smooth')) keys.push('smooth');
  const grayPresent=Object.hasOwn(value,'grayStrokes'),blackenPresent=Object.hasOwn(value,'blacken');
  if (grayPresent!==blackenPresent) fail();
  if (grayPresent) keys.push('grayStrokes','blacken');
  if (Reflect.ownKeys(value).length!==keys.length) fail();
  for (const key of keys) {const descriptor=Object.getOwnPropertyDescriptor(value,key);if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) fail();}
  const doc=value as Record<string,unknown>;
  if (doc.schemaVersion!==1 || doc.engineVersion!=='suite-manual-hair-1' || doc.brushVersion!=='suite-normalized-coverage-brush-1') fail();
  for (const key of ['amount','shine',...(Object.hasOwn(doc,'smooth')?['smooth']:[]),...(grayPresent?['blacken']:[])]) {const n=doc[key];if (typeof n!=='number' || !Number.isFinite(n) || n<0 || n>100) fail();}
  // Reuse only ordinary brush/RGB validation; this conveys no anatomy or consent.
  try {validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc.strokes,color:doc.color,opacity:0});} catch {fail();}
  if (grayPresent) {
    if (!Array.isArray(doc.grayStrokes)) fail();
    if (doc.grayStrokes.length===0) {
      if (doc.blacken!==0 || Reflect.ownKeys(doc.grayStrokes).length!==1) fail();
    } else {
      try {validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
        strokes:doc.grayStrokes,color:doc.color,opacity:0});} catch {fail();}
    }
    const hair=doc.strokes as ManualMakeupBrush['strokes'],gray=doc.grayStrokes as ManualMakeupBrush['strokes'];
    if (hair.length+gray.length>64 || [...hair,...gray].reduce((sum,stroke)=>sum+stroke.points.length,0)>4096) fail();
  }
}
