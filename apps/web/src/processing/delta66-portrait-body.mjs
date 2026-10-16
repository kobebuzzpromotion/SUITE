import {PoseLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {assertPixels,checkAbort} from './pure.mjs';
import {buildPortraitField,renderPortraitField,symmetrizePortrait,renderPortraitIsolatedWarp} from './delta66-portrait-warp.mjs';
import {createFacialExpressionProcessor} from './astra-face-expression.mjs';
import {localMean} from './region-repair-core.mjs';
// SUITE bounded 2D deformation, not an anatomical measurement or body reconstruction.
export async function createPortraitPoseDetector({modelAssetBuffer,modelSHA256,wasmRoot,numPoses=4},{signal}={}){
  if(!(modelAssetBuffer instanceof Uint8Array)||!modelAssetBuffer.length||modelAssetBuffer.length>256*1024*1024||!(/^[a-f0-9]{64}$/i).test(modelSHA256)||typeof wasmRoot!=='string'||!Number.isInteger(numPoses)||numPoses<1||numPoses>8)throw Error('PORTRAIT_POSE_MODEL');
  const bytes=modelAssetBuffer.slice(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==modelSHA256.toLowerCase())throw Error('PORTRAIT_POSE_DIGEST');checkAbort(signal);
  const files=await FilesetResolver.forVisionTasks(wasmRoot),model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'},runningMode:'IMAGE',numPoses,outputSegmentationMasks:true});let closed=false;
  try{checkAbort(signal);}catch(e){model.close();throw e;}
  return {detect(frame,{signal}={}){assertPixels(frame);checkAbort(signal);if(closed||frame.width*frame.height>8_000_000)throw Error('PORTRAIT_POSE_STATE_OR_BUFFER');
    const canvas=new OffscreenCanvas(frame.width,frame.height),ctx=canvas.getContext('2d');if(!ctx)throw Error('PORTRAIT_POSE_CANVAS');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.data),frame.width,frame.height),0,0);const result=model.detect(canvas);checkAbort(signal);
    try{return {width:frame.width,height:frame.height,modelSHA256:digest,coordinateSpace:'normalized-upper-left',poses:result.landmarks.map((points,index)=>{
      const modelMask=result.segmentationMasks?.[index];let instanceMask=null;
      if(modelMask){const values=modelMask.getAsFloat32Array();instanceMask=new Uint8Array(frame.width*frame.height);
        for(let y=0;y<frame.height;y++){checkAbort(signal);for(let x=0;x<frame.width;x++){const sx=Math.min(modelMask.width-1,Math.floor(x*modelMask.width/frame.width)),sy=Math.min(modelMask.height-1,Math.floor(y*modelMask.height/frame.height));
          const v=values[sy*modelMask.width+sx];if(!Number.isFinite(v))throw Error('PORTRAIT_POSE_MASK_NONFINITE');instanceMask[y*frame.width+x]=Math.round(Math.max(0,Math.min(1,v))*255);}}}
      return {landmarks:points.map(p=>({x:p.x,y:p.y,z:p.z,visibility:p.visibility??0})),instanceMask};}),identity:'not-established'};
    }finally{for(const mask of result.segmentationMasks??[])mask.close();}
  },close(){if(!closed){closed=true;model.close();}}};
}
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function reshapePortraitBody(frame,pose,controls,{mask,protection,signal}={}){
  controls={...controls};
  const smoothPhysique=controls.smoothPhysique??0;delete controls.smoothPhysique;
  if(!Number.isFinite(smoothPhysique)||smoothPhysique<0||smoothPhysique>1)throw Error('PORTRAIT_SMOOTH_PHYSIQUE');
  if(smoothPhysique&&!(controls.autoIntensity<0))throw Error('PORTRAIT_SMOOTH_PHYSIQUE_REQUIRES_SLIMMING');
  // SUITE optional preset, not a promise to reproduce another product's learned ideal.
  if(controls.autoIntensity!==undefined){const a=controls.autoIntensity;if(!Number.isFinite(a)||Math.abs(a)>1)throw Error('PORTRAIT_BODY_AUTO_INTENSITY');delete controls.autoIntensity;
    for(const [k,factor] of Object.entries({body:.25,waist:.35,thighLeft:.15,thighRight:.15,calfLeft:.1,calfRight:.1}))if(controls[k]===undefined)controls[k]=a*factor;}
  for(const [linked,keys] of Object.entries({arms:['armLeft','armRight'],breasts:['breastLeft','breastRight'],thighs:['thighLeft','thighRight'],calves:['calfLeft','calfRight'],legs:['thighLeft','thighRight','calfLeft','calfRight'],neckSides:['neckWidthLeft','neckWidthRight'],waistSides:['waistLeft','waistRight'],hipSides:['hipLeft','hipRight']})){
    if(controls[linked]!==undefined){for(const key of keys)if(controls[key]===undefined)controls[key]=controls[linked];delete controls[linked];}}
  const p=pose?.landmarks;if(!Array.isArray(p)||p.length!==33)throw Error('PORTRAIT_BODY_LANDMARKS');
  const get=i=>{const q=p[i];if(!q||![q.x,q.y,q.visibility].every(Number.isFinite)||q.visibility<.5||q.x<0||q.x>1||q.y<0||q.y>1)throw Error('PORTRAIT_BODY_OCCLUDED');return q;};
  const shoulder=mid(get(11),get(12)),hip=mid(get(23),get(24)),knee=mid(get(25),get(26)),ankle=mid(get(27),get(28)),head=get(0),torso=mid(shoulder,hip);
  const width=Math.max(.04,Math.abs(p[11].x-p[12].x)),height=Math.max(.06,Math.abs(hip.y-shoulder.y)),ops=[];
  const spec={body:[torso,width,height,'scaleX'],height:[mid(head,ankle),width,Math.min(.95,ankle.y-head.y),'scaleY'],head:[head,width*.55,height*.45,'scale'],upperBodyLength:[torso,width,height,'scaleY'],neckWidth:[mid(head,shoulder),width*.35,height*.3,'scaleX'],neckLength:[mid(head,shoulder),width*.35,height*.3,'scaleY'],waist:[mid(torso,hip),width*.7,height*.4,'scaleX'],waistLength:[mid(torso,hip),width*.7,height*.4,'scaleY'],hips:[hip,width*.8,height*.4,'scaleX'],legLength:[mid(hip,ankle),width,Math.max(.06,ankle.y-hip.y),'scaleY'],thighLength:[mid(hip,knee),width,Math.max(.05,knee.y-hip.y),'scaleY'],calfLength:[mid(knee,ankle),width,Math.max(.05,ankle.y-knee.y),'scaleY']};
  for(const [side,ids] of [['Left',[11,13,23,25,27]],['Right',[12,14,24,26,28]]]){
    const [s,e,h,k,a]=ids.map(get);spec['arm'+side]=[mid(s,e),width*.35,height*.65,'scaleX'];spec['breast'+side]=[mid(s,torso),width*.32,height*.3,'scale'];
    spec['waist'+side]=[mid(mid(s,h),h),width*.35,height*.4,'translate'];spec['hip'+side]=[h,width*.35,height*.4,'translate'];
    spec['thigh'+side]=[mid(h,k),width*.35,Math.max(.04,Math.abs(k.y-h.y)),'scaleX'];spec['calf'+side]=[mid(k,a),width*.3,Math.max(.04,Math.abs(a.y-k.y)),'scaleX'];
    spec['neckWidth'+side]=[mid(head,s),width*.22,height*.28,'translate'];
  }
  for(const [key,value] of Object.entries(controls)){if(!spec[key]||!Number.isFinite(value)||Math.abs(value)>1)throw Error('PORTRAIT_BODY_CONTROL');if(!value)continue;
    const [center,rx,ry,type]=spec[key];ops.push({center,rx:Math.min(.99,rx),ry:Math.min(.99,ry),type,amount:value,dx:type==='translate'?value*(key.endsWith('Left')?-1:1):0});}
  mask??=pose.instanceMask;if(!mask)throw Error('PORTRAIT_BODY_INSTANCE_MASK_REQUIRED');const field=buildPortraitField(frame,ops,{protection,signal});
  if(smoothPhysique){const all=new Uint8Array(field.x.length).fill(255),radius=Math.max(1,Math.min(32,Math.round(frame.width*.006)));
    for(const [key,origin] of [['x',i=>i%frame.width],['y',i=>Math.floor(i/frame.width)]]){
      const displacement=Float32Array.from(field[key],(v,i)=>v-origin(i)),blur=localMean(displacement,all,frame.width,frame.height,radius,signal);
      for(let i=0;i<field[key].length;i++)if(!protection?.[i])field[key][i]=origin(i)+displacement[i]*(1-smoothPhysique)+blur[i]*smoothPhysique;}}
  return renderPortraitField(frame,field,{mask,protection,signal});
}
export function symmetrizePortraitUpperBody(frame,pose,options){return symmetrizePortrait(frame,[[pose.landmarks[11],pose.landmarks[12]],[pose.landmarks[23],pose.landmarks[24]]],options);}
export async function reshapePortraitBodyIsolated(frame,pose,controls,options={}){
  const mask=options.mask??pose.instanceMask,result=reshapePortraitBody(frame,pose,controls,{...options,mask});
  return renderPortraitIsolatedWarp(frame,result.requestedField,mask,options);
}
export function createMobilePortraitExpression(dependencies){const process=createFacialExpressionProcessor(dependencies);
  return (frame,binding,{style='neutral',level=3,...options}={},runtime={})=>{
    if(!['none','neutral','toothy'].includes(style)||!Number.isInteger(level)||(style==='toothy'?(level<1||level>5):(level<0||level>3)))throw Error('PORTRAIT_MOBILE_EXPRESSION');
    return process(frame,binding,{...options,settings:{...options.settings,mode:style==='none'||level===0?'none':style==='toothy'?'smile':'neutral',level:style==='none'||level===0?0:level}},runtime);
  };
}
