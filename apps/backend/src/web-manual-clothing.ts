import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface WebManualClothing {
  schemaVersion:1;
  engineVersion:'suite-web-manual-clothing-1';
  brushVersion:ManualMakeupBrush['brushVersion'];
  strokes:ManualMakeupBrush['strokes'];
  dewrinkle:number;
  fineWrinkles:number;
  coarseWrinkles:number;
  radius:number;
}
function fail():never {throw Error('INVALID_WEB_MANUAL_CLOTHING');}
export function validateWebManualClothing(value:unknown):asserts value is WebManualClothing {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const keys=['schemaVersion','engineVersion','brushVersion','strokes','dewrinkle','fineWrinkles','coarseWrinkles','radius'];
  if(Reflect.ownKeys(value).length!==keys.length)fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
  const doc=value as Record<string,unknown>;
  if(doc.schemaVersion!==1||doc.engineVersion!=='suite-web-manual-clothing-1'||doc.brushVersion!=='suite-normalized-coverage-brush-1')fail();
  for(const key of ['dewrinkle','fineWrinkles','coarseWrinkles']){const n=doc[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)fail();}
  if(doc.dewrinkle===0&&(doc.fineWrinkles!==0||doc.coarseWrinkles!==0))fail();
  if(typeof doc.radius!=='number'||!Number.isInteger(doc.radius)||doc.radius<1||doc.radius>32)fail();
  try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:doc.brushVersion,
    strokes:doc.strokes,color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
