/**
 * Versioned, data-only Web ↔ Apple capability preflight. These fixed claims
 * come from Web processing/pure.mjs and Apple PhotoPipeline.swift. They are
 * deliberately narrower than Recipe.swift's Codable stage enum and Node's
 * storage validator. This module grants no render, auth, transfer or sync.
 */
import {validateAppleLocalEdit} from './apple-local-edit-import.mjs';
const REPORT_VERSION = 1;
const EVIDENCE_VERSION = 'suite-web-apple-recipe-capabilities-2026-10-11-v2';
const RECIPE_STAGES = Object.freeze(['whiteBalance','tint','exposure','contrast','highlight','shadow',
  'white','black','temperature','saturation','vibrance','hsl','toneCurve','sharpness',
  'noiseReduction','lensCorrection','postDecodeAdjustments','crop','rotation']);
const WEB_STAGES = new Set(['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop']);
const APPLE_STAGES = new Set(['exposure','contrast','saturation','rotation','crop']);
const WEB_ORDER = ['exposure','contrast','saturation','postDecodeAdjustments','rotation','crop'];
const EXTENSIONS = new Set(['crop','export','portrait','postDecodeAdjustments','postCropAdjustments',
  'canvasExpand','localLevels','bwEdgeManual','addShadowManual','teethManual','makeupHighlightManual',
  'localRetouch','localWarp','localBackdrop']);
const WEB_EXTENSIONS = new Set(['crop','export','portrait','postDecodeAdjustments','postCropAdjustments',
  'canvasExpand','localLevels','bwEdgeManual','addShadowManual']);
