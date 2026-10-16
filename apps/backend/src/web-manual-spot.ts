import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface WebManualSpot {
  schemaVersion:1;
  engineVersion:'suite-web-manual-spot-1';
  brushVersion:ManualMakeupBrush['brushVersion'];
  defects:ManualMakeupBrush['strokes'];
  domain:ManualMakeupBrush['strokes'];
  strength:number;
  iterations:number;
}
function fail():never{throw Error('INVALID_WEB_MANUAL_SPOT');}
export function validateWebManualSpot(value:unknown):asserts value is WebManualSpot{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','brushVersion','defects','domain','strength','iterations'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-web-manual-spot-1'||doc.brushVersion!=='suite-normalized-coverage-brush-1'||
    typeof doc.strength!=='number'||!Number.isFinite(doc.strength)||doc.strength<0||doc.strength>1||
    typeof doc.iterations!=='number'||!Number.isInteger(doc.iterations)||doc.iterations<1||doc.iterations>64)fail();
  for(const key of ['defects','domain'])try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc[key],color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
