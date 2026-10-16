import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export interface WebManualLiquify {
  schemaVersion:1;
  engineVersion:'suite-web-manual-liquify-1';
  operations:{type:'translate'|'scale'|'scaleX'|'scaleY'|'rotate'|'restore';center:{x:number;y:number};rx:number;ry:number;amount:number;dx:number;dy:number;angle:number}[];
  freezeStrokes:ManualMakeupBrush['strokes'];
}
function fail():never{throw Error('INVALID_WEB_MANUAL_LIQUIFY');}
function record(v:unknown,keys:string[]):asserts v is Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)fail();
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
}
function array(v:unknown,max:number):asserts v is unknown[]{
  if(!Array.isArray(v)||v.length>max||Reflect.ownKeys(v).length!==v.length+1)fail();
  for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
}
const number=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateWebManualLiquify(value:unknown):asserts value is WebManualLiquify{
  record(value,['schemaVersion','engineVersion','operations','freezeStrokes']);
  if(value.schemaVersion!==1||value.engineVersion!=='suite-web-manual-liquify-1')fail();
  array(value.operations,128);
  for(const op of value.operations){
    record(op,['type','center','rx','ry','amount','dx','dy','angle']);
    if(!['translate','scale','scaleX','scaleY','rotate','restore'].includes(op.type as string))fail();
    record(op.center,['x','y']);if(!number(op.center.x,0,1)||!number(op.center.y,0,1))fail();
    if(!number(op.rx,0,1)||op.rx===0||!number(op.ry,0,1)||op.ry===0)fail();
    for(const k of ['amount','dx','dy','angle'])if(!number(op[k],-1,1))fail();
  }
  array(value.freezeStrokes,64);
  if(value.freezeStrokes.length)try{validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:'suite-normalized-coverage-brush-1',
    strokes:value.freezeStrokes,color:{r:0,g:0,b:0},opacity:0});}catch{fail();}
}
