import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {assertPixels,checkAbort,validateDetections,intersectionOverUnion,MAX_FACES,WEB_ENGINE} from './pure.mjs';
import {sha256} from './sha256.mjs';
import {PERSON_MODEL_SHA256} from '../person-privacy.mjs';
import {convexHull, polygonCenter} from './face-feature-geometry.mjs';
let landmarker,modelSHA256;
// Ordered connected oval, derived at runtime from the package's official connection list.
function ovalIndices() {
  const edges=FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,graph=new Map();
  for(const {start,end} of edges){graph.set(start,[...(graph.get(start)||[]),end]);graph.set(end,[...(graph.get(end)||[]),start]);}
  if(!graph.size||[...graph.values()].some(v=>v.length!==2))throw Error('INVALID_MODEL_FACE_OVAL');
  const first=Math.min(...graph.keys()),out=[first];let previous=-1,current=first;
  do {const next=graph.get(current).find(v=>v!==previous);if(next===first)break;if(out.includes(next))throw Error('INVALID_MODEL_FACE_OVAL');out.push(next);previous=current;current=next;}while(out.length<=graph.size);
  if(out.length!==graph.size)throw Error('INVALID_MODEL_FACE_OVAL');return out;
}
async function initialize(signal) {
  if(!landmarker){const response=await fetch('/runtime_assets/face_landmarker.task',{signal});if(!response.ok)throw Error('FACE_MODEL_UNAVAILABLE');const model=await response.arrayBuffer();modelSHA256=await sha256(model);if(modelSHA256!==PERSON_MODEL_SHA256)throw Error('FACE_MODEL_SHA_MISMATCH');checkAbort(signal);
    const files=await FilesetResolver.forVisionTasks('/vendor/mediapipe/');
    landmarker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(model),delegate:'CPU'},runningMode:'IMAGE',numFaces:MAX_FACES,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
  }
  return landmarker;
}
export function detectionsFromLandmarks(faces,indices) {
  if(!Array.isArray(faces)||!faces.length||faces.length>=MAX_FACES)throw Error('MISSING_OR_SATURATED_FACE_INVENTORY');
  const detections=faces.map(points=>{
    if(!Array.isArray(points)||points.length<468||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)||p.x<=0||p.y<=0||p.x>=1||p.y>=1))throw Error('PARTIAL_OR_INVALID_FACE');
    const mask=indices.map(i=>({x:points[i].x,y:points[i].y}));
    const x=Math.min(...mask.map(p=>p.x)),top=Math.min(...mask.map(p=>p.y)),right=Math.max(...mask.map(p=>p.x)),bottom=Math.max(...mask.map(p=>p.y));
    if(x<=.005||top<=.005||right>=.995||bottom>=.995||right-x<.01||bottom-top<.01)throw Error('PARTIAL_OR_TOO_SMALL_FACE');
    return {anchor:{x,y:1-bottom,width:right-x,height:bottom-top},mask,complete:true};
  });
  return validateDetections(detections);
}
// A fixed, bounded search is used only when the full frame yields no landmarks.
// Tiles are analysis copies, never a rewritten Original/Proxy/Recipe.
export function faceTilePlan(width,height) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<640||height<640)return [];
  const tileWidth=Math.min(width,Math.max(512,Math.round(width*.34)));
  const tileHeight=Math.min(height,Math.max(512,Math.round(height*.62)));
  const maxX=width-tileWidth,maxY=height-tileHeight;
  const xs=[0,Math.round(maxX/3),Math.round(maxX*2/3),maxX];
  const ys=[0,maxY];
  return ys.flatMap(y=>xs.map(x=>({x,y,width:tileWidth,height:tileHeight})))
    .filter((tile,index,all)=>all.findIndex(other=>other.x===tile.x&&other.y===tile.y)===index);
}
function projectTileDetection(detection,tile,width,height) {
  const mask=detection.mask.map(point=>({
    x:(tile.x+point.x*tile.width)/width,
    y:(tile.y+point.y*tile.height)/height}));
  const x=Math.min(...mask.map(point=>point.x));
  const right=Math.max(...mask.map(point=>point.x));
  const top=Math.min(...mask.map(point=>point.y));
  const bottom=Math.max(...mask.map(point=>point.y));
  const a=detection.anchor;
  const clearance=Math.min(a.x,a.y,1-a.x-a.width,1-a.y-a.height);
  return {detection:{anchor:{x,y:1-bottom,width:right-x,height:bottom-top},mask,complete:true},clearance};
}
// The model exposes no comparable confidence score. Keep the candidate whose
// oval is farther from its tile edge; refuse non-identical overlapping faces.
export function mergeTiledDetections(candidates) {
  if(!Array.isArray(candidates))throw Error('INVALID_TILE_FACE_CANDIDATES');
  const accepted=[];
  for(const candidate of candidates){
    if(!candidate?.detection||!Number.isFinite(candidate.clearance))throw Error('INVALID_TILE_FACE_CANDIDATES');
    const a=candidate.detection.anchor;
    let duplicate=-1;
    for(let i=0;i<accepted.length;i++){
      const b=accepted[i].detection.anchor;
      const overlap=intersectionOverUnion(a,b);
      if(overlap>=.7){if(duplicate!==-1)throw Error('AMBIGUOUS_TILE_FACE_OVERLAP');duplicate=i;}
      else if(overlap>0)throw Error('AMBIGUOUS_TILE_FACE_OVERLAP');
    }
    if(duplicate===-1)accepted.push(candidate);
    else if(candidate.clearance>accepted[duplicate].clearance)accepted[duplicate]=candidate;
  }
  return validateDetections(accepted.map(item=>item.detection));
}
const recoverableTileError=new Set(['PARTIAL_OR_INVALID_FACE','PARTIAL_OR_TOO_SMALL_FACE',
  'INVALID_DETECTION_ANCHOR','INVALID_FACE_POLYGON','POLYGON_OUTSIDE_FACE',
  'DEGENERATE_FACE_POLYGON','SELF_INTERSECTING_FACE_POLYGON']);
