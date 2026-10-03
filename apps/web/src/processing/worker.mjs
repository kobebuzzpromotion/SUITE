import {validateRecipe} from '../../../backend/src/photo-policy.ts';
import {resolutionAssessment,validateExportSettings} from '../../../backend/src/crop-export.ts';
import {decodeRaw} from './raw.mjs';
import {encode} from './encode.mjs';
import {renderPixels,makeProxyPixels,WEB_ENGINE} from './pure.mjs';
// The facade creates one disposable Worker per call. No stale pixel/mask cache crosses calls.
self.onmessage=async ({data:{id,method,args}})=>{
  try {
    let result;
    switch(method){
      case 'decodeRaw':result=await decodeRaw(args[0],args[1]);break;
      case 'makeProxy':result=makeProxyPixels(args[0],args[1]);break;
      case 'detectPeople': {
        const {detectPeople}=await import('./faces.mjs');
        result=await detectPeople(args[0],args[1]);break;
      }
      case 'render': {
        validateRecipe(args[1]);
        // Never trust serialized masks or a previous preview's detections as current render input.
        let detections=[];
        if(args[1].parameters.extendedParameters.portrait){
          const {detectPeople}=await import('./faces.mjs');
          detections=await detectPeople(args[0]);
        }
        result=renderPixels(args[0],args[1],{...args[2],detections,validateRecipe,resolutionAssessment});
        result.provenance={engineVersion:WEB_ENGINE,inputWidth:args[0].width,inputHeight:args[0].height,colorSpace:'sRGB',bitDepth:8,adjustmentDomain:'post-LibRaw-8bit-sRGB; no recovered clipped RAW channels',freshDetectorWithinRender:!!detections.length,detectedAnchors:detections.map(d=>d.anchor),model:detections[0]?.provenance||null,maskType: 'face-oval-polygon-not-person-segmentation',processingOrder:['base','personEV',...args[1].parameters.processingOrder,'encode']};break;
      }
      case 'encode':result=await encode(args[0],args[1],validateExportSettings);break;
      default:throw Error('UNKNOWN_PROCESSING_OPERATION');
    }
    const pixels=result?.pixels||result;const transfer=pixels?.data instanceof Uint8ClampedArray?[pixels.data.buffer]:[];
    self.postMessage({id,result},transfer);
  }catch(error){self.postMessage({id,error:{name:error?.name||'Error',message:error?.message||'PROCESSING_FAILED',code:error?.code}});}
};
