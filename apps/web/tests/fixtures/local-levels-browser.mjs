import {mountEditor} from '../../src/editor-ui.mjs';
import {renderPixels} from '../../src/processing/pure.mjs';
import {expandCanvasPixels} from '../../src/processing/canvas-expand.mjs';
import {projectCanvasExpansion} from '../../src/processing/canvas-expand-projection.mjs';
import {defaultCropSettings,resolutionAssessment} from '../../../../dist/apps/backend/src/crop-export.js';

// This page deliberately contains no user image, credentials, network API or RAW.
const width=160,height=120,source=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=(y*width+x)*4,base=42+Math.round(100*x/(width-1));
  source[at]=base;source[at+1]=Math.min(255,base+Math.round(28*y/(height-1)));source[at+2]=base+12;source[at+3]=255;
}
const original={width,height,data:source};
const neutral=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const copy=value=>structuredClone(value);
const links=[];
function checksum(pixels){let hash=2166136261;for(const value of pixels.data)hash=Math.imul(hash^value,16777619)>>>0;return hash.toString(16).padStart(8,'0');}
async function blobFor(pixels){const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height),0,0);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('FIXTURE_PNG_FAILED')),'image/png'));
  return blob;
}
async function urlFor(pixels){const url=URL.createObjectURL(await blobFor(pixels));links.push(url);return url;}
function process(recipe){let result=renderPixels(original,recipe,{validateRecipe:()=>{},resolutionAssessment});
  const expansion=recipe.parameters.extendedParameters.canvasExpand;
  if(expansion)result=expandCanvasPixels(result,projectCanvasExpansion(result,expansion));
  return result;
}
const principal={id:'fixture-owner',authorName:'Synthetic QA',role:'member',trialEndsAt:'2099-01-01T00:00:00.000Z'};
const trialSession={mode:'SITES',principal};
class StubSession{
  constructor(beforeURL,afterURL){this.listeners=new Set();this.calls=[];this.recipe=neutral();this.savedRecipe=copy(this.recipe);this.current=process(this.recipe);this.final=null;
    this.data={assets:[{id:'fixture-photo',name:'synthetic-nonraw.png'}],asset:{id:'fixture-photo',name:'synthetic-nonraw.png'},recipe:copy(this.recipe),revision:1,dirty:false,busy:null,exporting:false,error:null,beforeURL,afterURL,status:'AUTHENTICATED_STUB · SYNTHETIC_NON_RAW',canUndo:false,canRedo:false,people:[],personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'};}
  get state(){return this.data;}
  subscribe(callback){this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  publish(update={}){Object.assign(this.data,update);for(const callback of this.listeners)callback(this.data);}
  async refresh(){this.current=process(this.recipe);const afterURL=await urlFor(this.current);this.publish({recipe:copy(this.recipe),afterURL,busy:null,status:'AUTHENTICATED_STUB · SYNTHETIC_NON_RAW'});}
  async setLocalLevels(settings){if(Date.now()>=Date.parse(principal.trialEndsAt))throw Error('TRIAL_EXPIRED');this.calls.push({method:'setLocalLevels',settings:copy(settings)});
    if(settings===null)delete this.recipe.parameters.extendedParameters.localLevels;
    else this.recipe.parameters.extendedParameters.localLevels={schemaVersion:1,engineVersion:'suite-srgb8-local-levels-coverage-1',brushVersion:'suite-normalized-coverage-brush-1',...copy(settings)};
    this.publish({busy:'合成画像を処理中'});await this.refresh();this.publish({dirty:true});
  }
  async save(){if(!this.data.dirty)throw Error('NOT_DIRTY');this.savedRecipe=copy(this.recipe);this.publish({revision:this.data.revision+1,dirty:false});return {revision:this.data.revision,body:copy(this.recipe)};}
  async reload(){if(this.data.dirty)throw Error('UNSAVED_EDITS');this.recipe=copy(this.savedRecipe);await this.refresh();}
  async exportFinal(){if(this.data.dirty)throw Error('SAVE_REQUIRED');this.final=process(this.savedRecipe);this.calls.push({method:'exportFinal',checksum:checksum(this.final)});record();return await blobFor(this.final);}
  async setGeometry(expanded){this.recipe=copy(this.savedRecipe);const params=this.recipe.parameters;
    if(expanded){params.rotationDegrees=90;params.extendedParameters.crop={...defaultCropSettings(),preset_id:'ratio.free',preset_name:'Free',rotation:90,crop_rect:{x:.125,y:.2,width:.75,height:.6}};
      params.extendedParameters.canvasExpand={schemaVersion:1,margins:{left:.2,right:.1,top:.1,bottom:.15},background:[255,255,255,255]};params.processingOrder=['exposure','contrast','saturation','rotation','crop'];}
    else{params.rotationDegrees=0;delete params.extendedParameters.crop;delete params.extendedParameters.canvasExpand;params.processingOrder=['exposure','contrast','saturation','rotation'];}
    this.savedRecipe=copy(this.recipe);this.publish({busy:'構図を処理中',dirty:false,revision:this.data.revision+1});await this.refresh();
  }
  notify(){this.publish({status:'AUTHENTICATED_STUB · PERMISSION_RECHECK'});}
}

const beforeURL=await urlFor(original),afterURL=await urlFor(process(neutral()));
const session=new StubSession(beforeURL,afterURL);
mountEditor(session,{trialSession,authorAPI:{listPresets:async()=>[],logout:async()=>({})}});
const report=document.querySelector('#fixture-report');report.textContent='合成非RAW · 認証済みstub Session 準備完了';
document.querySelector('#fixture-geometry').addEventListener('click',async()=>{await session.setGeometry(true);report.textContent='回転90°・Crop・余白を設定';});
document.querySelector('#fixture-plain').addEventListener('click',async()=>{await session.setGeometry(false);report.textContent='元の構図へ戻した';});
document.querySelector('#fixture-revoke').addEventListener('click',()=>{principal.trialEndsAt='2000-01-01T00:00:00.000Z';session.notify();report.textContent='stub権限失効';});
function simulateTouch(cancelled){
  const image=document.querySelector('#after-image'),rect=image.getBoundingClientRect(),pointerId=987;
  const start={clientX:rect.left+rect.width*.48,clientY:rect.top+rect.height*.45};
  const finish={clientX:rect.left+rect.width*.56,clientY:rect.top+rect.height*.55};
  // Synthetic PointerEvent IDs cannot enter native pointer capture. This
  // fixture bypasses only that browser bookkeeping, not the Editor handlers.
  image.setPointerCapture=()=>{};image.hasPointerCapture=()=>false;image.releasePointerCapture=()=>{};
  const send=(type,position)=>image.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,...position}));
  try{send('pointerdown',start);send('pointermove',finish);send(cancelled?'pointercancel':'pointerup',finish);}
  finally{delete image.setPointerCapture;delete image.hasPointerCapture;delete image.releasePointerCapture;}
  report.textContent=cancelled?'Touch PointerEvent取消を模擬':'Touch PointerEvent strokeを模擬（実機ではない）';
}
document.querySelector('#fixture-touch-stroke').addEventListener('click',()=>simulateTouch(false));
document.querySelector('#fixture-touch-cancel').addEventListener('click',()=>simulateTouch(true));
window.fixture={session,principal,trialSession,original,checksum,process,get state(){return session.state;},get calls(){return copy(session.calls);},get previewChecksum(){return checksum(session.current);},get finalChecksum(){return session.final?checksum(session.final):null;}};
function record(){document.querySelector('#fixture-data').textContent=JSON.stringify({revision:session.state.revision,dirty:session.state.dirty,previewChecksum:checksum(session.current),finalChecksum:session.final?checksum(session.final):null,originalChecksum:checksum(original),localLevels:session.state.recipe?.parameters?.extendedParameters?.localLevels??null,rotationDegrees:session.state.recipe?.parameters?.rotationDegrees??0,crop:session.state.recipe?.parameters?.extendedParameters?.crop??null,canvasExpand:session.state.recipe?.parameters?.extendedParameters?.canvasExpand??null,calls:session.calls},null,2);}
session.subscribe(record);record();
window.addEventListener('pagehide',()=>{for(const url of links)URL.revokeObjectURL(url);});
