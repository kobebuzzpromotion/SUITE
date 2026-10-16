import {checkAbort} from './pure.mjs';
import {detectFaceFeatures} from './faces.mjs';
import {polygonCenter} from './face-feature-geometry.mjs';
import {checkedFaceFrame,copyFaceFrame,faceAnchors,similarity,sampleRGB,faceMask,featherMask} from './astra-face-core.mjs';
import {matchFaceGallery} from './astra-face-recognition.mjs';
import {enforceFaceIdentity} from './astra-face-conditioned-onnx.mjs';
import {personProcessingStatus,PERSON_PRIVACY_APPROVED} from '../person-privacy.mjs';

export function perfectShotWindow(items,targetID){
  if(!Array.isArray(items)||!items.length||items.length>10000||
    items.some(x=>typeof x?.id!=='string'||!x.id||!Number.isSafeInteger(x.captureOrdinal)||
      typeof x.folderID!=='string'||typeof x.projectID!=='string'||typeof x.load!=='function')||
    new Set(items.map(x=>x.id)).size!==items.length||new Set(items.map(x=>x.captureOrdinal)).size!==items.length)
    throw Error('PERFECT_SHOT_CAPTURE_INVENTORY');
  const ordered=[...items].sort((a,b)=>a.captureOrdinal-b.captureOrdinal),index=ordered.findIndex(x=>x.id===targetID);
  if(index<0)throw Error('PERFECT_SHOT_TARGET_MISSING');
  const target=ordered[index];
  // Project capture order is authority-provided, not filename/array order.
  if(ordered.some(x=>x.projectID!==target.projectID))throw Error('PERFECT_SHOT_PROJECT_MISMATCH');
  return {target,candidates:ordered.slice(Math.max(0,index-7),index).concat(ordered.slice(index+1,index+8))};
}
function eyeOpening(polygon,frame,roll){
  const c=Math.cos(roll),s=Math.sin(roll),xs=[],ys=[];
  for(const p of polygon){const x=p.x*frame.width,y=p.y*frame.height;xs.push(x*c+y*s);ys.push(-x*s+y*c);}
  return (Math.max(...ys)-Math.min(...ys))/Math.max(1,Math.max(...xs)-Math.min(...xs));
}
// SUITE score ranks open eyes, usable pose and facial sharpness. It does not
// label emotion or assert that one expression is aesthetically correct.
export function perfectShotFaceScore(frame,face){
  checkedFaceFrame(frame);const p=face.pose;
  if(!Number.isFinite(p?.rollRadians)||!Number.isFinite(p.yawAsymmetry))throw Error('PERFECT_SHOT_POSE');
  const opening=Math.min(eyeOpening(face.regions.imageLeftEye,frame,p.rollRadians),
    eyeOpening(face.regions.imageRightEye,frame,p.rollRadians));
  const points=face.oval,x0=Math.max(1,Math.floor(Math.min(...points.map(p=>p.x))*frame.width));
  const x1=Math.min(frame.width-2,Math.ceil(Math.max(...points.map(p=>p.x))*frame.width));
  const y0=Math.max(1,Math.floor(Math.min(...points.map(p=>p.y))*frame.height));
  const y1=Math.min(frame.height-2,Math.ceil(Math.max(...points.map(p=>p.y))*frame.height));
  const gray=i=>.2126*frame.data[i*4]+.7152*frame.data[i*4+1]+.0722*frame.data[i*4+2];
  let sharp=0,count=0;const stride=Math.max(1,Math.floor(Math.max(x1-x0,y1-y0)/80));
  for(let y=y0;y<=y1;y+=stride)for(let x=x0;x<=x1;x+=stride){const i=y*frame.width+x;
    if(!frame.data[i*4+3])continue;
    sharp+=Math.abs(4*gray(i)-gray(i-1)-gray(i+1)-gray(i-frame.width)-gray(i+frame.width));count++;}
  const detail=Math.min(1,(count?sharp/count:0)/40),eyes=Math.min(1,opening/.28);
  const pose=Math.max(0,1-p.yawAsymmetry);
  return {score:eyes*.65+detail*.25+pose*.1,eyeOpening:opening,detail,pose};
}
function blendFace(base,targetFace,donor,donorFace,protection,signal){
  const raw=faceMask(base,targetFace,{protection,signal});
  const radius=Math.max(1,Math.min(32,Math.round(base.width*.008)));
  const mask=featherMask(raw,base.width,base.height,radius,signal),output=copyFaceFrame(base);
  const target=faceAnchors(targetFace).map(p=>({x:p.x*base.width-.5,y:p.y*base.height-.5}));
  const source=faceAnchors(donorFace).map(p=>({x:p.x*donor.width-.5,y:p.y*donor.height-.5}));
  const map=similarity(target,source),targetMeans=[0,0,0],donorMeans=[0,0,0];let n=0;
  // Robustness is bounded by the same-person/pose gates. This transfers an
  // existing expression, not generated teeth or an unrelated person's face.
  for(let y=0;y<base.height;y++){checkAbort(signal);for(let x=0;x<base.width;x++){
    const i=y*base.width+x;if(mask[i]<128)continue;const p=map(x,y),rgb=sampleRGB(donor,p.x,p.y);
    if(!rgb)throw Error('PERFECT_SHOT_DONOR_INCOMPLETE');for(let c=0;c<3;c++){targetMeans[c]+=base.data[i*4+c];donorMeans[c]+=rgb[c];}n++;
  }}
  if(!n)throw Error('PERFECT_SHOT_FACE_EMPTY');
  const shift=targetMeans.map((v,c)=>Math.max(-20,Math.min(20,(v-donorMeans[c])/n)));
  for(let y=0;y<base.height;y++){checkAbort(signal);for(let x=0;x<base.width;x++){
    const i=y*base.width+x,a=mask[i]/255;if(!a||!base.data[i*4+3])continue;
    const p=map(x,y),rgb=sampleRGB(donor,p.x,p.y);if(!rgb)throw Error('PERFECT_SHOT_DONOR_INCOMPLETE');
    for(let c=0;c<3;c++)output.data[i*4+c]=Math.round(base.data[i*4+c]*(1-a)+Math.max(0,Math.min(255,rgb[c]+shift[c]))*a);
  }}return output;
}
async function frameSHA(pixels){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.data)),b=>b.toString(16).padStart(2,'0')).join('');}