function tiledDetections(detector,source,signal,indices){
  const tiles=faceTilePlan(source.width,source.height),candidates=[],rejected=[];
  if(!tiles.length)throw Error('MISSING_OR_SATURATED_FACE_INVENTORY');
  for(const tile of tiles){
    checkAbort(signal);
    const scale=Math.min(1,1024/Math.max(tile.width,tile.height));
    const canvas=new OffscreenCanvas(Math.max(1,Math.round(tile.width*scale)),
      Math.max(1,Math.round(tile.height*scale)));
    const context=canvas.getContext('2d',{colorSpace:'srgb'});
    if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
    context.drawImage(source,tile.x,tile.y,tile.width,tile.height,0,0,canvas.width,canvas.height);
    const result=detector.detect(canvas);checkAbort(signal);
    const faces=result?.faceLandmarks;
    if(!Array.isArray(faces))throw Error('FACE_MODEL_RESULT_INVALID');
    if(faces.length>=MAX_FACES)throw Error('FACE_TILE_SATURATED_INVENTORY');
    for(const points of faces){
      try{candidates.push(projectTileDetection(detectionsFromLandmarks([points],indices)[0],
        tile,source.width,source.height));}
      catch(error){if(!recoverableTileError.has(error.message))throw error;
        rejected.push(error.message);}
    }
  }
  if(!candidates.length)throw Error(`FACE_TILE_NO_VALID_FACE:${rejected.length?
    [...new Set(rejected)].join(','):'NO_MODEL_FACE'}`);
  return {detections:mergeTiledDetections(candidates),tiles:tiles.length,rejected};
}
export async function detectPeople(pixels,{signal}={}) {
  assertPixels(pixels);checkAbort(signal);if(typeof OffscreenCanvas==='undefined')throw Error('WORKER_OFFSCREEN_CANVAS_UNAVAILABLE');
  const detector=await initialize(signal);checkAbort(signal);const canvas=new OffscreenCanvas(pixels.width,pixels.height),context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
  context.putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);
  const result=detector.detect(canvas);checkAbort(signal);
  if(!Array.isArray(result?.faceLandmarks))throw Error('FACE_MODEL_RESULT_INVALID');
  if(result.faceLandmarks.length>=MAX_FACES)throw Error('MISSING_OR_SATURATED_FACE_INVENTORY');
  const indices=ovalIndices();
  const recovered=result.faceLandmarks.length?null:tiledDetections(detector,canvas,signal,indices);
  const detections=recovered?.detections||detectionsFromLandmarks(result.faceLandmarks,indices);
  // Enumerable per-detection provenance survives structured clone. complete is geometric, not all-visible-human certainty.
  for(const d of detections)d.provenance={engineVersion:WEB_ENGINE,package:'@mediapipe/tasks-vision',packageVersion:'1.0.1',modelSHA256,maskType:'face-oval-polygon-not-person-segmentation',numFaces:MAX_FACES,minimumConfidence:.7,completeness:recovered?'detected-local-faces-only-not-exhaustive':'landmarks-in-frame-nonoverlap-below-detector-cap',orientation:'input-upright-zero-origin',tileFallback:!!recovered,tileCount:recovered?.tiles||0,tileRejectedReasons:[...new Set(recovered?.rejected||[])]};
  return detections;
}

