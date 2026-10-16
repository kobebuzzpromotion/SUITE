import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';
import {authorSubjectMask,SUBJECT_MASK_MAX_WORK} from './subject-mask-authoring.mjs';
import {MANUAL_EYESHADOW_COLOR_VERSION,MANUAL_EYESHADOW_MAX_PIXELS} from
  './manual-eyeshadow-color.mjs';

export const MANUAL_EYESHADOW_MASK_RUNTIME_VERSION=
  'suite-manual-eyeshadow-three-role-mask-runtime-1';
export {SUBJECT_MASK_MAX_WORK as MANUAL_EYESHADOW_MASK_MAX_WORK};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const ROLES=['eyeArea','irisProtect','pupilProtect'];
const PROXY_MAX_EDGE=1600,MAX_STROKES=64,MAX_POINTS=4096,MAX_JSON_BYTES=96*1024;
const ROLE_PROOFS={
  eyeArea:{kind:'manual-eyeshadow-eye-area-mask',
    source:'owner-manual-eyeshadow-coverage'},
  irisProtect:{kind:'manual-eyeshadow-iris-exclusion-mask',
    source:'owner-manual-iris-exclusion-coverage'},
  pupilProtect:{kind:'manual-eyeshadow-pupil-exclusion-mask',
    source:'owner-manual-pupil-exclusion-coverage'}
};

