import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface WebManualBackground {
  schemaVersion:1;
  engineVersion:'suite-web-manual-background-1';
  brushVersion:ManualMakeupBrush['brushVersion'];
  strokes:ManualMakeupBrush['strokes'];
  lighting:number;
  banding:number;
}
function fail():never {throw Error('INVALID_WEB_MANUAL_BACKGROUND');}
export function validateWebManualBackground(value:unknown):asserts value is WebManualBackground {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','brushVersion','strokes','lighting','banding'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-web-manual-background-1'||doc.brushVersion!=='suite-normalized-coverage-brush-1')fail();
  for(const key of ['lighting','banding']){const n=doc[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)fail();}
  try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc.strokes,color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
