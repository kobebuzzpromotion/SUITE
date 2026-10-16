import {assertPixels,checkAbort} from './pure.mjs';
import {sampleRGB} from './astra-face-core.mjs';
import {copyFrame,clamp} from './region-repair-core.mjs';
import {portraitMask} from './delta66-portrait-masks.mjs';
import {polygonCenter,polygonMask,expandPolygon} from './face-feature-geometry.mjs';
const signed=v=>{if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('PORTRAIT_WARP_VALUE');return v;};
const point=p=>{if(!p||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('PORTRAIT_WARP_POINT');return p;};
export function identityPortraitField(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>8_000_000)throw Error('PORTRAIT_WARP_CAPACITY');
  const x=new Float32Array(width*height),y=new Float32Array(x.length);for(let i=0;i<x.length;i++){x[i]=i%width;y[i]=Math.floor(i/width);}return {width,height,x,y};}
function fieldValid(field){const n=field?.width*field?.height;if(!Number.isInteger(n)||n<1||n>8_000_000||!(field.x instanceof Float32Array)||!(field.y instanceof Float32Array)||field.x.length!==n||field.y.length!==n)throw Error('PORTRAIT_WARP_FIELD');}
export function projectMaskThroughPortraitWarp(mask,field){fieldValid(field);if(!(mask instanceof Uint8Array)||mask.length!==field.x.length)throw Error('PORTRAIT_WARP_MASK');
  const out=new Uint8Array(mask.length);for(let i=0;i<out.length;i++){const x=field.x[i],y=field.y[i];if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('PORTRAIT_WARP_FIELD_NONFINITE');
    if(x<0||y<0||x>field.width-1||y>field.height-1)continue;const ax=Math.floor(x),ay=Math.floor(y),bx=Math.min(field.width-1,ax+1),by=Math.min(field.height-1,ay+1),u=x-ax,v=y-ay;
    out[i]=Math.round((mask[ay*field.width+ax]*(1-u)+mask[ay*field.width+bx]*u)*(1-v)+(mask[by*field.width+ax]*(1-u)+mask[by*field.width+bx]*u)*v);}return out;
}
export function renderPortraitField(frame,field,{mask,protection,signal}={}){
  assertPixels(frame);fieldValid(field);if(frame.width!==field.width||frame.height!==field.height)throw Error('PORTRAIT_WARP_DIMENSIONS');
  const coverage=mask?portraitMask(mask,frame):new Uint8Array(field.x.length).fill(255),protectedMask=protection?portraitMask(protection,frame):null,out=copyFrame(frame),applied=identityPortraitField(frame.width,frame.height);
  for(let i=0;i<coverage.length;i++){if(!(i&8191))checkAbort(signal);if(!coverage[i]||protectedMask?.[i]||!frame.data[i*4+3])continue;
    const sx=field.x[i],sy=field.y[i];if(!Number.isFinite(sx)||!Number.isFinite(sy))throw Error('PORTRAIT_WARP_FIELD_NONFINITE');
    if(sx<0||sy<0||sx>frame.width-1||sy>frame.height-1)continue;
    const donor=Math.min(frame.height-1,Math.max(0,Math.round(sy)))*frame.width+Math.min(frame.width-1,Math.max(0,Math.round(sx)));
    if(protectedMask?.[donor]||!coverage[donor])continue;
    const a=coverage[i]/255,x=i%frame.width,y=Math.floor(i/frame.width),fx=x+(sx-x)*a,fy=y+(sy-y)*a,rgb=sampleRGB(frame,fx,fy);if(!rgb)continue;
    applied.x[i]=fx;applied.y[i]=fy;for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(rgb[c]);
  }return {pixels:out,field:applied,requestedField:field,projectedMask:projectMaskThroughPortraitWarp(coverage,applied)};
}
/** Silhouette-changing warp. Actual inpainting reconstructs pixels vacated by
 * the subject; expansion is composited from original subject pixels. No painted
 * background is silently substituted when an inpainting model is unavailable. */
