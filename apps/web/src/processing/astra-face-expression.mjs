import {checkAbort} from './pure.mjs';
import {polygonMask,expandPolygon,polygonCenter} from './face-feature-geometry.mjs';
import {copyFaceFrame,featherMask,warpFace} from './astra-face-core.mjs';
import {prepareAstraFace} from './astra-face-runtime.mjs';
import {enforceFaceIdentity} from './astra-face-conditioned-onnx.mjs';

export function expressionSettings(value={}){
  const mode=value.mode??'none';
  if(!['none','smile','neutral'].includes(mode)||Object.keys(value).some(k=>!['mode','level','gummyLeft','gummyRight','gentle'].includes(k)))
    throw Error('EXPRESSION_SETTINGS');
  const level=value.level??(mode==='neutral'?3:mode==='smile'?1:0);
  if(!Number.isInteger(level)||(mode==='none'?level!==0:level<1||level>(mode==='smile'?5:3)))throw Error('EXPRESSION_LEVEL');
  const out={mode,level};for(const key of ['gummyLeft','gummyRight','gentle']){
    const v=value[key]??0;if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('EXPRESSION_SETTINGS');out[key]=v;}
  return out;
}
// Conservative geometric suitability, not a clinical or emotional classifier.
// Five-level smile and neutral need an actual conditioned model, never a lookup
// table of brightness settings. None is a lossless reset from the supplied base.
export function createFacialExpressionProcessor({model,identityEmbedder,identityThreshold,authorize,privacy}={}){
  return async function process(pixels,binding,{faceIndex,occlusionMask,settings={},restoreMask},{signal}={}){
    const s=expressionSettings(settings);
    if(restoreMask!==undefined&&(!(restoreMask instanceof Uint8Array||restoreMask instanceof Uint8ClampedArray)||
      restoreMask.length!==pixels.width*pixels.height))throw Error('EXPRESSION_RESTORE_MASK');
    const restoration=restoreMask===undefined?undefined:new Uint8Array(restoreMask);
    const base=await prepareAstraFace(pixels,binding,faceIndex,occlusionMask,{authorize,privacy,signal});
    const {source,face,excluded}=base,points=face.landmarks;
    if(s.mode==='none'&&!s.gummyLeft&&!s.gummyRight&&!s.gentle){
      await base.release();return {status:'processed',pixels:copyFaceFrame(source),settings:s,identity:null,
        provenance:{algorithm:'lossless-expression-reset',modelSHA256:null}};
    }
    const mouth=face.regions.outerLips,center=polygonCenter(mouth);
    const ends=[points[61],points[291]].sort((a,b)=>a.x-b.x),span=Math.hypot((ends[1].x-ends[0].x)*source.width,(ends[1].y-ends[0].y)*source.height);
    const aperture=Math.hypot((points[13].x-points[14].x)*source.width,(points[13].y-points[14].y)*source.height)/span;
    const eyes=[polygonCenter(face.regions.imageLeftEye),polygonCenter(face.regions.imageRightEye)];
    const eyeSpan=Math.hypot((eyes[1].x-eyes[0].x)*source.width,(eyes[1].y-eyes[0].y)*source.height);
    let disabled=null;
    if(!Number.isFinite(aperture)||span<5)disabled='mouth-unresolved';
    else if(aperture>.6)disabled='overly-open-mouth';
    else if(span/eyeSpan<.35)disabled='pouting-or-narrow-mouth';
    else if(face.pose.yawAsymmetry>.5||Math.abs(face.pose.rollRadians)>.6)disabled='side-profile';
    const region=polygonMask(source.width,source.height,expandPolygon(mouth,1.65),{signal});
    let count=0,blocked=0;for(let i=0;i<region.length;i++)if(region[i]){count++;if(excluded[i]||!source.data[i*4+3])blocked++;}
    if(!count||blocked/count>.08)disabled='mouth-obstructed';
    if(disabled){await base.release();return {status:'disabled',reason:disabled,pixels:copyFaceFrame(source)};}
    for(let i=0;i<region.length;i++)if(!base.mask[i])region[i]=0;
    const mask=featherMask(region,source.width,source.height,Math.max(1,Math.min(24,Math.round(span*.08))),signal);
    let output=copyFaceFrame(source);
    const roll=face.pose.rollRadians,vx={x:Math.cos(roll),y:Math.sin(roll)},vy={x:-Math.sin(roll),y:Math.cos(roll)};
    if(s.gummyLeft||s.gummyRight||s.gentle){
      const upper=points[0];
      output=warpFace(source,mask,(x,y)=>{
        let shiftX=0,shiftY=0;
        for(const [j,p] of ends.entries()){
          const dx=x-p.x*source.width,dy=y-p.y*source.height;
          const r2=(dx*dx+dy*dy)/(span*.35)**2,w=Math.max(0,1-r2)**3;
          const lift=s.gentle*span*.12*w;shiftX+=vy.x*lift;shiftY+=vy.y*lift;
        }
        const dx=x-upper.x*source.width,dy=y-upper.y*source.height;
        const along=dx*vx.x+dy*vx.y,down=dx*vy.x+dy*vy.y;
        const w=Math.max(0,1-(along/(span*.65))**2-(down/(span*.22))**2)**3;
        const t=Math.max(0,Math.min(1,along/span+.5)),amount=(s.gummyLeft*(1-t)+s.gummyRight*t)*span*.08*w;
        // Positive gummy reduces visible gum by lowering the upper lip.
        return {x:x+shiftX-vy.x*amount,y:y+shiftY-vy.y*amount};
      },{signal});
    }
    if(s.mode!=='none'){
      if(model?.feature!=='expression'||typeof model.generate!=='function'||
        model.conditionNames?.length!==2||!['smile','neutral'].every(k=>model.conditionNames.includes(k)))throw Error('EXPRESSION_MODEL_REQUIRED');
      output=await model.generate(output,mask,{smile:s.mode==='smile'?s.level:0,neutral:s.mode==='neutral'?s.level:0},{signal});
    }
    // Manual tuning pen restores chosen generated/warped areas from the original
    // base. The brush is coverage, not a tone adjustment; no source is overwritten.
    if(restoration!==undefined){
      for(let i=0;i<mask.length;i++){if(!(i&16383))checkAbort(signal);const a=restoration[i]/255;
        for(let c=0;c<3;c++)output.data[i*4+c]=Math.round(output.data[i*4+c]*(1-a)+source.data[i*4+c]*a);}
    }
    const changed=s.mode!=='none'||s.gummyLeft||s.gummyRight||s.gentle;
    const identity=changed?await enforceFaceIdentity(source,output,face,identityEmbedder,identityThreshold,{signal}):null;
    await base.release();return {status:'processed',pixels:output,settings:s,identity,
      provenance:{algorithm:'suite-local-mouth-warp-and-conditioned-expression',modelSHA256:s.mode==='none'?null:model.modelSHA256}};
  };
}
