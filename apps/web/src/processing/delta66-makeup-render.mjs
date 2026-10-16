import {assertPixels,checkAbort} from './pure.mjs';
import {pointInPolygon,convexHull,polygonCenter,expandPolygon} from './face-feature-geometry.mjs';
import {renderFeatureMakeup} from './makeup-feature-render.mjs';
import {getDelta66MakeupStyle,getDelta66MakeupSuite,DELTA66_MAKEUP_VERSION} from './delta66-makeup-styles.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const existing=new Set(['blush','contacts','eyelashes','eyeliner','eyeshadow','faceDecorations']);
const newKinds=new Set(['contour','eyebrows','lipstick']);
function record(v,allowed){if(!v||![Object.prototype,null].includes(Object.getPrototypeOf(v))||
  Reflect.ownKeys(v).some(k=>!allowed.includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))
  throw Error('DELTA66_MAKEUP_RECORD');}
function polygon(p){if(!Array.isArray(p)||p.length<3||p.length>512||p.some(v=>!v||!finite(v.x,0,1)||!finite(v.y,0,1)))
  throw Error('DELTA66_MAKEUP_POLYGON');return p;}
function geometry(face,width,height){
  const r=face?.regions;if(!r)throw Error('DELTA66_MAKEUP_FACE');
  const oval=polygon(face.oval),eyes=[polygon(r.imageLeftEye),polygon(r.imageRightEye)],
    brows=[polygon(r.imageLeftBrow),polygon(r.imageRightBrow)],cheeks=[polygon(r.imageLeftCheek),polygon(r.imageRightCheek)],lips=polygon(r.outerLips);
  if(!Array.isArray(face.landmarks)||face.landmarks.length<468)throw Error('DELTA66_MAKEUP_LANDMARKS');
  const inner=convexHull([78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95].map(i=>face.landmarks[i]));
  const l=polygonCenter(eyes[0]),rgt=polygonCenter(eyes[1]);
  const dx=(rgt.x-l.x)*width,dy=(rgt.y-l.y)*height,span=Math.hypot(dx,dy);
  if(span<8||dx<=0)throw Error('DELTA66_MAKEUP_FACE_GEOMETRY');
  const tx=dx/span,ty=dy/span,nx=-ty,ny=tx;
  const local=p=>({x:p.x*width*tx+p.y*height*ty,y:p.x*width*nx+p.y*height*ny});
  const mid=local({x:(l.x+rgt.x)/2,y:(l.y+rgt.y)/2}).x;
  return {oval,eyes,brows,cheeks,lips,inner,local,mid,span};
}
function bounds(poly,width,height){return {x0:Math.max(0,Math.floor(Math.min(...poly.map(p=>p.x))*width)),
  y0:Math.max(0,Math.floor(Math.min(...poly.map(p=>p.y))*height)),
  x1:Math.min(width-1,Math.ceil(Math.max(...poly.map(p=>p.x))*width)),
  y1:Math.min(height-1,Math.ceil(Math.max(...poly.map(p=>p.y))*height))};}
function localBounds(poly,geo){const p=poly.map(geo.local);return {x0:Math.min(...p.map(p=>p.x)),x1:Math.max(...p.map(p=>p.x)),
  y0:Math.min(...p.map(p=>p.y)),y1:Math.max(...p.map(p=>p.y))};}
function borderDistance(p,poly,width,height){let result=Infinity;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
    const ax=a.x*width,ay=a.y*height,dx=(b.x-a.x)*width,dy=(b.y-a.y)*height;
    const t=clamp(((p.x*width-ax)*dx+(p.y*height-ay)*dy)/(dx*dx+dy*dy||1));
    result=Math.min(result,Math.hypot(p.x*width-ax-t*dx,p.y*height-ay-t*dy));}return result;}
function color(value,fallback){if(value===undefined)return fallback;if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isInteger(v)||v<0||v>255))
  throw Error('DELTA66_MAKEUP_COLOR');return value;}
