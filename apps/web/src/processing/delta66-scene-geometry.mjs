import {assertPixels,checkAbort,MAX_PIXELS} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {checkedModelBytes} from './astra-face-core.mjs';
import {resizeAstraFrame} from './astra-image-model.mjs';
export {rotateCropPixels as rotateSceneRightAngle} from './pure.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function invert(m){const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
  if(!Number.isFinite(det)||Math.abs(det)<1e-8)throw Error('SCENE_SINGULAR_TRANSFORM');
  return [A,c*h-b*i,b*f-c*e,B,a*i-c*g,c*d-a*f,C,b*g-a*h,a*e-b*d].map(v=>v/det);}
const multiply=(a,b)=>Array.from({length:9},(_,i)=>[0,1,2].reduce((sum,k)=>sum+a[Math.floor(i/3)*3+k]*b[k*3+i%3],0));
function matrix(m){if(!Array.isArray(m)||m.length!==9||Array.from({length:9},(_,i)=>m[i]).some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw Error('SCENE_MATRIX_INVALID');invert(m);return m;}
export const MAX_SCENE_GEOMETRY_WORKING_BYTES=256*1024*1024;
/** A linear projective denominator reaches its extrema at the rectangle's
 * corners. Reject a horizon touching/crossing any part of the output frame,
 * even if no discrete pixel center happens to land on it. */
export function validateSceneGeometryMatrix(inverse){
  matrix(inverse);
  const [g,h,i]=inverse.slice(6),corners=[i,g+i,h+i,g+h+i];
  const epsilon=1e-8*Math.max(1,...corners.map(Math.abs));
  if(!corners.every(v=>v>epsilon)&&!corners.every(v=>v<-epsilon))throw Error('SCENE_PROJECTIVE_HORIZON');
  return [...inverse];
}
/** Destination-normalized -> source-normalized homography. Transparent outside;
 * straight-alpha bilinear sampling excludes hidden RGB from interpolation. */
export function warpScene(pixels,inverse,{width=pixels.width,height=pixels.height,signal}={}){
  assertPixels(pixels);checkAbort(signal);inverse=validateSceneGeometryMatrix(inverse);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_PIXELS)throw Error('SCENE_GEOMETRY_CAPACITY');
  if((pixels.width*pixels.height+width*height)*4>MAX_SCENE_GEOMETRY_WORKING_BYTES)throw Error('SCENE_GEOMETRY_MEMORY_LIMIT');
  // Preserve canonical source dimensions without manufacturing an invalid
  // proxy whose raster is larger than its claimed original.
  if(Object.hasOwn(pixels,'sourceWidth')&&(width>pixels.sourceWidth||height>pixels.sourceHeight))throw Error('SCENE_GEOMETRY_SOURCE_DIMENSIONS');
  let data;try{data=new Uint8ClampedArray(width*height*4);}catch{throw Error('SCENE_GEOMETRY_ALLOCATION_FAILED');}
  const identity=inverse[0]===inverse[8]&&inverse[4]===inverse[8]&&
    [1,2,3,5,6,7].every(i=>inverse[i]===0);
  if(identity&&width===pixels.width&&height===pixels.height){
    for(let y=0;y<height;y++){checkAbort(signal);data.set(pixels.data.subarray(y*width*4,(y+1)*width*4),y*width*4);}
    return {...pixels,width,height,data};
  }
  for(let y=0;y<height;y++){checkAbort(signal);for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height,d=inverse[6]*u+inverse[7]*v+inverse[8];if(Math.abs(d)<1e-8)throw Error('SCENE_PROJECTIVE_HORIZON');
    const sx=(inverse[0]*u+inverse[1]*v+inverse[2])/d*pixels.width-.5,sy=(inverse[3]*u+inverse[4]*v+inverse[5])/d*pixels.height-.5;
    if(sx<-.5||sy<-.5||sx>pixels.width-.5||sy>pixels.height-.5)continue;
    const xx=clamp(sx,0,pixels.width-1),yy=clamp(sy,0,pixels.height-1),a=Math.floor(xx),b=Math.floor(yy),tx=xx-a,ty=yy-b;
    const taps=[[a,b,(1-tx)*(1-ty)],[Math.min(a+1,pixels.width-1),b,tx*(1-ty)],
      [a,Math.min(b+1,pixels.height-1),(1-tx)*ty],[Math.min(a+1,pixels.width-1),Math.min(b+1,pixels.height-1),tx*ty]];
    const color=[0,0,0];let alpha=0;for(const [px,py,w] of taps){const o=(py*pixels.width+px)*4,k=w*pixels.data[o+3];alpha+=k;for(let c=0;c<3;c++)color[c]+=pixels.data[o+c]*k;}
    const out=(y*width+x)*4;data[out+3]=Math.round(alpha);if(alpha)for(let c=0;c<3;c++)data[out+c]=Math.round(color[c]/alpha);
  }}return {...pixels,width,height,data};
}
/** Explicit aspect/scale/offset/angle and two perspective coefficients. Flip
 * changes sampling geometry, not file orientation metadata. Rotate is degrees. */