const APPLE_EXTENSIONS = new Set(['crop','export','portrait']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEB_STAGE_EVIDENCE = 'apps/web/src/processing/pure.mjs:renderPixels';
const APPLE_STAGE_EVIDENCE = 'apps/apple/Suite/Services/PhotoPipeline.swift:apply';
const WEB_EXTENSION_EVIDENCE = 'apps/web/src/processing/pure.mjs:renderPixels';
const APPLE_EXTENSION_EVIDENCE = 'apps/apple/Suite/Services/PhotoPipeline.swift:validate/apply';
const fail = code => {throw Error(`CROSS_DEVICE_CAPABILITY_${code}`);};
function timestamp(value) {
  if (typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(value)||
      !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value) fail('PRESET_TIME');
}
function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail(code);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) fail(code);
  }
  return value;
}
function exact(value, keys, code) {
  const object=record(value,code),actual=Object.keys(object);
  if (actual.length!==keys.length || actual.some(key=>!keys.includes(key))) fail(code);
  return object;
}
function array(value, code, max=1000) {
  if (!Array.isArray(value) || value.length>max || Reflect.ownKeys(value).length!==value.length+1 ||
      Array.from({length:value.length},(_,i)=>!Object.hasOwn(value,i)).some(Boolean)) fail(code);
  return value;
}
function json(value, depth=0, allowNull=false) {
  if (depth>32) fail('DEPTH');
  if (value===null && allowNull) return;
  if (value===null || value===undefined) fail('JSON_VALUE');
  if (typeof value==='number') {if (!Number.isFinite(value)||Object.is(value,-0)) fail('JSON_VALUE');return;}
  if (typeof value==='string' || typeof value==='boolean') return;
  if (Array.isArray(value)) {for(const item of array(value,'JSON_VALUE',100000)) json(item,depth+1,allowNull);return;}
  for(const [key,item] of Object.entries(record(value,'JSON_VALUE'))) {
    if (!key || key.length>256) fail('JSON_VALUE');json(item,depth+1,allowNull);
  }
}
function preserved(value, allowNull=false) {
  json(value,0,allowNull);
  const encoded=JSON.stringify(value);
  if (new TextEncoder().encode(encoded).length>2_000_000) fail('SIZE');
  return deepFreeze(JSON.parse(encoded));
}
function deepFreeze(value) {
  if (value && typeof value==='object') {for(const item of Object.values(value)) deepFreeze(item);Object.freeze(value);}
  return value;
}
function recipe(value) {
  const document=exact(value,['schemaVersion','parameters'],'RECIPE_FIELDS');
  if (document.schemaVersion!==1) fail('RECIPE_VERSION');
  const p=exact(document.parameters,['exposure','contrast','saturation','rotationDegrees',
    'extendedParameters','processingOrder'],'RECIPE_FIELDS');
  if (!Number.isFinite(p.exposure)||Object.is(p.exposure,-0)||!Number.isFinite(p.contrast)||
      p.contrast<0||Object.is(p.contrast,-0)||!Number.isFinite(p.saturation)||
      p.saturation<0||Object.is(p.saturation,-0)||!Number.isSafeInteger(p.rotationDegrees)) fail('RECIPE_VALUE');
  const order=array(p.processingOrder,'RECIPE_ORDER',RECIPE_STAGES.length);
  if (new Set(order).size!==order.length) fail('RECIPE_ORDER');
  for(const stage of order) if(!RECIPE_STAGES.includes(stage)) fail('UNKNOWN_STAGE');
  const extensions=record(p.extendedParameters,'RECIPE_EXTENSIONS');
  for(const name of Object.keys(extensions)) {
    if (!EXTENSIONS.has(name)) fail('UNKNOWN_EXTENSION');
    if (['localRetouch','localWarp','localBackdrop'].includes(name)) validateAppleLocalEdit(name,extensions[name]);
    json(extensions[name]);
  }
  if ((Object.hasOwn(extensions,'postDecodeAdjustments'))!==order.includes('postDecodeAdjustments') ||
      Object.hasOwn(extensions,'crop') && order.at(-1)!=='crop' ||
      order.includes('crop') && !Object.hasOwn(extensions,'crop')) fail('RECIPE_ORDER');
  for(const [key,neutral] of [['exposure',0],['contrast',1],['saturation',1]])
    if(p[key]!==neutral && !order.includes(key)) fail('RECIPE_ORDER');
  if (p.rotationDegrees%360!==0 && !order.includes('rotation')) fail('RECIPE_ORDER');
  preserved(document);
  return document;
}
function preset(value) {
  const p=exact(value,['id','workspaceId','scope','ownerUserId','name','version','body',
    'createdAt','updatedAt','deletedAt'],'PRESET_FIELDS');
  if (!UUID.test(p.id)||!UUID.test(p.workspaceId)||
      !['PERSONAL','WORKSPACE','COMMUNITY','AUTHOR'].includes(p.scope)||
      typeof p.ownerUserId!=='string'||!p.ownerUserId.trim()||
      typeof p.name!=='string'||!p.name.trim()||
      !Number.isSafeInteger(p.version)||p.version<1||
      (p.deletedAt!==null&&typeof p.deletedAt!=='string')) fail('PRESET_VALUE');
  timestamp(p.createdAt);timestamp(p.updatedAt);if(p.deletedAt!==null)timestamp(p.deletedAt);
  recipe(p.body);
  return p;
}
function webValueSupported(name, parameters) {
  if (name==='exposure') return Math.abs(parameters.exposure)<=4;
  if (name==='contrast') return parameters.contrast<=4;
  if (name==='saturation') return parameters.saturation<=4;
  if (name==='rotation') return parameters.rotationDegrees%90===0;
  if (name==='crop' && Object.hasOwn(parameters.extendedParameters,'crop')) {
    const crop=parameters.extendedParameters.crop;
    return crop && typeof crop==='object' && !Object.hasOwn(crop,'width_mm') &&
      !Object.hasOwn(crop,'height_mm');
  }
  return true;
}
function finding(name, source, target, kind, parameters) {
  // Recognize native documents without granting Web rendering or converting their
  // photo-local geometry. Preserve the original payload for a capable renderer.
  if (kind==='extension' && ['localRetouch','localWarp','localBackdrop'].includes(name)) {
    return Object.freeze({name,assessment:'unsupported',sourceCapability:source==='apple'?'present':'unsupported',
      targetCapability:target==='apple'?'present':'unsupported',
      reason:'NATIVE_LOCAL_EDIT_WEB_RENDERER_NOT_CONNECTED',
      description:'Apple局所編集・背景合成（任意の原寸用finalMask参照を含む）は保持できますが、対応するWeb描画経路は未接続です。参照する背景・マスクの取得や許諾確認も行いません。省略やマスクの暗黙拡大で描画しません。',
      evidence:Object.freeze([APPLE_EXTENSION_EVIDENCE,WEB_EXTENSION_EVIDENCE])});
  }
  const stage=kind==='stage',sourceHas=(stage?source==='web'?WEB_STAGES:APPLE_STAGES:
    source==='web'?WEB_EXTENSIONS:APPLE_EXTENSIONS).has(name) &&
    (source!=='web'||webValueSupported(name,parameters));
  const targetHas=(stage?target==='web'?WEB_STAGES:APPLE_STAGES:
    target==='web'?WEB_EXTENSIONS:APPLE_EXTENSIONS).has(name) &&
    (target!=='web'||webValueSupported(name,parameters));
  // Crop/export geometry and portrait identity/engine portability need more
  // evidence than the mere presence of both implementations.
  const uncertain=['crop','export'].includes(name);
  const incompatiblePortrait=name==='portrait';
  const assessment=!sourceHas||!targetHas||incompatiblePortrait?'unsupported':uncertain?'unverified':'supported';
  return Object.freeze({name,assessment,sourceCapability:sourceHas?'present':'unsupported',
    targetCapability:targetHas?'present':'unsupported',
    evidence:Object.freeze([stage?source==='web'?WEB_STAGE_EVIDENCE:APPLE_STAGE_EVIDENCE:
      source==='web'?WEB_EXTENSION_EVIDENCE:APPLE_EXTENSION_EVIDENCE,
      stage?target==='web'?WEB_STAGE_EVIDENCE:APPLE_STAGE_EVIDENCE:
        target==='web'?WEB_EXTENSION_EVIDENCE:APPLE_EXTENSION_EVIDENCE])});
}