/** Capture window + automatic ranking + custom selection + same-person face
 * replacement. load() must return {pixels,binding,occlusionMask}; the fresh host
 * authorizes each stage. personSelections explicitly maps target faceIndex to a
 * consenting personID; no discovered face is automatically assigned a name.
 */
export function createPerfectShot({embedder,authorize,privacy,threshold,margin,minImprovement=.08,maxRetainedPixels=32_000_000}={}){
  if(typeof embedder?.embed!=='function'||typeof authorize!=='function'||
    !Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(margin)||margin<0||margin>1||
    !Number.isFinite(minImprovement)||minImprovement<0||minImprovement>1||
    !Number.isSafeInteger(maxRetainedPixels)||maxRetainedPixels<1||maxRetainedPixels>64_000_000)
    throw Error('PERFECT_SHOT_DEPENDENCIES');
  return async function prepare(items,targetID,personSelections,{signal}={}){
    if(personProcessingStatus(privacy)!==PERSON_PRIVACY_APPROVED)throw Error('PRIVACY_REVIEW_REQUIRED');
    const window=perfectShotWindow(items,targetID);
    if(!Array.isArray(personSelections)||!personSelections.length||personSelections.length>32||
      personSelections.some(p=>!Number.isSafeInteger(p.faceIndex)||p.faceIndex<0||typeof p.personID!=='string'||!p.personID)||
      new Set(personSelections.map(p=>p.personID)).size!==personSelections.length||
      new Set(personSelections.map(p=>p.faceIndex)).size!==personSelections.length)throw Error('PERFECT_SHOT_PEOPLE');
    const people=structuredClone(personSelections),frames=new Map(),choices=new Map();let retained=0,closed=false;
    async function load(item){
      checkAbort(signal);
      if(await authorize({operation:'load-capture',assetID:item.id,projectID:item.projectID,captureOrdinal:item.captureOrdinal},{signal})!==true)
        throw Error('PERFECT_SHOT_NOT_AUTHORIZED');
      const loaded=await item.load({signal});checkedFaceFrame(loaded.pixels);
      if(loaded.binding?.assetID!==item.id||!/^[a-f0-9]{64}$/i.test(loaded.binding?.originalSHA256??'')||
        !Number.isSafeInteger(loaded.binding?.savedRevision)||loaded.binding.savedRevision<1)throw Error('PERFECT_SHOT_BINDING');
      const pixels=copyFaceFrame(loaded.pixels),n=pixels.width*pixels.height;
      if(retained+n>maxRetainedPixels)throw Error('PERFECT_SHOT_MEMORY_LIMIT');
      if(!(loaded.occlusionMask instanceof Uint8Array||loaded.occlusionMask instanceof Uint8ClampedArray)||loaded.occlusionMask.length!==n||
        loaded.occlusionMask.some(v=>v!==0&&v!==255))throw Error('PERFECT_SHOT_OCCLUSION_REQUIRED');
      const protection=new Uint8Array(loaded.occlusionMask),binding=structuredClone(loaded.binding);
      const digest=await frameSHA(pixels);
      if(await authorize({operation:'analyze-faces',binding,frameSHA256:digest,occlusionMask:protection.slice()},{signal})!==true)
        throw Error('PERFECT_SHOT_NOT_AUTHORIZED');
      const inventory=await detectFaceFeatures(pixels,{signal});
      retained+=n;const value={item:{id:item.id,folderID:item.folderID,projectID:item.projectID},pixels,protection,binding,inventory,digest};frames.set(item.id,value);return value;
    }
    const target=await load(window.target),gallery=[];
    for(const person of people){const face=target.inventory.faces[person.faceIndex];if(!face)throw Error('PERFECT_SHOT_TARGET_FACE');
      if(await authorize({operation:'enroll-session-person',personID:person.personID,binding:target.binding,faceIndex:person.faceIndex},{signal})!==true)
        throw Error('PERFECT_SHOT_NOT_AUTHORIZED');
      const embedding=await embedder.embed(target.pixels,face,{signal});
      gallery.push({personID:person.personID,embedding,modelSHA256:embedder.modelSHA256});
      choices.set(person.personID,[{assetID:targetID,faceIndex:person.faceIndex,...perfectShotFaceScore(target.pixels,face)}]);
    }
    const failures=[];
    for(const item of window.candidates){
      try{const candidate=await load(item),matches=[];
        for(let index=0;index<candidate.inventory.faces.length;index++){
          checkAbort(signal);const face=candidate.inventory.faces[index];
          if(face.pose.yawAsymmetry>.5||Math.abs(face.pose.rollRadians)>.6)continue;
          const vector=await embedder.embed(candidate.pixels,face,{signal});
          const match=matchFaceGallery(vector,gallery,{threshold,margin,modelSHA256:embedder.modelSHA256});
          if(match.status==='matched')matches.push({personID:match.personID,faceIndex:index,similarity:match.score});
        }
        for(const match of matches){if(matches.filter(m=>m.personID===match.personID).length!==1)continue;
          choices.get(match.personID).push({assetID:item.id,faceIndex:match.faceIndex,similarity:match.similarity,
            ...perfectShotFaceScore(candidate.pixels,candidate.inventory.faces[match.faceIndex])});}
      }catch(error){checkAbort(signal);failures.push({assetID:item.id,error:String(error?.message??error)});}
    }
    for(const entry of gallery)entry.embedding.fill(0);
    const selected=new Map();let rendering=false;
    function open(){if(closed)throw Error('PERFECT_SHOT_CLOSED');}
    function previewChoices(){return people.map(p=>({personID:p.personID,candidates:structuredClone(choices.get(p.personID))}));}
    async function composite(activeSignal){
      open();if(rendering)throw Error('PERFECT_SHOT_BUSY');checkAbort(activeSignal);rendering=true;
      const selection=new Map(selected);
      try{let output=copyFaceFrame(target.pixels);const replacements=[];
      for(const person of people){const choice=selection.get(person.personID);if(!choice||choice.assetID===targetID)continue;
        const donor=frames.get(choice.assetID),targetFace=target.inventory.faces[person.faceIndex],donorFace=donor.inventory.faces[choice.faceIndex];
        if(await authorize({operation:'same-person-replacement',personID:person.personID,target:target.binding,donor:donor.binding},{signal:activeSignal})!==true)
          throw Error('PERFECT_SHOT_NOT_AUTHORIZED');
        const donorMask=faceMask(donor.pixels,donorFace,{signal:activeSignal});let total=0,hidden=0;
        for(let i=0;i<donorMask.length;i++)if(donorMask[i]){total++;if(donor.protection[i])hidden++;}
        if(!total||hidden/total>.02)throw Error('PERFECT_SHOT_DONOR_OCCLUDED');
        output=blendFace(output,targetFace,donor.pixels,donorFace,target.protection,activeSignal);
        const identity=await enforceFaceIdentity(target.pixels,output,targetFace,embedder,threshold,{signal:activeSignal});
        replacements.push({personID:person.personID,donorAssetID:choice.assetID,donorSHA256:donor.binding.originalSHA256,identity});
      }
      if(await authorize({operation:'release-perfect-shot',binding:target.binding,replacements},{signal:activeSignal})!==true)
        throw Error('PERFECT_SHOT_NOT_AUTHORIZED');checkAbort(activeSignal);return {pixels:output,replacements};
      }finally{rendering=false;}
    }
    return Object.freeze({
      candidates(){open();return {people:previewChoices(),failures:structuredClone(failures)};},
      autoFix(){open();for(const person of people){const list=choices.get(person.personID),original=list.find(c=>c.assetID===targetID);
        const best=[...list].sort((a,b)=>b.score-a.score||a.assetID.localeCompare(b.assetID))[0];
        selected.set(person.personID,best.score>=original.score+minImprovement?best:original);}
        return structuredClone([...selected].map(([personID,choice])=>({personID,...choice})));},
      customFix(personID,assetID,faceIndex){open();const choice=choices.get(personID)?.find(c=>c.assetID===assetID&&c.faceIndex===faceIndex);
        if(!choice)throw Error('PERFECT_SHOT_NOT_SAME_PERSON_CANDIDATE');selected.set(personID,choice);},
      async preview({signal:activeSignal}={}){return composite(activeSignal);},
      async confirm({copyID,signal:activeSignal}={}){
        if(typeof copyID!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(copyID))throw Error('PERFECT_SHOT_COPY_ID');
        const result=await composite(activeSignal),metadata={format:'suite-perfect-shot-copy',version:1,copyID,
          folderID:target.item.folderID,projectID:target.item.projectID,source:target.binding,
          sourceFrameSHA256:target.digest,width:result.pixels.width,height:result.pixels.height,
          colorSpace:'sRGB',layout:'RGBA8',replacements:result.replacements};
        const header=new TextEncoder().encode(JSON.stringify(metadata)),magic=new TextEncoder().encode('SUITEPS1\n');
        const bytes=new Uint8Array(magic.length+4+header.length+result.pixels.data.length);bytes.set(magic);
        new DataView(bytes.buffer).setUint32(magic.length,header.length,true);bytes.set(header,magic.length+4);
        bytes.set(result.pixels.data,magic.length+4+header.length);
        // TSQ is proprietary and no encoder contract is supplied. Emit an honest
        // SUITE new-copy payload; never rename these bytes .tsq or write Original.
        return {fileName:`${copyID}.suiteps`,folderID:target.item.folderID,bytes,metadata};
      },
      close(){if(rendering)throw Error('PERFECT_SHOT_BUSY');if(!closed){closed=true;for(const frame of frames.values())frame.pixels.data.fill(0);frames.clear();choices.clear();selected.clear();}}
    });
  };
}
