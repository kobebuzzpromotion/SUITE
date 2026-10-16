import {assertPixels,checkAbort,sourceDimensions} from './pure.mjs';

// SUITE's owner-authored quadratic strokes, not Evoto's style materials.
export const MANUAL_EYELASH_VERSION='suite-srgb8-owner-manual-eyelash-taper-1';
export const MANUAL_EYELASH_MAX_PIXELS=8_000_000;
export const MANUAL_EYELASH_MAX_WORK=16_000_000;
const MAX_JSON_BYTES=96*1024,MAX_CURVES=128,PROXY_MAX_EDGE=1600;
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
  return plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
}
function dense(value,min,max){
  if(!Array.isArray(value)||value.length<min||value.length>max||
      Reflect.ownKeys(value).length!==value.length+1)return false;
  for(let i=0;i<value.length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor||!Object.hasOwn(descriptor,'value'))return false;
  }
  return true;
}
const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
function binding(value){
  return exact(value,BINDING)&&typeof value.assetID==='string'&&UUID.test(value.assetID)&&
    typeof value.originalSHA256==='string'&&SHA.test(value.originalSHA256)&&
    typeof value.personID==='string'&&UUID.test(value.personID)&&
    Number.isSafeInteger(value.sourceWidth)&&value.sourceWidth>=1&&
    Number.isSafeInteger(value.sourceHeight)&&value.sourceHeight>=1&&
    Number.isSafeInteger(value.sourceWidth*value.sourceHeight)&&
    value.sourceWidth*value.sourceHeight<=MANUAL_EYELASH_MAX_PIXELS;
}
function point(value,rect){
  return exact(value,['u','v'])&&unit(value.u)&&unit(value.v)&&
    value.u>=rect.x&&value.u<=rect.x+rect.width&&
    value.v>=rect.y&&value.v<=rect.y+rect.height;
}
function checked(document,context,signal){
  checkAbort(signal);
  if(!exact(document,['schemaVersion','engineVersion','representation','binding','eyeTargets','settings'])||
      document.schemaVersion!==1||document.engineVersion!==MANUAL_EYELASH_VERSION||
      document.representation!=='normalized-quadratic-root-control-tip-v1')
    throw Error('MANUAL_EYELASH_DOCUMENT_INVALID');
  if(!binding(document.binding))throw Error('MANUAL_EYELASH_DOCUMENT_BINDING_INVALID');
  if(!exact(context,CONTEXT)||!binding(Object.fromEntries(BINDING.map(k=>[k,context[k]])))||
      !Number.isSafeInteger(context.savedRevision)||context.savedRevision<1||
      !['source','proxy'].includes(context.target)||
      document.binding.assetID!==context.assetID||
      document.binding.originalSHA256.toLowerCase()!==context.originalSHA256.toLowerCase()||
      document.binding.personID!==context.personID||
      document.binding.sourceWidth!==context.sourceWidth||
      document.binding.sourceHeight!==context.sourceHeight)
    throw Error('MANUAL_EYELASH_BINDING_MISMATCH');
  if(!exact(document.settings,['color','opacity'])||
      !exact(document.settings.color,['r','g','b'])||
      !['r','g','b'].every(k=>Number.isSafeInteger(document.settings.color[k])&&
        document.settings.color[k]>=0&&document.settings.color[k]<=255)||
      !unit(document.settings.opacity)||Object.is(document.settings.opacity,-0))
    throw Error('MANUAL_EYELASH_SETTINGS_INVALID');
  if(!dense(document.eyeTargets,1,2))throw Error('MANUAL_EYELASH_EYE_TARGET_INVALID');
  const sides=new Set();let count=0;
  for(const eye of document.eyeTargets){
    checkAbort(signal);
    if(!exact(eye,['side','rect','curves'])||!['image-left','image-right'].includes(eye.side)||
        sides.has(eye.side)||!exact(eye.rect,['x','y','width','height'])||
        !unit(eye.rect.x)||!unit(eye.rect.y)||!unit(eye.rect.width)||
        !unit(eye.rect.height)||eye.rect.width<=0||eye.rect.height<=0||
        eye.rect.x+eye.rect.width>1||eye.rect.y+eye.rect.height>1||
        !dense(eye.curves,1,MAX_CURVES))throw Error('MANUAL_EYELASH_EYE_TARGET_INVALID');
    sides.add(eye.side);
    for(const curve of eye.curves){
      if(!exact(curve,['root','control','tip','rootRadiusFraction'])||
          !point(curve.root,eye.rect)||!point(curve.control,eye.rect)||
          !point(curve.tip,eye.rect)||
          Math.hypot(curve.tip.u-curve.root.u,curve.tip.v-curve.root.v)<1e-5||
          typeof curve.rootRadiusFraction!=='number'||
          !Number.isFinite(curve.rootRadiusFraction)||
          curve.rootRadiusFraction<.001||curve.rootRadiusFraction>.03)
        throw Error('MANUAL_EYELASH_CURVE_INVALID');
      if(++count>MAX_CURVES)throw Error('MANUAL_EYELASH_CAPACITY');
    }
  }
  if(sides.size===2){
    const left=document.eyeTargets.find(eye=>eye.side==='image-left').rect;
    const right=document.eyeTargets.find(eye=>eye.side==='image-right').rect;
    if(left.x+left.width>right.x)throw Error('MANUAL_EYELASH_EYE_TARGET_OVERLAP');
  }
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>MAX_JSON_BYTES)
    throw Error('MANUAL_EYELASH_JSON_LIMIT');
  return document;
}
function expected(context){
  if(context.target==='source')return {width:context.sourceWidth,height:context.sourceHeight};
  const scale=Math.min(1,PROXY_MAX_EDGE/Math.max(context.sourceWidth,context.sourceHeight));
  return {width:Math.max(1,Math.round(context.sourceWidth*scale)),
    height:Math.max(1,Math.round(context.sourceHeight*scale))};
}
const bezier=(a,b,c,t)=>((1-t)*(1-t)*a+2*(1-t)*t*b+t*t*c);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

