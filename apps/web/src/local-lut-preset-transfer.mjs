import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {portableParameters} from '../preset-policy.mjs';
import {portablePresetRecipe} from './preset-author/preset-author-contract.mjs';
import {loadLocalLUTBytes} from './local-lut-store.mjs';
import {parseCubeLUT} from './delta66-preset-cube.mjs';

export const LUT_PRESET_MAX_BYTES=46*1024*1024;
const RAW_MAX=32*1024*1024, RECIPE_MAX=256*1024;
const abort=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
const fail=()=>{throw Error('INVALID_LOCAL_LUT_PRESET');};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||keys.some(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return !d?.enumerable||!Object.hasOwn(d,'value');}))fail();
}
function label(value){if(typeof value!=='string'||!value.trim()||value.length>255||/[\p{Cc}\p{Cf}]/u.test(value))fail();return value.trim();}
function profileCopy(value){
  exact(value,['kind','intensity','lutRef']);exact(value.lutRef,['sha256','byteLength']);
  if(value.kind!=='local-lut'||!Number.isFinite(value.intensity)||value.intensity<0||value.intensity>1||
    typeof value.lutRef.sha256!=='string'||! /^[a-f0-9]{64}$/.test(value.lutRef.sha256)||
    !Number.isSafeInteger(value.lutRef.byteLength)||value.lutRef.byteLength<1||value.lutRef.byteLength>RAW_MAX)fail();
  return {kind:'local-lut',intensity:value.intensity,lutRef:{...value.lutRef}};
}
function portable(recipe){
  if(new TextEncoder().encode(JSON.stringify(recipe)).byteLength>RECIPE_MAX)fail();
  const safe=portablePresetRecipe(recipe);
  if(new TextEncoder().encode(JSON.stringify(safe)).byteLength>RECIPE_MAX)fail();
  return safe;
}
async function verify(bytes,profile,signal){
  abort(signal);if(bytes.byteLength!==profile.lutRef.byteLength)fail();
  parseCubeLUT(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!globalThis.crypto?.subtle)throw Error('LOCAL_LUT_CRYPTO_UNAVAILABLE');
  const hash=await crypto.subtle.digest('SHA-256',bytes);abort(signal);
  if(Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')!==profile.lutRef.sha256)fail();
}
/** Explicit local file only; no remote upload, license inference or library ID. */
export async function encodeLocalLUTPreset({name,recipe},{signal}={}){
  abort(signal);validateRecipe(recipe);
  const profile=profileCopy(recipe.parameters.extendedParameters.postDecodeAdjustments?.color?.profile);
  const copy=structuredClone(recipe);delete copy.parameters.extendedParameters.postDecodeAdjustments.color.profile;
  const safe=portable(copy),bytes=await loadLocalLUTBytes(profile.lutRef,{signal});abort(signal);
  let binary='';for(let at=0;at<bytes.length;at+=16384)binary+=String.fromCharCode(...bytes.subarray(at,at+16384));
  const json=JSON.stringify({format:'suite-lut-preset-1',name:label(name),recipe:safe,profile,cubeBase64:btoa(binary)});
  const blob=new Blob([json],{type:'application/json'});if(blob.size>LUT_PRESET_MAX_BYTES)fail();abort(signal);return blob;
}
export async function decodeLocalLUTPreset(file,{signal}={}){
  abort(signal);if(!(file instanceof Blob)||file.size<1||file.size>LUT_PRESET_MAX_BYTES)fail();
  const buffer=await file.arrayBuffer();abort(signal);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  exact(value,['format','name','recipe','profile','cubeBase64']);if(value.format!=='suite-lut-preset-1')fail();
  const name=label(value.name),profile=profileCopy(value.profile),recipe=portable(value.recipe);
  // Profile travels exactly once, outside the small ordinary portable recipe.
  if(Object.hasOwn(recipe.parameters.extendedParameters.postDecodeAdjustments?.color??{},'profile'))fail();
  const encoded=value.cubeBase64;
  if(typeof encoded!=='string'||encoded.length!==4*Math.ceil(profile.lutRef.byteLength/3)||
    /[^A-Za-z0-9+/=]/.test(encoded))fail();
  const binary=atob(encoded);if(btoa(binary)!==encoded)fail();
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));await verify(bytes,profile,signal);
  return {name,parameters:portableParameters(recipe),profile,bytes};
}
