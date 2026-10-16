import {mountAuthor,mountPresetLibrary,mountAdminReview,mountTrialMembers} from './author-ui.mjs';
import {mountFeatureCatalog} from './feature-catalog.mjs';
import {createLocalAIBrowserStatusProvider,LOCAL_AI_MANUAL_TARGETS} from './local-ai-browser-status.mjs';
import {createLocalFaceAnalysisInputProvider} from './local-face-analysis-input.mjs';
import {createLocalBackdropPreviewHost} from './local-backdrop-preview-host.mjs';
import {buildExportFilename} from './export-naming.mjs';
import {exportTrialDngCaptureDateFinal} from './export-capture-date-final.mjs';
import {TrialClient} from './trial-client.mjs';
import {createExportOutputAdjustmentsForm} from './export-output-adjustments-ui.mjs';
import {createWorkspaceExportPresetEditorNotice,createWorkspaceExportPresetEditorHost} from './workspace-export-preset-editor-host.mjs';
import {createWorkspaceExportPresetPanel} from './workspace-export-preset-ui.mjs';
import {mountWorkspaceLUTSync} from './web-connected-lut-ui.mjs';
import {mountWorkspaceProxyPanel} from './workspace-proxy-ui.mjs';
import {mountLocalExportSettings,validateLocalExportSettings} from './local-export-settings-ui.mjs';
import {parseExportSizeSelection} from './export-size-selection.mjs';
export {parseExportSizeSelection} from './export-size-selection.mjs';
import {createCrossDeviceCompatReportUI} from './cross-device-compat-report-ui.mjs';
import {saveAppleLocalBundle} from './apple-local-bundle-store.mjs';
import {levelsGammaToMidpointPosition,levelsMidpointPositionToGamma} from './levels-control-mapping.mjs';
import {planBatchDownloadManifest} from './export-batch-manifest.mjs';
import {calculateHistogramToneDrag,HISTOGRAM_TONE_REGIONS} from './histogram-tone-drag.mjs';
import {mapPreviewClick} from './preview-coordinate.mjs';
import {mapAfterToLocalBrushPoint,mapAfterImagePointToLocalBrushPoint,mapLocalBrushPointToAfter} from './local-levels-brush-coordinate.mjs';
import {appendProjectedBrushOverlay,currentBrushDisplayGeometry} from './local-brush-projected-overlay.mjs';
import {mountCanvasExpandEdgeOverlay} from './canvas-expand-edge-overlay.mjs';
import {planCanvasExpansion,planCanvasExpansionGeometry} from './processing/canvas-expand.mjs';
import {projectCanvasExpansion,projectCanvasExpansionGeometry} from './processing/canvas-expand-projection.mjs';
import {mountBWEdgeManualUI} from './bw-edge-manual-ui.mjs';
import {mountAddShadowManualUI} from './add-shadow-manual-ui.mjs';
import {createOriginalShadowEditorBridge} from './original-shadow-editor-bridge.mjs';
import {sourceDimensions,MAX_PIXELS} from './processing/pure.mjs';
import {validateAddShadowManualDocument} from './processing/add-shadow-manual-contract.mjs';
import {buildPointCurveLUT} from './processing/point-curves.mjs';
import {mountWebConnectedCulling} from './web-connected-culling-ui.mjs';
import {createConnectedVersionsPanel} from './web-connected-versions-ui.mjs';
import {mountWebConnectedGrading} from './web-connected-grading-ui.mjs';
import {mountWebConnectedPointColor} from './web-connected-point-color-ui.mjs';
import {mountWebConnectedTonalBands} from './web-connected-tonal-bands-ui.mjs';
import {mountWebConnectedProfile} from './web-connected-profile-ui.mjs';
import {mountWebConnectedSceneBasic} from './web-connected-scene-basic-ui.mjs';
import {mountWebConnectedHSLPicker} from './web-connected-hsl-picker-ui.mjs';
import {mountWebConnectedImageCurve} from './web-connected-image-curve-ui.mjs';
import {mountWebConnectedCloudStatus} from './web-connected-cloud-status-ui.mjs';
import {mountWebConnectedIlluminant} from './web-connected-illuminant-ui.mjs';
import {mountWebConnectedWhiteBalance} from './web-connected-white-balance-ui.mjs';
import {mountWebConnectedLumaCurve} from './web-connected-luma-curve-ui.mjs';
import {mountWebConnectedLUT} from './web-connected-lut-ui.mjs';
import {mountWebConnectedColorMatch} from './web-connected-color-match-ui.mjs';
import {mountWebConnectedGeometry} from './web-connected-geometry-ui.mjs';
import {mountWebConnectedFreeCrop} from './web-connected-free-crop-ui.mjs';
import {mountWebConnectedXMP} from './web-connected-xmp-ui.mjs';
import {mountWebConnectedPortablePreset} from './web-connected-portable-preset-ui.mjs';
import {mountWebConnectedVersionComparison} from './web-connected-version-comparison.mjs';
import {mountWebConnectedManualMakeup} from './web-connected-manual-makeup-ui.mjs';
import {mountWebConnectedManualClone} from './web-connected-manual-clone-ui.mjs';
import {mountWebConnectedManualSkin} from './web-connected-manual-skin-ui.mjs';
import {mountWebConnectedManualRedEye} from './web-connected-manual-red-eye-ui.mjs';
import {mountWebConnectedManualHair} from './web-connected-manual-hair-ui.mjs';
import {mountWebManualTeeth} from './web-manual-teeth-ui.mjs';
import {mountWebManualClothing} from './web-manual-clothing-ui.mjs';
import {mountWebManualBackground} from './web-manual-background-ui.mjs';
import {mountWebManualSpot} from './web-manual-spot-ui.mjs';
import {mountWebRawDenoise} from './web-raw-denoise-ui.mjs';
import {mountWebDepthRange} from './web-depth-range-ui.mjs';
import {mountLocalSavedMakeupConsent} from './local-saved-makeup-consent-ui.mjs';
import {mountLocalSavedShadowConsent,checkSavedShadowEntries,describeSavedShadowEntries} from './local-saved-shadow-consent-ui.mjs';
import {mountWebManualLiquify} from './web-manual-liquify-ui.mjs';
import {mountWebLocalLUTMask} from './web-local-lut-mask-ui.mjs';
import {mountWebConnectedLens} from './web-connected-lens-ui.mjs';
import {mountWebConnectedManualEyes} from './web-connected-manual-eyes-ui.mjs';
import {mountWebConnectedColorRangeLevels} from './web-connected-color-range-levels-ui.mjs';
import {mountWebConnectedPersonalLook} from './local-personal-look-ui.mjs';
const EMPTY = {assets:[],asset:null,recipe:null,revision:0,dirty:false,busy:null,error:null,people:[],selectedPersonID:null,beforeURL:null,afterURL:null,clippingOverlayURL:null,shadowClippingOverlayURL:null,highlightClippingOverlayURL:null,glowMaskURL:null,histogram:null,levelsHistogram:null,canUndo:false,canRedo:false,evidence:null,status:'RAW を読み込んでください',exporting:false,personProcessingStatus:'PRIVACY_REVIEW_REQUIRED'};
const adjustments = [
  ...[['temperature','Temperature'],['tint','Tint']].map(([name,label])=>({key:`color.${name}`,id:`color-${name}`,group:'color',label,english:'POST-DECODE sRGB / NOT KELVIN RAW WB',min:-100,max:100,step:1,initial:0,unit:''})),
  {key:'detail.denoise',id:'detail-denoise',group:'detail',label:'Denoise',english:'POST-DECODE sRGB',min:-100,max:100,step:1,initial:0,unit:''},
  {key:'exposure',label:'露光量',english:'EXPOSURE',min:-4,max:4,step:0.1,initial:0,unit:' EV'},
  {key:'contrast',label:'コントラスト',english:'CONTRAST',min:0,max:2,step:0.05,initial:1,unit:''},
  {key:'saturation',label:'彩度',english:'SATURATION',min:0,max:2,step:0.05,initial:1,unit:''},
  ...[['amount','強さ',-100,100,0],['midpoint','中心への到達',0,100,50],['roundness','形',-100,100,0],['feather','境界の柔らかさ',0,100,50],['highlights','明部保護',0,100,0]]
    .map(([field,label,min,max,initial])=>({key:`vignette.${field}`,id:`vignette-${field}`,group:'vignette',label:`周辺光量 · ${label}`,english:'POST-CROP / 8-BIT sRGB',min,max,step:1,initial,unit:''})),
  ...[['left','左'],['right','右'],['top','上'],['bottom','下']].map(([edge,label])=>({key:`canvas.${edge}`,id:`canvas-${edge}`,group:'canvas-expand',label:`余白・${label}`,english:'MANUAL EXPAND / POST-CROP',min:0,max:200,step:1,initial:0,unit:'%'})),
  ...[
    ['highlights','ハイライト'],['shadows','シャドウ'],['whites','白レベル'],['blacks','黒レベル'],['vibrance','自然な彩度']
  ].map(([name,label])=>({key:`color.${name}`,id:`color-${name}`,group:'color',label,english:'POST-DECODE sRGB',min:-100,max:100,step:1,initial:0,unit:''})),
  ...['red','green','blue'].flatMap(primary=>[['hue','色相'],['saturation','彩度']]
    .map(([field,label])=>({key:`calibration.${primary}.${field}`,id:`calibration-${primary}-${field}`,group:'calibration',label:`${primary}原色 · ${label}`,english:'RGB PRIMARY / 8-BIT sRGB',min:-100,max:100,step:1,initial:0,unit:''}))),
  ...['shadows','midtones','highlights'].map(name=>({key:`curve.${name}`,id:`curve-${name}`,group:'curve',label:`Curve ${name}`,english:'PARAMETRIC / 8-BIT sRGB',min:-100,max:100,step:1,initial:0,unit:''})),
  ...[
    ['clarity','明瞭度',-100],['texture','テクスチャ',-100],['sharpness','シャープ量',0]
  ].map(([name,label,min])=>({key:`detail.${name}`,id:`detail-${name}`,group:'detail',label,english:'POST-DECODE sRGB',min,max:100,step:1,initial:0,unit:''})),
  ...[['sharpenRadius','シャープ · 半径',50],['sharpenDetail','シャープ · 細部',0],['sharpenMasking','シャープ · マスク',0]]
    .map(([field,label,initial])=>({key:`detail.${field}`,id:`detail-${field}`,group:'detail',label,english:'SUITE SHARPENING / 8-BIT sRGB',min:0,max:100,step:1,initial,unit:''})),
  {key:'detail.grain',id:'detail-grain',group:'detail',label:'粒子',english:'TONAL FILM GRAIN / POST-DECODE',min:0,max:100,step:1,initial:0,unit:''},
  ...[['shadows','暗部',100],['midtones','中間調',100],['highlights','明部',100],['size','粒の大きさ',0],['roughness','粗さ',0],['colorVariation','色の揺らぎ',0]]
    .map(([field,label,initial])=>({key:`grain.${field}`,id:`grain-${field}`,group:'grain',label:`粒子 · ${label}`,english:'TONAL FILM GRAIN / 8-BIT sRGB',min:0,max:100,step:1,initial,unit:''})),
  ...[['intensity','強さ',0,100,0],['radius','広がり',1,64,8],['threshold','明部しきい値',0,255,180]]
    .map(([field,label,min,max,initial])=>({key:`glow.${field}`,id:`glow-${field}`,group:'detail',label:`Glow · ${label}`,english:'HIGHLIGHT GLOW / POST-DECODE',min,max,step:1,initial,unit:''})),
  ...[['exposure','露光',-100,100],['diffusion','拡散',0,100],['tint','色味',-100,100]]
    .map(([field,label,min,max])=>({key:`glow.${field}`,id:`glow-${field}`,group:'glow-extended',label:`Glow · ${label}`,english:'EDITORIAL GLOW / 8-BIT sRGB',min,max,step:1,initial:0,unit:''})),
  ...['master','red','green','blue'].flatMap(channel=>[
    ['inputBlack','入力黒点',0,254,1,0],['inputWhite','入力白点',1,255,1,255],['gamma','中間調',0.1,10,0.05,1],
    ['outputBlack','出力黒点',0,255,1,0],['outputWhite','出力白点',0,255,1,255]
  ].map(([field,label,min,max,step,initial])=>({key:`levels.${channel}.${field}`,id:`levels-${channel}-${field}`,group:'levels',label:`${channel} · ${label}`,english:'RGB LEVELS / 8-BIT sRGB',min,max,step,initial,unit:''}))),
  ...['red','orange','yellow','green','aqua','blue','purple','magenta'].flatMap(color=>
    [['hue','色相'],['saturation','彩度'],['luminance','輝度相当']].map(([field,label])=>({key:`hsl.${color}.${field}`,id:`hsl-${color}-${field}`,group:'hsl',label:`${color} · ${label}`,english:'HSL / 8-BIT sRGB',min:-100,max:100,step:1,initial:0,unit:''})))
];
function adjustmentValue(params,key){
  const parts=key.split('.');if(parts.length===1)return params[parts[0]];
  if(parts[0]==='vignette')return params.extendedParameters?.postCropAdjustments?.vignette?.[parts[1]];
  if(parts[0]==='canvas')return (params.extendedParameters?.canvasExpand?.margins?.[parts[1]]??0)*100;
  const ext=params.extendedParameters?.postDecodeAdjustments;
  if(parts[0]==='color')return ext?.color?.[parts[1]];
  if(parts[0]==='calibration')return ext?.color?.calibration?.[parts[1]]?.[parts[2]];
  if(parts[0]==='curve')return ext?.color?.toneCurve?.[parts[1]];
  if(parts[0]==='levels')return ext?.color?.levels?.[parts[1]]?.[parts[2]];
  if(parts[0]==='glow')return ext?.color?.glow?.[parts[1]];
  if(parts[0]==='detail')return parts[1]==='grain'?ext?.detail?.grain?.amount:ext?.detail?.[parts[1]];
  if(parts[0]==='grain')return ext?.detail?.grain?.[parts[1]];
  if(parts[0]==='hsl')return ext?.color?.hsl?.[parts[1]]?.[parts[2]];
  return undefined;
}
const formatValue = (value,unit='') => `${Number(value).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1')}${unit}`;
function element(tag,className,text) {const node=document.createElement(tag); if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function shortID(id) {return String(id??'').slice(0,8);}
function assetName(asset) {return asset?.name??asset?.originalFilename??'未選択';}
function safeImageURL(value) {if(typeof value!=='string'||!value)return null;try {const url=new URL(value,location.href);return ['blob:','http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function actionButton(label,action,className='button') {const button=element('button',className,label);button.type='button';button.dataset.action=action;return button;}
export function adjacentPhotoID(assets,selectedID,direction){
  if(!Array.isArray(assets)||![-1,1].includes(direction))return null;
  const current=assets.findIndex(asset=>asset.id===selectedID),next=current<0?(direction===1?0:-1):current+direction;
  return assets[next]?.id??null;
}
export function canSwitchPhoto(state,{pending=false,blocked=false}={}){return !pending&&!blocked&&!state.busy&&!state.exporting&&!state.dirty;}
// UI availability is only a hint. The Trial bridge independently re-reads
// identity, both Original byte digests, Recipe revision and edit permission.
export function originalShadowEditorGate(session,state,{trialMode,backdropID,
  view='before',pending=false,blocked=false,otherBrushActive=false,
  geometryReady=false,imageReady=false}={}){
  if(trialMode!=='INVITED_LOCAL_TRIAL'||!(session?.api instanceof TrialClient))return 'ORIGINAL_SHADOW_TRIAL_REQUIRED';
  if(blocked)return 'ORIGINAL_SHADOW_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||
      state.dirty)return 'ORIGINAL_SHADOW_SAVED_TARGET_REQUIRED';
  if(!backdropID||backdropID===state.asset.id||
      !(state.assets??[]).some(asset=>asset.id===backdropID))
    return 'ORIGINAL_SHADOW_BACKDROP_SELECTION_REQUIRED';
  if(state.recipe?.parameters?.extendedParameters?.addShadowManual)
    return 'ORIGINAL_SHADOW_ADD_SHADOW_COMBINATION_UNSUPPORTED';
  if(pending||state.busy||state.exporting||otherBrushActive)
    return 'ORIGINAL_SHADOW_BUSY';
  if(view!=='after'||!geometryReady||!imageReady||
      state.shadowVerification==='unverified')
    return 'ORIGINAL_SHADOW_AFTER_REQUIRED';
  return null;
}
export function batchEditGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchApplyCurrentRecipe!=='function')return 'BATCH_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'BATCH_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)return 'BATCH_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'BATCH_BUSY';
  if(!Array.isArray(targetIds)||!targetIds.length||new Set(targetIds).size!==targetIds.length)return 'BATCH_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))return 'BATCH_TARGETS_INVALID';
  return null;
}
export function levelsSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncLevels!=='function')return 'LEVELS_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'LEVELS_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)return 'LEVELS_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'LEVELS_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||new Set(targetIds).size!==targetIds.length)
    return 'LEVELS_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))return 'LEVELS_SYNC_TARGETS_INVALID';
  return null;
}
export function glowSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncGlow!=='function')
    return 'GLOW_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'GLOW_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)
    return 'GLOW_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'GLOW_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
      new Set(targetIds).size!==targetIds.length)return 'GLOW_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))
    return 'GLOW_SYNC_TARGETS_INVALID';
  return null;
}
export function vignetteSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncVignette!=='function')
    return 'VIGNETTE_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'VIGNETTE_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)
    return 'VIGNETTE_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'VIGNETTE_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
      new Set(targetIds).size!==targetIds.length)return 'VIGNETTE_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))
    return 'VIGNETTE_SYNC_TARGETS_INVALID';
  return null;
}
export function selectiveColorSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncSelectiveColor!=='function')
    return 'SELECTIVE_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'SELECTIVE_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)
    return 'SELECTIVE_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'SELECTIVE_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
      new Set(targetIds).size!==targetIds.length)return 'SELECTIVE_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))
    return 'SELECTIVE_SYNC_TARGETS_INVALID';
  return null;
}
export function grainSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncGrain!=='function')
    return 'GRAIN_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'GRAIN_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)
    return 'GRAIN_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'GRAIN_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
      new Set(targetIds).size!==targetIds.length)return 'GRAIN_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))
    return 'GRAIN_SYNC_TARGETS_INVALID';
  return null;
}
export function calibrationSyncGate(session,state,targetIds,{pending=false,blocked=false}={}){
  if(session?.batchAvailable!==true||typeof session.batchSyncCalibration!=='function')
    return 'CALIBRATION_SYNC_AUTHENTICATED_STORAGE_REQUIRED';
  if(blocked)return 'CALIBRATION_SYNC_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)
    return 'CALIBRATION_SYNC_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'CALIBRATION_SYNC_BUSY';
  if(!Array.isArray(targetIds)||targetIds.length<2||targetIds.length>20||
      new Set(targetIds).size!==targetIds.length)return 'CALIBRATION_SYNC_TWO_TARGETS_REQUIRED';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(targetIds.some(id=>typeof id!=='string'||!available.has(id)||id===state.asset.id))
    return 'CALIBRATION_SYNC_TARGETS_INVALID';
  return null;
}
export function batchResultRows(result){
  if(!Array.isArray(result?.results)||!result.results.length)return null;
  const accepted=new Set(['saved','conflict','unverified','failed']);
  if(result.results.some(row=>typeof row?.assetId!=='string'||!accepted.has(row.status)||(row.status==='saved'&&(!Number.isSafeInteger(row.revision)||row.revision<1))))return null;
  return result.results.map(row=>({assetId:row.assetId,status:row.status,revision:row.revision,reason:row.reason}));
}
export function verifiedBatchRows(result,source,ids){
  const rows=batchResultRows(result),returnedIds=rows?.map(row=>row.assetId);
  if(!rows||result.source?.id!==source?.id||result.source?.revision!==source?.revision||returnedIds.length!==ids.length||new Set(returnedIds).size!==ids.length||!ids.every(id=>returnedIds.includes(id)))return null;
  return rows;
}
export function batchFinalGate(session,state,orderedIds,{pending=false,blocked=false}={}){
  if((session?.batchFinalAvailable??session?.batchAvailable)!==true||typeof session.exportBatchFinal!=='function'||typeof session.cancelExport!=='function')return 'BATCH_FINAL_STORAGE_REQUIRED';
  if(blocked)return 'BATCH_FINAL_ACCESS_EXPIRED';
  if(!state?.asset||!Number.isSafeInteger(state.revision)||state.revision<1||state.dirty)return 'BATCH_FINAL_SAVED_SOURCE_REQUIRED';
  if(pending||state.busy||state.exporting)return 'BATCH_FINAL_BUSY';
  if(!Array.isArray(orderedIds)||orderedIds.length<2)return 'BATCH_FINAL_SELECTION_REQUIRED';
  if(orderedIds.length>20)return 'BATCH_FINAL_TOO_LARGE';
  const available=new Set((state.assets??[]).map(asset=>asset.id));
  if(new Set(orderedIds).size!==orderedIds.length||orderedIds.some(id=>typeof id!=='string'||!available.has(id)))return 'BATCH_FINAL_SELECTION_INVALID';
  return null;
}
export function verifiedBatchFinalManifest(result,orderedIds,{format,method,customName,existingNames}={}){
  if(result?.status!=='complete'||!Array.isArray(orderedIds)||!Array.isArray(result.plan)||
      result.plan.length!==orderedIds.length||result.plan.some((item,index)=>item?.assetId!==orderedIds[index]))
    throw Error('EXPORT_BATCH_RESULT_INCOMPLETE');
  return planBatchDownloadManifest({plan:result.plan,items:result.items,format,method,
    customName,existingNames,...(method==='capture-date-original'?{
      captureDateEvidence:result.captureDateEvidence}:{})});
}
/** UI-only filename preflight. Final still rechecks the branded queue and Blobs. */
export function validateBatchFinalNames({assets,orderedIds,format,method,customName,existingNames=[]}={}){
  if(!Array.isArray(assets)||!Array.isArray(orderedIds)||orderedIds.length<2||orderedIds.length>20||
      new Set(orderedIds).size!==orderedIds.length)throw Error('EXPORT_BATCH_SELECTION_INVALID');
  if(existingNames==null||typeof existingNames==='string'||typeof existingNames[Symbol.iterator]!=='function')
    throw Error('EXPORT_EXISTING_NAMES_INVALID');
  const occupied=[...existingNames],names=[];
  for(let index=0;index<orderedIds.length;index++){
    const matches=assets.filter(asset=>asset?.id===orderedIds[index]);
    if(matches.length!==1||typeof matches[0].name!=='string'||!matches[0].name.trim())
      throw Error('EXPORT_BATCH_SELECTION_INVALID');
    const options={originalFilename:matches[0].name,format,method,sequence:index+1,
      total:orderedIds.length,existingNames:occupied};
    if(method==='original-custom')options.customText=customName;
    else options.customName=customName;
    // The date is read only by the fresh Trial gate after explicit Final.
    // Preflight checks the original stem; it cannot invent a capture date.
    if(method==='capture-date-original')options.method='original';
    const name=buildExportFilename(options);names.push(name);occupied.push(name);
  }
  return Object.freeze(names);
}
export function canUseHistogramControls(session,state,{pending=false,blocked=false}={}){
  return Boolean(state?.asset&&state.histogram?.includedPixels&&state.afterURL&&!state.busy&&!state.exporting&&!pending&&!blocked&&typeof session?.setAdjustment==='function');
}
export const LEVELS_CHANNELS=Object.freeze(['master','red','green','blue']);
export function canSampleLevels(session,state,{pending=false,blocked=false,view='after'}={}){
  return Boolean(state?.asset&&state.afterURL&&state.levelsHistogram?.includedPixels&&!state.busy&&!state.exporting&&!pending&&!blocked&&view!=='before'&&typeof session?.sampleLevelsAt==='function');
}
export function canPaintLocalLevels(session,state,{pending=false,blocked=false,view='after',geometryReady=false}={}){
  return Boolean(state?.asset&&Number.isSafeInteger(state.revision)&&state.revision>0&&state.afterURL&&state.beforeURL&&geometryReady&&!state.dirty&&!state.busy&&!state.exporting&&!pending&&!blocked&&view!=='before'&&typeof session?.setLocalLevels==='function');
}
export function localLevelsStrokeSettings(recipe,{points,mode,radius,hardness,channel,controls}={}){
  if(!Array.isArray(points)||points.length<1||points.length>4096||points.some(point=>![point?.x,point?.y].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1)))throw Error('LOCAL_BRUSH_POINTS_INVALID');
  if(!['add','erase'].includes(mode)||typeof radius!=='number'||!Number.isFinite(radius)||radius<=0||radius>.5||typeof hardness!=='number'||!Number.isFinite(hardness)||hardness<0||hardness>1)throw Error('LOCAL_BRUSH_SETTINGS_INVALID');
  if(!LEVELS_CHANNELS.includes(channel)||!controls||typeof controls!=='object')throw Error('LOCAL_BRUSH_LEVELS_INVALID');
  const limits={inputBlack:[0,255],inputWhite:[0,255],gamma:[.1,10],outputBlack:[0,255],outputWhite:[0,255]};
  if(Reflect.ownKeys(controls).length!==5||Reflect.ownKeys(controls).some(key=>!Object.hasOwn(limits,key)))throw Error('LOCAL_BRUSH_LEVELS_INVALID');
  for(const [key,[min,max]] of Object.entries(limits))if(typeof controls[key]!=='number'||!Number.isFinite(controls[key])||controls[key]<min||controls[key]>max||(key!=='gamma'&&!Number.isSafeInteger(controls[key])))throw Error('LOCAL_BRUSH_LEVELS_INVALID');
  if(controls.inputBlack>=controls.inputWhite||controls.outputBlack>controls.outputWhite)throw Error('LOCAL_BRUSH_LEVELS_INVALID');
  const saved=recipe?.parameters?.extendedParameters?.localLevels,strokes=structuredClone(saved?.strokes??[]),levels=structuredClone(saved?.levels??{});
  if(strokes.length>=64||strokes.reduce((count,stroke)=>count+stroke.points.length,points.length)>4096)throw Error('LOCAL_BRUSH_LIMIT');
  strokes.push({points:structuredClone(points),radius,hardness,mode});levels[channel]={...controls};return {strokes,levels};
}
export function levelsHistogramPath(bins){
  if(!bins||bins.length!==256)return '';
  const columns=[];let peak=0;
  for(let column=0;column<64;column++){let count=0;for(let index=column*4;index<column*4+4;index++){const value=bins[index];if(!Number.isSafeInteger(value)||value<0)return '';count+=value;}columns.push(count);peak=Math.max(peak,count);}
  if(!peak)return '';
  return `M${columns.map((count,index)=>`${index*4},${47-Math.round(43*Math.sqrt(count/peak))}`).join(' L')}`;
}
export function moveLevelsSamplePoint(point,key,{coarse=false}={}){
  if(!point||![point.x,point.y].every(Number.isFinite))throw Error('LEVELS_SAMPLE_POINT_INVALID');
  const step=coarse?0.1:0.01,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[key];
  if(!delta)throw Error('LEVELS_SAMPLE_KEY_INVALID');
  return {x:Math.max(0,Math.min(1,Math.round((point.x+delta[0])*1000)/1000)),y:Math.max(0,Math.min(1,Math.round((point.y+delta[1])*1000)/1000))};
}
export function pointCurveGraphCoordinate({rect,clientX,clientY,clamp=false}={}){
  if(!rect||![rect.left,rect.top,rect.width,rect.height,clientX,clientY].every(Number.isFinite)||rect.width<=0||rect.height<=0)throw Error('POINT_CURVE_GRAPH_RECT_INVALID');
  const side=Math.min(rect.width,rect.height),left=rect.left+(rect.width-side)/2,top=rect.top+(rect.height-side)/2;
  if(!clamp&&(clientX<left||clientX>left+side||clientY<top||clientY>top+side))return null;
  const x=Math.round(255*Math.max(0,Math.min(1,(clientX-left)/side)));
  const y=255-Math.round(255*Math.max(0,Math.min(1,(clientY-top)/side)));
  return {x,y};
}
// The SVG reserves 34 viewBox units around the 0..255 plot so endpoint
// handles retain a full touch target without spilling outside narrow panels.
export function pointCurveGraphPlotRect(svgRect){
  if(!svgRect||![svgRect.left,svgRect.top,svgRect.width,svgRect.height].every(Number.isFinite)||svgRect.width<=2||svgRect.height<=2)throw Error('POINT_CURVE_GRAPH_RECT_INVALID');
  const side=Math.min(svgRect.width-2,svgRect.height-2),unit=side/323;
  return {left:svgRect.left+1+34*unit,top:svgRect.top+1+34*unit,width:255*unit,height:255*unit};
}
export function pointCurveGraphHitIndex(points,rect,clientX,clientY){
  if(!Array.isArray(points)||points.length<2||!rect||![rect.left,rect.top,rect.width,rect.height,clientX,clientY].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
  const radius=34*Math.min(rect.width,rect.height)/255;
  let closest=null,distance=Infinity;
  for(let index=0;index<points.length;index++){
    const point=points[index];if(!point||![point.x,point.y].every(Number.isFinite))continue;
    const x=rect.left+point.x*rect.width/255,y=rect.top+(255-point.y)*rect.height/255;
    const delta=Math.hypot(clientX-x,clientY-y);
    if(delta<distance){closest=index;distance=delta;}
  }
  return distance<=radius&&closest>0&&closest<points.length-1?closest:null;
}
export function insertCurveGraphPoint(points,point){
  if(!Array.isArray(points)||points.length<2||points.length>=32||!point||![point.x,point.y].every(Number.isInteger)||point.x<=0||point.x>=255||point.y<0||point.y>255)return null;
  const at=points.findIndex(existing=>existing.x>point.x);
  if(at<1||points[at-1].x>=point.x)return null;
  const copy=points.map(existing=>({...existing}));copy.splice(at,0,{x:point.x,y:point.y});return {points:copy,index:at};
}
export function moveCurveGraphPoint(points,index,point){
  if(!Array.isArray(points)||!Number.isInteger(index)||index<0||index>=points.length||!point||![point.x,point.y].every(Number.isInteger))throw Error('POINT_CURVE_GRAPH_MOVE_INVALID');
  const copy=points.map(existing=>({...existing}));
  copy[index]={x:index===0?0:index===points.length-1?255:Math.max(points[index-1].x+1,Math.min(points[index+1].x-1,point.x)),y:Math.max(0,Math.min(255,point.y))};
  return copy;
}
export function removeCurveGraphPoint(points,index){
  if(!Array.isArray(points)||!Number.isInteger(index)||index<=0||index>=points.length-1)return null;
  const copy=points.map(existing=>({...existing}));copy.splice(index,1);return copy;
}
const frozenCurve=points=>Object.freeze(points.map(point=>Object.freeze(point)));
export const POINT_CURVE_CONTRAST_PRESETS=Object.freeze({
  linear:null,
  medium:frozenCurve([{x:0,y:0},{x:64,y:54},{x:128,y:128},{x:192,y:202},{x:255,y:255}]),
  strong:frozenCurve([{x:0,y:0},{x:64,y:42},{x:128,y:128},{x:192,y:214},{x:255,y:255}])
});
export function pointCurveContrastPoints(name){
  if(!Object.hasOwn(POINT_CURVE_CONTRAST_PRESETS,name))throw Error('POINT_CURVE_CONTRAST_PRESET_UNKNOWN');
  const points=POINT_CURVE_CONTRAST_PRESETS[name];return points?points.map(point=>({...point})):null;
}
const sameCurvePoints=(left,right)=>Array.isArray(left)&&left.length===right.length&&left.every((point,index)=>point?.x===right[index].x&&point?.y===right[index].y);
export function selectedPointCurveContrast(recipe){
  const master=recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.pointCurves?.master;
  if(!master||sameCurvePoints(master,[{x:0,y:0},{x:255,y:255}]))return 'linear';
  for(const name of ['medium','strong'])if(sameCurvePoints(master,POINT_CURVE_CONTRAST_PRESETS[name]))return name;
  return 'custom';
}
export function canApplyPointCurveContrast(session,state,{pending=false,blocked=false}={}){
  return Boolean(state?.asset&&!state.busy&&!state.exporting&&!pending&&!blocked&&typeof session?.setPointCurve==='function');
}
export function clippingOverlayVisible(state,{enabled=false,view='after',pending=false,blocked=false}={}){
  return Boolean(enabled&&view!=='before'&&state?.asset&&state.afterURL&&state.clippingOverlayURL&&!state.busy&&!state.exporting&&!pending&&!blocked);
}
export function clippingOverlayURLForSides(state,{shadow=false,highlight=false}={}){
  if(shadow&&highlight)return state?.clippingOverlayURL??null;
  if(shadow)return state?.shadowClippingOverlayURL??null;
  if(highlight)return state?.highlightClippingOverlayURL??null;
  return null;
}
export function nextClippingSides({shadow=false,highlight=false}={},side='both'){
  if(side==='shadow')return {shadow:!shadow,highlight};
  if(side==='highlight')return {shadow,highlight:!highlight};
  if(side==='both')return shadow&&highlight?{shadow:false,highlight:false}:{shadow:true,highlight:true};
  throw Error('INVALID_CLIPPING_SIDE');
}
export function clippingSidesForAsset(previousAssetID,nextAssetID,{shadow=false,highlight=false}={}){
  return previousAssetID===nextAssetID?{shadow,highlight}:{shadow:false,highlight:false};
}
export function clippingControlsDisabled({overlayReady=false,view='after',busy=false,blocked=false}={}){
  return !overlayReady||view==='before'||busy||blocked;
}
export function shouldToggleClippingWithJ(event,{disabled=false}={}){
  return Boolean(!disabled&&!event?.isComposing&&event?.key?.toLowerCase()==='j'&&
    !event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.repeat&&
    !event.target?.closest?.('input,textarea,select,[contenteditable="true"]'));
}
export function glowMaskVisible(state,{enabled=false,view='after',pending=false,blocked=false}={}){
  return Boolean(enabled&&view!=='before'&&state?.asset&&state.afterURL&&state.glowMaskURL&&!state.busy&&!state.exporting&&!pending&&!blocked);
}
export function glowModeFromRecipe(recipe){return recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.glow?.mode??'legacy';}
export function canEditGlowMode(session,state,{pending=false,blocked=false}={}){
  return Boolean(state?.asset&&!state.busy&&!state.exporting&&!pending&&!blocked&&typeof session?.setGlowMode==='function');
}
export function parseExportResolutionSelection(unit,value){
  if(unit==='none')return undefined;
  if(!['ppi','ppc'].includes(unit))throw Error('印刷密度の単位を選択してください。');
  const text=String(value).trim();if(!/^\d+$/.test(text))throw Error('PPI/PPCは1以上の整数で指定してください。');
  const number=Number(text);if(!Number.isSafeInteger(number)||number<1||number>65535)throw Error('PPI/PPCは1〜65535の整数で指定してください。');
  return {unit,value:number};
}
export function canStartConfiguredExport(state,{pending=false,blocked=false}={}){
  return Boolean(state?.asset&&!state.dirty&&Number.isSafeInteger(state.revision)&&state.revision>0&&!state.busy&&!state.exporting&&!pending&&!blocked);
}
/** Mirror the renderer's rotation -> normalized Crop -> integer margin projection. */
export function planCanvasDimensionReadout(proxy,parameters){
  const upright=sourceDimensions(proxy),rotation=parameters?.rotationDegrees??0;
  if(!Number.isSafeInteger(rotation)||rotation%90!==0)throw Error('CANVAS_READOUT_ROTATION_INVALID');
  const crop=parameters?.extendedParameters?.crop;
  const expansion=parameters?.extendedParameters?.canvasExpand;
  const frame=(source,geometryOnly=false)=>{
    const turned=((rotation/90)%4+4)%4,rotated={width:turned%2?source.height:source.width,
      height:turned%2?source.width:source.height};
    let postCrop=rotated;
    if(crop){
      const rect=crop.crop_rect;
      if(!rect||!['x','y','width','height'].every(key=>typeof rect[key]==='number'&&Number.isFinite(rect[key]))||
        rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||
        rect.x+rect.width>1+1e-9||rect.y+rect.height>1+1e-9)
        throw Error('CANVAS_READOUT_CROP_INVALID');
      const left=Math.floor(rect.x*rotated.width+1e-9),top=Math.floor(rect.y*rotated.height+1e-9);
      const width=Math.floor(rect.width*rotated.width+1e-9),height=Math.floor(rect.height*rotated.height+1e-9);
      if(width<1||height<1||left<0||top<0||left+width>rotated.width||top+height>rotated.height)
        throw Error('CANVAS_READOUT_CROP_INVALID');
      postCrop={width,height};
    }
    const output=expansion?(geometryOnly?
      planCanvasExpansionGeometry(postCrop,projectCanvasExpansionGeometry(postCrop,expansion)):
      planCanvasExpansion(postCrop,projectCanvasExpansion(postCrop,expansion))):postCrop;
    const unsupportedReasons=[...(output.unsupportedReasons??[])];
    // Even a small Crop cannot make the preceding full-resolution RAW decode
    // supported. This is a geometry estimate, never a Final readiness claim.
    if(geometryOnly&&source.width*source.height>MAX_PIXELS)
      unsupportedReasons.unshift('FINAL_FULL_SOURCE_LIMIT');
    let a=output.width,b=output.height;
    while(b)[a,b]=[b,a%b];
    return Object.freeze({postCrop:Object.freeze({...postCrop}),width:output.width,height:output.height,
      ratio:`${output.width/a}:${output.height/a}`,
      unsupportedReasons:Object.freeze([...new Set(unsupportedReasons)])});
  };
  return Object.freeze({preview:frame({width:proxy.width,height:proxy.height}),
    final:Object.hasOwn(proxy,'sourceWidth')&&Object.hasOwn(proxy,'sourceHeight')?frame(upright,true):null});
}
export function canvasDimensionReadoutText({asset,proxy,parameters,afterURL,imageSrc,
  imageComplete=false,naturalWidth=0,naturalHeight=0,view='after',busy=false,blocked=false}={}){
  if(blocked)return '利用権限がないため出力寸法を表示しません。';
  if(!asset||!proxy||!parameters||!afterURL||imageSrc!==afterURL||busy||!imageComplete||
    !Number.isSafeInteger(naturalWidth)||!Number.isSafeInteger(naturalHeight)||
    naturalWidth<1||naturalHeight<1)return '出力寸法を確認中です。';
  try{
    const plan=planCanvasDimensionReadout(proxy,parameters);
    if(naturalWidth!==plan.preview.width||naturalHeight!==plan.preview.height)
      return 'After画像の実寸と計算結果が一致しません。出力寸法を表示しません。';
    const margins=parameters.extendedParameters?.canvasExpand?.margins;
    const total=margins?Math.round(100*(margins.left+margins.right+margins.top+margins.bottom)):0;
    const label=view==='before'?'Before表示中 · 以下はAfter Recipeの寸法\n':
      view==='split'?'比較表示中 · 以下はAfter Recipeの寸法\n':'';
    const preview=`Crop後 ${plan.preview.postCrop.width}×${plan.preview.postCrop.height}px · 四辺余白合計 ${total}%\n`+
      `Preview実測 ${plan.preview.width}×${plan.preview.height}px · 比率 ${plan.preview.ratio}`;
    const reasonLabels={FINAL_FULL_SOURCE_LIMIT:'原寸RAWが24MPを超えるため現在のFinalデコードは未対応',
      CANVAS_SOURCE_DIMENSIONS_INVALID:'Canvas入力が実画素24MP上限を超過',
      CANVAS_SIZE_LIMIT:'Canvas出力が24MPまたは一辺16,384pxの上限を超過',
      CANVAS_MEMORY_LIMIT:'Canvas作業バッファ見積りが256MiBを超過'};
    const final=plan.final?`\n原寸基準の寸法計画（書き出し時の縮小前） ${plan.final.width}×${plan.final.height}px · 比率 ${plan.final.ratio}`+
      (plan.final.unsupportedReasons.length?`\n現在のFinalでは未対応: ${plan.final.unsupportedReasons.map(reason=>reasonLabels[reason]??reason).join(' / ')}`:
        '\n寸法計算のみです。Finalの生成可否・権限・RAW対応は別途確認します。'):
      '\n原寸基準の寸法は未確認です。';
    return label+preview+final;
  }catch{return '出力寸法を確認できません。';}
}
/** Let touch use native momentum; distinguish mouse/pen dragging from a photo tap. */
export function createFilmstripGesture(viewport,{clock=()=>Date.now(),threshold=8}={}){
  let pointer=null,suppressUntil=0;
  const release=()=>{if(pointer?.captured&&viewport.hasPointerCapture?.(pointer.id))viewport.releasePointerCapture(pointer.id);pointer=null;};
  return {
    pointerDown(event){if(event.isPrimary===false||event.pointerType!=='touch'&&event.button!==0)return;pointer={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,scrollLeft:viewport.scrollLeft,moved:false,captured:false};},
    pointerMove(event){if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(Math.abs(dx)>threshold||Math.abs(dy)>threshold)pointer.moved=true;
      if(!pointer.moved||pointer.type==='touch')return;
      if(!pointer.captured&&viewport.setPointerCapture){viewport.setPointerCapture(pointer.id);pointer.captured=true;}
      viewport.scrollLeft=pointer.scrollLeft-dx;event.preventDefault?.();},
    pointerEnd(event){if(!pointer||event.pointerId!==pointer.id)return;if(pointer.moved||Math.abs(viewport.scrollLeft-pointer.scrollLeft)>threshold)suppressUntil=clock()+350;release();},
    // Native iPad momentum keeps scrolling after pointerup; a tap during that motion must not open a photo.
    scroll(){suppressUntil=clock()+350;},
    wheel(event){if(event.deltaX){suppressUntil=clock()+200;return;}
      const factor=event.deltaMode===1?18:event.deltaMode===2?viewport.clientWidth:1;
      const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth),next=Math.max(0,Math.min(max,viewport.scrollLeft+event.deltaY*factor));
      if(next===viewport.scrollLeft)return;viewport.scrollLeft=next;suppressUntil=clock()+200;event.preventDefault?.();},
    suppressClick(){return clock()<suppressUntil;}
  };
}
/** Accept only the two explicitly supported same-origin identity routes. */
export function validatedSignOutURL(value,base=location.href){if(typeof value!=='string'||!value)throw Error('SIGNOUT_ROUTE_UNCONFIRMED');let url,current;try{current=new URL(base);url=new URL(value,current);}catch{throw Error('SIGNOUT_ROUTE_UNCONFIRMED');}if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||!['/signout-with-chatgpt','/auth/logout'].includes(url.pathname)||url.username||url.password||url.hash||url.searchParams.get('return_to')!=='/'||[...url.searchParams.keys()].length!==1)throw Error('SIGNOUT_ROUTE_UNCONFIRMED');return url.href;}
export function validatedSignInURL(value,base=location.href){if(typeof value!=='string'||!value)throw Error('SIGNIN_ROUTE_UNCONFIRMED');let url,current;try{current=new URL(base);url=new URL(value,current);}catch{throw Error('SIGNIN_ROUTE_UNCONFIRMED');}if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||!['/signin-with-chatgpt','/auth/complete'].includes(url.pathname)||url.username||url.password||url.hash||url.searchParams.get('return_to')!=='/'||[...url.searchParams.keys()].length!==1)throw Error('SIGNIN_ROUTE_UNCONFIRMED');return url.href;}

