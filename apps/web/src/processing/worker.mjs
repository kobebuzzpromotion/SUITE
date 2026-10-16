import {validateRecipe} from '../../../backend/src/photo-policy.ts';
import {validateLocalSavedBW,applyLocalSavedBW} from './local-saved-bw.mjs';
import {resolutionAssessment,validateExportSettings} from '../../../backend/src/crop-export.ts';
import {decodeRaw} from './raw.mjs';
import {renderWebRawDenoise} from './web-raw-denoise.mjs';
import {encode} from './encode.mjs';
import {renderPixels,makeProxyPixels,sourceDimensions,assertPixels,WEB_ENGINE} from './pure.mjs';
import {resizeExportPixels} from '../export-size.mjs';
import {expandCanvasPixels} from './canvas-expand.mjs';
import {projectCanvasExpansion} from './canvas-expand-projection.mjs';
import {applyExportOutputSharpening} from '../export-output-adjustments.mjs';
import {validateBWEdgeManualContract} from './bw-edge-manual-contract.mjs';
import {rasterizeBWEdgeManualMasks} from './bw-edge-correction-mask.mjs';
import {applyBlackWhiteEdgeManualArea} from './bw-edge-manual-area.mjs';
import {applyBoundAddShadow,ADD_SHADOW_MAX_PIXELS} from './add-shadow.mjs';
import {ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS} from './add-shadow-manual-contract.mjs';
import {ORIGINAL_SHADOW_MANUAL_MAX_SOURCE_PIXELS} from '../original-shadow-manual-recipe.mjs';
import {applyBoundOriginalShadow,validateOriginalShadowMasks,
  ORIGINAL_SHADOW_MAX_PIXELS} from './original-shadow.mjs';
import {authorSubjectMask} from './subject-mask-authoring.mjs';
import {rasterizeManualBlushMask} from './manual-blush-mask-runtime.mjs';
import {renderManualFrecklesPixels} from './manual-freckles-render.mjs';
import {applyManualBlushColor,MANUAL_BLUSH_MAX_PIXELS} from './manual-blush-color.mjs';
import {applyManualClothingSpot,MANUAL_CLOTHING_MAX_PIXELS} from './manual-clothing-spot.mjs';
import {rasterizeManualHandMask} from './manual-hand-mask-runtime.mjs';
import {applyManualHandTone,MANUAL_HAND_TONE_MAX_PIXELS} from './manual-hand-tone.mjs';
import {rasterizeManualContactsMasks} from './manual-contacts-mask-runtime.mjs';
import {applyManualContactsIrisColor,MANUAL_CONTACTS_MAX_PIXELS} from './manual-contacts-iris-color.mjs';
import {renderSavedManualEyeliner} from './manual-eyeliner-runtime.mjs';
import {MANUAL_EYELINER_MAX_PIXELS} from './manual-eyeliner-line.mjs';
import {rasterizeManualEyeshadowMasks} from './manual-eyeshadow-mask-runtime.mjs';
import {applyManualEyeshadowColor,MANUAL_EYESHADOW_MAX_PIXELS} from
  './manual-eyeshadow-color.mjs';
const exactRecord=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value');
  });
