import {validateManualMakeup, type ManualMakeupBrush} from './manual-makeup-brush.js';

export interface ManualRedEye {
  schemaVersion: 1;
  engineVersion: 'suite-manual-red-eye-1';
  brushVersion: ManualMakeupBrush['brushVersion'];
  strokes: ManualMakeupBrush['strokes'];
  amount: number;
}
function fail(): never {throw Error('INVALID_MANUAL_RED_EYE');}
export function validateManualRedEye(value: unknown): asserts value is ManualRedEye {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail();
  const keys = ['schemaVersion','engineVersion','brushVersion','strokes','amount'];
  if (Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) {const descriptor=Object.getOwnPropertyDescriptor(value,key);if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) fail();}
  const doc=value as Record<string,unknown>;
  if (doc.schemaVersion!==1 || doc.engineVersion!=='suite-manual-red-eye-1' || doc.brushVersion!=='suite-normalized-coverage-brush-1' ||
    typeof doc.amount!=='number' || !Number.isFinite(doc.amount) || doc.amount<0 || doc.amount>100) fail();
  // Reuse only the nonsemantic brush contract, never a person/consent assertion.
  try {validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc.strokes,color:{r:0,g:0,b:0},opacity:0});} catch {fail();}
}
