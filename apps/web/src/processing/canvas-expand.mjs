import {assertPixels,checkAbort,MAX_PIXELS,MAX_SOURCE_PIXELS} from './pure.mjs';

export const MAX_CANVAS_EDGE=16_384;
export const MAX_CANVAS_PIXELS=MAX_PIXELS;
export const MAX_CANVAS_WORKING_BYTES=256*1024*1024;

const validInt=value=>Number.isSafeInteger(value)&&value>=0;
const validDimension=value=>Number.isSafeInteger(value)&&value>=1;

function sourceFrame(source,maxPixels=MAX_PIXELS){
  if(!source||!validDimension(source.width)||!validDimension(source.height)||!Number.isSafeInteger(source.width*source.height)||source.width*source.height>maxPixels)throw Error('CANVAS_SOURCE_DIMENSIONS_INVALID');
  return {width:source.width,height:source.height};
}

function checkBackground(value){
  if(!Array.isArray(value)&&!(value instanceof Uint8ClampedArray))throw Error('CANVAS_BACKGROUND_INVALID');
  if(value.length!==4||!Array.from(value).every(channel=>Number.isSafeInteger(channel)&&channel>=0&&channel<=255))throw Error('CANVAS_BACKGROUND_INVALID');
  return Object.freeze(Array.from(value));
}

function anchoredOffset(spare,position,axis){
  const positions=axis==='x'?['left','center','right']:['top','center','bottom'];
  if(!positions.includes(position))throw Error('CANVAS_ANCHOR_INVALID');
  return position===positions[0]?0:position===positions[1]?Math.floor(spare/2):spare;
}

/**
 * Plan a flat-color manual canvas expansion. Margins and target-size+anchor are
 * mutually exclusive. The source frame is copied at {x,y}; no content is
 * synthesized, rescaled or composited, and RAW/Recipe are never modified.
 */
export function planCanvasExpansion(source,options){
  sourceFrame(source); // Actual-buffer planning retains its original 24MP gate.
  const {unsupportedReasons,...plan}=planCanvasExpansionGeometry(source,options);
  if(unsupportedReasons.length)throw Error(unsupportedReasons[0]);
  return Object.freeze(plan);
}

/** Allocation-free integer geometry for canonical-source readouts only.
 * A returned plan is NOT permission/capability to render or export pixels.
 * Actual allocation callers must still use planCanvasExpansion. */
export function planCanvasExpansionGeometry(source,options){
  const original=sourceFrame(source,MAX_SOURCE_PIXELS);
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error('CANVAS_SETTINGS_INVALID');
  const usesMargins=Object.hasOwn(options,'margins');
  const usesTarget=Object.hasOwn(options,'width')||Object.hasOwn(options,'height');
  if(usesMargins===usesTarget)throw Error('CANVAS_SIZE_MODE_INVALID');
  const background=checkBackground(options.background??[0,0,0,0]);
  let width,height,x,y;
  if(usesMargins){
    if(Object.hasOwn(options,'anchor'))throw Error('CANVAS_SIZE_MODE_INVALID');
    const margins=options.margins;
    if(!margins||typeof margins!=='object'||Array.isArray(margins))throw Error('CANVAS_MARGINS_INVALID');
    const {left=0,right=0,top=0,bottom=0}=margins;
    if(![left,right,top,bottom].every(validInt))throw Error('CANVAS_MARGINS_INVALID');
    width=original.width+left+right;height=original.height+top+bottom;x=left;y=top;
  }else{
    width=options.width;height=options.height;
    if(!validDimension(width)||!validDimension(height)||width<original.width||height<original.height)throw Error('CANVAS_TARGET_INVALID');
    const anchor=options.anchor??{x:'center',y:'center'};
    if(!anchor||typeof anchor!=='object'||Array.isArray(anchor))throw Error('CANVAS_ANCHOR_INVALID');
    x=anchoredOffset(width-original.width,anchor.x??'center','x');
    y=anchoredOffset(height-original.height,anchor.y??'center','y');
  }
  if(!validDimension(width)||!validDimension(height)||!Number.isSafeInteger(width*height)||
      !Number.isSafeInteger((original.width*original.height+width*height)*4))throw Error('CANVAS_SIZE_LIMIT');
  const unsupportedReasons=[];
  if(original.width*original.height>MAX_PIXELS)unsupportedReasons.push('CANVAS_SOURCE_DIMENSIONS_INVALID');
  if(width>MAX_CANVAS_EDGE||height>MAX_CANVAS_EDGE||width*height>MAX_CANVAS_PIXELS)unsupportedReasons.push('CANVAS_SIZE_LIMIT');
  if((original.width*original.height+width*height)*4>MAX_CANVAS_WORKING_BYTES)unsupportedReasons.push('CANVAS_MEMORY_LIMIT');
  return Object.freeze({width,height,x,y,sourceWidth:original.width,sourceHeight:original.height,background,
    unsupportedReasons:Object.freeze(unsupportedReasons)});
}

/** Return a new RGBA8 canvas with the exact source pixels at the planned anchor. */
export function expandCanvasPixels(pixels,options,{signal}={}){
  assertPixels(pixels);checkAbort(signal);
  const plan=planCanvasExpansion(pixels,options),{width,height,x,y,sourceWidth,sourceHeight,background}=plan;
  let data;
  try{data=new Uint8ClampedArray(width*height*4);}catch{throw Error('CANVAS_ALLOCATION_FAILED');}
  if(background.some(channel=>channel!==0)){
    for(let row=0;row<height;row++){
      checkAbort(signal);
      for(let column=0;column<width;column++){
        if((column&4095)===0)checkAbort(signal);
        data.set(background,(row*width+column)*4);
      }
    }
  }
  for(let row=0;row<sourceHeight;row++){
    checkAbort(signal);
    const start=row*sourceWidth*4,end=start+sourceWidth*4;
    data.set(pixels.data.subarray(start,end),((row+y)*width+x)*4);
  }
  checkAbort(signal);
  return {width,height,data};
}
