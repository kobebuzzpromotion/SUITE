import {assertPixels,assertInputBuffer,checkAbort,sourceDimensions} from './pure.mjs';
import {validateLocalSavedBW} from './local-saved-bw.mjs';
import {planCanvasExpansion} from './canvas-expand.mjs';
import {ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS} from './add-shadow-manual-contract.mjs';
import {validateOutputSharpening} from '../export-output-adjustments.mjs';
import {validateSubjectMatte} from './background-composite.mjs';
import {ADD_SHADOW_MAX_PIXELS,ADD_SHADOW_BACKGROUND_SOURCE,
  validateAddShadowSettings} from './add-shadow.mjs';
export * from './pure.mjs';
const ADD_SHADOW_BINDING_KEYS=['assetID','originalSHA256','savedRevision','backdropID','backdropSHA256'];
const ADD_SHADOW_MATTE_KEYS=['kind','source','assetID','originalSHA256','savedRevision','width','height'];
const ADD_SHADOW_EVIDENCE_KEYS=['kind','source',...ADD_SHADOW_BINDING_KEYS,
  'width','height','compositeSHA256'];
const ADD_SHADOW_SETTINGS_KEYS=['mode','opacity','blur','gradient','blend',
  'offsetX','offsetY','shadowColor'];
const ADD_SHADOW_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADD_SHADOW_SHA=/^[0-9a-f]{64}$/i;
function plainRecord(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||prototype===Object.prototype||
    (Object.getPrototypeOf(prototype)===null&&Object.hasOwn(prototype,'constructor')&&
      prototype.constructor?.name==='Object');
}
function exactDataRecord(value,keys){
  return plainRecord(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor&&Object.hasOwn(descriptor,'value');
    });
}
function byteView(value,tag){
  return ArrayBuffer.isView(value)&&Object.prototype.toString.call(value)===tag;
}
function samePixels(left,right,signal){
  if(left.width!==right.width||left.height!==right.height||
      left.data.length!==right.data.length)return false;
  for(let index=0;index<left.data.length;index++){
    if(index%1_048_576===0)checkAbort(signal);
    if(left.data[index]!==right.data[index])return false;
  }
  checkAbort(signal);
  return true;
}
function prepareBoundAddShadowRuntime(runtime){
  if(!exactDataRecord(runtime,['method','target','sourceWidth','sourceHeight','args'])||
      runtime.method!=='applyBoundAddShadow'||
      !Number.isSafeInteger(runtime.sourceWidth)||runtime.sourceWidth<1||
      !Number.isSafeInteger(runtime.sourceHeight)||runtime.sourceHeight<1||
      runtime.sourceWidth*runtime.sourceHeight>ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS||
      !Array.isArray(runtime.args)||runtime.args.length!==5||
      Reflect.ownKeys(runtime.args).length!==6||
      ![0,1,2,3,4].every(index=>Object.hasOwn(runtime.args,index)))
    throw Error('ADD_SHADOW_FACADE_RUNTIME_INVALID');
  const {target,sourceWidth,sourceHeight}=runtime;
  if(target!=='source'&&target!=='proxy')throw Error('ADD_SHADOW_FACADE_TARGET_INVALID');
  const scale=target==='source'?1:Math.min(1,1600/Math.max(sourceWidth,sourceHeight));
  const width=Math.max(1,Math.round(sourceWidth*scale));
  const height=Math.max(1,Math.round(sourceHeight*scale));
  if(width*height>ADD_SHADOW_MAX_PIXELS)throw Error('ADD_SHADOW_FACADE_CAPACITY');
  const [composite,subject,evidence,binding,settings]=runtime.args;
  if(!exactDataRecord(composite,['width','height','data'])||
      composite.width!==width||composite.height!==height||
      !byteView(composite.data,'[object Uint8ClampedArray]')||
      composite.data.length!==width*height*4||
      !exactDataRecord(subject,['width','height','data','provenance'])||
      subject.width!==width||subject.height!==height||
      !(byteView(subject.data,'[object Uint8Array]')||
        byteView(subject.data,'[object Uint8ClampedArray]'))||
      subject.data.length!==width*height||
      !exactDataRecord(subject.provenance,ADD_SHADOW_MATTE_KEYS))
    throw Error('ADD_SHADOW_FACADE_PIXELS_INVALID');
  if(!exactDataRecord(binding,ADD_SHADOW_BINDING_KEYS)||
      !ADD_SHADOW_UUID.test(binding.assetID)||
      !ADD_SHADOW_SHA.test(binding.originalSHA256)||
      !Number.isSafeInteger(binding.savedRevision)||binding.savedRevision<1||
      !ADD_SHADOW_UUID.test(binding.backdropID)||
      !ADD_SHADOW_SHA.test(binding.backdropSHA256))
    throw Error('ADD_SHADOW_FACADE_BINDING_INVALID');
  const safeBinding=Object.fromEntries(ADD_SHADOW_BINDING_KEYS.map(key=>[key,binding[key]]));
  const safeProvenance=Object.fromEntries(ADD_SHADOW_MATTE_KEYS.map(key=>
    [key,subject.provenance[key]]));
  const safeSubject={width,height,data:new Uint8Array(subject.data),
    provenance:safeProvenance};
  validateSubjectMatte(safeSubject,{assetID:safeBinding.assetID,
    originalSHA256:safeBinding.originalSHA256,
    savedRevision:safeBinding.savedRevision},width,height);
  if(!exactDataRecord(evidence,ADD_SHADOW_EVIDENCE_KEYS)||
      evidence.kind!=='composited-replacement-background'||
      evidence.source!==ADD_SHADOW_BACKGROUND_SOURCE||
      evidence.width!==width||evidence.height!==height||
      !ADD_SHADOW_SHA.test(evidence.compositeSHA256)||
      ADD_SHADOW_BINDING_KEYS.some(key=>evidence[key]!==safeBinding[key]))
    throw Error('ADD_SHADOW_FACADE_BACKGROUND_INVALID');
  if(!exactDataRecord(settings,ADD_SHADOW_SETTINGS_KEYS))
    throw Error('ADD_SHADOW_FACADE_SETTINGS_INVALID');
  const safeSettings=validateAddShadowSettings(Object.fromEntries(
    ADD_SHADOW_SETTINGS_KEYS.map(key=>[key,settings[key]])));
  const safePixels={width,height,data:new Uint8ClampedArray(composite.data)};
  assertPixels(safePixels);
  const safeEvidence=Object.fromEntries(ADD_SHADOW_EVIDENCE_KEYS.map(key=>
    [key,evidence[key]]));
  return {method:'applyBoundAddShadow',target,sourceWidth,sourceHeight,
    args:[safePixels,safeSubject,safeEvidence,safeBinding,
      {...safeSettings,shadowColor:[...safeSettings.shadowColor]}]};
}
function encodeResolution(value){
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&(Object.getPrototypeOf(prototype)!==null||
    !Object.hasOwn(prototype,'constructor')||prototype.constructor?.name!=='Object'))throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
  if(Reflect.ownKeys(value).some(key=>!['unit','value'].includes(key))||
    !['ppi','ppc'].includes(value.unit)||!Number.isSafeInteger(value.value)||
    value.value<1||value.value>65535)throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
  return {unit:value.unit,value:value.value};
}
function blushPlainRecord(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===null||prototype===Object.prototype||
    (Object.getPrototypeOf(prototype)===null&&
      Object.getOwnPropertyDescriptor(prototype,'constructor')?.value?.name==='Object');
}
function blushExactData(value,keys){
  return blushPlainRecord(value)&&Reflect.ownKeys(value).length===keys.length&&
    keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor&&Object.hasOwn(descriptor,'value');
    });
}
function snapshotBlushRecipe(value,depth=0,seen=new WeakSet(),budget={nodes:0}){
  if(depth>32||++budget.nodes>100_000)
    throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
  if(typeof value==='string'||typeof value==='boolean'||value===null)return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(!value||typeof value!=='object'||seen.has(value))
    throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
  seen.add(value);
  let copy;
  if(Array.isArray(value)){
    if(value.length>4096||Reflect.ownKeys(value).length!==value.length+1)
      throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
    copy=[];
    for(let index=0;index<value.length;index++){
      const property=Object.getOwnPropertyDescriptor(value,String(index));
      if(!property||!Object.hasOwn(property,'value'))
        throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
      copy.push(snapshotBlushRecipe(property.value,depth+1,seen,budget));
    }
  }else{
    if(!blushPlainRecord(value))throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
    copy={};
    for(const key of Reflect.ownKeys(value)){
      if(typeof key!=='string')throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
      const property=Object.getOwnPropertyDescriptor(value,key);
      if(!property||!Object.hasOwn(property,'value'))
        throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
      Object.defineProperty(copy,key,{value:snapshotBlushRecipe(property.value,depth+1,seen,budget),
        enumerable:true,writable:true,configurable:true});
    }
  }
  seen.delete(value);
  return copy;
}
export function createProcessing({workerURL='/processing-worker.js',timeoutMs=120000}={}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('INVALID_WORKER_TIMEOUT');
  const active=new Set();let disposed=false,sequence=0;
  function call(method,args,signal) {
    return new Promise((resolve,reject)=>{
      let worker,timer,finished=false;
      const complete=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(worker){worker.terminate();active.delete(cancel);}error?reject(error):resolve(value);};
      const abort=()=>complete(new DOMException('Processing cancelled','AbortError'));
      const cancel=()=>complete(new DOMException('Processing disposed','AbortError'));
      try {checkAbort(signal);if(disposed)throw Error('PROCESSING_DISPOSED');if(typeof Worker==='undefined')throw Error('BROWSER_WORKER_UNAVAILABLE');
        worker=new Worker(workerURL);active.add(cancel);const id=++sequence;
        worker.onmessage=({data})=>{if(data.id!==id)return;if(data.error){const error=new Error(data.error.message);error.name=data.error.name;error.code=data.error.code;complete(error);}else complete(null,data.result);};
        worker.onerror=e=>complete(new Error(e.message||'PROCESSING_WORKER_FAILED'));
        worker.onmessageerror=()=>complete(new Error('PROCESSING_TRANSFER_FAILED'));
        signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>complete(new Error('PROCESSING_TIMEOUT')),timeoutMs);
        // Transfer only owned copies: callers' immutable Original and unedited base remain intact.
        const owned=args.map(a=>a instanceof ArrayBuffer?a.slice(0):a?.data instanceof Uint8ClampedArray?{...a,data:a.data.slice()}:a);
        const transfer=owned.flatMap(a=>a instanceof ArrayBuffer?[a]:a?.data instanceof Uint8ClampedArray?[a.data.buffer]:[]);
        worker.postMessage({id,method,args:owned},transfer);
      }catch(error){complete(error);}
    });
  }
  return {
    async decodeRaw(buffer,{signal,mode='final'}={}){assertInputBuffer(buffer);return call('decodeRaw',[buffer,{mode}],signal);},
    async renderWebRawDenoise(buffer,settings,{signal}={}){assertInputBuffer(buffer);return call('renderWebRawDenoise',[buffer,settings],signal);},
    async makeProxy(pixels,maxEdge=1600){assertPixels(pixels);return call('makeProxy',[pixels,maxEdge]);},
    async detectPeople(pixels,{signal}={}){assertPixels(pixels);return call('detectPeople',[pixels,{}],signal);},
    async render(pixels,recipe,{detections=[],signal,localLUT,bwEdgeRuntime,bwEdgeTarget,localSavedBW,
      addShadowRuntime,addShadowOriginal,addShadowTarget,appleLocalAuthorized=false}={}){
      assertPixels(pixels);
      const extra=recipe?.parameters?.extendedParameters;
      if(extra&&Object.hasOwn(extra,'originalShadowManual'))
        throw Error('ORIGINAL_SHADOW_MANUAL_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'blushManual'))
        throw Error('MANUAL_BLUSH_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'clothingSpotManual'))
        throw Error('MANUAL_CLOTHING_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'handToneManual'))
        throw Error('MANUAL_HAND_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'contactsIrisManual'))
        throw Error('MANUAL_CONTACTS_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'eyelinerManual'))
        throw Error('MANUAL_EYELINER_INDEPENDENT_RUNTIME_REQUIRED');
      if(extra&&Object.hasOwn(extra,'eyeshadowManual'))
        throw Error('MANUAL_EYESHADOW_INDEPENDENT_RUNTIME_REQUIRED');
      const manual=extra&&typeof extra==='object'&&Object.hasOwn(extra,'bwEdgeManual');
      if(localSavedBW!==undefined){
        if(!manual||bwEdgeRuntime!==undefined||bwEdgeTarget!==undefined)throw Error('LOCAL_SAVED_BW_RUNTIME_CONFLICT');
        validateLocalSavedBW(pixels,extra.bwEdgeManual,localSavedBW,{signal});
      }
      if(manual&&localSavedBW===undefined&&(!bwEdgeRuntime||!['proxy','source'].includes(bwEdgeTarget)))
        throw Error('BW_EDGE_MANUAL_RUNTIME_REQUIRED');
      const shadow=extra&&typeof extra==='object'&&Object.hasOwn(extra,'addShadowManual');
      let safeShadow;
      if(shadow){
        if(!addShadowRuntime||!addShadowOriginal||!['proxy','source'].includes(addShadowTarget))
          throw Error('ADD_SHADOW_MANUAL_RUNTIME_REQUIRED');
        safeShadow=prepareBoundAddShadowRuntime(addShadowRuntime);
        assertPixels(addShadowOriginal);
        const docBinding=extra.addShadowManual?.binding;
        const runtimeBinding=safeShadow.args[3];
        if(safeShadow.target!==addShadowTarget||
            ['assetID','originalSHA256','backdropID','backdropSHA256'].some(
              key=>docBinding?.[key]!==runtimeBinding[key])||
            docBinding?.sourceWidth!==safeShadow.sourceWidth||
            docBinding?.sourceHeight!==safeShadow.sourceHeight||
            sourceDimensions(pixels).width!==safeShadow.sourceWidth||
            sourceDimensions(pixels).height!==safeShadow.sourceHeight||
            !samePixels(pixels,addShadowOriginal,signal))
          throw Error('ADD_SHADOW_MANUAL_SOURCE_OR_BINDING_MISMATCH');
      }else if(addShadowRuntime!==undefined||addShadowOriginal!==undefined||
          addShadowTarget!==undefined)throw Error('ADD_SHADOW_MANUAL_RUNTIME_UNEXPECTED');
      if(extra?.appleLocalBundle&&appleLocalAuthorized!==true)throw Error('APPLE_BUNDLE_AUTHORIZATION_REQUIRED');
      return call('render',[pixels,recipe,{detections,localLUT,appleLocalAuthorized:appleLocalAuthorized===true,
        ...(manual?(localSavedBW!==undefined?{localSavedBW}:{bwEdgeRuntime,bwEdgeTarget}):{}),
        ...(shadow?{addShadowRuntime:safeShadow,addShadowTarget}:{})}],signal);
    },
    /** Explicit owner-authored B/W edge operation; never part of the legacy render order. */
    async renderBWEdgeManual(pixels,document,runtime,{target,signal}={}){
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')throw Error('BW_EDGE_MANUAL_TARGET_INVALID');
      return call('renderBWEdgeManual',[pixels,document,runtime,{target}],signal);
    },
    /** Isolated saved manual cheek color; caller assertions are not authorization. */
    async renderManualFreckles(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);if(disposed)throw Error('PROCESSING_DISPOSED');assertPixels(pixels);
      if(target!=='source')throw Error('MANUAL_FRECKLES_TARGET_INVALID');
      const saved=structuredClone(savedRecipe),proof=structuredClone(runtime);
      if(JSON.stringify(saved).length>2_000_000)throw Error('MANUAL_FRECKLES_RECIPE_LIMIT');
      return call('renderManualFreckles',[pixels,saved,proof,{target}],signal);
    },
    async renderManualBlush(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')throw Error('MANUAL_BLUSH_TARGET_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','personID',
            'sourceWidth','sourceHeight','draftBaseRevision','savedRevision',
            'ownerConfirmed'])||runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_BLUSH_FACADE_RUNTIME_INVALID');
      const body=snapshotBlushRecipe(savedRecipe.body);
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_BLUSH_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','personID',
        'sourceWidth','sourceHeight','draftBaseRevision','savedRevision',
        'ownerConfirmed'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_BLUSH_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualBlush',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Isolated saved manual clothing spot; caller claims are not authorization. */
    async renderManualClothingSpot(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')
        throw Error('MANUAL_CLOTHING_TARGET_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','sourceWidth',
            'sourceHeight','savedRevision'])||
          runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_CLOTHING_FACADE_RUNTIME_INVALID');
      let body;
      try {body=snapshotBlushRecipe(savedRecipe.body);}
      catch {throw Error('MANUAL_CLOTHING_FACADE_RECIPE_INVALID');}
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_CLOTHING_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','sourceWidth',
        'sourceHeight','savedRevision'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_CLOTHING_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualClothingSpot',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Isolated saved manual hand tone; caller claims are not authentication. */
    async renderManualHandTone(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
      if(!blushExactData(pixels,hasSource?[
        'width','height','data','sourceWidth','sourceHeight']:['width','height','data']))
        throw Error('MANUAL_HAND_FACADE_PIXELS_INVALID');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')
        throw Error('MANUAL_HAND_TARGET_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','sourceWidth',
            'sourceHeight','savedRevision'])||
          runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_HAND_FACADE_RUNTIME_INVALID');
      let body;
      try {body=snapshotBlushRecipe(savedRecipe.body);}
      catch {throw Error('MANUAL_HAND_FACADE_RECIPE_INVALID');}
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_HAND_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','sourceWidth',
        'sourceHeight','savedRevision'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_HAND_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualHandTone',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Isolated saved manual iris color; caller claims are not authentication. */
    async renderManualContacts(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
      if(!blushExactData(pixels,hasSource?[
        'width','height','data','sourceWidth','sourceHeight']:['width','height','data']))
        throw Error('MANUAL_CONTACTS_FACADE_PIXELS_INVALID');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')
        throw Error('MANUAL_CONTACTS_TARGET_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','personID','eye',
            'sourceWidth','sourceHeight','savedRevision'])||
          runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_CONTACTS_FACADE_RUNTIME_INVALID');
      let body;
      try {body=snapshotBlushRecipe(savedRecipe.body);}
      catch {throw Error('MANUAL_CONTACTS_FACADE_RECIPE_INVALID');}
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_CONTACTS_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','personID','eye',
        'sourceWidth','sourceHeight','savedRevision'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_CONTACTS_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualContacts',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Isolated saved manual eyelid line; caller claims are not authentication. */
    async renderManualEyeliner(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
      if(!blushExactData(pixels,hasSource?[
        'width','height','data','sourceWidth','sourceHeight']:['width','height','data']))
        throw Error('MANUAL_EYELINER_FACADE_PIXELS_INVALID');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')
        throw Error('MANUAL_EYELINER_TARGET_INVALID');
      if((target==='proxy'&&!hasSource)||(target==='source'&&hasSource))
        throw Error('MANUAL_EYELINER_FACADE_PIXELS_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','personID',
            'sourceWidth','sourceHeight','savedRevision'])||
          runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_EYELINER_FACADE_RUNTIME_INVALID');
      let body;
      try {body=snapshotBlushRecipe(savedRecipe.body);}
      catch {throw Error('MANUAL_EYELINER_FACADE_RECIPE_INVALID');}
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_EYELINER_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','personID',
        'sourceWidth','sourceHeight','savedRevision'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_EYELINER_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualEyeliner',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Isolated saved three-role eyeshadow; caller claims are not authentication. */
    async renderManualEyeshadow(pixels,savedRecipe,runtime,{target,signal}={}){
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
      if(!blushExactData(pixels,hasSource?[
        'width','height','data','sourceWidth','sourceHeight']:['width','height','data']))
        throw Error('MANUAL_EYESHADOW_FACADE_PIXELS_INVALID');
      assertPixels(pixels);
      if(target!=='source'&&target!=='proxy')
        throw Error('MANUAL_EYESHADOW_TARGET_INVALID');
      if((target==='proxy'&&!hasSource)||(target==='source'&&hasSource&&
          (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
        throw Error('MANUAL_EYESHADOW_FACADE_PIXELS_INVALID');
      if(!blushExactData(savedRecipe,['revision','body'])||
          !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
          !blushExactData(runtime,['assetID','originalSHA256','personID','eye',
            'sourceWidth','sourceHeight','savedRevision'])||
          runtime.savedRevision!==savedRecipe.revision)
        throw Error('MANUAL_EYESHADOW_FACADE_RUNTIME_INVALID');
      let body;
      try{body=snapshotBlushRecipe(savedRecipe.body);}
      catch{throw Error('MANUAL_EYESHADOW_FACADE_RECIPE_INVALID');}
      if(JSON.stringify(body).length>2_000_000)
        throw Error('MANUAL_EYESHADOW_FACADE_RECIPE_INVALID');
      const proof=Object.fromEntries(['assetID','originalSHA256','personID','eye',
        'sourceWidth','sourceHeight','savedRevision'].map(key=>[key,runtime[key]]));
      if(sourceDimensions(pixels).width!==proof.sourceWidth||
          sourceDimensions(pixels).height!==proof.sourceHeight)
        throw Error('MANUAL_EYESHADOW_FACADE_SOURCE_DIMENSIONS_MISMATCH');
      return call('renderManualEyeshadow',[pixels,{revision:savedRecipe.revision,body},
        proof,{target}],signal);
    },
    /** Explicit manual shadow only; not a Recipe stage or owner authorization. */
    async applyBoundAddShadow(runtime,options={}){
      if(!plainRecord(options)||Reflect.ownKeys(options).some(key=>key!=='signal'||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))
        throw Error('ADD_SHADOW_FACADE_OPTIONS_INVALID');
      const {signal}=options;
      checkAbort(signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      const owned=prepareBoundAddShadowRuntime(runtime);
      return call('applyBoundAddShadow',[owned],signal);
    },
    /** Isolated Original Shadow Worker call. Caller must provide fresh saved
     * Recipe/Asset authority and prove decoded bytes outside this facade. */
    async applyBoundOriginalShadowManual(payload,options={}){
      if(!plainRecord(options)||Reflect.ownKeys(options).some(key=>key!=='signal'||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))
        throw Error('ORIGINAL_SHADOW_FACADE_OPTIONS_INVALID');
      checkAbort(options.signal);
      if(disposed)throw Error('PROCESSING_DISPOSED');
      return call('applyBoundOriginalShadowManual',[payload],options.signal);
    },
    async resizeForExport(pixels,settings,{signal}={}){assertPixels(pixels);return call('resizeForExport',[pixels,settings],signal);},
    /** Explicit Final-only post-resize stage. Never mutates an Editor Recipe or Original. */
    async applyExportOutputSharpening(pixels,settings={kind:'none'},{signal}={}){
      assertPixels(pixels);
      return call('applyExportOutputSharpening',[pixels,{...validateOutputSharpening(settings)}],signal);
    },
    async expandCanvas(pixels,settings,{signal}={}){assertPixels(pixels);planCanvasExpansion(pixels,settings);return call('expandCanvas',[pixels,settings],signal);},
    async encode(pixels,{signal,...options}={}){
      assertPixels(pixels);
      // Copy the opt-in density record before crossing the Worker boundary.
      // Omitted resolution keeps Preview PNG and legacy Final encoding intact.
      if(Object.hasOwn(options,'resolution'))options.resolution=encodeResolution(options.resolution);
      // The displacement field belongs to the live brush coordinate mapper,
      // not PNG/JPEG output. Keep it on the caller without cloning it again.
      const {liquifyField:unusedField,...encodingPixels}=pixels;
      return call('encode',[encodingPixels,options],signal);
    },
    dispose(){disposed=true;for(const cancel of [...active])cancel();}
  };
}
