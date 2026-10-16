import {checkAbort} from './pure.mjs';
import {assertPointColorFrame,pointColorRangeMask,validateRangeEdges,rangeEdgeWeight,pointColorScope} from './lr-point-color.mjs';
import {combinePortraitMasks} from './delta66-portrait-masks.mjs';
export const createColorRangeMask=pointColorRangeMask;
export function combineRangeMasks(first,second,operation='intersect'){
  if(first?.width!==second?.width||first?.height!==second?.height||!Number.isInteger(first?.width)||!Number.isInteger(first?.height)||first.width<1||first.height<1||first.width*first.height>8_000_000||first.data?.length!==first.width*first.height||second.data?.length!==first.width*first.height)throw Error('RANGE_MASK_DIMENSIONS');
  return {width:first.width,height:first.height,data:combinePortraitMasks(first.data,second.data,operation)};
}
/** Depth contract: Float32 grid over the ENTIRE current upright image; geometryID
 * must change on crop/rotate/warp. Value range is in declared units. Normalized
 * selection edges are always near=0, far=1, independently of depth direction.
 * provenance is host supplied evidence, not proof of recognition/authorization.
 * No depth model is downloaded or executed by this module. */
export function createDepthRangeMask(frame,depth,{binding,edges=[0,0,1,1],minimumConfidence=0,scope,invert=false,signal}={}){
  assertPointColorFrame(frame);const range=validateRangeEdges(edges),domain=pointColorScope(frame,scope);
  if(!depth||!Number.isInteger(depth.width)||!Number.isInteger(depth.height)||depth.width<1||depth.height<1||depth.width*depth.height>8_000_000||
    !(depth.data instanceof Float32Array)||!(depth.data.buffer instanceof ArrayBuffer)||depth.data.length!==depth.width*depth.height||
    depth.coordinateSpace!=='normalized-upper-left'||!['meters','normalized','relative'].includes(depth.units)||!['near-is-low','near-is-high'].includes(depth.direction)||
    !Array.isArray(depth.valueRange)||depth.valueRange.length!==2||!depth.valueRange.every(Number.isFinite)||depth.valueRange[1]<=depth.valueRange[0])throw Error('DEPTH_RANGE_CONTRACT');
  const [low,high]=depth.valueRange;if(depth.units==='meters'&&low<0||depth.units==='normalized'&&(low!==0||high!==1))throw Error('DEPTH_RANGE_UNITS');
  if(depth.invalidValue!==undefined&&depth.invalidValue!==null&&!Number.isFinite(depth.invalidValue))throw Error('DEPTH_INVALID_SENTINEL');
  const p=depth.provenance;if(!p||!['embedded','model','manual'].includes(p.kind)||typeof p.assetID!=='string'||!p.assetID||!(/^[a-f0-9]{64}$/i).test(p.sourceSHA256??'')||typeof p.geometryID!=='string'||!p.geometryID||
    !binding||binding.assetID!==p.assetID||binding.sourceSHA256?.toLowerCase()!==p.sourceSHA256.toLowerCase()||binding.geometryID!==p.geometryID)throw Error('DEPTH_IMAGE_BINDING');
  if(p.kind==='model'&&(!(/^[a-f0-9]{64}$/i).test(p.modelSHA256??'')||typeof p.modelID!=='string'||!p.modelID))throw Error('DEPTH_MODEL_EVIDENCE');
  if(!Number.isFinite(minimumConfidence)||minimumConfidence<0||minimumConfidence>1)throw Error('DEPTH_CONFIDENCE_THRESHOLD');
  const confidence=depth.confidence;if(confidence!==undefined&&(!(confidence instanceof Float32Array)||!(confidence.buffer instanceof ArrayBuffer)||confidence.length!==depth.data.length))throw Error('DEPTH_CONFIDENCE');
  if(minimumConfidence>0&&!confidence)throw Error('DEPTH_CONFIDENCE_REQUIRED');
  const valid=depth.validity;if(valid!==undefined&&(!(valid instanceof Uint8Array)||!(valid.buffer instanceof ArrayBuffer)||valid.length!==depth.data.length))throw Error('DEPTH_VALIDITY');
  const result=new Uint8Array(frame.width*frame.height);let invalidPixels=0;
  for(let y=0;y<frame.height;y++){checkAbort(signal);for(let x=0;x<frame.width;x++){
    const i=y*frame.width+x;if(!frame.data[i*4+3]||domain&&!domain[i])continue;
    const sx=Math.max(0,Math.min(depth.width-1,(x+.5)*depth.width/frame.width-.5)),sy=Math.max(0,Math.min(depth.height-1,(y+.5)*depth.height/frame.height-.5)),ax=Math.floor(sx),ay=Math.floor(sy),bx=Math.min(depth.width-1,ax+1),by=Math.min(depth.height-1,ay+1),u=sx-ax,v=sy-ay;
    const neighbors=[[ay*depth.width+ax,(1-u)*(1-v)],[ay*depth.width+bx,u*(1-v)],[by*depth.width+ax,(1-u)*v],[by*depth.width+bx,u*v]];let z=0,usable=true;
    for(const [j,w] of neighbors){if(!w)continue;const d=depth.data[j],c=confidence?.[j];
      if(!Number.isFinite(d)||d<low||d>high||depth.invalidValue!=null&&d===depth.invalidValue||valid&&!valid[j]||confidence&&(!Number.isFinite(c)||c<0||c>1||c<minimumConfidence)){usable=false;break;}z+=d*w;}
    // Invalid/low-confidence regions remain excluded even with invert enabled.
    if(!usable){invalidPixels++;continue;}let normalized=(z-low)/(high-low);if(depth.direction==='near-is-high')normalized=1-normalized;
    const w=rangeEdgeWeight(normalized,range);result[i]=Math.round(255*(invert?1-w:w)*(domain?domain[i]/255:1));
  }}return {width:frame.width,height:frame.height,data:result,provenance:{...structuredClone(p),operation:'suite-depth-range-1',inferenceExecuted:false,coordinateSpace:'normalized-upper-left',selectionDepthDirection:'near-zero-far-one',invalidPixels,minimumConfidence,confidenceProvided:Boolean(confidence)}};
}
