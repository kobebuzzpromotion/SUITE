import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validatePortraitBinding,validatePortraitContinuity} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {centeredRect,CROP_RATIOS} from '../../../dist/apps/backend/src/crop-export.js';
import {sourceDimensions} from './processing/pure.mjs';
import {checkParameters} from '../preset-policy.mjs';

export const WEB_ENGINE='web-libraw-mediapipe-face-exposure-1';
export const neutralRecipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const copy=x=>structuredClone(x);
const portrait=r=>r?.parameters.extendedParameters.portrait;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const POST_DECODE_STAGE='postDecodeAdjustments';
const COLOR_SCALARS=new Set(['highlights','shadows','whites','blacks','vibrance']);
const HSL_COLORS=new Set(['red','orange','yellow','green','aqua','blue','purple','magenta']);
const HSL_FIELDS=new Set(['hue','saturation','luminance']);
const DETAIL_FIELDS=new Set(['clarity','texture','sharpness']);
function setPostDecodeAdjustment(parameters,key,value){
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('ADJUSTMENT_RANGE');
  const parts=key.split('.');let branch,field;
  if(parts.length===2&&parts[0]==='color'&&COLOR_SCALARS.has(parts[1])){branch='color';field=parts[1];}
  else if(parts.length===3&&parts[0]==='hsl'&&HSL_COLORS.has(parts[1])&&HSL_FIELDS.has(parts[2])){branch='hsl';field=parts[2];}
  else if(parts.length===2&&parts[0]==='detail'&&DETAIL_FIELDS.has(parts[1])){branch='detail';field=parts[1];}
  else throw Error('UNSUPPORTED_ADJUSTMENT');
  if(value<(field==='sharpness'?0:-100)||value>100)throw Error('ADJUSTMENT_RANGE');
  const extra=parameters.extendedParameters;
  const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
  if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
  if(branch==='hsl'){
    adjustments.color??={};adjustments.color.hsl??={};const color=parts[1];adjustments.color.hsl[color]??={};
    if(value===0)delete adjustments.color.hsl[color][field];else adjustments.color.hsl[color][field]=value;
    if(Object.keys(adjustments.color.hsl[color]).length===0)delete adjustments.color.hsl[color];
    if(Object.keys(adjustments.color.hsl).length===0)delete adjustments.color.hsl;
  }else{
    adjustments[branch]??={};if(value===0)delete adjustments[branch][field];else adjustments[branch][field]=value;
  }
  if(Object.keys(adjustments.color||{}).length===0)delete adjustments.color;
  if(Object.keys(adjustments.detail||{}).length===0)delete adjustments.detail;
  if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;parameters.processingOrder=parameters.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
  else{extra.postDecodeAdjustments=adjustments;if(!parameters.processingOrder.includes(POST_DECODE_STAGE)){
    const at=parameters.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');parameters.processingOrder.splice(at<0?parameters.processingOrder.length:at,0,POST_DECODE_STAGE);
  }}
}
export async function checksum(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export class EditorSession {
  constructor({api,processing,storage,clock=()=>new Date().toISOString(),urlAPI=globalThis.URL,personProcessingStatus='PRIVACY_REVIEW_REQUIRED'}={}) {
    if(!['PRIVACY_REVIEW_REQUIRED','SYNTHETIC_TEST_ONLY'].includes(personProcessingStatus)||(personProcessingStatus==='SYNTHETIC_TEST_ONLY'&&processing?.syntheticTestOnly!==true))throw Error('PERSON_PRIVACY_CONFIGURATION_INVALID');
    this.api=api;this.processing=processing;this.storage=storage||{get:async()=>undefined,put:async()=>{}};this.clock=clock;this.urlAPI=urlAPI;
    this.listeners=new Set();this.operation=0;this.previewOperation=0;this.history=[];this.cursor=-1;this.reference=null;this.proxy=null;this.detections=[];
    this.data={assets:[],asset:null,recipe:neutralRecipe(),revision:0,dirty:false,busy:null,exporting:false,error:null,selectedPersonID:null,people:[],beforeURL:null,afterURL:null,canUndo:false,canRedo:false,evidence:[],personProcessingStatus,status:'LOCAL_QA_ONLY — 本番Auth/Cloud未接続'};
  }
  get state(){return copy(this.data);}
  subscribe(fn){this.listeners.add(fn);fn(this.state);return()=>this.listeners.delete(fn);}
  publish(extra={}){Object.assign(this.data,extra);this.data.canUndo=this.cursor>0;this.data.canRedo=this.cursor>=0&&this.cursor<this.history.length-1;for(const fn of this.listeners)fn(this.state);}
  log(test_id,status,reason,extra={}){
    const identifiers=p=>p?.targets?.map(t=>({person_id:t.id,geometry_identifier:'face-geometry-v1-json:'+JSON.stringify([t.anchor.x,t.anchor.y,t.anchor.width,t.anchor.height])}))||'UNKNOWN';
    this.data.evidence.push({test_id,status,reason,rejection_reason:status==='REJECT'?reason:null,timestamp:this.clock(),asset_id:this.data.asset?.id||null,person_id:this.data.selectedPersonID||'UNKNOWN',recipe_version:this.data.revision,RAW_checksum:this.data.asset?.sha256||'UNKNOWN',expected_geometry_identifier:identifiers(this.reference),actual_geometry_identifier:identifiers(portrait(this.data.recipe)),...extra});
  }
  check(token){if(token!==this.operation)throw Error('STALE_OPERATION');}
  requireReady(){if(!this.data.asset||!this.proxy)throw Error('NO_ASSET');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');}
  requirePersonProcessing(){if(this.data.personProcessingStatus!=='SYNTHETIC_TEST_ONLY'){this.invalidatePeople();this.log('WEB_PERSON_PRIVACY','REJECT','PERSON_PRIVACY_REVIEW_REQUIRED');throw Error('PERSON_PRIVACY_REVIEW_REQUIRED');}}
  invalidatePeople(){this.detections=[];this.publish({selectedPersonID:null,people:[]});}
  invalidatePreview(){++this.previewOperation;for(const key of ['beforeURL','afterURL'])if(this.data[key])this.urlAPI.revokeObjectURL(this.data[key]);this.publish({beforeURL:null,afterURL:null});}
  bind(recipe,asset=this.data.asset){validateRecipe(recipe);if(portrait(recipe)){if(!asset)throw Error('NO_ASSET');validatePortraitBinding(portrait(recipe),asset.id,asset.sha256);if(this.reference)validatePortraitContinuity(this.reference,portrait(recipe));}}
  async initialize(){const token=++this.operation;this.publish({busy:'library',error:null});try{const assets=await this.api.listAssets();this.check(token);this.publish({assets,busy:null});}catch(e){if(token===this.operation)this.publish({busy:null,error:e.message});throw e;}}
  async importRaw(file){
    if(this.data.dirty)throw Error('UNSAVED_EDITS');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');
    if(!/\.(arw|cr2|cr3|nef|nrw|dng|raf|rw2|orf|pef|srw|raw)$/i.test(file.name)||file.size<=0||file.size>128*1024*1024)throw Error('RAW_FORMAT_OR_SIZE_UNSUPPORTED');
    const token=++this.operation;this.invalidatePeople();this.invalidatePreview();this.publish({busy:'RAW import',error:null});
    try{
      const original=await file.arrayBuffer();this.check(token);const sha256=await checksum(original);this.check(token);
      // Preserve Original in existing immutable object storage before decoder failure; never cleanup it.
      const registered=await this.api.createAsset({name:file.name,sha256,size:file.size});this.check(token);
      const asset=await this.api.putOriginal(registered.id,original.slice(0));this.check(token);
      const decoded=await this.processing.decodeRaw(original.slice(0),{mode:'proxy'});this.check(token);
      if(await checksum(original)!==sha256)throw Error('RAW_CHECKSUM_CHANGED');this.check(token);
      const proxy=await this.processing.makeProxy(decoded.pixels,1600);this.check(token);
      const cached={asset,proxy,provenance:decoded.provenance,metadata:decoded.metadata,history:[neutralRecipe()],cursor:0,revision:0,reference:null,dirty:true};
      await this.storage.put(asset.id,cached);this.check(token);
      this.proxy=proxy;this.reference=null;this.history=cached.history;this.cursor=0;this.publish({asset,recipe:neutralRecipe(),revision:0,dirty:true,provenance:decoded.provenance,metadata:decoded.metadata,assets:[...this.data.assets.filter(a=>a.id!==asset.id),asset],busy:null});
      await this.refreshPreview(token);this.log('WEB_IMPORT','PASS_LOCAL_DECODE_ONLY','Real-image/RAW visual QA separately required',{raw_file_identifier:file.name});
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_IMPORT','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async openAsset(id){
    if(this.data.dirty)throw Error('UNSAVED_EDITS');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');
    const asset=this.data.assets.find(a=>a.id===id);if(!asset)throw Error('UNKNOWN_ASSET');
    const token=++this.operation;this.invalidatePeople();this.invalidatePreview();this.publish({busy:'reload',error:null});
    try{
      const stored=await this.api.getRecipe(id);this.check(token);let cached=await this.storage.get(id);this.check(token);
      const recipe=stored?.body||neutralRecipe();validateRecipe(recipe);if(portrait(recipe))validatePortraitBinding(portrait(recipe),asset.id,asset.sha256);
      if(cached&&(cached.asset?.id!==id||cached.asset.sha256!==asset.sha256))throw Error('CACHE_ASSET_BINDING');
      let proxy=cached?.proxy,provenance=cached?.provenance,metadata=cached?.metadata;
      if(!proxy){const original=await this.api.getOriginal(id);this.check(token);if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_MISMATCH');this.check(token);const decoded=await this.processing.decodeRaw(original,{mode:'proxy'});this.check(token);proxy=await this.processing.makeProxy(decoded.pixels,1600);this.check(token);provenance=decoded.provenance;metadata=decoded.metadata;}
      if(cached?.dirty&&cached.revision!==(stored?.revision||0))throw Error('DURABLE_DRAFT_REVISION_CONFLICT');
      const reference=cached?.reference||portrait(recipe)||null;
      if(portrait(recipe)&&reference)validatePortraitContinuity(portrait(recipe),reference);
      const history=cached?.dirty&&cached.revision===(stored?.revision||0)?cached.history:[recipe],cursor=cached?.dirty&&cached.revision===(stored?.revision||0)?cached.cursor:0;
      if(!Number.isInteger(cursor)||cursor<0||cursor>=history.length)throw Error('INVALID_HISTORY');
      for(const item of history){validateRecipe(item);if(portrait(item)){validatePortraitBinding(portrait(item),id,asset.sha256);if(reference)validatePortraitContinuity(reference,portrait(item));}}
      if(reference)validatePortraitBinding(reference,id,asset.sha256);
      this.reference=reference;this.proxy=proxy;this.history=history;this.cursor=cursor;this.publish({asset,recipe:copy(history[cursor]),revision:stored?.revision||0,dirty:!!cached?.dirty&&cached.revision===(stored?.revision||0),provenance,metadata,busy:null});
      await this.refreshPreview(token);this.log('WEB_RELOAD','PASS_CONTRACT_ONLY','Visual reproduction NOT_RUN without real image');
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_RELOAD','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async reload(){if(this.data.dirty)throw Error('UNSAVED_EDITS');return this.openAsset(this.data.asset?.id);}
  async persist(history=this.history,cursor=this.cursor,extra={}){await this.storage.put(this.data.asset.id,{asset:this.data.asset,proxy:this.proxy,provenance:this.data.provenance,metadata:this.data.metadata,history,cursor,revision:this.data.revision,reference:this.reference,dirty:this.data.dirty,...extra});}
  async refreshPreview(token=this.operation){
    const preview=++this.previewOperation,recipe=copy(this.data.recipe),proxy=this.proxy;if(!proxy)return;
    const before=await this.processing.encode(proxy,{format:'png'});this.check(token);
    // Nonneutral portrait always obtains fresh masks; previously selected mask is not reused.
    let detections=[];if(portrait(recipe)){this.requirePersonProcessing();this.invalidatePeople();try{detections=await this.processing.detectPeople(proxy,{});this.check(token);}catch(e){this.log('WEB_PERSON_VALIDATION','REJECT',e.message);throw e;}}
    const rendered=await this.processing.render(proxy,recipe,{detections});this.check(token);
    const after=await this.processing.encode(rendered,{format:'png'});this.check(token);if(preview!==this.previewOperation)return;
    const beforeURL=this.urlAPI.createObjectURL(before),afterURL=this.urlAPI.createObjectURL(after);
    if(this.data.beforeURL)this.urlAPI.revokeObjectURL(this.data.beforeURL);if(this.data.afterURL)this.urlAPI.revokeObjectURL(this.data.afterURL);
    this.publish({beforeURL,afterURL});
  }
  async detectPeople(){
    this.requireReady();this.requirePersonProcessing();const token=this.operation;this.invalidatePeople();this.publish({busy:'people validation',error:null});
    try{
      const found=await this.processing.detectPeople(this.proxy,{});this.check(token);if(!found.length)throw Error('NO_PERSON_DETECTED');
      let reference=this.reference;
      if(!reference){if(this.data.revision>0&&!portrait(this.data.recipe))throw Error('HISTORICAL_PERSON_INVENTORY_UNAVAILABLE');const now=this.clock();reference={schemaVersion:1,engineVersion:WEB_ENGINE,assetID:this.data.asset.id,originalSHA256:this.data.asset.sha256,targets:found.map(f=>({id:crypto.randomUUID(),anchor:f.anchor,adjustmentType:'face_brightness',value:0})),createdAt:now,updatedAt:now};validatePortraitBinding(reference,this.data.asset.id,this.data.asset.sha256);}
      const testRecipe=copy(this.data.recipe);testRecipe.parameters.extendedParameters.portrait=copy(reference);await this.processing.render(this.proxy,testRecipe,{detections:found});this.check(token);
      this.reference=reference;await this.persist();this.check(token);this.detections=found;
      this.publish({people:reference.targets.map(t=>({...t,complete:true})),selectedPersonID:null,busy:null});this.log('WEB_PERSON_VALIDATION','PASS_CONTRACT_ONLY','Explicit selection required');
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_PERSON_VALIDATION','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async selectPerson(id){this.requireReady();this.requirePersonProcessing();if(!this.detections.length||!this.reference?.targets.some(t=>t.id===id)){this.invalidatePeople();throw Error('UNKNOWN_PERSON');}this.publish({selectedPersonID:id});}
  async commitRecipe(recipe,historyOverride,cursorOverride){
    this.bind(recipe);const token=this.operation;const history=historyOverride||[...this.history.slice(0,this.cursor+1),copy(recipe)],cursor=cursorOverride??history.length-1;
    for(const item of history)this.bind(item);
    this.publish({busy:'permission'});
    try{if(this.api.assertPermission)await this.api.assertPermission(this.data.asset.id,'edit');this.check(token);this.bind(recipe);}catch(e){if(token===this.operation){this.invalidatePeople();this.publish({busy:null,error:e.message});this.log('WEB_TRIAL_PERMISSION','REJECT',e.message);}throw e;}
    this.invalidatePreview();this.publish({busy:'preview'});
    try{await this.persist(history,cursor,{dirty:true});this.check(token);this.history=history;this.cursor=cursor;this.publish({recipe:copy(recipe),dirty:true,error:null});await this.refreshPreview(token);this.check(token);this.publish({busy:null});}
    catch(e){if(token===this.operation){this.invalidatePeople();this.publish({busy:null,error:e.message,afterURL:null});}throw e;}
  }
  async setAdjustment(key,value){
    this.requireReady();const recipe=copy(this.data.recipe),p=recipe.parameters;
    if(key==='faceBrightness'){
      this.requirePersonProcessing();
      if(!this.data.selectedPersonID||!this.detections.length||!this.reference)throw Error('UNKNOWN_TARGET');
      if(!Number.isFinite(value)||Math.abs(value)>4)throw Error('ADJUSTMENT_RANGE');
      const targetID=this.data.selectedPersonID;p.extendedParameters.portrait=copy(portrait(recipe)||this.reference);const t=p.extendedParameters.portrait.targets.find(t=>t.id===targetID);if(!t)throw Error('UNKNOWN_TARGET');t.value=value;p.extendedParameters.portrait.updatedAt=this.clock();
    }else if(key==='cropRatio'){
      if(value==='original'){delete p.extendedParameters.crop;p.processingOrder=p.processingOrder.filter(s=>s!=='crop');}
      else {
        const preset=CROP_RATIOS.find(r=>r.id==='ratio.'+value);if(!preset?.ratio)throw Error('CROP_RATIO_UNSUPPORTED');
        const source=sourceDimensions(this.proxy),rotated=Math.abs(p.rotationDegrees/90)%2===1,w=rotated?source.height:source.width,h=rotated?source.width:source.height;
        p.extendedParameters.crop={preset_id:preset.id,preset_name:preset.name,orientation:preset.ratio.width<preset.ratio.height?'portrait':'landscape',crop_rect:centeredRect(w,h,preset.ratio),crop_ratio:copy(preset.ratio),rotation:p.rotationDegrees,custom_size:false,requested_dpi:96};
        if(!p.processingOrder.includes('crop'))p.processingOrder.push('crop');
      }
    }else if(key.startsWith('color.')||key.startsWith('hsl.')||key.startsWith('detail.')){
      setPostDecodeAdjustment(p,key,value);
    }else {
      const ranges={exposure:[-4,4],contrast:[0,2],saturation:[0,2],rotationDegrees:[-270,270]};if(!ranges[key]||!Number.isFinite(value)||value<ranges[key][0]||value>ranges[key][1]||(key==='rotationDegrees'&&value%90))throw Error('ADJUSTMENT_RANGE');
      const previousRotation=p.rotationDegrees;p[key]=value;
      if(key==='rotationDegrees'&&p.extendedParameters.crop){
        const c=p.extendedParameters.crop;c.rotation=value;
        if(c.crop_ratio){const source=sourceDimensions(this.proxy),rotated=Math.abs(value/90)%2===1;c.crop_rect=centeredRect(rotated?source.height:source.width,rotated?source.width:source.height,c.crop_ratio);}
        else {let turns=(((value-previousRotation)/90)%4+4)%4;while(turns--){const r=c.crop_rect;c.crop_rect={x:r.y,y:1-r.x-r.width,width:r.height,height:r.width};}}
      }
    }
    return this.commitRecipe(recipe);
  }
  async applyPortablePreset(parameters){
    this.requireReady();const safe=checkParameters(parameters);
    const recipe=copy(this.data.recipe);for(const name of ['exposure','contrast','saturation'])recipe.parameters[name]=safe[name];
    if(Object.hasOwn(safe,POST_DECODE_STAGE))recipe.parameters.extendedParameters[POST_DECODE_STAGE]=copy(safe[POST_DECODE_STAGE]);
    const stages=['exposure','contrast','saturation',POST_DECODE_STAGE,'rotation','crop'];if(recipe.parameters.processingOrder.some(s=>!stages.includes(s)))throw Error('UNSUPPORTED_PROCESSING_STAGE');recipe.parameters.processingOrder=stages.filter(s=>['exposure','contrast','saturation'].includes(s)||(s===POST_DECODE_STAGE?Boolean(recipe.parameters.extendedParameters[POST_DECODE_STAGE]):recipe.parameters.processingOrder.includes(s)));
    this.invalidatePeople();return this.commitRecipe(recipe);
  }
  async undo(){this.requireReady();if(this.cursor<=0)return;const cursor=this.cursor-1;this.invalidatePeople();return this.commitRecipe(this.history[cursor],this.history,cursor);}
  async redo(){this.requireReady();if(this.cursor>=this.history.length-1)return;const cursor=this.cursor+1;this.invalidatePeople();return this.commitRecipe(this.history[cursor],this.history,cursor);}
  async reset(){this.requireReady();const recipe=neutralRecipe();if(this.reference){recipe.parameters.extendedParameters.portrait=copy(this.reference);recipe.parameters.extendedParameters.portrait.targets.forEach(t=>t.value=0);recipe.parameters.extendedParameters.portrait.updatedAt=this.clock();}this.invalidatePeople();return this.commitRecipe(recipe);}
  async save(){
    this.requireReady();const token=this.operation,asset=copy(this.data.asset),recipe=copy(this.data.recipe),revision=this.data.revision;this.bind(recipe);this.publish({busy:'saving',error:null});
    try{if(this.api.assertPermission)await this.api.assertPermission(asset.id,'edit');this.check(token);const saved=await this.api.saveRecipe(asset.id,revision,recipe);this.check(token);if(!equal(saved.body,recipe)||saved.revision!==revision+1)throw Error('SAVE_RESPONSE_MISMATCH');this.bind(saved.body);await this.persist(this.history,this.cursor,{revision:saved.revision,dirty:false});this.check(token);this.publish({revision:saved.revision,dirty:false,busy:null});this.log('WEB_SAVE','PASS_CONTRACT_ONLY','CAS saved revision');return saved;}
    catch(e){if(token===this.operation){this.publish({busy:null,error:e.message});this.log('WEB_SAVE','REJECT',e.message);}throw e;}
  }
  cancelExport(){this.exportController?.abort();}
  async exportFinal({format='jpeg',quality=0.92}={}){
    this.requireReady();if(this.data.dirty||!this.data.revision)throw Error('SAVE_REQUIRED');if(!['jpeg','png'].includes(format)||!Number.isFinite(quality)||quality<0.01||quality>1)throw Error('EXPORT_SETTINGS_UNSUPPORTED');
    const token=this.operation,asset=copy(this.data.asset),recipe=copy(this.data.recipe),revision=this.data.revision,reference=copy(this.reference);this.bind(recipe,asset);if(portrait(recipe))this.requirePersonProcessing();this.exportController=new AbortController();const signal=this.exportController.signal;
    const ensure=()=>{this.check(token);if(signal.aborted)throw Error('EXPORT_ABORTED');if(this.data.revision!==revision||!equal(this.data.recipe,recipe))throw Error('EXPORT_RECIPE_CHANGED');};
    this.publish({exporting:true,error:null});
    try{
      if(this.api.assertPermission)await this.api.assertPermission(asset.id,'export');ensure();
      const stored=await this.api.getRecipe(asset.id);ensure();if(!stored||stored.revision!==revision||!equal(stored.body,recipe))throw Error('EXPORT_FIXED_RECIPE_MISMATCH');this.bind(stored.body,asset);
      const original=await this.api.getOriginal(asset.id,{signal});ensure();if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_MISMATCH');ensure();
      const decoded=await this.processing.decodeRaw(original.slice(0),{mode:'final',signal});ensure();let detections=[];
      if(portrait(recipe)){if(!reference)throw Error('UNTRUSTED_PERSON_INVENTORY');validatePortraitContinuity(reference,portrait(recipe));detections=await this.processing.detectPeople(decoded.pixels,{signal});ensure();}
      const pixels=await this.processing.render(decoded.pixels,recipe,{detections,signal});ensure();
      const output=await this.processing.encode(pixels,{format,quality,settings:recipe.parameters.extendedParameters.export,signal});ensure();
      if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_CHANGED');ensure();
      const current=await this.api.getRecipe(asset.id);ensure();if(current?.revision!==revision||!equal(current.body,recipe))throw Error('EXPORT_FIXED_RECIPE_MISMATCH');
      if(this.api.assertPermission)await this.api.assertPermission(asset.id,'export');ensure();
      this.log('WEB_FINAL_EXPORT','PASS_PIPELINE_ONLY','Real RAW and visual QA must independently pass',{original_before_checksum:asset.sha256,original_after_checksum:asset.sha256,face_brightness:portrait(recipe)?.targets.map(t=>({id:t.id,value:t.value})),provenance:decoded.provenance,render_provenance:pixels.provenance,format,output_bytes:output.size});return output;
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_FINAL_EXPORT','REJECT',e.message);this.publish({error:e.message});}throw e;}finally{if(token===this.operation)this.publish({exporting:false});this.exportController=null;}
  }
}