function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===null||proto===Object.prototype||
    (Object.getPrototypeOf(proto)===null&&
      Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return record(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
    });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  for(let index=0;index<value.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  !Object.is(value,-0)&&value>=0&&value<=1;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function validateDocument(input,signal){
  if(!exact(input,['schemaVersion','engineVersion','representation','binding',
    'eye','strokes','settings'])||input.schemaVersion!==1||
      input.engineVersion!==MANUAL_EYESHADOW_COLOR_VERSION||
      input.representation!=='normalized-owner-manual-eye-area-protections-v1'||
      !['image-left','image-right'].includes(input.eye))
    throw Error('MANUAL_EYESHADOW_DOCUMENT_INVALID');
  const bound=input.binding;
  if(!exact(bound,['assetID','originalSHA256','personID',
    'sourceWidth','sourceHeight'])||
      typeof bound.assetID!=='string'||!UUID.test(bound.assetID)||
      typeof bound.originalSHA256!=='string'||!SHA.test(bound.originalSHA256)||
      typeof bound.personID!=='string'||!UUID.test(bound.personID)||
      !Number.isSafeInteger(bound.sourceWidth)||bound.sourceWidth<1||
      !Number.isSafeInteger(bound.sourceHeight)||bound.sourceHeight<1||
      !Number.isSafeInteger(bound.sourceWidth*bound.sourceHeight)||
      bound.sourceWidth*bound.sourceHeight>MANUAL_EYESHADOW_MAX_PIXELS)
    throw Error('MANUAL_EYESHADOW_DOCUMENT_BINDING_INVALID');
  const settings=input.settings;
  if(!exact(settings,['color','opacity'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(key=>Number.isSafeInteger(settings.color[key])&&
        settings.color[key]>=0&&settings.color[key]<=255)||
      !unit(settings.opacity))
    throw Error('MANUAL_EYESHADOW_DOCUMENT_SETTINGS_INVALID');
  if(!exact(input.strokes,ROLES))
    throw Error('MANUAL_EYESHADOW_DOCUMENT_STROKES_INVALID');
  let strokeCount=0,pointCount=0;
  const copied={};
  for(const role of ROLES){
    const group=input.strokes[role];
    if(!dense(group,1,MAX_STROKES))
      throw Error('MANUAL_EYESHADOW_DOCUMENT_STROKES_INVALID');
    let hasAdd=false;
    copied[role]=group.map(stroke=>{
      checkAbort(signal);
      if(!exact(stroke,['operation','path','radiusFraction','hardness'])||
          !['ADD','ERASE'].includes(stroke.operation)||
          !dense(stroke.path,1,MAX_POINTS)||
          typeof stroke.radiusFraction!=='number'||
          !Number.isFinite(stroke.radiusFraction)||
          stroke.radiusFraction<.001||stroke.radiusFraction>.25||
          !unit(stroke.hardness))
        throw Error('MANUAL_EYESHADOW_DOCUMENT_STROKE_INVALID');
      strokeCount++;pointCount+=stroke.path.length;
      if(strokeCount>MAX_STROKES||pointCount>MAX_POINTS)
        throw Error('MANUAL_EYESHADOW_DOCUMENT_CAPACITY');
      if(stroke.operation==='ADD')hasAdd=true;
      const path=stroke.path.map(point=>{
        if(!exact(point,['u','v'])||!unit(point.u)||!unit(point.v))
          throw Error('MANUAL_EYESHADOW_DOCUMENT_POINT_INVALID');
        return Object.freeze({u:point.u,v:point.v});
      });
      return Object.freeze({operation:stroke.operation,path:Object.freeze(path),
        radiusFraction:stroke.radiusFraction,hardness:stroke.hardness});
    });
    if(!hasAdd)throw Error('MANUAL_EYESHADOW_DOCUMENT_ADD_REQUIRED');
    copied[role]=Object.freeze(copied[role]);
  }
  const safe={schemaVersion:1,engineVersion:MANUAL_EYESHADOW_COLOR_VERSION,
    representation:'normalized-owner-manual-eye-area-protections-v1',
    binding:{assetID:bound.assetID,originalSHA256:bound.originalSHA256,
      personID:bound.personID,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight},eye:input.eye,strokes:copied,
    settings:{color:{r:settings.color.r,g:settings.color.g,b:settings.color.b},
      opacity:settings.opacity}};
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_EYESHADOW_DOCUMENT_JSON_LIMIT');
  checkAbort(signal);
  return safe;
}
function checkedRuntime(bound,eye,runtime){
  if(!exact(runtime,['assetID','originalSHA256','personID','eye',
    'savedRevision','sourceWidth','sourceHeight'])||
      runtime.assetID!==bound.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      runtime.personID!==bound.personID||runtime.eye!==eye||
      runtime.sourceWidth!==bound.sourceWidth||
      runtime.sourceHeight!==bound.sourceHeight||
      !Number.isSafeInteger(runtime.savedRevision)||runtime.savedRevision<1)
    throw Error('MANUAL_EYESHADOW_RUNTIME_MISMATCH');
  return runtime;
}
function dimensions(bound,target){
  if(target==='source')return {width:bound.sourceWidth,height:bound.sourceHeight};
  if(target!=='proxy')throw Error('MANUAL_EYESHADOW_TARGET_INVALID');
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(bound.sourceWidth,bound.sourceHeight));
  return {width:Math.max(1,Math.round(bound.sourceWidth*scale)),
    height:Math.max(1,Math.round(bound.sourceHeight*scale))};
}
function checkedFrame(pixels){
  const sourceWidth=Object.hasOwn(pixels??{},'sourceWidth');
  const sourceHeight=Object.hasOwn(pixels??{},'sourceHeight');
  if(sourceWidth!==sourceHeight||
      !exact(pixels,sourceWidth?['width','height','data',
        'sourceWidth','sourceHeight']:['width','height','data']))
    throw Error('MANUAL_EYESHADOW_FRAME_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_EYESHADOW_MAX_PIXELS)
    throw Error('MANUAL_EYESHADOW_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_EYESHADOW_SHARED_INPUT_INVALID');
  return pixels;
}
function strokeWork(stroke,width,height){
  const radius=Math.max(.75,stroke.radiusFraction*Math.min(width,height));
  const points=stroke.path.map(point=>({x:point.u*width,y:point.v*height}));
  let union=null,work=0;
  for(let index=0;index<points.length;index++){
    const a=points[Math.max(0,index-1)],b=points[index];
    const left=clamp(Math.floor(Math.min(a.x,b.x)-radius-1),0,width-1);
    const right=clamp(Math.ceil(Math.max(a.x,b.x)+radius+1),0,width-1);
    const top=clamp(Math.floor(Math.min(a.y,b.y)-radius-1),0,height-1);
    const bottom=clamp(Math.ceil(Math.max(a.y,b.y)+radius+1),0,height-1);
    work+=(right-left+1)*(bottom-top+1);
    union=union?{left:Math.min(union.left,left),right:Math.max(union.right,right),
      top:Math.min(union.top,top),bottom:Math.max(union.bottom,bottom)}:
      {left,right,top,bottom};
  }
  return work+2*(union.right-union.left+1)*(union.bottom-union.top+1);
}

/**
 * Re-rasterizes three separately authored roles at source or exact 1600px
 * proxy dimensions. The rasterizer's internal ownerConfirmed=true only
 * satisfies its geometry API; it is NOT identity, consent, eye location,
 * Original bytes or permission evidence. A fresh authenticated host must
 * establish all product gates before Preview/Final may consume these masks.
 */
export function rasterizeManualEyeshadowMasks(pixels,document,runtime,
  {target,signal}={}){
  checkAbort(signal);
  const safe=validateDocument(document,signal),bound=safe.binding;
  const current=checkedRuntime(bound,safe.eye,runtime);
  const frame=checkedFrame(pixels);
  if(target==='proxy'&&(!Object.hasOwn(frame,'sourceWidth')||
      !Object.hasOwn(frame,'sourceHeight')))
    throw Error('MANUAL_EYESHADOW_PROXY_PROVENANCE_REQUIRED');
  const source=sourceDimensions(frame);
  if(source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_EYESHADOW_SOURCE_DIMENSIONS_MISMATCH');
  const expected=dimensions(bound,target);
  if(frame.width!==expected.width||frame.height!==expected.height)
    throw Error('MANUAL_EYESHADOW_TARGET_DIMENSIONS_MISMATCH');
  let work=0;
  for(const role of ROLES)for(const stroke of safe.strokes[role]){
    checkAbort(signal);
    work+=strokeWork(stroke,frame.width,frame.height);
    if(work>SUBJECT_MASK_MAX_WORK)
      throw Error('MANUAL_EYESHADOW_MASK_WORK_LIMIT');
  }
  const proof={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    savedRevision:current.savedRevision};
  const masks={};
  for(const role of ROLES){
    checkAbort(signal);
    const raster=authorSubjectMask(frame,safe.strokes[role],proof,
      {ownerConfirmed:true,signal});
    const roleProof=ROLE_PROOFS[role];
    masks[role]={width:frame.width,height:frame.height,data:raster.data,
      provenance:Object.freeze({kind:roleProof.kind,source:roleProof.source,
        assetID:bound.assetID,originalSHA256:bound.originalSHA256,
        personID:bound.personID,eye:safe.eye,
        savedRevision:current.savedRevision,sourceWidth:bound.sourceWidth,
        sourceHeight:bound.sourceHeight,target,width:frame.width,
        height:frame.height})};
  }
  let area=0,iris=0,pupil=0,active=0;
  for(let index=0;index<masks.eyeArea.data.length;index++){
    if((index&0x3fff)===0)checkAbort(signal);
    const a=masks.eyeArea.data[index],i=masks.irisProtect.data[index],
      p=masks.pupilProtect.data[index];
    if(a)area++;if(i)iris++;if(p)pupil++;
    if(a&&!i&&!p)active++;
  }
  if(!area||!iris||!pupil||!active||
      area===frame.width*frame.height||iris===frame.width*frame.height||
      pupil===frame.width*frame.height||
      area>1_000_000||iris>1_000_000||pupil>1_000_000)
    throw Error('MANUAL_EYESHADOW_MASK_AMBIGUOUS');
  checkAbort(signal);
  return Object.freeze({eyeAreaMask:Object.freeze(masks.eyeArea),
    irisExclusionMask:Object.freeze(masks.irisProtect),
    pupilExclusionMask:Object.freeze(masks.pupilProtect)});
}
