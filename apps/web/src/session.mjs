import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {verifyAppleLocalBundle} from './apple-local-bundle-store.mjs';
import {assertWebDepthRangeBinding} from '../../../dist/apps/backend/src/web-depth-range.js';
import {createWebAutoLightProposal,webAutoLightPatch} from './web-connected-auto-light.mjs';
import {validateColorGrading} from './processing/lr-color-grading.mjs';
import {validatePointColorSelections,samplePointColor,pointColorRangeMask,visualizePointColorRange} from './processing/lr-point-color.mjs';
import {validatePortraitBinding,validatePortraitContinuity} from '../../../dist/apps/backend/src/portrait-recipe.js';
import {centeredRect,CROP_RATIOS,validateCropRect,resolutionAssessment} from '../../../dist/apps/backend/src/crop-export.js';
import {assertPixels,sourceDimensions} from './processing/pure.mjs';
import {BW_EDGE_REMOVAL_VERSION} from './processing/bw-edge-removal.mjs';
import {readBWEdgeManualRuntime} from './bw-edge-manual-session-gate.mjs';
import {TrialClient} from './trial-client.mjs';
import {SitesClient} from './sites-client.mjs';
import {prepareOriginalShadowRestore,originalShadowRestoreSHA,validateOriginalShadowRestoreHint} from './restore-original-shadow-runtime.mjs';
import {prepareTrialManualAddShadowRender} from './add-shadow-manual-trial-runtime.mjs';
import {validateOriginalShadowManualDocument} from './original-shadow-manual-recipe.mjs';
import {renderTrialOriginalShadow} from './processing/original-shadow-manual-runtime.mjs';
import {authorSubjectMask} from './processing/subject-mask-authoring.mjs';
import {applyBackgroundComposite} from './processing/background-composite.mjs';
import {buildAddShadowManualRecipe} from './add-shadow-manual-recipe.mjs';
import {analyzeHistogram,CLIPPING_MASK} from './processing/histogram.mjs';
import {createClippingOverlay} from './processing/clipping-overlay.mjs';
import {createGlowMaskOverlay} from './processing/glow.mjs';
import {sampleLevelsEndpoint} from './processing/levels-sampler.mjs';
import {sampleHSLSelector,adjustHSLSelection} from './processing/delta66-color-selection.mjs';
import {adjustCurveOnImage} from './processing/delta66-color-curves.mjs';
import {estimateWhiteBalance,estimateSceneMatch,validateSceneMatch} from './processing/delta66-scene-color.mjs';
import {saveLocalLUT,loadLocalLUT} from './local-lut-store.mjs';
import {analyzeLevelsHistogram} from './processing/levels-histogram.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';
import {planExportDimensions} from './export-size.mjs';
import {validateOutputSharpening} from './export-output-adjustments.mjs';
import {applyBatchRecipe} from './batch-edit.mjs';
import {applyBatchLevelsSync} from './batch-levels-sync.mjs';
import {applyBatchGlowSync} from './batch-glow-sync.mjs';
import {applyBatchVignetteSync} from './batch-vignette-sync.mjs';
import {applyBatchSelectiveColorSync} from './batch-selective-color-sync.mjs';
import {applyBatchGrainSync} from './batch-grain-sync.mjs';
import {applyBatchCalibrationSync} from './batch-calibration-sync.mjs';
import {applyBatchSceneMatch} from './batch-scene-match.mjs';
import {validateSceneGeometry,sceneGeometryInverse} from './processing/scene-geometry-contract.mjs';
import {convertCameraRawXMPToSuiteSettings,CAMERA_RAW_SETTINGS_INTERPRETATION} from './delta66-xmp-settings.mjs';
import {prepareSavedVersionSpecialComparison} from './saved-version-special-runtime.mjs';
import {prepareBrowserLocalHandToneHistory,prepareBrowserLocalClothingSpotHistory} from './browser-local-hand-tone-history.mjs';
import {prepareBrowserLocalManualRuntime} from './browser-local-manual-runtime.mjs';
import {prepareBrowserLocalRawDenoise} from './browser-local-raw-denoise-runtime.mjs';
import {prepareBrowserLocalSavedMakeup} from './browser-local-saved-makeup-runtime.mjs';
import {createLocalSavedMakeupConsent} from './local-saved-makeup-consent.mjs';
import {createLocalSavedShadowConsent,localShadowEntries,LOCAL_SHADOW_BRANCHES} from './local-saved-shadow-consent.mjs';
import {prepareBrowserLocalSavedShadow} from './browser-local-saved-shadow-runtime.mjs';
import {BrowserLocalAPI} from './browser-local-api.mjs';
import {planExportQueue} from './export-queue.mjs';
import {readTrialDngBatchCaptureDateEvidence} from './export-naming-context.mjs';
import {preflightExportBatch,assertBrowserLocalBatchAsset} from './export-batch-validation.mjs';
import {checkParameters} from '../preset-policy.mjs';
import {mergeAuthorGlowOnly} from './author-glow-only.mjs';
import {PERSON_PRIVACY_BLOCKED,PERSON_PRIVACY_APPROVED} from './person-privacy.mjs';

