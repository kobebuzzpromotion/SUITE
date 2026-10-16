export interface WebDepthRange {
  schemaVersion:1;engineVersion:'suite-web-depth-range-1';assetID:string;sourceSHA256:string;
  sourceWidth:number;sourceHeight:number;
  depth:{width:number;height:number;data:number[];validity:number[]};
  edges:number[];invert:boolean;basic:{exposure:number;contrast:number;saturation:number};
}
function fail():never{throw Error('INVALID_WEB_DEPTH_RANGE');}
function exact(v:unknown,keys:string[]):asserts v is Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)fail();
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
}
function number(v:unknown,lo:number,hi:number):asserts v is number{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)fail();}
function dimensions(w:unknown,h:unknown,max:number){number(w,1,max);number(h,1,max);if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w*h>max)fail();}
function dense(v:unknown,length:number):asserts v is number[]{
  if(!Array.isArray(v)||v.length!==length||Reflect.ownKeys(v).length!==length+1)fail();
  for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();number(d.value,0,1);}
}
export function validateWebDepthRange(value:unknown):asserts value is WebDepthRange{
  exact(value,['schemaVersion','engineVersion','assetID','sourceSHA256','sourceWidth','sourceHeight','depth','edges','invert','basic']);
  if(value.schemaVersion!==1||value.engineVersion!=='suite-web-depth-range-1'||typeof value.assetID!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.assetID)||
    typeof value.sourceSHA256!=='string'||!/^[0-9a-f]{64}$/.test(value.sourceSHA256)||typeof value.invert!=='boolean')fail();
  dimensions(value.sourceWidth,value.sourceHeight,96_000_000);
  exact(value.depth,['width','height','data','validity']);dimensions(value.depth.width,value.depth.height,65536);
  const size=(value.depth.width as number)*(value.depth.height as number);
  dense(value.depth.data,size);dense(value.depth.validity,size);
  if(value.depth.validity.some(v=>v!==0&&v!==1))fail();
  dense(value.edges,4);const edges=value.edges;if(edges.some((v,i)=>i>0&&v<edges[i-1]!))fail();
  exact(value.basic,['exposure','contrast','saturation']);number(value.basic.exposure,-4,4);number(value.basic.contrast,-100,100);number(value.basic.saturation,-100,100);
}
export function assertWebDepthRangeBinding(document:unknown,binding:{assetID:string;sourceSHA256:string;sourceWidth:number;sourceHeight:number}):asserts document is WebDepthRange{
  validateWebDepthRange(document);
  if(!binding||document.assetID!==binding.assetID||document.sourceSHA256!==binding.sourceSHA256||
    document.sourceWidth!==binding.sourceWidth||document.sourceHeight!==binding.sourceHeight)throw Error('WEB_DEPTH_RANGE_BINDING_MISMATCH');
}