function sideSelections(s){
  record(s,['kind','styleID','amount','linked','imageLeft','imageRight','color','texture']);
  if(!newKinds.has(s.kind)||typeof s.linked!=='boolean'||!finite(s.amount,0,1))throw Error('DELTA66_MAKEUP_COMPONENT');
  const make=value=>{record(value,['styleID','amount','color','texture']);if(!finite(value.amount,0,1))throw Error('DELTA66_MAKEUP_AMOUNT');
    const style=getDelta66MakeupStyle(s.kind,value.styleID),texture=value.texture??style.texture;
    if(texture!==undefined&&!['matte','satin','gloss'].includes(texture))throw Error('DELTA66_MAKEUP_TEXTURE');
    return {style,amount:value.amount,color:color(value.color,style.color),texture};};
  if(s.linked){if(s.imageLeft!==undefined||s.imageRight!==undefined)throw Error('DELTA66_MAKEUP_LINK_MODE');
    const value=make({styleID:s.styleID,amount:s.amount,...(s.color?{color:s.color}:{}),...(s.texture?{texture:s.texture}:{})});return [value,value];}
  return [make(s.imageLeft),make(s.imageRight)];
}
function adjustmentSides(value={linked:true,shared:{}}){
  record(value,['linked','shared','imageLeft','imageRight']);if(typeof value.linked!=='boolean')throw Error('DELTA66_MAKEUP_LINK_MODE');
  const norm=v=>{record(v,['amount','saturation','brightness','dimensionality']);const out={amount:v.amount??1,saturation:v.saturation??0,brightness:v.brightness??0,dimensionality:v.dimensionality??0};
    if(!finite(out.amount,0,1)||['saturation','brightness','dimensionality'].some(k=>!finite(out[k],-1,1)))throw Error('DELTA66_MAKEUP_ADJUSTMENT');return out;};
  if(value.linked){if(value.imageLeft!==undefined||value.imageRight!==undefined)throw Error('DELTA66_MAKEUP_LINK_MODE');const v=norm(value.shared??{});return [v,v];}
  if(value.shared!==undefined)throw Error('DELTA66_MAKEUP_LINK_MODE');return [norm(value.imageLeft),norm(value.imageRight)];
}

/** Eight delta rows share three new material kernels and upper controls. The
 * six already-existing families are dispatched to their existing renderer.
 * Pure RGBA only: no person inference, auth, Recipe mutation, app wiring or age/
 * gender inference. All masks/landmarks are caller geometry, not authorisation.
 * SUITE ranges: amount/intensity 0..1; saturation/brightness/dimensionality -1..1.
 */