export async function renderPortraitIsolatedWarp(frame,field,mask,{inpainter,protection,signal}={}){
  const original=portraitMask(mask,frame);fieldValid(field);
  if(field.width!==frame.width||field.height!==frame.height)throw Error('PORTRAIT_ISOLATED_WARP_CONTRACT');
  if(field.x.every((x,i)=>x===i%frame.width&&field.y[i]===Math.floor(i/frame.width)))return {pixels:copyFrame(frame),field:{width:field.width,height:field.height,x:field.x.slice(),y:field.y.slice()},projectedMask:original};
  if(typeof inpainter?.inpaint!=='function')throw Error('PORTRAIT_ISOLATED_WARP_INPAINTER_REQUIRED');
  const lock=protection?portraitMask(protection,frame):null,applied={width:field.width,height:field.height,x:field.x.slice(),y:field.y.slice()};
  for(let i=0;i<original.length;i++){const sx=applied.x[i],sy=applied.y[i];if(!Number.isFinite(sx)||!Number.isFinite(sy))throw Error('PORTRAIT_WARP_FIELD_NONFINITE');
    const donor=sx>=0&&sy>=0&&sx<frame.width&&sy<frame.height?Math.min(frame.height-1,Math.round(sy))*frame.width+Math.min(frame.width-1,Math.round(sx)):-1;
    if(lock?.[i]||donor>=0&&lock?.[donor]){applied.x[i]=i%frame.width;applied.y[i]=Math.floor(i/frame.width);}}
  const projected=projectMaskThroughPortraitWarp(original,applied),hole=original.slice();for(let i=0;i<hole.length;i++)if(lock?.[i])hole[i]=0;
  const background=await inpainter.inpaint(frame,{width:frame.width,height:frame.height,data:hole},{signal}),out=copyFrame(frame);
  for(let i=0;i<original.length;i++){if(!(i&8191))checkAbort(signal);if(lock?.[i]||!frame.data[i*4+3]||!original[i]&&!projected[i])continue;
    const rgb=sampleRGB(frame,applied.x[i],applied.y[i]),a=rgb?projected[i]/255:0;
    for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(background.data[i*4+c]*(1-a)+(rgb?.[c]??0)*a);}
  return {pixels:out,field:applied,projectedMask:projected};
}
/** Normalized upper-left geometry. Each compact-support operation has its own
 * center/radii and type. No crop/whole-photo perspective aliases are used. */