export const WEB_ENGINE='web-libraw-mediapipe-face-exposure-1';
export const MAX_BATCH_FINAL_ITEMS=20;
export const MAX_BATCH_FINAL_BYTES=256*1024*1024;
export const neutralRecipe=()=>({schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,extendedParameters:{},processingOrder:['exposure','contrast','saturation','rotation']}});
const copy=x=>structuredClone(x);
const portrait=r=>r?.parameters.extendedParameters.portrait;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const SHADOW_SHA=/^[0-9a-f]{64}$/i;
// Local recovery references, never permission or saved-Recipe authority.
const originalShadowRestoreHints=new WeakMap();
function originalShadowFrame(decoded,sha,processing,mode='final'){
  assertPixels(decoded?.pixels);
  const proof=decoded?.provenance;
  const real=proof?.sourceRepresentation==='original-camera-raw'&&
    proof?.thumbnailFallback===false;
  const synthetic=processing?.syntheticTestOnly===true&&
    proof?.sourceRepresentation==='synthetic-nonraw-test';
  if(!SHADOW_SHA.test(proof?.sourceSHA256)||
      proof.sourceSHA256.toLowerCase()!==sha.toLowerCase()||
      proof.mode!==mode||(!real&&!synthetic))
    throw Error('ORIGINAL_SHADOW_FINAL_DECODE_PROVENANCE_REQUIRED');
  const source=sourceDimensions(decoded.pixels);
  if(mode==='final'&&(source.width!==decoded.pixels.width||source.height!==decoded.pixels.height))
    throw Error('ORIGINAL_SHADOW_FINAL_REDUCED_FRAME_REJECTED');
  return {width:decoded.pixels.width,height:decoded.pixels.height,
    ...(mode==='proxy'?{sourceWidth:source.width,sourceHeight:source.height}:{}),
    data:new Uint8ClampedArray(decoded.pixels.data)};
}
function sameShadowPixels(left,right,signal){
  assertPixels(left);assertPixels(right);
  if(left.width!==right.width||left.height!==right.height)return false;
  for(let index=0;index<left.data.length;index++){
    if((index&0xfffff)===0&&signal?.aborted)throw Error('EXPORT_ABORTED');
    if(left.data[index]!==right.data[index])return false;
  }
  return true;
}
function assertBoundBWEdge(recipe,asset){
  const bw=recipe?.parameters?.extendedParameters?.bwEdgeManual;
  if(bw&&(!asset||bw.binding.assetID!==asset.id||
      bw.binding.originalSHA256.toLowerCase()!==asset.sha256?.toLowerCase()))
    throw Error('BW_EDGE_ASSET_BINDING_MISMATCH');
}
function assertBatchAssetListed(assets,expected){
  if(!Array.isArray(assets))throw Error('EXPORT_BATCH_ASSET_LIST_MISMATCH');
  const matches=assets.filter(asset=>asset?.id===expected.id);
  if(matches.length!==1||matches[0].name!==expected.name||
      typeof matches[0].sha256!=='string'||matches[0].sha256.toLowerCase()!==expected.sha256||
      matches[0].size!==expected.size||matches[0].deletedAt!=null)
    throw Error('EXPORT_BATCH_ASSET_LIST_MISMATCH');
}
function assertBatchSavedRecipe(stored,expected,recipe){
  const revision=stored?.revision??stored?.version;
  if(!stored||stored.branch===true||revision!==expected||
      (stored.assetId!==undefined&&stored.assetId!==recipe.assetId)||
      !equal(stored.body,recipe.body))throw Error('EXPORT_BATCH_FIXED_RECIPE_MISMATCH');
  validateRecipe(stored.body);
}
const POST_DECODE_STAGE='postDecodeAdjustments';
const POST_CROP_STAGE='postCropAdjustments';
const COLOR_SCALARS=new Set(['temperature','tint','highlights','shadows','whites','blacks','vibrance']);
const CURVE_FIELDS=new Set(['shadows','midtones','highlights']);
const HSL_COLORS=new Set(['red','orange','yellow','green','aqua','blue','purple','magenta']);
const HSL_FIELDS=new Set(['hue','saturation','luminance']);
const SHARPEN_CONTROLS=new Set(['sharpenRadius','sharpenDetail','sharpenMasking']);
const DETAIL_FIELDS=new Set(['clarity','texture','sharpness','denoise',...SHARPEN_CONTROLS]);
function setPostDecodeAdjustment(parameters,key,value,seed=0){
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('ADJUSTMENT_RANGE');
  const parts=key.split('.');let branch,field;
  if(parts.length===2&&parts[0]==='color'&&COLOR_SCALARS.has(parts[1])){branch='color';field=parts[1];}
  else if(parts.length===2&&parts[0]==='curve'&&CURVE_FIELDS.has(parts[1])){branch='curve';field=parts[1];}
  else if(parts.length===3&&parts[0]==='hsl'&&HSL_COLORS.has(parts[1])&&HSL_FIELDS.has(parts[2])){branch='hsl';field=parts[2];}
  else if(parts.length===3&&parts[0]==='calibration'&&['red','green','blue'].includes(parts[1])&&['hue','saturation'].includes(parts[2])){branch='calibration';field=parts[2];}
  else if(parts.length===3&&parts[0]==='selective'&&['reds','yellows','greens','cyans','blues','magentas','whites','neutrals','blacks'].includes(parts[1])&&['cyan','magenta','yellow','black'].includes(parts[2])){branch='selective';field=parts[2];}
  else if(parts.length===3&&parts[0]==='levels'&&['master','red','green','blue'].includes(parts[1])&&['inputBlack','inputWhite','gamma','outputBlack','outputWhite'].includes(parts[2])){branch='levels';field=parts[2];}
  else if(parts.length===2&&parts[0]==='glow'&&['intensity','radius','threshold','exposure','diffusion','tint'].includes(parts[1])){branch='glow';field=parts[1];}
  else if(parts.length===2&&key==='detail.grain'){branch='grain';field='amount';}
  else if(parts.length===2&&parts[0]==='grain'&&['shadows','midtones','highlights','size','roughness','colorVariation'].includes(parts[1])){branch='grain';field=parts[1];}
  else if(parts.length===2&&parts[0]==='detail'&&DETAIL_FIELDS.has(parts[1])){branch='detail';field=parts[1];}
  else throw Error('UNSUPPORTED_ADJUSTMENT');
  if(branch==='glow'){
    const ranges={intensity:[0,100],radius:[1,64],threshold:[0,255],exposure:[-100,100],diffusion:[0,100],tint:[-100,100]};
    if((field==='radius'||field==='threshold')?!Number.isSafeInteger(value):false)throw Error('ADJUSTMENT_RANGE');
    if(value<ranges[field][0]||value>ranges[field][1])throw Error('ADJUSTMENT_RANGE');
  }else if(branch==='levels'){
    if(field==='gamma'?(value<0.1||value>10):(!Number.isSafeInteger(value)||value<0||value>255))throw Error('ADJUSTMENT_RANGE');
  }else if(branch==='calibration'||branch==='selective'){
    if(!Number.isSafeInteger(value)||value< -100||value>100)throw Error('ADJUSTMENT_RANGE');
  }else if(branch==='detail'&&SHARPEN_CONTROLS.has(field)){
    if(!Number.isSafeInteger(value)||value<0||value>100)throw Error('ADJUSTMENT_RANGE');
  }else if(value<(field==='sharpness'||branch==='grain'?0:-100)||value>100)throw Error('ADJUSTMENT_RANGE');
  if(branch==='grain'&&(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff))throw Error('ADJUSTMENT_RANGE');
  const extra=parameters.extendedParameters;
  const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
  if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
  if(branch==='glow'){
    adjustments.color??={};adjustments.color.glow??={};
    const neutral={intensity:0,radius:8,threshold:180,exposure:0,diffusion:0,tint:0}[field];
    if(value===neutral)delete adjustments.color.glow[field];else adjustments.color.glow[field]=value;
    if(['exposure','diffusion','tint'].includes(field)&&value!==neutral&&!adjustments.color.glow.mode)adjustments.color.glow.mode='blackMist';
    if(Object.keys(adjustments.color.glow).length===0)delete adjustments.color.glow;
  }else if(branch==='levels'){
    adjustments.color??={};adjustments.color.levels??={};adjustments.color.levels[parts[1]]??={};
    const neutral={inputBlack:0,inputWhite:255,gamma:1,outputBlack:0,outputWhite:255}[field];
    if(value===neutral)delete adjustments.color.levels[parts[1]][field];else adjustments.color.levels[parts[1]][field]=value;
    if(Object.keys(adjustments.color.levels[parts[1]]).length===0)delete adjustments.color.levels[parts[1]];
    if(Object.keys(adjustments.color.levels).length===0)delete adjustments.color.levels;
  }else if(branch==='calibration'){
    adjustments.color??={};adjustments.color.calibration??={};adjustments.color.calibration[parts[1]]??={};
    if(value===0)delete adjustments.color.calibration[parts[1]][field];else adjustments.color.calibration[parts[1]][field]=value;
    if(Object.keys(adjustments.color.calibration[parts[1]]).length===0)delete adjustments.color.calibration[parts[1]];
    if(Object.keys(adjustments.color.calibration).length===0)delete adjustments.color.calibration;
  }else if(branch==='selective'){
    adjustments.color??={};adjustments.color.selectiveColor??={};adjustments.color.selectiveColor.ranges??={};adjustments.color.selectiveColor.ranges[parts[1]]??={};
    if(value===0)delete adjustments.color.selectiveColor.ranges[parts[1]][field];else adjustments.color.selectiveColor.ranges[parts[1]][field]=value;
    if(Object.keys(adjustments.color.selectiveColor.ranges[parts[1]]).length===0)delete adjustments.color.selectiveColor.ranges[parts[1]];
    if(Object.keys(adjustments.color.selectiveColor.ranges).length===0)delete adjustments.color.selectiveColor.ranges;
    if(!adjustments.color.selectiveColor.ranges&&(!adjustments.color.selectiveColor.method||adjustments.color.selectiveColor.method==='relative'))delete adjustments.color.selectiveColor;
  }else if(branch==='grain'){
    adjustments.detail??={};
    const grain={amount:0,seed,...adjustments.detail.grain};
    const neutral=['shadows','midtones','highlights'].includes(field)?100:0;
    if(field==='amount')grain.amount=value;
    else if(value===neutral)delete grain[field];else grain[field]=value;
    if(grain.amount===0&&Object.keys(grain).every(key=>key==='amount'||key==='seed'))delete adjustments.detail.grain;
    else adjustments.detail.grain=grain;
  }else if(branch==='curve'){
    adjustments.color??={};adjustments.color.toneCurve??={};
    if(value===0)delete adjustments.color.toneCurve[field];else adjustments.color.toneCurve[field]=value;
    if(Object.keys(adjustments.color.toneCurve).length===0)delete adjustments.color.toneCurve;
  }else if(branch==='hsl'){
    adjustments.color??={};adjustments.color.hsl??={};const color=parts[1];adjustments.color.hsl[color]??={};
    if(value===0)delete adjustments.color.hsl[color][field];else adjustments.color.hsl[color][field]=value;
    if(Object.keys(adjustments.color.hsl[color]).length===0)delete adjustments.color.hsl[color];
    if(Object.keys(adjustments.color.hsl).length===0)delete adjustments.color.hsl;
  }else if(branch==='detail'&&SHARPEN_CONTROLS.has(field)){
    adjustments.detail??={};
    if(value===(field==='sharpenRadius'?50:0))delete adjustments.detail[field];else adjustments.detail[field]=value;
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
const localMakeupConsents=new WeakMap();
const localShadowConsents=new WeakMap();
const isLocalAPI=api=>api instanceof BrowserLocalAPI&&Object.getPrototypeOf(api)===BrowserLocalAPI.prototype;
const hasLocalShadow=recipe=>LOCAL_SHADOW_BRANCHES.some(key=>Object.hasOwn(recipe?.parameters?.extendedParameters??{},key));
const LOCAL_MAKEUP_BRANCHES=['blushManual','contactsIrisManual','eyelinerManual','eyeshadowManual','faceDecorationsManual'];
const hasLocalMakeup=recipe=>LOCAL_MAKEUP_BRANCHES.some(key=>Object.hasOwn(recipe?.parameters?.extendedParameters??{},key));
export class EditorSession {
  constructor({api,processing,storage,clock=()=>new Date().toISOString(),urlAPI=globalThis.URL,personProcessingStatus=PERSON_PRIVACY_BLOCKED}={}) {
    if(![PERSON_PRIVACY_BLOCKED,PERSON_PRIVACY_APPROVED,'SYNTHETIC_TEST_ONLY'].includes(personProcessingStatus)||(personProcessingStatus==='SYNTHETIC_TEST_ONLY'&&processing?.syntheticTestOnly!==true))throw Error('PERSON_PRIVACY_CONFIGURATION_INVALID');
    this.api=api;this.processing=processing;this.storage=storage||{get:async()=>undefined,put:async()=>{}};this.clock=clock;this.urlAPI=urlAPI;
    originalShadowRestoreHints.set(this,[]);
    localMakeupConsents.set(this,createLocalSavedMakeupConsent());
    localShadowConsents.set(this,createLocalSavedShadowConsent());
    this.listeners=new Set();this.operation=0;this.previewOperation=0;this.originalShadowPreviewController=null;this.history=[];this.cursor=-1;this.reference=null;this.proxy=null;this.previewPixels=null;this.detections=[];
    this.data={assets:[],asset:null,recipe:neutralRecipe(),revision:0,dirty:false,busy:null,exporting:false,error:null,shadowVerification:null,selectedPersonID:null,people:[],beforeURL:null,afterURL:null,clippingOverlayURL:null,shadowClippingOverlayURL:null,highlightClippingOverlayURL:null,glowMaskURL:null,histogram:null,levelsHistogram:null,canUndo:false,canRedo:false,evidence:[],personProcessingStatus,status:'LOCAL_QA_ONLY — 本番Auth/Cloud未接続'};
  }
  get state(){return copy(this.data);}
  get depthRangeSourceDimensions(){return this.proxy?sourceDimensions(this.proxy):null;}
  get localSavedMakeupConsentStatus(){return localMakeupConsents.get(this).status({api:this.api,asset:this.data.asset});}
  get localSavedShadowConsentStatus(){return localShadowConsents.get(this).status({api:this.api,asset:this.data.asset});}
  async readLocalShadowScope(asset,{signal,headOnly=false,guard=()=>{}}={}){
    const api=this.api,factory=api.factory,databaseName=api.databaseName,crypto=api.crypto;
    const check=()=>{guard();if(signal?.aborted)throw Error('EXPORT_ABORTED');if(this.api!==api||!isLocalAPI(api)||api.factory!==factory||api.databaseName!==databaseName||api.crypto!==crypto)throw Error('LOCAL_SAVED_SHADOW_SCOPE_CHANGED');};
    check();await assertBrowserLocalBatchAsset(api,asset);check();
    const inventory=await BrowserLocalAPI.prototype.listAssets.call(api);check();
    const head=await BrowserLocalAPI.prototype.getRecipe.call(api,asset.id);check();
    const rows=await BrowserLocalAPI.prototype.getRecipeHistory.call(api,asset.id);check();
    if(!Array.isArray(rows)||!Array.isArray(inventory))throw Error('LOCAL_SAVED_SHADOW_HISTORY_INVALID');
    const entries=new Map();let versions=0;
    for(const row of rows){
      if(row.branch===true||!Number.isSafeInteger(row.revision)||row.revision<1||!hasLocalShadow(row.body)||headOnly&&(row.revision!==head?.revision||!equal(row.body,head.body)))continue;
      validateRecipe(row.body);const extra=row.body.parameters.extendedParameters;
      if(Object.hasOwn(extra,'portrait')||hasLocalMakeup(row.body)||['handToneManual','clothingSpotManual','webRawDenoise'].some(k=>Object.hasOwn(extra,k))||extra.addShadowManual&&extra.originalShadowManual)continue;
      const candidates=localShadowEntries(row.body,inventory);
      for(const e of candidates){const b=extra[e.kind].binding;
        if(b.assetID!==asset.id||b.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase())throw Error('LOCAL_SAVED_SHADOW_BINDING');
        if(e.backgroundAssetId){const matches=inventory.filter(a=>a.id===e.backgroundAssetId&&a.sha256.toLowerCase()===e.backgroundSHA256);if(matches.length!==1)throw Error('LOCAL_SAVED_SHADOW_BACKGROUND_MISSING');await assertBrowserLocalBatchAsset(api,matches[0]);check();}
        entries.set(e.key,e);
      }versions++;
    }
    await assertBrowserLocalBatchAsset(api,asset);check();
    const fresh=await BrowserLocalAPI.prototype.getRecipe.call(api,asset.id);check();if(!equal(fresh,head))throw Error('LOCAL_SAVED_SHADOW_SCOPE_CHANGED');
    return {assetId:asset.id,sha256:asset.sha256.toLowerCase(),revision:head?.revision??0,name:asset.name,versions,entries:[...entries.values()]};
  }
  async getLocalSavedShadowConsentScope(){
    if(!this.data.asset||this.data.busy||this.data.exporting||!isLocalAPI(this.api))throw Error('LOCAL_SAVED_SHADOW_SCOPE_UNAVAILABLE');
    const token=this.operation,asset=copy(this.data.asset);const result=await this.readLocalShadowScope(asset,{guard:()=>{this.check(token);if(this.data.asset?.id!==asset.id||this.data.asset?.sha256!==asset.sha256)throw Error('LOCAL_SAVED_SHADOW_SCOPE_CHANGED');}});
    if(!result.entries.length)throw Error('LOCAL_SAVED_SHADOW_NO_ELIGIBLE_HISTORY');return result;
  }
  async grantLocalSavedShadowConsent({assetId,sha256,entries,confirmed}={}){
    if(confirmed!==true)throw Error('LOCAL_SAVED_SHADOW_CONSENT_REQUIRED');
    const scope=await this.getLocalSavedShadowConsentScope();
    if(assetId!==scope.assetId||sha256!==scope.sha256||!equal(entries,scope.entries))throw Error('LOCAL_SAVED_SHADOW_SCOPE_CHANGED');
    localShadowConsents.get(this).grant({api:this.api,asset:this.data.asset,entries,confirmed:true});
    this.publish({error:null,localSavedShadowConsentEpoch:(this.data.localSavedShadowConsentEpoch??0)+1});
    if(hasLocalShadow(this.data.recipe))await this.refreshPreview();
  }
  revokeLocalSavedShadowConsent(){localShadowConsents.get(this).revoke();if(hasLocalShadow(this.data.recipe))this.invalidatePreview();this.publish({localSavedShadowConsentEpoch:(this.data.localSavedShadowConsentEpoch??0)+1});}
  async getBatchSavedShadowConsentScope({orderedIds,signal}={}){
    if(!isLocalAPI(this.api))return [];this.requireReady();
    if(!Array.isArray(orderedIds)||orderedIds.length<2||orderedIds.length>MAX_BATCH_FINAL_ITEMS||new Set(orderedIds).size!==orderedIds.length)throw Error('EXPORT_BATCH_SELECTION_REQUIRED');
    const token=this.operation,recipe=copy(this.data.recipe),assetId=this.data.asset.id;
    const guard=()=>{this.check(token);if(this.data.asset?.id!==assetId||this.data.dirty||!equal(recipe,this.data.recipe))throw Error('LOCAL_SAVED_SHADOW_SCOPE_CHANGED');};
    const inventory=await BrowserLocalAPI.prototype.listAssets.call(this.api);guard();const scopes=[];
    for(const id of orderedIds){const asset=inventory.find(a=>a.id===id);if(!asset)throw Error('UNKNOWN_ASSET');const scope=await this.readLocalShadowScope(asset,{signal,headOnly:true,guard});guard();
      const saved=await BrowserLocalAPI.prototype.getRecipe.call(this.api,id);guard();if(hasLocalShadow(saved?.body)&&!scope.entries.length)throw Error('LOCAL_SAVED_SHADOW_INELIGIBLE');if(scope.entries.length)scopes.push(scope);
    }return scopes;
  }
  async getLocalSavedMakeupConsentScope(){
    this.requireReady();
    const api=this.api,asset=copy(this.data.asset),token=this.operation;
    if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype)throw Error('LOCAL_SAVED_MAKEUP_LOCAL_ONLY');
    const rows=await BrowserLocalAPI.prototype.getRecipeHistory.call(api,asset.id);this.check(token);
    if(this.api!==api||this.data.asset?.id!==asset.id||this.data.asset?.sha256!==asset.sha256)throw Error('LOCAL_SAVED_MAKEUP_SCOPE_CHANGED');
    if(!Array.isArray(rows))throw Error('LOCAL_SAVED_MAKEUP_HISTORY_INVALID');
    const people=new Set();let versions=0;
    for(const row of rows){
      if(row?.branch===true||!Number.isSafeInteger(row?.revision)||row.revision<1||!hasLocalMakeup(row.body))continue;
      validateRecipe(row.body);const extra=row.body.parameters.extendedParameters;
      if(!extra.portrait||extra.portrait.targets.some(t=>t.value!==0)||['handToneManual','clothingSpotManual','bwEdgeManual','addShadowManual','originalShadowManual','webRawDenoise'].some(key=>Object.hasOwn(extra,key)))continue;
      const docs=LOCAL_MAKEUP_BRANCHES.filter(key=>extra[key]).map(key=>extra[key]);
      if(docs.some(d=>d.binding?.assetID!==asset.id||d.binding?.originalSHA256?.toLowerCase()!==asset.sha256.toLowerCase()))continue;
      for(const d of docs)people.add(d.binding.personID.toLowerCase());versions++;
    }
    if(!versions||!people.size||people.size>64)throw Error('LOCAL_SAVED_MAKEUP_NO_ELIGIBLE_HISTORY');
    return {assetId:asset.id,sha256:asset.sha256,personIDs:[...people].sort(),versions};
  }
  async getBatchSavedMakeupConsentScope({orderedIds,signal}={}){
    this.requireReady();const api=this.api;
    if(!(api instanceof BrowserLocalAPI)||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype)return [];
    if(!Array.isArray(orderedIds)||orderedIds.length<2||orderedIds.length>MAX_BATCH_FINAL_ITEMS||new Set(orderedIds).size!==orderedIds.length||orderedIds.some(id=>typeof id!=='string'||!id))throw Error('EXPORT_BATCH_SELECTION_REQUIRED');
    const ids=[...orderedIds],token=this.operation,currentId=this.data.asset.id,revision=this.data.revision,recipeJSON=JSON.stringify(this.data.recipe),
      factory=api.factory,databaseName=api.databaseName,crypto=api.crypto;
    const check=()=>{this.check(token);if(signal?.aborted)throw new DOMException('Batch consent scope cancelled','AbortError');if(this.api!==api||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.factory!==factory||api.databaseName!==databaseName||api.crypto!==crypto||this.data.asset?.id!==currentId||this.data.revision!==revision||this.data.dirty||this.data.busy||this.data.exporting||JSON.stringify(this.data.recipe)!==recipeJSON)throw Error('EXPORT_BATCH_MAKEUP_SCOPE_CHANGED');};
    check();const inventory=await BrowserLocalAPI.prototype.listAssets.call(api);check();const scopes=[];
    for(const id of ids){const matches=inventory.filter(a=>a.id===id);if(matches.length!==1)throw Error('EXPORT_BATCH_ASSET_LIST_MISMATCH');const asset=matches[0];
      await assertBrowserLocalBatchAsset(api,asset);check();
      const saved=await BrowserLocalAPI.prototype.getRecipe.call(api,id);check();if(!saved?.body)throw Error('EXPORT_BATCH_SAVED_RECIPE_REQUIRED');validateRecipe(saved.body);
      if(!hasLocalMakeup(saved.body))continue;
      const extra=saved.body.parameters.extendedParameters,p=extra.portrait;
      if(!p||p.targets.some(t=>t.value!==0)||['handToneManual','clothingSpotManual','bwEdgeManual','addShadowManual','originalShadowManual','webRawDenoise'].some(key=>Object.hasOwn(extra,key)))throw Error('EXPORT_BATCH_MAKEUP_MIXED_RUNTIME');
      validatePortraitBinding(p,id,asset.sha256);
      const docs=LOCAL_MAKEUP_BRANCHES.filter(key=>Object.hasOwn(extra,key)).map(key=>extra[key]),first=docs[0].binding;
      if(docs.some(d=>d.binding.assetID!==id||d.binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase()||d.binding.sourceWidth!==first.sourceWidth||d.binding.sourceHeight!==first.sourceHeight||!p.targets.some(t=>t.id===d.binding.personID)))throw Error('EXPORT_BATCH_MAKEUP_BINDING');
      const rows=await BrowserLocalAPI.prototype.getRecipeHistory.call(api,id,{signal});check();const versions=rows.filter(row=>row.revision===saved.revision&&row.branch!==true);
      if(versions.length!==1||!equal(versions[0].body,saved.body))throw Error('EXPORT_BATCH_MAKEUP_HISTORY_CHANGED');
      validatePortraitContinuity(p,versions[0].body.parameters.extendedParameters.portrait);
      const final=await BrowserLocalAPI.prototype.getRecipe.call(api,id);check();if(final.revision!==saved.revision||!equal(final.body,saved.body))throw Error('EXPORT_BATCH_MAKEUP_SCOPE_CHANGED');
      await assertBrowserLocalBatchAsset(api,asset);check();
      scopes.push({assetId:id,sha256:asset.sha256.toLowerCase(),revision:saved.revision,personIDs:[...new Set(docs.map(d=>d.binding.personID.toLowerCase()))].sort(),name:asset.name});
    }check();return scopes;
  }
  async grantLocalSavedMakeupConsent({assetId,sha256,personIDs,confirmed}={}){
    if(confirmed!==true)throw Error('LOCAL_SAVED_MAKEUP_CONFIRMATION_REQUIRED');
    const scope=await this.getLocalSavedMakeupConsentScope();
    if(assetId!==scope.assetId||sha256!==scope.sha256||!Array.isArray(personIDs)||JSON.stringify([...personIDs].sort())!==JSON.stringify(scope.personIDs))throw Error('LOCAL_SAVED_MAKEUP_SCOPE_CHANGED');
    localMakeupConsents.get(this).grant({api:this.api,asset:this.data.asset,personIDs:scope.personIDs,confirmed:true});
    this.publish({error:null,localSavedMakeupConsentEpoch:(this.data.localSavedMakeupConsentEpoch??0)+1});
    if(hasLocalMakeup(this.data.recipe))await this.refreshPreview();
  }
  revokeLocalSavedMakeupConsent(){localMakeupConsents.get(this).revoke();if(hasLocalMakeup(this.data.recipe))this.invalidatePreview();this.publish({localSavedMakeupConsentEpoch:(this.data.localSavedMakeupConsentEpoch??0)+1});}
  get batchAvailable(){return typeof this.api?.assertPermission==='function';}
  get batchFinalAvailable(){return this.batchAvailable||(this.api instanceof BrowserLocalAPI&&Object.getPrototypeOf(this.api)===BrowserLocalAPI.prototype);}
  get bwEdgeManualAvailable(){return this.api instanceof TrialClient;}
  get addShadowManualAvailable(){return this.api instanceof TrialClient;}
  subscribe(fn){this.listeners.add(fn);fn(this.state);return()=>this.listeners.delete(fn);}
  publish(extra={}){Object.assign(this.data,extra);this.data.canUndo=this.cursor>0;this.data.canRedo=this.cursor>=0&&this.cursor<this.history.length-1;for(const fn of this.listeners)fn(this.state);}
  log(test_id,status,reason,extra={}){
    const identifiers=p=>p?.targets?.map(t=>({person_id:t.id,geometry_identifier:'face-geometry-v1-json:'+JSON.stringify([t.anchor.x,t.anchor.y,t.anchor.width,t.anchor.height])}))||'UNKNOWN';
    this.data.evidence.push({test_id,status,reason,rejection_reason:status==='REJECT'?reason:null,timestamp:this.clock(),asset_id:this.data.asset?.id||null,person_id:this.data.selectedPersonID||'UNKNOWN',recipe_version:this.data.revision,RAW_checksum:this.data.asset?.sha256||'UNKNOWN',expected_geometry_identifier:identifiers(this.reference),actual_geometry_identifier:identifiers(portrait(this.data.recipe)),...extra});
  }
  check(token){if(token!==this.operation)throw Error('STALE_OPERATION');}
  requireReady(){if(!this.data.asset||!this.proxy)throw Error('NO_ASSET');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');}
  requirePersonProcessing(){if(!['SYNTHETIC_TEST_ONLY',PERSON_PRIVACY_APPROVED].includes(this.data.personProcessingStatus)){this.invalidatePeople();this.log('WEB_PERSON_PRIVACY','REJECT','PERSON_PRIVACY_REVIEW_REQUIRED');throw Error('PERSON_PRIVACY_REVIEW_REQUIRED');}}
  invalidatePeople(){this.detections=[];this.publish({selectedPersonID:null,people:[]});}
  invalidatePreview(){++this.previewOperation;this.originalShadowPreviewController?.abort();this.originalShadowPreviewController=null;this.previewPixels=null;for(const key of ['beforeURL','afterURL','clippingOverlayURL','shadowClippingOverlayURL','highlightClippingOverlayURL','glowMaskURL'])if(this.data[key])this.urlAPI.revokeObjectURL(this.data[key]);this.publish({beforeURL:null,afterURL:null,clippingOverlayURL:null,shadowClippingOverlayURL:null,highlightClippingOverlayURL:null,glowMaskURL:null,histogram:null,levelsHistogram:null});}
  bind(recipe,asset=this.data.asset){validateRecipe(recipe);const depth=recipe.parameters.extendedParameters.webDepthRange;if(depth){if(!asset||depth.assetID!==asset.id||depth.sourceSHA256!==asset.sha256?.toLowerCase())throw Error('DEPTH_IMAGE_BINDING');if(asset.id===this.data.asset?.id&&this.proxy){const dimensions=sourceDimensions(this.proxy);assertWebDepthRangeBinding(depth,{assetID:asset.id,sourceSHA256:asset.sha256.toLowerCase(),sourceWidth:dimensions.width,sourceHeight:dimensions.height});}}if(portrait(recipe)){if(!asset)throw Error('NO_ASSET');validatePortraitBinding(portrait(recipe),asset.id,asset.sha256);if(this.reference)validatePortraitContinuity(this.reference,portrait(recipe));}assertBoundBWEdge(recipe,asset);
    const appleBundle=recipe.parameters.extendedParameters.appleLocalBundle;
    if(appleBundle){if(!asset||appleBundle.assetID.toLowerCase()!==asset.id.toLowerCase()||appleBundle.originalSHA256!==asset.sha256?.toLowerCase())throw Error('APPLE_BUNDLE_PHOTO_MISMATCH');this.requirePersonProcessing();}
    const shadow=recipe.parameters.extendedParameters.addShadowManual;
    if(shadow){if(!this.addShadowManualAvailable&&!isLocalAPI(this.api))throw Error('ADD_SHADOW_AUTHENTICATED_TRIAL_REQUIRED');
      if(!asset||shadow.binding.assetID!==asset.id||shadow.binding.originalSHA256.toLowerCase()!==asset.sha256?.toLowerCase())throw Error('ADD_SHADOW_ASSET_BINDING_MISMATCH');}
  }
  async readAddShadowRuntime(recipe,{target='proxy',mode=this.data.dirty?'draft':'saved',revision=this.data.revision,signal}={}){
    const document=recipe?.parameters?.extendedParameters?.addShadowManual;
    if(!document)return null;
    this.bind(recipe);
    if(!this.addShadowManualAvailable)throw Error('ADD_SHADOW_AUTHENTICATED_TRIAL_REQUIRED');
    if(!Number.isSafeInteger(revision)||revision<1)throw Error('ADD_SHADOW_SAVED_BASE_REQUIRED');
    const source=sourceDimensions(this.proxy);
    if(source.width!==document.binding.sourceWidth||source.height!==document.binding.sourceHeight)
      throw Error('ADD_SHADOW_SOURCE_DIMENSION_MISMATCH');
    return prepareTrialManualAddShadowRender({api:this.api,document,
      selectedBackdropID:document.binding.backdropID,savedRevision:revision,
      target,ownerConfirmed:true,mode,...(signal?{signal}:{})});
  }
  async readBWEdgeRuntime(recipe,{action='edit',signal,revision=this.data.revision}={}){
    const document=recipe?.parameters?.extendedParameters?.bwEdgeManual;
    if(!document)return null;
    if(!this.bwEdgeManualAvailable)throw Error('BW_EDGE_AUTHENTICATED_TRIAL_REQUIRED');
    this.bind(recipe);
    const source=sourceDimensions(this.proxy);
    if(document.binding.sourceWidth!==source.width||document.binding.sourceHeight!==source.height)
      throw Error('BW_EDGE_SOURCE_DIMENSION_MISMATCH');
    const result=await readBWEdgeManualRuntime({api:this.api,document,draftBaseRevision:revision,
      confirmedSelections:{subject:true,correction:true},action,...(signal?{signal}:{})});
    return result.runtime;
  }
  /** Final-only manual 1:1 background. No inferred placement, AI mask or RAW QA claim. */
  async readOriginalShadowFinalEvidence({asset,document,revision,recipe,identity,signal,action='export'}){
    if(!(this.api instanceof TrialClient))throw Error('ORIGINAL_SHADOW_FINAL_TRIAL_REQUIRED');
    if(signal?.aborted)throw Error('EXPORT_ABORTED');
    const firstSession=await this.api.request('/trial/session',{signal});
    const current=firstSession?.principal;
    if(firstSession?.mode!=='INVITED_LOCAL_TRIAL'||!current?.id||
        current.tenantId!==`trial-${current.id}`||
        identity&&(current.id!==identity.id||current.tenantId!==identity.tenantId))
      throw Error('ORIGINAL_SHADOW_FINAL_SESSION_CHANGED');
    const listed=(await this.api.request('/v1/assets',{signal}))?.assets;
    if(!Array.isArray(listed))throw Error('ORIGINAL_SHADOW_FINAL_ASSETS_INVALID');
    const select=(id,sha,size)=>{
      const matches=listed.filter(item=>item?.id===id);
      if(matches.length!==1||matches[0].tenantId!==current.tenantId||
          matches[0].deletedAt!==null||matches[0].cloudSafe!==true||
          matches[0].sha256?.toLowerCase()!==sha.toLowerCase()||
          !Number.isSafeInteger(matches[0].size)||matches[0].size<1||
          size!==undefined&&matches[0].size!==size)
        throw Error('ORIGINAL_SHADOW_FINAL_ASSET_CHANGED');
      return matches[0];
    };
    const target=select(asset.id,document.binding.originalSHA256,asset.size);
    const backdrop=select(document.binding.backdropID,
      document.binding.backdropSHA256);
    const saved=(await this.api.request(`/v1/assets/${asset.id}/recipe`,
      {signal}))?.recipe;
    if(saved?.revision!==revision||!equal(saved.body,recipe))
      throw Error('ORIGINAL_SHADOW_FINAL_RECIPE_CHANGED');
    const original=await this.api.getOriginal(asset.id,{signal});
    const background=await this.api.getOriginal(backdrop.id,{signal});
    if(original.byteLength!==target.size||background.byteLength!==backdrop.size||
        await checksum(original)!==target.sha256.toLowerCase()||
        await checksum(background)!==backdrop.sha256.toLowerCase())
      throw Error('ORIGINAL_SHADOW_FINAL_ORIGINAL_CHANGED');
    for(const [id,requestedAction] of [[target.id,action],[backdrop.id,'export']]){
      const permission=await this.api.request('/trial/authorize',
        {method:'POST',body:{assetID:id,action:requestedAction},signal});
      if(permission?.authorized!==true)
        throw Error('ORIGINAL_SHADOW_FINAL_PERMISSION_DENIED');
    }
    const lastSession=await this.api.request('/trial/session',{signal});
    const final=lastSession?.principal;
    if(lastSession?.mode!=='INVITED_LOCAL_TRIAL'||
        final?.id!==current.id||final.tenantId!==current.tenantId||signal?.aborted)
      throw Error('ORIGINAL_SHADOW_FINAL_SESSION_CHANGED');
    return {identity:{id:current.id,tenantId:current.tenantId},
      backdrop:{id:backdrop.id,sha256:backdrop.sha256,size:backdrop.size},
      original,background};
  }
  async renderOriginalShadowFinal({asset,recipe,revision,decoded,signal}){
    const extra=recipe.parameters.extendedParameters;
    const manual=extra.originalShadowManual;
    if(!manual)return null;
    if(extra.addShadowManual)throw Error('ORIGINAL_SHADOW_FINAL_ADD_SHADOW_UNDEFINED');
    const document=validateOriginalShadowManualDocument(manual,manual.binding,{signal});
    if(document.binding.assetID!==asset.id||
        document.binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase())
      throw Error('ORIGINAL_SHADOW_FINAL_TARGET_BINDING_MISMATCH');
    const original=originalShadowFrame(decoded,asset.sha256,this.processing);
    if(original.width!==document.binding.sourceWidth||
        original.height!==document.binding.sourceHeight)
      throw Error('ORIGINAL_SHADOW_FINAL_DIMENSIONS_MISMATCH');
    const preflight=await this.readOriginalShadowFinalEvidence({asset,document,
      revision,recipe,signal});
    const decodedBackground=await this.processing.decodeRaw(
      preflight.background.slice(0),{mode:'final',signal});
    const background=originalShadowFrame(decodedBackground,
      document.binding.backdropSHA256,this.processing);
    if(background.width!==original.width||background.height!==original.height)
      throw Error('ORIGINAL_SHADOW_FINAL_BACKDROP_DIMENSIONS_UNSUPPORTED');
    const context={assetID:asset.id,originalSHA256:asset.sha256,
      savedRevision:revision};
    const subject=authorSubjectMask(original,document.subjectStrokes,context,
      {ownerConfirmed:true,signal});
    const composite=applyBackgroundComposite(original,background,subject,
      context,{signal});
    // The Trial runtime rechecks both registered Original digests, the saved
    // document and permissions before issuing masks; its pixel result is also
    // compared to the independently called Worker operation below.
    const checked=await renderTrialOriginalShadow({api:this.api,
      assetID:asset.id,backdropID:preflight.backdrop.id,
      savedRevision:revision,action:'export',representation:'original',
      original,composite,signal});
    if(typeof this.processing.applyBoundOriginalShadowManual!=='function')
      throw Error('ORIGINAL_SHADOW_FINAL_WORKER_REQUIRED');
    const binding={assetID:asset.id,originalSHA256:asset.sha256,
      backdropID:preflight.backdrop.id,
      backdropSHA256:preflight.backdrop.sha256,savedRevision:revision};
    const compositeEvidence={kind:'composited-replacement-background',
      source:'owner-selected-image-backdrop-unverified',...binding,
      representation:'original',width:composite.width,height:composite.height,
      pixelsSHA256:await checksum(composite.data)};
    if(signal?.aborted)throw Error('EXPORT_ABORTED');
    const rendered=await this.processing.applyBoundOriginalShadowManual({
      representation:'original',savedRecipe:{revision,body:recipe},binding,
      original,composite,compositeEvidence,
      subjectMask:checked.subjectMask,shadowMask:checked.shadowMask},{signal});
    if(!sameShadowPixels(rendered,checked.pixels,signal))
      throw Error('ORIGINAL_SHADOW_FINAL_WORKER_RESULT_MISMATCH');
    const withoutManual=copy(recipe);
    delete withoutManual.parameters.extendedParameters.originalShadowManual;
    validateRecipe(withoutManual);
    return {pixels:rendered,recipe:withoutManual,identity:preflight.identity,
      document};
  }
  async prepareOriginalShadowHistoryPreview({asset,recipe,revision,signal,selection,guard,render=true}){
    const token=this.operation,recipeJSON=JSON.stringify(this.data.recipe),currentRevision=this.data.revision;
    const ensure=guard||(()=>{this.check(token);if(signal?.aborted)throw new DOMException('Original Shadow restore cancelled','AbortError');
      if(this.data.asset?.id!==asset.id||this.data.asset.sha256!==asset.sha256||this.data.revision!==currentRevision||
        JSON.stringify(this.data.recipe)!==recipeJSON)throw Error('ORIGINAL_SHADOW_RESTORE_DRAFT_CHANGED');});
    ensure();
    const documentSHA=await originalShadowRestoreSHA(recipe.parameters.extendedParameters.originalShadowManual);ensure();
    const hints=originalShadowRestoreHints.get(this)||[];
    const hint=selection?undefined:hints.find(h=>h.assetId===asset.id&&h.assetSHA256===asset.sha256.toLowerCase()&&
      h.headRevision===revision&&h.documentSHA256===documentSHA);
    const prepared=await prepareOriginalShadowRestore({api:this.api,asset,recipe,headRevision:revision,selection,hint,guard:ensure,signal,render});ensure();
    const next=hints.filter(h=>h.assetId!==asset.id||h.documentSHA256!==documentSHA);
    if(next.length>=1000)throw Error('ORIGINAL_SHADOW_RESTORE_HINT_LIMIT');
    originalShadowRestoreHints.set(this,[...next,prepared.receipt]);
    return prepared;
  }
  /** Fresh saved-document evidence precedes every Proxy; Sites uses real history. */
  async renderOriginalShadowPreview({asset,recipe,revision,dirty,signal}){
    if(this.api instanceof SitesClient)return this.prepareOriginalShadowHistoryPreview({asset,recipe,revision,signal});
    const extra=recipe.parameters.extendedParameters;
    if(extra.addShadowManual)throw Error('ORIGINAL_SHADOW_PREVIEW_ADD_SHADOW_UNDEFINED');
    if(!Number.isSafeInteger(revision)||revision<1)
      throw Error('ORIGINAL_SHADOW_PREVIEW_SAVED_RECIPE_REQUIRED');
    const manual=extra.originalShadowManual;
    const document=validateOriginalShadowManualDocument(manual,manual.binding,{signal});
    if(document.binding.assetID!==asset.id||
        document.binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase())
      throw Error('ORIGINAL_SHADOW_PREVIEW_TARGET_BINDING_MISMATCH');
    // A dirty tonal edit may use the saved manual selection, but it must never
    // pass a draft document to the Worker as if it were the saved authority.
    let authorityRecipe=recipe;
    if(dirty){
      const stored=await this.api.getRecipe(asset.id,{signal});
      const savedManual=stored?.body?.parameters?.extendedParameters?.originalShadowManual;
      if(stored?.revision!==revision||!savedManual||
          !equal(savedManual,document))
        throw Error('ORIGINAL_SHADOW_PREVIEW_SAVED_DOCUMENT_CHANGED');
      authorityRecipe=stored.body;
    }
    const preflight=await this.readOriginalShadowFinalEvidence({asset,document,
      revision,recipe:authorityRecipe,signal,action:'edit'});
    const decoded=await this.processing.decodeRaw(preflight.original.slice(0),
      {mode:'proxy',signal});
    const decodedBackdrop=await this.processing.decodeRaw(
      preflight.background.slice(0),{mode:'proxy',signal});
    const source=originalShadowFrame(decoded,asset.sha256,this.processing,'proxy');
    const backdrop=originalShadowFrame(decodedBackdrop,
      document.binding.backdropSHA256,this.processing,'proxy');
    const sourceSize=sourceDimensions(source),backdropSize=sourceDimensions(backdrop);
    if(sourceSize.width!==document.binding.sourceWidth||
        sourceSize.height!==document.binding.sourceHeight||
        backdropSize.width!==sourceSize.width||backdropSize.height!==sourceSize.height)
      throw Error('ORIGINAL_SHADOW_PREVIEW_BACKDROP_DIMENSIONS_UNSUPPORTED');
    const targetProxy=await this.processing.makeProxy(source,1600);
    const backdropProxy=await this.processing.makeProxy(backdrop,1600);
    if(signal.aborted)throw Error('ORIGINAL_SHADOW_PREVIEW_ABORTED');
    if(targetProxy.width!==backdropProxy.width||
        targetProxy.height!==backdropProxy.height||
        sourceDimensions(targetProxy).width!==sourceSize.width||
        sourceDimensions(targetProxy).height!==sourceSize.height||
        sourceDimensions(backdropProxy).width!==backdropSize.width||
        sourceDimensions(backdropProxy).height!==backdropSize.height)
      throw Error('ORIGINAL_SHADOW_PREVIEW_PROXY_DIMENSIONS_MISMATCH');
    const representation=targetProxy.width===sourceSize.width&&
      targetProxy.height===sourceSize.height?'original':'proxy';
    const original=representation==='original'?{width:targetProxy.width,
      height:targetProxy.height,data:targetProxy.data.slice()}:
      {width:targetProxy.width,height:targetProxy.height,
        sourceWidth:sourceSize.width,sourceHeight:sourceSize.height,
        data:targetProxy.data.slice()};
    const replacement={width:backdropProxy.width,height:backdropProxy.height,
      data:backdropProxy.data.slice()};
    const context={assetID:asset.id,originalSHA256:asset.sha256,
      savedRevision:revision};
    const subject=authorSubjectMask(original,document.subjectStrokes,context,
      {ownerConfirmed:true,signal});
    const composite=applyBackgroundComposite(original,replacement,subject,
      context,{signal});
    const checked=await renderTrialOriginalShadow({api:this.api,
      assetID:asset.id,backdropID:preflight.backdrop.id,
      savedRevision:revision,action:'edit',representation,original,composite,signal});
    if(typeof this.processing.applyBoundOriginalShadowManual!=='function')
      throw Error('ORIGINAL_SHADOW_PREVIEW_WORKER_REQUIRED');
    const binding={assetID:asset.id,originalSHA256:asset.sha256,
      backdropID:preflight.backdrop.id,
      backdropSHA256:preflight.backdrop.sha256,savedRevision:revision};
    const compositeEvidence={kind:'composited-replacement-background',
      source:'owner-selected-image-backdrop-unverified',...binding,
      representation,width:composite.width,height:composite.height,
      pixelsSHA256:await checksum(composite.data)};
    if(signal.aborted)throw Error('ORIGINAL_SHADOW_PREVIEW_ABORTED');
    const rendered=await this.processing.applyBoundOriginalShadowManual({
      representation,savedRecipe:{revision,body:authorityRecipe},binding,
      original,composite,compositeEvidence,
      subjectMask:checked.subjectMask,shadowMask:checked.shadowMask},{signal});
    if(!sameShadowPixels(rendered,checked.pixels,signal))
      throw Error('ORIGINAL_SHADOW_PREVIEW_WORKER_RESULT_MISMATCH');
    const postflight=await this.readOriginalShadowFinalEvidence({asset,document,
      revision,recipe:authorityRecipe,identity:preflight.identity,signal,action:'edit'});
    if(postflight.backdrop.sha256!==preflight.backdrop.sha256)
      throw Error('ORIGINAL_SHADOW_PREVIEW_BACKDROP_CHANGED');
    const withoutManual=copy(recipe);
    delete withoutManual.parameters.extendedParameters.originalShadowManual;
    validateRecipe(withoutManual);
    return {proxy:targetProxy,pixels:{...rendered,
      sourceWidth:sourceSize.width,sourceHeight:sourceSize.height},
      recipe:withoutManual,provenance:decoded.provenance,
      metadata:decoded.metadata,document,authorityRecipe,
      identity:preflight.identity};
  }
  async initialize(){const token=++this.operation;this.publish({busy:'library',error:null});try{const assets=await this.api.listAssets();this.check(token);this.publish({assets,busy:null});}catch(e){if(token===this.operation)this.publish({busy:null,error:e.message});throw e;}}
  async importRaw(file){
    if(this.data.dirty)throw Error('UNSAVED_EDITS');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');
    if(!/\.(arw|cr2|cr3|nef|nrw|dng|raf|rw2|orf|pef|srw|raw)$/i.test(file.name)||file.size<=0||file.size>128*1024*1024)throw Error('RAW_FORMAT_OR_SIZE_UNSUPPORTED');
    localMakeupConsents.get(this).revoke();localShadowConsents.get(this).revoke();
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
      this.proxy=proxy;this.reference=null;this.history=cached.history;this.cursor=0;this.publish({asset,recipe:neutralRecipe(),revision:0,dirty:true,shadowVerification:null,provenance:decoded.provenance,metadata:decoded.metadata,assets:[...this.data.assets.filter(a=>a.id!==asset.id),asset],busy:null});
      await this.refreshPreview(token);this.log('WEB_IMPORT','PASS_LOCAL_DECODE_ONLY','Real-image/RAW visual QA separately required',{raw_file_identifier:file.name});
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_IMPORT','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async openAsset(id){
    if(this.data.dirty)throw Error('UNSAVED_EDITS');if(this.data.busy||this.data.exporting)throw Error('OPERATION_IN_PROGRESS');
    const asset=this.data.assets.find(a=>a.id===id);if(!asset)throw Error('UNKNOWN_ASSET');
    localMakeupConsents.get(this).revoke();localShadowConsents.get(this).revoke();
    const token=++this.operation;this.invalidatePeople();this.invalidatePreview();this.publish({busy:'reload',error:null});
    let shadowOpening=false;
    try{
      const stored=await this.api.getRecipe(id);this.check(token);let cached=await this.storage.get(id);this.check(token);
      const recipe=stored?.body||neutralRecipe();validateRecipe(recipe);assertBoundBWEdge(recipe,asset);if(portrait(recipe))validatePortraitBinding(portrait(recipe),asset.id,asset.sha256);
      if(recipe.parameters.extendedParameters.addShadowManual){const binding=recipe.parameters.extendedParameters.addShadowManual.binding;
        if((!this.addShadowManualAvailable&&!isLocalAPI(this.api))||binding.assetID!==asset.id||binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase())throw Error('ADD_SHADOW_ASSET_BINDING_MISMATCH');}
      if(cached&&(cached.asset?.id!==id||cached.asset.sha256!==asset.sha256))throw Error('CACHE_ASSET_BINDING');
      const originalShadowPreview=Boolean(recipe.parameters.extendedParameters.originalShadowManual||
        cached?.dirty&&cached.history?.[cached.cursor]?.parameters?.extendedParameters?.originalShadowManual);
      shadowOpening=originalShadowPreview;
      let proxy=originalShadowPreview?null:cached?.proxy,
        provenance=originalShadowPreview?undefined:cached?.provenance,
        metadata=originalShadowPreview?undefined:cached?.metadata;
      if(!proxy&&!originalShadowPreview){const original=await this.api.getOriginal(id);this.check(token);if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_MISMATCH');this.check(token);const decoded=await this.processing.decodeRaw(original,{mode:'proxy'});this.check(token);proxy=await this.processing.makeProxy(decoded.pixels,1600);this.check(token);provenance=decoded.provenance;metadata=decoded.metadata;}
      if(cached?.dirty&&cached.revision!==(stored?.revision||0))throw Error('DURABLE_DRAFT_REVISION_CONFLICT');
      const reference=cached?.reference||portrait(recipe)||null;
      if(portrait(recipe)&&reference)validatePortraitContinuity(portrait(recipe),reference);
      const history=cached?.dirty&&cached.revision===(stored?.revision||0)?cached.history:[recipe],cursor=cached?.dirty&&cached.revision===(stored?.revision||0)?cached.cursor:0;
      if(!Number.isInteger(cursor)||cursor<0||cursor>=history.length)throw Error('INVALID_HISTORY');
      const cachedHints=cached?.originalShadowRestoreHints??[];
      if(!Array.isArray(cachedHints)||cachedHints.length>1000)throw Error('ORIGINAL_SHADOW_RESTORE_HINT_INVALID');
      originalShadowRestoreHints.set(this,cachedHints.map(validateOriginalShadowRestoreHint));
      if(originalShadowPreview&&!(this.api instanceof SitesClient)&&!isLocalAPI(this.api)&&
          !equal(history[cursor]?.parameters?.extendedParameters?.originalShadowManual,
            recipe.parameters.extendedParameters.originalShadowManual))
        throw Error('ORIGINAL_SHADOW_PREVIEW_SAVED_DOCUMENT_CHANGED');
      for(const item of history){validateRecipe(item);assertBoundBWEdge(item,asset);if(portrait(item)){validatePortraitBinding(portrait(item),id,asset.sha256);if(reference)validatePortraitContinuity(reference,portrait(item));}
        const apple=item.parameters.extendedParameters.appleLocalBundle;
        if(apple&&(apple.assetID.toLowerCase()!==id.toLowerCase()||apple.originalSHA256!==asset.sha256.toLowerCase()))throw Error('APPLE_BUNDLE_HISTORY_BINDING_MISMATCH');
        const binding=item.parameters.extendedParameters.addShadowManual?.binding;
        if(binding&&((!this.addShadowManualAvailable&&!isLocalAPI(this.api))||binding.assetID!==id||binding.originalSHA256.toLowerCase()!==asset.sha256.toLowerCase()))throw Error('ADD_SHADOW_HISTORY_BINDING_MISMATCH');}
      if(reference)validatePortraitBinding(reference,id,asset.sha256);
      const activeAppleBundle=history[cursor].parameters.extendedParameters.appleLocalBundle;
      if(activeAppleBundle){await verifyAppleLocalBundle(activeAppleBundle);this.check(token);}
      this.reference=reference;this.proxy=proxy;this.history=history;this.cursor=cursor;this.publish({asset,recipe:copy(history[cursor]),revision:stored?.revision||0,dirty:!!cached?.dirty&&cached.revision===(stored?.revision||0),shadowVerification:history[cursor].parameters.extendedParameters.addShadowManual?'unverified':null,provenance,metadata,busy:originalShadowPreview?'reload':null});
      if(isLocalAPI(this.api)&&hasLocalShadow(history[cursor])){this.publish({busy:null,error:'LOCAL_SAVED_SHADOW_CONSENT_REQUIRED'});return;}
      await this.refreshPreview(token);this.check(token);
      if(originalShadowPreview)this.publish({busy:null});
      this.log('WEB_RELOAD','PASS_CONTRACT_ONLY','Visual reproduction NOT_RUN without real image');
    }catch(e){if(token===this.operation){this.invalidatePeople();if(shadowOpening){this.invalidatePreview();this.proxy=null;}this.log('WEB_RELOAD','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async reload(){if(this.data.dirty)throw Error('UNSAVED_EDITS');return this.openAsset(this.data.asset?.id);}
  async persist(history=this.history,cursor=this.cursor,extra={}){await this.storage.put(this.data.asset.id,{asset:this.data.asset,proxy:this.proxy,provenance:this.data.provenance,metadata:this.data.metadata,history,cursor,revision:this.data.revision,reference:this.reference,dirty:this.data.dirty,originalShadowRestoreHints:copy(originalShadowRestoreHints.get(this)||[]),...extra});}
  async prepareLocalManual(recipe,{target='proxy',signal,guard=()=>{}}={}){
    const extra=recipe.parameters.extendedParameters;
    const localShadow=isLocalAPI(this.api)&&hasLocalShadow(recipe);
    if(!extra.handToneManual&&!extra.clothingSpotManual&&!extra.webRawDenoise&&!hasLocalMakeup(recipe)&&!localShadow)return null;
    const api=this.api,token=this.operation,asset=copy(this.data.asset),proxy=this.proxy,consentEpoch=this.data.localSavedMakeupConsentEpoch,shadowEpoch=this.data.localSavedShadowConsentEpoch;
    const check=()=>{this.check(token);guard();if(this.api!==api||!localShadow&&this.proxy!==proxy||this.data.asset?.id!==asset.id||this.data.asset?.sha256!==asset.sha256||hasLocalMakeup(recipe)&&this.data.localSavedMakeupConsentEpoch!==consentEpoch||localShadow&&this.data.localSavedShadowConsentEpoch!==shadowEpoch)throw Error('LOCAL_MANUAL_SESSION_CHANGED');};
    const prepared=await (localShadow?prepareBrowserLocalSavedShadow:hasLocalMakeup(recipe)?prepareBrowserLocalSavedMakeup:extra.webRawDenoise?prepareBrowserLocalRawDenoise:prepareBrowserLocalManualRuntime)({api,recipe,expectedAsset:asset,target,signal,guard:check,
      assertConsent:scope=>(localShadow?localShadowConsents:localMakeupConsents).get(this).assert(scope)});
    check();
    if(proxy){const expected=sourceDimensions(proxy),actual=sourceDimensions(prepared.pixels);
      if(actual.width!==expected.width||actual.height!==expected.height||target==='proxy'&&(prepared.pixels.width!==proxy.width||prepared.pixels.height!==proxy.height))throw Error('LOCAL_MANUAL_GEOMETRY_CHANGED');}
    return prepared;
  }
  async refreshPreview(token=this.operation){
    const recipe=copy(this.data.recipe);
    const localShadow=isLocalAPI(this.api)&&hasLocalShadow(recipe);
    const originalShadow=!localShadow&&recipe.parameters.extendedParameters.originalShadowManual;
    if(localShadow||hasLocalMakeup(recipe)||recipe.parameters.extendedParameters.handToneManual||recipe.parameters.extendedParameters.clothingSpotManual||recipe.parameters.extendedParameters.webRawDenoise)this.invalidatePreview();
    // A saved two-Original result cannot remain visible while its authority is
    // being rechecked. Invalidate old URLs and readiness before the first await.
    if(originalShadow){this.invalidatePreview();this.proxy=null;}
    const preview=++this.previewOperation;
    let controller=null,verifiedShadow=null,proxy=this.proxy,renderRecipe=recipe,
      renderInput=proxy;
    if(originalShadow){
      this.originalShadowPreviewController?.abort();
      controller=new AbortController();this.originalShadowPreviewController=controller;
      const signal=controller.signal,asset=copy(this.data.asset),revision=this.data.revision;
      try{
        verifiedShadow=await this.renderOriginalShadowPreview({asset,recipe,
          revision,dirty:this.data.dirty,signal});
        this.check(token);
        if(signal.aborted||preview!==this.previewOperation)
          throw Error('ORIGINAL_SHADOW_PREVIEW_ABORTED');
        proxy=verifiedShadow.proxy;renderInput=verifiedShadow.pixels;
        renderRecipe=verifiedShadow.recipe;
        this.proxy=proxy;
        this.publish({provenance:verifiedShadow.provenance,
          metadata:verifiedShadow.metadata});
      }catch(error){
        if(this.originalShadowPreviewController===controller){
          this.invalidatePreview();this.proxy=null;
        }
        throw error;
      }
    }
    let localShadowPrepared=null;
    if(localShadow){
      localShadowPrepared=await this.prepareLocalManual(recipe,{guard:()=>{this.check(token);if(preview!==this.previewOperation||!equal(this.data.recipe,recipe))throw Error('LOCAL_SAVED_SHADOW_PREVIEW_STALE');}});
      proxy=localShadowPrepared.proxy??localShadowPrepared.pixels;this.proxy=proxy;renderInput=localShadowPrepared.pixels;renderRecipe=localShadowPrepared.recipe;
      this.publish({provenance:localShadowPrepared.provenance,metadata:localShadowPrepared.metadata});
    }
    if(!proxy)return;
    try{
    this.bind(recipe);
    const verifiedManual=localShadowPrepared??await this.prepareLocalManual(recipe,{guard:()=>{
      if(preview!==this.previewOperation||!equal(this.data.recipe,recipe))throw Error('LOCAL_MANUAL_PREVIEW_STALE');
    }});this.check(token);
    if(verifiedManual){renderInput=verifiedManual.pixels;renderRecipe=verifiedManual.recipe;}
    const before=await this.processing.encode(proxy,{format:'png'});this.check(token);
    // Nonneutral portrait always obtains fresh masks; previously selected mask is not reused.
    let detections=[];if(portrait(renderRecipe)){this.requirePersonProcessing();this.invalidatePeople();try{detections=await this.processing.detectPeople(proxy,{});this.check(token);}catch(e){this.log('WEB_PERSON_VALIDATION','REJECT',e.message);throw e;}}
    const bwEdgeRuntime=localShadowPrepared?null:await this.readBWEdgeRuntime(recipe);this.check(token);
    const shadow=localShadowPrepared?null:await this.readAddShadowRuntime(recipe);this.check(token);
    const localLUT=await this.readLocalLUTRuntime(renderRecipe);this.check(token);
    const rendered=await this.processing.render(renderInput,renderRecipe,{detections,localLUT,
      appleLocalAuthorized:Boolean(renderRecipe.parameters.extendedParameters.appleLocalBundle),...verifiedManual?.options,
      ...(bwEdgeRuntime?{bwEdgeRuntime,bwEdgeTarget:'proxy'}:{}),
      ...(shadow?{addShadowRuntime:shadow.runtime,addShadowOriginal:shadow.original,addShadowTarget:'proxy'}:{})});this.check(token);
    const analysis=analyzeHistogram(rendered,{includeMask:true});this.check(token);
    const overlayPixels=createClippingOverlay(rendered,analysis);this.check(token);
    const sideOverlay=(bits)=>createClippingOverlay(rendered,{width:analysis.width,height:analysis.height,
      mask:Uint8Array.from(analysis.mask,value=>value&bits)});
    const shadowOverlayPixels=sideOverlay(CLIPPING_MASK.SHADOW_ANY|CLIPPING_MASK.SHADOW_ALL);
    const highlightOverlayPixels=sideOverlay(CLIPPING_MASK.HIGHLIGHT_ANY|CLIPPING_MASK.HIGHLIGHT_ALL);
    this.check(token);
    const {mask:_,...histogram}=analysis;
    const levelsHistogram=analyzeLevelsHistogram(rendered,{precomputed:analysis});this.check(token);
    const after=await this.processing.encode(rendered,{format:'png'});this.check(token);
    const shadowOverlay=await this.processing.encode(shadowOverlayPixels,{format:'png'});this.check(token);
    const highlightOverlay=await this.processing.encode(highlightOverlayPixels,{format:'png'});this.check(token);
    const overlay=await this.processing.encode(overlayPixels,{format:'png'});this.check(token);
    let glowMask=null;
    const glow=recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.glow;
    if(glow?.mode&&glow.intensity>0){
      const withoutGlow=copy(renderRecipe),extra=withoutGlow.parameters.extendedParameters,adjustments=extra.postDecodeAdjustments;
      delete adjustments.color.glow;
      if(Object.keys(adjustments.color).length===0)delete adjustments.color;
      if(Object.keys(adjustments.detail||{}).length===0)delete adjustments.detail;
      if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;withoutGlow.parameters.processingOrder=withoutGlow.parameters.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
      const maskSource=await this.processing.render(renderInput,withoutGlow,{detections,localLUT,...verifiedManual?.options,
        ...(bwEdgeRuntime?{bwEdgeRuntime,bwEdgeTarget:'proxy'}:{}),
        ...(shadow?{addShadowRuntime:shadow.runtime,addShadowOriginal:shadow.original,addShadowTarget:'proxy'}:{})});this.check(token);
      if(maskSource.width!==rendered.width||maskSource.height!==rendered.height)throw Error('GLOW_MASK_DIMENSION_MISMATCH');
      glowMask=await this.processing.encode(createGlowMaskOverlay(maskSource,glow),{format:'png'});this.check(token);
    }
    if(verifiedShadow){
      if(verifiedShadow.recheck)await verifiedShadow.recheck();
      else await this.readOriginalShadowFinalEvidence({asset:this.data.asset,
        document:verifiedShadow.document,revision:this.data.revision,
        recipe:verifiedShadow.authorityRecipe,
        identity:verifiedShadow.identity,signal:controller.signal,action:'edit'});
      this.check(token);
      if(controller.signal.aborted)throw Error('ORIGINAL_SHADOW_PREVIEW_ABORTED');
    }
    if(verifiedManual)await verifiedManual.recheck();
    if(preview!==this.previewOperation)return;
    const beforeURL=this.urlAPI.createObjectURL(before),afterURL=this.urlAPI.createObjectURL(after),clippingOverlayURL=this.urlAPI.createObjectURL(overlay),shadowClippingOverlayURL=this.urlAPI.createObjectURL(shadowOverlay),highlightClippingOverlayURL=this.urlAPI.createObjectURL(highlightOverlay),glowMaskURL=glowMask?this.urlAPI.createObjectURL(glowMask):null;
    for(const key of ['beforeURL','afterURL','clippingOverlayURL','shadowClippingOverlayURL','highlightClippingOverlayURL','glowMaskURL'])if(this.data[key])this.urlAPI.revokeObjectURL(this.data[key]);
    this.previewPixels=rendered;
    this.publish({beforeURL,afterURL,clippingOverlayURL,shadowClippingOverlayURL,highlightClippingOverlayURL,glowMaskURL,histogram,levelsHistogram,
      shadowVerification:verifiedShadow?(this.data.dirty?'draft':'verified'):
        shadow?(this.data.dirty?'draft':'verified'):null});
    if(this.originalShadowPreviewController===controller)
      this.originalShadowPreviewController=null;
    }catch(error){
      if(controller&&this.originalShadowPreviewController===controller){
        this.invalidatePreview();this.proxy=null;
      }
      throw error;
    }
  }
  async detectPeople(){
    this.requireReady();this.requirePersonProcessing();const token=this.operation;this.invalidatePeople();this.publish({busy:'people validation',error:null});
    try{
      const found=await this.processing.detectPeople(this.proxy,{});this.check(token);if(!found.length)throw Error('NO_PERSON_DETECTED');
      let reference=this.reference;
      if(!reference){if(this.data.revision>0&&!portrait(this.data.recipe))throw Error('HISTORICAL_PERSON_INVENTORY_UNAVAILABLE');const now=this.clock();reference={schemaVersion:1,engineVersion:WEB_ENGINE,assetID:this.data.asset.id,originalSHA256:this.data.asset.sha256,targets:found.map(f=>({id:crypto.randomUUID(),anchor:f.anchor,adjustmentType:'face_brightness',value:0})),createdAt:now,updatedAt:now};validatePortraitBinding(reference,this.data.asset.id,this.data.asset.sha256);}
      const testRecipe=copy(this.data.recipe);testRecipe.parameters.extendedParameters.portrait=copy(reference);
      // Person validation must exercise the same bound shadow frame as normal
      // Preview. An Add Shadow Recipe may never silently render its Original.
      const bwEdgeRuntime=await this.readBWEdgeRuntime(testRecipe);this.check(token);
      const shadow=await this.readAddShadowRuntime(testRecipe);this.check(token);
      const localLUT=await this.readLocalLUTRuntime(testRecipe);this.check(token);
      await this.processing.render(this.proxy,testRecipe,{detections:found,localLUT,
        ...(bwEdgeRuntime?{bwEdgeRuntime,bwEdgeTarget:'proxy'}:{}),
        ...(shadow?{addShadowRuntime:shadow.runtime,addShadowOriginal:shadow.original,
          addShadowTarget:'proxy'}:{})});this.check(token);
      this.reference=reference;await this.persist();this.check(token);this.detections=found;
      this.publish({people:reference.targets.map(t=>({...t,complete:true})),selectedPersonID:null,busy:null});this.log('WEB_PERSON_VALIDATION','PASS_CONTRACT_ONLY','Explicit selection required');
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_PERSON_VALIDATION','REJECT',e.message);this.publish({busy:null,error:e.message});}throw e;}
  }
  async selectPerson(id){this.requireReady();this.requirePersonProcessing();if(!this.detections.length||!this.reference?.targets.some(t=>t.id===id)){this.invalidatePeople();throw Error('UNKNOWN_PERSON');}this.publish({selectedPersonID:id});}
  async commitRecipe(recipe,historyOverride,cursorOverride,{signal,rollbackOnFailure=false,
    rollbackFailureCode='ORIGINAL_SHADOW_RESTORE_ROLLBACK_FAILED'}={}){
    const localKeys=['webDepthRange','webRawDenoise','handToneManual','clothingSpotManual','manualMakeup','manualClone','manualSkin','manualRedEye','manualHair','manualEyes','webManualTeeth','webManualClothing','webManualBackground','webManualSpot','webLensShading','webManualLiquify','localLUTMask','colorRangeLevels','personalLook'];
    if(recipe.parameters.extendedParameters.appleLocalBundle||this.data.recipe.parameters.extendedParameters.appleLocalBundle||hasLocalMakeup(recipe)||hasLocalMakeup(this.data.recipe)||isLocalAPI(this.api)&&(hasLocalShadow(recipe)||hasLocalShadow(this.data.recipe))||localKeys.some(key=>Object.hasOwn(recipe?.parameters?.extendedParameters??{},key)||
        Object.hasOwn(this.data.recipe?.parameters?.extendedParameters??{},key))){
      rollbackOnFailure=true;rollbackFailureCode='LOCAL_ADJUSTMENT_ROLLBACK_FAILED';
    }
    // Canvas/restore callers opt into cancellation; shadow Undo/Redo additionally
    // roll back failed preview commits. Other edit paths retain their contract.
    const checkCancellation=()=>{if(signal?.aborted)throw new DOMException('Draft edit cancelled','AbortError');};
    checkCancellation();
    const prior=signal||rollbackOnFailure?{assetId:this.data.asset.id,history:copy(this.history),cursor:this.cursor,
      proxy:copy(this.proxy),reference:copy(this.reference),hints:copy(originalShadowRestoreHints.get(this)||[]),
      recipe:copy(this.data.recipe),dirty:this.data.dirty,shadowVerification:this.data.shadowVerification,
      cache:{asset:copy(this.data.asset),proxy:copy(this.proxy),
        ...(this.data.provenance===undefined?{}:{provenance:copy(this.data.provenance)}),
        ...(this.data.metadata===undefined?{}:{metadata:copy(this.data.metadata)}),
        history:copy(this.history),cursor:this.cursor,
        revision:this.data.revision,reference:copy(this.reference),dirty:this.data.dirty,
        originalShadowRestoreHints:copy(originalShadowRestoreHints.get(this)||[])}}:null;
    this.bind(recipe);const token=this.operation;const history=historyOverride||[...this.history.slice(0,this.cursor+1),copy(recipe)],cursor=cursorOverride??history.length-1;
    for(const item of history)this.bind(item);
    this.publish({busy:'permission'});
    try{if(prior){const cached=await this.storage.get(prior.assetId);this.check(token);checkCancellation();if(cached!==undefined)prior.cache=copy(cached);}if(this.api.assertPermission)await this.api.assertPermission(this.data.asset.id,'edit');this.check(token);checkCancellation();if(!(isLocalAPI(this.api)&&hasLocalShadow(recipe))){await this.readBWEdgeRuntime(recipe);this.check(token);checkCancellation();await this.readAddShadowRuntime(recipe,{mode:'draft'});}this.check(token);checkCancellation();this.bind(recipe);}catch(e){if(token===this.operation){this.invalidatePeople();this.publish({busy:null,error:e.message});this.log('WEB_TRIAL_PERMISSION','REJECT',e.message);}throw e;}
    try{if(recipe.parameters.extendedParameters.appleLocalBundle){await verifyAppleLocalBundle(recipe.parameters.extendedParameters.appleLocalBundle,{signal});this.check(token);checkCancellation();}
      await this.readLocalLUTRuntime(recipe,{signal});this.check(token);checkCancellation();
      const manual=await this.prepareLocalManual(recipe,{signal,guard:checkCancellation});this.check(token);
      if(manual)await manual.recheck();this.check(token);checkCancellation();}
    catch(error){if(token===this.operation)this.publish({busy:null,error:error.message});throw error;}
    this.invalidatePreview();this.publish({busy:'preview'});
    let cacheTouched=false;
    try{checkCancellation();cacheTouched=true;await this.persist(history,cursor,{dirty:true});this.check(token);checkCancellation();this.history=history;this.cursor=cursor;this.publish({recipe:copy(recipe),dirty:true,shadowVerification:recipe.parameters.extendedParameters.addShadowManual?'unverified':null,error:null});await this.refreshPreview(token);this.check(token);checkCancellation();this.publish({busy:null});}
    catch(e){
      if((signal?.aborted||rollbackOnFailure)&&prior&&token===this.operation){
        try{
          if(cacheTouched)await this.storage.put(prior.assetId,prior.cache);
          this.check(token);this.history=prior.history;this.cursor=prior.cursor;this.proxy=prior.proxy;this.reference=prior.reference;
          originalShadowRestoreHints.set(this,prior.hints);
          this.invalidatePreview();this.publish({recipe:prior.recipe,dirty:prior.dirty,
            shadowVerification:prior.shadowVerification,busy:'preview',error:null});
          await this.refreshPreview(token);this.check(token);this.publish({busy:null});
        }catch(rollbackError){
          if(token===this.operation){
            // A failed compensating local write leaves cache provenance
            // uncertain. Block further edits/exports instead of presenting a
            // clean Recipe or silently opening another Asset.
            this.history=prior.history;this.cursor=prior.cursor;this.proxy=prior.proxy;this.reference=prior.reference;
            originalShadowRestoreHints.set(this,prior.hints);
            this.invalidatePreview();
            this.publish({recipe:prior.recipe,busy:'recovery required',dirty:true,error:rollbackOnFailure?rollbackFailureCode:'CANVAS_CANCEL_ROLLBACK_FAILED'});
          }
          throw Error(rollbackOnFailure?rollbackFailureCode:'CANVAS_CANCEL_ROLLBACK_FAILED',{cause:rollbackError});
        }
        if(signal?.aborted)throw new DOMException('Draft edit cancelled','AbortError');
        throw e;
      }
      if(token===this.operation){this.invalidatePeople();this.publish({busy:null,error:e.message,afterURL:null});}throw e;
    }
  }
  // Sampling coordinates refer to the exact displayed After frame, including
  // Crop/rotation/canvas. UI must not supply Before or screen coordinates.
  sampleHSLAt({x,y,radius=1}={}){
    this.requireReady();
    this.hslSampleDraft=null;
    if(!this.previewPixels||!this.data.afterURL)throw Error('HSL_PREVIEW_UNAVAILABLE');
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||
      !Number.isInteger(radius)||radius<0||radius>16)throw Error('HSL_SAMPLE_COORDINATES');
    const pixels=this.previewPixels;
    const selection=sampleHSLSelector(pixels,{
      x:Math.min(pixels.width-1,Math.floor(x*pixels.width)),
      y:Math.min(pixels.height-1,Math.floor(y*pixels.height)),radius});
    this.hslSampleDraft={selection:copy(selection),assetID:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision,
      recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    return copy(selection);
  }
  async applySampledHSL({channel,delta}={}){
    this.requireReady();
    const draft=this.hslSampleDraft;
    if(!draft||!this.previewPixels||!this.data.afterURL||
      draft.assetID!==this.data.asset.id||draft.sha256!==this.data.asset.sha256||
      draft.revision!==this.data.revision||draft.recipeJSON!==JSON.stringify(this.data.recipe)||
      draft.afterURL!==this.data.afterURL){
      this.hslSampleDraft=null;throw Error('HSL_SAMPLE_STALE');
    }
    const recipe=copy(this.data.recipe),p=recipe.parameters;
    const hsl=adjustHSLSelection(p.extendedParameters.postDecodeAdjustments?.color?.hsl??{},
      draft.selection,{channel,delta});
    for(const color of HSL_COLORS)for(const field of HSL_FIELDS)
      setPostDecodeAdjustment(p,`hsl.${color}.${field}`,hsl[color][field]);
    this.bind(recipe);
    // Consume before the first async persistence step. A second click cannot
    // reuse this draft; commitRecipe retains its existing one-step Undo/rollback.
    this.hslSampleDraft=null;
    return this.commitRecipe(recipe);
  }
  samplePointColorAt({x,y}={}){
    this.requireReady();
    if(!this.previewPixels||!this.data.afterURL)throw Error('POINT_COLOR_PREVIEW_UNAVAILABLE');
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)
      throw Error('POINT_COLOR_SAMPLE_COORDINATES');
    // The sampling kernel consumes normalized upper-left coordinates itself.
    // Its 8MP working limit is checked on this actual After buffer, not on the
    // original sourceWidth/sourceHeight metadata. No edited pixels become base.
    const result=samplePointColor(this.previewPixels,{x,y,id:crypto.randomUUID()});
    const binding={assetID:this.data.asset.id,sha256:this.data.asset.sha256,
      revision:this.data.revision,recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    return {selection:copy(result.selection),sample:copy(result.sample),binding};
  }
  renderPointColorRange({selections,mode='overlay'}={}){
    this.requireReady();
    if(!this.previewPixels||!this.data.afterURL)throw Error('POINT_COLOR_PREVIEW_UNAVAILABLE');
    const pixels=this.previewPixels;
    const mask=pointColorRangeMask(pixels,selections);
    // UI-only owned RGBA copy. Do not replace previewPixels, afterURL, Recipe,
    // history or Final with this diagnostic visualization.
    return visualizePointColorRange(pixels,mask,{mode});
  }
  async applySampledPointColor({selections,amount,binding}={}){
    this.requireReady();
    const keys=['assetID','sha256','revision','recipeJSON','afterURL'];
    if(!binding||typeof binding!=='object'||Array.isArray(binding)||
      Reflect.ownKeys(binding).length!==keys.length||keys.some(key=>{
        const descriptor=Object.getOwnPropertyDescriptor(binding,key);
        return !descriptor?.enumerable||!Object.hasOwn(descriptor,'value');
      })||!this.previewPixels||!this.data.afterURL||
      binding.assetID!==this.data.asset.id||binding.sha256!==this.data.asset.sha256||
      binding.revision!==this.data.revision||binding.recipeJSON!==JSON.stringify(this.data.recipe)||
      binding.afterURL!==this.data.afterURL)throw Error('POINT_COLOR_SAMPLE_STALE');
    // This is freshness binding, not authentication; setPointColor/commitRecipe
    // retain the existing permissions, saved validation and one-step Undo.
    return await this.setPointColor({selections,amount});
  }
  sampleCurveAt({x,y,channel='master'}={}){
    this.requireReady();this.curveSampleDraft=null;
    if(!this.previewPixels||!this.data.afterURL)throw Error('CURVE_PREVIEW_UNAVAILABLE');
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||
      !['master','red','green','blue'].includes(channel))throw Error('CURVE_IMAGE_SELECTION_INVALID');
    const pixels=this.previewPixels;
    const px=Math.min(pixels.width-1,Math.floor(x*pixels.width));
    const py=Math.min(pixels.height-1,Math.floor(y*pixels.height));
    const offset=(py*pixels.width+px)*4;
    if(!pixels.data[offset+3])throw Error('CURVE_IMAGE_TRANSPARENT');
    // Match adjustCurveOnImage's encoded-sRGB master-luma sampling convention.
    const input=channel==='red'?pixels.data[offset]:channel==='green'?pixels.data[offset+1]:
      channel==='blue'?pixels.data[offset+2]:Math.max(0,Math.min(255,Math.round(
        .2126*pixels.data[offset]+.7152*pixels.data[offset+1]+.0722*pixels.data[offset+2])));
    this.curveSampleDraft={x:px,y:py,channel,assetID:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision,
      recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    return {channel,input};
  }
  async applySampledCurve({delta}={}){
    this.requireReady();const draft=this.curveSampleDraft;
    if(!draft||!this.previewPixels||!this.data.afterURL||
      draft.assetID!==this.data.asset.id||draft.sha256!==this.data.asset.sha256||
      draft.revision!==this.data.revision||draft.recipeJSON!==JSON.stringify(this.data.recipe)||
      draft.afterURL!==this.data.afterURL){
      this.curveSampleDraft=null;throw Error('CURVE_SAMPLE_STALE');
    }
    const curves=this.data.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.pointCurves;
    const current=curves?.[draft.channel]??[{x:0,y:0},{x:255,y:255}];
    // The existing image adapter enforces <=16 points both before and after
    // insertion. Older 17..32-point saved curves are rejected, never truncated.
    const points=adjustCurveOnImage(this.previewPixels,current,
      {x:draft.x,y:draft.y,channel:draft.channel,delta});
    this.curveSampleDraft=null;
    return await this.setPointCurve(draft.channel,points);
  }
  async sampleLevelsAt({x,y,channel='master',endpoint}={}){
    this.requireReady();
    if(!this.previewPixels||!this.data.afterURL)throw Error('LEVELS_PREVIEW_UNAVAILABLE');
    const levels=this.data.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.levels||{};
    const sample=sampleLevelsEndpoint(this.previewPixels,{x,y,channel,endpoint,levels});
    await this.setAdjustment(sample.key,sample.value);
    return sample;
  }
  async setAdjustment(key,value){
    this.requireReady();
    if(key.startsWith('canvas.')){
      const edge=key.slice('canvas.'.length);
      if(!['left','right','top','bottom'].includes(edge))throw Error('CANVAS_EDGE_UNSUPPORTED');
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>200)throw Error('ADJUSTMENT_RANGE');
      const current=this.data.recipe.parameters.extendedParameters.canvasExpand;
      const margins={left:0,right:0,top:0,bottom:0,...current?.margins,[edge]:value/100};
      return this.setCanvasExpansion({margins,background:current?.background??[255,255,255,255]});
    }
    const recipe=copy(this.data.recipe),p=recipe.parameters;
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
    }else if(key.startsWith('vignette.')){
      const field=key.slice('vignette.'.length);
      const ranges={amount:[-100,100],midpoint:[0,100],roundness:[-100,100],feather:[0,100],highlights:[0,100]};
      if(!Object.hasOwn(ranges,field))throw Error('UNSUPPORTED_ADJUSTMENT');
      if(typeof value!=='number'||!Number.isFinite(value)||value<ranges[field][0]||value>ranges[field][1])throw Error('ADJUSTMENT_RANGE');
      const vignette={amount:0,...p.extendedParameters.postCropAdjustments?.vignette,[field]:value};
      const neutral=vignette.amount===0&&(vignette.midpoint??50)===50&&(vignette.roundness??0)===0&&(vignette.feather??50)===50&&(vignette.highlights??0)===0;
      if(neutral)delete p.extendedParameters.postCropAdjustments;
      else p.extendedParameters.postCropAdjustments={schemaVersion:1,engineVersion:'suite-srgb8-manual-vignette-1',vignette};
    }else if(key.startsWith('color.')||key.startsWith('curve.')||key.startsWith('hsl.')||key.startsWith('detail.')||key.startsWith('levels.')||key.startsWith('glow.')||key.startsWith('calibration.')||key.startsWith('selective.')||key.startsWith('grain.')){
      const seed=Number.parseInt(String(this.data.asset.sha256??'').slice(0,8),16);
      setPostDecodeAdjustment(p,key,value,Number.isSafeInteger(seed)?seed:0);
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
  proposeAutoLight(){
    this.requireReady();
    const proposal=createWebAutoLightProposal(this.proxy,this.data.recipe);
    this.autoLightDraft={proposal,assetID:this.data.asset.id,sha:this.data.asset.sha256,
      revision:this.data.revision,recipe:copy(this.data.recipe)};
    return copy(proposal);
  }
  async applyAutoLightProposal(amount=1){
    this.requireReady();
    const draft=this.autoLightDraft;
    if(!draft||draft.assetID!==this.data.asset.id||draft.sha!==this.data.asset.sha256||
      draft.revision!==this.data.revision||!equal(draft.recipe,this.data.recipe))
      throw Error('AUTO_LIGHT_PROPOSAL_STALE');
    const patch=webAutoLightPatch(draft.proposal,amount),recipe=copy(this.data.recipe),p=recipe.parameters;
    for(const [key,value] of Object.entries(patch)){
      if(key.startsWith('color.'))setPostDecodeAdjustment(p,key,value,0);
      else{
        p[key]=value;
        const neutral=key==='exposure'?0:1;
        if(value===neutral)p.processingOrder=p.processingOrder.filter(stage=>stage!==key);
        else if(!p.processingOrder.includes(key)){
          const at=p.processingOrder.findIndex(stage=>['postDecodeAdjustments','rotation','crop'].includes(stage));
          p.processingOrder.splice(at<0?p.processingOrder.length:at,0,key);
        }
      }
    }
    this.bind(recipe);
    this.autoLightDraft=null;
    return this.commitRecipe(recipe);
  }
  async setPointColor(settings){
    this.requireReady();
    let pointColor;
    if(settings!==null){
      const amount=settings?.amount??1;
      if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('POINT_COLOR_RANGE');
      pointColor={selections:validatePointColorSelections(settings?.selections),amount};
    }
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(settings===null)delete adjustments.color.pointColor;
    else adjustments.color.pointColor=pointColor;
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  proposeXMPImport(bytes){
    this.requireReady();this.xmpImportDraft=null;
    if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
    // The existing converter delegates XML/namespace/unsupported-property
    // checks to readLookXMPSubset and rejects exposure outside SUITE +/-4.
    const patch=convertCameraRawXMPToSuiteSettings(bytes,{interpretation:CAMERA_RAW_SETTINGS_INTERPRETATION});
    const controls={...patch.globalPatch,...patch.postDecodePatch};
    const binding={assetID:this.data.asset.id,sha256:this.data.asset.sha256,
      revision:this.data.revision,recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    this.xmpImportDraft={controls:copy(controls),binding:copy(binding),proxy:this.proxy,beforeURL:this.data.beforeURL};
    return {controls:copy(controls),binding:copy(binding)};
  }
  async applyProposedXMPImport({controls,binding,interpretation}={}){
    this.requireReady();
    if(interpretation!=='suite-controls-not-adobe-render')throw Error('XMP_SUITE_SETTINGS_EXPLICIT_INTERPRETATION_REQUIRED');
    const draft=this.xmpImportDraft,keys=['assetID','sha256','revision','recipeJSON','afterURL'];
    if(!draft||draft.proxy!==this.proxy||draft.beforeURL!==this.data.beforeURL||
        !binding||typeof binding!=='object'||Array.isArray(binding)||
        ![Object.prototype,null].includes(Object.getPrototypeOf(binding))||
        Reflect.ownKeys(binding).length!==keys.length||keys.some(key=>{
          const d=Object.getOwnPropertyDescriptor(binding,key);
          return !d?.enumerable||!Object.hasOwn(d,'value')||d.value!==draft.binding[key];
        })||binding.assetID!==this.data.asset.id||binding.sha256!==this.data.asset.sha256||
        binding.revision!==this.data.revision||binding.recipeJSON!==JSON.stringify(this.data.recipe)||
        binding.afterURL!==this.data.afterURL)throw Error('XMP_IMPORT_PROPOSAL_STALE');
    const fields=Object.keys(draft.controls);
    if(!controls||typeof controls!=='object'||Array.isArray(controls)||
        ![Object.prototype,null].includes(Object.getPrototypeOf(controls))||
        Reflect.ownKeys(controls).length!==fields.length||fields.some(key=>{
          const d=Object.getOwnPropertyDescriptor(controls,key);
          return !d?.enumerable||!Object.hasOwn(d,'value')||!Number.isFinite(d.value)||d.value!==draft.controls[key];
        }))throw Error('XMP_IMPORT_PROPOSAL_CHANGED');
    const recipe=copy(this.data.recipe),p=recipe.parameters;
    for(const [key,value] of Object.entries(draft.controls)){
      if(['exposure','contrast','saturation'].includes(key))p[key]=value;
      else setPostDecodeAdjustment(p,`color.${key}`,value);
    }
    this.bind(recipe);this.xmpImportDraft=null;
    return this.commitRecipe(recipe);
  }
  proposeSceneMatch(referencePixels,{amount=1,sourceRegion,referenceRegion}={}){
    this.requireReady();this.sceneMatchDraft=null;
    const regionMask=(pixels,region)=>{
      assertPixels(pixels);
      if(region===undefined)return undefined;
      const keys=['x','y','width','height'];
      if(!region||typeof region!=='object'||Array.isArray(region)||
          ![Object.prototype,null].includes(Object.getPrototypeOf(region))||
          Reflect.ownKeys(region).length!==keys.length||keys.some(key=>{
            const d=Object.getOwnPropertyDescriptor(region,key);
            return !d?.enumerable||!Object.hasOwn(d,'value')||!Number.isFinite(d.value)||d.value<0||d.value>1;
          }))throw Error('SCENE_MATCH_REGION_INVALID');
      const {x,y,width,height}=region;
      if(width<=0||height<=0||x+width>1||y+height>1)throw Error('SCENE_MATCH_REGION_INVALID');
      // Half-open rectangle in the supplied frame. Source coordinates belong
      // to the unedited Before Proxy, not the rotated/cropped After preview.
      const mask=new Uint8Array(pixels.width*pixels.height);let count=0;
      for(let yy=0;yy<pixels.height;yy++){
        const cy=(yy+.5)/pixels.height;if(cy<y||cy>=y+height)continue;
        for(let xx=0;xx<pixels.width;xx++){
          const cx=(xx+.5)/pixels.width;if(cx<x||cx>=x+width)continue;
          mask[yy*pixels.width+xx]=255;count++;
        }
      }
      if(!count)throw Error('SCENE_MATCH_REGION_EMPTY');
      return mask;
    };
    const sourceMask=regionMask(this.proxy,sourceRegion),referenceMask=regionMask(referencePixels,referenceRegion);
    const settings=estimateSceneMatch(this.proxy,referencePixels,{amount,sourceMask,referenceMask});
    const binding={assetID:this.data.asset.id,sha256:this.data.asset.sha256,
      revision:this.data.revision,recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    this.sceneMatchDraft={settings:copy(settings),binding:copy(binding),proxy:this.proxy,beforeURL:this.data.beforeURL};
    return {settings:copy(settings),binding:copy(binding)};
  }
  async applyProposedSceneMatch({settings,binding}={}){
    this.requireReady();const draft=this.sceneMatchDraft;
    const keys=['assetID','sha256','revision','recipeJSON','afterURL'];
    if(!draft||draft.proxy!==this.proxy||draft.beforeURL!==this.data.beforeURL||
        !binding||typeof binding!=='object'||Array.isArray(binding)||
        Reflect.ownKeys(binding).length!==keys.length||keys.some(key=>{
          const d=Object.getOwnPropertyDescriptor(binding,key);
          return !d?.enumerable||!Object.hasOwn(d,'value')||d.value!==draft.binding[key];
        })||binding.assetID!==this.data.asset.id||binding.sha256!==this.data.asset.sha256||
        binding.revision!==this.data.revision||binding.recipeJSON!==JSON.stringify(this.data.recipe)||
        binding.afterURL!==this.data.afterURL)throw Error('SCENE_MATCH_PROPOSAL_STALE');
    const fixed=validateSceneMatch(settings);
    if(JSON.stringify(fixed)!==JSON.stringify(draft.settings))throw Error('SCENE_MATCH_PROPOSAL_CHANGED');
    this.sceneMatchDraft=null;
    return this._commitSceneMatch(fixed);
  }
  async resetSceneMatch(){
    this.requireReady();this.sceneMatchDraft=null;
    return this._commitSceneMatch(null);
  }
  async _commitSceneMatch(settings){
    this.requireReady();
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(settings===null)delete adjustments.color.sceneMatch;
    else adjustments.color.sceneMatch=validateSceneMatch(settings);
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  proposeWhiteBalance({mode='auto',x,y,radius=2}={}){
    this.requireReady();this.whiteBalanceDraft=null;
    if(!['auto','selector'].includes(mode))throw Error('WB_MODE_OR_SELECTION');
    const pixels=this.proxy;let mask;
    if(mode==='selector'){
      if(!this.data.beforeURL)throw Error('WB_BEFORE_PREVIEW_UNAVAILABLE');
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||
        !Number.isInteger(radius)||radius<0||radius>16)throw Error('WB_SELECTOR_COORDINATES');
      // BEFORE image coordinates only: immutable decoded Proxy, never rotated,
      // cropped or color-corrected After pixels. UI explicitly marks this mode.
      const cx=Math.min(pixels.width-1,Math.floor(x*pixels.width));
      const cy=Math.min(pixels.height-1,Math.floor(y*pixels.height));
      mask=new Uint8Array(pixels.width*pixels.height);
      for(let yy=Math.max(0,cy-radius);yy<=Math.min(pixels.height-1,cy+radius);yy++)
        for(let xx=Math.max(0,cx-radius);xx<=Math.min(pixels.width-1,cx+radius);xx++)mask[yy*pixels.width+xx]=255;
    }
    const whiteBalance=estimateWhiteBalance(pixels,{mode,...(mask?{mask}:{})});
    const binding={assetID:this.data.asset.id,sha256:this.data.asset.sha256,
      revision:this.data.revision,recipeJSON:JSON.stringify(this.data.recipe),afterURL:this.data.afterURL};
    this.whiteBalanceDraft={whiteBalance:copy(whiteBalance),binding:copy(binding),proxy:pixels,beforeURL:this.data.beforeURL};
    return {whiteBalance:copy(whiteBalance),binding:copy(binding)};
  }
  async applyProposedWhiteBalance({whiteBalance,binding}={}){
    this.requireReady();const draft=this.whiteBalanceDraft;
    const keys=['assetID','sha256','revision','recipeJSON','afterURL'];
    if(!draft||draft.proxy!==this.proxy||draft.beforeURL!==this.data.beforeURL||
      !binding||typeof binding!=='object'||Array.isArray(binding)||
      Reflect.ownKeys(binding).length!==keys.length||keys.some(key=>{
        const descriptor=Object.getOwnPropertyDescriptor(binding,key);
        return !descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||descriptor.value!==draft.binding[key];
      })||binding.assetID!==this.data.asset.id||binding.sha256!==this.data.asset.sha256||
      binding.revision!==this.data.revision||binding.recipeJSON!==JSON.stringify(this.data.recipe)||
      binding.afterURL!==this.data.afterURL)throw Error('WB_PROPOSAL_STALE');
    if(!whiteBalance||typeof whiteBalance!=='object'||Array.isArray(whiteBalance)||
      Object.keys(whiteBalance).some(key=>!['gains','domain','method'].includes(key))||
      whiteBalance.domain!=='linear-rec709'||!['auto','selector'].includes(whiteBalance.method)||
      !Array.isArray(whiteBalance.gains)||whiteBalance.gains.length!==3||
      whiteBalance.gains.some(value=>!Number.isFinite(value)||value<.25||value>4)||
      JSON.stringify(whiteBalance)!==JSON.stringify(draft.whiteBalance))throw Error('WB_PROPOSAL_CHANGED');
    const fixed=copy(draft.whiteBalance);this.whiteBalanceDraft=null;
    return this._commitWhiteBalance(fixed);
  }
  async resetWhiteBalance(){
    this.requireReady();this.whiteBalanceDraft=null;
    return this._commitWhiteBalance(null);
  }
  async _commitWhiteBalance(whiteBalance){
    this.requireReady();
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(whiteBalance===null)delete adjustments.color.whiteBalance;
    else{adjustments.color.whiteBalance=copy(whiteBalance);delete adjustments.color.illuminant;}
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setIlluminant(mode){
    this.requireReady();
    if(mode!==null&&!['daylight','cloudy','shade','tungsten','fluorescent','flash'].includes(mode))throw Error('ILLUMINANT_INVALID');
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(mode===null)delete adjustments.color.illuminant;
    else{adjustments.color.illuminant=mode;delete adjustments.color.whiteBalance;}
    this.whiteBalanceDraft=null;
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setSceneBasic(settings){
    this.requireReady();
    if(settings!==null&&(!settings||!['brightness','dehaze'].every(k=>Number.isFinite(settings[k])&&Math.abs(settings[k])<=100)))throw Error('SCENE_BASIC_RANGE');
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(settings===null)delete adjustments.color.sceneBasic;
    else adjustments.color.sceneBasic={brightness:settings.brightness,dehaze:settings.dehaze};
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setColorProfile(settings){
    this.requireReady();
    if(settings!==null&&(!settings||!['standard','black-and-white'].includes(settings.kind)||!Number.isFinite(settings.intensity)||settings.intensity<0||settings.intensity>1))throw Error('PROFILE_SETTINGS_INVALID');
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    delete extra.localLUTMask;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(settings===null)delete adjustments.color.profile;
    else adjustments.color.profile={kind:settings.kind,intensity:settings.intensity};
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async readLocalLUTRuntime(recipe,{signal}={}){
    const profile=recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.profile;
    if(profile?.kind!=='local-lut')return undefined;
    const lutRef=copy(profile.lutRef);
    return {lutRef,lut:await loadLocalLUT(lutRef,{signal})};
  }
  async importLocalLUT(bytes,{intensity=1,signal}={}){
    this.requireReady();
    if(!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('PROFILE_SETTINGS_INVALID');
    const token=this.operation,assetID=this.data.asset.id,sha256=this.data.asset.sha256,
      revision=this.data.revision,recipeJSON=JSON.stringify(this.data.recipe),proxy=this.proxy;
    // Persist the verified local asset before its reference can enter history.
    // If selection changes meanwhile, keep the asset but reject this application.
    const lutRef=await saveLocalLUT(bytes,{signal});
    this.check(token);this.requireReady();
    if(signal?.aborted)throw new DOMException('LUT import cancelled','AbortError');
    if(assetID!==this.data.asset.id||sha256!==this.data.asset.sha256||revision!==this.data.revision||
        recipeJSON!==JSON.stringify(this.data.recipe)||proxy!==this.proxy)throw Error('LOCAL_LUT_IMPORT_STALE');
    return this.commitLocalLUTProfile(lutRef,intensity);
  }
  async setLocalLUTIntensity(intensity){
    this.requireReady();
    const profile=this.data.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.profile;
    if(profile?.kind!=='local-lut')throw Error('LOCAL_LUT_PROFILE_REQUIRED');
    return this.commitLocalLUTProfile(profile.lutRef,intensity);
  }
  async applyLocalLUTPreset({parameters,profile,bytes},{signal}={}){
    this.requireReady();
    const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
      [Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&
      keys.every(key=>{const d=Object.getOwnPropertyDescriptor(v,key);return d?.enumerable&&Object.hasOwn(d,'value');});
    if(!exact(profile,['kind','intensity','lutRef'])||profile.kind!=='local-lut'||
      !Number.isFinite(profile.intensity)||profile.intensity<0||profile.intensity>1||
      !exact(profile.lutRef,['sha256','byteLength'])||typeof profile.lutRef.sha256!=='string'||
      !/^[a-f0-9]{64}$/.test(profile.lutRef.sha256)||!Number.isSafeInteger(profile.lutRef.byteLength)||
      profile.lutRef.byteLength<1||profile.lutRef.byteLength>33554432||
      !(bytes instanceof ArrayBuffer||bytes instanceof Uint8Array)||bytes.byteLength!==profile.lutRef.byteLength)
      throw Error('LUT_PRESET_INVALID');
    const safe=checkParameters(parameters),fixedProfile=copy(profile),fixedBytes=bytes instanceof ArrayBuffer?new Uint8Array(bytes.slice(0)):new Uint8Array(bytes);
    const token=this.operation,assetID=this.data.asset.id,sha256=this.data.asset.sha256,
      revision=this.data.revision,recipeJSON=JSON.stringify(this.data.recipe),proxy=this.proxy;
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    for(const name of ['exposure','contrast','saturation'])p[name]=safe[name];
    if(Object.hasOwn(safe,POST_DECODE_STAGE))extra[POST_DECODE_STAGE]=copy(safe[POST_DECODE_STAGE]);
    if(Object.hasOwn(safe,POST_CROP_STAGE))extra[POST_CROP_STAGE]=copy(safe[POST_CROP_STAGE]);
    if(Object.hasOwn(safe,'personalLook'))extra.personalLook=copy(safe.personalLook);
    extra[POST_DECODE_STAGE]??={schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}};
    const previousProfile=this.data.recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.profile;
    extra[POST_DECODE_STAGE].color??={};extra[POST_DECODE_STAGE].color.profile=fixedProfile;
    if(previousProfile?.kind!=='local-lut'||previousProfile.lutRef?.sha256!==fixedProfile.lutRef.sha256||
        previousProfile.lutRef?.byteLength!==fixedProfile.lutRef.byteLength)delete extra.localLUTMask;
    const stages=['exposure','contrast','saturation',POST_DECODE_STAGE,'rotation','crop'];
    if(p.processingOrder.some(stage=>!stages.includes(stage)))throw Error('UNSUPPORTED_PROCESSING_STAGE');
    p.processingOrder=stages.filter(stage=>['exposure','contrast','saturation',POST_DECODE_STAGE].includes(stage)||p.processingOrder.includes(stage));
    this.bind(recipe);
    // Asset persistence and Recipe commit are separate. On later failure retain
    // the unreferenced asset; never delete another saved Recipe's shared LUT.
    const ref=await saveLocalLUT(fixedBytes,{signal});
    this.check(token);this.requireReady();
    if(signal?.aborted)throw new DOMException('LUT preset cancelled','AbortError');
    if(ref.sha256!==fixedProfile.lutRef.sha256||ref.byteLength!==fixedProfile.lutRef.byteLength)throw Error('LUT_PRESET_ASSET_MISMATCH');
    if(assetID!==this.data.asset.id||sha256!==this.data.asset.sha256||revision!==this.data.revision||recipeJSON!==JSON.stringify(this.data.recipe)||proxy!==this.proxy)throw Error('LUT_PRESET_STALE');
    this.invalidatePeople();
    return this.commitRecipe(recipe,undefined,undefined,{signal,rollbackOnFailure:true,rollbackFailureCode:'LUT_PRESET_ROLLBACK_FAILED'});
  }
  async commitLocalLUTProfile(lutRef,intensity){
    this.requireReady();
    if(!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('PROFILE_SETTINGS_INVALID');
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    const old=adjustments.color.profile;
    if(old?.kind!=='local-lut'||old.lutRef?.sha256!==lutRef.sha256||old.lutRef?.byteLength!==lutRef.byteLength)delete extra.localLUTMask;
    adjustments.color.profile={kind:'local-lut',intensity,lutRef:copy(lutRef)};
    extra.postDecodeAdjustments=adjustments;
    if(!p.processingOrder.includes(POST_DECODE_STAGE)){
      const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
      p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setTonalBands(settings){
    this.requireReady();
    const keys=['shadows','darks','lights','highlights'];
    if(settings!==null&&(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(k=>!keys.includes(k))))throw Error('CURVE_BANDS_INVALID');
    const bands=settings===null?null:Object.fromEntries(keys.map(k=>[k,settings[k]??0]));
    if(bands&&Object.values(bands).some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('CURVE_BAND_RANGE');
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(bands&&Object.values(bands).some(v=>v!==0)&&Object.values(adjustments.color.toneCurve??{}).some(v=>v!==0))throw Error('TONAL_BANDS_LEGACY_CURVE_CONFLICT');
    if(bands)adjustments.color.tonalBands=bands;else delete adjustments.color.tonalBands;
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setColorGrading(settings){
    this.requireReady();
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    adjustments.color??={};
    if(settings===null)delete adjustments.color.grading;
    else adjustments.color.grading=validateColorGrading(settings);
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setSelectiveColorMethod(method){
    this.requireReady();
    if(!['relative','absolute'].includes(method))throw Error('SELECTIVE_COLOR_METHOD_UNSUPPORTED');
    const recipe=copy(this.data.recipe),parameters=recipe.parameters,extra=parameters.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
    adjustments.color??={};adjustments.color.selectiveColor??={};
    if(method==='relative')delete adjustments.color.selectiveColor.method;else adjustments.color.selectiveColor.method=method;
    if(!adjustments.color.selectiveColor.ranges&&!adjustments.color.selectiveColor.method)delete adjustments.color.selectiveColor;
    if(Object.keys(adjustments.color).length===0)delete adjustments.color;
    if(Object.keys(adjustments.detail||{}).length===0)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;parameters.processingOrder=parameters.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{extra.postDecodeAdjustments=adjustments;if(!parameters.processingOrder.includes(POST_DECODE_STAGE)){
      const at=parameters.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');parameters.processingOrder.splice(at<0?parameters.processingOrder.length:at,0,POST_DECODE_STAGE);
    }}
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setGlowMode(mode){
    this.requireReady();
    if(!['legacy','whiteMist','blackMist','halation'].includes(mode))throw Error('GLOW_MODE_UNSUPPORTED');
    const recipe=copy(this.data.recipe),parameters=recipe.parameters,extra=parameters.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
    adjustments.color??={};adjustments.color.glow??={};
    if(mode==='legacy')for(const key of ['mode','exposure','diffusion','tint'])delete adjustments.color.glow[key];
    else adjustments.color.glow.mode=mode;
    if(Object.keys(adjustments.color.glow).length===0)delete adjustments.color.glow;
    if(Object.keys(adjustments.color).length===0)delete adjustments.color;
    if(Object.keys(adjustments.detail||{}).length===0)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;parameters.processingOrder=parameters.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{extra.postDecodeAdjustments=adjustments;if(!parameters.processingOrder.includes(POST_DECODE_STAGE)){
      const at=parameters.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');parameters.processingOrder.splice(at<0?parameters.processingOrder.length:at,0,POST_DECODE_STAGE);
    }}
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setLumaCurve(points){
    this.requireReady();
    if(points!==null){
      if(!Array.isArray(points)||points.length<2||points.length>16||
        Reflect.ownKeys(points).length!==points.length+1)throw Error('LUMA_CURVE_POINTS_INVALID');
      let previous=-1;
      for(let i=0;i<points.length;i++){
        const item=Object.getOwnPropertyDescriptor(points,String(i));
        if(!item?.enumerable||!Object.hasOwn(item,'value'))throw Error('LUMA_CURVE_POINTS_INVALID');
        const point=item.value;
        if(!point||typeof point!=='object'||Array.isArray(point)||
          ![Object.prototype,null].includes(Object.getPrototypeOf(point))||
          Reflect.ownKeys(point).length!==2||['x','y'].some(key=>{
            const descriptor=Object.getOwnPropertyDescriptor(point,key);
            return !descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||
              !Number.isInteger(descriptor.value)||descriptor.value<0||descriptor.value>255;
          })||point.x<=previous)throw Error('LUMA_CURVE_POINTS_INVALID');
        previous=point.x;
      }
      if(points[0].x!==0||points[points.length-1].x!==255)throw Error('LUMA_CURVE_ENDPOINTS_REQUIRED');
    }
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
    adjustments.color??={};
    if(points===null)delete adjustments.color.lumaCurve;
    else adjustments.color.lumaCurve=points.map(({x,y})=>({x,y}));
    if(!Object.keys(adjustments.color).length)delete adjustments.color;
    if(!Object.keys(adjustments.detail??{}).length)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;p.processingOrder=p.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{
      extra.postDecodeAdjustments=adjustments;
      if(!p.processingOrder.includes(POST_DECODE_STAGE)){
        const at=p.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');
        p.processingOrder.splice(at<0?p.processingOrder.length:at,0,POST_DECODE_STAGE);
      }
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setPointCurve(channel,points){
    this.requireReady();
    if(!['master','red','green','blue'].includes(channel))throw Error('POINT_CURVE_CHANNEL_UNSUPPORTED');
    const recipe=copy(this.data.recipe),parameters=recipe.parameters,extra=parameters.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{schemaVersion:1,engineVersion:'suite-srgb8-color-detail-1',color:{},detail:{}});
    if(adjustments.schemaVersion!==1||adjustments.engineVersion!=='suite-srgb8-color-detail-1')throw Error('UNSUPPORTED_ADJUSTMENT');
    adjustments.color??={};adjustments.color.pointCurves??={};
    if(points===null)delete adjustments.color.pointCurves[channel];
    else adjustments.color.pointCurves[channel]=copy(points);
    if(!['master','red','green','blue'].some(name=>Object.hasOwn(adjustments.color.pointCurves,name)))delete adjustments.color.pointCurves.refineSaturation;
    if(Object.keys(adjustments.color.pointCurves).length===0)delete adjustments.color.pointCurves;
    if(Object.keys(adjustments.color).length===0)delete adjustments.color;
    if(Object.keys(adjustments.detail||{}).length===0)delete adjustments.detail;
    if(!adjustments.color&&!adjustments.detail){delete extra.postDecodeAdjustments;parameters.processingOrder=parameters.processingOrder.filter(stage=>stage!==POST_DECODE_STAGE);}
    else{extra.postDecodeAdjustments=adjustments;if(!parameters.processingOrder.includes(POST_DECODE_STAGE)){
      const at=parameters.processingOrder.findIndex(stage=>stage==='rotation'||stage==='crop');parameters.processingOrder.splice(at<0?parameters.processingOrder.length:at,0,POST_DECODE_STAGE);
    }}
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setPointCurveRefineSaturation(value){
    this.requireReady();
    if(!Number.isInteger(value)||value<0||value>100)throw Error('POINT_CURVE_REFINE_SATURATION_INVALID');
    const recipe=copy(this.data.recipe),parameters=recipe.parameters,extra=parameters.extendedParameters;
    const adjustments=copy(extra.postDecodeAdjustments||{}),curves=adjustments.color?.pointCurves;
    if(!curves||!['master','red','green','blue'].some(name=>Object.hasOwn(curves,name)))throw Error('POINT_CURVE_REQUIRED');
    if(value===100)delete curves.refineSaturation;
    else curves.refineSaturation=value;
    extra.postDecodeAdjustments=adjustments;
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setLocalAdjustment(key,document){
    this.requireReady();
    if(!['webDepthRange','webRawDenoise','manualMakeup','manualClone','manualSkin','manualRedEye','manualHair','manualEyes','webManualTeeth','webManualClothing','webManualBackground','webManualSpot','webLensShading','webManualLiquify','localLUTMask','colorRangeLevels','personalLook'].includes(key))throw Error('LOCAL_ADJUSTMENT_UNKNOWN');
    const recipe=copy(this.data.recipe);
    if(document===null)delete recipe.parameters.extendedParameters[key];
    else recipe.parameters.extendedParameters[key]=copy(document);
    this.bind(recipe);
    // Local hand-authored strokes, ranges and fitted color coefficients do not
    // grant face-detection permission. Existing portrait/Trial gates stay intact.
    return this.commitRecipe(recipe,undefined,undefined,{rollbackOnFailure:true,
      rollbackFailureCode:'LOCAL_ADJUSTMENT_ROLLBACK_FAILED'});
  }
  async setManualMakeup(document){return this.setLocalAdjustment('manualMakeup',document);}
  async setManualClone(document){return this.setLocalAdjustment('manualClone',document);}
  async setManualSkin(document){return this.setLocalAdjustment('manualSkin',document);}
  async setManualRedEye(document){return this.setLocalAdjustment('manualRedEye',document);}
  async setManualHair(document){return this.setLocalAdjustment('manualHair',document);}
  async setWebManualTeeth(document){return this.setLocalAdjustment('webManualTeeth',document);}
  async setWebManualClothing(document){return this.setLocalAdjustment('webManualClothing',document);}
  async setWebManualBackground(document){return this.setLocalAdjustment('webManualBackground',document);}
  async setWebManualSpot(document){return this.setLocalAdjustment('webManualSpot',document);}
  async setWebRawDenoise(document){return this.setLocalAdjustment('webRawDenoise',document);}
  async setWebDepthRange(document){return this.setLocalAdjustment('webDepthRange',document);}
  async setWebLensShading(document){return this.setLocalAdjustment('webLensShading',document);}
  async setWebManualLiquify(document){return this.setLocalAdjustment('webManualLiquify',document);}
  async setLocalLUTMask(document){return this.setLocalAdjustment('localLUTMask',document);}
  async setManualEyes(document){return this.setLocalAdjustment('manualEyes',document);}
  async setColorRangeLevels(document){return this.setLocalAdjustment('colorRangeLevels',document);}
  async setPersonalLook(document){return this.setLocalAdjustment('personalLook',document);}
  async setLocalLevels(settings){
    this.requireReady();
    const recipe=copy(this.data.recipe),extra=recipe.parameters.extendedParameters;
    if(settings===null)delete extra.localLevels;
    else{
      if(!settings||typeof settings!=='object'||Array.isArray(settings)||
          Reflect.ownKeys(settings).length!==2||
          !Object.hasOwn(settings,'strokes')||!Object.hasOwn(settings,'levels'))
        throw Error('LOCAL_LEVELS_INPUT_INVALID');
      extra.localLevels={schemaVersion:1,engineVersion:'suite-srgb8-local-levels-coverage-1',
        brushVersion:'suite-normalized-coverage-brush-1',strokes:settings.strokes,levels:settings.levels};
      this.bind(recipe);
      // Commit persists the draft before preview rendering. Refuse invalid or
      // excessive brush work at both Proxy and source-sized Final dimensions
      // before permission/commit can alter history or durable storage.
      const fixed=copy(recipe),local=fixed.parameters.extendedParameters.localLevels;
      rasterizeLocalBrushMask({width:this.proxy.width,height:this.proxy.height,strokes:local.strokes});
      const original=sourceDimensions(this.proxy);
      if(original.width!==this.proxy.width||original.height!==this.proxy.height)
        rasterizeLocalBrushMask({width:original.width,height:original.height,strokes:local.strokes});
      return this.commitRecipe(fixed);
    }
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setBWEdgeManualStrokes({subjectStrokes,correctionStrokes}={}){
    this.requireReady();
    if(!this.bwEdgeManualAvailable)throw Error('BW_EDGE_AUTHENTICATED_TRIAL_REQUIRED');
    if(!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('BW_EDGE_SAVED_RECIPE_REQUIRED');
    const source=sourceDimensions(this.proxy),asset=this.data.asset;
    const recipe=copy(this.data.recipe);
    recipe.parameters.extendedParameters.bwEdgeManual={schemaVersion:1,
      engineVersion:BW_EDGE_REMOVAL_VERSION,
      binding:{assetID:asset.id,originalSHA256:asset.sha256.toLowerCase(),
        sourceWidth:source.width,sourceHeight:source.height},
      subjectStrokes:copy(subjectStrokes),correctionStrokes:copy(correctionStrokes)};
    this.bind(recipe);
    return this.commitRecipe(recipe);
  }
  async setAddShadowManualDocument(document,{replaceBackdrop=false,signal}={}){
    this.requireReady();
    if(!this.addShadowManualAvailable)throw Error('ADD_SHADOW_AUTHENTICATED_TRIAL_REQUIRED');
    if(!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('ADD_SHADOW_SAVED_BASE_REQUIRED');
    const asset=this.data.asset,source=sourceDimensions(this.proxy);
    const listed=await this.api.listAssets();
    const matches=listed.filter(item=>item?.id===document?.binding?.backdropID);
    if(matches.length!==1||matches[0].cloudSafe!==true||matches[0].deletedAt!==null)
      throw Error('ADD_SHADOW_BACKDROP_UNAVAILABLE');
    const backdrop=matches[0];
    const recipe=buildAddShadowManualRecipe({recipe:this.data.recipe,document,
      target:{id:asset.id,sha256:asset.sha256,sourceWidth:source.width,sourceHeight:source.height},
      backdrop:{id:backdrop.id,sha256:backdrop.sha256},replaceBackdrop,...(signal?{signal}:{})});
    await this.readAddShadowRuntime(recipe,{target:'proxy',mode:'draft',signal});
    return this.commitRecipe(recipe);
  }
  async setFreeCrop(rect){
    this.requireReady();
    const recipe=copy(this.data.recipe),p=recipe.parameters,extra=p.extendedParameters;
    if(rect===null){
      delete extra.crop;p.processingOrder=p.processingOrder.filter(stage=>stage!=='crop');
    }else{
      const keys=['x','y','width','height'];
      if(!rect||typeof rect!=='object'||Array.isArray(rect)||
          ![Object.prototype,null].includes(Object.getPrototypeOf(rect))||
          Reflect.ownKeys(rect).length!==keys.length||keys.some(key=>{
            const d=Object.getOwnPropertyDescriptor(rect,key);
            return !d?.enumerable||!Object.hasOwn(d,'value')||!Number.isFinite(d.value);
          }))throw Error('INVALID_CROP_RECT');
      validateCropRect(rect);
      const fixed=Object.fromEntries(keys.map(key=>[key,rect[key]])),source=sourceDimensions(this.proxy);
      const turned=Math.abs(p.rotationDegrees%180)===90;
      const w=turned?source.height:source.width,h=turned?source.width:source.height;
      const preset=CROP_RATIOS.find(item=>item.id==='ratio.free');
      if(!preset)throw Error('CROP_RATIO_UNSUPPORTED');
      const crop={preset_id:preset.id,preset_name:preset.name,
        orientation:w*fixed.width<h*fixed.height?'portrait':'landscape',crop_rect:fixed,
        rotation:p.rotationDegrees,custom_size:false,requested_dpi:extra.export?.requested_dpi??96};
      // Use the same floor projection as rendering, at both resolutions,
      // before persisting a draft that might render an empty/outside Crop.
      for(const frame of [source,this.proxy]){
        const {available}=resolutionAssessment(frame.width,frame.height,crop);
        const rw=turned?frame.height:frame.width,rh=turned?frame.width:frame.height;
        const left=Math.floor(fixed.x*rw+1e-9),top=Math.floor(fixed.y*rh+1e-9);
        if(left<0||top<0||left+available.width>rw||top+available.height>rh)throw Error('CROP_OUTSIDE_PIXELS');
      }
      extra.crop=crop;
      if(!p.processingOrder.includes('crop'))p.processingOrder.push('crop');
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setSceneGeometry(settings){
    this.requireReady();
    const recipe=copy(this.data.recipe),extra=recipe.parameters.extendedParameters;
    if(settings===null)delete extra.sceneGeometry;
    else{
      const fixed=validateSceneGeometry(settings),source=sourceDimensions(this.proxy);
      // Validate the complete output rectangle at the canonical aspect before
      // any durable history change. Proxy rounding must not change perspective.
      sceneGeometryInverse(fixed,source.width/source.height);
      extra.sceneGeometry=fixed;
    }
    this.bind(recipe);return this.commitRecipe(recipe);
  }
  async setCanvasExpansion(settings,{signal}={}){
    this.requireReady();
    if(signal!==undefined&&(signal===null||typeof signal.aborted!=='boolean'))throw Error('CANVAS_ABORT_SIGNAL_INVALID');
    if(signal?.aborted)throw new DOMException('Canvas expansion cancelled','AbortError');
    const recipe=copy(this.data.recipe),extra=recipe.parameters.extendedParameters;
    if(settings===null)delete extra.canvasExpand;
    else{
      const proposed={schemaVersion:1,margins:copy(settings?.margins)};
      if(settings&&Object.hasOwn(settings,'background'))proposed.background=copy(settings.background);
      extra.canvasExpand=proposed;
      this.bind(recipe);
      if(Object.values(proposed.margins).every(value=>value===0)&&(!proposed.background||proposed.background.every((value,index)=>value===255)))delete extra.canvasExpand;
    }
    this.bind(recipe);
    return this.commitRecipe(recipe,undefined,undefined,{signal});
  }
  async applyPortablePreset(parameters){
    this.requireReady();const safe=checkParameters(parameters);
    const recipe=copy(this.data.recipe);for(const name of ['exposure','contrast','saturation'])recipe.parameters[name]=safe[name];
    if(Object.hasOwn(safe,POST_DECODE_STAGE)){
      recipe.parameters.extendedParameters[POST_DECODE_STAGE]=copy(safe[POST_DECODE_STAGE]);
      delete recipe.parameters.extendedParameters.localLUTMask;
    }
    // Vignette is a post-Crop, photo-independent look setting. Legacy presets
    // omit it and must leave the target photo's existing vignette untouched.
    if(Object.hasOwn(safe,POST_CROP_STAGE))recipe.parameters.extendedParameters[POST_CROP_STAGE]=copy(safe[POST_CROP_STAGE]);
    if(Object.hasOwn(safe,'personalLook'))recipe.parameters.extendedParameters.personalLook=copy(safe.personalLook);
    const stages=['exposure','contrast','saturation',POST_DECODE_STAGE,'rotation','crop'];if(recipe.parameters.processingOrder.some(s=>!stages.includes(s)))throw Error('UNSUPPORTED_PROCESSING_STAGE');recipe.parameters.processingOrder=stages.filter(s=>['exposure','contrast','saturation'].includes(s)||(s===POST_DECODE_STAGE?Boolean(recipe.parameters.extendedParameters[POST_DECODE_STAGE]):recipe.parameters.processingOrder.includes(s)));
    this.invalidatePeople();return this.commitRecipe(recipe);
  }
  async applyPublishedAuthorVignetteOnly({presetID,expectedVersion,expectedSHA256}={}){
    this.requireReady();
    if(!(this.api instanceof TrialClient))throw Error('AUTHOR_VIGNETTE_TRIAL_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('AUTHOR_VIGNETTE_TARGET_SAVE_REQUIRED');
    if(typeof presetID!=='string'||!presetID||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
      typeof expectedSHA256!=='string'||!/^[0-9a-f]{64}$/i.test(expectedSHA256))
      throw Error('AUTHOR_VIGNETTE_PRESET_SELECTION_INVALID');
    const token=this.operation,asset=copy(this.data.asset),revision=this.data.revision,
      originalRecipe=copy(this.data.recipe);
    this.publish({busy:'Vignette Preset verification',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const matches=listed.filter(item=>item?.id===asset.id);
      if(matches.length!==1||matches[0].deletedAt!=null||
        matches[0].sha256?.toLowerCase()!==asset.sha256?.toLowerCase()||
        matches[0].size!==asset.size)
        throw Error('AUTHOR_VIGNETTE_TARGET_ASSET_CHANGED');
      const permission=await this.api.assertPermission(asset.id,'edit');this.check(token);
      if(permission?.authorized!==true)throw Error('AUTHOR_VIGNETTE_EDIT_DENIED');
      const saved=await this.api.getRecipe(asset.id);this.check(token);
      if(!saved||saved.branch===true||saved.revision!==revision||!equal(saved.body,originalRecipe))
        throw Error('AUTHOR_VIGNETTE_TARGET_REVISION_CHANGED');
      const firstOriginal=await this.api.getOriginal(asset.id);this.check(token);
      if(await checksum(firstOriginal)!==asset.sha256.toLowerCase())
        throw Error('AUTHOR_VIGNETTE_ORIGINAL_CHANGED');
      const presets=await this.api.listPresets();this.check(token);
      if(!Array.isArray(presets))throw Error('AUTHOR_VIGNETTE_PRESET_LIST_INVALID');
      const found=presets.filter(item=>item?.id===presetID);
      if(found.length!==1||found[0].version!==expectedVersion||
        found[0].sha256?.toLowerCase()!==expectedSHA256.toLowerCase())
        throw Error('AUTHOR_VIGNETTE_PRESET_VERSION_CHANGED');
      const safe=checkParameters(found[0].parameters);
      if(!Object.hasOwn(safe,POST_CROP_STAGE))throw Error('AUTHOR_VIGNETTE_PRESET_MISSING');
      const next=copy(originalRecipe);
      next.parameters.extendedParameters[POST_CROP_STAGE]=copy(safe[POST_CROP_STAGE]);
      this.bind(next,asset);
      // Re-read the target and Original before releasing the local draft. The
      // later CAS save and Final each perform their own authoritative checks.
      const current=await this.api.getRecipe(asset.id);this.check(token);
      if(!current||current.branch===true||current.revision!==revision||
        !equal(current.body,originalRecipe))throw Error('AUTHOR_VIGNETTE_TARGET_REVISION_CHANGED');
      const freshOriginal=await this.api.getOriginal(asset.id);this.check(token);
      if(await checksum(freshOriginal)!==asset.sha256.toLowerCase())
        throw Error('AUTHOR_VIGNETTE_ORIGINAL_CHANGED');
      const freshPermission=await this.api.assertPermission(asset.id,'edit');this.check(token);
      if(freshPermission?.authorized!==true)throw Error('AUTHOR_VIGNETTE_EDIT_DENIED');
      this.publish({busy:null});
      this.invalidatePeople();
      await this.commitRecipe(next);
      this.log('WEB_AUTHOR_VIGNETTE_ONLY','PASS_CONTRACT_ONLY',
        'Fresh published Preset and saved target verified; Vignette-only draft is not saved');
      return {presetID,version:expectedVersion,assetID:asset.id,baseRevision:revision,saved:false};
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_AUTHOR_VIGNETTE_ONLY','REJECT',error.message);}
      throw error;
    }
  }
  async applyPublishedAuthorGlowOnly({presetID,expectedVersion,expectedSHA256}={}){
    this.requireReady();
    if(!(this.api instanceof TrialClient))throw Error('AUTHOR_GLOW_TRIAL_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('AUTHOR_GLOW_TARGET_SAVE_REQUIRED');
    if(typeof presetID!=='string'||!presetID||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
      typeof expectedSHA256!=='string'||!/^[0-9a-f]{64}$/i.test(expectedSHA256))
      throw Error('AUTHOR_GLOW_PRESET_SELECTION_INVALID');
    const token=this.operation,asset=copy(this.data.asset),revision=this.data.revision,
      originalRecipe=copy(this.data.recipe);
    this.publish({busy:'Glow Preset verification',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const matches=listed.filter(item=>item?.id===asset.id);
      if(matches.length!==1||matches[0].deletedAt!=null||
        matches[0].sha256?.toLowerCase()!==asset.sha256?.toLowerCase())
        throw Error('AUTHOR_GLOW_TARGET_ASSET_CHANGED');
      const permission=await this.api.assertPermission(asset.id,'edit');this.check(token);
      if(permission?.authorized!==true)throw Error('AUTHOR_GLOW_EDIT_DENIED');
      const saved=await this.api.getRecipe(asset.id);this.check(token);
      if(!saved||saved.branch===true||saved.revision!==revision||!equal(saved.body,originalRecipe))
        throw Error('AUTHOR_GLOW_TARGET_REVISION_CHANGED');
      const original=await this.api.getOriginal(asset.id);this.check(token);
      if(await checksum(original)!==asset.sha256.toLowerCase())throw Error('AUTHOR_GLOW_ORIGINAL_CHANGED');
      this.check(token);
      const presets=await this.api.listPresets();this.check(token);
      if(!Array.isArray(presets))throw Error('AUTHOR_GLOW_PRESET_LIST_INVALID');
      const found=presets.filter(item=>item?.id===presetID);
      if(found.length!==1||found[0].version!==expectedVersion||
        found[0].sha256?.toLowerCase()!==expectedSHA256.toLowerCase())
        throw Error('AUTHOR_GLOW_PRESET_VERSION_CHANGED');
      const next=mergeAuthorGlowOnly(originalRecipe,found[0].parameters);
      this.check(token);
      this.publish({busy:null});
      this.invalidatePeople();
      await this.commitRecipe(next);
      this.log('WEB_AUTHOR_GLOW_ONLY','PASS_CONTRACT_ONLY',
        'Fresh published Preset and saved target verified; Glow-only draft is not saved');
      return {presetID,version:expectedVersion,assetID:asset.id,baseRevision:revision,saved:false};
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_AUTHOR_GLOW_ONLY','REJECT',error.message);}
      throw error;
    }
  }
  async renderSavedRecipeComparison({left,right,signal}={}){
    this.requireReady();
    if(this.api.supportsRecipeHistory!==true||typeof this.api.getRecipeHistory!=='function')throw Error('RECIPE_HISTORY_UNSUPPORTED');
    const selected=value=>{
      const keys=['assetId','revision','bodySHA256'];
      if(!value||typeof value!=='object'||Array.isArray(value)||
          ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
          Reflect.ownKeys(value).length!==keys.length||keys.some(key=>{
            const d=Object.getOwnPropertyDescriptor(value,key);
            return !d?.enumerable||!Object.hasOwn(d,'value');
          })||value.assetId!==this.data.asset.id||!Number.isSafeInteger(value.revision)||value.revision<1||
          typeof value.bodySHA256!=='string'||!/^[0-9a-f]{64}$/.test(value.bodySHA256))throw Error('COMPARISON_SELECTION_INVALID');
      return {...value};
    };
    const selections=[selected(left),selected(right)],token=this.operation,api=this.api,asset=copy(this.data.asset),
      revision=this.data.revision,recipeJSON=JSON.stringify(this.data.recipe),proxy=this.proxy,
      afterURL=this.data.afterURL,dirty=this.data.dirty;
    let requiresPeople=false;
    const checkPeople=()=>{
      // Same approval gate as normal Preview, but do not call the Session
      // helper: its rejection path mutates people selection/evidence state.
      if(!['SYNTHETIC_TEST_ONLY',PERSON_PRIVACY_APPROVED].includes(this.data.personProcessingStatus)||
          this.data.personProcessingStatus==='SYNTHETIC_TEST_ONLY'&&this.processing?.syntheticTestOnly!==true)
        throw Error('PERSON_PRIVACY_REVIEW_REQUIRED');
    };
    const ensure=()=>{
      this.check(token);
      if(signal?.aborted)throw new DOMException('Version comparison cancelled','AbortError');
      if(requiresPeople)checkPeople();
      if(this.api!==api||this.data.asset?.id!==asset.id||this.data.asset.sha256!==asset.sha256||this.proxy!==proxy||
          this.data.revision!==revision||this.data.dirty!==dirty||this.data.afterURL!==afterURL||
          JSON.stringify(this.data.recipe)!==recipeJSON)throw Error('COMPARISON_SELECTION_STALE');
    };
    const authorize=async()=>{
      ensure();const assets=await this.api.listAssets();ensure();
      const matches=assets.filter(item=>item?.id===asset.id);
      if(matches.length!==1||matches[0].deletedAt!=null||matches[0].sha256!==asset.sha256)throw Error('COMPARISON_ASSET_CHANGED');
      if(this.api.assertPermission){const permission=await this.api.assertPermission(asset.id,'edit');ensure();
        if(permission?.authorized!==true)throw Error('COMPARISON_PERMISSION_DENIED');}
    };
    await authorize();ensure();
    const rows=await this.api.getRecipeHistory(asset.id,{signal});ensure();
    if(!Array.isArray(rows))throw Error('RECIPE_HISTORY_INVALID');
    const recipes=[];
    const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?
      Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
    for(const selection of selections){
      const matches=rows.filter(row=>row?.revision===selection.revision&&row.branch!==true);
      if(matches.length!==1)throw Error('COMPARISON_VERSION_UNAVAILABLE');
      const recipe=copy(matches[0].body);validateRecipe(recipe);
      const actual=await checksum(new TextEncoder().encode(JSON.stringify(sort(recipe))));ensure();
      if(actual!==selection.bodySHA256)throw Error('COMPARISON_BODY_SHA_MISMATCH');
      const extra=recipe.parameters.extendedParameters;
      if(extra.portrait&&!hasLocalMakeup(recipe)&&!(isLocalAPI(this.api)&&hasLocalShadow(recipe))){
        requiresPeople=true;checkPeople();
        if(typeof this.processing.detectPeople!=='function')throw Error('COMPARISON_PERSON_DETECTOR_REQUIRED');
      }
      this.bind(recipe,asset);recipes.push(recipe);
    }
    // Special saved effects require fresh Original/backdrop decode and real
    // historical authority. Ordinary versions still use the cached Proxy.
    // Neither route replaces current Session recipe/history/preview state.
    const cachedSource={...proxy,data:proxy.data.slice()},rendered=[],postflights=[];
    for(let index=0;index<recipes.length;index++){
      const savedRecipe=recipes[index],extra=savedRecipe.parameters.extendedParameters;
      let source=cachedSource,recipe=savedRecipe,runtimeOptions={};
      if(extra.webRawDenoise||hasLocalMakeup(savedRecipe)||isLocalAPI(api)&&hasLocalShadow(savedRecipe)){
        const prepared=await this.prepareLocalManual(savedRecipe,{guard:ensure,signal});ensure();
        source=prepared.pixels;recipe=prepared.recipe;runtimeOptions=prepared.options??{};postflights.push(prepared.recheck);
      }else if(extra.handToneManual||extra.clothingSpotManual){
        const prepare=extra.clothingSpotManual?prepareBrowserLocalClothingSpotHistory:prepareBrowserLocalHandToneHistory;
        const prepared=await prepare({api,selection:selections[index],
          expectedAsset:asset,guard:ensure,signal});ensure();
        source=prepared.pixels;recipe=prepared.recipe;postflights.push(prepared.recheck);
      }else if(extra.bwEdgeManual||extra.addShadowManual||extra.originalShadowManual){
        const prepared=await prepareSavedVersionSpecialComparison({api:this.api,selection:selections[index],
          expectedAsset:asset,guard:ensure,signal});ensure();
        source=prepared.pixels;recipe=prepared.recipe;runtimeOptions=prepared.options;
        postflights.push(prepared.recheck);
      }
      ensure();const localLUT=await this.readLocalLUTRuntime(recipe,{signal});ensure();
      // Fresh detections for each saved portrait document, never this Session's
      // selected-person cache. The ordinary Worker also redetects and reconciles
      // its bound source against the saved targets inside the render operation.
      let detections=[];
      if(portrait(recipe)){
        checkPeople();detections=await this.processing.detectPeople(source,{signal});ensure();
        if(!Array.isArray(detections)||!detections.length)throw Error('NO_PERSON_DETECTED');
      }
      const pixels=await this.processing.render(source,recipe,{detections,localLUT,signal,...runtimeOptions});ensure();
      assertPixels(pixels);rendered.push(pixels);
    }
    for(const recheck of postflights){await recheck();ensure();}
    await authorize();ensure();
    return {left:rendered[0],right:rendered[1]};
  }
  async restoreSavedRecipeVersion({assetId,revision,bodySHA256,signal}={}){
    this.requireReady();
    if(this.api.supportsRecipeHistory!==true||typeof this.api.getRecipeHistory!=='function')throw Error('RECIPE_HISTORY_UNSUPPORTED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)throw Error('RESTORE_SAVE_REQUIRED');
    if(assetId!==this.data.asset.id||!Number.isSafeInteger(revision)||revision<1||
        typeof bodySHA256!=='string'||!/^[0-9a-f]{64}$/.test(bodySHA256))throw Error('RESTORE_SELECTION_INVALID');
    const token=this.operation,asset=copy(this.data.asset),headRevision=this.data.revision,
      recipe=copy(this.data.recipe),recipeJSON=JSON.stringify(recipe),proxy=this.proxy;
    const prior={history:copy(this.history),cursor:this.cursor,proxy:copy(this.proxy),reference:copy(this.reference),
      data:copy(this.data),hints:copy(originalShadowRestoreHints.get(this)||[])};
    let commitStarted=false;
    const ensure=()=>{
      this.check(token);
      if(signal?.aborted)throw new DOMException('Saved version restore cancelled','AbortError');
      if(this.data.asset?.id!==asset.id||this.data.asset.sha256!==asset.sha256||this.proxy!==proxy||
          this.data.revision!==headRevision||this.data.dirty||JSON.stringify(this.data.recipe)!==recipeJSON)
        throw Error('RESTORE_SELECTION_STALE');
    };
    const headMatches=row=>row&&row.branch!==true&&row.revision===headRevision&&equal(row.body,recipe);
    const verifyAsset=async()=>{
      ensure();
      const assets=await this.api.listAssets();ensure();
      const matches=assets.filter(item=>item?.id===asset.id);
      if(matches.length!==1||matches[0].deletedAt!=null||matches[0].sha256!==asset.sha256)throw Error('RESTORE_ASSET_CHANGED');
      if(this.api.assertPermission){const permission=await this.api.assertPermission(asset.id,'edit');ensure();
        if(permission?.authorized!==true)throw Error('RESTORE_PERMISSION_DENIED');}
    };
    ensure();this.publish({busy:'Saved version verification',error:null});
    try{
      const cached=await this.storage.get(asset.id);ensure();
      prior.cache=cached===undefined?{asset,proxy:prior.proxy,history:prior.history,cursor:prior.cursor,
        revision:headRevision,reference:prior.reference,dirty:false,provenance:prior.data.provenance,metadata:prior.data.metadata,
        originalShadowRestoreHints:prior.hints}:copy(cached);
      await verifyAsset();ensure();
      const latest=await this.api.getRecipe(asset.id);ensure();
      if(!headMatches(latest))throw Error('RESTORE_HEAD_CHANGED');
      const rows=await this.api.getRecipeHistory(asset.id,{signal});ensure();
      if(!Array.isArray(rows))throw Error('RECIPE_HISTORY_INVALID');
      const matches=rows.filter(row=>row?.revision===revision&&row.branch!==true);
      if(matches.length!==1||revision>headRevision)throw Error('RESTORE_VERSION_UNAVAILABLE');
      const restored=copy(matches[0].body);this.bind(restored,asset);
      const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?
        Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
      const actual=await checksum(new TextEncoder().encode(JSON.stringify(sort(restored))));ensure();
      if(actual!==bodySHA256)throw Error('RESTORE_BODY_SHA_MISMATCH');
      const extra=restored.parameters.extendedParameters;
      // These independent manual previews are not ordinary Recipe render paths.
      // Never strip a bound document to make an unsupported restore look valid.
      const verifiedManual=await this.prepareLocalManual(restored,{signal,guard:ensure});ensure();
      if(verifiedManual){
        const localLUT=await this.readLocalLUTRuntime(verifiedManual.recipe,{signal});ensure();
        const rendered=await this.processing.render(verifiedManual.pixels,verifiedManual.recipe,{localLUT,signal,...verifiedManual.options});ensure();assertPixels(rendered);
        await verifiedManual.recheck();ensure();
      }
      if(extra.originalShadowManual&&!(this.api instanceof SitesClient)&&!isLocalAPI(this.api)&&
        !equal(extra.originalShadowManual,recipe.parameters.extendedParameters.originalShadowManual))
        throw Error('RESTORE_ORIGINAL_SHADOW_DOCUMENT_UNSUPPORTED');
      if(extra.originalShadowManual&&this.api instanceof SitesClient){
        // Build the historical manual frame before changing the current edit.
        // The actual HEAD remains the Save base, never a fabricated adapter row.
        const prepared=await this.prepareOriginalShadowHistoryPreview({asset,recipe:restored,revision:headRevision,
          selection:{assetId,revision,bodySHA256},guard:ensure,signal});ensure();
        const localLUT=await this.readLocalLUTRuntime(prepared.recipe,{signal});ensure();
        const bwEdgeRuntime=await this.readBWEdgeRuntime(restored,{revision:headRevision,signal});ensure();
        let detections=[];
        if(portrait(restored)){
          if(this.data.personProcessingStatus!==PERSON_PRIVACY_APPROVED&&
            !(this.data.personProcessingStatus==='SYNTHETIC_TEST_ONLY'&&this.processing.syntheticTestOnly===true))throw Error('PERSON_PRIVACY_REVIEW_REQUIRED');
          detections=await this.processing.detectPeople(prepared.proxy,{signal});ensure();
        }
        const rendered=await this.processing.render(prepared.pixels,prepared.recipe,{detections,localLUT,signal,
          ...(bwEdgeRuntime?{bwEdgeRuntime,bwEdgeTarget:'proxy'}:{})});ensure();assertPixels(rendered);
        await prepared.recheck();ensure();
      }
      if(extra.sceneGeometry){const source=sourceDimensions(proxy);sceneGeometryInverse(extra.sceneGeometry,source.width/source.height);}
      await verifyAsset();ensure();
      const finalHead=await this.api.getRecipe(asset.id);ensure();
      if(!headMatches(finalHead))throw Error('RESTORE_HEAD_CHANGED');
      this.publish({busy:null});this.invalidatePeople();
      // Latest server revision remains the Save/CAS base. This is one local
      // Undo-able edit, not a history rewrite or an automatic server Save.
      commitStarted=true;
      return await this.commitRecipe(restored,undefined,undefined,{signal});
    }catch(error){
      if(token===this.operation){
        originalShadowRestoreHints.set(this,prior.hints);
        if(commitStarted){
          try{
            await this.storage.put(asset.id,prior.cache);this.check(token);
            this.history=prior.history;this.cursor=prior.cursor;this.reference=prior.reference;this.proxy=prior.proxy;
            this.invalidatePreview();
            this.publish({asset:prior.data.asset,recipe:prior.data.recipe,revision:prior.data.revision,dirty:prior.data.dirty,
              provenance:prior.data.provenance,metadata:prior.data.metadata,shadowVerification:prior.data.shadowVerification,
              busy:'restore rollback',error:null});
            try{await this.refreshPreview(token);this.check(token);}
            catch{this.check(token);this.invalidatePreview();this.proxy=prior.proxy;}
          }catch(rollbackError){
            if(token===this.operation){
              this.history=prior.history;this.cursor=prior.cursor;this.reference=prior.reference;this.proxy=prior.proxy;
              this.invalidatePreview();this.publish({recipe:prior.data.recipe,revision:prior.data.revision,dirty:prior.data.dirty,
                provenance:prior.data.provenance,metadata:prior.data.metadata,shadowVerification:prior.data.shadowVerification,
                busy:'recovery required',error:'ORIGINAL_SHADOW_RESTORE_ROLLBACK_FAILED'});
            }
            throw Error('ORIGINAL_SHADOW_RESTORE_ROLLBACK_FAILED',{cause:rollbackError});
          }
        }
      }
      if(token===this.operation)this.publish({busy:null,error:error.message});
      throw error;
    }
  }
  async undo(){this.requireReady();if(this.cursor<=0)return;const cursor=this.cursor-1;this.invalidatePeople();return this.commitRecipe(this.history[cursor],this.history,cursor,{rollbackOnFailure:this.api instanceof SitesClient&&Boolean(this.data.recipe.parameters.extendedParameters.originalShadowManual||this.history[cursor].parameters.extendedParameters.originalShadowManual)});}
  async redo(){this.requireReady();if(this.cursor>=this.history.length-1)return;const cursor=this.cursor+1;this.invalidatePeople();return this.commitRecipe(this.history[cursor],this.history,cursor,{rollbackOnFailure:this.api instanceof SitesClient&&Boolean(this.data.recipe.parameters.extendedParameters.originalShadowManual||this.history[cursor].parameters.extendedParameters.originalShadowManual)});}
  async reset(){this.requireReady();const recipe=neutralRecipe();if(this.reference){recipe.parameters.extendedParameters.portrait=copy(this.reference);recipe.parameters.extendedParameters.portrait.targets.forEach(t=>t.value=0);recipe.parameters.extendedParameters.portrait.updatedAt=this.clock();}this.invalidatePeople();return this.commitRecipe(recipe);}
  async save(){
    this.requireReady();const token=this.operation,asset=copy(this.data.asset),recipe=copy(this.data.recipe),revision=this.data.revision;this.bind(recipe);this.publish({busy:'saving',error:null});
    try{if(this.api.assertPermission)await this.api.assertPermission(asset.id,'edit');this.check(token);if(!(isLocalAPI(this.api)&&hasLocalShadow(recipe))){await this.readBWEdgeRuntime(recipe,{revision});this.check(token);await this.readAddShadowRuntime(recipe,{mode:'draft',revision});}this.check(token);
      let restoreEvidence=null;
      const verifiedManual=await this.prepareLocalManual(recipe,{guard:()=>{
        if(this.data.revision!==revision||!equal(this.data.recipe,recipe))throw Error('LOCAL_MANUAL_SAVE_STALE');
      }});this.check(token);
      if(verifiedManual){
        const head=await this.api.getRecipe(asset.id);this.check(token);
        if((head?.revision??0)!==revision)throw Error('LOCAL_MANUAL_SAVE_HEAD_CHANGED');
        await verifiedManual.recheck();this.check(token);
      }
      if(this.api instanceof SitesClient&&recipe.parameters.extendedParameters.originalShadowManual){
        restoreEvidence=await this.prepareOriginalShadowHistoryPreview({asset,recipe,revision,render:false});this.check(token);
        await restoreEvidence.recheck();this.check(token);
      }
      if(recipe.parameters.extendedParameters.appleLocalBundle){
        await verifyAppleLocalBundle(recipe.parameters.extendedParameters.appleLocalBundle);this.check(token);
        if(this.data.revision!==revision||!equal(this.data.recipe,recipe))throw Error('APPLE_BUNDLE_SAVE_STALE');
        this.bind(recipe);
      }
      const saved=await this.api.saveRecipe(asset.id,revision,recipe);this.check(token);if(!equal(saved.body,recipe)||saved.revision!==revision+1)throw Error('SAVE_RESPONSE_MISMATCH');this.bind(saved.body);
      if(verifiedManual){await verifiedManual.recheck();this.check(token);
        const readback=await this.api.getRecipe(asset.id);this.check(token);
        if(readback?.revision!==saved.revision||!equal(readback.body,recipe))throw Error('LOCAL_MANUAL_SAVE_READBACK_MISMATCH');}
      if(this.api instanceof SitesClient){
        const savedSHA=await originalShadowRestoreSHA(saved.body);this.check(token);
        // The successful real CAS advances the base, not the selected historical
        // document. Each later use still verifies HEAD/history/identity afresh.
        originalShadowRestoreHints.set(this,(originalShadowRestoreHints.get(this)||[]).map(h=>
          h.assetId===asset.id&&h.assetSHA256===asset.sha256.toLowerCase()&&h.headRevision===revision?
            {...h,headRevision:saved.revision,headBodySHA256:savedSHA}:h));
      }
      await this.persist(this.history,this.cursor,{revision:saved.revision,dirty:false});this.check(token);
      if(recipe.parameters.extendedParameters.addShadowManual||
          recipe.parameters.extendedParameters.originalShadowManual)this.invalidatePreview();
      this.publish({revision:saved.revision,dirty:false,
        shadowVerification:recipe.parameters.extendedParameters.addShadowManual||
          recipe.parameters.extendedParameters.originalShadowManual?'unverified':null});
      if(!(isLocalAPI(this.api)&&hasLocalShadow(saved.body)))await this.readAddShadowRuntime(saved.body,{mode:'saved',revision:saved.revision});this.check(token);
      if(recipe.parameters.extendedParameters.addShadowManual||
          recipe.parameters.extendedParameters.originalShadowManual)
        await this.refreshPreview(token);
      this.check(token);this.publish({busy:null});this.log('WEB_SAVE','PASS_CONTRACT_ONLY','CAS saved revision');return saved;}
    catch(e){if(token===this.operation){this.publish({busy:null,error:e.message});this.log('WEB_SAVE','REJECT',e.message);}throw e;}
  }
  async batchApplyCurrentRecipe(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('BATCH_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)throw Error('SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||!targetIds.length||new Set(targetIds).size!==targetIds.length||targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))throw Error('BATCH_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'batch edit',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||typeof matches[0].sha256!=='string')throw Error('BATCH_TARGET_UNAVAILABLE');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('BATCH_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored===null?0:stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<0)throw Error('BATCH_TARGET_REVISION_INVALID');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchRecipe({api:this.api,source,targets});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_BATCH_EDIT',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',`Batch saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){if(token===this.operation){this.publish({busy:null,error:error.message});this.log('WEB_BATCH_EDIT','REJECT',error.message);}throw error;}
  }
  async batchSyncLevels(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('LEVELS_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)throw Error('LEVELS_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('LEVELS_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Levels sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||typeof matches[0].sha256!=='string')throw Error('LEVELS_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('LEVELS_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('LEVELS_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)throw Error('LEVELS_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchLevelsSync({api:this.api,source,targets,expectedSourceRecipe:copy(this.data.recipe),
        preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('LEVELS_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_LEVELS_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Levels saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){if(token===this.operation){this.publish({busy:null,error:error.message});this.log('WEB_LEVELS_SYNC','REJECT',error.message);}throw error;}
  }
  async batchSyncGlow(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('GLOW_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('GLOW_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('GLOW_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Glow sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||typeof matches[0].sha256!=='string')
          throw Error('GLOW_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('GLOW_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('GLOW_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)
          throw Error('GLOW_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchGlowSync({api:this.api,source,targets,
        expectedSourceRecipe:copy(this.data.recipe),preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('GLOW_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_GLOW_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Glow saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_GLOW_SYNC','REJECT',error.message);}
      throw error;
    }
  }
  async batchSyncVignette(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('VIGNETTE_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('VIGNETTE_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('VIGNETTE_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Vignette sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||matches[0].deletedAt!=null||typeof matches[0].sha256!=='string')
          throw Error('VIGNETTE_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('VIGNETTE_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('VIGNETTE_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)
          throw Error('VIGNETTE_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchVignetteSync({api:this.api,source,targets,
        expectedSourceRecipe:copy(this.data.recipe),preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('VIGNETTE_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_VIGNETTE_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Vignette saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_VIGNETTE_SYNC','REJECT',error.message);}
      throw error;
    }
  }
  async batchSyncSelectiveColor(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('SELECTIVE_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('SELECTIVE_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('SELECTIVE_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Selective Color sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||matches[0].deletedAt!=null||typeof matches[0].sha256!=='string')
          throw Error('SELECTIVE_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('SELECTIVE_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('SELECTIVE_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)
          throw Error('SELECTIVE_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchSelectiveColorSync({api:this.api,source,targets,
        expectedSourceRecipe:copy(this.data.recipe),preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('SELECTIVE_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_SELECTIVE_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Selective Color saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_SELECTIVE_SYNC','REJECT',error.message);}
      throw error;
    }
  }
  async batchSyncGrain(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('GRAIN_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('GRAIN_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('GRAIN_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Grain sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||matches[0].deletedAt!=null||typeof matches[0].sha256!=='string')
          throw Error('GRAIN_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('GRAIN_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('GRAIN_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)
          throw Error('GRAIN_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchGrainSync({api:this.api,source,targets,
        expectedSourceRecipe:copy(this.data.recipe),preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('GRAIN_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_GRAIN_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Grain saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_GRAIN_SYNC','REJECT',error.message);}
      throw error;
    }
  }
  async batchSyncCalibration(targetIds){
    this.requireReady();
    if(!this.batchAvailable)throw Error('CALIBRATION_SYNC_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('CALIBRATION_SYNC_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('CALIBRATION_SYNC_TWO_TARGETS_REQUIRED');
    const token=this.operation,source={id:this.data.asset.id,
      sha256:this.data.asset.sha256,revision:this.data.revision};
    this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Color Calibration sync',error:null});
    try{
      const listed=await this.api.listAssets();this.check(token);
      const targets=[];
      for(const id of targetIds){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||matches[0].deletedAt!=null||typeof matches[0].sha256!=='string')
          throw Error('CALIBRATION_SYNC_TARGET_UNAVAILABLE');
        const cached=await this.storage.get(id);this.check(token);
        if(cached?.dirty===true)throw Error('CALIBRATION_SYNC_TARGET_UNSAVED_DRAFT');
        const permission=await this.api.assertPermission(id,'edit');this.check(token);
        if(permission?.authorized!==true)throw Error('CALIBRATION_SYNC_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);this.check(token);
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body)
          throw Error('CALIBRATION_SYNC_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchCalibrationSync({api:this.api,source,targets,
        expectedSourceRecipe:copy(this.data.recipe),preflightTarget:async target=>{
          const cached=await this.storage.get(target.id);this.check(token);
          if(cached?.dirty===true)throw Error('CALIBRATION_SYNC_TARGET_UNSAVED_DRAFT');
        }});this.check(token);
      const updated=await this.api.listAssets();this.check(token);
      this.publish({assets:updated,busy:null});
      this.log('WEB_CALIBRATION_SYNC',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Color Calibration saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_CALIBRATION_SYNC','REJECT',error.message);}
      throw error;
    }
  }
  async batchMatchScene(targetIds,{referencePixels,amount=1,signal}={}){
    this.requireReady();
    if(!this.batchAvailable)throw Error('SCENE_MATCH_BATCH_PERMISSION_ADAPTER_REQUIRED');
    if(this.data.dirty||!Number.isSafeInteger(this.data.revision)||this.data.revision<1)
      throw Error('SCENE_MATCH_BATCH_SOURCE_SAVE_REQUIRED');
    if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
        new Set(targetIds).size!==targetIds.length||
        targetIds.some(id=>typeof id!=='string'||!id||id===this.data.asset.id))
      throw Error('SCENE_MATCH_BATCH_TWO_TARGETS_REQUIRED');
    assertPixels(referencePixels);
    if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('COLOR_MATCH_AMOUNT');
    const fixedReference={...referencePixels,data:referencePixels.data.slice()},ids=[...targetIds];
    const token=this.operation;
    const ensure=()=>{this.check(token);if(signal?.aborted)throw new DOMException('Color match cancelled','AbortError');};
    ensure();this.bind(this.data.recipe,this.data.asset);
    this.publish({busy:'Scene color match',error:null});
    try{
      const listed=await this.api.listAssets();ensure();
      const targets=[];
      for(const id of ids){
        const matches=listed.filter(asset=>asset?.id===id);
        if(matches.length!==1||matches[0].deletedAt!=null||typeof matches[0].sha256!=='string')
          throw Error('SCENE_MATCH_BATCH_TARGET_UNAVAILABLE');
        const permission=await this.api.assertPermission(id,'edit');ensure();
        if(permission?.authorized!==true)throw Error('SCENE_MATCH_BATCH_PERMISSION_DENIED');
        const stored=await this.api.getRecipe(id);ensure();
        const revision=stored?.revision??stored?.version;
        if(!Number.isSafeInteger(revision)||revision<1||!stored?.body||stored.branch===true)
          throw Error('SCENE_MATCH_BATCH_TARGET_SAVE_REQUIRED');
        targets.push({id,sha256:matches[0].sha256,revision});
      }
      const result=await applyBatchSceneMatch({api:this.api,targets,referencePixels:fixedReference,amount,signal,
        preflightTarget:async target=>{
          ensure();const cached=await this.storage.get(target.id);ensure();
          if(!cached?.proxy)throw Error('SCENE_MATCH_BATCH_CACHED_PROXY_REQUIRED');
          if(cached.dirty!==false)throw Error('SCENE_MATCH_BATCH_TARGET_UNSAVED_DRAFT');
          if(cached.asset?.id!==target.id||typeof cached.asset.sha256!=='string'||
              cached.asset.sha256.toLowerCase()!==target.sha256.toLowerCase()||cached.revision!==target.revision)
            throw Error('SCENE_MATCH_BATCH_CACHE_BINDING');
          assertPixels(cached.proxy);
          return {proxy:{...cached.proxy,data:cached.proxy.data.slice()}};
        }});
      // The helper returns verified/ambiguous outcomes even after cancellation.
      // Never discard those rows merely because the AbortSignal is now aborted.
      this.log('WEB_SCENE_MATCH_BATCH',result.status==='complete'?'PASS_CONTRACT_ONLY':'REJECT',
        `Scene color match saved ${result.saved}/${result.results.length}`,{batch_results:result.results});
      if(token===this.operation){
        try{const updated=await this.api.listAssets();this.check(token);this.publish({assets:updated,busy:null});}
        catch(error){if(token===this.operation)this.publish({busy:null,error:error.message});}
      }
      // Clean cached history is replaced by the latest saved Recipe on open.
      // Its old revision cannot pass this preflight again; retain original Proxy.
      return result;
    }catch(error){
      if(token===this.operation){this.publish({busy:null,error:error.message});
        this.log('WEB_SCENE_MATCH_BATCH','REJECT',error.message);}
      throw error;
    }
  }
  cancelExport(){this.exportController?.abort();}
  /**
   * Sequential, all-or-nothing Final for an explicitly ordered saved selection.
   * A preflight result never substitutes for the per-item checks immediately
   * before and after processing. No download or partial Blob escapes on error.
   */
  async exportBatchFinal({orderedIds,format='jpeg',quality,size={kind:'original'},resolution,outputSharpening,namingMethod,makeupConsents=[],localSavedShadowConsents=[]}={}){
    quality=quality===undefined?(format==='tiff'?0.95:0.92):quality;
    this.requireReady();
    if(this.exportController&&!this.exportController.signal.aborted)throw Error('EXPORT_BATCH_ALREADY_RUNNING');
    if(this.data.dirty)throw Error('SAVE_REQUIRED');
    if(!Array.isArray(orderedIds)||orderedIds.length<2)throw Error('EXPORT_BATCH_SELECTION_REQUIRED');
    if(orderedIds.length>MAX_BATCH_FINAL_ITEMS)throw Error('EXPORT_BATCH_TOO_LARGE');
    if(namingMethod!==undefined&&namingMethod!=='capture-date-original')
      throw Error('EXPORT_BATCH_NAMING_METHOD_UNSUPPORTED');
    if(!['jpeg','png','tiff'].includes(format)||!Number.isFinite(quality)||quality<0.01||quality>1||
        (format==='tiff'&&quality!==0.95))
      throw Error('EXPORT_SETTINGS_UNSUPPORTED');
    if(resolution!==undefined&&(!resolution||typeof resolution!=='object'||Array.isArray(resolution)||
        Reflect.ownKeys(resolution).some(key=>!['unit','value'].includes(key))||
        !['ppi','ppc'].includes(resolution.unit)||!Number.isSafeInteger(resolution.value)||
        resolution.value<1||resolution.value>65535))throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
    const fixedOutputSharpening=validateOutputSharpening(outputSharpening??{kind:'none'});
    const plan=planExportQueue({orderedIds,assets:this.data.assets});
    const fixedSize=copy(size),fixedResolution=resolution===undefined?undefined:copy(resolution);
    const api=this.api,localAPI=api instanceof BrowserLocalAPI&&Object.getPrototypeOf(api)===BrowserLocalAPI.prototype;
    const fixedMakeupConsents=copy(makeupConsents);
    if(!Array.isArray(fixedMakeupConsents)||fixedMakeupConsents.length>MAX_BATCH_FINAL_ITEMS||new Set(fixedMakeupConsents.map(row=>row?.assetId)).size!==fixedMakeupConsents.length||fixedMakeupConsents.some(row=>!row||Object.keys(row).sort().join(',')!=='assetId,confirmed,personIDs,revision,sha256'||row.confirmed!==true||!Array.isArray(row.personIDs)||!row.personIDs.length))throw Error('EXPORT_BATCH_MAKEUP_CONSENT_INVALID');
    if(!localAPI&&fixedMakeupConsents.length)throw Error('EXPORT_BATCH_MAKEUP_LOCAL_ONLY');
    const makeupReceipts=new Map();
    const fixedShadowConsents=copy(localSavedShadowConsents),shadowReceipts=new Map();
    if(!Array.isArray(fixedShadowConsents)||fixedShadowConsents.length>MAX_BATCH_FINAL_ITEMS||new Set(fixedShadowConsents.map(row=>row?.assetId)).size!==fixedShadowConsents.length||fixedShadowConsents.some(row=>!row||Object.keys(row).sort().join(',')!=='assetId,confirmed,entries,revision,sha256'||row.confirmed!==true||!Array.isArray(row.entries)||!row.entries.length)||!localAPI&&fixedShadowConsents.length)throw Error('EXPORT_BATCH_SHADOW_CONSENT_INVALID');
    const localScope=localAPI?{factory:api.factory,databaseName:api.databaseName,crypto:api.crypto}:null;
    const token=this.operation,currentAssetId=this.data.asset.id,currentRevision=this.data.revision;
    const currentRecipe=copy(this.data.recipe),controller=new AbortController(),signal=controller.signal;
    this.exportController=controller;
    const ensure=()=>{
      this.check(token);
      if(signal.aborted)throw Error('EXPORT_ABORTED');
      if(localAPI&&(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||api.factory!==localScope.factory||api.databaseName!==localScope.databaseName||api.crypto!==localScope.crypto))throw Error('EXPORT_BATCH_LOCAL_SCOPE_CHANGED');
      if(this.api!==api||this.data.asset?.id!==currentAssetId||this.data.dirty||
          this.data.revision!==currentRevision||!equal(this.data.recipe,currentRecipe))
        throw Error('EXPORT_BATCH_SELECTION_CHANGED');
    };
    const verifyFreshOriginal=async asset=>{
      const fresh=await this.api.getOriginal(asset.id,{signal});ensure();
      if(await checksum(fresh)!==asset.sha256)throw Error('RAW_CHECKSUM_CHANGED');
      ensure();
    };
    try{
      const makeupScopes=localAPI?await this.getBatchSavedMakeupConsentScope({orderedIds:plan.map(entry=>entry.assetId),signal}):[];ensure();
      const shadowScopes=localAPI?await this.getBatchSavedShadowConsentScope({orderedIds:plan.map(entry=>entry.assetId),signal}):[];ensure();
      if(shadowScopes.length!==fixedShadowConsents.length||shadowScopes.some(scope=>{const accepted=fixedShadowConsents.find(row=>row.assetId===scope.assetId);return !accepted||accepted.sha256!==scope.sha256||accepted.revision!==scope.revision||!equal(accepted.entries,scope.entries);}))throw Error('EXPORT_BATCH_SHADOW_CONSENT_REQUIRED');
      if(makeupScopes.length!==fixedMakeupConsents.length||makeupScopes.some(scope=>{const accepted=fixedMakeupConsents.find(row=>row.assetId===scope.assetId);return !accepted||accepted.sha256!==scope.sha256||accepted.revision!==scope.revision||!equal(accepted.personIDs,scope.personIDs);}))throw Error('EXPORT_BATCH_MAKEUP_CONSENT_REQUIRED');
      this.publish({exporting:true,error:null});
      const localStates=[];
      for(const entry of plan){
        const cached=await this.storage.get(entry.assetId);ensure();
        if(cached?.dirty===true)throw Error('EXPORT_BATCH_UNSAVED_DRAFT');
        if(entry.assetId===currentAssetId){
          localStates.push({asset:copy(this.data.asset),revision:currentRevision,
            recipe:copy(currentRecipe),dirty:false});
        }else if(cached){
          const item=cached.history?.[cached.cursor];
          localStates.push({asset:copy(cached.asset),revision:cached.revision,
            recipe:item===undefined?undefined:copy(item),dirty:cached.dirty});
        }else{
          // An Asset without a local draft is anchored to its current server
          // version; preflight independently retrieves and compares it again.
          const saved=await this.api.getRecipe(entry.assetId);ensure();
          if(!saved?.body)throw Error('EXPORT_BATCH_SAVED_RECIPE_REQUIRED');
          localStates.push({asset:copy(entry.asset),revision:saved.revision??saved.version,
            recipe:copy(saved.body),dirty:false});
        }
      }
      // A single session-wide person approval/reference cannot authorize
      // portrait processing for other selected Assets. Batch portrait needs
      // separate per-Asset trusted inventory and is deliberately unavailable.
      if(localStates.some(state=>portrait(state.recipe)&&!(localAPI&&hasLocalMakeup(state.recipe))))
        throw Error('EXPORT_BATCH_PERSON_REVIEW_REQUIRED');
      for(const state of localStates){if(!localAPI||!hasLocalMakeup(state.recipe))continue;
        const scope=makeupScopes.find(s=>s.assetId===state.asset.id);
        if(!scope||state.revision!==scope.revision||state.asset.sha256.toLowerCase()!==scope.sha256)throw Error('EXPORT_BATCH_MAKEUP_SCOPE_CHANGED');
        const receipt=createLocalSavedMakeupConsent();receipt.grant({api,asset:state.asset,personIDs:scope.personIDs,confirmed:true});makeupReceipts.set(state.asset.id,receipt);
      }
      for(const state of localStates){if(!localAPI||!hasLocalShadow(state.recipe))continue;
        const scope=shadowScopes.find(s=>s.assetId===state.asset.id);
        if(!scope||state.revision!==scope.revision||state.asset.sha256.toLowerCase()!==scope.sha256)throw Error('EXPORT_BATCH_SHADOW_SCOPE_CHANGED');
        const receipt=createLocalSavedShadowConsent();receipt.grant({api,asset:state.asset,entries:scope.entries,confirmed:true});shadowReceipts.set(state.asset.id,receipt);
      }
      // The manual masks are tied to one Asset and source geometry. A batch
      // requires independent verified runtime evidence per item; until that
      // path exists, return no partial output.
      if(!localAPI&&localStates.some(state=>state.recipe?.parameters?.extendedParameters?.bwEdgeManual))
        throw Error('EXPORT_BATCH_BW_EDGE_REVIEW_REQUIRED');
      if(!localAPI&&localStates.some(state=>state.recipe?.parameters?.extendedParameters?.addShadowManual))
        throw Error('EXPORT_BATCH_ADD_SHADOW_REVIEW_REQUIRED');
      if(!localAPI&&localStates.some(state=>state.recipe?.parameters?.extendedParameters?.handToneManual||state.recipe?.parameters?.extendedParameters?.clothingSpotManual))
        throw Error('EXPORT_BATCH_LOCAL_MANUAL_REVIEW_REQUIRED');
      if(!localAPI&&localStates.some(state=>state.recipe?.parameters?.extendedParameters?.webRawDenoise))
        throw Error('EXPORT_BATCH_RAW_DENOISE_RUNTIME_REQUIRED');
      for(const state of localStates){const depth=state.recipe?.parameters?.extendedParameters?.webDepthRange;if(depth&&(depth.assetID!==state.asset.id||depth.sourceSHA256!==state.asset.sha256.toLowerCase()))throw Error('DEPTH_IMAGE_BINDING');}
      await preflightExportBatch({api:this.api,plan,localStates});ensure();
      const captureDateBefore=namingMethod==='capture-date-original'?
        await readTrialDngBatchCaptureDateEvidence({api:this.api,plan,localStates,signal}):null;
      ensure();
      const byId=new Map(localStates.map(state=>[state.asset.id,state]));
      const items=[],specialRechecks=[];let totalBytes=0;
      for(const entry of plan){
        ensure();
        const asset=entry.asset,local=byId.get(entry.assetId),recipe=copy(local.recipe);
        const fixed={assetId:asset.id,body:recipe};
        assertBatchAssetListed(await this.api.listAssets(),asset);ensure();
        if(localAPI){await assertBrowserLocalBatchAsset(api,asset);ensure();}
        else{const permission=await this.api.assertPermission(asset.id,'export');ensure();
          if(permission?.authorized!==true)throw Error('EXPORT_BATCH_PERMISSION_DENIED');}
        assertBatchSavedRecipe(await this.api.getRecipe(asset.id),local.revision,fixed);ensure();
        const extra=recipe.parameters.extendedParameters;
        let renderInput,renderRecipe=recipe,prepared=null;
        if(localAPI&&(extra.handToneManual||extra.clothingSpotManual||extra.webRawDenoise||hasLocalMakeup(recipe)||hasLocalShadow(recipe))){
          const prepare=hasLocalShadow(recipe)?prepareBrowserLocalSavedShadow:hasLocalMakeup(recipe)?prepareBrowserLocalSavedMakeup:extra.webRawDenoise?prepareBrowserLocalRawDenoise:prepareBrowserLocalManualRuntime;
          prepared=await prepare({api,recipe,expectedAsset:asset,target:'source',guard:ensure,signal,
            assertConsent:scope=>{const receipt=(hasLocalShadow(recipe)?shadowReceipts:makeupReceipts).get(asset.id);if(!receipt)throw Error('EXPORT_BATCH_LOCAL_CONSENT_REQUIRED');return receipt.assert(scope);}});ensure();
          renderInput=prepared.pixels;renderRecipe=prepared.recipe;specialRechecks.push(prepared.recheck);
        }else{
          const original=await this.api.getOriginal(asset.id,{signal});ensure();
          if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_MISMATCH');ensure();
          const decoded=await this.processing.decodeRaw(original.slice(0),{mode:'final',signal});ensure();renderInput=decoded.pixels;
        }
        const localLUT=await this.readLocalLUTRuntime(renderRecipe,{signal});ensure();
        const pixels=await this.processing.render(renderInput,renderRecipe,{detections:[],signal,localLUT,...prepared?.options});ensure();
        const dimensions=planExportDimensions(pixels,fixedSize);let finalPixels=pixels;
        if(dimensions.width!==pixels.width||dimensions.height!==pixels.height){
          if(typeof this.processing.resizeForExport!=='function')throw Error('EXPORT_SIZE_PROCESSOR_UNAVAILABLE');
          finalPixels=await this.processing.resizeForExport(pixels,fixedSize,{signal});ensure();
          if(finalPixels.width!==dimensions.width||finalPixels.height!==dimensions.height)
            throw Error('EXPORT_SIZE_RESULT_MISMATCH');
        }
        if(fixedOutputSharpening.kind!=='none'){
          if(typeof this.processing.applyExportOutputSharpening!=='function')
            throw Error('OUTPUT_SHARPENING_PROCESSOR_UNAVAILABLE');
          finalPixels=await this.processing.applyExportOutputSharpening(finalPixels,fixedOutputSharpening,{signal});ensure();
          if(finalPixels.width!==dimensions.width||finalPixels.height!==dimensions.height)
            throw Error('OUTPUT_SHARPENING_RESULT_MISMATCH');
        }
        const blob=await this.processing.encode(finalPixels,{format,quality,
          settings:recipe.parameters.extendedParameters.export,
          ...(fixedResolution?{resolution:fixedResolution}:{}),signal});ensure();
        if(prepared){await prepared.recheck();ensure();}
        const expectedType=format==='jpeg'?'image/jpeg':format==='png'?'image/png':'image/tiff';
        if(!(blob instanceof Blob)||blob.type!==expectedType||!Number.isSafeInteger(blob.size)||blob.size<1)
          throw Error('EXPORT_BATCH_BLOB_INVALID');
        if(blob.size>MAX_BATCH_FINAL_BYTES-totalBytes)throw Error('EXPORT_BATCH_TOTAL_BYTES_EXCEEDED');
        totalBytes+=blob.size;
        // Hashing the earlier ArrayBuffer again cannot detect a remote object
        // replacement. Re-read this Asset after encoding before releasing it.
        await verifyFreshOriginal(asset);
        assertBatchAssetListed(await this.api.listAssets(),asset);ensure();
        assertBatchSavedRecipe(await this.api.getRecipe(asset.id),local.revision,fixed);ensure();
        if(localAPI){await assertBrowserLocalBatchAsset(api,asset);ensure();}
        else{const finalPermission=await this.api.assertPermission(asset.id,'export');ensure();
          if(finalPermission?.authorized!==true)throw Error('EXPORT_BATCH_PERMISSION_DENIED');}
        items.push(Object.freeze({assetId:asset.id,blob}));
      }
      // Recheck every selected Original after all outputs exist. A later item
      // may have taken long enough for an earlier remote object to change.
      // This is bounded validation, not an atomic storage transaction.
      for(const entry of plan){
        ensure();
        const asset=entry.asset,local=byId.get(entry.assetId),fixed={assetId:asset.id,body:local.recipe};
        await verifyFreshOriginal(asset);
        assertBatchAssetListed(await this.api.listAssets(),asset);ensure();
        assertBatchSavedRecipe(await this.api.getRecipe(asset.id),local.revision,fixed);ensure();
        if(localAPI){await assertBrowserLocalBatchAsset(api,asset);ensure();}
        else{const finalPermission=await this.api.assertPermission(asset.id,'export');ensure();
          if(finalPermission?.authorized!==true)throw Error('EXPORT_BATCH_PERMISSION_DENIED');}
      }
      for(const recheck of specialRechecks){await recheck();ensure();}
      const captureDateAfter=captureDateBefore?
        await readTrialDngBatchCaptureDateEvidence({api:this.api,plan,localStates,signal}):null;
      ensure();
      if(captureDateBefore&&JSON.stringify(captureDateBefore.entries)!==
          JSON.stringify(captureDateAfter?.entries))
        throw Error('EXPORT_BATCH_CAPTURE_DATE_EVIDENCE_CHANGED');
      this.log('WEB_BATCH_FINAL','PASS_PIPELINE_ONLY','Synthetic/real RAW visual QA remains separate',
        {batch_asset_ids:plan.map(item=>item.assetId),format,output_bytes:totalBytes});
      return Object.freeze({status:'complete',plan,items:Object.freeze(items),totalBytes,
        ...(captureDateAfter?{captureDateEvidence:captureDateAfter}:{})});
    }catch(error){
      if(token===this.operation){
        this.log('WEB_BATCH_FINAL','REJECT',error.message);
        this.publish({error:error.message});
      }
      throw error;
    }finally{
      for(const receipt of makeupReceipts.values())receipt.revoke();makeupReceipts.clear();
      for(const receipt of shadowReceipts.values())receipt.revoke();shadowReceipts.clear();
      if(token===this.operation)this.publish({exporting:false});
      if(this.exportController===controller)this.exportController=null;
    }
  }
  async exportFinal({format='jpeg',quality,size={kind:'original'},resolution,outputSharpening}={}){
    quality=quality===undefined?(format==='tiff'?0.95:0.92):quality;
    this.requireReady();if(this.data.dirty||!this.data.revision)throw Error('SAVE_REQUIRED');if(!['jpeg','png','tiff'].includes(format)||!Number.isFinite(quality)||quality<0.01||quality>1||(format==='tiff'&&quality!==0.95))throw Error('EXPORT_SETTINGS_UNSUPPORTED');
    if(resolution!==undefined&&(!resolution||typeof resolution!=='object'||Array.isArray(resolution)||Reflect.ownKeys(resolution).some(key=>!['unit','value'].includes(key))||!['ppi','ppc'].includes(resolution.unit)||!Number.isSafeInteger(resolution.value)||resolution.value<1||resolution.value>65535))throw Error('EXPORT_RESOLUTION_SETTINGS_INVALID');
    const fixedOutputSharpening=validateOutputSharpening(outputSharpening??{kind:'none'});
    const token=this.operation,asset=copy(this.data.asset),recipe=copy(this.data.recipe),revision=this.data.revision,reference=copy(this.reference);this.bind(recipe,asset);if(portrait(recipe)&&!hasLocalMakeup(recipe)&&!(isLocalAPI(this.api)&&hasLocalShadow(recipe)))this.requirePersonProcessing();this.exportController=new AbortController();const signal=this.exportController.signal;
    const ensure=()=>{this.check(token);if(signal.aborted)throw Error('EXPORT_ABORTED');if(this.data.revision!==revision||!equal(this.data.recipe,recipe))throw Error('EXPORT_RECIPE_CHANGED');};
    this.publish({exporting:true,error:null});
    try{
      if(this.api.assertPermission)await this.api.assertPermission(asset.id,'export');ensure();
      const stored=await this.api.getRecipe(asset.id);ensure();if(!stored||stored.revision!==revision||!equal(stored.body,recipe))throw Error('EXPORT_FIXED_RECIPE_MISMATCH');this.bind(stored.body,asset);
      const original=await this.api.getOriginal(asset.id,{signal});ensure();if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_MISMATCH');ensure();
      const decoded=await this.processing.decodeRaw(original.slice(0),{mode:'final',signal});ensure();let detections=[];
      const originalShadow=isLocalAPI(this.api)?null:await this.renderOriginalShadowFinal({asset,recipe,
        revision,decoded,signal});ensure();
      if(portrait(recipe)&&!hasLocalMakeup(recipe)&&!(isLocalAPI(this.api)&&hasLocalShadow(recipe))){if(!reference)throw Error('UNTRUSTED_PERSON_INVENTORY');validatePortraitContinuity(reference,portrait(recipe));detections=await this.processing.detectPeople(decoded.pixels,{signal});ensure();}
      const bwEdgeRuntime=isLocalAPI(this.api)&&hasLocalShadow(recipe)?null:await this.readBWEdgeRuntime(recipe,{action:'export',signal,revision});ensure();
      const shadow=isLocalAPI(this.api)&&hasLocalShadow(recipe)?null:await this.readAddShadowRuntime(recipe,{target:'source',mode:'saved',revision,signal});ensure();
      const verifiedManual=await this.prepareLocalManual(recipe,{target:'source',signal,guard:ensure});ensure();
      const finalRecipe=verifiedManual?.recipe??originalShadow?.recipe??recipe;
      const localLUT=await this.readLocalLUTRuntime(finalRecipe,{signal});ensure();
      const pixels=await this.processing.render(verifiedManual?.pixels??originalShadow?.pixels??decoded.pixels,
        finalRecipe,{detections,signal,localLUT,...verifiedManual?.options,
        ...(bwEdgeRuntime?{bwEdgeRuntime,bwEdgeTarget:'source'}:{}),
        ...(shadow?{addShadowRuntime:shadow.runtime,addShadowOriginal:shadow.original,addShadowTarget:'source'}:{})});ensure();
      const planned=planExportDimensions(pixels,size);let finalPixels=pixels;
      if(planned.width!==pixels.width||planned.height!==pixels.height){
        if(typeof this.processing.resizeForExport!=='function')throw Error('EXPORT_SIZE_PROCESSOR_UNAVAILABLE');
        finalPixels=await this.processing.resizeForExport(pixels,size,{signal});ensure();
        if(finalPixels.width!==planned.width||finalPixels.height!==planned.height)throw Error('EXPORT_SIZE_RESULT_MISMATCH');
      }
      if(fixedOutputSharpening.kind!=='none'){
        if(typeof this.processing.applyExportOutputSharpening!=='function')
          throw Error('OUTPUT_SHARPENING_PROCESSOR_UNAVAILABLE');
        finalPixels=await this.processing.applyExportOutputSharpening(finalPixels,fixedOutputSharpening,{signal});ensure();
        if(finalPixels.width!==planned.width||finalPixels.height!==planned.height)
          throw Error('OUTPUT_SHARPENING_RESULT_MISMATCH');
      }
      if(verifiedManual)await verifiedManual.recheck();ensure();
      const output=await this.processing.encode(finalPixels,{format,quality,settings:recipe.parameters.extendedParameters.export,...(resolution?{resolution:copy(resolution)}:{}),signal});ensure();
      if(verifiedManual)await verifiedManual.recheck();ensure();
      if(await checksum(original)!==asset.sha256)throw Error('RAW_CHECKSUM_CHANGED');ensure();
      const current=await this.api.getRecipe(asset.id);ensure();if(current?.revision!==revision||!equal(current.body,recipe))throw Error('EXPORT_FIXED_RECIPE_MISMATCH');
      if(!(isLocalAPI(this.api)&&hasLocalShadow(recipe)))await this.readAddShadowRuntime(recipe,{target:'source',mode:'saved',revision,signal});ensure();
      if(originalShadow){await this.readOriginalShadowFinalEvidence({asset,
        document:originalShadow.document,revision,recipe,
        identity:originalShadow.identity,signal});ensure();}
      if(this.api.assertPermission)await this.api.assertPermission(asset.id,'export');ensure();
      this.log('WEB_FINAL_EXPORT','PASS_PIPELINE_ONLY','Real RAW and visual QA must independently pass',{original_before_checksum:asset.sha256,original_after_checksum:asset.sha256,face_brightness:portrait(recipe)?.targets.map(t=>({id:t.id,value:t.value})),provenance:decoded.provenance,render_provenance:pixels.provenance,format,output_width:finalPixels.width,output_height:finalPixels.height,size_mode:planned.kind,...(resolution?{resolution:copy(resolution)}:{}),output_bytes:output.size});return output;
    }catch(e){if(token===this.operation){this.invalidatePeople();this.log('WEB_FINAL_EXPORT','REJECT',e.message);this.publish({error:e.message});}throw e;}finally{if(token===this.operation)this.publish({exporting:false});this.exportController=null;}
  }
}
