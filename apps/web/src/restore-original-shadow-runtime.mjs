import {SitesClient} from './sites-client.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {validateOriginalShadowManualDocument} from './original-shadow-manual-recipe.mjs';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES} from './processing/pure.mjs';
import {authorSubjectMask} from './processing/subject-mask-authoring.mjs';
import {applyBackgroundComposite} from './processing/background-composite.mjs';
import {ORIGINAL_SHADOW_MASK_SOURCE} from './processing/original-shadow.mjs';

const SHA=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
export const originalShadowRestoreJSON=value=>JSON.stringify(sort(value));
export async function originalShadowRestoreSHA(value){return bytesSHA(new TextEncoder().encode(originalShadowRestoreJSON(value)));}
async function bytesSHA(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
const same=(a,b)=>originalShadowRestoreJSON(a)===originalShadowRestoreJSON(b);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{
  const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});

/** Serializable reference ONLY. Local storage cannot confer authority: every
 * field, original digest, permission, principal, HEAD and history is read again. */
export function validateOriginalShadowRestoreHint(hint){
  if(!exact(hint,['kind','assetId','assetSHA256','headRevision','headBodySHA256','selection','identity','documentSHA256'])||
    hint.kind!=='sites-original-shadow-restore-hint-1'||!UUID.test(hint.assetId)||!SHA.test(hint.assetSHA256)||
    !Number.isSafeInteger(hint.headRevision)||hint.headRevision<1||!SHA.test(hint.headBodySHA256)||!SHA.test(hint.documentSHA256)||
    !exact(hint.selection,['assetId','revision','bodySHA256'])||hint.selection.assetId!==hint.assetId||
    !Number.isSafeInteger(hint.selection.revision)||hint.selection.revision<1||hint.selection.revision>hint.headRevision||!SHA.test(hint.selection.bodySHA256)||
    !exact(hint.identity,['id','tenantId'])||!UUID.test(hint.identity.id)||hint.identity.tenantId!==`trial-${hint.identity.id}`)
    throw Error('ORIGINAL_SHADOW_RESTORE_HINT_INVALID');
  return structuredClone(hint);
}

/** Actual Sites history is the manual-document authority; actual latest HEAD
 * remains the CAS base. Neither is rewritten to impersonate the other. */