export function renderDelta66Makeup(pixels,face,{components=[],adjustments={},suiteAmount=1}={},
  {platform='desktop',protectionMask,signal}={}){
  assertPixels(pixels);checkAbort(signal);
  const {width,height}=pixels;
  if(width*height>8_000_000||!(pixels.data.buffer instanceof ArrayBuffer)||!finite(suiteAmount,0,1)||
    !Array.isArray(components)||components.length>9||new Set(components.map(s=>s?.kind)).size!==components.length)
    throw Error('DELTA66_MAKEUP_INPUT');
  if(protectionMask!==undefined&&(!(protectionMask instanceof Uint8Array)||protectionMask.length!==width*height))throw Error('DELTA66_MAKEUP_PROTECTION');
  record(adjustments,['contourIntensity','eyebrow','eye','lip']);
  const intensity=adjustments.contourIntensity??1;if(!finite(intensity,0,1))throw Error('DELTA66_MAKEUP_INTENSITY');
  const upper={eyebrow:adjustmentSides(adjustments.eyebrow),eye:adjustmentSides(adjustments.eye),lip:adjustmentSides(adjustments.lip)};
  // Validate all choices before creating output (even zero-strength selections).
  const prepared=components.map(s=>existing.has(s?.kind)?{old:true,selection:s}:{old:false,selection:s,sides:sideSelections(s)});
  const geo=geometry(face,width,height),data=new Uint8ClampedArray(pixels.data);
  const inside=(p,poly)=>pointInPolygon(p.x,p.y,poly);
  const skin=p=>inside(p,geo.oval)&&!inside(p,geo.lips)&&!geo.eyes.some(e=>inside(p,e));
  let work=0;
  const raster=(poly,fn)=>{const box=bounds(poly,width,height);work+=(box.x1-box.x0+1)*(box.y1-box.y0+1);
    if(work>96_000_000)throw Error('DELTA66_MAKEUP_WORK');
    for(let y=box.y0;y<=box.y1;y++){checkAbort(signal);for(let x=box.x0;x<=box.x1;x++){
      const i=y*width+x;if(!data[i*4+3]||protectionMask?.[i])continue;const p={x:(x+.5)/width,y:(y+.5)/height};if(inside(p,poly))fn(i,p,geo.local(p));}}};
  const tint=(i,rgb,amount)=>{for(let c=0;c<3;c++)data[i*4+c]=Math.round(data[i*4+c]*(1-clamp(amount))+clamp(rgb[c],0,255)*clamp(amount));};
  for(const entry of prepared){
    if(entry.old){
      let selection=entry.selection;
      if(['eyeshadow','eyeliner','eyelashes'].includes(selection.kind)){
        const old=structuredClone(selection);
        const selected=side=>old.linked?{styleID:old.styleID,amount:old.amount,...(old.color?{color:old.color}:{})}:old[side];
        const left=selected('imageLeft'),right=selected('imageRight');
        if(!left||!right)throw Error('DELTA66_MAKEUP_LINK_MODE');
        selection={...old,linked:false,imageLeft:{...left,amount:left.amount*upper.eye[0].amount},
          imageRight:{...right,amount:right.amount*upper.eye[1].amount}};
      }
      const result=renderFeatureMakeup({...pixels,data},face,[selection],{platform,protectionMask,signal});data.set(result.data);continue;}
    const kind=entry.selection.kind;
    for(let side=0;side<2;side++){
      const s=entry.sides[side],poly=kind==='eyebrows'?geo.brows[side]:kind==='contour'?geo.cheeks[side]:geo.lips;
      const box=localBounds(poly,geo),cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2,w=Math.max(1,box.x1-box.x0),h=Math.max(1,box.y1-box.y0);
      raster(poly,(i,p,q)=>{
        if(kind==='lipstick'&&(inside(p,geo.inner)||(q.x<geo.mid?0:1)!==side))return;
        if(kind!=='lipstick'&&!skin(p))return;
        const edge=clamp(borderDistance(p,poly,width,height)/Math.max(1,geo.span*.015));
        const original=[data[i*4],data[i*4+1],data[i*4+2]],luma=.2126*original[0]+.7152*original[1]+.0722*original[2];
        let opacity=s.amount*s.style.opacity*edge*(kind==='eyebrows'?upper.eyebrow[side].amount:kind==='lipstick'?upper.lip[side].amount:1),rgb=s.color;
        if(kind==='contour'){
          const u=(q.x-cx)/(w*.5),v=(q.y-cy-h*.16)/(h*s.style.spread);
          opacity*=intensity*clamp(1-u*u-v*v)**2;
          // Multiplicative pigment preserves local shading and skin detail.
          rgb=original.map((c,k)=>c*(.58+s.color[k]/510));
        }else if(kind==='eyebrows'){
          const u=(q.x-box.x0)/w,v=(q.y-box.y0)/h;
          const strand=Math.max(0,Math.cos((u-v*s.style.slant)*Math.PI*s.style.density))**8;
          opacity*=.3+.7*strand;rgb=s.color.map(c=>clamp(c+(luma-100)*.35,0,255));
        }else{
          const tone=.6+.65*luma/255,grain=Math.sin(q.x*.7+Math.sin(q.y*.45))*Math.sin(q.y*.8)*2;
          const highlight=s.texture==='gloss'?Math.exp(-(((q.y-cy-h*.15)/(h*.2))**2))*24:s.texture==='satin'?8:0;
          rgb=s.color.map(c=>clamp(c*tone+grain+highlight,0,255));
        }tint(i,rgb,opacity);
      });
    }
  }
  // Upper Amount has already scaled the selected material once. It also scales
  // the optional tone/relief delta here, without attenuating that material twice.
  // Excludes eyeballs and the open mouth/teeth.
  for(const group of ['eyebrow','eye','lip'])for(let side=0;side<2;side++){
    const control=upper[group][side];
    if(control.amount===1&&!control.saturation&&!control.brightness&&!control.dimensionality)continue;
    const poly=group==='eyebrow'?geo.brows[side]:group==='eye'?expandPolygon(geo.eyes[side],1.65):geo.lips;
    const box=localBounds(poly,geo),cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
    raster(poly,(i,p,q)=>{
      if(group==='lip'&&(inside(p,geo.inner)||(q.x<geo.mid?0:1)!==side))return;
      if(group!=='lip'&&!skin(p))return;
      const edge=clamp(borderDistance(p,poly,width,height)/Math.max(1,geo.span*.02));
      const u=(q.x-cx)/Math.max(1,(box.x1-box.x0)/2),v=(q.y-cy)/Math.max(1,(box.y1-box.y0)/2);
      const relief=(Math.exp(-3*(u*u+v*v))-.3)*control.dimensionality*28;
      const rgb=[data[i*4],data[i*4+1],data[i*4+2]],luma=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
      for(let c=0;c<3;c++){
        const adjusted=clamp(luma+(rgb[c]-luma)*(1+control.saturation)+control.brightness*48+relief,0,255);
        const target=rgb[c]+(adjusted-rgb[c])*control.amount;
        data[i*4+c]=Math.round(rgb[c]+(target-rgb[c])*edge);
      }
    });
  }
  if(suiteAmount!==1)for(let i=0;i<data.length;i+=4){if(!(i&65535))checkAbort(signal);for(let c=0;c<3;c++)
    data[i+c]=Math.round(pixels.data[i+c]+(data[i+c]-pixels.data[i+c])*suiteAmount);}
  checkAbort(signal);return {...pixels,data};
}

export function applyDelta66MakeupSuite(pixels,face,{suiteID,amount=1,componentOverrides=[],adjustments={}},options={}){
  const preset=getDelta66MakeupSuite(suiteID);
  if(!Array.isArray(componentOverrides)||componentOverrides.length>9||new Set(componentOverrides.map(x=>x?.kind)).size!==componentOverrides.length)
    throw Error('DELTA66_MAKEUP_OVERRIDES');
  const components=[...preset.components];for(const override of componentOverrides){const i=components.findIndex(c=>c.kind===override.kind);
    if(i<0)components.push(override);else components[i]=override;}
  return {pixels:renderDelta66Makeup(pixels,face,{components,adjustments,suiteAmount:amount},options),
    receipt:{version:DELTA66_MAKEUP_VERSION,suiteID,amount,audience:preset.audience,selection:'explicit-no-demographic-inference'}};
}
