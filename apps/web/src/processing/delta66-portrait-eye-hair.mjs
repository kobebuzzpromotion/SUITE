import {checkAbort} from './pure.mjs';
import {checkedRegion,copyFrame,number,clamp,smoothRegionBands} from './region-repair-core.mjs';
import {polygonMask,polygonCenter} from './face-feature-geometry.mjs';
import {sampleRGB} from './astra-face-core.mjs';
import {buildPortraitField,renderPortraitField,renderPortraitIsolatedWarp} from './delta66-portrait-warp.mjs';
import {removePortraitBlemishes} from './delta66-portrait-repair.mjs';
/** Moves original iris pixels, then fills the uncovered original iris using a real
 * supplied inpainter. Never invents a sclera reconstruction when none is present.
 * Pet eyes use supplied pet-specific polygons, not human FaceLandmarker indices. */
export async function correctPortraitIris(frame,{eye,iris},{dx=0,dy=0,size=0,direct=false,inpainter,protection,signal}={}){
  for(const v of [dx,dy,size])number(v,-1,1);const e=polygonCenter(eye),center=polygonCenter(iris),eyeMask=polygonMask(frame.width,frame.height,eye,{signal}),irisMask=polygonMask(frame.width,frame.height,iris,{signal});
  const valid=checkedRegion(frame,eyeMask,protection,signal),w=Math.max(...eye.map(p=>p.x))-Math.min(...eye.map(p=>p.x)),h=Math.max(...eye.map(p=>p.y))-Math.min(...eye.map(p=>p.y));
  const shiftX=(direct?e.x-center.x:dx*w*.15)*frame.width,shiftY=(direct?e.y-center.y:dy*h*.15)*frame.height,scale=1+size*.2;
  if(!shiftX&&!shiftY&&scale===1)return copyFrame(frame);if(typeof inpainter?.inpaint!=='function')throw Error('PORTRAIT_IRIS_INPAINTER_REQUIRED');
  const hole=new Uint8Array(irisMask.length);for(let i=0;i<hole.length;i++)hole[i]=Math.round(irisMask[i]*valid[i]/255);
  const filled=await inpainter.inpaint(frame,{width:frame.width,height:frame.height,data:hole},{signal}),out=copyFrame({...frame,...filled}),cx=center.x*frame.width,cy=center.y*frame.height;
  for(let i=0;i<valid.length;i++){if(!(i&8191))checkAbort(signal);if(!valid[i])continue;const x=i%frame.width,y=Math.floor(i/frame.width),sx=cx+(x-cx-shiftX)/scale,sy=cy+(y-cy-shiftY)/scale;
    if(sx<0||sy<0||sx>frame.width-1||sy>frame.height-1)continue;const j=Math.round(sy)*frame.width+Math.round(sx);if(!irisMask[j]||!valid[j])continue;
    const rgb=sampleRGB(frame,sx,sy);if(!rgb)continue;const a=valid[i]/255;for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(out.data[i*4+c]*(1-a)+rgb[c]*a);}
  return out;
}
export const PORTRAIT_CATCHLIGHT_STYLES=Object.freeze(['round','softbox','window','ring','strip','diamond','star','double','arc','crescent','triangle','octagon']);
function lightShape(style,x,y){const r=Math.hypot(x,y),a=Math.atan2(y,x);switch(style){
  case 'round':return clamp((1-r)*5,0,1);case 'softbox':return Math.abs(x)<.85&&Math.abs(y)<.6?1:0;
  case 'window':return Math.abs(x)<.8&&Math.abs(y)<.8&&Math.abs(x)>.08&&Math.abs(y)>.08?1:0;
  case 'ring':return clamp(1-Math.abs(r-.65)*10,0,1);case 'strip':return Math.abs(x)<.2&&Math.abs(y)<.9?1:0;
  case 'diamond':return Math.abs(x)+Math.abs(y)<1?1:0;case 'star':return r<.6+.3*Math.cos(a*5)?1:0;
  case 'double':return Math.hypot(x-.35,y)<.3||Math.hypot(x+.35,y)<.3?1:0;
  case 'arc':return y<0&&Math.abs(r-.65)<.15?1:0;case 'crescent':return r<.9&&Math.hypot(x-.4,y)>.8?1:0;
  case 'triangle':return y>-.8&&y<.8&&Math.abs(x)<(y+.8)/2?1:0;case 'octagon':return Math.max(Math.abs(x),Math.abs(y))<.8&&Math.abs(x)+Math.abs(y)<1.15?1:0;
  default:throw Error('PORTRAIT_CATCHLIGHT_STYLE');}}