/**
 * Draws only owner-authored tapered lashes on upright, pre-crop RGBA8 pixels.
 * The document and context are structural claims, NOT authentication, eye
 * detection, privacy consent, or proof of a fresh saved Recipe/permission.
 * A product host must independently establish those facts before calling.
 */
export function applyManualEyelashes(pixels,document,context,{signal}={}){
  checkAbort(signal);
  if(Number.isSafeInteger(pixels?.width)&&Number.isSafeInteger(pixels?.height)&&
      pixels.width*pixels.height>MANUAL_EYELASH_MAX_PIXELS)
    throw Error('MANUAL_EYELASH_CAPACITY');
  assertPixels(pixels);
  const safe=checked(document,context,signal);
  const source=sourceDimensions(pixels),dimensions=expected(context);
  if(source.width!==context.sourceWidth||source.height!==context.sourceHeight||
      pixels.width!==dimensions.width||pixels.height!==dimensions.height||
      (context.target==='proxy'&&(!Object.hasOwn(pixels,'sourceWidth')||
        !Object.hasOwn(pixels,'sourceHeight'))))
    throw Error('MANUAL_EYELASH_DIMENSIONS_MISMATCH');
  const {width,height}=pixels,coverage=new Uint8Array(width*height);
  let work=0;
  for(const eye of safe.eyeTargets){
    const rect=eye.rect;
    for(const curve of eye.curves){
      checkAbort(signal);
      const radius=curve.rootRadiusFraction*Math.min(width,height);
      // Straight line segments cover the full quadratic arc without sampling gaps.
      const steps=64;
      for(let step=0;step<steps;step++){
        if((step&7)===0)checkAbort(signal);
        const t0=step/steps,t1=(step+1)/steps;
        const a={x:bezier(curve.root.u,curve.control.u,curve.tip.u,t0)*width,
          y:bezier(curve.root.v,curve.control.v,curve.tip.v,t0)*height};
        const b={x:bezier(curve.root.u,curve.control.u,curve.tip.u,t1)*width,
          y:bezier(curve.root.v,curve.control.v,curve.tip.v,t1)*height};
        const r=radius*(1-t0),margin=r+1;
        const x0=clamp(Math.floor(Math.min(a.x,b.x)-margin),0,width-1);
        const x1=clamp(Math.ceil(Math.max(a.x,b.x)+margin),0,width-1);
        const y0=clamp(Math.floor(Math.min(a.y,b.y)-margin),0,height-1);
        const y1=clamp(Math.ceil(Math.max(a.y,b.y)+margin),0,height-1);
        work+=(x1-x0+1)*(y1-y0+1);
        if(work>MANUAL_EYELASH_MAX_WORK)throw Error('MANUAL_EYELASH_WORK_LIMIT');
        const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
        for(let y=y0;y<=y1;y++){
          if((y&31)===0)checkAbort(signal);
          if((y+.5)/height<rect.y||(y+.5)/height>rect.y+rect.height)continue;
          for(let x=x0;x<=x1;x++){
            if((x+.5)/width<rect.x||(x+.5)/width>rect.x+rect.width)continue;
            const q=len2?clamp(((x+.5-a.x)*dx+(y+.5-a.y)*dy)/len2,0,1):0;
            const t=t0+(t1-t0)*q;
            const distance=Math.hypot(x+.5-a.x-q*dx,y+.5-a.y-q*dy);
            const amount=clamp(radius*(1-t)+.5-distance,0,1);
            const index=y*width+x;
            coverage[index]=Math.max(coverage[index],Math.round(amount*255));
          }
        }
      }
    }
  }
  checkAbort(signal);
  const output={width,height,data:pixels.data.slice()};
  if(Object.hasOwn(pixels,'sourceWidth')){
    output.sourceWidth=pixels.sourceWidth;output.sourceHeight=pixels.sourceHeight;
  }
  for(let pixel=0;pixel<coverage.length;pixel++){
    if((pixel&0x3fff)===0)checkAbort(signal);
    const at=pixel*4;
    if(!coverage[pixel]||pixels.data[at+3]===0)continue;
    const weight=safe.settings.opacity*coverage[pixel]/255;
    for(const [index,channel] of ['r','g','b'].entries())
      output.data[at+index]=Math.round(pixels.data[at+index]*(1-weight)+
        safe.settings.color[channel]*weight);
  }
  checkAbort(signal);
  return output;
}