/** The session owns processing, validation, persistence and export. UI never invents an image or a person. */
export function mountEditor(session,{trialSession,authorAPI,workspaceExportContext,workspaceLUTHost,workspaceProxyContext}={}) {
  if(!session||typeof session.subscribe!=='function')throw Error('EDITOR_SESSION_NOT_CONNECTED');
  const root=document.querySelector('#app');if(!root)throw Error('EDITOR_ROOT_MISSING');
  root.classList.add('editorial-editor');
  const lifetime=new AbortController();let state={...EMPTY,...session.state};let pending=false;let localError='';let disposed=false;let mode='after';let showShadowClipping=false;let showHighlightClipping=false;let showHistogramClippingIndicators=true;let showHistogram=true;let showGlowMask=false;let levelsChannel='master';let levelsEndpoint=null;let levelsPoint={x:.5,y:.5};let levelsNotice='';let localBrushMode='off';let localBrushPointer=null;let localBrushKeyboardPoint={x:.5,y:.5};let localBrushNotice='';let localBrushRecipeKey=null;let downloadURL=null;let downloadAssetID=null;
  let batchFinalIDs=[],batchFinalDownloads=[],batchFinalRunning=false,batchFinalStatus='';
  let singleOutputRunning=false,batchOutputRunning=false;
  const completedDownloadNames=new Set();
  let previewAssetID=null;let previousBeforeURL=null;let previousAfterURL=null;let previousOverlayURL=null;let previousShadowOverlayURL=null;let previousHighlightOverlayURL=null;let previousGlowMaskURL=null;let blockedBeforeURL=null;let blockedAfterURL=null;let blockedOverlayURL=null;let blockedShadowOverlayURL=null;let blockedHighlightOverlayURL=null;let blockedGlowMaskURL=null;let stripSelectedID=null;let tonePointer=null;
  const emptyBWStrokes=()=>({subjectStrokes:[],correctionStrokes:[]});
  let bwDraft=emptyBWStrokes(),bwDraftDirty=false,bwManualActive=false,bwApplying=false,bwFailureBlocked=false,bwNotice='',bwRecipeKey=null,bwComponent=null;
  let shadowComponent=null,shadowMountKey=null,shadowActive=false,shadowApplying=false,shadowNotice='';
  let originalShadowBridge=null,originalShadowActive=false,
    originalShadowBackdropID='',originalShadowTargetID=null,
    originalShadowChecking=false,originalShadowNotice='',originalShadowGeneration=0;
  const requestedView=new URL(location.href).searchParams.get('view'),adminMode=requestedView==='admin',authorMode=requestedView==='author'||adminMode;
  const invited=['INVITED_LOCAL_TRIAL','SITES'].includes(trialSession?.mode)&&Boolean(trialSession.principal?.id&&trialSession.principal?.authorName);
  const invalidSession=trialSession?.sessionInvalid===true;let authorDispose=null;const additionalDisposers=[];
  const endedCodes=['TRIAL_EXPIRED','TRIAL_REVOKED','TRIAL_END_NOT_CONFIGURED'];let endedReason=null;const accessListeners=new Set();
  const access={reason(){if(!invited)return null;if(endedReason)return endedReason;if(trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt)return null;const deadline=Date.parse(trialSession.principal.trialEndsAt);return !Number.isFinite(deadline)?'TRIAL_END_NOT_CONFIGURED':Date.now()>=deadline?'TRIAL_EXPIRED':null;},end(reason){if(!endedCodes.includes(reason)||endedReason===reason)return;endedReason=reason;for(const fn of accessListeners)fn();if(!disposed)render(state);},subscribe(fn){accessListeners.add(fn);return()=>accessListeners.delete(fn);}};
  root.innerHTML=`
    <header class="app-header">
      <a class="wordmark" href="/" aria-label="SUITE ワークスペース">SUITE<span class="wordmark-dot">.</span></a>
      <span class="header-context">PHOTOGRAPH WORKSPACE <span class="header-divider">/</span> <span>${adminMode&&invited&&trialSession.principal.role==='admin'?'ADMIN REVIEW':authorMode?(invited?'AUTHOR DRAFTS':'AUTHOR PREVIEW'):'RAW EDITOR'}</span></span>
      <nav class="header-nav" aria-label="ワークスペース"><a href="/">トップへ</a><a href="/?view=editor" ${authorMode?'':'aria-current="page"'}>Editor</a><a href="/?view=author" ${requestedView==='author'?'aria-current="page"':''}>Author</a>${invited&&trialSession.principal.role==='admin'?`<a href="/?view=admin" ${adminMode?'aria-current="page"':''}>Admin</a>`:''}</nav>
      <span class="environment-tag" id="account-status"><span class="status-dot"></span>LOCAL QA · クラウド未接続</span><button class="quiet-button account-logout" id="trial-logout" type="button" hidden>ログアウト</button>
    </header>
    <section class="workspace-heading"><div><p class="eyebrow">${authorMode?'CRAFT A LOOK':'YOUR ORIGINAL. YOUR INTENTION.'}</p>${authorMode?'<h1>作者ワークスペース</h1>':''}</div><div class="heading-actions"><span class="save-indicator" id="save-indicator">写真未選択</span><button class="button primary" data-action="import">＋ RAW を読み込む</button></div></section>
    <p class="trial-scope-notice" id="trial-scope-notice" role="note">Web試用版です。実カメラRAWの画質、実人物補正、iPad実機操作は未検証です。一般販売版ではありません。</p>
    <input id="raw-file" type="file" accept=".raw,.dng,.cr2,.cr3,.nef,.nrw,.arw,.raf,.rw2,.orf,.pef,.srw" hidden>
    <div class="error-banner" id="error-banner" role="alert" hidden></div>
    <div class="trial-deadline" id="trial-deadline" hidden><span id="trial-deadline-value"></span><p id="trial-ended-notice" role="status" aria-live="polite" hidden></p></div>
    <div class="workspace-grid">
      <aside class="library-panel" aria-label="写真ライブラリ"><nav class="editor-section-nav" aria-label="編集セクション"><button type="button" data-editor-section="global-controls">Light</button><button type="button" data-editor-section="color-controls">Color</button><button type="button" data-editor-section="curve-section">Curve</button><button type="button" data-editor-section="hsl-section">HSL</button><button type="button" data-editor-section="detail-controls">Detail</button><button type="button" data-editor-section="person-section">Person</button><button type="button" data-editor-section="save-section">Save</button><button type="button" data-editor-section="export-section">Export</button></nav><div class="panel-title"><h2>ライブラリ</h2><span id="asset-count" class="count-label">0</span></div><p class="panel-caption">Original はそのまま。<br>編集は Recipe に。</p><div id="library-list" class="library-list"></div><div class="library-bottom"><span class="small-status">ORIGINALS</span><p>保存先は現在の利用モードで異なります。未接続のCloud同期を保存成功として表示しません。</p></div></aside>
      <main class="image-workspace" aria-label="写真プレビュー">
        <div class="image-toolbar"><div class="image-title"><span class="small-status">EDITING</span><span id="asset-name">未選択</span></div><div class="history-actions"><button class="icon-button" data-action="undo" aria-label="元に戻す" title="Undo">↶</button><button class="icon-button" data-action="redo" aria-label="やり直す" title="Redo">↷</button><button class="quiet-button" data-action="reset">リセット</button></div></div>
        <div class="photo-stage" id="photo-stage">
          <div class="empty-photo" id="empty-photo"><div class="empty-frame" aria-hidden="true"><span>＋</span></div><p class="eyebrow">BEGIN WITH A RAW ORIGINAL</p><h2>まだ、あなたの写真がありません。</h2><p>RAW を読み込み、実際の写真で編集を始めます。<br>サンプル写真や仮の人物は表示しません。</p><button class="button primary" data-action="import">RAW ファイルを選択</button><span class="empty-footnote">原本保持 · 非破壊 Recipe · ローカル検証版</span></div>
          <div id="image-view" class="image-view" hidden><figure class="photo-figure" id="before-figure"><img id="before-image" alt="補正前の実 RAW upright プレビュー"><figcaption>BEFORE <span>unedited upright</span></figcaption></figure><figure class="photo-figure" id="after-figure"><img id="after-image" alt="現在の Recipe による回転・Crop後のプレビュー"><img id="clipping-overlay" class="clipping-overlay" alt="" aria-hidden="true" hidden><img id="glow-mask-overlay" class="glow-mask-overlay" alt="" aria-hidden="true" hidden><figcaption>AFTER <span>rotation / crop applied</span></figcaption></figure></div>
          <div class="stage-busy" id="stage-busy" role="status" hidden><span class="spinner" aria-hidden="true"></span><span id="busy-label"></span></div>
        </div>
        <div class="preview-footer"><span id="preview-note">RAW を選択するとプレビューが表示されます</span><div class="segmented" role="group" aria-label="比較表示"><button data-view="before">Before</button><button data-view="split">比較</button><button data-view="after" aria-pressed="true">After</button></div><button id="clipping-toggle" class="quiet-button clipping-toggle" type="button" aria-pressed="false" aria-keyshortcuts="J">黒・白の警告表示 · J</button><button id="glow-mask-toggle" class="quiet-button glow-mask-toggle" type="button" aria-pressed="false">Glow Maskを表示</button></div>
        <div class="session-footer"><span class="status-dot" aria-hidden="true"></span><p id="session-status" role="status" aria-live="polite"></p><span id="revision-label">REV —</span></div>
        <details class="provenance-panel"><summary>処理の出典・安全確認 <span>PROVENANCE</span></summary><pre id="provenance">実写真の処理情報はまだありません。</pre><p>Web の数値・画面確認は Apple / Safari / iPad 実機・人物画素・実 RAW 合格の代わりではありません。</p></details>
      </main>
      <aside class="adjustment-panel" aria-label="編集調整">
        <div class="panel-title"><h2>調整</h2><span class="small-status">RECIPE</span></div>
        <section class="control-section"><div class="section-heading"><h3>写真全体</h3><span>GLOBAL</span></div><div id="global-controls"></div><div class="rotation-row"><span>回転 <output id="rotation-value">0°</output></span><button class="button compact" data-action="rotate">↻ 90°</button></div><label class="crop-control" for="crop-ratio">切り抜き比率<select id="crop-ratio"><option value="original">Original</option><option value="1:1">1:1</option><option value="3:2">3:2</option><option value="2:3">2:3</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="5:4">5:4</option><option value="4:5">4:5</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label><p class="crop-state">Recipe: <output id="crop-preset-value">original</output></p><p class="safety-note">固定9比率を回転後の画像中央で切り抜きます。Free/Custom矩形編集と印刷実寸resizeは未対応です。</p></section>
        <details class="control-section" id="canvas-expand-section"><summary>手動キャンバス拡張</summary><div id="canvas-expand-controls"></div><label for="canvas-background">余白の色<select id="canvas-background"><option value="white">白</option><option value="gray">グレー</option><option value="black">黒</option><option value="transparent">透明（PNG向け）</option></select></label><button class="button compact" id="canvas-expand-reset" type="button">拡張をリセット</button><p class="control-help canvas-expand-dimensions" id="canvas-expand-size" role="status" aria-live="polite">出力寸法はAfter画像の読み込み後に確認します。</p><p class="safety-note">切り抜き後の四辺に単色の余白を追加します。生成塗り足し・被写体の自動補完ではありません。出力上限を超える設定は拒否します。</p></details>
        <details class="control-section" id="vignette-section"><summary>切り抜き後の周辺光量</summary><div id="vignette-controls"></div><p class="safety-note">負の強さで四隅を暗く、正の強さで明るくします。形や境界、明部保護を調整できます。レンズ補正やRAW処理ではありません。</p></details>
        <section class="control-section"><div class="section-heading"><h3>明るさ・色</h3><span>8-BIT sRGB</span></div><div id="color-controls"></div><p class="safety-note">RAW段階のWBや失われたハイライト復元ではありません。現在の画素から局所トーンと彩度を調整します。</p></section>
        <details class="control-section" id="calibration-section"><summary>RGB原色の色校正</summary><div id="calibration-controls"></div><p class="safety-note">表示用8-bit sRGBの3原色の色相と彩度を調整します。カメラプロファイルやRAW段階のCalibrationとは異なります。</p></details>
        <section class="control-section"><div class="section-heading"><h3>質感・細部</h3><span>8-BIT sRGB</span></div><div id="detail-controls"></div><p class="safety-note">シャープの半径・細部・マスクは、シャープ量を上げると実画素へ作用します。明瞭度、テクスチャは別処理です。実RAW・大容量画像の画質とメモリは未検証です。</p></section>
        <details class="control-section" id="hsl-section" tabindex="-1"><summary>HSL · 色別調整</summary><div id="hsl-controls"></div><p class="safety-note">8色の色相・彩度・HSL明度。RAW色復元やカメラプロファイル調整ではありません。</p></details>
        <section class="control-section" id="person-section" tabindex="-1"><div class="section-heading"><h3>人物</h3><span>FACE BRIGHTNESS</span></div><p class="control-help">この写真を解析し、補正する人物を明示的に選択します。</p><p class="control-help" id="person-processing-notice" role="status">顔解析SDKの通信・同意確認待ちのため、実写真の人物処理は停止中</p><button class="button full" data-action="detect">顔の対象を確認</button><div class="person-reference" id="person-reference" hidden><div class="person-reference-image"><img id="person-reference-image" alt="人物選択用の未補正 upright 写真"><div id="person-reference-boxes"></div></div></div><div id="people-list" class="people-list"></div><p id="person-note" class="person-note">人物は未解析です。</p><label class="range-control face-control"><span class="range-label"><span>顔の明るさ <small>CUSTOM EV</small></span><output id="face-value">0 EV</output></span><input id="face-brightness" type="range" min="-4" max="4" step="0.1" value="0" aria-label="選択人物の顔の明るさ"><span class="range-scale"><span>−4</span><span>0</span><span>＋4 EV</span></span></label><p class="safety-note">変更後は安全再検証で選択が解除されます。再編集には「顔の対象を確認」→人物選択が必要です。顔 oval 限定で Apple と同等の解析ではありません。</p></section>
        <section class="control-section save-section" id="save-section" tabindex="-1"><div class="section-heading"><h3>Recipe を保存</h3><span>RECIPE v1</span></div><div class="button-pair"><button class="button primary" data-action="save">保存</button><button class="button" data-action="reload">再読込</button></div><p class="control-help" id="save-help">写真を読み込んでください。</p></section>
        <section class="control-section export-section" id="export-section" tabindex="-1"><div class="section-heading"><h3>最終書き出し</h3><span>ORIGINAL → FINAL</span></div><p class="control-help">保存済み Recipe を固定し、Original を再確認して書き出します。</p><div class="button-pair"><button class="button" data-action="export-jpeg">JPEG</button><button class="button" data-action="export-png">PNG</button><button class="button" data-action="export-tiff">TIFF 8-bit</button></div><button class="quiet-button full" data-action="cancel-export" hidden>書き出しを中断</button><a id="download-link" class="download-link" hidden>生成済み Final をダウンロード</a><p class="export-note" id="export-note">先に写真を保存してください。</p><p class="safety-note">JPEG / PNG / 非圧縮TIFF · 8-bit sRGB · 元の個人metadata除去。PPI/PPCは任意指定の密度metadataで、画素数や印刷実寸を変えません。TIFFの16-bit / 圧縮、Adobe RGB、印刷実寸resize は未対応です。</p></section>
      </aside>
    </div>
    <section class="author-preview" id="author-preview" ${authorMode?'':'hidden'}><div class="author-heading"><div><p class="eyebrow">AUTHORING · PREVIEW ONLY</p><h2>あなたの Look を、形に。</h2><p>入力と現在の Recipe のプレビューだけです。作者認証・下書き保存・提出は未接続です。</p></div><span class="blocked-tag">NOT_CONNECTED</span></div><div class="author-grid"><form id="author-form"><label>Look の名前<input name="lookName" maxlength="120" placeholder="例：Soft afternoon" autocomplete="off"></label><div class="author-field-pair"><label>作者名<input name="author" maxlength="120" placeholder="Your name" autocomplete="name"></label><label>Version<input name="version" maxlength="40" placeholder="例：1.0.0" autocomplete="off"></label></div><label>Draft メモ<textarea name="draft" maxlength="2000" rows="3" placeholder="この Look の意図や使い方"></textarea></label><div class="button-pair"><button class="button" type="button" disabled>下書きを保存 · 未接続</button><button class="button primary" type="submit" disabled>レビューへ提出 · 未接続</button></div><p class="control-help">入力はこの画面のメモリ内のみ。移動・再読込で失われます。招待・一般公開・採用はできません。</p></form><article class="look-card"><span class="small-status">LOOK PREVIEW / NOT SUBMITTED</span><h3 id="look-title">Untitled look</h3><p id="look-byline">作者未入力 · version 未入力</p><p id="look-description">Look のメモがここに表示されます。</p><div class="look-recipe"><span id="look-asset">写真未選択</span><span id="look-revision">Recipe 未保存</span></div><p class="safety-note">認証された作者ページや保存済み Preset ではありません。</p></article></div></section>
    <section class="filmstrip" aria-label="写真一覧"><div class="filmstrip-heading"><div><span class="small-status">PHOTO LIST</span><h2>写真一覧 <span id="filmstrip-position">0 / 0</span></h2></div><p id="filmstrip-help">写真を横にスクロールして選択できます。</p></div><div class="filmstrip-row"><button class="filmstrip-edge" type="button" data-strip-nav="previous" aria-label="前の写真" title="前の写真">‹</button><div class="filmstrip-track" id="filmstrip-track" role="group" aria-label="写真を横にスクロール"><div class="filmstrip-items" id="filmstrip-items"></div></div><button class="filmstrip-edge" type="button" data-strip-nav="next" aria-label="次の写真" title="次の写真">›</button></div></section>
    <footer class="app-footer"><span>SUITE / EARLY WEB VERIFICATION</span><span id="trial-footer">Author / Auth / Cloud / Billing 未接続 · Safari / iPad 実機 NOT_RUN</span></footer>`;
  const byID=id=>root.querySelector(`#${id}`);
  const backdropHost=createLocalBackdropPreviewHost({session,
    canUse:()=>!disposed&&!pending&&!access.reason(),subscribeAccess:listener=>access.subscribe(listener)});
  let appleRestoreIssued=null,appleRestoreCommitting=false;
  const appleRestoreListeners=new Set();
  const invalidateAppleRestore=()=>{appleRestoreIssued=null;for(const listener of appleRestoreListeners)listener();};
  const restoreReady=()=>!disposed&&!pending&&!access.reason()&&!session.state.busy&&
    !session.state.exporting&&!session.state.blocked&&!session.state.dirty&&!!session.state.asset&&!!session.proxy;
  const restoreBinding=()=>({assetID:session.state.asset?.id,sha256:session.state.asset?.sha256,
    revision:session.state.revision,recipeJSON:JSON.stringify(session.state.recipe)});
  const sameRestoreBinding=(a,b)=>a&&b&&['assetID','sha256','revision','recipeJSON'].every(key=>a[key]===b[key]);
  const stopRestoreState=session.subscribe(()=>{
    // commitRecipe publishes its own busy/recipe changes. Its operation token
    // guards those writes; a different photo must still cancel the transaction.
    if(appleRestoreCommitting&&appleRestoreIssued&&
      session.state.asset?.id===appleRestoreIssued.assetID&&
      session.state.asset?.sha256===appleRestoreIssued.sha256&&
      session.state.revision===appleRestoreIssued.revision)return;
    invalidateAppleRestore();
  });
  const stopRestoreAccess=access.subscribe(invalidateAppleRestore);
  const restoreHost={
    subscribeContext(listener){appleRestoreListeners.add(listener);return()=>appleRestoreListeners.delete(listener);},
    async authorize({binding,signal}){
      if(signal.aborted||!restoreReady())return {authorized:false};
      const fixed=restoreBinding();
      if(binding.assetID.toLowerCase()!==fixed.assetID.toLowerCase()||binding.originalSHA256!==fixed.sha256.toLowerCase())return {authorized:false};
      if(typeof session.api?.assertPermission!=='function')return {authorized:false};
      const permission=await session.api.assertPermission(fixed.assetID,'edit');
      if(signal.aborted||permission?.authorized!==true||!restoreReady()||!sameRestoreBinding(fixed,restoreBinding()))return {authorized:false};
      appleRestoreIssued={...fixed,token:crypto.randomUUID()};
      return {authorized:true,currentBinding:{...appleRestoreIssued}};
    },
    async commit({recipe,currentBinding,signal}){
      if(signal.aborted||!restoreReady()||!appleRestoreIssued||currentBinding.token!==appleRestoreIssued.token||
        !sameRestoreBinding(currentBinding,restoreBinding()))throw Error('APPLE_RESTORE_STALE');
      appleRestoreCommitting=true;
      try{
        await session.commitRecipe(recipe,undefined,undefined,{signal,rollbackOnFailure:true,rollbackFailureCode:'APPLE_RESTORE_ROLLBACK_FAILED'});
        return {applied:true,persisted:false};
      }finally{appleRestoreCommitting=false;appleRestoreIssued=null;}
    }
  };
  const persistentBackdropHost={...backdropHost,async applySavedBundle(candidate,{isCurrent}={}){
    if(typeof isCurrent!=='function'||!isCurrent()||!restoreReady())throw Error('APPLE_BUNDLE_STALE');
    const fixed=restoreBinding(),details={currentBinding:candidate.currentBinding,
      binding:candidate.binding??{id:candidate.recipe.assetID,sha256:candidate.recipe.originalSHA256},recipe:candidate.recipe,
      nativeParameters:candidate.nativeParameters,localWarp:candidate.localWarp,localRetouch:candidate.localRetouch};
    const ensure=async()=>{
      if(!isCurrent()||!restoreReady()||!sameRestoreBinding(fixed,restoreBinding())||await backdropHost.authorize(details)!==true)
        throw Error('APPLE_BUNDLE_STALE');
      if(typeof session.api?.assertPermission!=='function'||(await session.api.assertPermission(fixed.assetID,'edit'))?.authorized!==true)
        throw Error('APPLE_BUNDLE_PERMISSION');
      if(!isCurrent()||!restoreReady()||!sameRestoreBinding(fixed,restoreBinding()))throw Error('APPLE_BUNDLE_STALE');
    };
    await ensure();
    const {schemaVersion,originalJSON,manifest,backgroundBytes,maskBytes,bodyMaskBytes,sourceWidth,sourceHeight}=candidate;
    const reference=await saveAppleLocalBundle({schemaVersion,originalJSON,manifest,backgroundBytes,maskBytes,bodyMaskBytes,...(schemaVersion===2?{sourceWidth,sourceHeight}:{})});
    await ensure();
    // All awaits are complete before entering the existing transactional edit.
    // Immutable unused assets can remain after failure; originals are untouched.
    const recipe={schemaVersion:1,parameters:{exposure:0,contrast:1,saturation:1,rotationDegrees:0,
      processingOrder:[],extendedParameters:{appleLocalBundle:reference}}};
    await session.commitRecipe(recipe,undefined,undefined,{rollbackOnFailure:true,rollbackFailureCode:'APPLE_BUNDLE_ROLLBACK_FAILED'});
  }};
  const crossDeviceReport=createCrossDeviceCompatReportUI({document,backdropHost:persistentBackdropHost,restoreHost});
  additionalDisposers.push(()=>{invalidateAppleRestore();stopRestoreState();stopRestoreAccess();appleRestoreListeners.clear();});
  additionalDisposers.push(backdropHost.dispose);
  byID('save-section').after(crossDeviceReport.element);
  additionalDisposers.push(crossDeviceReport.destroy);
  const batchSection=element('section','control-section');batchSection.id='batch-edit-section';
  batchSection.innerHTML='<div class="section-heading"><h3>複数の写真に適用</h3><span>BATCH EDIT</span></div><p class="control-help" id="batch-source">コピー元の写真を保存してください。</p><fieldset id="batch-targets"><legend>適用先の写真を選択</legend><div id="batch-target-list"></div></fieldset><p class="control-help" id="batch-selection">適用先を選択してください。</p><button class="button" id="batch-apply" data-action="batch-apply" type="button">選択した写真に保存済みRecipeを適用</button><p class="control-help" id="batch-help">本人確認のある保存先でのみ利用可能</p><div id="batch-outcome" role="status" aria-live="polite"></div><ul id="batch-results" aria-label="一括適用の結果"></ul><div class="levels-sync-controls"><button class="button" id="levels-sync-apply" data-action="levels-sync" type="button">選択した2件以上にLevelsだけ同期</button><p class="control-help" id="levels-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="levels-sync-outcome" role="status" aria-live="polite"></div><ul id="levels-sync-results" aria-label="Levels同期の結果"></ul></div><p class="safety-note">Recipe全体の適用とLevelsのみ同期は別操作です。Levelsのみ同期は対象のほかの調整・人物設定を維持します。コピー元が中立なら対象のLevelsを解除します。Originalは変更しません。各写真の権限、版数、保存結果を個別に確認します。競合・未検証は成功に含めません。</p>';
  byID('save-section').after(batchSection);
  const glowSyncControls=element('div','glow-sync-controls');
  glowSyncControls.innerHTML='<button class="button" id="glow-sync-apply" data-action="glow-sync" type="button">選択した2件以上にGlowだけ同期</button><p class="control-help" id="glow-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="glow-sync-outcome" role="status" aria-live="polite"></div><ul id="glow-sync-results" aria-label="Glow同期の結果"></ul>';
  batchSection.querySelector('.levels-sync-controls').after(glowSyncControls);
  const vignetteSyncControls=element('div','vignette-sync-controls');
  vignetteSyncControls.innerHTML='<button class="button" id="vignette-sync-apply" data-action="vignette-sync" type="button">選択した2件以上に周辺光量だけ同期</button><p class="control-help" id="vignette-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="vignette-sync-outcome" role="status" aria-live="polite"></div><ul id="vignette-sync-results" aria-label="周辺光量同期の結果"></ul>';
  glowSyncControls.after(vignetteSyncControls);
  const selectiveSyncControls=element('div','selective-sync-controls');
  selectiveSyncControls.innerHTML='<button class="button" id="selective-sync-apply" data-action="selective-sync" type="button">選択した2件以上にSelective Colorだけ同期</button><p class="control-help" id="selective-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="selective-sync-outcome" role="status" aria-live="polite"></div><ul id="selective-sync-results" aria-label="Selective Color同期の結果"></ul>';
  vignetteSyncControls.after(selectiveSyncControls);
  const grainSyncControls=element('div','grain-sync-controls');
  grainSyncControls.innerHTML='<button class="button" id="grain-sync-apply" data-action="grain-sync" type="button">選択した2件以上にGrainだけ同期</button><p class="control-help" id="grain-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="grain-sync-outcome" role="status" aria-live="polite"></div><ul id="grain-sync-results" aria-label="Grain同期の結果"></ul>';
  selectiveSyncControls.after(grainSyncControls);
  const calibrationSyncControls=element('div','calibration-sync-controls');
  calibrationSyncControls.innerHTML='<button class="button" id="calibration-sync-apply" data-action="calibration-sync" type="button">選択した2件以上にRGB色校正だけ同期</button><p class="control-help" id="calibration-sync-help">保存済みのコピー元と2件以上の適用先が必要です。</p><div id="calibration-sync-outcome" role="status" aria-live="polite"></div><ul id="calibration-sync-results" aria-label="RGB色校正同期の結果"></ul>';
  grainSyncControls.after(calibrationSyncControls);
  batchSection.querySelector('.safety-note').textContent+=' Glowのみ同期は3モードと6調整だけを対象へ保存します。周辺光量のみ同期は切り抜き後の5調整だけを保存し、対象のほかの調整を維持します。';
  batchSection.querySelector('.safety-note').textContent+=' Grainのみ同期は7調整と再現用seedだけを対象へ保存します。対象のほかの調整や写真固有設定は維持します。';
  batchSection.querySelector('.safety-note').textContent+=' RGB色校正のみ同期は赤・緑・青の色相/彩度6値だけを保存し、対象のほかの調整を維持します。';
  let batchSourceKey=null,batchTargetIDs=new Set(),batchOutcome=null,levelsSyncOutcome=null,glowSyncOutcome=null,vignetteSyncOutcome=null,selectiveSyncOutcome=null,grainSyncOutcome=null,calibrationSyncOutcome=null,batchRunning=false;
  const batchFinalSection=element('section','control-section batch-final-section');batchFinalSection.id='batch-final-section';
   batchFinalSection.innerHTML='<div class="section-heading"><h3>複数写真のFinal</h3><span>BATCH FINAL</span></div><p class="control-help">写真を2〜20件、クリックした順に選びます。各写真の保存・権限は実行時に検証し、全件成功するまでダウンロードできません。</p><fieldset id="batch-final-choices"><legend>書き出し順を選択</legend><div id="batch-final-assets"></div></fieldset><p class="control-help" id="batch-final-selection">選択はありません。</p><label for="batch-final-format">形式<select id="batch-final-format"><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="tiff">TIFF 8-bit</option></select></label><label for="batch-final-naming">安全なファイル名<select id="batch-final-naming"><option value="original">元のファイル名</option><option value="custom-count">指定名 (1 of 件数)</option><option value="custom-sequence">指定名_001</option><option value="original-custom">元の名前＋指定文字</option><option value="capture-date-original">DNG撮影日＋元の名前（Exif offset必須）</option></select></label><label id="batch-final-custom-label" for="batch-final-custom" hidden>指定名<input id="batch-final-custom" type="text" maxlength="120" autocomplete="off" placeholder="例：SUITE selection"></label><p class="control-help">画素サイズ・PPI/PPCは上の単写真Export設定を共用します。TIFFは非圧縮8-bit sRGBのみで、16-bit/RAW精度ではありません。実RAW画質・Cloud・ZIPは未検証です。</p><div class="batch-final-actions"><button class="button" id="batch-final-start" type="button">選択順でFinalを生成</button><button class="quiet-button" id="batch-final-cancel" type="button" hidden>処理を中断</button><button class="quiet-button" id="batch-final-clear" type="button" hidden>生成済みリンクを破棄</button></div><p class="control-help" id="batch-final-status" role="status" aria-live="polite"></p><ol id="batch-final-downloads" aria-label="全件成功したFinalの個別ダウンロード"></ol><p class="safety-note">個別リンクを本人が押してダウンロードします。連続自動ダウンロードや一部成功の提供はしません。</p>';
  byID('export-section').after(batchFinalSection);
  const batchMakeupBox=element('div','batch-makeup-consent'),batchMakeupLoad=element('button','quiet-button','選択写真の保存済みメイク同意対象を取得'),batchMakeupRows=element('div'),batchMakeupHelp=element('p','control-help','旧手動メイクを含む写真は、対象一覧を取得して写真ごとに明示同意してください。単写真の同意は流用しません。');
  batchMakeupLoad.type='button';batchMakeupBox.append(batchMakeupHelp,batchMakeupLoad,batchMakeupRows);byID('batch-final-selection').after(batchMakeupBox);
  let batchMakeupScope=null,batchMakeupChecks=new Map(),batchMakeupKey=null,batchMakeupAPI=null,batchMakeupGeneration=0,batchMakeupLoading=false;
  const batchMakeupSnapshot=()=>JSON.stringify({ids:batchFinalIDs,asset:state.asset,revision:state.revision,recipe:state.recipe,dirty:state.dirty,
    assets:(state.assets??[]).map(a=>[a.id,a.sha256,a.size]),format:byID('batch-final-format').value,naming:byID('batch-final-naming').value,custom:byID('batch-final-custom').value});
  function invalidateBatchMakeup(){batchMakeupGeneration++;batchMakeupScope=null;batchMakeupChecks.clear();batchMakeupLoading=false;batchMakeupRows.replaceChildren();
    if(batchFinalRunning){batchQualityController?.abort();session.cancelExport?.();}}
  batchMakeupLoad.onclick=async()=>{
    if(disposed||batchMakeupLoading||batchFinalGate(session,state,batchFinalIDs,{pending,blocked:Boolean(access.reason())})||typeof session.getBatchSavedMakeupConsentScope!=='function')return;
    invalidateBatchMakeup();const generation=++batchMakeupGeneration,key=batchMakeupSnapshot(),api=session.api,ids=[...batchFinalIDs];batchMakeupLoading=true;renderBatchFinalControls();
    try{
      const rows=await session.getBatchSavedMakeupConsentScope({orderedIds:ids});
      if(disposed||generation!==batchMakeupGeneration||api!==session.api||key!==batchMakeupSnapshot()||access.reason())return;
      const seen=new Set();
      if(!Array.isArray(rows)||rows.length>ids.length)throw Error('BATCH_MAKEUP_SCOPE_INVALID');
      for(const row of rows){if(!row||!ids.includes(row.assetId)||seen.has(row.assetId)||typeof row.name!=='string'||!/^[a-f0-9]{64}$/i.test(row.sha256??'')||!Number.isSafeInteger(row.revision)||row.revision<1||!Array.isArray(row.personIDs)||!row.personIDs.length||row.personIDs.length>64||new Set(row.personIDs).size!==row.personIDs.length||row.personIDs.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))throw Error('BATCH_MAKEUP_SCOPE_INVALID');seen.add(row.assetId);}
      batchMakeupScope=structuredClone(rows);batchMakeupRows.replaceChildren();
      if(!rows.length)batchMakeupRows.append(element('p','control-help','この選択にはローカル同意対象の旧手動メイクはありません。他の出力条件は実行時に検証します。'));
      for(const row of rows){const label=element('label'),input=element('input');input.type='checkbox';batchMakeupChecks.set(row.assetId,input);
        label.append(input,element('span','',`${row.name} · SHA ${row.sha256.slice(0,12)} · 版 ${row.revision} · ${row.personIDs.length}人：写真と人物の編集許可を得ており、保存済み手動領域を今回この端末で再適用することに同意します。`));batchMakeupRows.append(label);
        input.onchange=()=>{if(batchFinalRunning||pending||state.busy||state.exporting||access.reason()){invalidateBatchMakeup();}renderBatchFinalControls();};}
    }catch(error){if(!disposed&&generation===batchMakeupGeneration){batchMakeupScope=null;batchMakeupRows.replaceChildren(element('p','control-help',`対象を取得できません：${error?.message??String(error)}`));}}
    finally{if(!disposed&&generation===batchMakeupGeneration){batchMakeupLoading=false;renderBatchFinalControls();}}
  };
  additionalDisposers.push(()=>invalidateBatchMakeup());
  const batchShadowBox=element('div','batch-shadow-consent'),batchShadowLoad=element('button','quiet-button','選択写真の保存済み影・白黒縁同意対象を取得'),batchShadowRows=element('div'),batchShadowHelp=element('p','control-help','旧手動影・白黒縁を含む写真は、対象一覧を取得して写真ごとに明示同意してください。単写真の同意は流用しません。');
  batchShadowLoad.type='button';batchShadowBox.append(batchShadowHelp,batchShadowLoad,batchShadowRows);byID('batch-final-selection').after(batchShadowBox);
  let batchShadowScope=null,batchShadowChecks=new Map(),batchShadowKey=null,batchShadowAPI=null,batchShadowGeneration=0,batchShadowLoading=false;
  const batchShadowSnapshot=()=>JSON.stringify({ids:batchFinalIDs,asset:state.asset,revision:state.revision,recipe:state.recipe,dirty:state.dirty,
    assets:(state.assets??[]).map(a=>[a.id,a.sha256,a.size]),format:byID('batch-final-format').value,naming:byID('batch-final-naming').value,custom:byID('batch-final-custom').value});
  function invalidateBatchShadow(){batchShadowGeneration++;batchShadowScope=null;batchShadowChecks.clear();batchShadowLoading=false;batchShadowRows.replaceChildren();
    if(batchFinalRunning){batchQualityController?.abort();session.cancelExport?.();}}
  batchShadowLoad.onclick=async()=>{
    if(disposed||batchShadowLoading||batchFinalGate(session,state,batchFinalIDs,{pending,blocked:Boolean(access.reason())})||typeof session.getBatchSavedShadowConsentScope!=='function')return;
    invalidateBatchShadow();const generation=++batchShadowGeneration,key=batchShadowSnapshot(),api=session.api,ids=[...batchFinalIDs];batchShadowLoading=true;renderBatchFinalControls();
    try{
      const rows=await session.getBatchSavedShadowConsentScope({orderedIds:ids});
      if(disposed||generation!==batchShadowGeneration||api!==session.api||key!==batchShadowSnapshot()||access.reason())return;
      const seen=new Set();
      if(!Array.isArray(rows)||rows.length>ids.length)throw Error('BATCH_SHADOW_SCOPE_INVALID');
      for(const row of rows){if(!row||!ids.includes(row.assetId)||seen.has(row.assetId)||typeof row.name!=='string'||!/^[a-f0-9]{64}$/i.test(row.sha256??'')||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('BATCH_SHADOW_SCOPE_INVALID');checkSavedShadowEntries(row.entries);seen.add(row.assetId);}

      batchShadowScope=structuredClone(rows);batchShadowRows.replaceChildren();
      if(!rows.length)batchShadowRows.append(element('p','control-help','この選択にはローカル同意対象の旧手動影・白黒縁はありません。他の出力条件は実行時に検証します。'));
      for(const row of rows){const label=element('label'),input=element('input');input.type='checkbox';batchShadowChecks.set(row.assetId,input);
        label.append(input,element('span','',`${row.name} · SHA ${row.sha256.slice(0,12)} · 版 ${row.revision} · ${describeSavedShadowEntries(row.entries)}：写真・人物・背景素材の編集と利用許可を得ており、保存済み影・白黒縁を今回この端末で再適用することに同意します。`));batchShadowRows.append(label);
        input.onchange=()=>{if(batchFinalRunning||pending||state.busy||state.exporting||access.reason()){invalidateBatchShadow();}renderBatchFinalControls();};}
    }catch(error){if(!disposed&&generation===batchShadowGeneration){batchShadowScope=null;batchShadowRows.replaceChildren(element('p','control-help',`対象を取得できません：${error?.message??String(error)}`));}}
    finally{if(!disposed&&generation===batchShadowGeneration){batchShadowLoading=false;renderBatchFinalControls();}}
  };
  additionalDisposers.push(()=>invalidateBatchShadow());
  const clearBatchFinalDownloads=()=>{for(const file of batchFinalDownloads)URL.revokeObjectURL(file.url);batchFinalDownloads=[];byID('batch-final-downloads').replaceChildren();};
  const selectiveSection=element('details','control-section');selectiveSection.id='selective-color-section';selectiveSection.tabIndex=-1;
  selectiveSection.innerHTML='<summary>Selective Color · 色域別CMYK</summary><label for="selective-range">調整する色域<select id="selective-range"><option value="reds">赤</option><option value="yellows">黄</option><option value="greens">緑</option><option value="cyans">シアン</option><option value="blues">青</option><option value="magentas">マゼンタ</option><option value="whites">白</option><option value="neutrals">中間色</option><option value="blacks">黒</option></select></label><label for="selective-method">演算方式<select id="selective-method"><option value="relative">Relative</option><option value="absolute">Absolute</option></select></label><div id="selective-controls"></div><p class="safety-note">選択した色域の表示用8-bit sRGB画素だけをCMYK方向に調整します。印刷CMYK変換やRAW原本の色処理ではありません。</p>';
  byID('calibration-section').after(selectiveSection);
  const grainSection=element('details','control-section');grainSection.id='grain-section';grainSection.tabIndex=-1;
  grainSection.innerHTML='<summary>粒子 · 階調と質感</summary><div id="grain-controls"></div><p class="safety-note">粒子の強さに加え、暗部・中間調・明部の配分、粒の大きさ、粗さ、色の揺らぎを調整します。表示用8-bit sRGBの独自処理です。</p>';
  byID('detail-controls').parentElement.after(grainSection);
  const glowSection=element('details','control-section');glowSection.id='glow-extended-section';glowSection.innerHTML='<summary>Glow · Editorialモード</summary><label for="glow-mode">仕上がり<select id="glow-mode"><option value="legacy">従来のGlow</option><option value="whiteMist">White Mist</option><option value="blackMist">Black Mist</option><option value="halation">Halation</option></select></label><div id="glow-extended-controls"></div><p class="control-help">従来モードでは追加3調整は使いません。変更時は保存済みRecipeに反映され、Undo/Redoできます。</p><p class="safety-note">Show Maskはプレビューの表示確認だけです。RAW原本、Before、Final書き出しには重ねません。</p>';
  grainSection.before(glowSection);
  const curveSection=element('section','control-section');curveSection.id='curve-section';curveSection.tabIndex=-1;
  curveSection.innerHTML='<div class="section-heading"><h3>Parametric Tone Curve</h3><span>8-BIT sRGB</span></div><div id="curve-controls"></div><p class="safety-note">8-bit sRGBの画素処理です。RGBポイントカーブを含みますが、RAW原本の階調は復元しません。</p>';
  byID('color-controls').parentElement.after(curveSection);
  const curveNav=root.querySelector('.editor-section-unavailable');
  if(curveNav){const button=element('button','', 'Curve');button.type='button';button.dataset.editorSection='curve-section';curveNav.replaceWith(button);}
  const levelsSection=element('details','control-section');levelsSection.id='levels-section';levelsSection.tabIndex=-1;
  levelsSection.innerHTML='<summary>RGB Levels · 黒点と中間調</summary><div class="levels-histograms" id="levels-histograms" role="group" aria-label="Levels ヒストグラムのチャンネル"></div><div class="levels-sampling"><div class="button-pair" role="group" aria-label="写真からレベルを採取"><button class="button compact" id="levels-pick-black" type="button" aria-pressed="false">黒点スポイト</button><button class="button compact" id="levels-pick-white" type="button" aria-pressed="false">白点スポイト</button></div><p id="levels-sample-status" class="control-help" role="status" aria-live="polite">チャンネルを選び、スポイトでAfter写真の画素を採取します。</p></div><div id="levels-controls"></div><p class="safety-note">MasterヒストグラムはRGB各色の件数の合算で、輝度ではありません。スポイトはAfterプレビューの8-bit画素のみを採取し、RAW原本とFinal画像に印を焼き込みません。</p>';
  curveSection.before(levelsSection);
  const localBrushSection=element('details','control-section local-brush-section');localBrushSection.id='local-brush-section';localBrushSection.tabIndex=-1;
  localBrushSection.innerHTML='<summary>Local Levels · 手動ブラシ</summary><p class="control-help">After写真の選んだ範囲だけにLevelsを適用します。人物の自動選択ではありません。</p><div class="local-brush-modes" role="group" aria-label="ブラシ操作"><button type="button" data-local-brush-mode="add" aria-pressed="false">追加</button><button type="button" data-local-brush-mode="erase" aria-pressed="false">消去</button><button type="button" data-local-brush-mode="off" aria-pressed="true">終了</button></div><div class="local-brush-geometry"><label>半径 <output id="local-brush-radius-value">8%</output><input id="local-brush-radius" type="range" min="1" max="50" step="1" value="8"></label><label>硬さ <output id="local-brush-hardness-value">70%</output><input id="local-brush-hardness" type="range" min="0" max="100" step="1" value="70"></label></div><label class="local-brush-channel-label">Levelsチャンネル<select id="local-brush-channel"><option value="master">RGB全体</option><option value="red">Red</option><option value="green">Green</option><option value="blue">Blue</option></select></label><div class="local-brush-levels"><label>入力黒点<input type="number" data-local-brush-level="inputBlack" min="0" max="254" step="1" value="0"></label><label>入力白点<input type="number" data-local-brush-level="inputWhite" min="1" max="255" step="1" value="255"></label><label>中間調<input type="number" data-local-brush-level="gamma" min="0.1" max="10" step="0.05" value="1.2"></label><label>出力黒点<input type="number" data-local-brush-level="outputBlack" min="0" max="255" step="1" value="0"></label><label>出力白点<input type="number" data-local-brush-level="outputWhite" min="0" max="255" step="1" value="255"></label></div><button class="quiet-button" id="local-brush-reset" type="button">この写真のLocal Levelsをリセット</button><p class="control-help" id="local-brush-status" role="status" aria-live="polite">保存済み写真を開くとブラシを使用できます。</p><p class="safety-note">写真上の線はブラシ中心の表示で、実マスク境界ではありません。Crop外の保存点は線だけ非表示になり、元画像側のstrokeは保持します。Recipeの正規化座標をProxyとFinalへ投影します。変更後は保存してから次のstrokeを追加してください。</p>';
  levelsSection.after(localBrushSection);
  const bwManualSection=element('details','control-section bw-edge-editor-section');bwManualSection.id='bw-edge-editor-section';bwManualSection.tabIndex=-1;
  bwManualSection.innerHTML='<summary>白黒境界 · 二層手動補正</summary><p class="control-help">After写真に被写体範囲と境界補正範囲を手動で描きます。自動検出ではありません。各層に追加strokeが必要です。</p><button class="quiet-button" id="bw-edge-mode" type="button" aria-pressed="false">ブラシを開始</button><div id="bw-edge-manual-root"></div><label class="bw-edge-confirm"><input id="bw-edge-confirm" type="checkbox">二層の範囲と対象写真を本人が確認しました</label><button class="button compact" id="bw-edge-apply" type="button">Recipeへ適用</button><p id="bw-edge-editor-status" class="control-help" role="status" aria-live="polite">認証済み試用・保存済み写真を確認中です。</p><p class="safety-note">下書きは保存されません。適用後もRecipeを保存してください。人物の自動検出・Cloudでの動作を保証しません。</p>';
  localBrushSection.after(bwManualSection);
  const shadowSection=element('details','control-section add-shadow-editor-section');shadowSection.id='add-shadow-editor-section';shadowSection.tabIndex=-1;
  shadowSection.innerHTML='<summary>Add Shadow · 背景と手動の影</summary><p class="control-help">本人が背景AssetとAfter上の被写体範囲を指定します。自動被写体検出や異なる寸法の背景整列は行いません。</p><button class="quiet-button" id="add-shadow-mode" type="button" aria-pressed="false">手動ブラシを開始</button><div id="add-shadow-manual-root"></div><p id="add-shadow-editor-status" class="control-help" role="status" aria-live="polite">認証済み試用・保存済み写真を確認中です。</p><p class="safety-note">Recipeへ適用後は保存が必要です。背景の置換は本人が明示確認した時だけ行います。実RAWとCloudは未検証です。</p>';
  bwManualSection.after(shadowSection);
  const originalShadowSection=element('details','control-section original-shadow-editor-section');originalShadowSection.id='original-shadow-editor-section';originalShadowSection.tabIndex=-1;
  originalShadowSection.innerHTML='<summary>Original Shadow · 二層の手動範囲</summary><p class="control-help">本人が対象と背景を選び、After写真に被写体と元の影を別々に描きます。同寸法の保存済みOriginalだけに対応し、自動抽出ではありません。</p><label for="original-shadow-backdrop">背景写真を明示選択<select id="original-shadow-backdrop"><option value="">背景写真を選択</option></select></label><button class="button compact" id="original-shadow-mode" type="button" aria-pressed="false">対象・背景を確認してブラシを開始</button><div id="original-shadow-manual-root"></div><p id="original-shadow-editor-status" class="control-help" role="status" aria-live="polite">保存済み写真、背景、本人権限を確認してください。</p><p class="safety-note">ブラシの下書きと保存済みRecipeは別です。背景のOriginal・両SHA・保存版・権限を再確認してから適用します。実RAW・AI自動抽出・Cloudは未検証です。</p>';
  shadowSection.after(originalShadowSection);
  const levelsHistogramRows=new Map();
  for(const [channel,label] of [['master','RGB全体'],['red','Red'],['green','Green'],['blue','Blue']]){
    const row=element('div',`levels-histogram-row levels-histogram-${channel}`);
    const button=element('button','levels-channel-button',label);button.type='button';button.dataset.levelsChannel=channel;button.setAttribute('aria-pressed',String(channel==='master'));
    const graph=document.createElementNS('http://www.w3.org/2000/svg','svg');graph.setAttribute('viewBox','0 0 255 48');graph.setAttribute('role','img');graph.setAttribute('aria-label',`${label}のLevelsヒストグラム`);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');graph.append(path);row.append(button,graph);byID('levels-histograms').append(row);levelsHistogramRows.set(channel,{button,graph,path});
  }
  const levelsReticle=element('span','levels-sample-reticle');levelsReticle.id='levels-sample-reticle';levelsReticle.setAttribute('aria-hidden','true');levelsReticle.hidden=true;byID('after-figure').append(levelsReticle);
  const localBrushOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');localBrushOverlay.id='local-brush-overlay';localBrushOverlay.setAttribute('aria-hidden','true');localBrushOverlay.setAttribute('hidden','');byID('after-figure').append(localBrushOverlay);
  const levelsNav=element('button','','Levels');levelsNav.type='button';levelsNav.dataset.editorSection='levels-section';root.querySelector('[data-editor-section="curve-section"]').before(levelsNav);
  if(invited){
    byID('account-status').textContent=`招待試用 · ${trialSession.principal.authorName} · 期限 ${trialSession.principal.trialEndsAt||'未設定'}`;byID('trial-logout').hidden=false;byID('trial-footer').textContent='INVITED LOCAL TRIAL · Cloud / Billing未接続 · 人物Privacy BLOCK · Safari / iPad実機NOT_RUN';
    if(authorMode){const authorSection=byID('author-preview');authorDispose=mountAuthor({container:authorSection,api:authorAPI,session,principal:trialSession.principal,mode:trialSession.mode,access});root.querySelector('.workspace-grid').before(authorSection);}
    byID('account-status').textContent=trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt?`Sites 管理者 · ${trialSession.principal.authorName}`:`${trialSession.mode==='SITES'?'Sites 招待試用':'ローカル招待試用'} · ${trialSession.principal.authorName} · 期限 ${trialSession.principal.trialEndsAt||'未設定'}`;
    byID('trial-footer').textContent=`${trialSession.mode} · Cloud / Billing未接続 · 人物Privacy BLOCK · Safari / iPad実機NOT_RUN`;
    root.querySelector('.library-bottom p').textContent='招待本人のOriginalとRecipeを試用サーバーへ保存します。本番Cloud Syncとは別です。';
    const presets=element('section','preset-library');root.querySelector('.provenance-panel').after(presets);additionalDisposers.push(mountPresetLibrary({container:presets,api:authorAPI,session,access}));
    if(authorMode&&trialSession.principal.role==='admin'){const review=element('section','admin-review');byID('author-preview').append(review);additionalDisposers.push(mountAdminReview({container:review,api:authorAPI,principal:trialSession.principal,access}));}
    if(authorMode&&trialSession.principal.role==='admin'){const members=element('section','trial-members');byID('author-preview').append(members);additionalDisposers.push(mountTrialMembers({container:members,api:authorAPI,principal:trialSession.principal,mode:trialSession.mode,access}));}
  }
  if(trialSession?.mode==='PUBLIC_BROWSER_LOCAL'){
    byID('account-status').textContent='ブラウザ内ローカル · Cloud未接続';
    byID('trial-scope-notice').textContent='Web試用版：実カメラRAWの画質・iPad実機は未検証、実写真の人物解析は停止中です。写真と編集はこのブラウザ内だけに保存されます。Cloud保存・同期・プリセット提出は利用できません。共有端末では利用者別の保護はできません。';
    byID('trial-footer').textContent='この端末のみ · Cloud提出/同期未接続 · Safari / iPad実機NOT_RUN';
    root.querySelector('.library-bottom p').textContent='このブラウザ内の写真一覧です。別端末同期とCloud提出は未接続です。';
    if(trialSession.signInURL){try{const link=element('a','cloud-sign-in','本人確認 · 所有者/招待済みのみ');link.href=validatedSignInURL(trialSession.signInURL);root.querySelector('.header-nav').append(link);}catch{/* No unverified sign-in link. Local editing remains available. */}}
  }
  if(invalidSession){byID('trial-logout').hidden=false;byID('account-status').textContent='前のセッションは無効です';}
  const strip=byID('filmstrip-track'),stripGesture=createFilmstripGesture(strip);
  async function commitLevelsAdjustment(config,value,target){
    const restoreFocus=document.activeElement===target;
    await run('setAdjustment',config.key,value);
    // A preview render briefly disables controls. Restore keyboard focus only
    // when it was on this control and the user did not move to another target.
    if(restoreFocus&&!disposed&&target.isConnected&&!target.disabled&&
      (document.activeElement===document.body||document.activeElement===document.documentElement))
      target.focus({preventScroll:true});
  }
  for(const config of adjustments){
    const id=config.id||config.key;
    if(config.group==='levels'){
      const gamma=config.key.endsWith('.gamma'),control=element('div','range-control levels-direct-control');
      const initialPosition=gamma?levelsGammaToMidpointPosition(config.initial):config.initial;
      const rangeMin=gamma?0:config.min,rangeMax=gamma?100:config.max;
      const rangeStep=gamma?1:config.step;
      control.innerHTML=`<label class="levels-slider-label" for="${id}"><span class="range-label"><span>${config.label}<small>${config.english}</small></span><output id="${id}-value">${config.initial}</output></span><input type="range" id="${id}" min="${rangeMin}" max="${rangeMax}" step="${rangeStep}" value="${initialPosition}" aria-label="${config.label}・スライダー"><span class="range-scale"><span>${gamma?'明るい':config.min}</span><span>${gamma?'中立':config.initial}</span><span>${gamma?'暗い':config.max}</span></span></label><label class="levels-number-label" for="${id}-number"><span>数値入力</span><input type="number" id="${id}-number" min="${config.min}" max="${config.max}" step="${gamma?'any':config.step}" value="${config.initial}" inputmode="decimal" aria-label="${config.label}・数値入力"></label>`;
      byID('levels-controls').append(control);
      const slider=byID(id),number=byID(`${id}-number`),output=byID(`${id}-value`);
      slider.addEventListener('input',()=>{const value=gamma?levelsMidpointPositionToGamma(Number(slider.value)):Number(slider.value);number.value=String(value);output.textContent=formatValue(value);},{signal:lifetime.signal});
      slider.addEventListener('change',()=>commitLevelsAdjustment(config,gamma?levelsMidpointPositionToGamma(Number(slider.value)):Number(slider.value),slider),{signal:lifetime.signal});
      number.addEventListener('input',()=>{if(!number.value||!number.validity.valid)return;const value=number.valueAsNumber;if(!Number.isFinite(value))return;slider.value=String(gamma?levelsGammaToMidpointPosition(value):value);output.textContent=formatValue(value);},{signal:lifetime.signal});
      number.addEventListener('change',()=>{if(!number.value||!number.validity.valid||!Number.isFinite(number.valueAsNumber)){localError='Levelsの数値を範囲内で入力してください。';render(session.state??state);return;}void commitLevelsAdjustment(config,number.valueAsNumber,number);},{signal:lifetime.signal});
      continue;
    }
    const label=element('label','range-control');label.innerHTML=`<span class="range-label"><span>${config.label}<small>${config.english}</small></span><output id="${id}-value">${config.initial}</output></span><input type="range" id="${id}" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.initial}" aria-label="${config.label}"><span class="range-scale"><span>${config.min}</span><span>${config.initial}</span><span>${config.max}</span></span>`;byID(config.group?`${config.group}-controls`:'global-controls').append(label);
    byID(id).addEventListener('input',event=>{byID(`${id}-value`).textContent=formatValue(event.target.value,config.unit);},{signal:lifetime.signal});
    byID(id).addEventListener('change',event=>run('setAdjustment',config.key,Number(event.target.value)),{signal:lifetime.signal});
  }
  byID('glow-mode').addEventListener('change',event=>{if(event.target.disabled){render(state);return;}run('setGlowMode',event.target.value);},{signal:lifetime.signal});
  const selectiveRange=byID('selective-range'),selectiveMethod=byID('selective-method');
  for(const [field,label] of [['cyan','Cyan'],['magenta','Magenta'],['yellow','Yellow'],['black','Black']]){
    const id=`selective-${field}`,control=element('label','range-control');
    control.innerHTML=`<span class="range-label"><span>${label}<small>SELECTIVE COLOR / 8-BIT sRGB</small></span><output id="${id}-value">0</output></span><input type="range" id="${id}" min="-100" max="100" step="1" value="0" aria-label="${label}"><span class="range-scale"><span>-100</span><span>0</span><span>100</span></span>`;
    byID('selective-controls').append(control);
    byID(id).addEventListener('input',event=>{byID(`${id}-value`).textContent=String(event.target.value);},{signal:lifetime.signal});
    byID(id).addEventListener('change',event=>run('setAdjustment',`selective.${selectiveRange.value}.${field}`,Number(event.target.value)),{signal:lifetime.signal});
  }
  function renderSelectiveColor(loaded,busy){
    const selective=state.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.selectiveColor;
    selectiveMethod.value=selective?.method??'relative';
    selectiveMethod.disabled=!loaded||busy||typeof session.setSelectiveColorMethod!=='function';
    selectiveRange.disabled=!loaded||busy;
    for(const field of ['cyan','magenta','yellow','black']){
      const value=selective?.ranges?.[selectiveRange.value]?.[field]??0,id=`selective-${field}`;
      byID(id).value=String(value);byID(`${id}-value`).textContent=String(value);
      byID(id).disabled=!loaded||busy||typeof session.setAdjustment!=='function';
    }
  }
  selectiveRange.addEventListener('change',()=>renderSelectiveColor(Boolean(state.asset),Boolean(state.busy||pending||state.exporting)),{signal:lifetime.signal});
  selectiveMethod.addEventListener('change',()=>run('setSelectiveColorMethod',selectiveMethod.value),{signal:lifetime.signal});
  const canvasColors={white:[255,255,255,255],gray:[128,128,128,255],black:[0,0,0,255],transparent:[0,0,0,0]};
  const canvasBackground=byID('canvas-background'),canvasReset=byID('canvas-expand-reset'),canvasSize=byID('canvas-expand-size');
  function updateCanvasSize(){
    const image=byID('after-image');
    const copy=canvasDimensionReadoutText({asset:state.asset,proxy:session.proxy,
      parameters:state.recipe?.parameters,afterURL:safeImageURL(state.afterURL),imageSrc:image.getAttribute('src'),
      imageComplete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
      view:mode,busy:Boolean(state.busy||state.exporting||pending),blocked:Boolean(access.reason())});
    if(canvasSize.textContent!==copy)canvasSize.textContent=copy;
  }
  byID('after-image').addEventListener('load',updateCanvasSize,{signal:lifetime.signal});
  canvasBackground.addEventListener('change',()=>{
    const margins=state.recipe?.parameters?.extendedParameters?.canvasExpand?.margins??{left:0,right:0,top:0,bottom:0};
    run('setCanvasExpansion',{margins,background:canvasColors[canvasBackground.value]});
  },{signal:lifetime.signal});
  canvasReset.addEventListener('click',()=>run('setCanvasExpansion',null),{signal:lifetime.signal});
  let canvasEdgeSnapshot='',canvasEdgeSerial=0;
  function canvasEdgeContext(){
    const after=byID('after-image'),parameters=state.recipe?.parameters;
    const ready=Boolean(state.asset&&session.proxy&&parameters&&state.afterURL&&
      after.getAttribute('src')===safeImageURL(state.afterURL)&&
      !after.hidden&&!byID('after-figure').hidden&&mode==='after'&&
      typeof session.setCanvasExpansion==='function'&&!access.reason()&&
      localBrushMode==='off'&&!bwManualActive&&!shadowActive&&!levelsEndpoint);
    if(!ready)return {ready:false};
    const margins={left:0,right:0,top:0,bottom:0,
      ...parameters.extendedParameters?.canvasExpand?.margins};
    const rotationDegrees=parameters.rotationDegrees??0;
    const crop=parameters.extendedParameters?.crop;
    const previewUpright={width:session.proxy.width,height:session.proxy.height};
    const fullUpright=sourceDimensions(session.proxy);
    const turned=Math.abs(rotationDegrees/90)%2===1;
    const rotatedWidth=turned?previewUpright.height:previewUpright.width;
    const rotatedHeight=turned?previewUpright.width:previewUpright.height;
    const postCropWidth=crop?Math.floor(rotatedWidth*crop.crop_rect.width+1e-9):rotatedWidth;
    const postCropHeight=crop?Math.floor(rotatedHeight*crop.crop_rect.height+1e-9):rotatedHeight;
    const snapshot=JSON.stringify([state.asset.id,state.asset.sha256,state.revision,
      state.afterURL,mode,rotationDegrees,crop,margins]);
    if(snapshot!==canvasEdgeSnapshot){canvasEdgeSnapshot=snapshot;canvasEdgeSerial++;}
    return {ready:true,busy:Boolean(pending||state.busy||state.exporting),view:mode,
      selectionKey:`canvas-edge-${canvasEdgeSerial}`,margins,rotationDegrees,crop,
      preview:{upright:previewUpright,postCropWidth,postCropHeight},
      full:{upright:fullUpright}};
  }
  const canvasEdgeOverlay=mountCanvasExpandEdgeOverlay({
    afterImage:byID('after-image'),getContext:canvasEdgeContext,enabled:true,
    onCandidate:async(candidate,{signal})=>{
      const current=canvasEdgeContext();
      if(signal.aborted||!current.ready||current.busy||
        !['left','right','top','bottom'].includes(candidate.edge)||
        ['left','right','top','bottom'].some(edge=>edge!==candidate.edge&&
          current.margins[edge]!==candidate.margins[edge]))
        throw Error('CANVAS_EDGE_SELECTION_CHANGED');
      const background=state.recipe.parameters.extendedParameters?.canvasExpand?.background??canvasColors.white;
      if(!await run('setCanvasExpansion',{margins:candidate.margins,background},{signal}))
        throw Error('CANVAS_EDGE_COMMIT_REJECTED');
    }
  });
  const pointCurveEditor=element('div','point-curve-editor');
  pointCurveEditor.innerHTML='<h4>RGB / チャンネル ポイントカーブ</h4><label for="point-curve-channel">調整するチャンネル<select id="point-curve-channel"><option value="master">RGB全体</option><option value="red">赤</option><option value="green">緑</option><option value="blue">青</option></select></label><svg id="point-curve-preview" viewBox="-34 -34 323 323" role="group" aria-label="ポイントカーブ。空白をクリックして点を追加。点をドラッグして移動。キーボードではグラフを選び矢印で位置を移動しEnterで追加。" tabindex="-1"><path class="point-curve-grid" d="M0 127.5H255M127.5 0V255"/><polyline id="point-curve-line" fill="none"/><g id="point-curve-handles"></g><circle id="point-curve-cursor" cx="128" cy="127" r="5" aria-hidden="true"/></svg><p class="control-help" id="point-curve-graph-status" role="status" aria-live="polite">写真を読み込むとグラフ上の点を操作できます。</p><div id="point-curve-points"></div><div class="point-curve-actions"><button type="button" data-curve-action="add">点を追加</button><button type="button" data-curve-action="reset">このチャンネルをリセット</button></div><label for="point-curve-refine-saturation">カーブの彩度変化を調整 <output id="point-curve-refine-saturation-value">100</output><input id="point-curve-refine-saturation" type="range" min="0" max="100" step="1" value="100" disabled></label><p class="control-help">カーブがある時のみ使用可能。0は元の色差を保ち、100はカーブ本来の色を使います。SUITE独自の処理で、RAWセンサー値は変更しません。</p>';
  const pointCurvePresets=element('div','point-curve-presets');
  pointCurvePresets.innerHTML='<p class="point-curve-preset-heading">MASTER CONTRAST · SUITE</p><div class="point-curve-preset-buttons" role="group" aria-label="Master曲線のコントラスト"><button type="button" data-curve-preset="linear" aria-pressed="true">Linear</button><button type="button" data-curve-preset="medium" aria-pressed="false">Medium</button><button type="button" data-curve-preset="strong" aria-pressed="false">Strong</button></div><p class="control-help" id="point-curve-preset-status" role="status" aria-live="polite"></p><p class="safety-note">SUITE独自のMaster曲線です。Red／Green／Blue個別の点は維持します。Adobe等と画素一致するPresetではありません。</p>';
  pointCurveEditor.querySelector('label').before(pointCurvePresets);
  byID('curve-controls').append(pointCurveEditor);
  const pointCurveChannel=byID('point-curve-channel'),pointCurveRows=byID('point-curve-points'),pointCurveLine=byID('point-curve-line'),pointCurveSVG=byID('point-curve-preview'),pointCurveHandles=byID('point-curve-handles'),pointCurveCursor=byID('point-curve-cursor');
  let curveKeyboardPoint={x:128,y:128},curvePointer=null;
  const pointCurvePoints=()=>structuredClone(state.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.pointCurves?.[pointCurveChannel.value]??[{x:0,y:0},{x:255,y:255}]);
  function drawPointCurveGraph(points){
    const lut=buildPointCurveLUT(points);
    pointCurveLine.setAttribute('points',Array.from(lut,(value,x)=>`${x},${255-value}`).join(' '));
    for(const handle of pointCurveHandles.children){const point=points[Number(handle.dataset.curveGraphIndex)];if(point){handle.firstChild.setAttribute('cx',String(point.x));handle.firstChild.setAttribute('cy',String(255-point.y));handle.lastChild.setAttribute('cx',String(point.x));handle.lastChild.setAttribute('cy',String(255-point.y));}}
  }
  function renderPointCurveEditor(loaded,busy){
    const points=pointCurvePoints(),active=loaded&&!busy&&!access.reason()&&typeof session.setPointCurve==='function';pointCurveRows.replaceChildren();pointCurveHandles.replaceChildren();
    const curves=state.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.pointCurves??{};
    const refine=byID('point-curve-refine-saturation');
    refine.value=String(curves.refineSaturation??100);refine.disabled=!active||!['master','red','green','blue'].some(name=>Object.hasOwn(curves,name))||typeof session.setPointCurveRefineSaturation!=='function';
    byID('point-curve-refine-saturation-value').textContent=refine.value;
    const selectedContrast=selectedPointCurveContrast(state.recipe);
    for(const button of pointCurvePresets.querySelectorAll('[data-curve-preset]')){button.disabled=!canApplyPointCurveContrast(session,state,{pending,blocked:Boolean(access.reason())});button.setAttribute('aria-pressed',String(button.dataset.curvePreset===selectedContrast));}
    byID('point-curve-preset-status').textContent=!loaded?'写真を読み込むと適用できます。':selectedContrast==='custom'?'Master曲線はカスタム点編集です。':'Master曲線：'+({linear:'Linear（直線）',medium:'Medium',strong:'Strong'}[selectedContrast]);
    pointCurveSVG.setAttribute('tabindex',active?'0':'-1');pointCurveSVG.setAttribute('aria-disabled',String(!active));
    pointCurveCursor.setAttribute('cx',String(curveKeyboardPoint.x));pointCurveCursor.setAttribute('cy',String(255-curveKeyboardPoint.y));
    points.forEach((point,index)=>{
      const handle=document.createElementNS('http://www.w3.org/2000/svg','g');handle.dataset.curveGraphIndex=String(index);handle.setAttribute('role','button');handle.setAttribute('tabindex',active?'0':'-1');handle.setAttribute('aria-disabled',String(!active));handle.setAttribute('aria-label',`${pointCurveChannel.selectedOptions[0]?.textContent??pointCurveChannel.value}の${index===0?'始点':index===points.length-1?'終点':`点 ${index}`}、入力 ${point.x}、出力 ${point.y}。矢印キーで移動${index>0&&index<points.length-1?'、Deleteまたはダブルクリックで削除':''}`);
      const hit=document.createElementNS('http://www.w3.org/2000/svg','circle');hit.setAttribute('class','point-curve-hit');hit.setAttribute('r','34');
      const mark=document.createElementNS('http://www.w3.org/2000/svg','circle');mark.setAttribute('class','point-curve-handle');mark.setAttribute('r','5');
      for(const circle of [hit,mark]){circle.setAttribute('cx',String(point.x));circle.setAttribute('cy',String(255-point.y));}handle.append(hit,mark);pointCurveHandles.append(handle);
    });
    drawPointCurveGraph(points);
    points.forEach((point,index)=>{
      const row=element('div','point-curve-row');
      for(const field of ['x','y']){
        const label=element('label','',`${index===0?'始点':index===points.length-1?'終点':`点 ${index}`} · ${field.toUpperCase()}`);
        const input=element('input');input.type='number';input.min='0';input.max='255';input.step='1';input.inputMode='numeric';input.value=String(point[field]);input.dataset.curveField=field;input.dataset.curveIndex=String(index);input.disabled=!loaded||busy||(field==='x'&&(index===0||index===points.length-1));label.append(input);row.append(label);
      }
      if(index>0&&index<points.length-1){const remove=element('button','',`点 ${index} を削除`);remove.type='button';remove.dataset.curveAction='remove';remove.dataset.curveIndex=String(index);remove.disabled=!loaded||busy;row.append(remove);}
      pointCurveRows.append(row);
    });
    pointCurveChannel.disabled=!active;
    for(const button of pointCurveEditor.querySelectorAll('[data-curve-action]'))button.disabled=!active||(button.dataset.curveAction==='add'&&points.length>=32);
    byID('point-curve-graph-status').textContent=!active?'写真を読み込み、処理完了と編集権限を確認してください。':'空白をクリックして追加、点をドラッグして移動・ダブルクリックで削除。キーボードはグラフで矢印＋Enter、点では矢印／Delete。';
  }
  pointCurveChannel.addEventListener('change',()=>{curveKeyboardPoint={x:128,y:128};renderPointCurveEditor(Boolean(state.asset),Boolean(state.busy||pending||state.exporting));},{signal:lifetime.signal});
  byID('point-curve-refine-saturation').addEventListener('change',event=>{
    const input=event.currentTarget;if(input.disabled)return;
    run('setPointCurveRefineSaturation',Number(input.value));
  },{signal:lifetime.signal});
  pointCurvePresets.addEventListener('click',event=>{
    const button=event.target.closest('[data-curve-preset]');if(!button||button.disabled||!canApplyPointCurveContrast(session,state,{pending,blocked:Boolean(access.reason())}))return;
    const name=button.dataset.curvePreset,alreadySelected=selectedPointCurveContrast(state.recipe)===name;
    pointCurveChannel.value='master';curveKeyboardPoint={x:128,y:128};
    if(alreadySelected){renderPointCurveEditor(Boolean(state.asset),Boolean(state.busy||pending||state.exporting));return;}
    run('setPointCurve','master',pointCurveContrastPoints(name));
  },{signal:lifetime.signal});
  pointCurveEditor.addEventListener('change',event=>{
    const input=event.target.closest('[data-curve-field]');if(!input)return;
    const value=Number(input.value),points=pointCurvePoints(),index=Number(input.dataset.curveIndex),field=input.dataset.curveField;
    if(!input.value.trim()||!Number.isInteger(value)||value<0||value>255||!points[index]){localError='ポイントは0〜255の整数で指定してください。';render(state);return;}
    points[index][field]=value;run('setPointCurve',pointCurveChannel.value,points);
  },{signal:lifetime.signal});
  pointCurveEditor.addEventListener('click',event=>{
    const button=event.target.closest('[data-curve-action]');if(!button||button.disabled)return;
    const points=pointCurvePoints(),action=button.dataset.curveAction;
    if(action==='reset'){run('setPointCurve',pointCurveChannel.value,null);return;}
    if(action==='remove'){const index=Number(button.dataset.curveIndex);if(index>0&&index<points.length-1){points.splice(index,1);run('setPointCurve',pointCurveChannel.value,points);}return;}
    if(action==='add'){
      let gap=0,at=-1;for(let index=0;index<points.length-1;index++){const width=points[index+1].x-points[index].x;if(width>gap){gap=width;at=index;}}
      if(gap<2||points.length>=32){localError='追加できる点がありません。';render(state);return;}
      const x=points[at].x+Math.floor(gap/2),left=points[at],right=points[at+1],y=Math.round(left.y+(right.y-left.y)*(x-left.x)/(right.x-left.x));
      points.splice(at+1,0,{x,y});run('setPointCurve',pointCurveChannel.value,points);
    }
  },{signal:lifetime.signal});
  const curveGraphActive=()=>Boolean(state.asset&&!state.busy&&!state.exporting&&!pending&&!access.reason()&&typeof session.setPointCurve==='function');
  async function commitCurveGraph(points,focusIndex=null){
    if(!curveGraphActive())return;
    await run('setPointCurve',pointCurveChannel.value,points);
    if(disposed||localError||focusIndex===null)return;
    pointCurveHandles.querySelector(`[data-curve-graph-index="${focusIndex}"]`)?.focus({preventScroll:true});
  }
  pointCurveSVG.addEventListener('pointerdown',event=>{
    if(!curveGraphActive()||event.button!==0)return;
    const handle=event.target.closest('[data-curve-graph-index]'),index=handle?Number(handle.dataset.curveGraphIndex):null;
    curvePointer={id:event.pointerId,index,startX:event.clientX,startY:event.clientY,assetID:state.asset.id,channel:pointCurveChannel.value,points:pointCurvePoints(),preview:null};
    pointCurveSVG.setPointerCapture?.(event.pointerId);event.preventDefault();
    if(handle)handle.focus({preventScroll:true});else pointCurveSVG.focus({preventScroll:true});
  },{signal:lifetime.signal});
  pointCurveSVG.addEventListener('pointermove',event=>{
    if(!curvePointer||curvePointer.id!==event.pointerId||curvePointer.index===null)return;
    try{
      const point=pointCurveGraphCoordinate({rect:pointCurveGraphPlotRect(pointCurveSVG.getBoundingClientRect()),clientX:event.clientX,clientY:event.clientY,clamp:true});
      curvePointer.preview=moveCurveGraphPoint(curvePointer.points,curvePointer.index,point);drawPointCurveGraph(curvePointer.preview);
    }catch{/* Invalid pointer geometry never changes the saved Recipe. */}
  },{signal:lifetime.signal});
  const endCurvePointer=(event,cancelled=false)=>{
    if(!curvePointer||curvePointer.id!==event.pointerId)return;
    const drag=curvePointer;curvePointer=null;
    if(pointCurveSVG.hasPointerCapture?.(event.pointerId))pointCurveSVG.releasePointerCapture(event.pointerId);
    if(cancelled||!curveGraphActive()||state.asset?.id!==drag.assetID||pointCurveChannel.value!==drag.channel){renderPointCurveEditor(Boolean(state.asset),Boolean(state.busy||pending||state.exporting));return;}
    if(drag.index!==null){
      const next=drag.preview??drag.points;
      if(JSON.stringify(next)!==JSON.stringify(drag.points))commitCurveGraph(next,drag.index);
      else drawPointCurveGraph(drag.points);
      return;
    }
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8)return;
    try{
      const point=pointCurveGraphCoordinate({rect:pointCurveGraphPlotRect(pointCurveSVG.getBoundingClientRect()),clientX:event.clientX,clientY:event.clientY});
      const inserted=point&&insertCurveGraphPoint(drag.points,point);
      if(inserted)commitCurveGraph(inserted.points,inserted.index);
    }catch{/* Off-graph or invalid coordinates never commit. */}
  };
  pointCurveSVG.addEventListener('pointerup',event=>endCurvePointer(event),{signal:lifetime.signal});
  pointCurveSVG.addEventListener('pointercancel',event=>endCurvePointer(event,true),{signal:lifetime.signal});
  pointCurveSVG.addEventListener('dblclick',event=>{
    if(!curveGraphActive())return;
    const handle=event.target.closest('[data-curve-graph-index]'),points=pointCurvePoints();
    // Pointer capture retargets trusted double-clicks to the SVG in Chrome.
    // Use the same 34-viewBox-unit hit circle as the visible handle when that
    // happens, but never delete an endpoint or a distant point.
    const index=handle?Number(handle.dataset.curveGraphIndex):pointCurveGraphHitIndex(points,pointCurveGraphPlotRect(pointCurveSVG.getBoundingClientRect()),event.clientX,event.clientY);
    if(index===null)return;
    const remaining=removeCurveGraphPoint(points,index);
    if(remaining){event.preventDefault();commitCurveGraph(remaining,Math.min(index,remaining.length-1));}
  },{signal:lifetime.signal});
  pointCurveSVG.addEventListener('keydown',event=>{
    if(!curveGraphActive())return;
    const handle=event.target.closest('[data-curve-graph-index]');
    if(handle){
      const index=Number(handle.dataset.curveGraphIndex),points=pointCurvePoints();
      if(['Delete','Backspace'].includes(event.key)){event.preventDefault();const remaining=removeCurveGraphPoint(points,index);if(remaining)commitCurveGraph(remaining,Math.min(index,remaining.length-1));return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const step=event.shiftKey?10:1,point={...points[index]};
      if(event.key==='ArrowLeft')point.x-=step;if(event.key==='ArrowRight')point.x+=step;
      if(event.key==='ArrowUp')point.y+=step;if(event.key==='ArrowDown')point.y-=step;
      const moved=moveCurveGraphPoint(points,index,point);
      if(JSON.stringify(moved)!==JSON.stringify(points))commitCurveGraph(moved,index);
      return;
    }
    if(event.target!==pointCurveSVG)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const step=event.shiftKey?10:1;
      curveKeyboardPoint={x:Math.max(0,Math.min(255,curveKeyboardPoint.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))),y:Math.max(0,Math.min(255,curveKeyboardPoint.y+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)))};
      pointCurveCursor.setAttribute('cx',String(curveKeyboardPoint.x));pointCurveCursor.setAttribute('cy',String(255-curveKeyboardPoint.y));
      byID('point-curve-graph-status').textContent=`追加位置：入力 ${curveKeyboardPoint.x}、出力 ${curveKeyboardPoint.y}。Enterで点を追加します。`;
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();const inserted=insertCurveGraphPoint(pointCurvePoints(),curveKeyboardPoint);
      if(inserted)commitCurveGraph(inserted.points,inserted.index);
    }
  },{signal:lifetime.signal});
  const histogramVisibility=element('button','quiet-button clipping-toggle','ヒストグラムを隠す');
  histogramVisibility.type='button';histogramVisibility.setAttribute('aria-controls','suite-histogram');
  histogramVisibility.setAttribute('aria-expanded','true');
  const histogramFigure=element('figure','suite-histogram');histogramFigure.id='suite-histogram';
  const histogramCaption=element('figcaption','', '表示中のプレビュー · RGBヒストグラム');
  const histogramSVG=document.createElementNS('http://www.w3.org/2000/svg','svg');
  histogramSVG.setAttribute('viewBox','0 0 256 80');histogramSVG.setAttribute('role','img');histogramSVG.setAttribute('aria-label','表示中プレビューの明るさとRGB分布');
  const histogramPaths={};
  for(const channel of ['luma','red','green','blue']){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class',`suite-histogram-${channel}`);histogramSVG.append(path);histogramPaths[channel]=path;}
  const toneLabels={blacks:'黒レベル',shadows:'シャドウ',exposure:'露光量',highlights:'ハイライト',whites:'白レベル'};
  const histogramGraph=element('div','suite-histogram-graph'),toneRegions=element('div','suite-tone-regions');
  for(const region of Object.keys(HISTOGRAM_TONE_REGIONS)){const button=element('button','suite-tone-region');button.type='button';button.dataset.toneRegion=region;button.setAttribute('aria-label',`${toneLabels[region]}を調整`);button.title=`${toneLabels[region]}：左右にドラッグ、左右矢印キーで調整`;toneRegions.append(button);}
  histogramGraph.append(histogramSVG,toneRegions);
  const clippingIndicators=element('div','suite-clipping-indicators');
  for(const [side,label] of [['shadow','黒側'],['highlight','白側']]){
    const button=element('button',`suite-clipping-indicator suite-clipping-${side}`,`${label}の警告`);
    button.type='button';button.id=`clipping-${side}-toggle`;button.dataset.clippingSide=side;
    button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`${label}のクリッピング警告を切り替え`);
    clippingIndicators.append(button);
  }
  const clippingSummary=element('p','suite-clipping-summary','写真を読み込むと分布とクリッピングを表示します。');
  const clippingLegend=element('p','suite-clipping-legend','黒側：青 · 白側：赤。左右は個別に切替、Jキーは両側を一括切替。');
  const toneHelp=element('p','suite-tone-help','5領域を左右にドラッグ、またはフォーカスして左右矢印キーで調整します。');
  const indicatorSetting=element('button','quiet-button','ヒストグラムの黒・白指標を隠す');
  indicatorSetting.type='button';indicatorSetting.setAttribute('aria-pressed','true');
  indicatorSetting.setAttribute('aria-label','ヒストグラムの黒・白クリッピング指標を表示');
  const indicatorContext=element('div','suite-histogram-context');indicatorContext.hidden=true;
  indicatorContext.setAttribute('role','group');indicatorContext.setAttribute('aria-label','ヒストグラム表示設定');
  const indicatorContextButton=element('button','quiet-button','Show Clipping in Histogram');
  indicatorContextButton.type='button';indicatorContextButton.setAttribute('aria-pressed','true');
  indicatorContext.append(indicatorContextButton);
  histogramFigure.append(histogramCaption,clippingIndicators,histogramGraph,clippingSummary,clippingLegend,toneHelp,indicatorSetting,indicatorContext);byID('global-controls').prepend(histogramVisibility,histogramFigure);histogramFigure.closest('.control-section').classList.add('histogram-control-section');
  const exportNaming=element('div','export-naming');
  exportNaming.innerHTML='<label for="export-name-method">ファイル名<select id="export-name-method"><option value="revision">元の名前 + Recipe版（従来）</option><option value="original">元の名前</option><option value="original-custom">元の名前 + 指定文字</option><option value="custom-count">指定文字 + 件数（1 of 1）</option><option value="custom-sequence">指定文字 + 連番（単写真は1）</option><option value="capture-date-original">DNG撮影日 + 元の名前（Exif offset必須）</option></select></label><label for="export-name-custom" id="export-name-custom-label" hidden>指定文字（必須）<input id="export-name-custom" type="text" maxlength="120" autocomplete="off" placeholder="例：仕上げA"></label><p class="control-help">件数・連番は単写真の1件目／全1件です。撮影日は本人TrialのDNG Originalから確認します。Final後も再照合し、新方式のダウンロードは本人がリンクを押します。OriginalやRecipeは変更しません。</p>';
  byID('export-section').querySelector('.button-pair').before(exportNaming);
  const exportNameMethod=byID('export-name-method'),exportNameCustom=byID('export-name-custom'),exportNameCustomLabel=byID('export-name-custom-label');
  function clearSingleNamingDownload(){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;downloadAssetID=null;const link=byID('download-link');link.removeAttribute('href');link.removeAttribute('download');link.hidden=true;}
  exportNameMethod.addEventListener('change',()=>{const custom=['original-custom','custom-count','custom-sequence'].includes(exportNameMethod.value);exportNameCustomLabel.hidden=!custom;exportNameCustom.required=custom;clearSingleNamingDownload();updateExportValidation();},{signal:lifetime.signal});
  exportNameCustom.addEventListener('input',()=>{clearSingleNamingDownload();updateExportValidation();},{signal:lifetime.signal});
  const exportSizing=element('div','export-sizing');
  const autoLightPanel=element('section','control-section');
  autoLightPanel.innerHTML='<h3>自動明るさ提案</h3><p>元のProxyを解析して8項目を提案します。確認後に一括適用し、Undoで戻せます。</p><button type="button" class="button" data-auto-light="propose">提案を作る</button><label>適用量<input type="range" min="0" max="100" value="100" data-auto-light="amount"></label><pre data-auto-light="summary" aria-live="polite"></pre><button type="button" class="button" data-auto-light="apply" disabled>提案を適用</button>';
  byID('curve-section').before(autoLightPanel);
  const autoPropose=autoLightPanel.querySelector('[data-auto-light="propose"]'),autoApply=autoLightPanel.querySelector('[data-auto-light="apply"]'),autoSummary=autoLightPanel.querySelector('[data-auto-light="summary"]');
  let autoDraft=false,autoRecipe=null,autoAsset=null;
  autoPropose.addEventListener('click',()=>{
    if(disposed||pending||access.reason()||state.busy||state.exporting)return;
    try{const proposal=session.proposeAutoLight();autoDraft=proposal.status!=='neutral-insufficient-tonal-information';autoRecipe=JSON.stringify(state.recipe);autoAsset=state.asset?.id;
      const names={exposure:'露出',contrast:'コントラスト',saturation:'彩度',highlights:'ハイライト',shadows:'シャドウ',whites:'白レベル',blacks:'黒レベル',vibrance:'自然な彩度'};
      autoSummary.textContent=autoDraft?Object.entries(proposal.proposal.controls).map(([key,value])=>`${names[key]??key}: ${Number(value.toFixed(2))}`).join('\n'):'明暗の情報が不足しています。手動調整してください。';autoApply.disabled=!autoDraft;
    }catch(error){autoDraft=false;autoApply.disabled=true;autoSummary.textContent=error.message;}
  },{signal:lifetime.signal});
  autoApply.addEventListener('click',async()=>{if(!autoDraft)return;autoDraft=false;autoApply.disabled=true;await run('applyAutoLightProposal',Number(autoLightPanel.querySelector('[data-auto-light="amount"]').value)/100);},{signal:lifetime.signal});
  const stopAutoLight=session.subscribe(next=>{const blocked=disposed||pending||Boolean(access.reason())||!next.asset||next.busy||next.exporting;
    autoPropose.disabled=Boolean(blocked);if(next.asset?.id!==autoAsset||JSON.stringify(next.recipe)!==autoRecipe)autoDraft=false;autoApply.disabled=Boolean(blocked)||!autoDraft;});
  additionalDisposers.push(stopAutoLight);
  const geometryContainer=element('div','geometry-controls');
  byID('crop-ratio').closest('section').append(geometryContainer);
  const geometryPanel=mountWebConnectedGeometry(geometryContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(geometryPanel.dispose);
  accessListeners.add(geometryPanel.refresh);
  const freeCropContainer=element('div','free-crop-controls');
  geometryContainer.after(freeCropContainer);
  const freeCropPanel=mountWebConnectedFreeCrop(freeCropContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(freeCropPanel.dispose);
  accessListeners.add(freeCropPanel.refresh);
  const cropHelp=byID('crop-ratio').closest('section').querySelector('.safety-note');
  cropHelp.textContent='固定比率は回転後の画像中央を切り抜きます。任意の位置・範囲は自由トリミングの数値欄で指定できます。書き出し寸法は出力設定で指定します。';
  const gradingContainer=element('section','control-section');
  autoLightPanel.after(gradingContainer);
  const gradingPanel=mountWebConnectedGrading(gradingContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(gradingPanel.dispose);
  accessListeners.add(gradingPanel.refresh);
  const pointColorContainer=element('section','control-section');
  gradingContainer.after(pointColorContainer);
  const pointColorPanel=mountWebConnectedPointColor(pointColorContainer,{session,afterImage:byID('after-image'),canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(pointColorPanel.dispose);
  accessListeners.add(pointColorPanel.refresh);
  const tonalBandsContainer=element('section','control-section');
  pointColorContainer.after(tonalBandsContainer);
  const tonalBandsPanel=mountWebConnectedTonalBands(tonalBandsContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(tonalBandsPanel.dispose);
  accessListeners.add(tonalBandsPanel.refresh);
  const profileContainer=element('section','control-section');
  tonalBandsContainer.after(profileContainer);
  const profilePanel=mountWebConnectedProfile(profileContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(profilePanel.dispose);
  accessListeners.add(profilePanel.refresh);
  const sceneBasicContainer=element('section','control-section');
  profileContainer.after(sceneBasicContainer);
  const sceneBasicPanel=mountWebConnectedSceneBasic(sceneBasicContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(sceneBasicPanel.dispose);
  accessListeners.add(sceneBasicPanel.refresh);
  const hslPickerContainer=element('section','control-section');
  sceneBasicContainer.after(hslPickerContainer);
  const hslPickerPanel=mountWebConnectedHSLPicker(hslPickerContainer,{session,afterImage:byID('after-image'),canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(hslPickerPanel.dispose);
  accessListeners.add(hslPickerPanel.refresh);
  const imageCurveContainer=element('section','control-section');
  hslPickerContainer.after(imageCurveContainer);
  const imageCurvePanel=mountWebConnectedImageCurve(imageCurveContainer,{session,afterImage:byID('after-image'),canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(imageCurvePanel.dispose);
  accessListeners.add(imageCurvePanel.refresh);
  const cloudStatusContainer=element('section','control-section');
  imageCurveContainer.after(cloudStatusContainer);
  const cloudStatusPanel=mountWebConnectedCloudStatus(cloudStatusContainer,{session,isSites:trialSession?.mode==='SITES'&&Boolean(trialSession.principal?.id),canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(cloudStatusPanel.dispose);
  accessListeners.add(cloudStatusPanel.refresh);
  const workspaceProxyPanel=mountWorkspaceProxyPanel(cloudStatusContainer,{session,trialSession,workspaceContext:workspaceProxyContext,signal:lifetime.signal,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(workspaceProxyPanel.dispose);accessListeners.add(workspaceProxyPanel.refresh);
  const illuminantContainer=element('section','control-section');
  cloudStatusContainer.after(illuminantContainer);
  const illuminantPanel=mountWebConnectedIlluminant(illuminantContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(illuminantPanel.dispose);
  accessListeners.add(illuminantPanel.refresh);
  const whiteBalanceContainer=element('section','control-section');
  illuminantContainer.after(whiteBalanceContainer);
  const whiteBalancePanel=mountWebConnectedWhiteBalance(whiteBalanceContainer,{session,beforeImage:byID('before-image'),pickerEventTarget:byID('after-image'),canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(whiteBalancePanel.dispose);
  accessListeners.add(whiteBalancePanel.refresh);
  const lumaCurveContainer=element('section','control-section');
  whiteBalanceContainer.after(lumaCurveContainer);
  const lumaCurvePanel=mountWebConnectedLumaCurve(lumaCurveContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(lumaCurvePanel.dispose);
  accessListeners.add(lumaCurvePanel.refresh);
  const lutContainer=element('section','control-section');
  lumaCurveContainer.after(lutContainer);
  const lutPanel=mountWebConnectedLUT(lutContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(lutPanel.dispose);
  accessListeners.add(lutPanel.refresh);
  const workspaceLUTPanel=mountWorkspaceLUTSync(lutContainer,{session,host:workspaceLUTHost??null,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(workspaceLUTPanel.dispose);accessListeners.add(workspaceLUTPanel.refresh);
  const xmpContainer=element('section','control-section');
  lutContainer.after(xmpContainer);
  const xmpPanel=mountWebConnectedXMP(xmpContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(xmpPanel.dispose);
  accessListeners.add(xmpPanel.refresh);
  const portablePresetContainer=element('section','control-section');
  xmpContainer.after(portablePresetContainer);
  const portablePresetPanel=mountWebConnectedPortablePreset(portablePresetContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(portablePresetPanel.dispose);
  accessListeners.add(portablePresetPanel.refresh);
  // Explicit local/manual controls, not face SDK approval or cloud AI features.
  let localPanelAnchor=portablePresetContainer;
  for(const [id,label,mount] of [
    ['local-saved-makeup-consent','保存済みメイクのローカル同意',mountLocalSavedMakeupConsent],
    ['local-saved-shadow-consent','保存済み影・白黒縁のローカル同意',mountLocalSavedShadowConsent],
    ['manual-makeup-controls','手塗りメイク',mountWebConnectedManualMakeup],
    ['manual-clone-controls','クローン・修復',mountWebConnectedManualClone],
    ['manual-skin-controls','肌補正',mountWebConnectedManualSkin],
    ['manual-red-eye-controls','赤目補正',mountWebConnectedManualRedEye],
    ['manual-eyes-controls','目・白目・瞳',mountWebConnectedManualEyes],
    ['manual-hair-controls','髪色・つや・なめらかさ・白髪',mountWebConnectedManualHair],
    ['manual-teeth-controls','歯の明るさ・脱色',mountWebManualTeeth],
    ['manual-clothing-controls','衣服のしわ軽減',mountWebManualClothing],
    ['manual-background-controls','単色背景のむら補正',mountWebManualBackground],
    ['manual-spot-controls','小領域の近傍修復',mountWebManualSpot],
    ['raw-denoise-controls','RAWノイズ除去（非AI）',mountWebRawDenoise],
    ['depth-range-controls','手持ち深度データの範囲補正',mountWebDepthRange],
    ['manual-liquify-controls','手動ゆがみ補正',mountWebManualLiquify],
    ['local-lut-mask-controls','LUTの局所適用',mountWebLocalLUTMask],
    ['lens-shading-controls','レンズ補正',mountWebConnectedLens],
    ['color-range-controls','色範囲マスク',mountWebConnectedColorRangeLevels],
    ['personal-look-controls','個人Look',mountWebConnectedPersonalLook],
  ]){
    const container=element('section','control-section');container.id=id;container.tabIndex=-1;
    localPanelAnchor.after(container);localPanelAnchor=container;
    const panel=mount(container,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
    additionalDisposers.push(panel.dispose);accessListeners.add(panel.refresh);
    const nav=element('button','',label);nav.type='button';nav.dataset.editorSection=id;
    root.querySelector('[data-editor-section="person-section"]').before(nav);
  }
  const colorMatchContainer=element('section','control-section');
  lutContainer.after(colorMatchContainer);
  const colorMatchPanel=mountWebConnectedColorMatch(colorMatchContainer,{session,canUse:()=>!disposed&&!pending&&!access.reason(),getBatchTargets:()=>{
    const ids=[...batchTargetIDs];
    const reason=calibrationSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())});
    if(reason)throw Error(reason);
    return ids;
  }});
  additionalDisposers.push(colorMatchPanel.dispose);
  accessListeners.add(colorMatchPanel.refresh);
  const cullingContainer=element('section','control-section');
  byID('batch-final-section').before(cullingContainer);
  const cullingPanel=mountWebConnectedCulling(cullingContainer,{session,
    canUse:()=>!disposed&&!pending&&!access.reason(),
    onSelection:({assetIDs,bindings})=>{
      if(disposed||pending||access.reason()||state.busy||state.exporting||state.dirty)throw Error('CULLING_SELECTION_NOT_READY');
      if(assetIDs.length>20)throw Error('一括書き出しへ渡す写真は20枚以内にしてください。');
      const current=new Map((session.state.assets??[]).map(asset=>[asset.id,asset]));
      if(bindings.some(binding=>current.get(binding.id)?.sha256?.toLowerCase()!==binding.originalSHA256?.toLowerCase()))throw Error('CULLING_SELECTION_CHANGED');
      clearBatchFinalDownloads();batchFinalIDs.splice(0,batchFinalIDs.length,...assetIDs);
      batchFinalStatus='セレクト提案を選択へ反映しました。書き出しはまだ実行していません。';renderBatchFinalControls();
    }});
  additionalDisposers.push(cullingPanel.destroy);
  accessListeners.add(cullingPanel.refresh);
  const versionsContainer=element('section','control-section');
  autoLightPanel.after(versionsContainer);
  let versionsPanel=null,versionsKey=null,versionsGeneration=0,versionImageComparison=null;
  const updateVersions=async next=>{
    const blocked=disposed||pending||Boolean(access.reason())||next.busy||next.exporting||next.dirty;
    versionsPanel?.setDisabled(Boolean(blocked));
    const key=next.asset?`${next.asset.id}:${next.revision}`:null;
    if(key===versionsKey)return;
    versionsKey=key;const generation=++versionsGeneration;
    versionsPanel?.destroy();versionsPanel=null;versionImageComparison?.dispose();versionImageComparison=null;versionsContainer.replaceChildren();
    if(!key||!next.revision||access.reason()||disposed)return;
    try{
      const identity=JSON.stringify([location.origin,trialSession?.mode??'LOCAL_QA',trialSession?.principal?.id??'anonymous',session.api?.constructor?.name]);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
      if(disposed||generation!==versionsGeneration||access.reason())return;
      const scope=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      const comparison=element('div','version-settings-comparison');
      const imageComparison=element('div','version-image-comparison');
      const imagePanel=mountWebConnectedVersionComparison(imageComparison,{session,canUse:()=>!disposed&&!pending&&!access.reason()});
      versionImageComparison=imagePanel;
      versionsPanel=createConnectedVersionsPanel({document,api:session.api,scope,assetId:next.asset.id,disabled:Boolean(blocked),onInvalidateComparison:()=>{comparison.replaceChildren();imagePanel.clear();},onRestore:async request=>{
        if(disposed||generation!==versionsGeneration||access.reason()||request.signal?.aborted)throw Error('NAMED_VERSION_RESTORE_STALE');
        await session.restoreSavedRecipeVersion(request);
      },onCompare:async result=>{
        if(disposed||generation!==versionsGeneration||access.reason()||result.signal?.aborted)return;
        comparison.replaceChildren();
        const heading=element('p');heading.textContent='保存設定の比較です。画像は準備済みProxyから別枠に描画します。現在の編集は変更しません。';comparison.append(heading);
        for(const [key,title] of [['left','左'],['right','右']]){
          const side=result[key],body=side?.recipe?.body;
          if(!body)throw Error('NAMED_VERSION_COMPARISON_BODY_MISSING');
          const details=element('details'),summary=element('summary'),pre=element('pre');
          summary.textContent=`${title}: ${side.entry?.name??''} · v${side.entry?.recipeVersion??side.recipe?.revision??''}`;
          pre.textContent=JSON.stringify(body,null,2);details.append(summary,pre);comparison.append(details);
        }
        await imagePanel.show(result);
      }});
      versionsContainer.append(versionsPanel.element);await versionsPanel.refresh();
      if(!disposed&&generation===versionsGeneration)versionsContainer.append(imageComparison,comparison);
    }catch(error){if(!disposed&&generation===versionsGeneration)versionsContainer.textContent=`名前付き版: ${error.message}`;}
  };
  const stopVersions=session.subscribe(next=>{void updateVersions(next);});
  accessListeners.add(()=>{versionsPanel?.setDisabled(true);});
  additionalDisposers.push(()=>{++versionsGeneration;stopVersions();versionsPanel?.destroy();versionImageComparison?.dispose();});
  exportSizing.innerHTML='<label for="export-size-method">出力サイズ<select id="export-size-method"><option value="original">元のサイズ</option><option value="percentage">縮小率（％）</option><option value="width">幅を指定（px）</option><option value="height">高さを指定（px）</option><option value="fit">枠内に収める（px）</option><option value="long-edge">長辺を指定（px）</option><option value="short-edge">短辺を指定（px）</option><option value="dimensions">幅×高さの枠（px）</option></select></label><label for="export-size-value" id="export-size-value-label" hidden>指定値<input id="export-size-value" type="number" min="1" max="16384" step="1" inputmode="numeric" value="100"></label><label for="export-size-width" id="export-size-width-label" hidden>最大幅<input id="export-size-width" type="number" min="1" max="16384" step="1" inputmode="numeric" value="1920"></label><label for="export-size-height" id="export-size-height-label" hidden>最大高さ<input id="export-size-height" type="number" min="1" max="16384" step="1" inputmode="numeric" value="1080"></label><p class="control-help">縦横比を保ち縮小します。「幅×高さ」は歪めず枠内に収めます。元写真より拡大する指定は書き出し時に拒否します。</p>';
  exportNaming.after(exportSizing);
  const exactOption=element('option');exactOption.value='exact-dimensions';exactOption.textContent='厳密な幅×高さ（px）';
  byID('export-size-method').append(exactOption);
  const exactControls=element('div','export-exact-controls');exactControls.hidden=true;
  exactControls.innerHTML='<label>縦横比が異なる場合<select id="export-exact-strategy"><option value="">処理を選択</option><option value="pad">余白を追加</option><option value="crop">中央で切り抜く</option><option value="stretch">引き伸ばす（変形あり）</option></select></label><label id="export-exact-background-label" hidden>余白の色<select id="export-exact-background"><option value="white">白</option><option value="gray">グレー</option><option value="black">黒</option></select></label><p class="control-help">厳密指定は選んだ処理で幅と高さを揃えます。引き伸ばしは被写体も変形します。元画像を超える寸法や処理上限を超える指定は拒否します。</p>';
  exportSizing.append(exactControls);
  const exportExactStrategy=byID('export-exact-strategy'),exportExactBackground=byID('export-exact-background');
  const exportResolution=element('div','export-resolution');
  exportResolution.innerHTML='<label for="export-resolution-unit">印刷密度メタデータ<select id="export-resolution-unit"><option value="none">指定しない（従来どおり）</option><option value="ppi">PPI · pixels/inch</option><option value="ppc">PPC · pixels/cm</option></select></label><label for="export-resolution-value" id="export-resolution-value-label" hidden>密度値<input id="export-resolution-value" type="number" min="1" max="65535" step="1" inputmode="numeric" placeholder="例：300"></label><p class="control-help">PPI/PPCはJPEG/PNG/TIFFの密度メタデータです。画素数を増やしたり印刷実寸を保証したりしません。JPEGのJFIFがない場合は出力を拒否します。</p><p class="control-help" id="export-settings-note" role="status" aria-live="polite"></p>';
  exportSizing.after(exportResolution);
  const exportSizeMethod=byID('export-size-method'),exportSizeValue=byID('export-size-value'),exportSizeWidth=byID('export-size-width'),exportSizeHeight=byID('export-size-height');
  const exportResolutionUnit=byID('export-resolution-unit'),exportResolutionValue=byID('export-resolution-value');
  const jpegQualityControl=element('div','export-jpeg-quality');
  jpegQualityControl.innerHTML='<label for="export-jpeg-quality">JPEG品質（単写真・一括共通）<input id="export-jpeg-quality" type="number" min="1" max="100" step="1" inputmode="numeric" value="95" required aria-describedby="export-jpeg-quality-help"></label><p class="control-help" id="export-jpeg-quality-help">1〜100。JPEGだけに適用します。容量の上限や画質の一定性を保証する値ではありません。保存済み出力設定と異なる品質は拒否します。PNG／TIFFには影響しません。</p>';
  exportResolution.after(jpegQualityControl);
  const jpegQualityInput=byID('export-jpeg-quality');
  let batchQualityController=null;
  let localExportPanel=null;
  function plannedExportQuality(format,recipe){
    if(format!=='jpeg')return format==='png'?1:0.95;
    const raw=jpegQualityInput.value.trim(),percent=Number(raw);
    if(!raw||!Number.isSafeInteger(percent)||percent<1||percent>100)
      throw Error('JPEG品質は1〜100の整数で指定してください。');
    const saved=recipe?.parameters?.extendedParameters?.export;
    if(saved&&(saved.format!=='jpeg'||saved.jpeg_quality!==percent))
      throw Error(`保存済み出力設定とJPEG指定が一致しません（保存形式：${saved.format}／品質：${saved.jpeg_quality}）。設定は自動変更しません。`);
    return percent/100;
  }
  const singleOutputFormat=element('label','suite-export-output-format');
  singleOutputFormat.innerHTML='<span>手動設定での書き出し形式</span><select id="single-output-format"><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="tiff">TIFF 8-bit</option></select>';
  const singleOutputForm=createExportOutputAdjustmentsForm({document,onApply:async outputSharpening=>{
    singleOutputRunning=true;
    try{
      const format=byID('single-output-format').value;
      const size=plannedExportSize(),resolution=plannedExportResolution();
      const ok=await run('exportFinal',{format,quality:format==='png'?1:0.95,size,...(resolution?{resolution}:{}),outputSharpening});
      if(!ok)throw Error('OUTPUT_SHARPENING_EXPORT_NOT_COMPLETED');
    }finally{singleOutputRunning=false;if(!disposed)updateExportValidation();}
  },onCancel:()=>{if(singleOutputRunning&&typeof session.cancelExport==='function')void session.cancelExport();}});
  byID('export-section').querySelector('.button-pair').after(singleOutputFormat,singleOutputForm.element);
  const workspaceExportNotice=createWorkspaceExportPresetEditorNotice({document,trialSession});
  workspaceExportNotice.textContent='Node WorkspaceのExport Presetは本人・tenant認証経路が未接続です。下のローカル設定はWorkspace Presetではなく、このブラウザ内だけの手動設定再利用です。';
  singleOutputForm.element.after(workspaceExportNotice);
  const batchOutputForm=createExportOutputAdjustmentsForm({document,onApply:async outputSharpening=>{
    batchOutputRunning=true;
    try{if(!await startBatchFinal(outputSharpening))throw Error('OUTPUT_SHARPENING_BATCH_NOT_COMPLETED');}
    finally{batchOutputRunning=false;if(!disposed)renderBatchFinalControls();}
  },onCancel:()=>{if(batchOutputRunning&&typeof session.cancelExport==='function'){
    batchQualityController?.abort();
    batchFinalStatus='中断を要求しました。完了していないFinalのリンクは表示しません。';
    void session.cancelExport();renderBatchFinalControls();
  }}});
  for(const form of [singleOutputForm.element,batchOutputForm.element]){
    const help=form.querySelector('p[id$="-help"]');
    if(help)help.textContent='Screen／Printと手動値はSUITE独自の出力専用設定です。外部製品のPreset再現ではなく、写真のRecipeには保存しません。';
  }
  byID('batch-final-section').querySelector('.batch-final-actions').after(batchOutputForm.element);
  additionalDisposers.push(singleOutputForm.destroy,batchOutputForm.destroy);
  function renderExportSizeFields(){
    const kind=exportSizeMethod.value;
    byID('export-size-value-label').hidden=!['percentage','width','height','long-edge','short-edge'].includes(kind);
    byID('export-size-width-label').hidden=!['fit','dimensions','exact-dimensions'].includes(kind);byID('export-size-height-label').hidden=!['fit','dimensions','exact-dimensions'].includes(kind);
    exactControls.hidden=kind!=='exact-dimensions';
    if(kind==='percentage'){exportSizeValue.max='100';exportSizeValue.value='100';}
    else if(kind==='width'||kind==='height'){exportSizeValue.max='16384';exportSizeValue.value='1920';}
    else if(kind==='long-edge'||kind==='short-edge'){exportSizeValue.max='16384';exportSizeValue.value='';}
    else if(kind==='dimensions'){exportSizeWidth.value='';exportSizeHeight.value='';}
    updateExportValidation();
  }
  exportSizeMethod.addEventListener('change',renderExportSizeFields,{signal:lifetime.signal});
  function plannedExportSize(){
    return parseExportSizeSelection(exportSizeMethod.value,{value:exportSizeValue.value,width:exportSizeWidth.value,height:exportSizeHeight.value,strategy:exportExactStrategy.value,background:exportExactBackground.value});
  }
  function plannedExportResolution(){return parseExportResolutionSelection(exportResolutionUnit.value,exportResolutionValue.value);}
  exportExactStrategy.addEventListener('change',()=>{byID('export-exact-background-label').hidden=exportExactStrategy.value!=='pad';updateExportValidation();},{signal:lifetime.signal});
  exportExactBackground.addEventListener('change',updateExportValidation,{signal:lifetime.signal});
  function updateExportValidation(){
    let error=null;try{plannedExportSize();plannedExportResolution();}catch(cause){error=cause.message??String(cause);}
    try{if(state.asset&&exportNameMethod.value!=='capture-date-original')plannedExportName('jpeg');}catch(cause){error=cause.message??String(cause);clearSingleNamingDownload();}
    if(exportNameMethod.value==='capture-date-original'&&!(session.api instanceof TrialClient))
      error='EXPORT_CAPTURE_DATE_TRIAL_REQUIRED';
    const ready=canStartConfiguredExport(state,{pending,blocked:Boolean(access.reason())});
    let jpegError=null;try{plannedExportQuality('jpeg',state.recipe);}catch(cause){jpegError=cause.message??String(cause);}
    for(const format of ['jpeg','png','tiff']){const button=root.querySelector(`[data-action="export-${format}"]`);button.disabled=typeof session.exportFinal!=='function'||!ready||Boolean(error)||(format==='jpeg'&&Boolean(jpegError));}
    jpegQualityInput.disabled=!ready||batchFinalRunning||singleOutputRunning||batchOutputRunning;
    singleOutputFormat.querySelector('select').disabled=!ready;
    singleOutputForm.setDisabled((typeof session.exportFinal!=='function'||!ready||Boolean(error)||(singleOutputFormat.querySelector('select').value==='jpeg'&&Boolean(jpegError)))&&!singleOutputRunning);
    byID('export-settings-note').textContent=error?`設定を確認してください：${error}`:jpegError?`JPEG設定：${jpegError}`:!ready?'保存済み写真で、処理中でなく利用権限がある場合のみ書き出せます。':'画素サイズと密度メタデータは別々に適用されます。';
    localExportPanel?.refresh();
  }
  singleOutputFormat.querySelector('select').addEventListener('change',updateExportValidation,{signal:lifetime.signal});
  for(const type of ['input','change'])jpegQualityInput.addEventListener(type,()=>{
    clearSingleNamingDownload();clearBatchFinalDownloads();batchFinalStatus='';
    updateExportValidation();renderBatchFinalControls();
  },{signal:lifetime.signal});
  additionalDisposers.push(()=>batchQualityController?.abort());
  exportResolutionUnit.addEventListener('change',()=>{byID('export-resolution-value-label').hidden=exportResolutionUnit.value==='none';updateExportValidation();},{signal:lifetime.signal});
  for(const input of [exportSizeValue,exportSizeWidth,exportSizeHeight,exportResolutionValue])input.addEventListener('input',updateExportValidation,{signal:lifetime.signal});
  const localExportContainer=element('div','local-export-settings');workspaceExportNotice.after(localExportContainer);
  function localExportReady(){return !disposed&&!pending&&!access.reason()&&!state.busy&&!state.exporting&&!singleOutputRunning&&!batchOutputRunning&&!batchFinalRunning&&canStartConfiguredExport(state,{pending,blocked:Boolean(access.reason())});}
  function readLocalExportSettings(){
    return validateLocalExportSettings({format:byID('single-output-format').value,size:plannedExportSize(),resolution:plannedExportResolution()??null,outputSharpening:singleOutputForm.getSettings()});
  }
  function applyLocalExportSettings(input){
    if(!localExportReady())throw Error('LOCAL_EXPORT_NOT_READY');
    // All four values validate before the first visible control changes. The
    // sharpening setter may reject disabled/pending state, so invoke it first.
    const next=validateLocalExportSettings(input),size=next.size;
    if(![...byID('single-output-format').options].some(option=>option.value===next.format)||![...exportSizeMethod.options].some(option=>option.value===size.kind))throw Error('LOCAL_EXPORT_CONTROL_UNSUPPORTED');
    const rollbackNodes=[byID('single-output-format'),exportSizeMethod,exportSizeValue,exportSizeWidth,exportSizeHeight,exportResolutionUnit,exportResolutionValue,exportExactStrategy,exportExactBackground,...singleOutputForm.element.querySelectorAll('input,select,button,fieldset')];
    const previous=rollbackNodes.map(node=>({node,value:node.value,checked:node.checked,disabled:node.disabled}));
    let previousSharpening;try{previousSharpening=singleOutputForm.getSettings();}catch{/* An invalid draft must not block a valid preset. */}
    function write(value){
      singleOutputForm.setDisabled(false);
      singleOutputForm.setSettings(value.outputSharpening);
      byID('single-output-format').value=value.format;exportSizeMethod.value=value.size.kind;
      exportSizeValue.value=String(value.size.value??100);exportSizeWidth.value=String(value.size.width??1920);exportSizeHeight.value=String(value.size.height??1080);
      exportResolutionUnit.value=value.resolution?.unit??'none';exportResolutionValue.value=value.resolution?String(value.resolution.value):'';
      exportExactStrategy.value=value.size.strategy??'';
      exportExactBackground.value=value.size.background?.[0]===0?'black':value.size.background?.[0]===128?'gray':'white';
    }
    try{write(next);const actual=readLocalExportSettings();if(JSON.stringify(actual)!==JSON.stringify(next))throw Error('LOCAL_EXPORT_READBACK');}
    catch(error){if(previousSharpening){try{singleOutputForm.setDisabled(false);singleOutputForm.setSettings(previousSharpening);}catch{/* Raw DOM snapshot below also preserves invalid prior input. */}}for(const saved of previous){if(saved.value!==undefined)saved.node.value=saved.value;if(saved.checked!==undefined)saved.node.checked=saved.checked;saved.node.disabled=saved.disabled;}updateExportValidation();throw error;}
    // Do not dispatch a mode-change event: that handler resets custom sizes.
    // Refresh the same visibility/validation paths after the complete snapshot.
    byID('export-size-value-label').hidden=!['percentage','width','height','long-edge','short-edge'].includes(size.kind);
    byID('export-size-width-label').hidden=byID('export-size-height-label').hidden=!['fit','dimensions','exact-dimensions'].includes(size.kind);
    exportSizeValue.max=size.kind==='percentage'?'100':'16384';exactControls.hidden=size.kind!=='exact-dimensions';
    byID('export-exact-background-label').hidden=size.strategy!=='pad';
    byID('export-resolution-value-label').hidden=next.resolution===null;
    clearSingleNamingDownload();clearBatchFinalDownloads();batchFinalStatus='';updateExportValidation();renderBatchFinalControls();
    return readLocalExportSettings();
  }
  localExportPanel=mountLocalExportSettings(localExportContainer,{
    scope:JSON.stringify([location.origin,trialSession?.mode??'LOCAL_QA',trialSession?.principal?.id??'anonymous',session.api?.constructor?.name]),
    canUse:localExportReady,readSettings:readLocalExportSettings,applySettings:applyLocalExportSettings,
  });
  additionalDisposers.push(localExportPanel.dispose);accessListeners.add(localExportPanel.refresh);
  if(workspaceExportContext&&trialSession?.mode==='NODE_WORKSPACE'){
    workspaceExportNotice.textContent='Workspaceの実認証・所属を確認中です。確認完了まで共有操作は利用できません。';
    void createWorkspaceExportPresetEditorHost({trialSession,workspaceContext:workspaceExportContext,
      readSettings:readLocalExportSettings,applySettings:applyLocalExportSettings,canUse:localExportReady,signal:lifetime.signal})
      .then(connection=>{
        if(disposed||lifetime.signal.aborted)return;
        const panel=createWorkspaceExportPresetPanel({document,client:connection.client,host:connection.host});
        localExportContainer.after(panel.element);additionalDisposers.push(()=>panel.destroy());
        workspaceExportNotice.textContent='Node Workspaceの所属を確認しました。共有操作ごとに認証・権限を再確認します。適用先は単写真の4設定です。Final出力は別途実行してください。';
        void panel.reload();
      }).catch(()=>{if(!disposed&&!lifetime.signal.aborted)workspaceExportNotice.textContent='Workspaceの実認証・所属・API接続を確認できません。共有は未接続です。ローカル保存・書き出しは利用できます。';});
  }
  const existingChoices=adjustments.map(config=>({id:`SUITE:${config.key}`,name:config.label,source:'SUITE',category:config.group==='curve'?'曲線':config.group==='detail'?'質感・細部':config.group==='hsl'?'HSL':config.group==='color'?'色・HSL':'明るさ',status:'Webコードあり'}));
  existingChoices.push(...[['rotate','回転','光学・構図'],['crop','固定比率切り抜き','光学・構図'],['undo','Undo','ワークフロー'],['redo','Redo','ワークフロー'],['save','Recipe保存','ワークフロー'],['reload','Recipe再読込','ワークフロー'],['export-jpeg','JPEG書出し','取込・書出し'],['export-png','PNG書出し','取込・書出し'],['export-tiff','TIFF 8-bit書出し','取込・書出し']].map(([id,name,category])=>({id:`SUITE:${id}`,name,source:'SUITE',category,status:'Webコードあり'})));
  existingChoices.push({id:'SUITE:face-brightness',name:'顔の明るさ',source:'SUITE',category:'人物・被写体',status:state.personProcessingStatus==='PRODUCTION_PERSON_APPROVED'?'Webコードあり':'Privacy停止中',missing:state.personProcessingStatus!=='PRODUCTION_PERSON_APPROVED'});
  const localAIInputProvider=createLocalFaceAnalysisInputProvider({session,canUse:()=>!disposed&&!pending&&!access.reason()});
  additionalDisposers.push(localAIInputProvider.dispose);
  byID('export-section').append(mountFeatureCatalog(document,session.state?.personProcessingStatus,root,existingChoices,{
    localAIStatusProvider:createLocalAIBrowserStatusProvider(root),localAIManualTargets:LOCAL_AI_MANUAL_TARGETS,
    localAIInputProvider,localAIContextSubscriber:listener=>{
      const unsubscribe=session.subscribe(listener);accessListeners.add(listener);
      return()=>{unsubscribe();accessListeners.delete(listener);};
    },localAIDisposers:additionalDisposers,localAIHostAccess:()=>!disposed&&!pending&&!access.reason()
  }));
  function plannedExportName(format){
    const method=exportNameMethod.value,originalFilename=assetName(state.asset);
    if(!state.asset)throw Error('EXPORT_ORIGINAL_NAME_REQUIRED');
    const base={format,existingNames:completedDownloadNames};
    if(method==='revision'){
      const stem=originalFilename.replace(/\.[^.]+$/,'');
      return buildExportFilename({...base,originalFilename:`${stem}-r${state.revision}-final.raw`});
    }
    if(method==='original')return buildExportFilename({...base,originalFilename});
    if(method==='original-custom')return buildExportFilename({...base,originalFilename,method,customText:exportNameCustom.value});
    if(method==='custom-count'||method==='custom-sequence')return buildExportFilename({...base,originalFilename,method,customName:exportNameCustom.value,sequence:1,total:1});
    throw Error('EXPORT_NAMING_METHOD_UNSUPPORTED');
  }
  async function run(method,...args){
    const cancellation=method==='cancelExport';
    if(method==='exportFinal'&&(!state.asset||state.dirty||state.revision<1)){localError='保存済みRecipeが必要です。';render(state);return false;}
    if(method==='exportFinal'&&access.reason()){localError='書き出し権限が失効しています。';render(state);return false;}
    if(method==='exportFinal'&&(pending||state.busy||state.exporting)){localError='処理中は書き出しできません。';render(state);return false;}
    if(access.reason()&&!cancellation){render(state);return false;}
    if(disposed||(pending&&!cancellation)||((state.busy||state.exporting)&&!cancellation))return false;
    if(typeof session[method]!=='function'){localError=`${method}: NOT_CONNECTED`;render(state);return false;}
    if(!cancellation)pending=true;localError='';render(state);
    try {const captureDate=method==='exportFinal'&&exportNameMethod.value==='capture-date-original';const filename=method==='exportFinal'&&!captureDate?plannedExportName(args[0]?.format):null;const resolution=method==='exportFinal'?plannedExportResolution():undefined;const callArgs=method==='exportFinal'?[{...args[0],quality:plannedExportQuality(args[0]?.format,state.recipe),size:plannedExportSize(),...(resolution?{resolution}:{})}]:args;
      if(captureDate){const named=await exportTrialDngCaptureDateFinal({api:session.api,session,exportOptions:callArgs[0],existingNames:completedDownloadNames});publishDownload(named.blob,args[0]?.format,named.filename,{autoDownload:false});return true;}
      const result=await session[method](...callArgs);if(filename)publishDownload(result,args[0]?.format,filename);return true;}
    catch(error){localError=error instanceof Error?error.message:String(error);access.end(localError);return false;}
    finally{if(!cancellation)pending=false;if(!disposed)render(session.state??state);}
  }
  async function applyBatchSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(batchEditGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;batchOutcome=null;localError='';render(state);
    try{
      const result=await session.batchApplyCurrentRecipe(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'BATCH_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      batchOutcome={names,rows:displayRows,message:`コピー元 ${source.name} · revision ${source.revision}：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      batchOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'BATCH_RESULT_UNVERIFIED'})),message:`コピー元 ${source.name} · revision ${source.revision}：一括適用の結果を確認できませんでした。対象の保存状態を再確認してください。`};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncLevelsSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(levelsSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;levelsSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncLevels(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'LEVELS_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      levelsSyncOutcome={names,rows:displayRows,message:`Levelsのみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      levelsSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'LEVELS_SYNC_RESULT_UNVERIFIED'})),
        message:'Levels同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncGlowSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(glowSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;glowSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncGlow(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'GLOW_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      glowSyncOutcome={names,rows:displayRows,
        message:`Glowのみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      glowSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'GLOW_SYNC_RESULT_UNVERIFIED'})),
        message:'Glow同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncVignetteSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(vignetteSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;vignetteSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncVignette(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'VIGNETTE_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      vignetteSyncOutcome={names,rows:displayRows,
        message:`周辺光量のみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      vignetteSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'VIGNETTE_SYNC_RESULT_UNVERIFIED'})),
        message:'周辺光量同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncSelectiveSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(selectiveColorSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;selectiveSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncSelectiveColor(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'SELECTIVE_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      selectiveSyncOutcome={names,rows:displayRows,
        message:`Selective Colorのみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      selectiveSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'SELECTIVE_SYNC_RESULT_UNVERIFIED'})),
        message:'Selective Color同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncGrainSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(grainSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;grainSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncGrain(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'GRAIN_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      grainSyncOutcome={names,rows:displayRows,
        message:`Grainのみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      grainSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'GRAIN_SYNC_RESULT_UNVERIFIED'})),
        message:'Grain同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  async function syncCalibrationSelection(){
    const ids=[...batchTargetIDs],source={id:state.asset?.id,revision:state.revision,name:assetName(state.asset)};
    if(calibrationSyncGate(session,state,ids,{pending,blocked:Boolean(access.reason())}))return;
    const names=new Map((state.assets??[]).map(asset=>[asset.id,assetName(asset)]));
    pending=true;batchRunning=true;calibrationSyncOutcome=null;localError='';render(state);
    try{
      const result=await session.batchSyncCalibration(ids);
      if(disposed)return;
      const rows=verifiedBatchRows(result,source,ids);
      const displayRows=rows??ids.map(assetId=>({assetId,status:'unverified',reason:'CALIBRATION_SYNC_RESULT_UNVERIFIED'}));
      const saved=displayRows.filter(row=>row.status==='saved').length;
      calibrationSyncOutcome={names,rows:displayRows,
        message:`RGB色校正のみ同期：${saved}/${ids.length} 件の保存を確認。競合・未検証・失敗は成功に含めません。`};
      batchTargetIDs.clear();
    }catch(error){
      if(disposed)return;
      calibrationSyncOutcome={names,rows:ids.map(assetId=>({assetId,status:'unverified',reason:'CALIBRATION_SYNC_RESULT_UNVERIFIED'})),
        message:'RGB色校正同期の結果を確認できませんでした。対象の保存状態を再確認してください。'};
      localError=error instanceof Error?error.message:String(error);access.end(localError);
      batchTargetIDs.clear();
    }finally{pending=false;batchRunning=false;if(!disposed)render(session.state??state);}
  }
  function publishDownload(result,format,filename,{autoDownload=true}={}){
    if(access.reason())return;
    const blob=result instanceof Blob?result:result?.blob;
    if(!(blob instanceof Blob))throw Error('EXPORT_BLOB_MISSING');
    const type={jpeg:'image/jpeg',png:'image/png',tiff:'image/tiff'}[format];
    if(!type||blob.type!==type||blob.size===0)throw Error('ENCODER_FORMAT_MISMATCH');
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(blob);downloadAssetID=state.asset?.id;const link=byID('download-link');link.href=downloadURL;link.download=filename;link.textContent=`生成済み Final · ${filename}${autoDownload?'':'（クリックして保存）'}`;link.hidden=false;completedDownloadNames.add(filename);if(autoDownload)link.click();
  }
  function renderHistogram(histogram){
    if(!histogram?.includedPixels){for(const path of Object.values(histogramPaths))path.setAttribute('d','');clippingSummary.textContent='写真を読み込むと分布とクリッピングを表示します。';return;}
    const channels=['luma','red','green','blue'];const grouped={};let peak=0;
    for(const channel of channels){const bins=histogram.bins[channel],values=[];for(let column=0;column<64;column++){let count=0;for(let index=column*4;index<column*4+4;index++)count+=bins[index];values.push(count);peak=Math.max(peak,count);}grouped[channel]=values;}
    for(const channel of channels){const points=grouped[channel].map((count,column)=>`${column*4},${78-Math.round(74*Math.sqrt(count/peak))}`);histogramPaths[channel].setAttribute('d',`M${points.join(' L')}`);}
    const total=histogram.includedPixels,shadow=histogram.clipping.shadow.anyChannel,highlight=histogram.clipping.highlight.anyChannel;
    const percent=count=>`${(100*count/total).toFixed(1)}%`;
    clippingSummary.textContent=`表示中の8-bitプレビュー：黒側 ${percent(shadow)}、白側 ${percent(highlight)}（RGBのいずれかが端値）。RAW原本の階調喪失判定ではありません。`;
  }
  function renderLevelsHistogram(after){
    const histogram=after?state.levelsHistogram:null;
    const active=canSampleLevels(session,{...state,afterURL:after?state.afterURL:null},{pending,blocked:Boolean(access.reason()),view:mode});
    for(const channel of LEVELS_CHANNELS){
      const {button,graph,path}=levelsHistogramRows.get(channel),bins=histogram?.bins?.[channel];
      path.setAttribute('d',histogram?.includedPixels?levelsHistogramPath(bins):'');
      button.disabled=!active;button.setAttribute('aria-pressed',String(channel===levelsChannel));
      graph.setAttribute('aria-label',`${button.textContent}のLevelsヒストグラム。${histogram?.includedPixels?`表示画素 ${histogram.includedPixels} 件`:'写真を読み込むと表示'}`);
    }
    if(!active&&levelsEndpoint)levelsEndpoint=null;
    for(const [endpoint,id] of [['black','levels-pick-black'],['white','levels-pick-white']]){
      const button=byID(id);button.disabled=!active;button.setAttribute('aria-pressed',String(active&&levelsEndpoint===endpoint));
    }
    const image=byID('after-image');image.classList.toggle('is-levels-sampling',Boolean(active&&levelsEndpoint));
    if(active&&levelsEndpoint){image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label',`${levelsChannel}の${levelsEndpoint==='black'?'黒点':'白点'}をAfter写真から採取。矢印キーで位置を動かし、Enterで確定。Escで中止`);}
    else{image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-label');}
    levelsReticle.hidden=!(active&&levelsEndpoint);
    byID('levels-sample-status').textContent=levelsNotice||(!histogram?.includedPixels?'写真を読み込むと4チャンネルの分布を表示します。':levelsEndpoint?`${levelsChannel}の${levelsEndpoint==='black'?'黒点':'白点'}を採取中。After写真をクリック、または写真へフォーカスして矢印キー・Enter。Escで中止。`:`${levelsChannel}を選択中。黒点または白点のスポイトを選んでください。`);
    positionLevelsReticle();
  }
  function setImage(id,url){const image=byID(id);const safe=safeImageURL(url);if(safe){if(image.getAttribute('src')!==safe)image.src=safe;}else image.removeAttribute('src');image.hidden=!safe;return Boolean(safe);}
  function positionAfterOverlay(id){
    const image=byID('after-image'),overlay=byID(id),figure=byID('after-figure');
    if(image.hidden||overlay.hidden||figure.hidden)return;
    const photo=image.getBoundingClientRect(),frame=figure.getBoundingClientRect();
    if(photo.width<=0||photo.height<=0)return;
    overlay.style.left=`${photo.left-frame.left}px`;overlay.style.top=`${photo.top-frame.top}px`;
    overlay.style.width=`${photo.width}px`;overlay.style.height=`${photo.height}px`;
  }
  function positionLevelsReticle(){
    if(levelsReticle.hidden)return;
    const image=byID('after-image'),figure=byID('after-figure');
    if(!image.naturalWidth||!image.naturalHeight||image.hidden||figure.hidden)return;
    const photo=image.getBoundingClientRect(),frame=figure.getBoundingClientRect();
    const scale=Math.min(photo.width/image.naturalWidth,photo.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    levelsReticle.style.left=`${photo.left-frame.left+(photo.width-width)/2+levelsPoint.x*width}px`;
    levelsReticle.style.top=`${photo.top-frame.top+(photo.height-height)/2+levelsPoint.y*height}px`;
  }
  const localBrushDefaults=()=>({inputBlack:0,inputWhite:255,gamma:1.2,outputBlack:0,outputWhite:255});
  const localBrushInputs=()=>[...localBrushSection.querySelectorAll('[data-local-brush-level]')];
  function setLocalBrushLevelInputs(){
    const channel=byID('local-brush-channel').value,saved=state.recipe?.parameters?.extendedParameters?.localLevels?.levels?.[channel],values={...localBrushDefaults(),...(saved?{gamma:1}:{}),...saved};
    for(const input of localBrushInputs())input.value=String(values[input.dataset.localBrushLevel]);
  }
  function readLocalBrushLevelInputs(){
    const result={};for(const input of localBrushInputs()){if(!input.value.trim())throw Error('LOCAL_BRUSH_LEVELS_INVALID');result[input.dataset.localBrushLevel]=Number(input.value);}
    return result;
  }
  function localBrushGeometry(){
    const after=byID('after-image'),before=byID('before-image'),params=state.recipe?.parameters;
    if(!after.complete||!before.complete||after.hidden||before.naturalWidth<1||before.naturalHeight<1||after.naturalWidth<1||after.naturalHeight<1||
       after.getAttribute('src')!==safeImageURL(state.afterURL)||before.getAttribute('src')!==safeImageURL(state.beforeURL))return null;
    let source;try{source=sourceDimensions(session.proxy);}catch{return null;}
    let display;try{display=currentBrushDisplayGeometry(session);}catch{return null;}
    const geometry={...display,afterRect:after.getBoundingClientRect(),beforeRect:mode==='split'?byID('before-figure').getBoundingClientRect():undefined,
      sceneGeometry:params?.extendedParameters?.sceneGeometry,sourceWidth:source.width,sourceHeight:source.height,
      naturalWidth:after.naturalWidth,naturalHeight:after.naturalHeight,uprightWidth:before.naturalWidth,uprightHeight:before.naturalHeight,
      rotationDegrees:params?.rotationDegrees??0,crop:params?.extendedParameters?.crop,canvasExpand:params?.extendedParameters?.canvasExpand,view:mode};
    if(geometry.afterRect.width<1||geometry.afterRect.height<1)return null;
    let aligned=false;for(const x of [.5,.25,.75,.1,.9]){for(const y of [.5,.25,.75,.1,.9]){
      try{mapAfterImagePointToLocalBrushPoint({...geometry,afterX:x,afterY:y});aligned=true;break;}catch{/* Try another point in the visible source content. */}
    }if(aligned)break;}
    if(!aligned)return null;
    return geometry;
  }
  function firstLocalBrushKeyboardPoint(geometry){
    for(const x of [.5,.25,.75,.1,.9])for(const y of [.5,.25,.75,.1,.9]){
      try{mapAfterImagePointToLocalBrushPoint({...geometry,afterX:x,afterY:y});return {x,y};}catch{/* Outside actual image content. */}
    }
    return null;
  }
  function savedBWStrokes(){const value=state.recipe?.parameters?.extendedParameters?.bwEdgeManual;return value?{subjectStrokes:structuredClone(value.subjectStrokes),correctionStrokes:structuredClone(value.correctionStrokes)}:emptyBWStrokes();}
  const bwHasBothLayers=value=>value.subjectStrokes.some(stroke=>stroke.operation==='ADD')&&value.correctionStrokes.some(stroke=>stroke.operation==='ADD');
  function bwReady(){return !shadowActive&&!originalShadowActive&&trialSession?.mode==='INVITED_LOCAL_TRIAL'&&session.bwEdgeManualAvailable===true&&typeof session.setBWEdgeManualStrokes==='function'&&!bwFailureBlocked&&Boolean(state.asset)&&state.revision>0&&!state.dirty&&!state.busy&&!state.exporting&&!pending&&!bwApplying&&!access.reason()&&mode==='after'&&Boolean(localBrushGeometry());}
  function renderBWManual(){
    const key=`${state.asset?.id??''}:${state.revision}:${JSON.stringify(state.recipe?.parameters?.extendedParameters?.bwEdgeManual??null)}`;
    if(key!==bwRecipeKey&&!bwDraftDirty&&!bwApplying){bwRecipeKey=key;bwDraft=savedBWStrokes();bwComponent.reset(bwDraft);}
    const ready=bwReady();if(!ready)bwManualActive=false;
    bwComponent.setEnabled(ready&&bwManualActive);
    byID('bw-edge-mode').disabled=!ready;byID('bw-edge-mode').setAttribute('aria-pressed',String(bwManualActive));byID('bw-edge-mode').textContent=bwManualActive?'ブラシを終了':'ブラシを開始';
    const complete=bwHasBothLayers(bwDraft),confirm=byID('bw-edge-confirm');confirm.disabled=!ready||!complete||!bwDraftDirty;byID('bw-edge-apply').disabled=!ready||!complete||!bwDraftDirty||!confirm.checked;
    byID('bw-edge-editor-status').textContent=bwNotice||(bwDraftDirty?complete?'二層の下書きです。本人確認後にRecipeへ適用してください。':'未適用の下書きです。被写体と境界補正の両方に追加strokeを描いてください。':!ready?'認証済み試用・保存済みRecipe・After写真・権限を確認してください。':'二層ブラシを開始できます。');
  }
  bwComponent=mountBWEdgeManualUI({root:byID('bw-edge-manual-root'),afterImage:byID('after-image'),getGeometry:localBrushGeometry,
    onChange:strokes=>{bwDraft=structuredClone(strokes);bwDraftDirty=JSON.stringify(bwDraft)!==JSON.stringify(savedBWStrokes());bwNotice='';byID('bw-edge-confirm').checked=false;renderBWManual();},initial:emptyBWStrokes(),enabled:false});
  function shadowReady(){return !originalShadowActive&&trialSession?.mode==='INVITED_LOCAL_TRIAL'&&session.addShadowManualAvailable===true&&typeof session.setAddShadowManualDocument==='function'&&Boolean(state.asset)&&state.revision>0&&!state.dirty&&!state.busy&&!state.exporting&&!pending&&!shadowApplying&&!access.reason()&&state.shadowVerification!=='unverified'&&mode==='after'&&Boolean(localBrushGeometry());}
  function shadowContext(){
    const source=sourceDimensions(session.proxy),geometry=localBrushGeometry();
    return {assetID:state.asset.id,originalSHA256:state.asset.sha256,
      sourceWidth:source.width,sourceHeight:source.height,savedRevision:state.revision,
      ...(geometry??{}),ready:shadowReady(),dirty:state.dirty,
      busy:Boolean(state.busy||state.exporting||pending),permissionExpired:Boolean(access.reason()),view:mode};
  }
  function shadowBackdrops(){return (state.assets??[]).filter(asset=>asset.id!==state.asset?.id&&asset.cloudSafe===true&&asset.deletedAt===null&&typeof asset.sha256==='string'&&/^[0-9a-f]{64}$/i.test(asset.sha256)).map(asset=>({id:asset.id,sha256:asset.sha256,name:asset.name}));}
  function renderShadowManual(){
    if(shadowApplying){if(access.reason())shadowComponent?.setEnabled(false);return;}
    const document=state.recipe?.parameters?.extendedParameters?.addShadowManual;
    const key=state.asset&&state.revision>0&&session.addShadowManualAvailable===true?
      `${state.asset.id}:${state.asset.sha256}:${state.revision}:${JSON.stringify(document??null)}`:null;
    if(key!==shadowMountKey){shadowComponent?.dispose();shadowComponent=null;shadowMountKey=key;shadowActive=false;
      if(key){try{shadowComponent=mountAddShadowManualUI({root:byID('add-shadow-manual-root'),afterImage:byID('after-image'),getContext:shadowContext,
        listBackdrops:shadowBackdrops,initial:document??undefined,enabled:false,
        onSubmit:async(next,options)=>{shadowApplying=true;
          try{if(options.savedRevision!==state.revision||options.selectedBackdropID!==next.binding.backdropID||options.signal?.aborted)throw Error('ADD_SHADOW_UI_STALE_OR_CANCELLED');
            await session.setAddShadowManualDocument(next,{replaceBackdrop:options.replaceBackdrop,signal:options.signal});
            const applied=session.state?.recipe?.parameters?.extendedParameters?.addShadowManual;
            if(options.signal?.aborted||!applied||JSON.stringify(validateAddShadowManualDocument(applied,next.binding))!==
              JSON.stringify(validateAddShadowManualDocument(next,next.binding)))throw Error('ADD_SHADOW_UI_APPLY_NOT_CONFIRMED');
            return {applied:true};
          }finally{setTimeout(()=>{shadowApplying=false;shadowActive=false;if(!disposed)render(session.state??state);},0);}}
      });}catch(error){shadowMountKey=null;shadowNotice=`手動UIを開けません：${error.message}`;}}
    }
    const ready=shadowReady()&&Boolean(shadowComponent);
    if(!ready)shadowActive=false;
    shadowComponent?.setEnabled(ready&&shadowActive);
    byID('add-shadow-mode').disabled=!ready;
    byID('add-shadow-mode').setAttribute('aria-pressed',String(shadowActive));
    byID('add-shadow-mode').textContent=shadowActive?'手動ブラシを終了':'手動ブラシを開始';
    byID('add-shadow-editor-status').textContent=shadowNotice||(state.shadowVerification==='unverified'?'保存版の背景・対象確認が未完了です。再読込後に確認してください。':ready?'認証済みの対象と背景を実処理で再確認します。':'保存済みRecipe、After写真、本人権限を確認してください。');
  }
  function stopOriginalShadow({clearBackdrop=false}={}){
    originalShadowGeneration++;originalShadowBridge?.dispose();originalShadowBridge=null;
    originalShadowActive=false;originalShadowChecking=false;
    if(clearBackdrop)originalShadowBackdropID='';
  }
  function originalShadowGate(){
    const image=byID('after-image');
    return originalShadowEditorGate(session,state,{trialMode:invited?trialSession?.mode:null,
      backdropID:originalShadowBackdropID,view:mode,
      pending:pending||originalShadowChecking,
      blocked:Boolean(access.reason()||trialSession?.endedReason||invalidSession),
      otherBrushActive:bwManualActive||shadowActive||localBrushMode!=='off'||Boolean(levelsEndpoint),
      geometryReady:Boolean(localBrushGeometry()),
      imageReady:image.complete&&image.naturalWidth>0&&image.naturalHeight>0&&
        image.getAttribute('src')===safeImageURL(state.afterURL)});
  }
  function renderOriginalShadowManual(){
    const targetID=state.asset?.id??null;
    if(targetID!==originalShadowTargetID){stopOriginalShadow({clearBackdrop:true});
      originalShadowTargetID=targetID;originalShadowNotice='';}
    const select=byID('original-shadow-backdrop'),options=[element('option','','背景写真を選択')];
    options[0].value='';
    for(const asset of state.assets??[]){
      if(asset.id===targetID||asset.cloudSafe!==true||asset.deletedAt!==null)continue;
      const option=element('option','',assetName(asset));option.value=asset.id;options.push(option);
    }
    select.replaceChildren(...options);
    if(!options.some(option=>option.value===originalShadowBackdropID)){
      if(originalShadowBackdropID)stopOriginalShadow({clearBackdrop:true});
    }
    select.value=originalShadowBackdropID;
    select.disabled=originalShadowActive||originalShadowChecking||!targetID||Boolean(access.reason());
    const gate=originalShadowGate();
    if(originalShadowBridge&&!originalShadowChecking&&!state.busy){
      // During this bridge's own CAS readback/reload, disabling its UI would
      // abort the in-flight callback. Its getContext still refuses new input.
      originalShadowBridge.sync();
    }
    const button=byID('original-shadow-mode');
    button.disabled=originalShadowChecking||!originalShadowActive&&Boolean(gate);
    button.setAttribute('aria-pressed',String(originalShadowActive));
    button.textContent=originalShadowActive?'手動ブラシを終了':'対象・背景を確認してブラシを開始';
    const verified=originalShadowActive&&originalShadowBridge?.getContext().ready===true;
    byID('original-shadow-editor-status').textContent=originalShadowChecking?
      '対象と背景のOriginal・保存版を確認中です。':
      originalShadowActive&&!verified?
        '操作を停止しました。写真・権限・保存版を再読込して確認してください。':
        originalShadowNotice||(verified?
          '本人・両Original・保存Recipe版を確認済みです。二層範囲を指定してください。':
          gate?'保存済み対象、明示背景、After写真、本人権限を確認してください。':
          '本人の操作で対象と背景を確認してからブラシを開始します。');
  }
  function localBrushActive(){return !bwManualActive&&!shadowActive&&!originalShadowActive&&canPaintLocalLevels(session,state,{pending,blocked:Boolean(access.reason()),view:mode,geometryReady:Boolean(localBrushGeometry())});}
  function renderLocalBrush(){
    const local=state.recipe?.parameters?.extendedParameters?.localLevels,recipeKey=`${state.asset?.id??''}:${JSON.stringify(local??null)}`;
    if(recipeKey!==localBrushRecipeKey){localBrushRecipeKey=recipeKey;setLocalBrushLevelInputs();}
    const geometry=localBrushGeometry(),active=localBrushActive();
    if((!active||localBrushMode==='erase'&&!local?.strokes?.length)&&localBrushMode!=='off'){localBrushMode='off';localBrushPointer=null;}
    for(const button of localBrushSection.querySelectorAll('[data-local-brush-mode]')){button.disabled=button.dataset.localBrushMode!=='off'&&(!active||button.dataset.localBrushMode==='erase'&&!local?.strokes?.length);button.setAttribute('aria-pressed',String(button.dataset.localBrushMode===localBrushMode));}
    for(const input of [...localBrushInputs(),byID('local-brush-radius'),byID('local-brush-hardness'),byID('local-brush-channel')])input.disabled=!active;
    byID('local-brush-radius-value').textContent=`${byID('local-brush-radius').value}%`;
    byID('local-brush-hardness-value').textContent=`${byID('local-brush-hardness').value}%`;
    byID('local-brush-reset').disabled=!active||!local;
    const image=byID('after-image');image.classList.toggle('is-local-brushing',active&&localBrushMode!=='off');
    if(active&&localBrushMode!=='off'){image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label',`After写真を${localBrushMode==='add'?'追加':'消去'}ブラシで編集。ドラッグまたは矢印キーで位置、Enterでstroke、Escで終了`);image.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown Enter Escape');}
    else if(!levelsEndpoint&&!bwManualActive&&!shadowActive&&!originalShadowActive){image.removeAttribute('tabindex');image.removeAttribute('role');image.removeAttribute('aria-label');image.removeAttribute('aria-keyshortcuts');}
    byID('local-brush-status').textContent=localBrushNotice||(state.dirty?'未保存の変更があります。保存してから次のstrokeを追加してください。':!geometry?'AfterとBeforeの寸法・回転・Crop・余白を確認できません。座標の安全確認ができるまでブラシは使えません。':!active?'写真と権限を確認してから使用してください。':localBrushMode==='off'?`${local?.strokes?.length??0} stroke保存中。追加または消去を選んでください。`:`${localBrushMode==='add'?'追加':'消去'}中。After写真をドラッグ、または写真へフォーカスして矢印キー・Enter。`);
    localBrushOverlay.replaceChildren();localBrushOverlay.setAttribute('hidden','');
    if(!geometry||byID('after-figure').hidden)return;
    const rect=geometry.afterRect,frame=byID('after-figure').getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    localBrushOverlay.style.left=`${rect.left-frame.left}px`;localBrushOverlay.style.top=`${rect.top-frame.top}px`;
    localBrushOverlay.style.width=`${rect.width}px`;localBrushOverlay.style.height=`${rect.height}px`;
    localBrushOverlay.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    try{
      appendProjectedBrushOverlay(localBrushOverlay,geometry,local?.strokes??[]);
      if(active&&localBrushMode!=='off'){
        const original=mapAfterImagePointToLocalBrushPoint({...geometry,afterX:localBrushKeyboardPoint.x,afterY:localBrushKeyboardPoint.y});
        appendProjectedBrushOverlay(localBrushOverlay,geometry,[{points:[original],radius:Number(byID('local-brush-radius').value)/100,hardness:Number(byID('local-brush-hardness').value)/100,mode:'add'}],{color:[255,190,20],opacity:.45});
      }
    }catch{/* Stale or out-of-content cursor is never projected onto another frame. */}
    if(localBrushOverlay.childNodes.length)localBrushOverlay.removeAttribute('hidden');
  }
  function positionPreviewOverlays(){positionAfterOverlay('clipping-overlay');positionAfterOverlay('glow-mask-overlay');positionLevelsReticle();renderLocalBrush();}
  async function sampleLevels(point){
    if(!levelsEndpoint||!canSampleLevels(session,state,{pending,blocked:Boolean(access.reason()),view:mode})||byID('after-image').hidden)return;
    const endpoint=levelsEndpoint,channel=levelsChannel;pending=true;levelsNotice='画素を採取しています…';render(state);
    try{
      const result=await session.sampleLevelsAt({x:point.x,y:point.y,channel,endpoint});
      if(!result||result.key!==`levels.${channel}.${endpoint==='black'?'inputBlack':'inputWhite'}`||!Number.isInteger(result.value))throw Error('LEVELS_SAMPLE_UNVERIFIED');
      levelsPoint=point;levelsEndpoint=null;levelsNotice=`${channel}の${endpoint==='black'?'黒点':'白点'}に ${result.value} を設定しました。保存前のRecipe変更です。`;localError='';
    }catch(error){localError=error?.message??String(error);levelsNotice='採取できませんでした。Levelsの値は変更しません。';}
    finally{pending=false;if(!disposed)render(session.state??state);}
  }
  function renderToneControls(after){
    const active=after&&canUseHistogramControls(session,state,{pending,blocked:Boolean(access.reason())});
    for(const button of toneRegions.children){const region=button.dataset.toneRegion,key=HISTOGRAM_TONE_REGIONS[region].key,value=adjustmentValue(state.recipe?.parameters??{},key);
      button.disabled=!active;button.setAttribute('aria-label',`${toneLabels[region]} ${Number.isFinite(value)?formatValue(value):'0'}。左右矢印キーまたはドラッグで調整`);}
  }
  function renderBatchControls({rebuild=true}={}){
    const source=state.asset,sourceKey=source&&!state.dirty&&state.revision>0?`${source.id}:${state.revision}`:null;
    if(sourceKey!==batchSourceKey){batchSourceKey=sourceKey;batchTargetIDs.clear();batchOutcome=null;levelsSyncOutcome=null;glowSyncOutcome=null;vignetteSyncOutcome=null;selectiveSyncOutcome=null;grainSyncOutcome=null;calibrationSyncOutcome=null;}
    const targets=(state.assets??[]).filter(asset=>asset.id!==source?.id),visibleIDs=new Set(targets.map(asset=>asset.id));
    for(const id of batchTargetIDs)if(!visibleIDs.has(id))batchTargetIDs.delete(id);
    const canSelect=session.batchAvailable===true&&(typeof session.batchApplyCurrentRecipe==='function'||typeof session.batchSyncLevels==='function')&&Boolean(sourceKey)&&!pending&&!batchRunning&&!state.busy&&!state.exporting&&!access.reason();
    byID('batch-source').textContent=sourceKey?`コピー元：${assetName(source)} · 保存済みrevision ${state.revision}`:'コピー元の写真を先に保存してください。未保存の変更は一括適用できません。';
    const targetList=byID('batch-target-list');
    if(rebuild){targetList.replaceChildren();if(!targets.length)targetList.append(element('p','control-help','ほかの写真がありません。'));
      for(const asset of targets){const label=element('label','batch-target');const input=element('input');input.type='checkbox';input.name='batch-target';input.value=asset.id;input.checked=batchTargetIDs.has(asset.id);input.disabled=!canSelect;label.append(input,element('span','',`${assetName(asset)} · ${shortID(asset.id)}`));targetList.append(label);}}
    else for(const input of targetList.querySelectorAll('input[name="batch-target"]'))input.disabled=!canSelect;
    byID('batch-selection').textContent=`適用先 ${batchTargetIDs.size} 件を選択`;
    const gate=batchEditGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('batch-help').textContent=gate==='BATCH_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':gate==='BATCH_ACCESS_EXPIRED'?'利用権限が失効しています。':gate==='BATCH_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してから選択してください。':gate==='BATCH_BUSY'?'現在の処理が終わるまでお待ちください。':gate==='BATCH_TARGETS_REQUIRED'?'適用先の写真を明示選択してください。':gate?'選択した写真を確認できません。':'選択した写真ごとに権限とrevisionを確認して保存します。';
    byID('batch-apply').disabled=Boolean(gate);
    const outcome=byID('batch-outcome'),results=byID('batch-results');results.replaceChildren();
    outcome.textContent=batchOutcome?.message??'';
    for(const row of batchOutcome?.rows??[]){const name=batchOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';results.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const levelsGate=levelsSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('levels-sync-apply').disabled=Boolean(levelsGate);
    byID('levels-sync-help').textContent=levelsGate==='LEVELS_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':levelsGate==='LEVELS_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':levelsGate==='LEVELS_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':levelsGate==='LEVELS_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':levelsGate==='LEVELS_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':levelsGate?'選択した写真を確認できません。':'コピー元のLevelsだけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('levels-sync-outcome').textContent=levelsSyncOutcome?.message??'';
    const levelsResults=byID('levels-sync-results');levelsResults.replaceChildren();
    for(const row of levelsSyncOutcome?.rows??[]){const name=levelsSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';levelsResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const glowGate=glowSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('glow-sync-apply').disabled=Boolean(glowGate);
    byID('glow-sync-help').textContent=glowGate==='GLOW_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':glowGate==='GLOW_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':glowGate==='GLOW_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':glowGate==='GLOW_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':glowGate==='GLOW_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':glowGate?'選択した写真を確認できません。':'コピー元のGlowだけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('glow-sync-outcome').textContent=glowSyncOutcome?.message??'';
    const glowResults=byID('glow-sync-results');glowResults.replaceChildren();
    for(const row of glowSyncOutcome?.rows??[]){const name=glowSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';glowResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const vignetteGate=vignetteSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('vignette-sync-apply').disabled=Boolean(vignetteGate);
    byID('vignette-sync-help').textContent=vignetteGate==='VIGNETTE_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':vignetteGate==='VIGNETTE_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':vignetteGate==='VIGNETTE_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':vignetteGate==='VIGNETTE_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':vignetteGate==='VIGNETTE_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':vignetteGate?'選択した写真を確認できません。':'コピー元の周辺光量だけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('vignette-sync-outcome').textContent=vignetteSyncOutcome?.message??'';
    const vignetteResults=byID('vignette-sync-results');vignetteResults.replaceChildren();
    for(const row of vignetteSyncOutcome?.rows??[]){const name=vignetteSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';vignetteResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const selectiveGate=selectiveColorSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('selective-sync-apply').disabled=Boolean(selectiveGate);
    byID('selective-sync-help').textContent=selectiveGate==='SELECTIVE_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':selectiveGate==='SELECTIVE_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':selectiveGate==='SELECTIVE_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':selectiveGate==='SELECTIVE_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':selectiveGate==='SELECTIVE_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':selectiveGate?'選択した写真を確認できません。':'コピー元のSelective Colorだけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('selective-sync-outcome').textContent=selectiveSyncOutcome?.message??'';
    const selectiveResults=byID('selective-sync-results');selectiveResults.replaceChildren();
    for(const row of selectiveSyncOutcome?.rows??[]){const name=selectiveSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';selectiveResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const grainGate=grainSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('grain-sync-apply').disabled=Boolean(grainGate);
    byID('grain-sync-help').textContent=grainGate==='GRAIN_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':grainGate==='GRAIN_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':grainGate==='GRAIN_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':grainGate==='GRAIN_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':grainGate==='GRAIN_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':grainGate?'選択した写真を確認できません。':'コピー元のGrainだけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('grain-sync-outcome').textContent=grainSyncOutcome?.message??'';
    const grainResults=byID('grain-sync-results');grainResults.replaceChildren();
    for(const row of grainSyncOutcome?.rows??[]){const name=grainSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';grainResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
    const calibrationGate=calibrationSyncGate(session,state,[...batchTargetIDs],{pending:pending||batchRunning,blocked:Boolean(access.reason())});
    byID('calibration-sync-apply').disabled=Boolean(calibrationGate);
    byID('calibration-sync-help').textContent=calibrationGate==='CALIBRATION_SYNC_AUTHENTICATED_STORAGE_REQUIRED'?'本人確認のある保存先でのみ利用可能':calibrationGate==='CALIBRATION_SYNC_ACCESS_EXPIRED'?'利用権限が失効しています。':calibrationGate==='CALIBRATION_SYNC_SAVED_SOURCE_REQUIRED'?'コピー元の写真を保存してください。':calibrationGate==='CALIBRATION_SYNC_BUSY'?'現在の処理が終わるまでお待ちください。':calibrationGate==='CALIBRATION_SYNC_TWO_TARGETS_REQUIRED'?'適用先を2〜20件、明示選択してください。':calibrationGate?'選択した写真を確認できません。':'コピー元のRGB色校正だけを保存します。各対象の権限・版数・Originalを検証します。';
    byID('calibration-sync-outcome').textContent=calibrationSyncOutcome?.message??'';
    const calibrationResults=byID('calibration-sync-results');calibrationResults.replaceChildren();
    for(const row of calibrationSyncOutcome?.rows??[]){const name=calibrationSyncOutcome.names.get(row.assetId)??shortID(row.assetId);const label=row.status==='saved'?'保存確認済み':row.status==='conflict'?'競合・未適用':row.status==='unverified'?'保存状態が未検証':'適用できませんでした';const suffix=row.status==='saved'?` · revision ${row.revision}`:row.reason?` · ${row.reason}`:'';calibrationResults.append(element('li',`batch-result-${row.status}`,`${name}：${label}${suffix}`));}
  }
  let batchFinalSourceKey=null;
  function renderBatchFinalControls(){
    const sourceKey=state.asset&&!state.dirty&&state.revision>0?`${state.asset.id}:${state.revision}`:null;
    if(sourceKey!==batchFinalSourceKey){batchFinalSourceKey=sourceKey;batchFinalIDs=[];clearBatchFinalDownloads();batchFinalStatus='';}
    const assets=state.assets??[],available=new Set(assets.map(asset=>asset.id));
    if(batchFinalIDs.some(id=>!available.has(id))){batchFinalIDs=batchFinalIDs.filter(id=>available.has(id));clearBatchFinalDownloads();batchFinalStatus='選択した写真の一覧が変わりました。順序を確認してください。';}
    const makeupKey=batchMakeupSnapshot();
    if(makeupKey!==batchMakeupKey||session.api!==batchMakeupAPI||access.reason()){
      batchMakeupKey=makeupKey;batchMakeupAPI=session.api;invalidateBatchMakeup();
    }
    const shadowKey=batchShadowSnapshot();
    if(shadowKey!==batchShadowKey||session.api!==batchShadowAPI||access.reason()){
      batchShadowKey=shadowKey;batchShadowAPI=session.api;invalidateBatchShadow();
    }
    const gate=batchFinalGate(session,state,batchFinalIDs,{pending,blocked:Boolean(access.reason())});
    const selectable=(session.batchFinalAvailable??session.batchAvailable)===true&&typeof session.exportBatchFinal==='function'&&Boolean(sourceKey)&&!pending&&!state.busy&&!state.exporting&&!access.reason();
    batchMakeupLoad.disabled=!selectable||batchFinalIDs.length<2||batchMakeupLoading||typeof session.getBatchSavedMakeupConsentScope!=='function';
    for(const input of batchMakeupChecks.values())input.disabled=!selectable||batchMakeupLoading;
    const makeupIncomplete=batchMakeupLoading||batchMakeupScope?.some(row=>!batchMakeupChecks.get(row.assetId)?.checked);
    batchShadowLoad.disabled=!selectable||batchFinalIDs.length<2||batchShadowLoading||typeof session.getBatchSavedShadowConsentScope!=='function';
    for(const input of batchShadowChecks.values())input.disabled=!selectable||batchShadowLoading;
    const shadowIncomplete=batchShadowLoading||batchShadowScope?.some(row=>!batchShadowChecks.get(row.assetId)?.checked);
    const list=byID('batch-final-assets');list.replaceChildren();
    if(!assets.length)list.append(element('p','control-help','保存済み写真がありません。'));
    for(const asset of assets){
      const row=element('div','batch-final-asset'),index=batchFinalIDs.indexOf(asset.id);
      const label=element('label','batch-final-choice'),input=element('input');input.type='checkbox';input.name='batch-final-asset';input.value=asset.id;input.checked=index>=0;input.disabled=!selectable||(index<0&&batchFinalIDs.length>=20);
      label.append(input,element('span','',`${assetName(asset)} · ${shortID(asset.id)}`));row.append(label);
      if(index>=0){row.append(element('span','batch-final-order',`${index+1}番目`));for(const [direction,text] of [['up','↑'],['down','↓']]){const button=element('button','batch-final-move',text);button.type='button';button.dataset.batchFinalMove=direction;button.dataset.batchFinalAssetId=asset.id;button.setAttribute('aria-label',`${assetName(asset)}を${direction==='up'?'前':'後'}へ移動`);button.disabled=!selectable||direction==='up'&&index===0||direction==='down'&&index===batchFinalIDs.length-1;row.append(button);}}
      list.append(row);
    }
    byID('batch-final-selection').textContent=batchFinalIDs.length?`書き出し順：${batchFinalIDs.map((id,index)=>`${index+1}. ${assetName(assets.find(asset=>asset.id===id))}`).join(' → ')}`:'書き出す写真を2件以上、順番に選んでください。';
     const method=byID('batch-final-naming').value,custom=['custom-count','custom-sequence','original-custom'].includes(method);byID('batch-final-custom-label').hidden=!custom;
     byID('batch-final-custom-label').firstChild.textContent=method==='original-custom'?'追加する文字':'指定名';
     byID('batch-final-custom').placeholder=method==='original-custom'?'例：仕上げA':'例：SUITE selection';
    for(const id of ['batch-final-format','batch-final-naming','batch-final-custom'])byID(id).disabled=!selectable;
    let settingsError=method==='capture-date-original'&&!(session.api instanceof TrialClient)?'EXPORT_CAPTURE_DATE_TRIAL_REQUIRED':'';
    try{
      plannedExportSize();plannedExportResolution();
      plannedExportQuality(byID('batch-final-format').value,batchFinalIDs.includes(state.asset?.id)?state.recipe:undefined);
       if(batchFinalIDs.length>=2)validateBatchFinalNames({assets,orderedIds:batchFinalIDs,
         format:byID('batch-final-format').value,method,
         customName:byID('batch-final-custom').value,existingNames:completedDownloadNames});
    }catch(error){settingsError=error?.message??String(error);}
    byID('batch-final-start').disabled=Boolean(gate||settingsError||makeupIncomplete||shadowIncomplete);
    batchOutputForm.setDisabled((typeof session.exportBatchFinal!=='function'||Boolean(gate||settingsError||makeupIncomplete||shadowIncomplete))&&!batchOutputRunning);
    byID('batch-final-cancel').hidden=!batchFinalRunning;byID('batch-final-cancel').disabled=!batchFinalRunning||typeof session.cancelExport!=='function';
    byID('batch-final-clear').hidden=!batchFinalDownloads.length;byID('batch-final-clear').disabled=batchFinalRunning;
    byID('batch-final-status').textContent=batchFinalStatus||settingsError||({BATCH_FINAL_AUTHENTICATED_STORAGE_REQUIRED:'本人確認のある保存先でのみ利用可能です。',BATCH_FINAL_ACCESS_EXPIRED:'書き出し権限が失効しました。',BATCH_FINAL_SAVED_SOURCE_REQUIRED:'現在の写真を保存してから選択してください。',BATCH_FINAL_BUSY:'処理中です。',BATCH_FINAL_SELECTION_REQUIRED:'2〜20件を選択してください。',BATCH_FINAL_TOO_LARGE:'最大20件です。',BATCH_FINAL_SELECTION_INVALID:'選択した写真を確認できません。'}[gate]??'全件成功した場合のみ個別リンクを表示します。');
    const downloads=byID('batch-final-downloads');downloads.replaceChildren();
    for(const file of batchFinalDownloads){const item=element('li','batch-final-download'),link=element('a','download-link',`${file.sequence}/${file.total} · ${file.name}`);link.href=file.url;link.download=file.name;item.append(link);downloads.append(item);}
  }
  async function startBatchFinal(outputSharpening){
    const ids=[...batchFinalIDs],gate=batchFinalGate(session,state,ids,{pending,blocked:Boolean(access.reason())});
    if(gate)return false;
    if(batchMakeupKey!==batchMakeupSnapshot()||batchMakeupAPI!==session.api){invalidateBatchMakeup();renderBatchFinalControls();return false;}
    if(batchMakeupLoading||batchMakeupScope?.some(row=>!batchMakeupChecks.get(row.assetId)?.checked))return false;
    const makeupGeneration=batchMakeupGeneration,makeupConsents=(batchMakeupScope??[]).map(({assetId,sha256,revision,personIDs})=>({assetId,sha256,revision,personIDs:[...personIDs],confirmed:true}));
    if(batchShadowKey!==batchShadowSnapshot()||batchShadowAPI!==session.api){invalidateBatchShadow();renderBatchFinalControls();return false;}
    if(batchShadowLoading||batchShadowScope?.some(row=>!batchShadowChecks.get(row.assetId)?.checked))return false;
    const shadowGeneration=batchShadowGeneration,localSavedShadowConsents=(batchShadowScope??[]).map(({assetId,sha256,revision,entries})=>({assetId,sha256,revision,entries:structuredClone(entries),confirmed:true}));
    let size,resolution,quality;const format=byID('batch-final-format').value,method=byID('batch-final-naming').value,customName=byID('batch-final-custom').value;
     try{if(method==='capture-date-original'&&!(session.api instanceof TrialClient))throw Error('EXPORT_CAPTURE_DATE_TRIAL_REQUIRED');size=plannedExportSize();resolution=plannedExportResolution();quality=plannedExportQuality(format,ids.includes(state.asset?.id)?state.recipe:undefined);validateBatchFinalNames({
       assets:state.assets,orderedIds:ids,format,method,customName,
       existingNames:completedDownloadNames});}
    catch(error){batchFinalStatus=`設定を確認してください：${error?.message??String(error)}`;renderBatchFinalControls();return false;}
    const source={id:state.asset.id,revision:state.revision};clearBatchFinalDownloads();pending=true;batchFinalRunning=true;batchFinalStatus='全件のOriginal・保存済みRecipe・権限を確認し、Finalを順に生成しています。';localError='';render(state);
    try{
      // Fail all JPEG recipe/quality conflicts before starting any encoding.
      // Session still performs its authoritative fresh checks; this read-only
      // preflight never changes a saved output setting or replaces authorization.
      if(format==='jpeg'){
        if(typeof session.api?.getRecipe!=='function')throw Error('JPEG一括品質を確認する保存済みRecipeの取得機能がありません。');
        const controller=new AbortController();batchQualityController=controller;
        for(const id of ids){
          const saved=await session.api.getRecipe(id,{signal:controller.signal});
          if(controller.signal.aborted||disposed||(makeupGeneration!==batchMakeupGeneration||shadowGeneration!==batchShadowGeneration)||access.reason()||state.asset?.id!==source.id||
            state.revision!==source.revision||state.dirty||ids.length!==batchFinalIDs.length||
            ids.some((value,index)=>value!==batchFinalIDs[index]))throw Error('EXPORT_BATCH_SELECTION_CHANGED');
          if(!saved?.body)throw Error('JPEG品質を確認できる保存済みRecipeがありません。');
          if(plannedExportQuality(format,saved.body)!==quality)throw Error('JPEG品質指定が処理中に変更されました。');
        }
        batchQualityController=null;
      }
      if((makeupGeneration!==batchMakeupGeneration||shadowGeneration!==batchShadowGeneration))throw Error('EXPORT_BATCH_SELECTION_CHANGED');
      const result=await session.exportBatchFinal({orderedIds:ids,format,quality,size,makeupConsents,localSavedShadowConsents,...(resolution?{resolution}:{}),...(outputSharpening?{outputSharpening}:{}),...(method==='capture-date-original'?{namingMethod:method}:{})});
      if(disposed)return false;
      if((makeupGeneration!==batchMakeupGeneration||shadowGeneration!==batchShadowGeneration)||access.reason()||state.asset?.id!==source.id||state.revision!==source.revision||state.dirty||ids.length!==batchFinalIDs.length||ids.some((id,index)=>id!==batchFinalIDs[index]))throw Error('EXPORT_BATCH_SELECTION_CHANGED');
      const manifest=verifiedBatchFinalManifest(result,ids,{format,method,customName,existingNames:completedDownloadNames});
      const staged=[];
      try{for(const file of manifest.files)staged.push({...file,url:URL.createObjectURL(file.blob)});}
      catch(error){for(const file of staged)URL.revokeObjectURL(file.url);throw error;}
      if(disposed||access.reason()){for(const file of staged)URL.revokeObjectURL(file.url);return false;}
      batchFinalDownloads=staged.map(({assetId,name,sequence,total,url})=>({assetId,name,sequence,total,url}));
      for(const file of batchFinalDownloads)completedDownloadNames.add(file.name);
      batchFinalStatus=`${batchFinalDownloads.length}件すべてのFinalを確認しました。必要なファイルのリンクを一つずつ押してください。自動ダウンロードはしません。`;
      return true;
    }catch(error){
      if(disposed)return false;
      batchQualityController=null;
      clearBatchFinalDownloads();batchFinalStatus=`一括Finalは完了していません：${error?.message??String(error)}`;localError=error?.message??String(error);access.end(localError);
      return false;
    }finally{batchQualityController?.abort();batchQualityController=null;pending=false;batchFinalRunning=false;if(!disposed)render(session.state??state);}
  }
  function render(next){
    if(disposed)return;state={...EMPTY,...next};const busy=Boolean(state.busy)||Boolean(state.exporting)||pending;const loaded=Boolean(state.asset);const params=state.recipe?.parameters??{};const personBlocked=!['SYNTHETIC_TEST_ONLY','PRODUCTION_PERSON_APPROVED'].includes(state.personProcessingStatus);
    versionsPanel?.setDisabled(busy||!loaded||state.dirty||Boolean(access.reason()));
    autoPropose.disabled=busy||!loaded||Boolean(access.reason());
    autoApply.disabled=busy||!loaded||!autoDraft||Boolean(access.reason());
    cullingPanel.refresh();
    gradingPanel.refresh();
    pointColorPanel.refresh();
    tonalBandsPanel.refresh();
    profilePanel.refresh();
    sceneBasicPanel.refresh();
    hslPickerPanel.refresh();
    imageCurvePanel.refresh();
    cloudStatusPanel.refresh();
    illuminantPanel.refresh();
    whiteBalancePanel.refresh();
    lumaCurvePanel.refresh();
    lutPanel.refresh();
    xmpPanel.refresh();
    portablePresetPanel.refresh();
    colorMatchPanel.refresh();
    geometryPanel.refresh();
    freeCropPanel.refresh();
    root.setAttribute('aria-busy',String(busy));renderHistogram(state.histogram);
    histogramFigure.hidden=!showHistogram;histogramFigure.style.display=showHistogram?'':'none';
    histogramVisibility.setAttribute('aria-expanded',String(showHistogram));
    histogramVisibility.textContent=showHistogram?'ヒストグラムを隠す':'ヒストグラムを表示';
    if(invited){const reason=access.reason(),owner=trialSession.principal.role==='admin'&&!trialSession.principal.trialEndsAt;byID('trial-deadline').hidden=owner;byID('trial-deadline-value').textContent=owner?'管理者本人の操作です。':`編集期限: ${trialSession.principal.trialEndsAt||'未設定（操作不可）'}`;byID('account-status').title=owner?`${trialSession.principal.authorName} / 管理者本人認証済み`:`${trialSession.principal.authorName} / 編集期限: ${trialSession.principal.trialEndsAt||'未設定'}`;byID('trial-ended-notice').hidden=!reason;byID('trial-ended-notice').textContent=reason?`${reason} — 試用は終了または取り消されています。追加編集・書出し・作者操作は停止中です。表示中の写真、原本、保存済みRecipe・提出は削除しません。管理者へ確認してください。`:'';if(reason&&downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;downloadAssetID=null;byID('download-link').removeAttribute('href');byID('download-link').hidden=true;}if(reason&&batchFinalDownloads.length){clearBatchFinalDownloads();batchFinalStatus='権限が失効したため、生成済みリンクを破棄しました。';}}
    byID('asset-count').textContent=String(state.assets?.length??0);byID('asset-name').textContent=assetName(state.asset);byID('revision-label').textContent=loaded?`REV ${state.revision??0}`:'REV —';
    byID('save-indicator').textContent=!loaded?'写真未選択':state.dirty?'未保存の変更あり':`保存済み · r${state.revision??0}`;byID('save-indicator').classList.toggle('is-dirty',Boolean(state.dirty));
    byID('session-status').textContent=state.status??(loaded?'ローカル検証版':'RAW を読み込んでください');
    const error=localError||state.error;byID('error-banner').hidden=!error;byID('error-banner').textContent=error?`処理を完了できませんでした：${error instanceof Error?error.message:String(error)}。未完了の操作を成功扱いにしません。`:'';
    if(previewAssetID!==state.asset?.id){blockedBeforeURL=previousBeforeURL;blockedAfterURL=previousAfterURL;blockedOverlayURL=previousOverlayURL;blockedShadowOverlayURL=previousShadowOverlayURL;blockedHighlightOverlayURL=previousHighlightOverlayURL;blockedGlowMaskURL=previousGlowMaskURL;({shadow:showShadowClipping,highlight:showHighlightClipping}=clippingSidesForAsset(previewAssetID,state.asset?.id,{shadow:showShadowClipping,highlight:showHighlightClipping}));previewAssetID=state.asset?.id??null;showGlowMask=false;levelsEndpoint=null;levelsPoint={x:.5,y:.5};levelsNotice='';localBrushMode='off';localBrushPointer=null;localBrushKeyboardPoint={x:.5,y:.5};localBrushNotice='';localBrushRecipeKey=null;bwManualActive=false;bwDraftDirty=false;bwNotice='';bwRecipeKey=null;shadowActive=false;shadowNotice='';byID('bw-edge-confirm').checked=false;}
    const currentBeforeURL=state.beforeURL!==blockedBeforeURL?state.beforeURL:null;const currentAfterURL=state.afterURL!==blockedAfterURL?state.afterURL:null;const currentOverlayURL=state.clippingOverlayURL!==blockedOverlayURL?state.clippingOverlayURL:null;const currentShadowOverlayURL=state.shadowClippingOverlayURL!==blockedShadowOverlayURL?state.shadowClippingOverlayURL:null;const currentHighlightOverlayURL=state.highlightClippingOverlayURL!==blockedHighlightOverlayURL?state.highlightClippingOverlayURL:null;const currentGlowMaskURL=state.glowMaskURL!==blockedGlowMaskURL?state.glowMaskURL:null;
    previousBeforeURL=state.beforeURL;previousAfterURL=state.afterURL;previousOverlayURL=state.clippingOverlayURL;previousShadowOverlayURL=state.shadowClippingOverlayURL;previousHighlightOverlayURL=state.highlightClippingOverlayURL;previousGlowMaskURL=state.glowMaskURL;
    const before=loaded&&setImage('before-image',currentBeforeURL);const after=loaded&&setImage('after-image',currentAfterURL);
    if(!loaded){setImage('before-image',null);setImage('after-image',null);}
    const hasImage=before||after;byID('empty-photo').hidden=hasImage;byID('empty-photo').querySelector('h2').textContent=loaded?'プレビューを表示できていません。':'まだ、あなたの写真がありません。';byID('image-view').hidden=!hasImage;byID('image-view').classList.toggle('is-split',mode==='split');byID('before-figure').hidden=!(before&&(mode==='before'||mode==='split'||!after));byID('after-figure').hidden=!(after&&(mode==='after'||mode==='split'||!before));
    const clippingURLs={clippingOverlayURL:currentOverlayURL,shadowClippingOverlayURL:currentShadowOverlayURL,highlightClippingOverlayURL:currentHighlightOverlayURL};
    const selectedOverlayURL=clippingOverlayURLForSides(clippingURLs,{shadow:showShadowClipping,highlight:showHighlightClipping});
    const clipsReady=Boolean(after&&currentOverlayURL&&currentShadowOverlayURL&&currentHighlightOverlayURL);
    const overlayImageReady=setImage('clipping-overlay',clipsReady?(selectedOverlayURL||currentOverlayURL):null);
    const overlayReady=clipsReady&&overlayImageReady;
    const overlayVisible=overlayReady&&clippingOverlayVisible({...state,afterURL:currentAfterURL,clippingOverlayURL:selectedOverlayURL},{enabled:Boolean(selectedOverlayURL),view:mode,pending,blocked:Boolean(access.reason())});
    byID('clipping-overlay').hidden=!overlayVisible;
    clippingIndicators.hidden=!showHistogramClippingIndicators;
    clippingIndicators.style.display=showHistogramClippingIndicators?'':'none';
    indicatorSetting.setAttribute('aria-pressed',String(showHistogramClippingIndicators));
    indicatorSetting.textContent=showHistogramClippingIndicators?'ヒストグラムの黒・白指標を隠す':'ヒストグラムの黒・白指標を表示';
    indicatorContextButton.setAttribute('aria-pressed',String(showHistogramClippingIndicators));
    const clippingDisabled=clippingControlsDisabled({overlayReady,view:mode,busy,blocked:Boolean(access.reason())});
    for(const [side,pressed] of [['shadow',showShadowClipping],['highlight',showHighlightClipping]]){const button=byID(`clipping-${side}-toggle`);button.disabled=clippingDisabled;button.setAttribute('aria-pressed',String(pressed));}
    byID('clipping-toggle').disabled=clippingDisabled;
    byID('clipping-toggle').setAttribute('aria-pressed',showShadowClipping&&showHighlightClipping?'true':showShadowClipping||showHighlightClipping?'mixed':'false');
    byID('clipping-toggle').textContent=showShadowClipping&&showHighlightClipping?'黒・白の警告を隠す · J':'黒・白の警告をまとめて表示 · J';
    const glowMaskReady=Boolean(after&&currentGlowMaskURL&&setImage('glow-mask-overlay',currentGlowMaskURL));
    const glowVisible=glowMaskReady&&glowMaskVisible({...state,afterURL:currentAfterURL,glowMaskURL:currentGlowMaskURL},{enabled:showGlowMask,view:mode,pending,blocked:Boolean(access.reason())});
    byID('glow-mask-overlay').hidden=!glowVisible;byID('glow-mask-toggle').disabled=!glowMaskReady||mode==='before'||busy||Boolean(access.reason());byID('glow-mask-toggle').setAttribute('aria-pressed',String(showGlowMask&&glowVisible));
    byID('glow-mask-toggle').textContent=glowVisible?'Glow Maskを隠す':'Glow Maskを表示';
    renderToneControls(after);renderLevelsHistogram(after);renderLocalBrush();renderBWManual();renderShadowManual();renderOriginalShadowManual();if(overlayVisible||glowVisible||!levelsReticle.hidden||!localBrushOverlay.hasAttribute('hidden'))window.requestAnimationFrame(positionPreviewOverlays);
    byID('stage-busy').hidden=!busy;byID('busy-label').textContent=typeof state.busy==='string'?state.busy:'処理中…';byID('photo-stage').classList.toggle('has-image',Boolean(hasImage));
    byID('preview-note').textContent=!loaded?'RAW を選択するとプレビューが表示されます':!hasImage?'この写真のプレビューはまだありません':
      state.provenance?.halfSize===1?
        '縮小RAWからの編集プレビューです（全カメラ形式の対応を保証するものではありません）。Before: 未補正upright / After: 現在の補正後。FinalはOriginalから再処理し、24MPを超える原寸Finalは未対応です。':
        'Before: 未補正upright / After: 回転・中心Crop後（画像枠は異なります）· FinalはOriginalから';
    for(const button of root.querySelectorAll('[data-view]')){button.disabled=!hasImage;button.setAttribute('aria-pressed',String(button.dataset.view===mode));}
    const list=byID('library-list');list.replaceChildren();
    if(!state.assets?.length)list.append(element('p','library-empty','読み込んだ写真がここに並びます。'));
    const canNavigate=canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())});
    for(const asset of state.assets??[]){const button=element('button',`asset-card${asset.id===state.asset?.id?' is-selected':''}`);button.type='button';button.dataset.assetId=asset.id;button.disabled=!canNavigate;button.title=state.dirty?'未保存の変更を先に保存してください。':'';button.setAttribute('aria-pressed',String(asset.id===state.asset?.id));button.append(element('span','asset-file-mark','RAW'),element('span','asset-card-name',assetName(asset)),element('span','asset-card-id',shortID(asset.id)));list.append(button);}
    const assets=state.assets??[],selectedID=state.asset?.id,selectedIndex=assets.findIndex(asset=>asset.id===selectedID),stripItems=byID('filmstrip-items'),fragment=document.createDocumentFragment();
    byID('filmstrip-position').textContent=`${selectedIndex+1} / ${assets.length}`;
    byID('filmstrip-help').textContent=state.dirty?'未保存の変更があります。保存してから別の写真を選択してください。':trialSession?.mode==='PUBLIC_BROWSER_LOCAL'?'この端末だけの写真一覧です。Cloud提出は未接続です。':'横にスクロールして写真を選択できます。';
    for(const [index,asset] of assets.entries()){const button=element('button',`filmstrip-item${asset.id===selectedID?' is-selected':''}`);button.type='button';button.dataset.assetId=asset.id;button.disabled=!canNavigate;button.title=state.dirty?'未保存の変更を先に保存してください。':assetName(asset);button.setAttribute('aria-pressed',String(asset.id===selectedID));button.setAttribute('aria-label',`${index+1}枚目: ${assetName(asset)}`);button.append(element('span','filmstrip-number',String(index+1)),element('span','filmstrip-raw','RAW'),element('span','filmstrip-name',assetName(asset)));fragment.append(button);}
    if(!assets.length)fragment.append(element('p','filmstrip-empty','写真を読み込むと、ここから横に移動できます。'));
    stripItems.replaceChildren(fragment);
    byID('filmstrip-track').setAttribute('aria-disabled',String(!canNavigate));
    byID('filmstrip-track').setAttribute('aria-label',`写真一覧、${assets.length}枚、選択中${selectedIndex+1}枚目`);
    root.querySelector('[data-strip-nav="previous"]').disabled=!canNavigate||!adjacentPhotoID(assets,selectedID,-1);
    root.querySelector('[data-strip-nav="next"]').disabled=!canNavigate||!adjacentPhotoID(assets,selectedID,1);
    if(stripSelectedID!==selectedID){stripSelectedID=selectedID;stripItems.querySelector('.is-selected')?.scrollIntoView?.({inline:'nearest',block:'nearest'});}
    for(const config of adjustments){
      const id=config.id||config.key,current=adjustmentValue(params,config.key);
      const value=Number.isFinite(current)?current:config.initial;
      const disabled=!loaded||busy||typeof session.setAdjustment!=='function'||
        (config.key.startsWith('detail.sharpen')&&
          ((adjustmentValue(params,'detail.sharpness')??0)===0||Boolean(access.reason())));
      byID(id).value=String(config.group==='levels'&&config.key.endsWith('.gamma')?
        levelsGammaToMidpointPosition(value):value);
      byID(id).disabled=disabled;
      if(config.group==='levels'){
        const number=byID(`${id}-number`);number.value=String(value);number.disabled=disabled;
      }
      byID(`${id}-value`).textContent=formatValue(value,config.unit);
    }
    const savedGlowMode=glowModeFromRecipe(state.recipe);
    byID('glow-mode').value=savedGlowMode;byID('glow-mode').disabled=!canEditGlowMode(session,state,{pending,blocked:Boolean(access.reason())});
    for(const field of ['exposure','diffusion','tint'])byID(`glow-${field}`).disabled=!loaded||busy||savedGlowMode==='legacy'||Boolean(access.reason())||typeof session.setAdjustment!=='function';
    renderSelectiveColor(loaded,busy);
    renderPointCurveEditor(loaded,busy||typeof session.setPointCurve!=='function');
    byID('rotation-value').textContent=`${params.rotationDegrees??0}°`;
    const cropPreset=params.extendedParameters?.crop?.preset_name??'original';const cropValue=String(cropPreset).toLowerCase();const cropSelect=byID('crop-ratio');cropSelect.value=Array.from(cropSelect.options).some(option=>option.value===cropValue)?cropValue:'';byID('crop-preset-value').textContent=String(cropPreset);cropSelect.disabled=!loaded||busy||typeof session.setAdjustment!=='function';
    const savedCanvasBackground=params.extendedParameters?.canvasExpand?.background??canvasColors.white;
    canvasBackground.value=Object.keys(canvasColors).find(name=>canvasColors[name].every((value,index)=>value===savedCanvasBackground[index]))??'white';
    canvasBackground.disabled=!loaded||busy||typeof session.setCanvasExpansion!=='function';canvasReset.disabled=!loaded||busy||!params.extendedParameters?.canvasExpand||typeof session.setCanvasExpansion!=='function';updateCanvasSize();canvasEdgeOverlay.refresh();
    const people=loaded?(state.people??[]):[];const selected=people.find(person=>person.id===state.selectedPersonID);const peopleList=byID('people-list');peopleList.replaceChildren();
    people.forEach((person,index)=>{const button=element('button',`person-chip${person.id===state.selectedPersonID?' is-selected':''}`);button.type='button';button.dataset.personId=person.id;button.disabled=busy||person.complete!==true||typeof session.selectPerson!=='function';button.setAttribute('aria-pressed',String(person.id===state.selectedPersonID));button.append(element('span','person-chip-number',String(index+1)),element('span','',`人物 ${index+1}`),element('small','',shortID(person.id)));peopleList.append(button);});
    byID('person-reference').hidden=!before||!people.length;setImage('person-reference-image',people.length?currentBeforeURL:null);const boxes=byID('person-reference-boxes');boxes.replaceChildren();people.forEach((person,index)=>{const a=person.anchor;if(!a||![a.x,a.y,a.width,a.height].every(Number.isFinite)||a.x<0||a.y<0||a.width<=0||a.height<=0||a.x+a.width>1||a.y+a.height>1)return;const button=element('button',`person-box${person.id===state.selectedPersonID?' is-selected':''}`,String(index+1));button.type='button';button.dataset.personId=person.id;button.setAttribute('aria-label',`写真上の人物 ${index+1} を選択`);button.disabled=busy||person.complete!==true;button.style.left=`${a.x*100}%`;button.style.top=`${(1-a.y-a.height)*100}%`;button.style.width=`${a.width*100}%`;button.style.height=`${a.height*100}%`;boxes.append(button);});
    byID('person-note').textContent=!loaded?'人物は未解析です。':selected?`選択中：${shortID(selected.id)} · 写真内 UUID`:people.length?'写真上の番号かボタンで補正する人物を選んでください。':'未解析 / 再検証後。顔の対象を確認して選択してください。';
    byID('person-processing-notice').textContent=personBlocked?'顔解析SDKの通信・同意確認待ちのため、実写真の人物処理は停止中':'SYNTHETIC_TEST_ONLY — 合成人工fixture専用。実写真の人物処理許可ではありません。';
    if(state.personProcessingStatus==='PRODUCTION_PERSON_APPROVED')byID('person-processing-notice').textContent='人物補正は有効です。';
    const selectedRecipeTarget=params.extendedParameters?.portrait?.targets?.find(target=>target.id===state.selectedPersonID);const face=Number.isFinite(selectedRecipeTarget?.value)?selectedRecipeTarget.value:Number.isFinite(selected?.value)?selected.value:0;byID('face-brightness').value=String(face);byID('face-value').textContent=formatValue(face,' EV');byID('face-brightness').disabled=personBlocked||!loaded||busy||!selected||selected.complete!==true||typeof session.setAdjustment!=='function';
    const shadowExportBlocked=Boolean(params.extendedParameters?.addShadowManual&&state.shadowVerification!=='verified');
    const enabled={import:!busy&&!state.dirty,undo:loaded&&!busy&&state.canUndo,redo:loaded&&!busy&&state.canRedo,reset:loaded&&!busy,rotate:loaded&&!busy,detect:!personBlocked&&loaded&&!busy,save:loaded&&!busy&&state.dirty,reload:loaded&&!busy&&!state.dirty,'export-jpeg':loaded&&!busy&&!state.dirty&&state.revision>0&&!shadowExportBlocked,'export-png':loaded&&!busy&&!state.dirty&&state.revision>0&&!shadowExportBlocked,'export-tiff':loaded&&!busy&&!state.dirty&&state.revision>0&&!shadowExportBlocked,'cancel-export':Boolean(state.exporting)};
    const methods={import:'importRaw',undo:'undo',redo:'redo',reset:'reset',rotate:'setAdjustment',detect:'detectPeople',save:'save',reload:'reload','export-jpeg':'exportFinal','export-png':'exportFinal','export-tiff':'exportFinal','cancel-export':'cancelExport'};
    for(const button of root.querySelectorAll('[data-action]'))button.disabled=!enabled[button.dataset.action]||typeof session[methods[button.dataset.action]]!=='function';
    root.querySelector('[data-action="cancel-export"]').hidden=!state.exporting;byID('raw-file').disabled=busy||state.dirty;if(downloadAssetID!==state.asset?.id)byID('download-link').hidden=true;
    const exportReady=canStartConfiguredExport(state,{pending,blocked:Boolean(access.reason())});
    exportNameMethod.disabled=!exportReady;exportNameCustom.disabled=!exportReady;
    for(const control of [exportSizeMethod,exportSizeValue,exportSizeWidth,exportSizeHeight,exportExactStrategy,exportExactBackground,exportResolutionUnit,exportResolutionValue])control.disabled=!exportReady;
    updateExportValidation();
    byID('save-help').textContent=!loaded?'写真を読み込んでください。':state.dirty?'未保存の変更があります。保存後に Final を書き出せます。':'保存済み Recipe。再読込は現在の保存先の記録を取得します。';
    renderBatchControls();renderBatchFinalControls();
    byID('export-note').textContent=!loaded?'先に写真を保存してください。':state.dirty?'未保存の変更あり — 先に保存してください。':access.reason()?'書き出し権限が失効しています。':busy?'処理中です。完了後に書き出してください。':state.revision>0?`固定対象：revision ${state.revision} · Original SHA を再確認`:'先に Recipe を保存してください。';
    byID('provenance').textContent=loaded?JSON.stringify({provenance:state.provenance??'NOT_AVAILABLE',metadata:state.metadata??'NOT_AVAILABLE',evidence:state.evidence??[]},null,2):'実写真の処理情報はまだありません。';
    crossDeviceReport.update({...state,pending,blocked:Boolean(invalidSession||access.reason()||endedCodes.includes(state.error))});
    if(byID('look-asset'))byID('look-asset').textContent=loaded?assetName(state.asset):'写真未選択';if(byID('look-revision'))byID('look-revision').textContent=loaded?`${state.dirty?'未保存 · ':''}revision ${state.revision??0}`:'Recipe 未保存';
    byID('trial-logout').disabled=busy||state.dirty||!invalidSession&&typeof authorAPI?.logout!=='function';
    const reason=access.reason();if(endedCodes.includes(state.error))access.end(state.error);if(reason){for(const control of root.querySelectorAll('.workspace-grid input,.workspace-grid select,.workspace-grid button,.heading-actions button'))if(control.dataset.view===undefined&&control.dataset.action!=='cancel-export')control.disabled=true;byID('raw-file').disabled=true;byID('download-link').hidden=true;}
  }
  let categoryPointerOrigin=null;
  const toggleClipping=(side='both')=>{if(byID(side==='both'?'clipping-toggle':`clipping-${side}-toggle`).disabled)return;({shadow:showShadowClipping,highlight:showHighlightClipping}=nextClippingSides({shadow:showShadowClipping,highlight:showHighlightClipping},side));if(showShadowClipping||showHighlightClipping)showGlowMask=false;render(state);};
  const toggleHistogramIndicators=()=>{showHistogramClippingIndicators=!showHistogramClippingIndicators;indicatorContext.hidden=true;render(state);};
  histogramVisibility.addEventListener('click',()=>{
    showHistogram=!showHistogram;indicatorContext.hidden=true;tonePointer=null;
    render(state);histogramVisibility.focus({preventScroll:true});
  },{signal:lifetime.signal});
  indicatorSetting.addEventListener('click',toggleHistogramIndicators,{signal:lifetime.signal});
  indicatorContextButton.addEventListener('click',()=>{toggleHistogramIndicators();indicatorSetting.focus({preventScroll:true});},{signal:lifetime.signal});
  histogramFigure.addEventListener('contextmenu',event=>{event.preventDefault();indicatorContext.hidden=false;indicatorContextButton.focus({preventScroll:true});},{signal:lifetime.signal});
  indicatorContext.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();indicatorContext.hidden=true;indicatorSetting.focus({preventScroll:true});}},{signal:lifetime.signal});
  root.addEventListener('pointerdown',event=>{if(!indicatorContext.hidden&&!indicatorContext.contains(event.target)&&event.button!==2)indicatorContext.hidden=true;},{signal:lifetime.signal});
  const toggleGlowMask=()=>{if(byID('glow-mask-toggle').disabled)return;showGlowMask=!showGlowMask;if(showGlowMask){showShadowClipping=false;showHighlightClipping=false;}render(state);};
  byID('clipping-toggle').addEventListener('click',()=>toggleClipping(),{signal:lifetime.signal});
  for(const side of ['shadow','highlight'])byID(`clipping-${side}-toggle`).addEventListener('click',()=>toggleClipping(side),{signal:lifetime.signal});
  byID('glow-mask-toggle').addEventListener('click',toggleGlowMask,{signal:lifetime.signal});
  byID('bw-edge-mode').addEventListener('click',()=>{
    if(byID('bw-edge-mode').disabled)return;
    bwManualActive=!bwManualActive;if(bwManualActive){shadowActive=false;shadowComponent?.setEnabled(false);localBrushMode='off';localBrushPointer=null;levelsEndpoint=null;bwNotice='';}
    render(state);if(bwManualActive)byID('after-image').focus({preventScroll:true});
  },{signal:lifetime.signal});
  byID('add-shadow-mode').addEventListener('click',()=>{
    if(byID('add-shadow-mode').disabled)return;
    shadowActive=!shadowActive;
    if(shadowActive){bwManualActive=false;bwComponent.setEnabled(false);localBrushMode='off';localBrushPointer=null;levelsEndpoint=null;shadowNotice='';}
    render(state);if(shadowActive)byID('after-image').focus({preventScroll:true});
  },{signal:lifetime.signal});
  byID('original-shadow-backdrop').addEventListener('change',event=>{
    stopOriginalShadow();
    originalShadowBackdropID=event.currentTarget.value;
    originalShadowNotice='';render(state);
  },{signal:lifetime.signal});
  byID('original-shadow-mode').addEventListener('click',async()=>{
    if(byID('original-shadow-mode').disabled)return;
    if(originalShadowActive){stopOriginalShadow();originalShadowNotice=
      'ブラシを終了しました。進行中の保存結果はRecipeを再読込して確認してください。';
      render(session.state??state);return;}
    if(originalShadowGate())return;
    bwManualActive=false;bwComponent.setEnabled(false);
    shadowActive=false;shadowComponent?.setEnabled(false);
    localBrushMode='off';localBrushPointer=null;levelsEndpoint=null;
    originalShadowActive=true;originalShadowChecking=true;
    originalShadowNotice='両Originalと保存版を本人権限で再確認中です。';
    const token=++originalShadowGeneration,targetAssetID=state.asset.id,
      backdropAssetID=originalShadowBackdropID;
    render(state);
    try{
      const bridge=createOriginalShadowEditorBridge({session,targetAssetID,
        backdropAssetID,getSelection:()=>({targetAssetID:state.asset?.id,
          backdropAssetID:originalShadowBackdropID,
          view:originalShadowActive&&!access.reason()&&!trialSession?.endedReason?
            mode:'before'})});
      originalShadowBridge=bridge;
      await bridge.refresh();
      if(disposed||token!==originalShadowGeneration||!originalShadowActive||
          !bridge.getContext().ready)
        throw Error('ORIGINAL_SHADOW_EDITOR_SELECTION_CHANGED');
      bridge.mount({root:byID('original-shadow-manual-root'),
        afterImage:byID('after-image')});
      originalShadowNotice='対象と背景を確認しました。適用操作でも権限・保存版を再確認します。';
      byID('after-image').focus({preventScroll:true});
    }catch(error){
      if(token!==originalShadowGeneration||disposed)return;
      stopOriginalShadow();access.end(error?.message);
      originalShadowNotice=`確認できませんでした：${error?.message??String(error)}。保存済みRecipeと本人権限を再確認してください。`;
    }finally{if(token===originalShadowGeneration){originalShadowChecking=false;
      if(!disposed)render(session.state??state);}else if(!disposed)render(session.state??state);}
  },{signal:lifetime.signal});
  byID('bw-edge-confirm').addEventListener('change',renderBWManual,{signal:lifetime.signal});
  byID('bw-edge-apply').addEventListener('click',async()=>{
    if(byID('bw-edge-apply').disabled||!bwReady()||!bwHasBothLayers(bwDraft)||!byID('bw-edge-confirm').checked)return;
    const draft=structuredClone(bwDraft),assetID=state.asset.id,revision=state.revision;
    bwApplying=true;pending=true;bwNotice='二層範囲を検証してRecipeへ適用中です。保存はまだです。';render(state);
    try{
      await session.setBWEdgeManualStrokes(draft);
      if(disposed||session.state?.asset?.id!==assetID||session.state?.revision!==revision)throw Error('BW_EDGE_STALE_ASSET_OR_REVISION');
      const applied=session.state?.recipe?.parameters?.extendedParameters?.bwEdgeManual;
      if(!applied||JSON.stringify({subjectStrokes:applied.subjectStrokes,correctionStrokes:applied.correctionStrokes})!==JSON.stringify(draft))throw Error('BW_EDGE_APPLY_NOT_CONFIRMED');
      bwDraftDirty=false;bwNotice='Recipeへ適用しました。未保存です。保存してください。';byID('bw-edge-confirm').checked=false;
    }catch(error){bwFailureBlocked=true;bwNotice=`未適用です：${error?.message??String(error)}。この画面の下書きだけ保持しています。再読込するとこの未適用下書きは消えます。再認証・再読込後に権限と保存版を確認してください。`;access.end(error?.message);}
    finally{bwApplying=false;pending=false;if(!disposed)render(session.state??state);}
  },{signal:lifetime.signal});
  byID('levels-histograms').addEventListener('click',event=>{
    const button=event.target.closest('[data-levels-channel]');if(!button||button.disabled)return;
    levelsChannel=button.dataset.levelsChannel;levelsNotice='';render(state);
  },{signal:lifetime.signal});
  for(const [endpoint,id] of [['black','levels-pick-black'],['white','levels-pick-white']])byID(id).addEventListener('click',()=>{
    if(byID(id).disabled)return;
    if(originalShadowActive)stopOriginalShadow();
    shadowActive=false;shadowComponent?.setEnabled(false);localBrushMode='off';localBrushPointer=null;
    levelsEndpoint=levelsEndpoint===endpoint?null:endpoint;levelsPoint={x:.5,y:.5};levelsNotice='';render(state);
    if(levelsEndpoint)byID('after-image').focus({preventScroll:true});
  },{signal:lifetime.signal});
  localBrushSection.addEventListener('click',event=>{
    const button=event.target.closest('[data-local-brush-mode]');if(!button||button.disabled)return;
    if(button.dataset.localBrushMode!=='off'&&bwManualActive){bwManualActive=false;bwComponent.setEnabled(false);}
    if(button.dataset.localBrushMode!=='off'&&shadowActive){shadowActive=false;shadowComponent?.setEnabled(false);}
    localBrushMode=button.dataset.localBrushMode;localBrushPointer=null;localBrushNotice='';
    if(localBrushMode!=='off'){levelsEndpoint=null;const geometry=localBrushGeometry();if(geometry){try{mapAfterImagePointToLocalBrushPoint({...geometry,afterX:localBrushKeyboardPoint.x,afterY:localBrushKeyboardPoint.y});}catch{localBrushKeyboardPoint=firstLocalBrushKeyboardPoint(geometry)??localBrushKeyboardPoint;}}}
    renderLevelsHistogram(Boolean(state.afterURL));renderLocalBrush();
    if(localBrushMode!=='off')byID('after-image').focus({preventScroll:true});
  },{signal:lifetime.signal});
  for(const id of ['local-brush-radius','local-brush-hardness'])byID(id).addEventListener('input',renderLocalBrush,{signal:lifetime.signal});
  byID('local-brush-channel').addEventListener('change',()=>{setLocalBrushLevelInputs();localBrushNotice='';renderLocalBrush();},{signal:lifetime.signal});
  byID('local-brush-reset').addEventListener('click',async()=>{
    if(byID('local-brush-reset').disabled||!localBrushActive())return;
    localBrushMode='off';localBrushNotice='Local Levelsをリセットしています…';await run('setLocalLevels',null);
    localBrushNotice=session.state?.recipe?.parameters?.extendedParameters?.localLevels?'リセットを確認できませんでした。':'Local Levelsをリセットしました。保存してください。';renderLocalBrush();
  },{signal:lifetime.signal});
  const localBrushPoint=(clientX,clientY)=>{
    const geometry=localBrushGeometry();if(!geometry)throw Error('LOCAL_BRUSH_GEOMETRY_UNAVAILABLE');
    return mapAfterToLocalBrushPoint({...geometry,clientX,clientY});
  };
  async function commitLocalBrush(points,chosenMode){
    if(!localBrushActive()||!points.length)return;
    let settings;
    try{settings=localLevelsStrokeSettings(state.recipe,{points,mode:chosenMode,radius:Number(byID('local-brush-radius').value)/100,hardness:Number(byID('local-brush-hardness').value)/100,channel:byID('local-brush-channel').value,controls:readLocalBrushLevelInputs()});}
    catch(error){localBrushNotice=`値を確認してください：${error.message}`;renderLocalBrush();return;}
    localBrushNotice='Local LevelsをRecipeへ反映しています…';await run('setLocalLevels',settings);
    const saved=session.state?.recipe?.parameters?.extendedParameters?.localLevels?.strokes;
    localBrushNotice=Array.isArray(saved)&&saved.length===settings.strokes.length?'strokeをRecipeへ反映しました。保存してから次のstrokeを追加してください。':'strokeを確認できませんでした。値と権限を確認してください。';renderLocalBrush();
  }
  const brushImage=byID('after-image');
  brushImage.addEventListener('pointerdown',event=>{
    if(localBrushMode==='off'||!localBrushActive()||event.button!==0||levelsEndpoint)return;
    try{const point=localBrushPoint(event.clientX,event.clientY),position=mapLocalBrushPointToAfter({...localBrushGeometry(),...point});localBrushKeyboardPoint={x:position.afterX,y:position.afterY};localBrushPointer={id:event.pointerId,mode:localBrushMode,assetID:state.asset.id,points:[point]};brushImage.setPointerCapture?.(event.pointerId);event.preventDefault();}
    catch{localBrushNotice='After写真の実画素だけを選択してください。余白・Before・不整合寸法には描画しません。';renderLocalBrush();}
  },{signal:lifetime.signal});
  brushImage.addEventListener('pointermove',event=>{
    const drawing=localBrushPointer;if(!drawing||drawing.id!==event.pointerId)return;
    try{const point=localBrushPoint(event.clientX,event.clientY),last=drawing.points.at(-1);if(Math.hypot(point.x-last.x,point.y-last.y)>=.002&&drawing.points.length<4096)drawing.points.push(point);}
    catch{drawing.invalid=true;}
  },{signal:lifetime.signal});
  const endLocalBrushPointer=(event,cancelled=false)=>{
    const drawing=localBrushPointer;if(!drawing||drawing.id!==event.pointerId)return;
    localBrushPointer=null;if(brushImage.hasPointerCapture?.(event.pointerId))brushImage.releasePointerCapture(event.pointerId);
    if(cancelled||drawing.invalid||localBrushMode!==drawing.mode||!localBrushActive()||state.asset?.id!==drawing.assetID){localBrushNotice='strokeを中止しました。Recipeは変更していません。';renderLocalBrush();return;}
    try{const point=localBrushPoint(event.clientX,event.clientY),last=drawing.points.at(-1);if(Math.hypot(point.x-last.x,point.y-last.y)>=.002&&drawing.points.length<4096)drawing.points.push(point);}
    catch{localBrushNotice='After写真の外側ではstrokeを確定しません。';renderLocalBrush();return;}
    event.preventDefault();commitLocalBrush(drawing.points,drawing.mode);
  };
  brushImage.addEventListener('pointerup',event=>endLocalBrushPointer(event),{signal:lifetime.signal});
  brushImage.addEventListener('pointercancel',event=>endLocalBrushPointer(event,true),{signal:lifetime.signal});
  brushImage.addEventListener('keydown',event=>{
    if(localBrushMode==='off'||!localBrushActive()||levelsEndpoint||event.target!==brushImage)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const next=moveLevelsSamplePoint(localBrushKeyboardPoint,event.key,{coarse:event.shiftKey});
      try{mapAfterImagePointToLocalBrushPoint({...localBrushGeometry(),afterX:next.x,afterY:next.y});localBrushKeyboardPoint=next;localBrushNotice='';}
      catch{localBrushNotice='画像の余白・Crop外へは移動できません。';}
      renderLocalBrush();return;
    }
    if(event.key==='Enter'||event.key===' '){event.preventDefault();
      try{const point=mapAfterImagePointToLocalBrushPoint({...localBrushGeometry(),afterX:localBrushKeyboardPoint.x,afterY:localBrushKeyboardPoint.y});commitLocalBrush([point],localBrushMode);}
      catch{localBrushNotice='After写真の実画素だけにstrokeを追加できます。';renderLocalBrush();}return;}
    if(event.key==='Escape'){event.preventDefault();if(localBrushPointer&&brushImage.hasPointerCapture?.(localBrushPointer.id))brushImage.releasePointerCapture(localBrushPointer.id);localBrushPointer=null;localBrushMode='off';localBrushNotice='ブラシ操作を終了しました。';renderLocalBrush();}
  },{signal:lifetime.signal});
  byID('after-image').addEventListener('click',event=>{
    if(!levelsEndpoint||!canSampleLevels(session,state,{pending,blocked:Boolean(access.reason()),view:mode}))return;
    try{
      const image=byID('after-image');const point=mapPreviewClick({afterRect:image.getBoundingClientRect(),beforeRect:mode==='split'?byID('before-figure').getBoundingClientRect():undefined,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,clientX:event.clientX,clientY:event.clientY,view:mode});
      sampleLevels(point);
    }catch(error){levelsNotice=error.message==='PREVIEW_CONTAIN_LETTERBOX'?'写真の余白は採取できません。実画像の上を選んでください。':'After写真の画素だけを選択してください。';render(state);}
  },{signal:lifetime.signal});
  byID('after-image').addEventListener('keydown',event=>{
    if(!levelsEndpoint||!canSampleLevels(session,state,{pending,blocked:Boolean(access.reason()),view:mode}))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();levelsPoint=moveLevelsSamplePoint(levelsPoint,event.key,{coarse:event.shiftKey});positionLevelsReticle();return;}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();sampleLevels(levelsPoint);return;}
    if(event.key==='Escape'){event.preventDefault();levelsEndpoint=null;levelsNotice='スポイトを中止しました。';render(state);}
  },{signal:lifetime.signal});
  window.addEventListener('keydown',event=>{if(!shouldToggleClippingWithJ(event,{disabled:byID('clipping-toggle').disabled}))return;event.preventDefault();toggleClipping();},{signal:lifetime.signal});
  byID('after-image').addEventListener('load',positionPreviewOverlays,{signal:lifetime.signal});
  byID('before-image').addEventListener('load',positionPreviewOverlays,{signal:lifetime.signal});
  for(const image of [byID('before-image'),byID('after-image')])image.addEventListener('load',()=>{if(!disposed)render(session.state??state);},{signal:lifetime.signal});
  byID('clipping-overlay').addEventListener('load',positionPreviewOverlays,{signal:lifetime.signal});
  byID('glow-mask-overlay').addEventListener('load',positionPreviewOverlays,{signal:lifetime.signal});
  window.addEventListener('resize',positionPreviewOverlays,{signal:lifetime.signal});
  const clippingResizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(positionPreviewOverlays):null;
  clippingResizeObserver?.observe(byID('after-image'));clippingResizeObserver?.observe(byID('after-figure'));
  toneRegions.addEventListener('pointerdown',event=>{const button=event.target.closest('[data-tone-region]');if(!button||button.disabled||event.button!==0)return;const region=button.dataset.toneRegion,key=HISTOGRAM_TONE_REGIONS[region].key,startValue=adjustmentValue(state.recipe?.parameters??{},key)??0;
    if(!Number.isFinite(startValue)||button.clientWidth<=0)return;tonePointer={button,id:event.pointerId,region,startValue,startX:event.clientX,width:button.clientWidth};button.setPointerCapture?.(event.pointerId);event.preventDefault();},{signal:lifetime.signal});
  toneRegions.addEventListener('pointermove',event=>{if(!tonePointer||tonePointer.id!==event.pointerId)return;try{const next=calculateHistogramToneDrag({region:tonePointer.region,startValue:tonePointer.startValue,deltaX:event.clientX-tonePointer.startX,dragWidth:tonePointer.width});toneHelp.textContent=`${toneLabels[tonePointer.region]} ${formatValue(next.value)}。放すとRecipeに反映します。`;}catch{/* Invalid geometry does not change Recipe. */}},{signal:lifetime.signal});
  const endTonePointer=(event,cancelled=false)=>{if(!tonePointer||tonePointer.id!==event.pointerId)return;const drag=tonePointer;tonePointer=null;if(drag.button.hasPointerCapture?.(event.pointerId))drag.button.releasePointerCapture(event.pointerId);toneHelp.textContent='5領域を左右にドラッグ、またはフォーカスして左右矢印キーで調整します。';if(cancelled||drag.button.disabled)return;try{const next=calculateHistogramToneDrag({region:drag.region,startValue:drag.startValue,deltaX:event.clientX-drag.startX,dragWidth:drag.width});if(next.value!==drag.startValue)run('setAdjustment',next.key,next.value);}catch{/* No invalid drag is committed. */}};
  toneRegions.addEventListener('pointerup',event=>endTonePointer(event),{signal:lifetime.signal});
  toneRegions.addEventListener('pointercancel',event=>endTonePointer(event,true),{signal:lifetime.signal});
  toneRegions.addEventListener('keydown',event=>{const button=event.target.closest('[data-tone-region]');if(!button||button.disabled||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const config=HISTOGRAM_TONE_REGIONS[button.dataset.toneRegion],startValue=adjustmentValue(state.recipe?.parameters??{},config.key)??0;try{const next=calculateHistogramToneDrag({region:button.dataset.toneRegion,startValue,deltaX:(event.key==='ArrowRight'?1:-1)*button.clientWidth*config.step/(config.max-config.min),dragWidth:button.clientWidth});if(next.value!==startValue)run('setAdjustment',next.key,next.value);}catch{/* An invalid or unavailable control never commits. */}},{signal:lifetime.signal});
  root.addEventListener('pointerdown',event=>{const nav=event.target.closest('[data-editor-section]');categoryPointerOrigin=nav?{nav,x:window.scrollX,y:window.scrollY}:null;},{signal:lifetime.signal});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.editorSection){const target=byID(button.dataset.editorSection),panel=root.querySelector('.adjustment-panel');if(!target||!panel)return;const origin=categoryPointerOrigin?.nav===button?categoryPointerOrigin:{x:window.scrollX,y:window.scrollY};categoryPointerOrigin=null;event.preventDefault();for(const nav of root.querySelectorAll('[data-editor-section]'))nav.setAttribute('aria-current',String(nav===button));const section=target.closest('details.control-section');if(section)section.open=true;const offset=target.getBoundingClientRect().top-panel.getBoundingClientRect().top;panel.scrollTo({top:panel.scrollTop+offset-12,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});if(target.tabIndex>=0)target.focus({preventScroll:true});const restore=()=>{if(window.scrollX!==origin.x||window.scrollY!==origin.y)window.scrollTo({left:origin.x,top:origin.y,behavior:'instant'});};restore();window.requestAnimationFrame(restore);return;}
    if(button.dataset.view){mode=button.dataset.view;if(mode==='before'){levelsEndpoint=null;levelsNotice='Before写真からは採取できません。Afterへ切り替えてください。';}render(state);return;}
    if(button.dataset.stripNav){if(!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())}))return;const id=adjacentPhotoID(state.assets,state.asset?.id,button.dataset.stripNav==='next'?1:-1);if(id)run('openAsset',id);return;}
    if(button.dataset.assetId){if(button.closest('#filmstrip-track')&&stripGesture.suppressClick())return;if(!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())})){if(state.dirty){localError='未保存の変更があります。先に保存してください。';render(state);}return;}if(button.dataset.assetId!==state.asset?.id)run('openAsset',button.dataset.assetId);return;}
    if(button.dataset.personId){run('selectPerson',button.dataset.personId);return;}
    switch(button.dataset.action){case'import':byID('raw-file').click();break;case'rotate':run('setAdjustment','rotationDegrees',((state.recipe?.parameters?.rotationDegrees??0)+90)%360);break;case'detect':run('detectPeople');break;case'reload':if(!state.dirty||window.confirm('未保存の変更を保持するかどうかは session の再読込処理で確認されます。再読込を続けますか？'))run('reload');break;case'batch-apply':applyBatchSelection();break;case'levels-sync':syncLevelsSelection();break;case'glow-sync':syncGlowSelection();break;case'vignette-sync':syncVignetteSelection();break;case'selective-sync':syncSelectiveSelection();break;case'grain-sync':syncGrainSelection();break;case'calibration-sync':syncCalibrationSelection();break;case'export-jpeg':run('exportFinal',{format:'jpeg',quality:0.95});break;case'export-png':run('exportFinal',{format:'png',quality:1});break;case'export-tiff':run('exportFinal',{format:'tiff',quality:0.95});break;case'cancel-export':run('cancelExport');break;default:if(button.dataset.action)run(button.dataset.action);}
  },{signal:lifetime.signal});
  byID('batch-targets').addEventListener('change',event=>{const input=event.target;if(input?.matches?.('input[name="batch-target"]')&&!input.disabled){if(input.checked)batchTargetIDs.add(input.value);else batchTargetIDs.delete(input.value);renderBatchControls({rebuild:false});}},{signal:lifetime.signal});
  byID('batch-final-choices').addEventListener('change',event=>{
    const input=event.target;if(!input?.matches?.('input[name="batch-final-asset"]')||input.disabled)return;
    if(input.checked&&batchFinalIDs.length<20&&!batchFinalIDs.includes(input.value))batchFinalIDs.push(input.value);
    else if(!input.checked)batchFinalIDs=batchFinalIDs.filter(id=>id!==input.value);
    clearBatchFinalDownloads();batchFinalStatus='';renderBatchFinalControls();
    [...byID('batch-final-assets').querySelectorAll('input[name="batch-final-asset"]')].find(candidate=>candidate.value===input.value)?.focus({preventScroll:true});
  },{signal:lifetime.signal});
  byID('batch-final-choices').addEventListener('click',event=>{
    const button=event.target.closest('[data-batch-final-move]');if(!button||button.disabled)return;
    const index=batchFinalIDs.indexOf(button.dataset.batchFinalAssetId),other=index+(button.dataset.batchFinalMove==='up'?-1:1);
    if(index<0||other<0||other>=batchFinalIDs.length)return;
    [batchFinalIDs[index],batchFinalIDs[other]]=[batchFinalIDs[other],batchFinalIDs[index]];
    clearBatchFinalDownloads();batchFinalStatus='';renderBatchFinalControls();
    const moves=[...byID('batch-final-assets').querySelectorAll('[data-batch-final-move]')];
    (moves.find(candidate=>candidate.dataset.batchFinalAssetId===button.dataset.batchFinalAssetId&&candidate.dataset.batchFinalMove===button.dataset.batchFinalMove&&!candidate.disabled)||
      [...byID('batch-final-assets').querySelectorAll('input[name="batch-final-asset"]')].find(candidate=>candidate.value===button.dataset.batchFinalAssetId))?.focus({preventScroll:true});
  },{signal:lifetime.signal});
  for(const control of [byID('batch-final-format'),byID('batch-final-naming'),byID('batch-final-custom'),exportSizeMethod,exportSizeValue,exportSizeWidth,exportSizeHeight,exportExactStrategy,exportExactBackground,exportResolutionUnit,exportResolutionValue]){
    for(const type of ['input','change'])control.addEventListener(type,()=>{invalidateBatchMakeup();invalidateBatchShadow();if(batchFinalDownloads.length)clearBatchFinalDownloads();batchFinalStatus='';renderBatchFinalControls();},{signal:lifetime.signal});
  }
  byID('batch-final-start').addEventListener('click',()=>{if(!byID('batch-final-start').disabled)startBatchFinal();},{signal:lifetime.signal});
  byID('batch-final-cancel').addEventListener('click',()=>{if(!batchFinalRunning||typeof session.cancelExport!=='function')return;batchFinalStatus='中断を要求しました。完了していないFinalのリンクは表示しません。';batchQualityController?.abort();session.cancelExport();renderBatchFinalControls();},{signal:lifetime.signal});
  byID('batch-final-clear').addEventListener('click',()=>{clearBatchFinalDownloads();batchFinalStatus='生成済みリンクを破棄しました。';renderBatchFinalControls();},{signal:lifetime.signal});
  strip.addEventListener('pointerdown',event=>stripGesture.pointerDown(event),{signal:lifetime.signal});
  strip.addEventListener('pointermove',event=>stripGesture.pointerMove(event),{signal:lifetime.signal});
  strip.addEventListener('pointerup',event=>stripGesture.pointerEnd(event),{signal:lifetime.signal});
  strip.addEventListener('pointercancel',event=>stripGesture.pointerEnd(event),{signal:lifetime.signal});
  strip.addEventListener('scroll',()=>stripGesture.scroll(),{passive:true,signal:lifetime.signal});
  strip.addEventListener('wheel',event=>stripGesture.wheel(event),{passive:false,signal:lifetime.signal});
  strip.addEventListener('dragstart',event=>event.preventDefault(),{signal:lifetime.signal});
  strip.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key)||!canSwitchPhoto(state,{pending,blocked:Boolean(access.reason())}))return;const id=adjacentPhotoID(state.assets,state.asset?.id,event.key==='ArrowRight'?1:-1);if(id){event.preventDefault();run('openAsset',id);}},{signal:lifetime.signal});
  byID('raw-file').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)run('importRaw',file);},{signal:lifetime.signal});
  byID('face-brightness').addEventListener('input',event=>{byID('face-value').textContent=formatValue(event.target.value,' EV');},{signal:lifetime.signal});
  byID('face-brightness').addEventListener('change',event=>run('setAdjustment','faceBrightness',Number(event.target.value)),{signal:lifetime.signal});
  byID('crop-ratio').addEventListener('change',event=>{if(event.target.disabled){render(state);return;}run('setAdjustment','cropRatio',event.target.value);},{signal:lifetime.signal});
  if(byID('author-form')){
    byID('author-form').addEventListener('submit',event=>event.preventDefault(),{signal:lifetime.signal});
    byID('author-form').addEventListener('input',()=>{const fields=new FormData(byID('author-form'));byID('look-title').textContent=String(fields.get('lookName')||'Untitled look');byID('look-byline').textContent=`${fields.get('author')||'作者未入力'} · version ${fields.get('version')||'未入力'}`;byID('look-description').textContent=String(fields.get('draft')||'Look のメモがここに表示されます。');},{signal:lifetime.signal});
  }
  byID('trial-logout').addEventListener('click',async()=>{
    if(byID('trial-logout').disabled)return;if(authorDispose?.hasUnsavedChanges?.()){localError='未保存の作者下書きがあります。先に保存してください。';render(state);return;}
    if(invalidSession){location.assign(validatedSignOutURL('/auth/logout?return_to=/'));return;}
    pending=true;localError='';render(state);try{const result=await authorAPI.logout();if(trialSession?.mode==='SITES'){if(!result||Object.keys(result).length!==1||!Object.hasOwn(result,'signOutURL'))throw Error('SIGNOUT_ROUTE_UNCONFIRMED');const signOutURL=validatedSignOutURL(result.signOutURL);if(!disposed)location.assign(signOutURL);}else{const check=await authorAPI.getSession();if(check.principal)throw Error('LOGOUT_NOT_CONFIRMED');if(!disposed)location.assign('/login');}}catch(err){localError=err.message??String(err);}finally{pending=false;if(!disposed)render(state);}
  },{signal:lifetime.signal});
  render(state);const unsubscribe=session.subscribe(render);
  const deadlineTimer=invited?setInterval(()=>{if(access.reason()){for(const fn of accessListeners)fn();render(state);}},1000):null;
  return ()=>{disposed=true;root.classList.remove('editorial-editor');lifetime.abort();canvasEdgeOverlay.dispose();bwComponent?.dispose();shadowComponent?.dispose();stopOriginalShadow();clippingResizeObserver?.disconnect();if(deadlineTimer!==null)clearInterval(deadlineTimer);accessListeners.clear();if(typeof unsubscribe==='function')unsubscribe();if(typeof authorDispose==='function')authorDispose();for(const dispose of additionalDisposers)dispose();if(downloadURL)URL.revokeObjectURL(downloadURL);clearBatchFinalDownloads();};
}