export function sceneTransformMatrix({angle=0,flipX=false,flipY=false,aspect=1,frameAspect=1,scale=1,x=0,y=0,vertical=0,horizontal=0}={}){
  if(![angle,aspect,frameAspect,scale,x,y,vertical,horizontal].every(Number.isFinite)||frameAspect<=0||frameAspect>100||Math.abs(angle)>180||aspect<.2||aspect>5||scale<.2||scale>5||
    Math.abs(x)>2||Math.abs(y)>2||Math.abs(vertical)>.8||Math.abs(horizontal)>.8||typeof flipX!=='boolean'||typeof flipY!=='boolean')throw Error('SCENE_TRANSFORM_RANGE');
  const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),sx=scale*aspect*(flipX?-1:1),sy=scale*(flipY?-1:1);
  const forward=multiply([1,0,.5+x,0,1,.5+y,0,0,1],multiply([c*sx,-s*sy/frameAspect,0,s*sx*frameAspect,c*sy,0,horizontal,vertical,1],[1,0,-.5,0,1,-.5,0,0,1]));
  return invert(forward);
}
/** Four corresponding guides solve a real projective transform; reject
 * degenerate constraints rather than silently using a guessed vertical angle. */
export function guidedSceneTransform(sourcePoints,destinationPoints){
  if(![sourcePoints,destinationPoints].every(p=>Array.isArray(p)&&p.length===4&&p.every(v=>
    v&&[v.x,v.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))))throw Error('SCENE_GUIDES_INVALID');
  const rows=[];for(let k=0;k<4;k++){
    const {x,y}=destinationPoints[k],u=sourcePoints[k].x,v=sourcePoints[k].y;
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
  for(let c=0;c<8;c++){
    let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    if(Math.abs(rows[pivot][c])<1e-9)throw Error('SCENE_GUIDES_DEGENERATE');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];const d=rows[c][c];for(let j=c;j<9;j++)rows[c][j]/=d;
    for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let j=c;j<9;j++)rows[r][j]-=f*rows[c][j];}
  }
  return matrix([...rows.map(r=>r[8]),1]);
}
/** Crop from actual detected face or supplied semantic subject bounds. Head
 * bounds must be supplied explicitly: face oval is not a hair/head detector. */
export function planLocatedCrop(pixels,bounds,{ratio,headFraction=.45,topMargin=.1,horizontal=.5,allowExpand=false}={}){
  assertPixels(pixels);
  if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height,ratio,headFraction,topMargin,horizontal].every(Number.isFinite)||
    bounds.width<=0||bounds.height<=0||bounds.x<0||bounds.y<0||bounds.x+bounds.width>1||bounds.y+bounds.height>1||
    ratio<=0||ratio>10||headFraction<.05||headFraction>1||topMargin<0||topMargin>.8||horizontal<0||horizontal>1||typeof allowExpand!=='boolean')throw Error('CROP_LOCATE_PARAMETERS');
  let height=bounds.height*pixels.height/headFraction,width=height*ratio;
  if(!allowExpand){const shrink=Math.min(1,pixels.width/width,pixels.height/height);width*=shrink;height*=shrink;}
  let x=(bounds.x+bounds.width/2)*pixels.width-width*horizontal,y=bounds.y*pixels.height-height*topMargin;
  if(!allowExpand){x=clamp(x,0,pixels.width-width);y=clamp(y,0,pixels.height-height);}
  return {x:x/pixels.width,y:y/pixels.height,width:width/pixels.width,height:height/pixels.height,
    requestedHeadFraction:headFraction,actualHeadFraction:bounds.height*pixels.height/height,requiresExpansion:x<0||y<0||x+width>pixels.width||y+height>pixels.height};
}
export async function locateFaceCrop(pixels,{faceIndex,settings,signal}={}){
  if(!Number.isInteger(faceIndex)||faceIndex<0)throw Error('CROP_FACE_SELECTION_REQUIRED');
  const detections=await detectFaceFeatures(pixels,{signal});checkAbort(signal);const face=detections.faces[faceIndex];if(!face)throw Error('CROP_FACE_NOT_FOUND');
  const xs=face.oval.map(p=>p.x),ys=face.oval.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
  return {crop:planLocatedCrop(pixels,{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y},settings),
    faceIndex,modelSHA256:detections.modelSHA256,boundsKind:'face-oval-not-head'};
}
export function cropOrientationRule(pixels,rules){
  assertPixels(pixels);const key=pixels.width>=pixels.height?'landscape':'portrait';
  if(!rules?.[key])throw Error('CROP_ORIENTATION_RULE_MISSING');return structuredClone(rules[key]);
}
/** Render an explicit crop including transparent expansion. Physical target
 * dimensions are metadata, not permission to bypass shared print/export gates. */