export function buildPortraitField(frame,operations,{protection,pinEdges=true,signal}={}){
  assertPixels(frame);if(!Array.isArray(operations)||operations.length>128)throw Error('PORTRAIT_WARP_OPERATIONS');
  const field=identityPortraitField(frame.width,frame.height),lock=protection?portraitMask(protection,frame):null;
  let work=0;
  for(const op of operations){point(op.center);const rx=op.rx*frame.width,ry=op.ry*frame.height;
    if(!Number.isFinite(rx)||!Number.isFinite(ry)||rx<1||ry<1||rx>frame.width||ry>frame.height)throw Error('PORTRAIT_WARP_RADIUS');
    const amount=signed(op.amount??0),dx=signed(op.dx??0),dy=signed(op.dy??0),angle=signed(op.angle??0)*Math.PI/6;
    if(!['translate','scaleX','scaleY','scale','rotate','mShape','smooth','restore','pushLeft'].includes(op.type))throw Error('PORTRAIT_WARP_OPERATION');
    const cx=op.center.x*frame.width,cy=op.center.y*frame.height,x0=Math.max(0,Math.floor(cx-rx)),x1=Math.min(frame.width-1,Math.ceil(cx+rx)),
      y0=Math.max(0,Math.floor(cy-ry)),y1=Math.min(frame.height-1,Math.ceil(cy+ry));
    work+=(x1-x0+1)*(y1-y0+1);if(work>128_000_000)throw Error('PORTRAIT_WARP_WORK');
    const previous=op.type==='smooth'?{x:field.x.slice(),y:field.y.slice()}:null;
    for(let y=y0;y<=y1;y++){checkAbort(signal);for(let x=x0;x<=x1;x++){
      const i=y*frame.width+x;if(lock?.[i])continue;const u=(x-cx)/rx,v=(y-cy)/ry,r2=u*u+v*v;if(r2>=1)continue;
      let w=(1-r2)**2;if(pinEdges)w*=clamp(Math.min(x,y,frame.width-1-x,frame.height-1-y)/Math.max(1,Math.min(rx,ry)*.2),0,1);
      if(op.type==='restore'){field.x[i]+=(x-field.x[i])*Math.abs(amount)*w;field.y[i]+=(y-field.y[i])*Math.abs(amount)*w;continue;}
      if(op.type==='smooth'){const near=[x?i-1:i,x<frame.width-1?i+1:i,y?i-frame.width:i,y<frame.height-1?i+frame.width:i];
        const sx=near.reduce((s,j)=>s+previous.x[j]-(j%frame.width),0)/4,sy=near.reduce((s,j)=>s+previous.y[j]-Math.floor(j/frame.width),0)/4;
        field.x[i]+=(x+sx-field.x[i])*Math.abs(amount)*w;field.y[i]+=(y+sy-field.y[i])*Math.abs(amount)*w;continue;}
      let sx=x,sy=y;
      if(op.type==='translate'){sx-=dx*rx*.18*w;sy-=dy*ry*.18*w;}
      if(op.type==='scaleX'||op.type==='scale')sx=cx+(x-cx)/(1+amount*.18*w);
      if(op.type==='scaleY'||op.type==='scale')sy=cy+(y-cy)/(1+amount*.18*w);
      if(op.type==='rotate'){const a=angle*w,c=Math.cos(a),s=Math.sin(a);sx=cx+(x-cx)*c+(y-cy)*s;sy=cy-(x-cx)*s+(y-cy)*c;}
      if(op.type==='mShape')sy-=amount*ry*.12*w*Math.cos(u*Math.PI*2);
      if(op.type==='pushLeft'){sx-=amount*rx*.15*w*Math.sign(v||1);}
      field.x[i]+=sx-x;field.y[i]+=sy-y;
    }}
  }return field;
}
export function createPortraitLiquify(frame){assertPixels(frame);const base=copyFrame(frame);let states=[{operations:[],freeze:new Uint8Array(frame.width*frame.height),tool:'forward'}],cursor=0,closed=false;
  const active=()=>{if(closed)throw Error('PORTRAIT_LIQUIFY_CLOSED');return states[cursor];};
  const commit=s=>{states=states.slice(0,cursor+1);states.push(s);if(states.length>11)states.shift();cursor=states.length-1;};
  return Object.freeze({
    stroke({tool=active().tool,center,radius=.05,dx=0,dy=0,pressure=1,density=1,rate=1,reverse=false,rotation=0,scale=0,pinEdges=true}){
      const state=structuredClone(active());point(center);if(!Number.isFinite(radius)||radius<=0||radius>1||[pressure,density,rate].some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('PORTRAIT_LIQUIFY_BRUSH');
      if(state.operations.length+1+(rotation?1:0)+(scale?1:0)>128)throw Error('PORTRAIT_LIQUIFY_HISTORY_CAPACITY');
      const tools={forward:'translate',reshape:'translate',smooth:'smooth',twirl:'rotate',pucker:'scale',bloat:'scale',swell:'scale',pushLeft:'pushLeft',reconstruct:'restore',restore:'restore'};
      if(!tools[tool])throw Error('PORTRAIT_LIQUIFY_TOOL');const a=pressure*density*rate*(reverse?-1:1)*(tool==='pucker'?-1:1);
      state.operations.push({type:tools[tool],center,rx:radius,ry:radius*frame.width/frame.height,amount:a,dx:signed(dx)*a,dy:signed(dy)*a,angle:tool==='twirl'?a:signed(rotation/100),pinEdges});
      if(rotation)state.operations.push({type:'rotate',center,rx:radius,ry:radius*frame.width/frame.height,angle:signed(rotation/100)});
      if(scale)state.operations.push({type:'scale',center,rx:radius,ry:radius*frame.width/frame.height,amount:signed(scale/100)});commit(state);
    },freeze(mask,{thaw=false}={}){const state=structuredClone(active()),m=portraitMask(mask,frame);for(let i=0;i<m.length;i++)if(m[i])state.freeze[i]=thaw?0:255;commit(state);},
    switchPencilTool(tool){const s=structuredClone(active());s.tool=tool;commit(s);},
    undo(){active();if(cursor)cursor--;},redo(){active();if(cursor<states.length-1)cursor++;},reset(){active();commit({operations:[],freeze:new Uint8Array(frame.width*frame.height),tool:'forward'});},
    mask(){return active().freeze.slice();},compare(){active();return copyFrame(base);},
    preview({signal}={}){const s=active(),field=buildPortraitField(base,s.operations,{protection:s.freeze,pinEdges:s.operations.every(o=>o.pinEdges!==false),signal});return renderPortraitField(base,field,{protection:s.freeze,signal});},
    done(options){const result=this.preview(options);closed=true;states=[];return result;},cancel(){active();closed=true;states=[];return copyFrame(base);}
  });
}
function boundedControls(value,allowed){if(!value||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('PORTRAIT_FEATURE_CONTROL');for(const v of Object.values(value))signed(v);return value;}
function operation(center,rx,ry,type,amount,extras={}){return {center,rx,ry,type,amount,...extras};}
export function reshapePortraitEyes(frame,face,{imageLeft={},imageRight={},linked},options={}){
  if(linked!==undefined){imageLeft={...linked,...imageLeft};imageRight={...linked,...imageRight};}
  const controls=[imageLeft,imageRight],ops=[];
  for(let side=0;side<2;side++){const c=boundedControls(controls[side],['size','eyeballSize','height','width','distance','innerCorner','outerCorner','tilt','position']),poly=face.regions[side?'imageRightEye':'imageLeftEye'],center=polygonCenter(poly),
    w=Math.max(...poly.map(p=>p.x))-Math.min(...poly.map(p=>p.x)),h=Math.max(...poly.map(p=>p.y))-Math.min(...poly.map(p=>p.y));
    for(const [key,type] of [['size','scale'],['height','scaleY'],['width','scaleX']])if(c[key])ops.push(operation(center,w,h*2,type,c[key]));
    if(c.distance||c.position)ops.push(operation(center,w,h*2,'translate',0,{dx:(side?1:-1)*(c.distance??0),dy:-(c.position??0)}));
    if(c.tilt)ops.push(operation(center,w,h*2,'rotate',0,{angle:c.tilt}));
    const sorted=[...poly].sort((a,b)=>a.x-b.x),inner=side?sorted[0]:sorted.at(-1),outer=side?sorted.at(-1):sorted[0];
    for(const [key,p,d] of [['innerCorner',inner,side?-1:1],['outerCorner',outer,side?1:-1]])if(c[key])ops.push(operation(p,w*.4,h*1.5,'translate',0,{dx:c[key]*d}));
    if(c.eyeballSize){const iris=face.regions[side?'imageRightIris':'imageLeftIris'];if(!iris)throw Error('PORTRAIT_IRIS_REQUIRED');ops.push(operation(polygonCenter(iris),w*.4,h,'scale',c.eyeballSize));}
  }const field=buildPortraitField(frame,ops,options);return renderPortraitField(frame,field,options);
}
export function reshapePortraitMouth(frame,face,controls,options={}){
  const c=boundedControls(controls,['size','width','vertical','horizontal','mShape','tilt','upperLip','lowerLip']),poly=face.regions.outerLips,center=polygonCenter(poly),
    w=Math.max(...poly.map(p=>p.x))-Math.min(...poly.map(p=>p.x)),h=Math.max(...poly.map(p=>p.y))-Math.min(...poly.map(p=>p.y)),ops=[];
  for(const [key,type] of [['size','scale'],['width','scaleX'],['mShape','mShape']])if(c[key])ops.push(operation(center,w,h*2,type,c[key]));
  if(c.vertical||c.horizontal)ops.push(operation(center,w,h*2,'translate',0,{dx:c.horizontal??0,dy:-(c.vertical??0)}));
  if(c.tilt)ops.push(operation(center,w,h*2,'rotate',0,{angle:c.tilt}));
  for(const [key,index] of [['upperLip',0],['lowerLip',17]])if(c[key])ops.push(operation(face.landmarks[index],w*.7,h*.8,'scaleY',c[key]));
  const field=buildPortraitField(frame,ops,options);return renderPortraitField(frame,field,options);
}
export function reshapePortraitFace(frame,face,controls,options={}){
  const specs={face:[1,'scale'],temple:[127,'scaleX'],cheekbone:[123,'scaleX'],jaw:[172,'scaleX'],width:[1,'scaleX'],size:[1,'scale'],vShape:[152,'scaleX'],jawLength:[152,'scaleY'],
    hairline:[10,'translate'],foreheadHeightLeft:[67,'translate'],foreheadHeightRight:[297,'translate'],foreheadWidthLeft:[67,'scaleX'],foreheadWidthRight:[297,'scaleX'],
    philtrum:[2,'scaleY'],middleSection:[1,'scaleY'],lowerSection:[17,'scaleY'],taperChin:[152,'scaleX'],chinLength:[152,'scaleY'],chinShape:[152,'scale']};
  boundedControls(controls,Object.keys(specs));const oval=face.oval,w=Math.max(...oval.map(p=>p.x))-Math.min(...oval.map(p=>p.x)),h=Math.max(...oval.map(p=>p.y))-Math.min(...oval.map(p=>p.y)),ops=[];
  for(const [key,v] of Object.entries(controls)){if(!v)continue;const [index,type]=specs[key];
    if(['face','width','size'].includes(key))ops.push(operation(polygonCenter(oval),w*.7,h*.7,type,v));
    else{ops.push(operation(face.landmarks[index],w*.3,h*.25,type,v,type==='translate'?{dy:-v}:{}));
      const mirror={temple:356,cheekbone:352,jaw:397}[key];if(mirror)ops.push(operation(face.landmarks[mirror],w*.3,h*.25,type,v));}}
  const field=buildPortraitField(frame,ops,options);return renderPortraitField(frame,field,options);
}
export function symmetrizePortrait(frame,pairs,{amount=0,axisX=.5,mask,protection,signal}={}){
  if(!Number.isFinite(amount)||amount<0||amount>100||!Array.isArray(pairs)||pairs.length>32)throw Error('PORTRAIT_SYMMETRY');point({x:axisX,y:.5});const ops=[];
  for(const [a,b] of pairs){point(a);point(b);const half=(Math.abs(a.x-axisX)+Math.abs(b.x-axisX))/2,y=(a.y+b.y)/2;
    const rx=Math.max(.02,Math.abs(a.x-b.x)),ry=Math.max(.04,rx*frame.width/frame.height*.5);
    for(const [p,x] of [[a,axisX-half],[b,axisX+half]])ops.push(operation(p,rx,ry,'translate',0,{dx:clamp((x-p.x)/(rx*.18)*amount/100,-1,1),dy:clamp((y-p.y)/(ry*.18)*amount/100,-1,1)}));}
  const field=buildPortraitField(frame,ops,{protection,signal});return renderPortraitField(frame,field,{mask,protection,signal});
}