// A separate opt-in detailed inventory. The existing oval-only API is unchanged.
// The local pinned model supplies geometry, not identity, consent, segmentation
// or an occlusion confidence. Screen-left/right names are deliberately explicit.
export async function detectFaceFeatures(pixels,{signal}={}) {
  assertPixels(pixels);checkAbort(signal);
  if(pixels.width*pixels.height>8_000_000)throw Error('FACE_FEATURE_CAPACITY');
  if(typeof OffscreenCanvas==='undefined')throw Error('WORKER_OFFSCREEN_CANVAS_UNAVAILABLE');
  const detector=await initialize(signal);checkAbort(signal);
  const canvas=new OffscreenCanvas(pixels.width,pixels.height);
  const context=canvas.getContext('2d',{colorSpace:'srgb'});
  if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height),0,0);
  const result=detector.detect(canvas);checkAbort(signal);
  const raw=result?.faceLandmarks;
  if(!Array.isArray(raw)||!raw.length||raw.length>=MAX_FACES)
    throw Error('MISSING_OR_SATURATED_FACE_INVENTORY');
  const ovals=detectionsFromLandmarks(raw,ovalIndices());
  const region=(points,connections)=>{
    if(!Array.isArray(connections)||!connections.length)throw Error('FACE_FEATURE_TOPOLOGY_UNAVAILABLE');
    const indices=[...new Set(connections.flatMap(e=>[e.start,e.end]))];
    if(indices.some(i=>!points[i]))return null;
    return convexHull(indices.map(i=>points[i]));
  };
  const faces=raw.map((source,index)=>{
    const landmarks=source.map(p=>({x:p.x,y:p.y,z:p.z}));
    const eyeA=region(landmarks,FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
    const eyeB=region(landmarks,FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
    const aLeft=polygonCenter(eyeA).x<polygonCenter(eyeB).x;
    const browA=region(landmarks,FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW);
    const browB=region(landmarks,FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
    const irisA=landmarks.length>=478?region(landmarks,FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS):null;
    const irisB=landmarks.length>=478?region(landmarks,FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS):null;
    const regions={imageLeftEye:aLeft?eyeA:eyeB,imageRightEye:aLeft?eyeB:eyeA,
      imageLeftBrow:aLeft?browA:browB,imageRightBrow:aLeft?browB:browA,
      imageLeftIris:aLeft?irisA:irisB,imageRightIris:aLeft?irisB:irisA,
      outerLips:region(landmarks,FaceLandmarker.FACE_LANDMARKS_LIPS)};
    // Cheek support is a SUITE mesh region, not a semantic skin segment.
    const cheekA=convexHull([50,101,118,117,123,147,187,205].map(i=>landmarks[i]));
    const cheekB=convexHull([280,330,347,346,352,376,411,425].map(i=>landmarks[i]));
    const cheekALeft=polygonCenter(cheekA).x<polygonCenter(cheekB).x;
    regions.imageLeftCheek=cheekALeft?cheekA:cheekB;
    regions.imageRightCheek=cheekALeft?cheekB:cheekA;
    const l=polygonCenter(regions.imageLeftEye),r=polygonCenter(regions.imageRightEye);
    const dx=(r.x-l.x)*pixels.width,dy=(r.y-l.y)*pixels.height,span=Math.hypot(dx,dy);
    if(span<8)throw Error('FACE_FEATURE_TOO_SMALL');
    const mid={x:(l.x+r.x)/2,y:(l.y+r.y)/2},nose=landmarks[1],mouth=polygonCenter(regions.outerLips);
    const along=p=>((p.x-mid.x)*pixels.width*dx+(p.y-mid.y)*pixels.height*dy)/(span*span);
    const down=p=>((p.y-mid.y)*pixels.height*dx-(p.x-mid.x)*pixels.width*dy)/(span*span);
    const mouthDown=down(mouth);
    const pose={rollRadians:Math.atan2(dy,dx),yawAsymmetry:2*Math.abs(along(nose)),
      pitchRatio:mouthDown>0?down(nose)/mouthDown:NaN};
    return {landmarks,oval:ovals[index].mask,regions,pose,
      visibility:'not-proven-by-landmarks',
      provenance:{modelSHA256,package:'@mediapipe/tasks-vision',packageVersion:'1.0.1',
        topology:'mediapipe-face-landmarker-468-plus-optional-iris',
        regions:'convex-landmark-hulls-not-semantic-segmentation'}};
  });
  return {width:pixels.width,height:pixels.height,modelSHA256,faces};
}