/** Preserve every field; report only, never silently convert or authorize. */
export function preflightCrossDeviceCapabilities({direction,kind,record:input}={}) {
  if (!['web-to-apple','apple-to-web'].includes(direction)||!['recipe','preset'].includes(kind)) fail('INPUT');
  const source=direction==='web-to-apple'?'web':'apple',target=source==='web'?'apple':'web';
  const sourceValue=kind==='recipe'?recipe(input):preset(input),body=kind==='recipe'?sourceValue:sourceValue.body;
  const order=body.parameters.processingOrder,extensions=body.parameters.extendedParameters;
  const stages=Object.freeze(order.map(name=>finding(name,source,target,'stage',body.parameters)));
  const extensionRows=Object.freeze(Object.keys(extensions).sort().map(name=>finding(name,source,target,'extension',body.parameters)));
  const targetOrderSupported=target!=='web'||order.every((name,i)=>i===0||
    WEB_ORDER.indexOf(name)>=WEB_ORDER.indexOf(order[i-1]));
  const sourceOrderSupported=source!=='web'||order.every((name,i)=>i===0||
    WEB_ORDER.indexOf(name)>=WEB_ORDER.indexOf(order[i-1]));
  const orderAssessment=sourceOrderSupported&&targetOrderSupported?'supported':'unsupported';
  const scope=kind==='preset'?sourceValue.scope:null;
  const presetAssessment=kind==='preset'&&(!['PERSONAL','WORKSPACE'].includes(scope)||
    sourceValue.deletedAt!==null)?'unsupported':'supported';
  const all=[...stages,...extensionRows].map(item=>item.assessment).concat(orderAssessment,presetAssessment);
  const assessment=all.includes('unsupported')?'unsupported':all.includes('unverified')?'unverified':'supported';
  const preservedRecord=preserved(sourceValue,kind==='preset');
  return Object.freeze({reportSchemaVersion:REPORT_VERSION,evidenceVersion:EVIDENCE_VERSION,
    direction,source,target,kind,recipeSchemaVersion:1,
    preset:kind==='preset'?Object.freeze({scope,version:sourceValue.version,assessment:presetAssessment}):null,
    stages,extensions:extensionRows,
    order:Object.freeze({assessment:orderAssessment,sourceCapability:sourceOrderSupported?'present':'unsupported',
      targetCapability:targetOrderSupported?'present':'unsupported',
      evidence:Object.freeze([WEB_STAGE_EVIDENCE,APPLE_STAGE_EVIDENCE])}),
    assessment,preservedRecord,
    operationAllowed:false,renderParity:'NOT_VERIFIED',authentication:'NOT_CHECKED',
    transfer:'NOT_CONNECTED',deviceVerification:'NOT_RUN'});
}
