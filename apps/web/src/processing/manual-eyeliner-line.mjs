import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

// SUITE owner-authored continuous lid edge, not Evoto's 9/6 style materials.
export const MANUAL_EYELINER_VERSION='suite-srgb8-owner-manual-lid-line-1';
export const MANUAL_EYELINER_MAX_PIXELS=8_000_000;
export const MANUAL_EYELINER_MAX_WORK=16_000_000;
const MAX_JSON_BYTES=96*1024,MAX_VERTICES=256,MAX_PER_PATH=128;
const PROXY_MAX_EDGE=1600;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const BINDING=['assetID','originalSHA256','personID','sourceWidth','sourceHeight'];
const CONTEXT=[...BINDING,'savedRevision','target'];

function plain(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===null||(Object.getPrototypeOf(proto)===null&&
    Object.getOwnPropertyDescriptor(proto,'constructor')?.value?.name==='Object');
}
function exact(value,keys){
  return plain(value)&&Reflect.ownKeys(value).length===keys.length&&
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
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=value=>typeof value==='number'&&Number.isFinite(value)&&
  !Object.is(value,-0)&&value>=0&&value<=1;
function binding(value){
  return exact(value,BINDING)&&typeof value.assetID==='string'&&UUID.test(value.assetID)&&
    typeof value.originalSHA256==='string'&&SHA.test(value.originalSHA256)&&
    typeof value.personID==='string'&&UUID.test(value.personID)&&
    Number.isSafeInteger(value.sourceWidth)&&value.sourceWidth>=1&&
    Number.isSafeInteger(value.sourceHeight)&&value.sourceHeight>=1&&
    Number.isSafeInteger(value.sourceWidth*value.sourceHeight)&&
    value.sourceWidth*value.sourceHeight<=MANUAL_EYELINER_MAX_PIXELS;
}
function point(value,rect){
  return exact(value,['u','v'])&&unit(value.u)&&unit(value.v)&&
    value.u>=rect.x&&value.u<=rect.x+rect.width&&
    value.v>=rect.y&&value.v<=rect.y+rect.height;
}
function path(value,rect,min,max){
  if(!dense(value,min,max)||!value.every(vertex=>point(vertex,rect)))return false;
  for(let index=1;index<value.length;index++)
    if(Math.hypot(value[index].u-value[index-1].u,
      value[index].v-value[index-1].v)<1e-5)return false;
  return true;
}
function checked(document,context,signal){
  checkAbort(signal);
  if(!exact(document,['schemaVersion','engineVersion','representation',
    'binding','eyeTargets','settings'])||document.schemaVersion!==1||
      document.engineVersion!==MANUAL_EYELINER_VERSION||
      document.representation!=='normalized-continuous-lid-edge-v1')
    throw Error('MANUAL_EYELINER_DOCUMENT_INVALID');
  if(!binding(document.binding))throw Error('MANUAL_EYELINER_DOCUMENT_BINDING_INVALID');
  if(!exact(context,CONTEXT)||
      !binding(Object.fromEntries(BINDING.map(key=>[key,context[key]])))||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !['source','proxy'].includes(context.target)||
      document.binding.assetID!==context.assetID||
      document.binding.originalSHA256.toLowerCase()!==
        context.originalSHA256.toLowerCase()||
      document.binding.personID!==context.personID||
      document.binding.sourceWidth!==context.sourceWidth||
      document.binding.sourceHeight!==context.sourceHeight)
    throw Error('MANUAL_EYELINER_BINDING_MISMATCH');
  const settings=document.settings;
  if(!exact(settings,['color','opacity','lineRadiusFraction'])||
      !exact(settings.color,['r','g','b'])||
      !['r','g','b'].every(channel=>
        Number.isSafeInteger(settings.color[channel])&&
        settings.color[channel]>=0&&settings.color[channel]<=255)||
      !unit(settings.opacity)||
      typeof settings.lineRadiusFraction!=='number'||
      !Number.isFinite(settings.lineRadiusFraction)||
      settings.lineRadiusFraction<.001||settings.lineRadiusFraction>.03)
    throw Error('MANUAL_EYELINER_SETTINGS_INVALID');
  if(!dense(document.eyeTargets,1,2))
    throw Error('MANUAL_EYELINER_EYE_TARGET_INVALID');
  const sides=new Set();let vertices=0;
  for(const eye of document.eyeTargets){
    checkAbort(signal);
    if(!exact(eye,['side','rect','edge','wing'])||
        !['image-left','image-right'].includes(eye.side)||sides.has(eye.side)||
        !exact(eye.rect,['x','y','width','height'])||
        !unit(eye.rect.x)||!unit(eye.rect.y)||
        !unit(eye.rect.width)||!unit(eye.rect.height)||
        eye.rect.width<=0||eye.rect.height<=0||
        eye.rect.x+eye.rect.width>1||eye.rect.y+eye.rect.height>1||
        !path(eye.edge,eye.rect,2,MAX_PER_PATH)||
        !(eye.wing===null||path(eye.wing,eye.rect,2,MAX_PER_PATH)))
      throw Error('MANUAL_EYELINER_EYE_TARGET_INVALID');
    if(eye.wing&&
        (eye.wing[0].u!==eye.edge.at(-1).u||
          eye.wing[0].v!==eye.edge.at(-1).v))
      throw Error('MANUAL_EYELINER_WING_DISCONNECTED');
    sides.add(eye.side);
    vertices+=eye.edge.length+(eye.wing?.length??0);
    if(vertices>MAX_VERTICES)throw Error('MANUAL_EYELINER_CAPACITY');
  }
  if(sides.size===2){
    const left=document.eyeTargets.find(eye=>eye.side==='image-left').rect;
    const right=document.eyeTargets.find(eye=>eye.side==='image-right').rect;
    if(left.x+left.width>right.x)
      throw Error('MANUAL_EYELINER_EYE_TARGET_OVERLAP');
  }
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_EYELINER_JSON_LIMIT');
  return document;
}
function dimensions(context){
  if(context.target==='source')
    return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/
    Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/**
 * Draws a constant-width, continuous user-authored eyelid edge and optional
 * connected wing. It never draws individual tapered lashes or an iris ring.
 * Binding/context and coordinates are structural claims only: an external
 * fresh host must prove owner permission, person/eye continuity, saved Recipe
 * revision and genuine decoded Original pixels before Preview/Final.
 */
export function applyManualEyeliner(pixels,document,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_EYELINER_MAX_PIXELS)
    throw Error('MANUAL_EYELINER_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MANUAL_EYELINER_SHARED_INPUT_INVALID');
  const safe=checked(document,context,signal);
  const source=sourceDimensions(pixels),expected=dimensions(context);
  if(source.width!==context.sourceWidth||source.height!==context.sourceHeight||
      pixels.width!==expected.width||pixels.height!==expected.height||
      (context.target==='proxy'&&(!Object.hasOwn(pixels,'sourceWidth')||
        !Object.hasOwn(pixels,'sourceHeight'))))
    throw Error('MANUAL_EYELINER_DIMENSIONS_MISMATCH');
  const {width,height}=pixels,coverage=new Uint8Array(width*height);
  const radius=safe.settings.lineRadiusFraction*Math.min(width,height);
  let work=0;
  for(const eye of safe.eyeTargets){
    const rect=eye.rect;
    for(const polyline of [eye.edge,...(eye.wing?[eye.wing]:[])]){
      for(let segment=1;segment<polyline.length;segment++){
        checkAbort(signal);
        const first={x:polyline[segment-1].u*width,
          y:polyline[segment-1].v*height};
        const last={x:polyline[segment].u*width,y:polyline[segment].v*height};
        const margin=radius+1;
        const x0=clamp(Math.floor(Math.min(first.x,last.x)-margin),0,width-1);
        const x1=clamp(Math.ceil(Math.max(first.x,last.x)+margin),0,width-1);
        const y0=clamp(Math.floor(Math.min(first.y,last.y)-margin),0,height-1);
        const y1=clamp(Math.ceil(Math.max(first.y,last.y)+margin),0,height-1);
        work+=(x1-x0+1)*(y1-y0+1);
        if(work>MANUAL_EYELINER_MAX_WORK)
          throw Error('MANUAL_EYELINER_WORK_LIMIT');
        const dx=last.x-first.x,dy=last.y-first.y,len2=dx*dx+dy*dy;
        for(let y=y0;y<=y1;y++){
          if((y&31)===0)checkAbort(signal);
          const v=(y+.5)/height;
          if(v<rect.y||v>rect.y+rect.height)continue;
          for(let x=x0;x<=x1;x++){
            const u=(x+.5)/width;
            if(u<rect.x||u>rect.x+rect.width)continue;
            const t=clamp(((x+.5-first.x)*dx+(y+.5-first.y)*dy)/len2,0,1);
            const distance=Math.hypot(x+.5-first.x-t*dx,y+.5-first.y-t*dy);
            const amount=clamp(radius+.5-distance,0,1);
            const at=y*width+x;
            coverage[at]=Math.max(coverage[at],Math.round(amount*255));
          }
        }
      }
    }
  }
  checkAbort(signal);
  const output={width,height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;
    output.sourceHeight=pixels.sourceHeight;
  }
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    const offset=pixel*4;
    if(!coverage[pixel]||pixels.data[offset+3]===0)continue;
    const weight=safe.settings.opacity*coverage[pixel]/255;
    for(const [index,channel] of ['r','g','b'].entries())
      output.data[offset+index]=Math.round(
        pixels.data[offset+index]*(1-weight)+safe.settings.color[channel]*weight);
  }
  checkAbort(signal);
  return output;
}
