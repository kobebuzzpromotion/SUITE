import {assertPixels,checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {polygonMask,polygonCenter,expandPolygon,convexHull} from './face-feature-geometry.mjs';
import {PERSON_MODEL_SHA256,PERSON_PRIVACY_APPROVED,personProcessingStatus} from '../person-privacy.mjs';
import {NOSE_RESHAPE_VERSION,NOSE_RESHAPE_CONTROLS,createNoseReshapeProcessor} from './nose-reshape.mjs';
import {reshapeEyebrows} from './eyebrow-reshape.mjs';
import {MAKEUP_HIGHLIGHT_LANDMARK_VERSION,rasterizeMakeupHighlightLandmarkMask} from './makeup-highlight-landmark-mask.mjs';
import {applyLocalLevels} from './local-levels.mjs';

export const FACE_FEATURE_ADAPTER_VERSION='suite-local-face-feature-adapter-1';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const KEYS=['assetID','originalSHA256','personID','savedRevision','sourceWidth','sourceHeight','modelSHA256','inventoryID'];
function exact(v,keys){return v&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&
  Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{
    const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value');});}
function bindingCopy(b,pixels){
  if(!exact(b,KEYS)||!['assetID','personID','inventoryID'].every(k=>typeof b[k]==='string'&&UUID.test(b[k]))||
      !['originalSHA256','modelSHA256'].every(k=>typeof b[k]==='string'&&SHA.test(b[k]))||
      b.modelSHA256.toLowerCase()!==PERSON_MODEL_SHA256||!Number.isSafeInteger(b.savedRevision)||b.savedRevision<1||
      !Number.isSafeInteger(b.sourceWidth)||b.sourceWidth<pixels.width||
      !Number.isSafeInteger(b.sourceHeight)||b.sourceHeight<pixels.height||
      !Number.isSafeInteger(b.sourceWidth*b.sourceHeight))throw Error('FACE_FEATURE_BINDING_INVALID');
  const ratio=Math.min(pixels.width/b.sourceWidth,pixels.height/b.sourceHeight);
  if(Math.abs(pixels.width-b.sourceWidth*ratio)>1||Math.abs(pixels.height-b.sourceHeight*ratio)>1||
    (Object.hasOwn(pixels,'sourceWidth')&&pixels.sourceWidth!==b.sourceWidth)||
    (Object.hasOwn(pixels,'sourceHeight')&&pixels.sourceHeight!==b.sourceHeight))
    throw Error('FACE_FEATURE_PROXY_MISMATCH');
  return Object.freeze({...b});
}
const xy=p=>({x:p.x,y:p.y});
const uv=p=>({u:p.x,v:p.y});
function binaryMask(data,count){
  if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==count||
    Object.prototype.toString.call(data.buffer)==='[object SharedArrayBuffer]')
    throw Error('FACE_FEATURE_OCCLUSION_MASK_REQUIRED');
  const out=new Uint8Array(data);
  for(const v of out)if(v!==0&&v!==255)throw Error('FACE_FEATURE_OCCLUSION_MASK_INVALID');
  return out;
}
function allowedMask(frame,face,occlusion,exclusions,signal){
  const data=polygonMask(frame.width,frame.height,face.oval,{exclude:exclusions,signal});
  for(let i=0;i<data.length;i++)if(occlusion[i]||!frame.data[i*4+3])data[i]=0;
  return data;
}
function assertVisible(points,frame,occlusion){
  for(const p of points){
    const x=Math.min(frame.width-1,Math.floor(p.x*frame.width)),y=Math.min(frame.height-1,Math.floor(p.y*frame.height));
    const i=y*frame.width+x;
    if(occlusion[i]||!frame.data[i*4+3])throw Error('FACE_FEATURE_LANDMARK_OCCLUDED');
  }
}
function faceAxes(face,b){
  const l=polygonCenter(face.regions.imageLeftEye),r=polygonCenter(face.regions.imageRightEye);
  const dx=(r.x-l.x)*b.sourceWidth,dy=(r.y-l.y)*b.sourceHeight,d=Math.hypot(dx,dy);
  const vx={x:dx/d,y:dy/d},vy={x:-dy/d,y:dx/d};
  const origin={x:(l.x+r.x)/2,y:(l.y+r.y)/2};
  const projection=p=>({x:(p.x-origin.x)*b.sourceWidth*vx.x+(p.y-origin.y)*b.sourceHeight*vx.y,
    y:(p.x-origin.x)*b.sourceWidth*vy.x+(p.y-origin.y)*b.sourceHeight*vy.y});
  return {vx,vy,origin,projection};
}
function noseInput(face,b,frame,occlusion,settings,signal){
  const p=face.landmarks;
  // Versioned MediaPipe topology: 168 root, 6 bridge, 1 tip, 98/327 alar wings.
  const wings=[xy(p[98]),xy(p[327])].sort((a,c)=>a.x-c.x);
  const landmarks={bridgeTop:xy(p[168]),bridgeBottom:xy(p[6]),leftWing:wings[0],rightWing:wings[1],tip:xy(p[1])};
  assertVisible(Object.values(landmarks),frame,occlusion);
  if(!exact(settings,NOSE_RESHAPE_CONTROLS))throw Error('FACE_FEATURE_NOSE_SETTINGS_INVALID');
  const {inventoryID,...noseBinding}=b;
  const mask=allowedMask(frame,face,occlusion,[face.regions.imageLeftEye,face.regions.imageRightEye,
    face.regions.imageLeftBrow,face.regions.imageRightBrow,expandPolygon(face.regions.outerLips,1.05)],signal);
  return {document:{engineVersion:NOSE_RESHAPE_VERSION,binding:noseBinding,landmarks,settings:{...settings}},
    mask:{width:frame.width,height:frame.height,data:mask}};
}
function browInput(face,b,frame,occlusion,signal){
  const axes=faceAxes(face,b),regions=face.regions;
  const forbidden=[expandPolygon(regions.imageLeftEye,1.12),expandPolygon(regions.imageRightEye,1.12),regions.outerLips];
  const shapes={};
  for(const [key,name] of [['imageLeft','imageLeftBrow'],['imageRight','imageRightBrow']]){
    const hull=regions[name],sorted=[...hull].sort((a,c)=>axes.projection(a).x-axes.projection(c).x);
    const inner=key==='imageLeft'?sorted[sorted.length-1]:sorted[0];
    const outer=key==='imageLeft'?sorted[0]:sorted[sorted.length-1];
    const middle=hull.filter(p=>{
      const x=axes.projection(p).x,a=axes.projection(inner).x,z=axes.projection(outer).x;
      const t=(x-a)/(z-a);return t>=.2&&t<=.8;
    }).sort((a,c)=>axes.projection(a).y-axes.projection(c).y);
    if(!middle.length)throw Error('FACE_FEATURE_BROW_ARCH_UNAVAILABLE');
    const arch=middle[0];assertVisible([inner,outer,arch],frame,occlusion);
    // Expand in source-pixel axes so Proxy and source share geometry. Keep a
    // transition area around the detected eyebrow while excluding eye polygons.
    const center=polygonCenter(hull),span=Math.hypot((outer.x-inner.x)*b.sourceWidth,(outer.y-inner.y)*b.sourceHeight);
    const region=convexHull(hull.flatMap(p=>[-1,1].flatMap(a=>[-1,1].map(c=>({
      x:Math.max(0,Math.min(1,p.x+(axes.vx.x*a*span*.2+axes.vy.x*c*span*.22)/b.sourceWidth)),
      y:Math.max(0,Math.min(1,p.y+(axes.vx.y*a*span*.2+axes.vy.y*c*span*.22)/b.sourceHeight))})))));
    const mask=polygonMask(frame.width,frame.height,region,{exclude:forbidden,signal});
    for(let i=0;i<mask.length;i++)if(occlusion[i]||!frame.data[i*4+3])mask[i]=0;
    shapes[key]={inner:uv(inner),outer:uv(outer),arch:uv(arch),mask};
  }
  // The kernels require non-overlap. Splitting on the face midline preserves
  // ownership of each brow rather than allowing either to deform the other.
  for(let y=0;y<frame.height;y++){checkAbort(signal);for(let x=0;x<frame.width;x++){
    const i=y*frame.width+x;
    if(shapes.imageLeft.mask[i]&&shapes.imageRight.mask[i]){
      const side=axes.projection({x:(x+.5)/frame.width,y:(y+.5)/frame.height}).x;
      shapes[side<0?'imageRight':'imageLeft'].mask[i]=0;
    }
  }}
  return shapes;
}
function highlightInput(face,b,frame,occlusion,signal){
  const axes=faceAxes(face,b),ordered=[...face.oval].sort((a,c)=>axes.projection(a).y-axes.projection(c).y);
  const p=face.landmarks,regions=face.regions;
  const mid=(a,c,t)=>({x:a.x+(c.x-a.x)*t,y:a.y+(c.y-a.y)*t});
  const eyeMid=axes.origin;
  const forehead=mid(ordered[0],eyeMid,.38),chin=mid(ordered[ordered.length-1],polygonCenter(regions.outerLips),.3);
  const leftCheek=mid(xy(p[50]),xy(p[101]),.5),rightCheek=mid(xy(p[280]),xy(p[330]),.5);
  const landmarks={forehead,bridge:mid(xy(p[168]),xy(p[6]),.6),leftCheek,rightCheek,chin};
  // Sort cheeks by image side (MediaPipe names are anatomical, not image side).
  if(landmarks.leftCheek.x>landmarks.rightCheek.x)
    [landmarks.leftCheek,landmarks.rightCheek]=[landmarks.rightCheek,landmarks.leftCheek];
  assertVisible(Object.values(landmarks),frame,occlusion);
  const data=allowedMask(frame,face,occlusion,[expandPolygon(regions.imageLeftEye,1.2),
    expandPolygon(regions.imageRightEye,1.2),regions.imageLeftBrow,regions.imageRightBrow,
    expandPolygon(regions.outerLips,1.15)],signal);
  return {document:{engineVersion:MAKEUP_HIGHLIGHT_LANDMARK_VERSION,binding:b,landmarks,
      evidence:{pose:'frontal',occluded:false}},runtime:{binding:b,width:frame.width,height:frame.height},
    skinMask:{binding:b,width:frame.width,height:frame.height,data}};
}

/**
 * Concrete local-model adapter for Nose, Eyebrows and Highlight. Host authority
 * is injected, but geometry is produced here by the pinned bundled model.
 * `authorize` must independently verify person/Asset/revision/source provenance,
 * consent, selected face identity, and the supplied binary occlusion mask.
 * Model landmarks cannot prove hair/glasses/hand occlusion. Therefore the mask
 * is mandatory even for an unobscured face (reviewed all-zero mask). JSON claims
 * or selecting face index zero are not authentication. No production host is
 * installed by this module, and the existing privacy review gate is preserved.
 */
export function createLocalFaceFeatureProcessor({authorize,privacy}={}){
  if(typeof authorize!=='function')throw Error('FACE_FEATURE_AUTHORITY_UNAVAILABLE');
  return async function process(pixels,binding,{feature,faceIndex,controls,occlusionMask},{signal}={}){
    if(personProcessingStatus(privacy)!==PERSON_PRIVACY_APPROVED)throw Error('PRIVACY_REVIEW_REQUIRED');
    checkAbort(signal);assertPixels(pixels);
    // The budget applies to the actual analysis buffer, not original metadata.
    if(pixels.width*pixels.height>8_000_000)throw Error('FACE_FEATURE_BUFFER_CAPACITY');
    if(!['nose','eyebrows','highlight'].includes(feature)||!Number.isSafeInteger(faceIndex)||faceIndex<0)
      throw Error('FACE_FEATURE_SELECTION_INVALID');
    if(Object.prototype.toString.call(pixels.data.buffer)==='[object SharedArrayBuffer]')throw Error('FACE_FEATURE_SHARED_INPUT');
    const frame={...pixels,data:pixels.data.slice()},b=bindingCopy(binding,frame);
    const excluded=binaryMask(occlusionMask,frame.width*frame.height);
    // Snapshot controls before the asynchronous authority/model calls.
    const safeControls=structuredClone(controls);
    const authorityRequest=phase=>({phase,feature,binding:b,faceIndex,
      pixels:{...frame,data:frame.data.slice()},occlusionMask:excluded.slice()});
    if(await authorize(authorityRequest('before-analysis'),{signal})!==true)throw Error('FACE_FEATURE_NOT_AUTHORIZED');
    const inventory=await detectFaceFeatures(frame,{signal});
    const face=inventory.faces[faceIndex];
    if(!face)throw Error('FACE_FEATURE_SELECTION_MISSING');
    const pose=face.pose;
    // These are conservative geometric limits, not measured camera Euler angles.
    if(!Number.isFinite(pose.pitchRatio)||pose.pitchRatio<.15||pose.pitchRatio>1.1||
      pose.yawAsymmetry>.55||Math.abs(pose.rollRadians)>.6)throw Error('FACE_FEATURE_POSE_UNSUPPORTED');
    if(await authorize({...authorityRequest('after-analysis'),inventory:structuredClone(inventory)},{signal})!==true)
      throw Error('FACE_FEATURE_NOT_AUTHORIZED');
    checkAbort(signal);
    let output;
    if(feature==='nose'){
      const input=noseInput(face,b,frame,excluded,safeControls,signal);
      const processor=createNoseReshapeProcessor({authorize:async()=>true});
      // Private continuation only: the host already authorized the exact immutable
      // frame/inventory/selection above. This is not exported as a grant bypass.
      output=await processor(frame,input.document,input.mask,{signal});
    }else if(feature==='eyebrows'){
      output=reshapeEyebrows(frame,browInput(face,b,frame,excluded,signal),safeControls,{signal});
    }else{
      if(!exact(safeControls,['intensity'])||!Number.isInteger(safeControls.intensity)||
        safeControls.intensity<0||safeControls.intensity>100)throw Error('FACE_FEATURE_HIGHLIGHT_INTENSITY_INVALID');
      const input=highlightInput(face,b,frame,excluded,signal);
      const mask=rasterizeMakeupHighlightLandmarkMask(frame,input.document,input.runtime,input.skinMask,{signal});
      output=applyLocalLevels(frame,{width:mask.width,height:mask.height,data:mask.data},
        {master:{gamma:1+safeControls.intensity/100}},{signal});
    }
    checkAbort(signal);
    if(await authorize(authorityRequest('before-release'),{signal})!==true)throw Error('FACE_FEATURE_NOT_AUTHORIZED');
    checkAbort(signal);
    return {pixels:output,provenance:{engineVersion:FACE_FEATURE_ADAPTER_VERSION,feature,binding:b,
      modelSHA256:inventory.modelSHA256,faceIndex,pose,occlusion:'host-reviewed-explicit-mask',
      algorithm:'SUITE-independent-local-geometry-not-third-party-pixel-parity'}};
  };
}