function assertBWEdgeMaskProof(mask,role,validated,target,dimensions){
  if(!exactRecord(mask,['width','height','data','provenance'])||
      mask.width!==dimensions.width||mask.height!==dimensions.height||
      !(mask.data instanceof Uint8Array||mask.data instanceof Uint8ClampedArray)||
      mask.data.length!==dimensions.width*dimensions.height)
    throw Error('BW_EDGE_MANUAL_MASK_PROVENANCE_INVALID');
  const {binding}=validated.document,proof=mask.provenance;
  const common=['kind','source','assetID','originalSHA256','savedRevision'];
  const keys=role==='subject'?[...common,'width','height']:
    [...common,'sourceWidth','sourceHeight','target','width','height'];
  const expected=validated.maskRoles[role];
  if(!exactRecord(proof,keys)||proof.kind!==expected.kind||proof.source!==expected.source||
      proof.assetID!==binding.assetID||proof.originalSHA256!==binding.originalSHA256||
      proof.savedRevision!==validated.context.savedRevision||
      proof.width!==dimensions.width||proof.height!==dimensions.height||
      (role==='correction'&&(proof.sourceWidth!==binding.sourceWidth||
        proof.sourceHeight!==binding.sourceHeight||proof.target!==target)))
    throw Error('BW_EDGE_MANUAL_MASK_PROVENANCE_INVALID');
  // The legacy subject-matte provenance has target dimensions but no full-source
  // fields. Its full geometry is established by the validated binding and the
  // rasterizer's exact source/proxy dimension gate before this check.
  return {width:mask.width,height:mask.height,data:mask.data};
}
function expectedBWEdgeTarget(binding,target){
  if(target==='source')return {width:binding.sourceWidth,height:binding.sourceHeight};
  if(target!=='proxy')throw Error('BW_EDGE_MANUAL_TARGET_INVALID');
  const scale=Math.min(1,1600/Math.max(binding.sourceWidth,binding.sourceHeight));
  return {width:Math.max(1,Math.round(binding.sourceWidth*scale)),
    height:Math.max(1,Math.round(binding.sourceHeight*scale))};
}
function renderBWEdgeManualPixels(pixels,document,runtime,{target}={}){
  if(target!=='source'&&target!=='proxy')throw Error('BW_EDGE_MANUAL_TARGET_INVALID');
  // This checks the document and claimed runtime; the Worker is not an auth authority.
  const validated=validateBWEdgeManualContract(document,runtime);
  const expected=expectedBWEdgeTarget(validated.document.binding,target);
  if(pixels?.width!==expected.width||pixels?.height!==expected.height)
    throw Error('BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH');
  if(target==='proxy'&&(!Object.hasOwn(pixels,'sourceWidth')||
      !Object.hasOwn(pixels,'sourceHeight')))
    throw Error('BW_EDGE_MANUAL_SOURCE_DIMENSIONS_MISMATCH');
  const source=sourceDimensions(pixels),binding=validated.document.binding;
  if(source.width!==binding.sourceWidth||source.height!==binding.sourceHeight)
    throw Error('BW_EDGE_MANUAL_SOURCE_DIMENSIONS_MISMATCH');
  const masks=rasterizeBWEdgeManualMasks(pixels,validated.document,runtime,{target});
  const subject=assertBWEdgeMaskProof(masks.subjectMask,'subject',validated,target,expected);
  const correction=assertBWEdgeMaskProof(masks.correctionMask,'correction',validated,target,expected);
  return applyBlackWhiteEdgeManualArea(pixels,subject,correction);
}
function expectedAddShadowTarget(sourceWidth,sourceHeight,target){
  if(!Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight)||
      sourceWidth<1||sourceHeight<1||sourceWidth*sourceHeight>ADD_SHADOW_MANUAL_MAX_SOURCE_PIXELS)
    throw Error('ADD_SHADOW_WORKER_SOURCE_DIMENSIONS_INVALID');
  if(target==='source'){
    if(sourceWidth*sourceHeight>ADD_SHADOW_MAX_PIXELS)throw Error('ADD_SHADOW_WORKER_CAPACITY');
    return {width:sourceWidth,height:sourceHeight};
  }
  if(target!=='proxy')throw Error('ADD_SHADOW_WORKER_TARGET_INVALID');
  const scale=Math.min(1,1600/Math.max(sourceWidth,sourceHeight));
  return {width:Math.max(1,Math.round(sourceWidth*scale)),
    height:Math.max(1,Math.round(sourceHeight*scale))};
}
async function renderBoundAddShadowPixels(payload){
  if(!exactRecord(payload,['method','target','sourceWidth','sourceHeight','args'])||
      payload.method!=='applyBoundAddShadow'||!Array.isArray(payload.args)||
      payload.args.length!==5||Reflect.ownKeys(payload.args).length!==6||
      ![0,1,2,3,4].every(index=>Object.hasOwn(payload.args,index)))
    throw Error('ADD_SHADOW_WORKER_RUNTIME_INVALID');
  const expected=expectedAddShadowTarget(payload.sourceWidth,payload.sourceHeight,payload.target);
  const [composite,subjectMask,backgroundEvidence,binding,settings]=payload.args;
  assertPixels(composite);
  if(composite.width!==expected.width||composite.height!==expected.height||
      subjectMask?.width!==expected.width||subjectMask?.height!==expected.height)
    throw Error('ADD_SHADOW_WORKER_TARGET_DIMENSIONS_MISMATCH');
  // This is a fresh Worker-owned snapshot; it cannot inherit an unchecked
  // "Original" provenance property from a prior render or user payload.
  const pixels={width:expected.width,height:expected.height,
    data:new Uint8ClampedArray(composite.data)};
  // applyBoundAddShadow re-checks matte role, Asset/SHA/revision/backdrop binding,
  // composite digest and settings after crossing the Worker realm boundary.
  // Those matching claims are not owner authentication or Blob provenance.
  return applyBoundAddShadow(pixels,subjectMask,backgroundEvidence,binding,settings);
}
async function renderBoundOriginalShadowManual(payload){
  if(!exactRecord(payload,['representation','savedRecipe','binding','original',
      'composite','compositeEvidence','subjectMask','shadowMask'])||
      !exactRecord(payload.savedRecipe,['revision','body'])||
      !Number.isSafeInteger(payload.savedRecipe.revision)||
      payload.savedRecipe.revision<1||
      !exactRecord(payload.binding,['assetID','originalSHA256','backdropID',
        'backdropSHA256','savedRevision'])||
      payload.binding.savedRevision!==payload.savedRecipe.revision)
    throw Error('ORIGINAL_SHADOW_WORKER_RUNTIME_INVALID');
  validateRecipe(payload.savedRecipe.body);
  const document=payload.savedRecipe.body.parameters.extendedParameters.originalShadowManual;
  if(!document)throw Error('ORIGINAL_SHADOW_WORKER_DOCUMENT_REQUIRED');
  const saved=document.binding,bound=payload.binding;
  if(['assetID','originalSHA256','backdropID','backdropSHA256'].some(
      key=>saved[key]!==bound[key]))
    throw Error('ORIGINAL_SHADOW_WORKER_BINDING_MISMATCH');
  const addShadow=payload.savedRecipe.body.parameters.extendedParameters.addShadowManual;
  if(addShadow&&['assetID','originalSHA256','sourceWidth','sourceHeight',
      'backdropID','backdropSHA256'].some(key=>addShadow.binding[key]!==saved[key]))
    throw Error('ORIGINAL_SHADOW_WORKER_BACKDROP_CONFLICT');
  const {original,composite,subjectMask,shadowMask,representation}=payload;
  assertPixels(original);assertPixels(composite);
  // Shared backing stores could change while the async digest is pending.
  if(!(original.data.buffer instanceof ArrayBuffer)||
      !(composite.data.buffer instanceof ArrayBuffer)||
      !(subjectMask?.data?.buffer instanceof ArrayBuffer)||
      !(shadowMask?.data?.buffer instanceof ArrayBuffer))
    throw Error('ORIGINAL_SHADOW_WORKER_SHARED_PIXELS_INVALID');
  if(saved.sourceWidth*saved.sourceHeight>ORIGINAL_SHADOW_MANUAL_MAX_SOURCE_PIXELS||
      original.width!==composite.width||original.height!==composite.height||
      original.width*original.height>ORIGINAL_SHADOW_MAX_PIXELS||
      !exactRecord(composite,['width','height','data']))
    throw Error('ORIGINAL_SHADOW_WORKER_DIMENSIONS_MISMATCH');
  if(representation==='original'){
    if(!exactRecord(original,['width','height','data'])||
        original.width!==saved.sourceWidth||original.height!==saved.sourceHeight)
      throw Error('ORIGINAL_SHADOW_WORKER_DIMENSIONS_MISMATCH');
  }else if(representation==='proxy'){
    if(!exactRecord(original,['width','height','sourceWidth','sourceHeight','data'])||
        original.sourceWidth!==saved.sourceWidth||
        original.sourceHeight!==saved.sourceHeight||
        (original.width===saved.sourceWidth&&original.height===saved.sourceHeight)||
        Math.abs(original.width*saved.sourceHeight-original.height*saved.sourceWidth)>
          Math.max(saved.sourceWidth,saved.sourceHeight))
      throw Error('ORIGINAL_SHADOW_WORKER_DIMENSIONS_MISMATCH');
  }else throw Error('ORIGINAL_SHADOW_WORKER_REPRESENTATION_INVALID');
  const evidence=payload.compositeEvidence;
  if(!exactRecord(evidence,['kind','source','assetID','originalSHA256',
      'backdropID','backdropSHA256','savedRevision','representation',
      'width','height','pixelsSHA256'])||
      evidence.kind!=='composited-replacement-background'||
      evidence.source!=='owner-selected-image-backdrop-unverified'||
      evidence.representation!==representation||evidence.width!==composite.width||
      evidence.height!==composite.height||
      !/^[0-9a-f]{64}$/i.test(evidence.pixelsSHA256)||
      ['assetID','originalSHA256','backdropID','backdropSHA256','savedRevision'].some(
        key=>evidence[key]!==bound[key]))
    throw Error('ORIGINAL_SHADOW_WORKER_BACKGROUND_PROVENANCE_MISMATCH');
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    savedRevision:bound.savedRevision};
  // Provenance labels are not authorization. Re-rasterize the saved document
  // here and reject caller-supplied masks that differ by even one byte.
  const expectedSubject=authorSubjectMask(original,document.subjectStrokes,context,
    {ownerConfirmed:true});
  const expectedShadow=authorSubjectMask(original,document.shadowStrokes,context,
    {ownerConfirmed:true});
  validateOriginalShadowMasks(subjectMask,shadowMask,context,
    original.width,original.height);
  if(subjectMask.data.length!==expectedSubject.data.length||
      shadowMask.data.length!==expectedShadow.data.length)
    throw Error('ORIGINAL_SHADOW_WORKER_MASK_DOCUMENT_MISMATCH');
  for(let index=0;index<expectedSubject.data.length;index++){
    if(subjectMask.data[index]!==expectedSubject.data[index]||
        shadowMask.data[index]!==expectedShadow.data[index])
      throw Error('ORIGINAL_SHADOW_WORKER_MASK_DOCUMENT_MISMATCH');
  }
  const subtle=globalThis.crypto?.subtle;
  if(!subtle)throw Error('ORIGINAL_SHADOW_WORKER_CRYPTO_UNAVAILABLE');
  // A digest binds this Worker call to the exact supplied composite bytes. It
  // does not prove those bytes actually came from the claimed backdrop Asset.
  const frozenComposite={width:composite.width,height:composite.height,
    data:new Uint8ClampedArray(composite.data)};
  const hash=new Uint8Array(await subtle.digest('SHA-256',frozenComposite.data));
  if(Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('')!==
      evidence.pixelsSHA256.toLowerCase())
    throw Error('ORIGINAL_SHADOW_WORKER_BACKGROUND_PIXELS_MISMATCH');
  return applyBoundOriginalShadow(original,frozenComposite,subjectMask,shadowMask,
    context,{opacity:document.settings.opacity});
}
function renderManualBlushPixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||
      !['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','personID','sourceWidth',
        'sourceHeight','draftBaseRevision','savedRevision','ownerConfirmed'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_BLUSH_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.blushManual;
  if(!document)throw Error('MANUAL_BLUSH_WORKER_DOCUMENT_REQUIRED');
  const hasSource=Object.hasOwn(pixels,'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource&&
        (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
    throw Error('MANUAL_BLUSH_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_BLUSH_MAX_PIXELS)
    throw Error('MANUAL_BLUSH_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_BLUSH_WORKER_SHARED_PIXELS_INVALID');
  // Snapshot before any mask work. Claims of Asset/SHA/person/permission are
  // structurally checked, never authenticated by this Worker operation.
  const frozen={width:pixels.width,height:pixels.height,
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{}),
    data:new Uint8ClampedArray(pixels.data)};
  const mask=rasterizeManualBlushMask(frozen,document,runtime,
    {target:options.target});
  const bound=document.binding;
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    personID:bound.personID,savedRevision:savedRecipe.revision,
    sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
    target:options.target};
  return applyManualBlushColor(frozen,mask,document.settings,context);
}
function renderManualClothingSpotPixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||!['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','sourceWidth',
        'sourceHeight','savedRevision'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_CLOTHING_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.clothingSpotManual;
  if(!document)throw Error('MANUAL_CLOTHING_WORKER_DOCUMENT_REQUIRED');
  const bound=document.binding;
  if(['assetID','originalSHA256','sourceWidth','sourceHeight'].some(
      key=>runtime[key]!==bound[key]))
    throw Error('MANUAL_CLOTHING_WORKER_BINDING_MISMATCH');
  const hasSource=Object.hasOwn(pixels,'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource&&
        (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
    throw Error('MANUAL_CLOTHING_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_CLOTHING_MAX_PIXELS)
    throw Error('MANUAL_CLOTHING_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_CLOTHING_WORKER_SHARED_PIXELS_INVALID');
  const scale=options.target==='source'?1:
    Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
  const width=Math.max(1,Math.round(bound.sourceWidth*scale));
  const height=Math.max(1,Math.round(bound.sourceHeight*scale));
  if(pixels.width!==width||pixels.height!==height||
      sourceDimensions(pixels).width!==bound.sourceWidth||
      sourceDimensions(pixels).height!==bound.sourceHeight)
    throw Error('MANUAL_CLOTHING_WORKER_DIMENSIONS_MISMATCH');
  const project=rect=>{
    const x=Math.round(rect.x*width),y=Math.round(rect.y*height);
    return {x,y,width:Math.round((rect.x+rect.width)*width)-x,
      height:Math.round((rect.y+rect.height)*height)-y};
  };
  const target=project(document.targetRect),reference=project(document.referenceRect);
  if(target.width!==reference.width||target.height!==reference.height||
      target.width<2||target.height<2||target.width>256||target.height>256||
      target.x+target.width>width||target.y+target.height>height||
      reference.x+reference.width>width||reference.y+reference.height>height||
      (target.x<reference.x+reference.width&&reference.x<target.x+target.width&&
        target.y<reference.y+reference.height&&reference.y<target.y+target.height))
    throw Error('MANUAL_CLOTHING_WORKER_PROJECTED_REGIONS_INVALID');
  // A worker-owned snapshot prevents caller mutation while rasterizing. Mask
  // authoring is reused only for its bounded normalized brush mathematics;
  // ownerConfirmed is a local API switch, not a credential or garment proof.
  const frozen={width,height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{})};
  const patch={width:target.width,height:target.height,
    data:new Uint8ClampedArray(target.width*target.height*4)};
  for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){
    const from=((target.y+y)*width+target.x+x)*4;
    patch.data.set(frozen.data.subarray(from,from+4),(y*target.width+x)*4);
  }
  const maskContext={assetID:bound.assetID,
    originalSHA256:bound.originalSHA256,savedRevision:savedRecipe.revision};
  const authored=authorSubjectMask(patch,document.targetStrokes,maskContext,
    {ownerConfirmed:true});
  const mask={width:target.width,height:target.height,data:authored.data,
    provenance:{kind:'manual-clothing-target-coverage',
      source:'caller-explicit-target-and-reference',assetID:bound.assetID,
      originalSHA256:bound.originalSHA256,
      savedRevision:savedRecipe.revision,sourceWidth:bound.sourceWidth,
      sourceHeight:bound.sourceHeight,target:options.target,
      targetRect:target,referenceRect:reference}};
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    savedRevision:savedRecipe.revision,sourceWidth:bound.sourceWidth,
    sourceHeight:bound.sourceHeight,target:options.target};
  return applyManualClothingSpot(frozen,mask,{target,reference},context);
}
function renderManualHandTonePixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||!['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','sourceWidth',
        'sourceHeight','savedRevision'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_HAND_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.handToneManual;
  if(!document)throw Error('MANUAL_HAND_WORKER_DOCUMENT_REQUIRED');
  const bound=document.binding;
  if(runtime.assetID!==bound.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      runtime.sourceWidth!==bound.sourceWidth||runtime.sourceHeight!==bound.sourceHeight)
    throw Error('MANUAL_HAND_WORKER_BINDING_MISMATCH');
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource&&
        (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
    throw Error('MANUAL_HAND_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_HAND_TONE_MAX_PIXELS)
    throw Error('MANUAL_HAND_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_HAND_WORKER_SHARED_PIXELS_INVALID');
  const scale=options.target==='source'?1:
    Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
  const width=Math.max(1,Math.round(bound.sourceWidth*scale));
  const height=Math.max(1,Math.round(bound.sourceHeight*scale));
  if(pixels.width!==width||pixels.height!==height||
      sourceDimensions(pixels).width!==bound.sourceWidth||
      sourceDimensions(pixels).height!==bound.sourceHeight)
    throw Error('MANUAL_HAND_WORKER_DIMENSIONS_MISMATCH');
  // The detached operation snapshots bytes before rasterization. All identity
  // and saved-revision values here remain assertions until a fresh host gate
  // verifies the registered Asset and decoded Original outside this Worker.
  const frozen={width,height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{})};
  const mask=rasterizeManualHandMask(frozen,document,runtime,
    {target:options.target});
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    savedRevision:savedRecipe.revision,sourceWidth:bound.sourceWidth,
    sourceHeight:bound.sourceHeight,target:options.target};
  return applyManualHandTone(frozen,mask,document.settings,context);
}
function renderManualContactsPixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||!['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','personID','eye',
        'sourceWidth','sourceHeight','savedRevision'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_CONTACTS_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.contactsIrisManual;
  if(!document)throw Error('MANUAL_CONTACTS_WORKER_DOCUMENT_REQUIRED');
  const bound=document.binding;
  if(runtime.assetID!==bound.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      runtime.personID!==bound.personID||runtime.eye!==bound.eye||
      runtime.sourceWidth!==bound.sourceWidth||runtime.sourceHeight!==bound.sourceHeight)
    throw Error('MANUAL_CONTACTS_WORKER_BINDING_MISMATCH');
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource&&
        (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
    throw Error('MANUAL_CONTACTS_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_CONTACTS_MAX_PIXELS)
    throw Error('MANUAL_CONTACTS_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_CONTACTS_WORKER_SHARED_PIXELS_INVALID');
  const scale=options.target==='source'?1:
    Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
  const width=Math.max(1,Math.round(bound.sourceWidth*scale));
  const height=Math.max(1,Math.round(bound.sourceHeight*scale));
  if(pixels.width!==width||pixels.height!==height||
      sourceDimensions(pixels).width!==bound.sourceWidth||
      sourceDimensions(pixels).height!==bound.sourceHeight)
    throw Error('MANUAL_CONTACTS_WORKER_DIMENSIONS_MISMATCH');
  // This snapshot prevents mutation while both stroke roles are rasterized.
  // Worker-side binding strings are not authentication or person/iris proof.
  const frozen={width,height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{})};
  const masks=rasterizeManualContactsMasks(frozen,document,runtime,
    {target:options.target});
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    personID:bound.personID,eye:bound.eye,savedRevision:savedRecipe.revision,
    sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
    target:options.target};
  return applyManualContactsIrisColor(frozen,masks.irisRingMask,
    masks.pupilExclusionMask,document.settings,context);
}
function renderManualEyelinerPixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||!['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','personID',
        'sourceWidth','sourceHeight','savedRevision'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_EYELINER_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.eyelinerManual;
  if(!document)throw Error('MANUAL_EYELINER_WORKER_DOCUMENT_REQUIRED');
  const bound=document.binding;
  if(runtime.assetID!==bound.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      runtime.personID!==bound.personID||
      runtime.sourceWidth!==bound.sourceWidth||
      runtime.sourceHeight!==bound.sourceHeight)
    throw Error('MANUAL_EYELINER_WORKER_BINDING_MISMATCH');
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource))
    throw Error('MANUAL_EYELINER_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_EYELINER_MAX_PIXELS)
    throw Error('MANUAL_EYELINER_WORKER_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_EYELINER_WORKER_SHARED_PIXELS_INVALID');
  const scale=options.target==='source'?1:
    Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
  const width=Math.max(1,Math.round(bound.sourceWidth*scale));
  const height=Math.max(1,Math.round(bound.sourceHeight*scale));
  const source=sourceDimensions(pixels);
  if(pixels.width!==width||pixels.height!==height||
      source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_EYELINER_WORKER_DIMENSIONS_MISMATCH');
  // The detached operation owns this snapshot. Supplied binding/revision are
  // still caller claims, not authenticated person or Original-byte evidence.
  const frozen={width,height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{})};
  return renderSavedManualEyeliner(frozen,document,runtime,
    {target:options.target}).pixels;
}
function renderManualEyeshadowPixels(pixels,savedRecipe,runtime,options){
  if(!exactRecord(savedRecipe,['revision','body'])||
      !Number.isSafeInteger(savedRecipe.revision)||savedRecipe.revision<1||
      !exactRecord(options,['target'])||!['source','proxy'].includes(options.target)||
      !exactRecord(runtime,['assetID','originalSHA256','personID','eye',
        'sourceWidth','sourceHeight','savedRevision'])||
      runtime.savedRevision!==savedRecipe.revision)
    throw Error('MANUAL_EYESHADOW_WORKER_RUNTIME_INVALID');
  validateRecipe(savedRecipe.body);
  const document=savedRecipe.body.parameters.extendedParameters.eyeshadowManual;
  if(!document)throw Error('MANUAL_EYESHADOW_WORKER_DOCUMENT_REQUIRED');
  const bound=document.binding;
  if(runtime.assetID!==bound.assetID||
      typeof runtime.originalSHA256!=='string'||
      runtime.originalSHA256.toLowerCase()!==bound.originalSHA256.toLowerCase()||
      runtime.personID!==bound.personID||runtime.eye!==document.eye||
      runtime.sourceWidth!==bound.sourceWidth||runtime.sourceHeight!==bound.sourceHeight)
    throw Error('MANUAL_EYESHADOW_WORKER_BINDING_MISMATCH');
  const hasSource=Object.hasOwn(pixels??{},'sourceWidth');
  if(!exactRecord(pixels,hasSource?[
    'width','height','sourceWidth','sourceHeight','data']:['width','height','data'])||
      (options.target==='proxy'&&!hasSource)||
      (options.target==='source'&&hasSource&&
        (pixels.sourceWidth!==pixels.width||pixels.sourceHeight!==pixels.height)))
    throw Error('MANUAL_EYESHADOW_WORKER_PIXELS_INVALID');
  if(Number.isSafeInteger(pixels.width)&&Number.isSafeInteger(pixels.height)&&
      pixels.width*pixels.height>MANUAL_EYESHADOW_MAX_PIXELS)
    throw Error('MANUAL_EYESHADOW_WORKER_CAPACITY');
  assertPixels(pixels);
  if(Object.prototype.toString.call(pixels.data.buffer)!=='[object ArrayBuffer]')
    throw Error('MANUAL_EYESHADOW_WORKER_SHARED_PIXELS_INVALID');
  const scale=options.target==='source'?1:
    Math.min(1,1600/Math.max(bound.sourceWidth,bound.sourceHeight));
  const width=Math.max(1,Math.round(bound.sourceWidth*scale));
  const height=Math.max(1,Math.round(bound.sourceHeight*scale));
  const source=sourceDimensions(pixels);
  if(pixels.width!==width||pixels.height!==height||
      source.width!==bound.sourceWidth||source.height!==bound.sourceHeight)
    throw Error('MANUAL_EYESHADOW_WORKER_DIMENSIONS_MISMATCH');
  // Snapshot before all three raster passes. Binding strings and revision are
  // caller assertions, not person privacy or Original-byte proof.
  const frozen={width,height,data:new Uint8ClampedArray(pixels.data),
    ...(hasSource?{sourceWidth:pixels.sourceWidth,
      sourceHeight:pixels.sourceHeight}:{})};
  const masks=rasterizeManualEyeshadowMasks(frozen,document,runtime,
    {target:options.target});
  const context={assetID:bound.assetID,originalSHA256:bound.originalSHA256,
    personID:bound.personID,eye:document.eye,savedRevision:savedRecipe.revision,
    sourceWidth:bound.sourceWidth,sourceHeight:bound.sourceHeight,
    target:options.target};
  return applyManualEyeshadowColor(frozen,masks.eyeAreaMask,
    masks.irisExclusionMask,masks.pupilExclusionMask,document.settings,context);
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
// The facade creates one disposable Worker per call. No stale pixel/mask cache crosses calls.
self.onmessage=async ({data:{id,method,args}})=>{
  try {
    let result;
    switch(method){
      case 'decodeRaw':result=await decodeRaw(args[0],args[1]);break;
      case 'renderWebRawDenoise':result=await renderWebRawDenoise(args[0],args[1]);break;
      case 'makeProxy':result=makeProxyPixels(args[0],args[1]);break;
      case 'detectPeople': {
        const {detectPeople}=await import('./faces.mjs');
        result=await detectPeople(args[0],args[1]);break;
      }
      case 'render': {
        validateRecipe(args[1]);
        if(args[1].parameters.extendedParameters.appleLocalBundle){
          const {renderSavedAppleBundle}=await import('./apple-local-bundle-renderer.mjs');
          result=await renderSavedAppleBundle(args[0],args[1].parameters.extendedParameters.appleLocalBundle,
            {authorized:args[2]?.appleLocalAuthorized===true});
          break;
        }
        if(args[1].parameters.extendedParameters.blushManual)
          throw Error('MANUAL_BLUSH_INDEPENDENT_RUNTIME_REQUIRED');
        if(args[1].parameters.extendedParameters.clothingSpotManual)
          throw Error('MANUAL_CLOTHING_INDEPENDENT_RUNTIME_REQUIRED');
        if(Object.hasOwn(args[1].parameters.extendedParameters,'handToneManual'))
          throw Error('MANUAL_HAND_INDEPENDENT_RUNTIME_REQUIRED');
        if(Object.hasOwn(args[1].parameters.extendedParameters,'contactsIrisManual'))
          throw Error('MANUAL_CONTACTS_INDEPENDENT_RUNTIME_REQUIRED');
        if(Object.hasOwn(args[1].parameters.extendedParameters,'eyelinerManual'))
          throw Error('MANUAL_EYELINER_INDEPENDENT_RUNTIME_REQUIRED');
        if(Object.hasOwn(args[1].parameters.extendedParameters,'eyeshadowManual'))
          throw Error('MANUAL_EYESHADOW_INDEPENDENT_RUNTIME_REQUIRED');
        const manual=args[1].parameters.extendedParameters.bwEdgeManual;
        const shadow=args[1].parameters.extendedParameters.addShadowManual;
        if(args[1].parameters.extendedParameters.originalShadowManual)
          throw Error('ORIGINAL_SHADOW_MANUAL_INDEPENDENT_RUNTIME_REQUIRED');
        if(args[2]?.localSavedBW!==undefined){
          if(!manual||args[2].bwEdgeRuntime!==undefined||args[2].bwEdgeTarget!==undefined)throw Error('LOCAL_SAVED_BW_RUNTIME_CONFLICT');
          validateLocalSavedBW(args[0],manual,args[2].localSavedBW);
        }else if(manual){
          const options=args[2];
          if(!options?.bwEdgeRuntime||!['proxy','source'].includes(options.bwEdgeTarget))
            throw Error('BW_EDGE_MANUAL_RUNTIME_REQUIRED');
          // Reject stale/bad bindings before any global or post-decode pixel work.
          const validated=validateBWEdgeManualContract(manual,options.bwEdgeRuntime);
          const expected=expectedBWEdgeTarget(validated.document.binding,options.bwEdgeTarget);
          if(args[0]?.width!==expected.width||args[0]?.height!==expected.height)
            throw Error('BW_EDGE_MANUAL_TARGET_DIMENSIONS_MISMATCH');
        }
        let renderInput=args[0];
        if(shadow){
          const options=args[2],runtime=options?.addShadowRuntime;
          if(!runtime||!['proxy','source'].includes(options?.addShadowTarget)||
              runtime.target!==options.addShadowTarget||
              !exactRecord(runtime,['method','target','sourceWidth','sourceHeight','args'])||
              !Array.isArray(runtime.args)||runtime.args.length!==5)
            throw Error('ADD_SHADOW_MANUAL_RUNTIME_REQUIRED');
          const bound=runtime.args[3],expected=expectedAddShadowTarget(
            shadow.binding.sourceWidth,shadow.binding.sourceHeight,options.addShadowTarget);
          if(['assetID','originalSHA256','backdropID','backdropSHA256'].some(
              key=>shadow.binding[key]!==bound?.[key])||
              runtime.sourceWidth!==shadow.binding.sourceWidth||
              runtime.sourceHeight!==shadow.binding.sourceHeight||
              args[0]?.width!==expected.width||args[0]?.height!==expected.height||
              sourceDimensions(args[0]).width!==shadow.binding.sourceWidth||
              sourceDimensions(args[0]).height!==shadow.binding.sourceHeight)
            throw Error('ADD_SHADOW_MANUAL_RUNTIME_BINDING_MISMATCH');
          const composited=await renderBoundAddShadowPixels(runtime);
          if(composited.width!==expected.width||composited.height!==expected.height)
            throw Error('ADD_SHADOW_MANUAL_RENDER_DIMENSIONS_MISMATCH');
          renderInput={width:composited.width,height:composited.height,
            data:composited.data,sourceWidth:shadow.binding.sourceWidth,
            sourceHeight:shadow.binding.sourceHeight};
        }else if(args[2]?.addShadowRuntime!==undefined||args[2]?.addShadowTarget!==undefined)
          throw Error('ADD_SHADOW_MANUAL_RUNTIME_UNEXPECTED');
        // Never trust serialized masks or a previous preview's detections as current render input.
        let detections=[];
        if(args[1].parameters.extendedParameters.portrait){
          const {detectPeople}=await import('./faces.mjs');
          detections=await detectPeople(args[0]);
        }
        result=renderPixels(renderInput,args[1],{...args[2],detections,validateRecipe,
          resolutionAssessment,applyBWEdgeManual:renderBWEdgeManualPixels,applyLocalSavedBW,
          addShadowApplied:Boolean(shadow)});
        // Manual flat-color canvas expansion is an implicit post-Crop extension,
        // not a new Recipe v1 processingOrder stage. Project against THIS rendered
        // frame so Proxy and Final preserve the same relative margins.
        const canvasExpand=args[1].parameters.extendedParameters.canvasExpand;
        if(canvasExpand){
          const liquifyField=result.liquifyField;
          result=expandCanvasPixels(result,projectCanvasExpansion(result,canvasExpand));
          if(liquifyField)result.liquifyField=liquifyField;
        }
        const savedOrder=args[1].parameters.processingOrder;
        const firstSpatial=savedOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        const sceneGeometry=args[1].parameters.extendedParameters.sceneGeometry;
        const localExtra=args[1].parameters.extendedParameters;
        const localStages=['colorRangeLevels','manualClone','manualSkin','manualRedEye','manualEyes','manualHair','webManualTeeth','webManualClothing','webManualBackground','webManualSpot','webLensShading','manualMakeup','localLevels'].filter(key=>localExtra[key]);
        const normalStages=manual||sceneGeometry||localExtra.webManualLiquify||localStages.length?[
          ...savedOrder.slice(0,firstSpatial<0?savedOrder.length:firstSpatial),
          ...localStages,
          ...(manual?['bwEdgeManual']:[]),
          ...(localExtra.webManualLiquify?['webManualLiquify(pre-geometry)']:[]),
          ...(localExtra.webLensShading?.distortion||localExtra.webLensShading?.chromatic?['webLensGeometry(pre-scene)']:[]),
          ...(sceneGeometry?['sceneGeometry(pre-rotation-crop)']:[]),
          ...savedOrder.slice(firstSpatial<0?savedOrder.length:firstSpatial)]:savedOrder;
        result.provenance={engineVersion:WEB_ENGINE,inputWidth:args[0].width,inputHeight:args[0].height,colorSpace:'sRGB',bitDepth:8,adjustmentDomain:'post-LibRaw-8bit-sRGB; no recovered clipped RAW channels',freshDetectorWithinRender:!!detections.length,detectedAnchors:detections.map(d=>d.anchor),model:detections[0]?.provenance||null,maskType: 'face-oval-polygon-not-person-segmentation',processingOrder:['base',...(shadow?['addShadowManual(pre-global)']:[]),...(localExtra.personalLook?['personalLook(pre-global)']:[]),'personEV',...normalStages,...(canvasExpand?['canvasExpand(post-crop)']:[]),'encode']};break;
      }
      case 'renderBWEdgeManual': {
        if(!Array.isArray(args)||args.length!==4||!exactRecord(args[3],['target']))
          throw Error('BW_EDGE_MANUAL_TARGET_INVALID');
        result=renderBWEdgeManualPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualBlush': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_BLUSH_WORKER_RUNTIME_INVALID');
        result=renderManualBlushPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualFreckles': {
        if(!Array.isArray(args)||args.length!==4||!exactRecord(args[3],['target']))throw Error('MANUAL_FRECKLES_WORKER_RUNTIME_INVALID');
        result=renderManualFrecklesPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualClothingSpot': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_CLOTHING_WORKER_RUNTIME_INVALID');
        result=renderManualClothingSpotPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualHandTone': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_HAND_WORKER_RUNTIME_INVALID');
        result=renderManualHandTonePixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualContacts': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_CONTACTS_WORKER_RUNTIME_INVALID');
        result=renderManualContactsPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualEyeliner': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_EYELINER_WORKER_RUNTIME_INVALID');
        result=renderManualEyelinerPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'renderManualEyeshadow': {
        if(!Array.isArray(args)||args.length!==4||Reflect.ownKeys(args).length!==5)
          throw Error('MANUAL_EYESHADOW_WORKER_RUNTIME_INVALID');
        result=renderManualEyeshadowPixels(args[0],args[1],args[2],args[3]);
        break;
      }
      case 'applyBoundAddShadow': {
        if(!Array.isArray(args)||args.length!==1||Reflect.ownKeys(args).length!==2)
          throw Error('ADD_SHADOW_WORKER_RUNTIME_INVALID');
        result=await renderBoundAddShadowPixels(args[0]);
        break;
      }
      case 'applyBoundOriginalShadowManual': {
        if(!Array.isArray(args)||args.length!==1||Reflect.ownKeys(args).length!==2)
          throw Error('ORIGINAL_SHADOW_WORKER_RUNTIME_INVALID');
        result=await renderBoundOriginalShadowManual(args[0]);
        break;
      }
      case 'encode': {
        const options=args[1];
        if(!options||typeof options!=='object'||Array.isArray(options))throw Error('ENCODE_OPTIONS_INVALID');
        const resolution=Object.hasOwn(options,'resolution')?encodeResolution(options.resolution):undefined;
        result=await encode(args[0],resolution===undefined?options:{...options,resolution},validateExportSettings);
        break;
      }
      case 'resizeForExport':result=resizeExportPixels(args[0],args[1]);break;
      case 'applyExportOutputSharpening':result=applyExportOutputSharpening(args[0],args[1]);break;
      case 'expandCanvas':result=expandCanvasPixels(args[0],args[1]);break;
      default:throw Error('UNKNOWN_PROCESSING_OPERATION');
    }
    const pixels=result?.pixels||result;const transfer=pixels?.data instanceof Uint8ClampedArray?[pixels.data.buffer]:[];
    if(result?.liquifyField)for(const values of [result.liquifyField.x,result.liquifyField.y])
      if(values instanceof Float32Array&&!transfer.includes(values.buffer))transfer.push(values.buffer);
    self.postMessage({id,result},transfer);
  }catch(error){self.postMessage({id,error:{name:error?.name||'Error',message:error?.message||'PROCESSING_FAILED',code:error?.code}});}
};
