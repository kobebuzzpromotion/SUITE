import {assertPixels,checkAbort} from './pure.mjs';
import {pointInPolygon} from './face-feature-geometry.mjs';
import {getMakeupStyle,MAKEUP_STYLE_VERSION} from './makeup-procedural-styles.mjs';
import {blendMakeupChannel} from './manual-blush-color.mjs';
import {makeupIrisTargetChannel} from './manual-contacts-iris-color.mjs';

const MAX_PIXELS=8_000_000,MAX_WORK=64_000_000;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function polygon(value){
  if(!Array.isArray(value)||value.length<3||value.length>128||value.some(p=>
    !p||!finite(p.x)||!finite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1))
    throw Error('MAKEUP_FEATURE_POLYGON_INVALID');
  return value.map(p=>({x:p.x,y:p.y}));
}
const mean=points=>({x:points.reduce((s,p)=>s+p.x,0)/points.length,
  y:points.reduce((s,p)=>s+p.y,0)/points.length});
function bounds(points,width,height){
  return {x0:clamp(Math.floor(Math.min(...points.map(p=>p.x))*width)-2,0,width-1),
    x1:clamp(Math.ceil(Math.max(...points.map(p=>p.x))*width)+2,0,width-1),
    y0:clamp(Math.floor(Math.min(...points.map(p=>p.y))*height)-2,0,height-1),
    y1:clamp(Math.ceil(Math.max(...points.map(p=>p.y))*height)+2,0,height-1)};
}
function faceGeometry(face,width,height){
  if(!face?.regions)throw Error('MAKEUP_FEATURES_REQUIRED');
  const r=face.regions,oval=polygon(face.oval),left=polygon(r.imageLeftEye),right=polygon(r.imageRightEye);
  const a=mean(left),b=mean(right),dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,span=Math.hypot(dx,dy);
  if(span<8||dx<=0)throw Error('MAKEUP_FACE_SCALE_OR_ORDER');
  const tx=dx/span,ty=dy/span,nx=-ty,ny=tx;
  const local=p=>({x:p.x*width*tx+p.y*height*ty,y:p.x*width*nx+p.y*height*ny});
  const world=(x,y)=>({x:(x*tx+y*nx)/width,y:(x*ty+y*ny)/height});
  const eyes=[left,right].map((points,index)=>{
    const q=points.map(local),min=Math.min(...q.map(p=>p.x)),max=Math.max(...q.map(p=>p.x));
    const top=Math.min(...q.map(p=>p.y)),bottom=Math.max(...q.map(p=>p.y));
    if(max-min<4||(bottom-top)/(max-min)<.07)throw Error('MAKEUP_EYE_CLOSED_OR_TOO_SMALL');
    const iris=r[index===0?'imageLeftIris':'imageRightIris'];
    return {points,q,min,max,top,bottom,width:max-min,index,iris:iris?polygon(iris):null};
  });
  return {oval,eyes,local,world,span,lips:polygon(r.outerLips),
    cheeks:[polygon(r.imageLeftCheek),polygon(r.imageRightCheek)]};
}
function upperLid(eye,t){
  const x=eye.min+clamp(t,.002,.998)*eye.width,ys=[];
  for(let i=0;i<eye.q.length;i++){
    const a=eye.q[i],b=eye.q[(i+1)%eye.q.length];
    if(a.x===b.x)continue;
    if(x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x))ys.push(a.y+(x-a.x)*(b.y-a.y)/(b.x-a.x));
  }
  if(!ys.length)throw Error('MAKEUP_LID_GEOMETRY_INVALID');
  return {x,y:Math.min(...ys)};
}
function options(selection,platform){
  if(!selection||typeof selection!=='object'||Array.isArray(selection)||
      Reflect.ownKeys(selection).some(k=>!['kind','styleID','amount','linked','imageLeft','imageRight','color'].includes(k))||
      !finite(selection.amount)||selection.amount<0||selection.amount>1||
      typeof selection.linked!=='boolean')throw Error('MAKEUP_SELECTION_INVALID');
  const color=value=>{
    if(value===undefined)return undefined;
    if(!Array.isArray(value)||value.length!==3||value.some(c=>!Number.isInteger(c)||c<0||c>255))
      throw Error('MAKEUP_COLOR_INVALID');
    return value.slice();
  };
  const base={style:getMakeupStyle(selection.kind,selection.styleID,platform),amount:selection.amount,color:color(selection.color)};
  if(selection.linked){
    if(selection.imageLeft!==undefined||selection.imageRight!==undefined)throw Error('MAKEUP_LINKED_OVERRIDE_INVALID');
    return [base,base];
  }
  return ['imageLeft','imageRight'].map(side=>{
    const value=selection[side];
    if(!value||Reflect.ownKeys(value).some(k=>!['styleID','amount','color'].includes(k))||!Object.hasOwn(value,'styleID')||
        !Object.hasOwn(value,'amount')||!finite(value.amount)||value.amount<0||value.amount>1)
      throw Error('MAKEUP_SIDE_SELECTION_INVALID');
    return {style:getMakeupStyle(selection.kind,value.styleID,platform),amount:value.amount,color:color(value.color)||base.color};
  });
}

