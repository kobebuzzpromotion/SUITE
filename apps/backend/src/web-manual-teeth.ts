import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface WebManualTeeth {
  schemaVersion:1;
  engineVersion:'suite-web-manual-teeth-1';
  brushVersion:ManualMakeupBrush['brushVersion'];
  strokes:ManualMakeupBrush['strokes'];
  brightness:number;
  desaturation:number;
}
function fail():never {throw Error('INVALID_WEB_MANUAL_TEETH');}
export function validateWebManualTeeth(value:unknown):asserts value is WebManualTeeth {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','brushVersion','strokes','brightness','desaturation'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-web-manual-teeth-1'||doc.brushVersion!=='suite-normalized-coverage-brush-1')fail();
  if(typeof doc.brightness!=='number'||!Number.isFinite(doc.brightness)||doc.brightness< -100||doc.brightness>100||
    typeof doc.desaturation!=='number'||!Number.isFinite(doc.desaturation)||doc.desaturation<0||doc.desaturation>100)fail();
  try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc.strokes,color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
