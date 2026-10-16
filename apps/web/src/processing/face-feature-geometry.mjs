import {checkAbort} from './pure.mjs';

export function convexHull(points) {
  const sorted = [...points].map(p => ({x: p.x, y: p.y})).sort((a,b) => a.x-b.x || a.y-b.y)
    .filter((p,i,a) => !i || p.x !== a[i-1].x || p.y !== a[i-1].y);
  const cross = (o,a,b) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const half = values => { const out=[]; for (const p of values) {
    while(out.length>1 && cross(out[out.length-2],out[out.length-1],p)<=0) out.pop();
    out.push(p);
  } return out; };
  if(sorted.length<3) throw Error('FACE_FEATURE_POLYGON_DEGENERATE');
  return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}
export function pointInPolygon(x,y,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if(((a.y>y)!==(b.y>y)) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function validPolygon(polygon) {
  if(!Array.isArray(polygon)||polygon.length<3||polygon.length>1024||
      polygon.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
        p.x<0||p.x>1||p.y<0||p.y>1)) throw Error('FACE_FEATURE_POLYGON_INVALID');
}
export function polygonMask(width,height,polygon,{exclude=[],signal}={}) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
      width*height>8_000_000) throw Error('FACE_FEATURE_CAPACITY');
  validPolygon(polygon);
  if(!Array.isArray(exclude)||exclude.length>32) throw Error('FACE_FEATURE_EXCLUSIONS_INVALID');
  exclude.forEach(validPolygon);
  const out=new Uint8Array(width*height);
  const x0=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.x))*width));
  const x1=Math.min(width-1,Math.ceil(Math.max(...polygon.map(p=>p.x))*width));
  const y0=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.y))*height));
  const y1=Math.min(height-1,Math.ceil(Math.max(...polygon.map(p=>p.y))*height));
  for(let y=y0;y<=y1;y++) {checkAbort(signal);for(let x=x0;x<=x1;x++) {
    const u=(x+.5)/width,v=(y+.5)/height;
    if(pointInPolygon(u,v,polygon)&&!exclude.some(p=>pointInPolygon(u,v,p)))out[y*width+x]=255;
  }}
  checkAbort(signal);return out;
}
export function polygonCenter(polygon) {
  return {x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,
    y:polygon.reduce((s,p)=>s+p.y,0)/polygon.length};
}
export function expandPolygon(polygon,scale) {
  validPolygon(polygon);
  if(!Number.isFinite(scale)||scale<1||scale>3)throw Error('FACE_FEATURE_EXPANSION_INVALID');
  const c=polygonCenter(polygon);
  return polygon.map(p=>({x:Math.max(0,Math.min(1,c.x+(p.x-c.x)*scale)),
    y:Math.max(0,Math.min(1,c.y+(p.y-c.y)*scale))}));
}