export function renderSceneCrop(pixels,rect,{width,height,widthMM,heightMM,ppi=300,signal}={}){
  assertPixels(pixels);if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||Math.abs(rect.x)>4||Math.abs(rect.y)>4||rect.width>8||rect.height>8)throw Error('SCENE_CROP_RECT');
  const physical=widthMM!==undefined||heightMM!==undefined;
  if(physical){if(width!==undefined||height!==undefined||![widthMM,heightMM,ppi].every(v=>Number.isFinite(v)&&v>0)||ppi>2400)throw Error('SCENE_CROP_PHYSICAL');width=Math.round(widthMM/25.4*ppi);height=Math.round(heightMM/25.4*ppi);}
  else{width??=Math.round(rect.width*pixels.width);height??=Math.round(rect.height*pixels.height);}
  const cropAspect=rect.width*pixels.width/(rect.height*pixels.height);
  if(Math.abs(width-height*cropAspect)>Math.max(1,cropAspect))throw Error('SCENE_CROP_OUTPUT_ASPECT_MISMATCH');
  const frame=warpScene(pixels,[rect.width,0,rect.x,0,rect.height,rect.y,0,0,1],{width,height,signal});
  return {pixels:frame,outputMetadata:physical?{widthMM,heightMM,ppi}:null,crop:structuredClone(rect)};
}
export function sceneRegionBounds(pixels,mask,{threshold=.5}={}){
  assertPixels(pixels);if(!(mask instanceof Uint8Array)||mask.length!==pixels.width*pixels.height||!Number.isFinite(threshold)||threshold<=0||threshold>=1)throw Error('SCENE_BOUNDS_MASK');
  let x0=pixels.width,y0=pixels.height,x1=-1,y1=-1;
  for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(mask[y*pixels.width+x]>=threshold*255){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(x1<0)throw Error('SCENE_REGION_NOT_FOUND');return {x:x0/pixels.width,y:y0/pixels.height,width:(x1-x0+1)/pixels.width,height:(y1-y0+1)/pixels.height};
}
/** Actual geometry-regression ONNX inference. Output is eight coefficients of
 * a destination-normalized inverse homography with h33=1. Models are separate
 * declared modes smart/level/vertical; no untrained edge heuristic is called AI. */
export async function createSceneGeometryEstimator({ort,modelAssetBuffer,modelSHA256,inputName,outputName,width,height,mode,
  sessionOptions={executionProviders:['wasm']}}={}, {signal}={}){
  if(!['smart','level','vertical'].includes(mode)||!ort?.Tensor||!ort?.InferenceSession||
    ![inputName,outputName].every(v=>typeof v==='string'&&v)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<8||height<8||width*height>1_048_576)throw Error('SCENE_GEOMETRY_MODEL_CONTRACT');
  const bytes=await checkedModelBytes(modelAssetBuffer,modelSHA256);checkAbort(signal);
  const session=await ort.InferenceSession.create(bytes,sessionOptions);
  if(session.inputNames.length!==1||session.inputNames[0]!==inputName||!session.outputNames.includes(outputName)){
    await session.release();throw Error('SCENE_GEOMETRY_MODEL_IO');}
  let closed=false,busy=false;return Object.freeze({mode,modelSHA256,
    async estimate(pixels,{signal}={}){
      assertPixels(pixels);checkAbort(signal);if(closed||busy)throw Error('SCENE_GEOMETRY_MODEL_UNAVAILABLE');
      const scaled=resizeAstraFrame(pixels,width,height,{signal}),n=width*height,data=new Float32Array(n*3);
      for(let i=0;i<n;i++)for(let c=0;c<3;c++)data[c*n+i]=scaled.data[i*4+c]/255;
      const tensor=new ort.Tensor('float32',data,[1,3,height,width]);let result;busy=true;
      try{result=await session.run({[inputName]:tensor},[outputName]);checkAbort(signal);const out=result[outputName];
        if(out?.type!=='float32'||out.data?.length!==8||out.dims.length!==2||out.dims[0]!==1||out.dims[1]!==8)throw Error('SCENE_GEOMETRY_MODEL_OUTPUT');
        return matrix([...out.data,1]);
      }finally{Object.values(result||{}).forEach(t=>t.dispose?.());tensor.dispose?.();busy=false;}
    },async close(){if(busy)throw Error('SCENE_GEOMETRY_MODEL_BUSY');if(!closed){closed=true;await session.release();}}
  });
}