export function enhancePortraitEyes(frame,masks,{overall=0,irisBrightness=0,whites=0,reflection=0,flare=0,redEye=0,cleanse=0,colorEnhancement=0,catchlight,protection,signal}={}){
  for(const v of [overall,irisBrightness,whites,reflection,flare,redEye,cleanse,colorEnhancement])number(v,0,100);
  const prepared={};for(const [key,mask] of Object.entries(masks))prepared[key]=checkedRegion(frame,mask,protection,signal);
  for(const [v,key] of [[overall,'eye'],[irisBrightness,'iris'],[whites,'sclera'],[reflection,'reflection'],[flare,'flare'],[redEye,'iris'],[cleanse,'sclera'],[colorEnhancement,'iris']])if(v&&!prepared[key])throw Error('PORTRAIT_EYE_MASK_REQUIRED:'+key);
  if(catchlight){if(!PORTRAIT_CATCHLIGHT_STYLES.includes(catchlight.style)||!prepared.iris)throw Error('PORTRAIT_CATCHLIGHT');number(catchlight.x,0,1);number(catchlight.y,0,1);number(catchlight.radius,.0001,.2);number(catchlight.intensity,0,100);}
  const out=copyFrame(frame);
  for(let i=0;i<frame.width*frame.height;i++){if(!(i&8191))checkAbort(signal);const p=i*4,r=frame.data[p],g=frame.data[p+1],b=frame.data[p+2],coverage=k=>(prepared[k]?.[i]??0)/255;
    const brightness=overall*.15*coverage('eye')+irisBrightness*.3*coverage('iris')+whites*.3*coverage('sclera')+reflection*.35*coverage('reflection')-flare*.35*coverage('flare');
    const red=Math.max(0,r-Math.max(g,b)*1.15)*(redEye*coverage('iris')+cleanse*coverage('sclera'))/100;
    let light=0;if(catchlight){const x=(i%frame.width-catchlight.x*frame.width)/(catchlight.radius*frame.width),y=(Math.floor(i/frame.width)-catchlight.y*frame.height)/(catchlight.radius*frame.width);light=lightShape(catchlight.style,x,y)*catchlight.intensity/100*coverage('iris');}
    for(let c=0;c<3;c++){const saturation=(frame.data[p+c]-(r+g+b)/3)*colorEnhancement/100*coverage('iris')*.5;
      const v=clamp(frame.data[p+c]+brightness+saturation-(c===0?red:0),0,255);out.data[p+c]=Math.round(v+(255-v)*light);}
  }return out;
}
export const PORTRAIT_PET_LIGHT_CATEGORIES=Object.freeze({general:['round','ring','star','double'],indoors:['window','softbox','strip'],outdoors:['arc','crescent','round']});
export function balancePortraitEyes(frame,{imageLeft,imageRight},{reference='imageLeft',symmetry=0,level=0,balance=0,mask,protection,signal}={}){
  for(const value of [symmetry,level,balance])number(value,0,100);if(!['imageLeft','imageRight'].includes(reference))throw Error('PORTRAIT_REFERENCE_EYE');
  const a=reference==='imageLeft'?imageLeft:imageRight,b=reference==='imageLeft'?imageRight:imageLeft,ca=polygonCenter(a),cb=polygonCenter(b);
  const bounds=poly=>({w:Math.max(...poly.map(p=>p.x))-Math.min(...poly.map(p=>p.x)),h:Math.max(...poly.map(p=>p.y))-Math.min(...poly.map(p=>p.y))});const ba=bounds(a),bb=bounds(b),rx=Math.max(.01,bb.w),ry=Math.max(.01,bb.h*2),ops=[];
  if(symmetry){ops.push({type:'scaleX',center:cb,rx,ry,amount:clamp((ba.w/bb.w-1)/.18*symmetry/100,-1,1)});ops.push({type:'scaleY',center:cb,rx,ry,amount:clamp((ba.h/bb.h-1)/.18*symmetry/100,-1,1)});}
  if(level)ops.push({type:'translate',center:cb,rx,ry,dy:clamp((ca.y-cb.y)/(ry*.18)*level/100,-1,1)});
  if(balance){const sorted=poly=>[...poly].sort((p,q)=>p.x-q.x),sa=sorted(a),sb=sorted(b),angle=poly=>Math.atan2((poly.at(-1).y-poly[0].y)*frame.height,(poly.at(-1).x-poly[0].x)*frame.width);
    ops.push({type:'rotate',center:cb,rx,ry,angle:clamp((-angle(sa)-angle(sb))/(Math.PI/6)*balance/100,-1,1)});}
  const field=buildPortraitField(frame,ops,{protection,signal});return renderPortraitField(frame,field,{mask,protection,signal});
}
export function recolorPortraitHair(frame,hairMask,{color,amount=0,grayMask,blacken=0,shine=0,smooth=0,protection,signal}={}){
  for(const v of [amount,blacken,shine,smooth])number(v,0,100);if(amount&&(!Array.isArray(color)||color.length!==3||color.some(v=>!Number.isFinite(v)||v<0||v>255)))throw Error('PORTRAIT_HAIR_COLOR');
  const m=checkedRegion(frame,hairMask,protection,signal),gray=grayMask?checkedRegion(frame,grayMask,protection,signal):null;if(blacken&&!gray)throw Error('PORTRAIT_GRAY_HAIR_MASK_REQUIRED');
  const out=smoothRegionBands(frame,m,{fine:smooth/100*.5,coarse:0,radius:3,protection,signal});
  for(let i=0;i<m.length;i++){if(!(i&8191))checkAbort(signal);const a=m[i]/255,l=(frame.data[i*4]+frame.data[i*4+1]+frame.data[i*4+2])/765;
    for(let c=0;c<3;c++){let v=out.data[i*4+c];if(amount)v=v*(1-amount/100*a)+(color[c]*(.35+.9*l))*amount/100*a;
      if(gray)v*=1-blacken/100*gray[i]/255*a*.75;v+=shine/100*a*30*Math.max(0,1-Math.abs(l-.65)*3);out.data[i*4+c]=Math.round(clamp(v,0,255));}}
  return out;
}
export function reshapePortraitHair(frame,{top,imageLeft,imageRight,hairline},{topVolume=0,sideLeft=0,sideRight=0,hairlineHeight=0},{mask,protection,signal}={}){
  const ops=[];for(const [v,region,type] of [[topVolume,top,'scaleY'],[sideLeft,imageLeft,'scaleX'],[sideRight,imageRight,'scaleX'],[hairlineHeight,hairline,'translate']]){
    number(v,-1,1);if(!v)continue;if(!region)throw Error('PORTRAIT_HAIR_REGION_REQUIRED');ops.push({center:region.center,rx:region.rx,ry:region.ry,type,amount:v,dy:type==='translate'?-v:0});}
  const field=buildPortraitField(frame,ops,{protection,signal});return renderPortraitField(frame,field,{mask,protection,signal});
}
export async function retouchPortraitHair(frame,hairMask,defectMasks,settings,{domain,inpainter,protection,signal}={}){
  const {partLine=0,strayInside=0,strayOutside=0,frizz=0,...color}=settings;
  // Smooth Hair includes frizz cleanup only when its actual semantic mask exists.
  const strengths={partLine,strayHairInside:strayInside,strayHairOutside:strayOutside,frizz:color.smooth?100:frizz};
  let output=await removePortraitBlemishes(frame,defectMasks,strengths,{domain,inpainter,protection,signal});
  output=recolorPortraitHair(output,hairMask,{...color,grayMask:defectMasks.grayHair,protection,signal});return output;
}
export async function reshapePortraitHairIsolated(frame,regions,controls,options){
  const result=reshapePortraitHair(frame,regions,controls,options);return renderPortraitIsolatedWarp(frame,result.requestedField,options.mask,options);
}
export function enhancePortraitPetEyes(frame,masks,{imageLeft={},imageRight={},linked,protection,signal}={}){
  let output=frame;for(const [side,settings] of [['imageLeft',{...linked,...imageLeft}],['imageRight',{...linked,...imageRight}]]){
    if(!Object.keys(settings).length)continue;const prefix=side==='imageLeft'?'petImageLeft':'petImageRight';
    output=enhancePortraitEyes(output,{eye:masks[prefix+'Eye'],iris:masks[prefix+'Iris']},{...settings,protection,signal});}
  return output;
}
