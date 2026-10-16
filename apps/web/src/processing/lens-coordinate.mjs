import {validateWebLensShading} from '../../../../dist/apps/backend/src/web-connected-lens.js';
import {lensSampleCoordinates} from './lr-lens-correction.mjs';
const LIMIT=.65,TOLERANCE=1e-5;
const maps=new WeakMap();
/** Conservative analytic certificate over the entire closed pixel-node rectangle.
 * With |nx|<=X, |ny|<=Y, bound every row of J(displacement). For radial
 * A(r2), d(nx*A)/dnx=A+2nx^2*A', d/dny=2nx*ny*A'. Tangential derivatives
 * are affine and bounded by absolute coefficients. Channel scaling contributes
 * |s-1| to the identity diagonal. This proves injectivity on this convex domain;
 * no sampled Jacobian or radial-only monotonicity assumption is used. */
export function createLensCoordinateMap(settings,width,height){
  validateWebLensShading(settings);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>24_000_000||
    Math.abs(width/height/settings.profile.aspectRatio-1)>.002)throw Error('LENS_FRAME_OR_SETTINGS_INVALID');
  const p=structuredClone(settings.profile),d=settings.distortion??0,c=settings.chromatic??0;
  const radius=Math.min(width,height)/2,cx=p.center[0]*width-.5,cy=p.center[1]*height-.5;
  const X=Math.max(Math.abs(cx),Math.abs(width-1-cx))/radius,Y=Math.max(Math.abs(cy),Math.abs(height-1-cy))/radius,R=X*X+Y*Y;
  const [k1,k2,k3]=p.radial.map(Math.abs),[t1,t2]=p.tangential.map(Math.abs);
  const A=k1*R+k2*R*R+k3*R*R*R,B=k1+2*k2*R+3*k3*R*R;
  const rowX=d*(A+2*X*(X+Y)*B+2*t1*(X+Y)+t2*(6*X+2*Y));
  const rowY=d*(A+2*Y*(X+Y)*B+t1*(2*X+6*Y)+2*t2*(X+Y));
  let bound=0;
  for(const scale of p.channelScale){const s=1+c*(scale-1);bound=Math.max(bound,Math.abs(s-1)+Math.abs(s)*Math.max(rowX,rowY));}
  if(!Number.isFinite(bound)||bound>LIMIT)throw Error('LENS_COORDINATE_NONCONTRACTIVE');
  const map=Object.freeze({width,height});
  maps.set(map,{p,width,height,d,c,bound,identity:d===0&&c===0});return map;
}
function state(map){const value=maps.get(map);if(!value)throw Error('LENS_COORDINATE_MAP_INVALID');return value;}
function point(p){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1||p.y>1)throw Error('LENS_COORDINATE_OUTSIDE');}
function donors(f,x,y){
  const rgb=lensSampleCoordinates(f.p,f.width,f.height,x,y,f.d,f.c);
  for(const [sx,sy] of rgb)if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sy<0||sx>f.width-1||sy>f.height-1)throw Error('LENS_COORDINATE_OUTSIDE');
  return rgb;
}
export function lensOutputToSource(map,p){
  point(p);const f=state(map);if(f.identity)return {x:p.x,y:p.y};
  const x=p.x*f.width-.5,y=p.y*f.height-.5;
  if(x<0||y<0||x>f.width-1||y>f.height-1)throw Error('LENS_COORDINATE_OUTSIDE');
  const green=donors(f,x,y)[1];return {x:(green[0]+.5)/f.width,y:(green[1]+.5)/f.height};
}
/** Projected fixed-point contraction on the certified closed rectangle. Projection
 * is nonexpansive in infinity norm, hence convergence is unique. The final
 * unprojected equation residual must also pass: a projected boundary fixed point
 * is NOT automatically an inverse. Outside-image solutions are rejected. */
export function lensSourceToOutput(map,p){
  point(p);const f=state(map);if(f.identity)return {x:p.x,y:p.y};
  const sx=p.x*f.width-.5,sy=p.y*f.height-.5;
  let x=Math.max(0,Math.min(f.width-1,sx)),y=Math.max(0,Math.min(f.height-1,sy));
  for(let i=0;i<96;i++){
    const green=lensSampleCoordinates(f.p,f.width,f.height,x,y,f.d,f.c)[1];
    const ex=green[0]-sx,ey=green[1]-sy;
    if(Math.max(Math.abs(ex),Math.abs(ey))/(1-f.bound)<=TOLERANCE){
      donors(f,x,y);return {x:(x+.5)/f.width,y:(y+.5)/f.height};
    }
    x=Math.max(0,Math.min(f.width-1,x-ex));y=Math.max(0,Math.min(f.height-1,y-ey));
  }
  throw Error('LENS_COORDINATE_INVERSE_UNAVAILABLE');
}
