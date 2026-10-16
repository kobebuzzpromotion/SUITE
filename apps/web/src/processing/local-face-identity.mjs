import {cosine} from './astra-face-core.mjs';
import {checkAbort} from './pure.mjs';

// Pure comparison of real, explicitly supplied embeddings. No inference, model
// download, gallery persistence, name prediction or automatic assignment occurs.
// Matches Swift FaceIdentity.matchPhoto's max-per-person and conflict semantics.
const fail=field=>{throw Error(`LOCAL_FACE_IDENTITY_INVALID:${field}`);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&new TextEncoder().encode(v).length<=256;
function fields(v,keys){
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||
    keys.some(k=>!Object.hasOwn(v,k))||Reflect.ownKeys(v).some(k=>!keys.includes(k)||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))fail('fields');
}
function policySnapshot(p){
  fields(p,['schemaVersion','revision','modelSHA256','preprocessingVersion','dimension','threshold','margin']);
  if(p.schemaVersion!==1||!text(p.revision)||!digest(p.modelSHA256)||!text(p.preprocessingVersion)||
    !Number.isInteger(p.dimension)||p.dimension<16||p.dimension>4096||
    ![p.threshold,p.margin].every(v=>Number.isFinite(v)&&v>=0&&v<=1))fail('policy');
  return {...p}; // No default or supposedly calibrated thresholds.
}
function embeddingSnapshot(e,p){
  fields(e,['schemaVersion','modelSHA256','preprocessingVersion','dimension','values']);
  if(e.schemaVersion!==1||e.modelSHA256!==p.modelSHA256||e.preprocessingVersion!==p.preprocessingVersion||
    e.dimension!==p.dimension||!(Array.isArray(e.values)||e.values instanceof Float32Array)||e.values.length!==p.dimension)fail('embeddingContract');
  // Allocate first so even a throwing source getter/partial copy can be wiped.
  // Never clear the caller's gallery or observation arrays.
  const values=new Float32Array(p.dimension);
  try{
    let squared=0;
    for(let i=0;i<values.length;i++){
      const value=e.values[i];
      if(typeof value!=='number'||!Number.isFinite(value))fail('embeddingContract');
      values[i]=value;
      if(!Number.isFinite(values[i]))fail('embeddingFinite');
      squared+=values[i]*values[i];
    }
    if(Math.abs(squared-1)>1e-5)fail('embeddingNormalization');
    return values;
  }catch(error){values.fill(0);throw error;}
}

/** Inputs: observations [{target:{assetID,originalSHA256,faceTargetID},embedding}],
 * gallery [{personID:UUID,embedding}], policy = Swift FaceIdentity.Policy schema1.
 * 'matched' is only a comparison candidate. Host must obtain explicit assignment
 * approval separately; this function never writes PhotoPersonAssignments. */
export function matchLocalPhotoIdentity(observations,gallery,policy,{signal}={}){
  checkAbort(signal);const p=policySnapshot(policy);
  if(!Array.isArray(observations)||observations.length>512||!Array.isArray(gallery)||gallery.length>10_000||
    observations.length*gallery.length*p.dimension>128_000_000)fail('capacity');
  const seen=new Set();let photo;
  const owned=[];
  const snapshot=e=>{const values=embeddingSnapshot(e,p);owned.push(values);return values;};
  try{
  const faces=observations.map(o=>{
    checkAbort(signal);fields(o,['target','embedding']);fields(o.target,['assetID','originalSHA256','faceTargetID']);
    const t=o.target;
    if(!uuid(t.assetID)||!uuid(t.faceTargetID)||!digest(t.originalSHA256))fail('target');
    const target={assetID:t.assetID.toLowerCase(),originalSHA256:t.originalSHA256,faceTargetID:t.faceTargetID.toLowerCase()};
    const key=`${target.assetID}:${target.originalSHA256}`;
    if(photo!==undefined&&photo!==key)fail('mixedPhotos');photo=key;
    if(seen.has(target.faceTargetID))fail('duplicateFace');seen.add(target.faceTargetID);
    return {target,values:snapshot(o.embedding)};
  });
  const entries=gallery.map(e=>{
    checkAbort(signal);fields(e,['personID','embedding']);if(!uuid(e.personID))fail('personID');
    return {personID:e.personID.toLowerCase(),values:snapshot(e.embedding)};
  });
  const contenders=new Map();
  const results=faces.map(face=>{
    const scores=new Map();
    for(const entry of entries){
      checkAbort(signal);
      const score=Math.max(-1,Math.min(1,cosine(face.values,entry.values)));
      scores.set(entry.personID,Math.max(scores.get(entry.personID)??-1,score));
    }
    const ranked=[...scores].map(([personID,cosine])=>({personID,cosine})).sort((a,b)=>
      b.cosine-a.cosine||(a.personID<b.personID?-1:a.personID>b.personID?1:0));
    for(const candidate of ranked)if(candidate.cosine>=p.threshold){
      const set=contenders.get(candidate.personID)??new Set();set.add(face.target.faceTargetID);contenders.set(candidate.personID,set);
    }
    const best=ranked[0]??null,runnerUp=ranked[1]??null,gap=best?best.cosine-(runnerUp?.cosine??-1):null;
    let decision={status:'unknown'};
    if(best&&best.cosine>=p.threshold)decision=gap>=p.margin&&(!runnerUp||gap>0)
      ?{status:'matched',personID:best.personID}:{status:'ambiguous',reason:'insufficientMargin'};
    return {target:face.target,policyRevision:p.revision,decision,best,runnerUp,gap,automaticAssignment:false};
  });
  for(const result of results){
    if(result.decision.status==='matched'&&(contenders.get(result.decision.personID)?.size??0)>1)
      result.decision={status:'ambiguous',reason:'competingFaces'};
    Object.freeze(result.target);Object.freeze(result.decision);
    if(result.best)Object.freeze(result.best);if(result.runnerUp)Object.freeze(result.runnerUp);Object.freeze(result);
  }
  checkAbort(signal);return Object.freeze(results);
  }finally{
    // Includes partially completed map() calls and aborted comparison loops.
    // Best-effort clearing of our buffers, not a JS runtime memory-erasure claim.
    for(const values of owned)values.fill(0);
  }
}
