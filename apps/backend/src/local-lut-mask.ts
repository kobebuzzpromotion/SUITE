import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';

export interface LocalLUTMask {
  schemaVersion:1;
  engineVersion:'suite-local-lut-mask-1';
  brushVersion:ManualMakeupBrush['brushVersion'];
  strokes:ManualMakeupBrush['strokes'];
  invert:boolean;
}
function fail():never{throw Error('INVALID_LOCAL_LUT_MASK');}
/** Coverage only; LUT identity/intensity remain in the existing profile. */
export function validateLocalLUTMask(value:unknown):asserts value is LocalLUTMask{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','brushVersion','strokes','invert'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-local-lut-mask-1'||doc.brushVersion!=='suite-normalized-coverage-brush-1'||typeof doc.invert!=='boolean')fail();
  const strokes=doc.strokes;
  if(!Array.isArray(strokes)||strokes.length>64||Reflect.ownKeys(strokes).length!==strokes.length+1)fail();
  for(let i=0;i<strokes.length;i++){const d=Object.getOwnPropertyDescriptor(strokes,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  // The shared strict brush validator requires at least one stroke; the empty
  // case here deliberately means none/all according to invert, not bad input.
  if(strokes.length)try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes,color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
