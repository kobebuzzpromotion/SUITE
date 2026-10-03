// Existing Recipe v1 extension, not a new storage API or portrait pixel-rendering claim.
import {validatePersonGeometryInventory, validatePersonGeometryBinding, validatePersonGeometryContinuity} from './person-geometry-validation.js';
export interface PortraitAnchor { x:number; y:number; width:number; height:number }
export interface PortraitTarget { id:string; anchor:PortraitAnchor; adjustmentType:'face_brightness'; value:number }
export interface PortraitRecipe { schemaVersion:1; engineVersion:'apple-vision-face-exposure-1'|'web-libraw-mediapipe-face-exposure-1'; assetID:string; originalSHA256:string; targets:PortraitTarget[]; createdAt:string; updatedAt:string }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(x:unknown,keys:string[]):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_PORTRAIT');const v=x as Record<string,unknown>;if(Object.keys(v).length!==keys.length||keys.some(k=>!(k in v))||Object.keys(v).some(k=>!keys.includes(k)))throw Error('INVALID_PORTRAIT_FIELDS');return v;}
export function validatePortraitRecipe(input:unknown):asserts input is PortraitRecipe {
 const p=object(input,['schemaVersion','engineVersion','assetID','originalSHA256','targets','createdAt','updatedAt']);
 if(p.schemaVersion!==1||!['apple-vision-face-exposure-1','web-libraw-mediapipe-face-exposure-1'].includes(p.engineVersion as string)||typeof p.assetID!=='string'||!uuid.test(p.assetID)||typeof p.originalSHA256!=='string'||!/^[0-9a-f]{64}$/i.test(p.originalSHA256)||!Array.isArray(p.targets)||!p.targets.length||p.targets.length>64)throw Error('INVALID_PORTRAIT');
 for(const k of ['createdAt','updatedAt']){
   const value=p[k];
   if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('INVALID_PORTRAIT_DATE');
   const canonical=new Date(value).toISOString();
   if((value.includes('.')?canonical:canonical.replace('.000Z','Z'))!==value)throw Error('INVALID_PORTRAIT_DATE');
 }
 if(Date.parse(p.updatedAt as string)<Date.parse(p.createdAt as string))throw Error('INVALID_PORTRAIT_DATE_ORDER');
 const ids=new Set<string>();for(const target of p.targets){const t=object(target,['id','anchor','adjustmentType','value']);if(typeof t.id!=='string'||!uuid.test(t.id)||ids.has(t.id.toLowerCase())||t.adjustmentType!=='face_brightness'||typeof t.value!=='number'||!Number.isFinite(t.value)||Math.abs(t.value)>4)throw Error('INVALID_PORTRAIT_TARGET');ids.add(t.id.toLowerCase());const a=object(t.anchor,['x','y','width','height']);if(Object.values(a).some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('INVALID_PORTRAIT_ANCHOR');const {x,y,width,height}=a as unknown as PortraitAnchor;if(x<0||y<0||width<=0||height<=0||x+width>1||y+height>1)throw Error('INVALID_PORTRAIT_ANCHOR');}
 try {validatePersonGeometryInventory(p);} catch(error) {throw Error('INVALID_PORTRAIT_'+(error instanceof Error?error.message:'PERSON_GEOMETRY'));}
}
export function validatePortraitBinding(input:unknown,assetID:string,originalSHA256:string):void {validatePortraitRecipe(input);try{validatePersonGeometryBinding(input,assetID,originalSHA256);}catch{throw Error('PORTRAIT_ASSET_BINDING');}}
/** Same-photo target inventory, never a cross-photo tracking or biometric identity claim. */
export function validatePortraitContinuity(reference:unknown,incoming:unknown):void {
 validatePortraitRecipe(reference); validatePortraitRecipe(incoming);
 try{validatePersonGeometryContinuity(reference,incoming);}catch(error){throw Error('PORTRAIT_'+(error instanceof Error?error.message:'PERSON_BINDING'));}
 for(const target of incoming.targets){
   const known=reference.targets.find(t=>t.id.toLowerCase()===target.id.toLowerCase());
   if(!known||known.adjustmentType!==target.adjustmentType)throw Error('PORTRAIT_PERSON_BINDING');
 }
}
export function portraitIntersectionOverUnion(a:PortraitAnchor,b:PortraitAnchor):number {const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return area/(a.width*a.height+b.width*b.height-area);}
