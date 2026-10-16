import {checkAbort} from './pure.mjs';
const LIMIT=8_000_000,LIPSCHITZ=.65,TOLERANCE=1e-5;
// Private immutable snapshots make a certificate independent of later mutation
// of the public typed arrays (including fields received across a Worker).
const certified=new WeakMap();
function certifyCellRow(d00,d10,d01,d11){
  const gx0=Math.abs(d10-d00),gx1=Math.abs(d11-d01),
    gy0=Math.abs(d01-d00),gy1=Math.abs(d11-d10);
  // The maximum over all four corner row sums separates into these maxima.
  if(Math.max(gx0,gx1)+Math.max(gy0,gy1)>LIPSCHITZ)throw Error('WEB_LIQUIFY_NONCONTRACTIVE');
}
function checked(value){
  if(!value||typeof value!=='object'||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||
    value.width<1||value.height<1||value.width*value.height>LIMIT||!(value.x instanceof Float32Array)||!(value.y instanceof Float32Array)||
    value.x.length!==value.width*value.height||value.y.length!==value.x.length||
    !(value.x.buffer instanceof ArrayBuffer)||!(value.y.buffer instanceof ArrayBuffer))throw Error('WEB_LIQUIFY_FIELD_INVALID');
}
/** Certify the continuous bilinear displacement, not only node displacements.
 * Each row of its Jacobian has absolute sum <=.65 throughout every cell:
 * that convex function attains a maximum at a cell corner. Pinned boundary
 * makes the zero-displacement extension outside the grid continuous. */
export function certifyLiquifyField(field,{signal}={}){
  checkAbort(signal);checked(field);
  if(certified.has(field))return field;
  const f={width:field.width,height:field.height,x:field.x.slice(),y:field.y.slice()},w=f.width,h=f.height;
  for(let y=0;y<h;y++){
    checkAbort(signal);
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(!Number.isFinite(f.x[i])||!Number.isFinite(f.y[i]))throw Error('WEB_LIQUIFY_FIELD_INVALID');
      if((x===0||y===0||x===w-1||y===h-1)&&(f.x[i]!==x||f.y[i]!==y))throw Error('WEB_LIQUIFY_BOUNDARY');
    }
  }
  for(let y=0;y<h-1;y++){
    checkAbort(signal);
    for(let x=0;x<w-1;x++){
      const i=y*w+x;
      certifyCellRow(f.x[i]-x,f.x[i+1]-(x+1),f.x[i+w]-x,f.x[i+w+1]-(x+1));
      certifyCellRow(f.y[i]-y,f.y[i+1]-y,f.y[i+w]-(y+1),f.y[i+w+1]-(y+1));
    }
  }
  checkAbort(signal);certified.set(field,f);return field;
}
function snapshot(field){certifyLiquifyField(field);return certified.get(field);}
function point(p){if(!p||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('WEB_LIQUIFY_POINT');}
function displacement(f,qx,qy){
  const x=Math.max(0,Math.min(f.width-1,qx)),y=Math.max(0,Math.min(f.height-1,qy)),ax=Math.floor(x),ay=Math.floor(y),
    bx=Math.min(f.width-1,ax+1),by=Math.min(f.height-1,ay+1),u=x-ax,v=y-ay;
  const at=[ay*f.width+ax,ay*f.width+bx,by*f.width+ax,by*f.width+bx],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  let dx=0,dy=0;
  for(let k=0;k<4;k++){const i=at[k];dx+=(f.x[i]-i%f.width)*weights[k];dy+=(f.y[i]-Math.floor(i/f.width))*weights[k];}
  return {x:dx,y:dy};
}
function normalized(f,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x< -.5-TOLERANCE||y< -.5-TOLERANCE||x>f.width-.5+TOLERANCE||y>f.height-.5+TOLERANCE)throw Error('WEB_LIQUIFY_MAP_OUTSIDE');
  return {x:Math.max(0,Math.min(1,(x+.5)/f.width)),y:Math.max(0,Math.min(1,(y+.5)/f.height))};
}
/** Pixel-center normalized brush coordinates: node x corresponds to (x+.5)/w.
 * Only displacement sampling clamps to the node grid. Pinned zero displacement
 * extends continuously through both outer half-pixel strips, preserving the
 * normalized image boundaries 0 and 1 without collapsing them to edge nodes. */
export function liquifyOutputToSource(field,p){point(p);const f=snapshot(field),x=p.x*f.width-.5,y=p.y*f.height-.5,d=displacement(f,x,y);return normalized(f,x+d.x,y+d.y);}
export function liquifySourceToOutput(field,p){
  point(p);const f=snapshot(field),sx=p.x*f.width-.5,sy=p.y*f.height-.5;let x=sx,y=sy;
  for(let iteration=0;iteration<96;iteration++){
    const d=displacement(f,x,y),rx=x+d.x-sx,ry=y+d.y-sy;
    if(Math.max(Math.abs(rx),Math.abs(ry))<=TOLERANCE){
      // Also bound position error by residual/(1-k), not just step size.
      if(Math.max(Math.abs(rx),Math.abs(ry))/(1-LIPSCHITZ)<=TOLERANCE)return normalized(f,x,y);
    }
    x=sx-d.x;y=sy-d.y;
  }
  throw Error('WEB_LIQUIFY_INVERSE_DID_NOT_CONVERGE');
}
