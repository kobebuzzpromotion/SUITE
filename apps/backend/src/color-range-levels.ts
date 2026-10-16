export type ColorRangeSelection={id:string;hue:null|{center:number;inner:number;outer:number};saturation:number[];lightness:number[];adjustment:{hue:0;saturation:0;lightness:0};enabled:boolean};
export type ColorRangeGradient={kind:'linear'|'radial';from:{x:number;y:number};to:{x:number;y:number};invert:boolean;operation:'intersect'|'add'|'subtract'};
export type ColorRangeLevels={schemaVersion:1;engineVersion:'suite-color-range-levels-1';selections:ColorRangeSelection[];invert:boolean;luminance?:{limits:number[];invert:boolean};brush?:ColorRangeBrush;gradient?:ColorRangeGradient;refinement?:{expand:number;contract:number;smooth:number;feather:number};basic?:{exposure:number;contrast:number;saturation:number};levels:{master:{inputBlack:number;inputWhite:number;gamma:number;outputBlack:number;outputWhite:number}}};
function fail():never{throw Error('INVALID_COLOR_RANGE_LEVELS');}
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  return Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value');});
}
const num=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function dense(v:unknown,min:number,max:number):v is unknown[]{return Array.isArray(v)&&v.length>=min&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean);}
function edges(v:unknown){if(!dense(v,4,4)||v.some((n,i)=>!num(n,0,1)||i>0&&Number(n)<Number(v[i-1])))fail();}
/** Saved display-sRGB selection only. No inferred semantic/person/depth mask. */
export function validateColorRangeLevelsV1(value:unknown):asserts value is ColorRangeLevels{
  const keys=['schemaVersion','engineVersion','selections','invert','levels'];
  if(!value||typeof value!=='object')fail();
  const optional=['luminance','brush','gradient','refinement','basic'].filter(key=>Object.hasOwn(value,key));
  if(!exact(value,[...keys,...optional]))fail();
  if(Object.hasOwn(value,'basic')){
    if(!exact(value.basic,['exposure','contrast','saturation'])||!num(value.basic.exposure,-4,4)||!num(value.basic.contrast,-100,100)||!num(value.basic.saturation,-100,100))fail();
  }
  if(Object.hasOwn(value,'refinement')){
    if(!exact(value.refinement,['expand','contract','smooth','feather'])||Object.values(value.refinement).some(n=>!num(n,0,64)||!Number.isInteger(n)))fail();
  }
  if(Object.hasOwn(value,'gradient')){
    const g=value.gradient;
    if(!exact(g,['kind','from','to','invert','operation'])||!['linear','radial'].includes(g.kind as string)||!['intersect','add','subtract'].includes(g.operation as string)||typeof g.invert!=='boolean')fail();
    for(const p of [g.from,g.to])if(!exact(p,['x','y'])||!num(p.x,0,1)||!num(p.y,0,1))fail();
    const a=g.from as {x:number;y:number},b=g.to as {x:number;y:number};
    if(a.x===b.x&&a.y===b.y)fail();
  }
  if(Object.hasOwn(value,'brush')){
    const b=value.brush;
    if(!exact(b,['brushVersion','operation','strokes'])||b.brushVersion!=='suite-normalized-coverage-brush-1'||!['add','subtract','intersect'].includes(b.operation as string))fail();
    // Validation adapter only: no makeup document is stored or rendered.
    validateManualMakeup({schemaVersion:1,engineVersion:'suite-manual-makeup-brush-1',brushVersion:b.brushVersion,
      strokes:b.strokes,color:{r:0,g:0,b:0},opacity:1});
  }
  if(Object.hasOwn(value,'luminance')){
    if(!exact(value.luminance,['limits','invert'])||typeof value.luminance.invert!=='boolean')fail();
    edges(value.luminance.limits);
  }
  if(value.schemaVersion!==1||value.engineVersion!=='suite-color-range-levels-1'||typeof value.invert!=='boolean'||!dense(value.selections,1,16))fail();
  const ids=new Set<string>();
  for(const s of value.selections){
    if(!exact(s,['id','hue','saturation','lightness','adjustment','enabled']))fail();
    if(typeof s.id!=='string'||!s.id||s.id.length>128||ids.has(s.id)||typeof s.enabled!=='boolean')fail();ids.add(s.id);
    if(s.hue!==null){if(!exact(s.hue,['center','inner','outer'])||!num(s.hue.center,0,360)||!num(s.hue.inner,0,180)||!num(s.hue.outer,Number(s.hue.inner),180))fail();}
    edges(s.saturation);edges(s.lightness);
    if(!exact(s.adjustment,['hue','saturation','lightness'])||Object.values(s.adjustment).some(n=>n!==0))fail();
  }
  if(!exact(value.levels,['master'])||!exact(value.levels.master,['inputBlack','inputWhite','gamma','outputBlack','outputWhite']))fail();
  const m=value.levels.master;
  for(const key of ['inputBlack','inputWhite','outputBlack','outputWhite'])if(!num(m[key],0,255)||!Number.isInteger(m[key]))fail();
  if(Number(m.inputBlack)>=Number(m.inputWhite)||Number(m.outputBlack)>Number(m.outputWhite)||!num(m.gamma,.1,10))fail();
}
import {validateManualMakeup,type ManualMakeupBrush} from './manual-makeup-brush.js';
export type ColorRangeBrush={brushVersion:'suite-normalized-coverage-brush-1';operation:'add'|'subtract'|'intersect';strokes:ManualMakeupBrush['strokes']};

export type ColorRangeLevelsV2={schemaVersion:2;engineVersion:'suite-color-range-levels-2';layers:{id:string;name:string;settings:ColorRangeLevels;enabled?:boolean}[]};
export type ColorRangeLevelsDocument=ColorRangeLevels|ColorRangeLevelsV2;
/** Ordered independent masks. Selection colors always use the same base image. */
export function validateColorRangeLevels(value:unknown):asserts value is ColorRangeLevelsDocument{
  if(!exact(value,['schemaVersion','engineVersion','layers'])){validateColorRangeLevelsV1(value);return;}
  if(value.schemaVersion!==2||value.engineVersion!=='suite-color-range-levels-2'||!dense(value.layers,1,8))fail();
  const ids=new Set<string>();let selections=0,strokes=0,points=0;
  for(const layer of value.layers){
    if(!exact(layer,['id','name','settings'])&&!exact(layer,['id','name','settings','enabled']))fail();
    if(Object.hasOwn(layer,'enabled')&&typeof layer.enabled!=='boolean')fail();
    if(typeof layer.id!=='string'||!(/^[A-Za-z0-9_-]{1,64}$/).test(layer.id)||ids.has(layer.id)||
        typeof layer.name!=='string'||layer.name.length<1||layer.name.length>40||!layer.name.trim()||/[\p{Cc}\p{Cf}]/u.test(layer.name))fail();
    ids.add(layer.id);validateColorRangeLevelsV1(layer.settings);
    selections+=layer.settings.selections.length;
    for(const stroke of layer.settings.brush?.strokes??[]){strokes++;points+=stroke.points.length;}
    if(selections>32||strokes>64||points>4096)fail();
  }
}
