import {checkAbort} from './pure.mjs';

export const LOCAL_FACE_OBSERVATION_CONTRACT=Object.freeze({
  detectorSHA256:'8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  recognizerSHA256:'0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
  detectorPreprocessingVersion:'suite-opencv-4.13.0-yunet-bgr-v1',
  recognizerPreprocessingVersion:'suite-opencv-4.13.0-sface-align-rgb-v1',
  pixelPreprocessingVersion:'suite-bgr8-srgb-white-downsample-v1',dimension:128
});
// The Web bilinear proxy preparation has not been calibrated against Apple's
// downsampling. Keep policies and galleries in a separate embedding domain.
export const WEB_LOCAL_FACE_OBSERVATION_CONTRACT=Object.freeze({...LOCAL_FACE_OBSERVATION_CONTRACT,
  pixelPreprocessingVersion:'suite-web-bgr8-srgb-white-bilinear-v1',
  recognizerPreprocessingVersion:'suite-web-bilinear-opencv-4.13.0-sface-align-rgb-v1'});
const fail=key=>{throw Error(`LOCAL_FACE_OBSERVATION_INVALID:${key}`);};
const sha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const dim=v=>Number.isInteger(v)&&v>=1&&v<=1600;
const array=(v,n)=>{if(!(v instanceof Float32Array)&&!Array.isArray(v)||v.length!==n)fail('vector');
  const a=new Array(n).fill(0);
  try{for(let i=0;i<n;i++){const x=v[i];if(typeof x!=='number'||!Number.isFinite(x))fail('finite');
    a[i]=Math.fround(x);if(!Number.isFinite(a[i]))fail('finite');}return a;
  }catch(error){a.fill(0);throw error;}};

/** Host must bind workerResult to this exact request (ID/generation), and obtain
 * runtimeContract from its verified WASM/model initialization, not user metadata.
 * BGR hash proves input bytes only; it cannot attest the worker executed honestly.
 * faceTargetIDs are host-fixed for this analysis, never PersonIDs or array indices.
 * No matching, enrollment, names, persistence or automatic assignment occurs. */
export async function localFaceObservations({workerResult,prepared,runtimeContract,faceTargetIDs,analysisVersion},{signal}={}){
  checkAbort(signal);const c=prepared?.preprocessingVersion===WEB_LOCAL_FACE_OBSERVATION_CONTRACT.pixelPreprocessingVersion
    ?WEB_LOCAL_FACE_OBSERVATION_CONTRACT:LOCAL_FACE_OBSERVATION_CONTRACT;
  if(!runtimeContract||Object.keys(c).some(k=>runtimeContract[k]!==c[k]))fail('runtimeContract');
  if(!uuid(prepared?.assetID)||!sha(prepared.originalSHA256)||!sha(prepared.analysisSHA256)||
    prepared.preprocessingVersion!==c.pixelPreprocessingVersion||
    ![prepared.width,prepared.height].every(dim)||
    ![prepared.inputWidth,prepared.inputHeight].every(v=>Number.isInteger(v)&&v>=1&&v<=32768)||
    prepared.inputWidth*prepared.inputHeight>8_000_000||
    prepared.width>prepared.inputWidth||prepared.height>prepared.inputHeight||
    prepared.stride!==prepared.width*3||!(prepared.bgr instanceof Uint8Array)||
    prepared.bgr.length!==prepared.stride*prepared.height||
    typeof analysisVersion!=='string'||!analysisVersion.trim()||new TextEncoder().encode(analysisVersion).length>256||
    workerResult?.modelSHA256!==c.recognizerSHA256||!Array.isArray(workerResult.faces)||workerResult.faces.length>512||
    !Array.isArray(faceTargetIDs)||faceTargetIDs.length!==workerResult.faces.length||
    !faceTargetIDs.every(uuid)||new Set(faceTargetIDs.map(x=>x.toLowerCase())).size!==faceTargetIDs.length)fail('binding');
  // Copy everything before hashing yields; later caller mutation cannot rebind.
  const p={assetID:prepared.assetID.toLowerCase(),originalSHA256:prepared.originalSHA256,
    analysisSHA256:prepared.analysisSHA256,width:prepared.width,height:prepared.height,inputWidth:prepared.inputWidth,inputHeight:prepared.inputHeight};
  const temporary=[],outputs=[];let succeeded=false;
  const bytes=new Uint8Array(prepared.bgr);
  try{
  const faces=workerResult.faces.map((f,i)=>{
    checkAbort(signal);
    if(f?.modelSHA256!==c.recognizerSHA256)fail('faceModel');
    const row=array(f.values,15);outputs.push(row);
    const raw=array(f.embedding,128);temporary.push(raw);
    if(!row.every(Number.isFinite)||!raw.every(Number.isFinite)||row[0]<0||row[1]<0||row[2]<=0||row[3]<=0||
      row[0]+row[2]>p.width||row[1]+row[3]>p.height||row[14]<0||row[14]>1)fail('bbox');
    for(let k=4;k<14;k+=2)if(row[k]<0||row[k]>p.width||row[k+1]<0||row[k+1]>p.height)fail('landmark');
    const normSquared=raw.reduce((n,v)=>n+v*v,0);
    if(!Number.isFinite(normSquared)||normSquared<1e-12)fail('zeroNorm');
    const norm=Math.sqrt(normSquared),values=raw.map(v=>Math.fround(v/norm));outputs.push(values);
    if(Math.abs(values.reduce((n,v)=>n+v*v,0)-1)>1e-5)fail('normalization');
    const inputGeometry=row.map((v,k)=>k<14?v*(k%2===0?p.inputWidth/p.width:p.inputHeight/p.height):v);
    outputs.push(inputGeometry);
    return {target:{assetID:p.assetID,originalSHA256:p.originalSHA256,faceTargetID:faceTargetIDs[i].toLowerCase()},
      analysisGeometry:row,inputGeometry,
      embedding:{schemaVersion:1,modelSHA256:c.recognizerSHA256,preprocessingVersion:c.recognizerPreprocessingVersion,
        dimension:128,values}};
  });
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);if(digest!==p.analysisSHA256)fail('analysisSHA');
  // Freeze only after every fallible validation and asynchronous operation.
  for(const face of faces){Object.freeze(face.target);Object.freeze(face.analysisGeometry);Object.freeze(face.inputGeometry);
    Object.freeze(face.embedding.values);Object.freeze(face.embedding);Object.freeze(face);}
  const result=Object.freeze({assetID:p.assetID,originalSHA256:p.originalSHA256,analysisSHA256:p.analysisSHA256,analysisVersion,
    analysisWidth:p.width,analysisHeight:p.height,inputWidth:p.inputWidth,inputHeight:p.inputHeight,
    coordinateSystem:'upright-unmirrored-top-left-pixels',faces:Object.freeze(faces),
    observations:Object.freeze(faces.map(f=>Object.freeze({target:f.target,embedding:f.embedding}))),automaticAssignment:false});
  succeeded=true;return result;
  }finally{
    bytes.fill(0);
    for(const copy of temporary)copy.fill(0);
    if(!succeeded)for(const copy of outputs)if(!Object.isFrozen(copy))copy.fill(0);
  }
}
