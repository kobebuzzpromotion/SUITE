import {assertPixels,checkAbort} from './pure.mjs';
import {warpScene,sceneTransformMatrix} from './delta66-scene-geometry.mjs';
import {sceneMask,refineSceneMask,generateSceneEdit} from './delta66-scene-edit.mjs';
import {matchSceneColor} from './delta66-scene-color.mjs';
import {applyColorAdjustments,HSL_COLORS} from './color-adjustments.mjs';
import {applySceneBasic} from './delta66-scene-color.mjs';
import {applyAddShadow} from './add-shadow.mjs';
const clone=p=>({...p,data:p.data.slice()});
const unit=v=>Number.isFinite(v)&&v>=0&&v<=1;
/** Alpha-correct separable box blur; transparent hidden RGB never leaks. */
export function blurSceneLayer(pixels,radius,{signal}={}){
  assertPixels(pixels);if(!Number.isInteger(radius)||radius<0||radius>128)throw Error('SCENE_BLUR_RANGE');if(!radius)return clone(pixels);
  const {width:w,height:h}=pixels,n=w*h,temp=new Float32Array(n*4),data=new Uint8ClampedArray(n*4);
  for(let y=0;y<h;y++){checkAbort(signal);let sum=[0,0,0,0];const add=(x,s)=>{if(x<0||x>=w)return;const o=(y*w+x)*4,a=pixels.data[o+3]/255;for(let c=0;c<3;c++)sum[c]+=pixels.data[o+c]*a*s;sum[3]+=a*s;};
    for(let x=0;x<=Math.min(w-1,radius);x++)add(x,1);for(let x=0;x<w;x++){const count=Math.min(w-1,x+radius)-Math.max(0,x-radius)+1;for(let c=0;c<4;c++)temp[(y*w+x)*4+c]=sum[c]/count;add(x-radius,-1);add(x+radius+1,1);}}
  for(let x=0;x<w;x++){checkAbort(signal);let sum=[0,0,0,0];const add=(y,s)=>{if(y<0||y>=h)return;for(let c=0;c<4;c++)sum[c]+=temp[(y*w+x)*4+c]*s;};
    for(let y=0;y<=Math.min(h-1,radius);y++)add(y,1);for(let y=0;y<h;y++){const count=Math.min(h-1,y+radius)-Math.max(0,y-radius)+1,o=(y*w+x)*4;data[o+3]=Math.round(sum[3]/count*255);if(sum[3]>1e-8)for(let c=0;c<3;c++)data[o+c]=Math.round(sum[c]/sum[3]);add(y-radius,-1);add(y+radius+1,1);}}
  return {...pixels,data};
}
export function solidScene(width,height,color){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>8e6||!Array.isArray(color)||color.length!==3||color.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('SCENE_SOLID_INVALID');const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([...color,255],i);return {width,height,data};}
export function fitSceneLayer(pixels,width,height,{fit='cover',x=0,y=0,scale=1,angle=0,flipX=false,flipY=false,signal}={}){
  assertPixels(pixels);if(!['cover','contain','stretch'].includes(fit)||!Number.isFinite(scale)||scale<=0)throw Error('SCENE_FIT_INVALID');
  const b=width/height;let sx=1,sy=1;if(fit!=='stretch'){const k=fit==='cover'?Math.max(width/pixels.width,height/pixels.height):Math.min(width/pixels.width,height/pixels.height);sx=pixels.width*k/width;sy=pixels.height*k/height;}
  const inv=sceneTransformMatrix({x,y,scale,angle,flipX,flipY,frameAspect:b});
  const transform=inv.map((v,i)=>i<3?v/sx:i<6?v/sy:v);transform[2]+=.5-.5/sx;transform[5]+=.5-.5/sy;
  return warpScene(pixels,transform,{width,height,signal});
}
export function overScene(bottom,top,{opacity=1,mask,signal}={}){
  assertPixels(bottom);assertPixels(top);if(bottom.width!==top.width||bottom.height!==top.height||!unit(opacity))throw Error('SCENE_LAYER_DIMENSIONS');if(mask)sceneMask(bottom,mask);
  const data=bottom.data.slice();for(let p=0;p<bottom.width*bottom.height;p++){if(!(p%bottom.width))checkAbort(signal);const o=p*4,a=top.data[o+3]/255*opacity*(mask?mask[p]/255:1);if(!a)continue;const b=bottom.data[o+3]/255,out=a+b*(1-a);data[o+3]=Math.round(out*255);for(let c=0;c<3;c++)data[o+c]=Math.round((top.data[o+c]*a+bottom.data[o+c]*b*(1-a))/out);}return {...bottom,data};
}
/** Independent RGBA composition, not the application's authorized replacement route. */
export function composeSceneBackdrop(source,background,subjectMask,{edgeRadius=0,opacity=1,placement={},subjectPlacement,foreground=[],blur=0,spillColor,spill=0,reflection=0,floor=.85,shadow,shadowAnchor,signal}={}){
  sceneMask(source,subjectMask);assertPixels(background);if(!Array.isArray(foreground)||foreground.length>50||!unit(spill)||!unit(reflection)||!unit(floor))throw Error('SCENE_COMPOSITION_OPTIONS');
  let out=blurSceneLayer(fitSceneLayer(background,source.width,source.height,{...placement,signal}),blur,{signal});
  const mask=refineSceneMask(source,subjectMask,{radius:edgeRadius,signal}),data=source.data.slice();
  if(spillColor&&(!Array.isArray(spillColor)||spillColor.length!==3||spillColor.some(v=>!Number.isFinite(v)||v<0||v>255)))throw Error('SCENE_SPILL_COLOR');
  for(let p=0;p<mask.length;p++){const o=p*4;data[o+3]=Math.round(data[o+3]*mask[p]/255);if(spillColor&&data[o+3]){const t=spill*(1-mask[p]/255);for(let c=0;c<3;c++)data[o+c]-=Math.max(0,spillColor[c]-(spillColor.reduce((a,b)=>a+b,0)/3))*t*data[o+c]/255;}}
  let subject={...source,data};if(subjectPlacement)subject=fitSceneLayer(subject,source.width,source.height,{fit:'stretch',...subjectPlacement,signal});
  if(shadow){const silhouette=Uint8Array.from({length:mask.length},(_,i)=>subject.data[i*4+3]);let settings={...shadow};
    if(shadowAnchor){if(!unit(shadowAnchor.x)||!unit(shadowAnchor.y))throw Error('SCENE_SHADOW_ANCHOR');let left=source.width,right=-1,bottom=-1;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(silhouette[y*source.width+x]){left=Math.min(left,x);right=Math.max(right,x);bottom=Math.max(bottom,y);}if(right<0)throw Error('SCENE_SHADOW_NO_SUBJECT');settings={...settings,offsetX:Math.round(shadowAnchor.x*source.width-(left+right+1)/2),offsetY:Math.round(shadowAnchor.y*source.height-bottom-1)};}
    // Existing shadow kernel enforces its own documented offset/blur ranges.
    out=applyAddShadow(out,{width:source.width,height:source.height,data:silhouette},settings,{signal});}
  if(reflection){const reflected=warpScene(subject,[1,0,0,0,-1,2*floor,0,0,1],{signal});for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){const o=(y*source.width+x)*4;reflected.data[o+3]*=y/source.height<floor?0:Math.max(0,1-(y/source.height-floor)/Math.max(.01,1-floor));}out=overScene(out,blurSceneLayer(reflected,Math.min(128,Math.max(1,blur)),{signal}),{opacity:reflection,signal});}
  out=overScene(out,subject,{opacity,signal});for(const layer of foreground){assertPixels(layer.pixels);out=overScene(out,fitSceneLayer(layer.pixels,source.width,source.height,{...layer.placement,signal}),{opacity:layer.opacity??1,signal});}return out;
}
export function replaceSceneSky(source,sky,skyMask,{placement={},temperature=0,tint=0,saturation=0,brightness=0,edgeRadius=1,opacity=1,blur=0,gradient=0,waterMask,reflection=0,horizon=.5,waterBlur=2,sceneryMask,personMask,sceneryMatch=0,personMatch=0,signal}={}){
  sceneMask(source,skyMask);if(!skyMask.some(v=>v))throw Error('SCENE_NO_DETECTABLE_SKY');if(!unit(gradient)||!unit(horizon)||!unit(reflection))throw Error('SCENE_SKY_OPTIONS');
  const adjusted=applySceneBasic(applyColorAdjustments(sky,{temperature,tint,hsl:Object.fromEntries(HSL_COLORS.map(name=>[name,{saturation}]))},{signal}),{brightness},{signal});
  const fitted=blurSceneLayer(fitSceneLayer(adjusted,source.width,source.height,{...placement,signal}),blur,{signal}),mask=refineSceneMask(source,skyMask,{radius:edgeRadius,signal});
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)mask[y*source.width+x]*=1-gradient*y/Math.max(1,source.height-1);
  let out=overScene(source,fitted,{mask,opacity,signal});
  if(waterMask&&reflection){sceneMask(source,waterMask);const reflected=warpScene(fitted,[1,0,0,0,-1,2*horizon,0,0,1],{signal});out=overScene(out,blurSceneLayer(reflected,waterBlur,{signal}),{mask:waterMask,opacity:reflection,signal});}
  if(sceneryMatch){sceneMask(source,sceneryMask);out=matchSceneColor(out,fitted,{sourceMask:sceneryMask,amount:sceneryMatch,signal});}if(personMatch){sceneMask(source,personMask);out=matchSceneColor(out,fitted,{sourceMask:personMask,amount:personMatch,signal});}return out;
}
export async function generateSceneFusion(source,background,subjectMask,{model,foreground=[],editMask,protectMask,seed=1,signal,...composition}={}){
  // Required protection is in final composition coordinates (after subject placement).
  sceneMask(source,protectMask);
  const composed=composeSceneBackdrop(source,background,subjectMask,{...composition,foreground,signal});const mask=editMask||new Uint8Array(source.width*source.height).fill(255);
  return generateSceneEdit(composed,{task:'background-fusion',model,mask,protectMask,seeds:[seed],signal});
}
/** Lighting/banding smoothing on explicit backdrop only, not AI clean-up. */
export function refineSolidScene(source,backgroundMask,{lighting=0,banding=0,signal}={}){
  sceneMask(source,backgroundMask);if(!unit(lighting)||!unit(banding))throw Error('SCENE_SOLID_RANGE');checkAbort(signal);
  if(!lighting&&!banding)return clone(source);
  const radius=Math.round(2+banding*14),smooth={width:source.width,height:source.height,data:new Uint8ClampedArray(source.data.length)};
  // Bound the blur's Float32 scratch to a 512px core plus halo. The global
  // weighted mean below remains one whole-image reduction, never tile means.
  for(let top=0;top<source.height;top+=512)for(let left=0;left<source.width;left+=512){
    checkAbort(signal);const right=Math.min(source.width,left+512),bottom=Math.min(source.height,top+512);
    const x0=Math.max(0,left-radius),y0=Math.max(0,top-radius),x1=Math.min(source.width,right+radius),y1=Math.min(source.height,bottom+radius);
    const width=x1-x0,height=y1-y0,tile=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++){checkAbort(signal);const at=((y0+y)*source.width+x0)*4;tile.set(source.data.subarray(at,at+width*4),y*width*4);}
    const blurred=blurSceneLayer({width,height,data:tile},radius,{signal});
    for(let y=top;y<bottom;y++){checkAbort(signal);const at=((y-y0)*width+left-x0)*4;
      smooth.data.set(blurred.data.subarray(at,at+(right-left)*4),(y*source.width+left)*4);}
  }
  const data=source.data.slice();let sums=[0,0,0],n=0;
  for(let p=0;p<backgroundMask.length;p++){if(!(p&16383))checkAbort(signal);const w=backgroundMask[p]/255*source.data[p*4+3]/255;n+=w;for(let c=0;c<3;c++)sums[c]+=smooth.data[p*4+c]*w;}if(!n)return {...source,data};sums=sums.map(v=>v/n);
  for(let p=0;p<backgroundMask.length;p++){if(!(p%source.width))checkAbort(signal);if(!source.data[p*4+3])continue;const t=backgroundMask[p]/255;for(let c=0;c<3;c++){const o=p*4+c,v=source.data[o]+(smooth.data[o]-source.data[o])*banding+(sums[c]-smooth.data[o])*lighting;data[o]=source.data[o]+(v-source.data[o])*t;}}return {...source,data};
}
