import {assertPixels,checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {renderFeatureMakeup,makeupProcessingReceipt} from './makeup-feature-render.mjs';

/**
 * Actual local FaceLandmarker extraction -> chosen face -> procedural fitting
 * -> RGBA result. This independent code path does not save, export, grant rights,
 * manufacture manual-mask provenance, or mutate a Recipe. An authenticated host
 * must verify asset/person/permission and offer a result review before adopting it.
 * selectFace is an explicit integer in the detector's returned face order; it is
 * not a durable person ID, and must not be reused as one across photographs.
 */
export async function detectAndRenderMakeup(pixels,{selectFace,selections,platform='desktop',protectionMask,signal}={}){
  checkAbort(signal);assertPixels(pixels);
  if(!Number.isSafeInteger(selectFace)||selectFace<0)throw Error('MAKEUP_FACE_SELECTION_REQUIRED');
  if(pixels.width*pixels.height>8_000_000)throw Error('MAKEUP_FRAME_CAPACITY');
  if(protectionMask!==undefined&&(!(protectionMask instanceof Uint8Array)||
      protectionMask.length!==pixels.width*pixels.height))throw Error('MAKEUP_PROTECTION_MASK_INVALID');
  // Snapshot before the async detector: neither caller edits nor another preview
  // can change the frame on which landmarks and output were based.
  const source={...pixels,data:pixels.data.slice()};
  const snapshot=structuredClone(selections);
  const protectedSnapshot=protectionMask?.slice();
  const features=await detectFaceFeatures(source,{signal});
  checkAbort(signal);
  if(features?.width!==source.width||features?.height!==source.height||
      !Array.isArray(features.faces)||!features.faces[selectFace])
    throw Error('MAKEUP_DETECTION_SELECTION_MISMATCH');
  const output=renderFeatureMakeup(source,features.faces[selectFace],snapshot,{platform,protectionMask:protectedSnapshot,signal});
  checkAbort(signal);
  return {pixels:output,receipt:{...makeupProcessingReceipt(),
    modelSHA256:features.modelSHA256,selectedFaceIndex:selectFace,
    faceCount:features.faces.length,width:source.width,height:source.height}};
}
