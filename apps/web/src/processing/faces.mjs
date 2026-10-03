import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {assertPixels,checkAbort,validateDetections,MAX_FACES,WEB_ENGINE} from './pure.mjs';
import {sha256} from './raw.mjs';
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
  if(!landmarker){const response=await fetch('/runtime_assets/face_landmarker.task',{signal});if(!response.ok)throw Error('FACE_MODEL_UNAVAILABLE');const model=await response.arrayBuffer();modelSHA256=await sha256(model);checkAbort(signal);
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
export async function detectPeople(pixels,{signal}={}) {
  assertPixels(pixels);checkAbort(signal);if(typeof OffscreenCanvas==='undefined')throw Error('WORKER_OFFSCREEN_CANVAS_UNAVAILABLE');
  const detector=await initialize(signal);checkAbort(signal);const canvas=new OffscreenCanvas(pixels.width,pixels.height),context=canvas.getContext('2d',{colorSpace:'srgb'});if(!context)throw Error('WORKER_CANVAS_UNAVAILABLE');
  context.putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);
  const result=detector.detect(canvas);checkAbort(signal);const detections=detectionsFromLandmarks(result.faceLandmarks,ovalIndices());
  // Enumerable per-detection provenance survives structured clone. complete is geometric, not all-visible-human certainty.
  for(const d of detections)d.provenance={engineVersion:WEB_ENGINE,package:'@mediapipe/tasks-vision',packageVersion:'1.0.1',modelSHA256,maskType:'face-oval-polygon-not-person-segmentation',numFaces:MAX_FACES,minimumConfidence:.7,completeness:'landmarks-in-frame-nonoverlap-below-detector-cap',orientation:'input-upright-zero-origin'};
  return detections;
}
