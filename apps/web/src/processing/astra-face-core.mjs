import {assertPixels,checkAbort} from './pure.mjs';
import {polygonCenter,polygonMask} from './face-feature-geometry.mjs';
export const copyFaceFrame=p=>({...p,data:new Uint8ClampedArray(p.data)});
export function checkedFaceFrame(p){assertPixels(p);if(p.width*p.height>8_000_000||
  !(p.data.buffer instanceof ArrayBuffer))throw Error('ASTRA_FACE_FRAME');return p;}
export function faceAnchors(face){
  if(!face?.regions||!Array.isArray(face.landmarks)||face.landmarks.length<468)throw Error('ASTRA_FACE_INVENTORY');
  const corners=[face.landmarks[61],face.landmarks[291]].sort((a,b)=>a.x-b.x);
  return [polygonCenter(face.regions.imageLeftEye),polygonCenter(face.regions.imageRightEye),
    face.landmarks[1],...corners].map(p=>({x:p.x,y:p.y}));
}
// Least-squares similarity mapping from normalized output landmarks to source
// pixels. At least three non-collinear landmarks are required; no face ID is
// inferred from this geometry.
export function similarity(from,to){
  if(!Array.isArray(from)||!Array.isArray(to)||from.length!==to.length||from.length<3||from.length>512||
    [...from,...to].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('ASTRA_FACE_ALIGNMENT');
  const mean=a=>({x:a.reduce((s,p)=>s+p.x,0)/a.length,y:a.reduce((s,p)=>s+p.y,0)/a.length});
  const f=mean(from),t=mean(to);let den=0,a=0,b=0;
  for(let i=0;i<from.length;i++){const x=from[i].x-f.x,y=from[i].y-f.y,u=to[i].x-t.x,v=to[i].y-t.y;
    den+=x*x+y*y;a+=x*u+y*v;b+=x*v-y*u;}
  if(den<1e-10)throw Error('ASTRA_FACE_ALIGNMENT_DEGENERATE');a/=den;b/=den;
  if(a*a+b*b<1e-12)throw Error('ASTRA_FACE_ALIGNMENT_DEGENERATE');
  return (x,y)=>({x:t.x+a*(x-f.x)-b*(y-f.y),y:t.y+b*(x-f.x)+a*(y-f.y)});
}
export function sampleRGB(frame,x,y){
  if(x<0||y<0||x>frame.width-1||y>frame.height-1)return null;
  const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,cols=[0,0,0];let total=0;
  for(const [xx,yy,w] of [[a,b,(1-u)*(1-v)],[Math.min(a+1,frame.width-1),b,u*(1-v)],
    [a,Math.min(b+1,frame.height-1),(1-u)*v],[Math.min(a+1,frame.width-1),Math.min(b+1,frame.height-1),u*v]]){
    const i=(yy*frame.width+xx)*4,z=w*frame.data[i+3]/255;total+=z;
    for(let c=0;c<3;c++)cols[c]+=z*frame.data[i+c];
  }return total?cols.map(c=>c/total):null;
}
export function alignedFaceTensor(frame,face,{width,height,reference,range,channelOrder='RGB'},signal){
  checkedFaceFrame(frame);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<8||height<8||width*height>1_048_576||
    !Array.isArray(reference)||reference.length!==5||reference.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<=0||p.x>=1||p.y<=0||p.y>=1)||
    !Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]>=range[1]||
    !['RGB','BGR'].includes(channelOrder))throw Error('ASTRA_FACE_INPUT_CONTRACT');
  const source=faceAnchors(face).map(p=>({x:p.x*frame.width-.5,y:p.y*frame.height-.5}));
  const map=similarity(reference.map(p=>({x:p.x*width-.5,y:p.y*height-.5})),source);
  const out=new Float32Array(width*height*3),n=width*height;
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const p=map(x,y),rgb=sampleRGB(frame,p.x,p.y);if(!rgb)throw Error('ASTRA_FACE_CROP_INCOMPLETE');
    for(let c=0;c<3;c++)out[c*n+y*width+x]=range[0]+rgb[channelOrder==='RGB'?c:2-c]/255*(range[1]-range[0]);
  }}return out;
}
export function faceMask(frame,face,{signal,protection}={}){
  checkedFaceFrame(frame);const mask=polygonMask(frame.width,frame.height,face.oval,{signal});
  if(protection&&(!(protection instanceof Uint8Array||protection instanceof Uint8ClampedArray)||protection.length!==mask.length))
    throw Error('ASTRA_FACE_PROTECTION');
  for(let i=0;i<mask.length;i++)if(!frame.data[i*4+3]||protection?.[i])mask[i]=0;
  return mask;
}
export function featherMask(mask,width,height,radius=8,signal){
  if(!Number.isInteger(radius)||radius<1||radius>128)throw Error('ASTRA_FACE_FEATHER');
  const d=new Float32Array(mask.length);for(let i=0;i<d.length;i++)d[i]=mask[i]?radius:0;
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){const i=y*width+x;
    if(!x||!y||x===width-1||y===height-1)d[i]=0;
    else d[i]=Math.min(d[i],d[i-1]+1,d[i-width]+1);}}
  for(let y=height-1;y>=0;y--){checkAbort(signal);for(let x=width-1;x>=0;x--){const i=y*width+x;
    if(x<width-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<height-1)d[i]=Math.min(d[i],d[i+width]+1);}}
  return Uint8Array.from(d,(v,i)=>Math.round(mask[i]*Math.min(1,v/radius)));
}
export function warpFace(frame,mask,inverse,{signal}={}){
  checkedFaceFrame(frame);if(mask.length!==frame.width*frame.height)throw Error('ASTRA_FACE_MASK');
  const out=copyFaceFrame(frame);
  for(let y=0;y<frame.height;y++){checkAbort(signal);for(let x=0;x<frame.width;x++){
    const i=y*frame.width+x;if(!mask[i]||!frame.data[i*4+3])continue;
    const p=inverse(x,y);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('ASTRA_FACE_WARP');
    const rgb=sampleRGB(frame,p.x,p.y);if(!rgb)throw Error('ASTRA_FACE_WARP_UNSEEN_SURFACE');
    for(let c=0;c<3;c++)out.data[i*4+c]=Math.round(frame.data[i*4+c]+(rgb[c]-frame.data[i*4+c])*mask[i]/255);
  }}return out;
}
export function cosine(a,b){
  if(!(a instanceof Float32Array)||!(b instanceof Float32Array)||a.length!==b.length||!a.length)throw Error('ASTRA_FACE_EMBEDDING');
  let sum=0,aa=0,bb=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))throw Error('ASTRA_FACE_EMBEDDING');
    sum+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  if(aa<1e-12||bb<1e-12)throw Error('ASTRA_FACE_EMBEDDING_ZERO');return sum/Math.sqrt(aa*bb);
}
export async function checkedModelBytes(bytes,expected){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>512*1024*1024||!/^[a-f0-9]{64}$/i.test(expected??''))throw Error('ASTRA_FACE_MODEL');
  const copy=new Uint8Array(bytes),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==expected.toLowerCase())throw Error('ASTRA_FACE_MODEL_DIGEST');return {bytes:copy,digest};
}