/** Render six original procedural makeup families onto a selected detected face.
 * The face is geometric evidence only, NOT permission, person identity or proof
 * of occlusion. A fresh authorised product host is required before saving/export.
 * No manual ownerConfirmed/provenance is manufactured or passed to manual APIs.
 * Selections are explicit, at most one per family, applied in the supplied order.
 */
export function renderFeatureMakeup(pixels,face,selections,{platform='desktop',protectionMask,signal}={}){
  checkAbort(signal);assertPixels(pixels);
  const {width,height}=pixels;
  if(width*height>MAX_PIXELS||Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')
    throw Error('MAKEUP_FRAME_CAPACITY');
  if(!Array.isArray(selections)||selections.length<1||selections.length>6||
    new Set(selections.map(s=>s?.kind)).size!==selections.length)throw Error('MAKEUP_SELECTIONS_INVALID');
  if(protectionMask!==undefined&&(!(protectionMask instanceof Uint8Array)||protectionMask.length!==width*height))
    throw Error('MAKEUP_PROTECTION_MASK_INVALID');
  const chosen=selections.map(s=>({kind:s.kind,sides:options(s,platform)}));
  const geo=faceGeometry(face,width,height),data=pixels.data.slice();let work=0;
  const inside=(p,poly)=>pointInPolygon(p.x,p.y,poly);
  const skin=p=>inside(p,geo.oval)&&!inside(p,geo.lips)&&!geo.eyes.some(e=>inside(p,e.points));
  function blend(x,y,color,weight,lumaPreserving=false){
    const at=(y*width+x)*4;if(!data[at+3]||weight<=0||protectionMask?.[y*width+x])return;
    const w=clamp(weight),luma=.2126*data[at]+.7152*data[at+1]+.0722*data[at+2];
    const tintLuma=.2126*color[0]+.7152*color[1]+.0722*color[2];
    for(let c=0;c<3;c++)data[at+c]=blendMakeupChannel(data[at+c],
      lumaPreserving?makeupIrisTargetChannel(luma,color[c],tintLuma):color[c],w);
  }
  function raster(box,fn){
    const x0=clamp(Math.floor(box.x0),0,width-1),x1=clamp(Math.ceil(box.x1),0,width-1);
    const y0=clamp(Math.floor(box.y0),0,height-1),y1=clamp(Math.ceil(box.y1),0,height-1);
    work+=(x1-x0+1)*(y1-y0+1);if(work>MAX_WORK)throw Error('MAKEUP_WORK_CAPACITY');
    for(let y=y0;y<=y1;y++){checkAbort(signal);for(let x=x0;x<=x1;x++)fn(x,y,{x:(x+.5)/width,y:(y+.5)/height});}
  }
  function stroke(points,radius,color,amount,taper=false){
    // Accumulate maximum coverage before tinting to avoid segment-joint darkening.
    const coverage=new Map();
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height;
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;if(!len)continue;
      raster({x0:Math.min(ax,bx)-radius-1,x1:Math.max(ax,bx)+radius+1,
        y0:Math.min(ay,by)-radius-1,y1:Math.max(ay,by)+radius+1},(x,y,p)=>{
        if(!skin(p))return;
        const t=clamp(((x+.5-ax)*dx+(y+.5-ay)*dy)/len);
        const progress=(i-1+t)/(points.length-1),r=radius*(taper?1-progress:1);
        const c=clamp(r+.5-Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy));
        if(c>0){const key=y*width+x;coverage.set(key,Math.max(coverage.get(key)||0,c));}
      });
    }
    for(const [index,c] of coverage)blend(index%width,Math.floor(index/width),color,amount*c);
  }
  function dot(center,radius,color,amount,clip){
    const cx=center.x*width,cy=center.y*height;
    raster({x0:cx-radius-1,x1:cx+radius+1,y0:cy-radius-1,y1:cy+radius+1},(x,y,p)=>{
      if(!skin(p)||!inside(p,clip))return;
      const d=Math.hypot(x+.5-cx,y+.5-cy)/radius;
      blend(x,y,color,amount*clamp(1-d*d));
    });
  }
  for(const selection of chosen){
    for(let side=0;side<2;side++){
      checkAbort(signal);const {style,amount,color:customColor}=selection.sides[side];if(amount===0)continue;
      const p=style.parameters,color=customColor||style.color,eye=geo.eyes[side],cheek=geo.cheeks[side];
      if(selection.kind==='blush'){
        const q=cheek.map(geo.local),center=mean(q),rx=(Math.max(...q.map(v=>v.x))-Math.min(...q.map(v=>v.x)))*.5*p.spread;
        const ry=(Math.max(...q.map(v=>v.y))-Math.min(...q.map(v=>v.y)))*.5*p.height;
        if(rx<=0||ry<=0)throw Error('MAKEUP_CHEEK_DEGENERATE');
        raster(bounds(cheek,width,height),(x,y,point)=>{
          if(!skin(point)||!inside(point,cheek))return;
          const loc=geo.local(point),u=(loc.x-center.x)/rx,v=(loc.y-center.y-p.slant*(loc.x-center.x))/ry;
          blend(x,y,color,amount*p.opacity*clamp(1-u*u-v*v)**2);
        });
      }else if(selection.kind==='contacts'){
        if(!eye.iris)throw Error('MAKEUP_IRIS_LANDMARKS_REQUIRED');
        const center=mean(eye.iris),q=eye.iris.map(v=>({x:(v.x-center.x)*width,y:(v.y-center.y)*height}));
        const radius=q.reduce((s,v)=>s+Math.hypot(v.x,v.y),0)/q.length;
        if(radius<2)throw Error('MAKEUP_IRIS_TOO_SMALL');
        // Protect a conservative central pupil disk plus every dark iris pixel;
        // this is image-derived exclusion, not a medical pupil segmentation.
        raster(bounds(eye.iris,width,height),(x,y,point)=>{
          if(!inside(point,eye.points)||!inside(point,eye.iris))return;
          const dx=(point.x-center.x)*width,dy=(point.y-center.y)*height,r=Math.hypot(dx,dy)/radius;
          const at=(y*width+x)*4,luma=.2126*pixels.data[at]+.7152*pixels.data[at+1]+.0722*pixels.data[at+2];
          if(r<.42||r>1.05||luma<42||luma>235)return;
          const theta=Math.atan2(dy,dx),fibers=.72+.28*Math.sin(theta*p.frequency+r*17+style.index);
          const edge=clamp((1.05-r)/p.ring),inner=clamp((r-.42)/.12);
          blend(x,y,color,amount*edge*inner*fibers*.8,true);
        });
      }else if(selection.kind==='eyeliner'){
        const path=Array.from({length:33},(_,i)=>{const v=upperLid(eye,i/32);return geo.world(v.x,v.y-.35);});
        // Outer corner is screen-left for the left eye, screen-right for right.
        if(p.wing>0){const t=side===0?0:1,start=upperLid(eye,t),sign=side===0?-1:1;
          const wing=geo.world(start.x+sign*eye.width*p.wing,start.y-eye.width*p.wing*.6);
          if(side===0)path.unshift(wing);else path.push(wing);}
        stroke(path,Math.max(.55,eye.width*(.012+style.index*.003)),color,amount*.85);
      }else if(selection.kind==='eyelashes'){
        for(let i=0;i<p.density;i++){
          const t=(i+1)/(p.density+1),root=upperLid(eye,t),outward=(t-.5)*eye.width*.17;
          const length=eye.width*p.length*(.65+.35*Math.sin(t*Math.PI));
          const control={x:root.x+outward*.3,y:root.y-length*.75};
          const tip={x:root.x+outward+p.slant*eye.width*.12,y:root.y-length};
          const curve=Array.from({length:17},(_,j)=>{const s=j/16,k=1-s;
            return geo.world(k*k*root.x+2*k*s*control.x+s*s*tip.x,k*k*root.y+2*k*s*control.y+s*s*tip.y);});
          stroke(curve,Math.max(.55,eye.width*(.009+(style.index%3)*.003)),color,amount*.9,true);
        }
      }else if(selection.kind==='eyeshadow'){
        const reach=eye.width*(.2+p.height*.12),boxPoints=[geo.world(eye.min-eye.width*.12,eye.top-reach),
          geo.world(eye.max+eye.width*.12,eye.top-reach),geo.world(eye.min-eye.width*.12,eye.bottom),
          geo.world(eye.max+eye.width*.12,eye.bottom)];
        raster(bounds(boxPoints,width,height),(x,y,point)=>{
          if(!skin(point))return;
          const loc=geo.local(point),t=(loc.x-eye.min)/eye.width;if(t<=0||t>=1)return;
          const lid=upperLid(eye,t),v=(lid.y-loc.y)/reach;if(v<=0||v>=1)return;
          const outer=side===0?1-t:t;
          const strength=Math.sin(Math.PI*t)**.7*Math.sin(Math.PI*v)**p.height*(.65+outer*.35);
          blend(x,y,color,amount*p.opacity*strength);
        });
      }else if(selection.kind==='faceDecorations'){
        // Seed and normalized positions depend only on style/side: stable at all sizes.
        let state=(0x9e3779b9^(style.index+1)*7919^(side+1)*104729)>>>0;
        const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
        const loX=Math.min(...cheek.map(v=>v.x)),hiX=Math.max(...cheek.map(v=>v.x));
        const loY=Math.min(...cheek.map(v=>v.y)),hiY=Math.max(...cheek.map(v=>v.y));
        const target=16+style.index*9;let drawn=0;
        for(let attempt=0;attempt<target*20&&drawn<target;attempt++){
          const center={x:loX+random()*(hiX-loX),y:loY+random()*(hiY-loY)};
          if(!skin(center)||!inside(center,cheek))continue;
          const radius=geo.span*(.003+random()*.004)*(1+style.index*.06);
          dot(center,radius,customColor||[96+style.index*5,57+style.index*3,40+style.index*2],amount*(.3+random()*.3),cheek);drawn++;
        }
      }
    }
  }
  checkAbort(signal);
  return {...pixels,data};
}

/** Metadata is deliberately a processing receipt, never a permission claim. */
export const makeupProcessingReceipt=()=>Object.freeze({algorithmVersion:MAKEUP_STYLE_VERSION,
  provenance:'suite-procedural-detected-geometry',authenticated:false,
  occlusionVerified:false,proprietaryStyleEquivalent:false});