export async function prepareOriginalShadowRestore({api,asset,recipe,headRevision,selection,hint,guard,signal,render=true}={}){
  if(!(api instanceof SitesClient)||api.supportsRecipeHistory!==true||typeof guard!=='function')
    throw Error('ORIGINAL_SHADOW_RESTORE_SITES_REQUIRED');
  asset=structuredClone(asset);recipe=structuredClone(recipe);validateRecipe(recipe);
  const document=recipe.parameters.extendedParameters.originalShadowManual;
  if(recipe.parameters.extendedParameters.addShadowManual)throw Error('ORIGINAL_SHADOW_PREVIEW_ADD_SHADOW_UNDEFINED');
  validateOriginalShadowManualDocument(document,document?.binding,{signal});
  if(document.binding.assetID!==asset.id||document.binding.originalSHA256.toLowerCase()!==asset.sha256?.toLowerCase())
    throw Error('ORIGINAL_SHADOW_RESTORE_ASSET_CHANGED');
  if(hint)hint=validateOriginalShadowRestoreHint(hint);
  const check=()=>{checkAbort(signal);guard();};
  const read=async task=>{check();const value=await task();check();return value;};
  const hash=value=>read(()=>originalShadowRestoreSHA(value));
  const documentSHA256=await hash(document);
  if(hint&&(hint.assetId!==asset.id||hint.assetSHA256!==asset.sha256.toLowerCase()||
    hint.headRevision!==headRevision||hint.documentSHA256!==documentSHA256))throw Error('ORIGINAL_SHADOW_RESTORE_HINT_STALE');
  let identity=hint?.identity,headBodySHA256=hint?.headBodySHA256,selected=selection?structuredClone(selection):hint?.selection;
  let firstAssets,historicalRecipe;
  const principal=async()=>{
    const session=await read(()=>api.getSession()),p=session?.principal;
    if(session?.mode!=='SITES'||!UUID.test(p?.id)||p.tenantId!==`trial-${p.id}`||!['author','admin'].includes(p.role)||
      identity&&(p.id!==identity.id||p.tenantId!==identity.tenantId))throw Error('ORIGINAL_SHADOW_RESTORE_PRINCIPAL_CHANGED');
    identity={id:p.id,tenantId:p.tenantId};
  };
  const verify=async()=>{
    await principal();
    const head=await read(()=>api.getRecipe(asset.id,{signal}));
    if(head?.branch===true||head?.revision!==headRevision)throw Error('ORIGINAL_SHADOW_RESTORE_HEAD_CHANGED');
    validateRecipe(head.body);
    const currentSHA=await hash(head.body);
    if(headBodySHA256&&headBodySHA256!==currentSHA)throw Error('ORIGINAL_SHADOW_RESTORE_HEAD_CHANGED');
    headBodySHA256=currentSHA;
    if(!selected){
      if(!same(head.body.parameters.extendedParameters.originalShadowManual,document))throw Error('ORIGINAL_SHADOW_RESTORE_HINT_REQUIRED');
      selected={assetId:asset.id,revision:headRevision,bodySHA256:currentSHA};
    }
    if(!exact(selected,['assetId','revision','bodySHA256'])||selected.assetId!==asset.id||!Number.isSafeInteger(selected.revision)||
      selected.revision<1||selected.revision>headRevision||!SHA.test(selected.bodySHA256))throw Error('ORIGINAL_SHADOW_RESTORE_SELECTION_INVALID');
    const rows=await read(()=>api.getRecipeHistory(asset.id,{signal}));
    if(!Array.isArray(rows))throw Error('RECIPE_HISTORY_INVALID');
    const found=rows.filter(row=>row?.revision===selected.revision&&row.branch!==true);
    if(found.length!==1)throw Error('ORIGINAL_SHADOW_RESTORE_HISTORY_CHANGED');
    validateRecipe(found[0].body);
    if(await hash(found[0].body)!==selected.bodySHA256||!same(found[0].body.parameters.extendedParameters.originalShadowManual,document))
      throw Error('ORIGINAL_SHADOW_RESTORE_HISTORY_CHANGED');
    historicalRecipe=structuredClone(found[0].body);
    const listed=await read(()=>api.listAssets());
    if(!Array.isArray(listed))throw Error('ORIGINAL_SHADOW_RESTORE_ASSET_CHANGED');
    const claims=[{id:asset.id,sha:asset.sha256.toLowerCase(),action:'edit'},
      {id:document.binding.backdropID,sha:document.binding.backdropSHA256.toLowerCase(),action:'export'}];
    const assets=[];
    for(const [index,claim] of claims.entries()){
      const found=listed.filter(a=>a?.id===claim.id),a=found[0];
      if(found.length!==1||a.tenantId!==identity.tenantId||a.deletedAt!==null||a.cloudSafe!==true||a.sha256?.toLowerCase()!==claim.sha||
        !Number.isSafeInteger(a.size)||a.size<1||a.size>MAX_INPUT_BYTES||index===0&&a.size!==asset.size||
        firstAssets&&a.size!==firstAssets[index].size)throw Error('ORIGINAL_SHADOW_RESTORE_ASSET_CHANGED');
      if((await read(()=>api.assertPermission(claim.id,claim.action)))?.authorized!==true)throw Error('ORIGINAL_SHADOW_RESTORE_PERMISSION_DENIED');
      assets.push({id:a.id,sha256:claim.sha,size:a.size});
    }
    firstAssets??=assets;await principal();
  };
  const originals=async()=>{
    const buffers=[];
    for(const a of firstAssets){
      const bytes=await read(()=>api.getOriginal(a.id,{signal}));
      if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==a.size||await read(()=>bytesSHA(bytes))!==a.sha256)
        throw Error('ORIGINAL_SHADOW_RESTORE_ORIGINAL_CHANGED');
      buffers.push(bytes);
    }
    return buffers;
  };
  await verify();const buffers=await originals();await verify();
  const receipt=validateOriginalShadowRestoreHint({kind:'sites-original-shadow-restore-hint-1',assetId:asset.id,
    assetSHA256:asset.sha256.toLowerCase(),headRevision,headBodySHA256,selection:selected,identity,documentSHA256});
  const recheck=async()=>{await verify();await originals();await verify();check();};
  if(!render)return {receipt,recheck};
  const processing=createProcessing();
  try{
    const decoded=[];
    for(let i=0;i<buffers.length;i++){
      const result=await read(()=>processing.decodeRaw(buffers[i].slice(0),{mode:'proxy',signal}));
      assertPixels(result.pixels);const p=result.provenance,size=sourceDimensions(result.pixels),b=document.binding;
      if(p?.mode!=='proxy'||p.sourceRepresentation!=='original-camera-raw'||p.thumbnailFallback!==false||
        p.sourceSHA256?.toLowerCase()!==firstAssets[i].sha256||size.width!==b.sourceWidth||size.height!==b.sourceHeight)
        throw Error('ORIGINAL_SHADOW_RESTORE_DECODE_MISMATCH');
      const proxy=await read(()=>processing.makeProxy(result.pixels,1600));assertPixels(proxy);
      const proxySize=sourceDimensions(proxy),scale=Math.min(1,1600/Math.max(size.width,size.height));
      if(proxy.width!==Math.max(1,Math.round(size.width*scale))||proxy.height!==Math.max(1,Math.round(size.height*scale))||
        proxySize.width!==size.width||proxySize.height!==size.height||proxy.width*proxy.height>8_000_000)
        throw Error('ORIGINAL_SHADOW_RESTORE_PROXY_MISMATCH');
      decoded.push({proxy,provenance:result.provenance,metadata:result.metadata});
    }
    const proxy=decoded[0].proxy,background=decoded[1].proxy,b=document.binding;
    const representation=proxy.width===b.sourceWidth&&proxy.height===b.sourceHeight?'original':'proxy';
    const original=representation==='original'?{width:proxy.width,height:proxy.height,data:proxy.data}:proxy;
    const context={assetID:asset.id,originalSHA256:b.originalSHA256,savedRevision:selected.revision};
    const subjectMask=authorSubjectMask(original,document.subjectStrokes,context,{ownerConfirmed:true,signal});
    const shadow=authorSubjectMask(original,document.shadowStrokes,context,{ownerConfirmed:true,signal});
    const shadowMask={width:shadow.width,height:shadow.height,data:shadow.data,provenance:{kind:'original-shadow-mask',source:ORIGINAL_SHADOW_MASK_SOURCE,...context,width:shadow.width,height:shadow.height}};
    const composite=applyBackgroundComposite(original,background,subjectMask,context,{signal});
    const binding={...context,backdropID:b.backdropID,backdropSHA256:b.backdropSHA256};
    const compositeEvidence={kind:'composited-replacement-background',source:'owner-selected-image-backdrop-unverified',...binding,
      representation,width:composite.width,height:composite.height,pixelsSHA256:await read(()=>bytesSHA(composite.data))};
    const pixels=await read(()=>processing.applyBoundOriginalShadowManual({representation,
      savedRecipe:{revision:selected.revision,body:historicalRecipe},binding,original,composite,compositeEvidence,subjectMask,shadowMask},{signal}));
    await recheck();
    const withoutManual=structuredClone(recipe);delete withoutManual.parameters.extendedParameters.originalShadowManual;validateRecipe(withoutManual);
    return {receipt,recheck,proxy,pixels:{...pixels,sourceWidth:b.sourceWidth,sourceHeight:b.sourceHeight},recipe:withoutManual,
      provenance:decoded[0].provenance,metadata:decoded[0].metadata,document};
  }finally{processing.dispose();}
}
