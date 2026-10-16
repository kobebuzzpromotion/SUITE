import {TrialClient} from './trial-client.mjs';
import {SitesClient} from './sites-client.mjs';
import {validateRecipe} from '../../../dist/apps/backend/src/photo-policy.js';
import {createProcessing} from './processing/index.mjs';
import {assertPixels,sourceDimensions,checkAbort,MAX_INPUT_BYTES,MAX_SOURCE_PIXELS} from './processing/pure.mjs';
import {validateBWEdgeManualContract} from './processing/bw-edge-manual-contract.mjs';
import {validateAddShadowManualDocument} from './processing/add-shadow-manual-contract.mjs';
import {rasterizeAddShadowManualSubjectMask} from './processing/add-shadow-manual-mask.mjs';
import {prepareAddShadowWorkerRuntime} from './processing/add-shadow-runtime.mjs';
import {validateOriginalShadowManualDocument} from './original-shadow-manual-recipe.mjs';
import {authorSubjectMask} from './processing/subject-mask-authoring.mjs';
import {applyBackgroundComposite} from './processing/background-composite.mjs';
import {ORIGINAL_SHADOW_MASK_SOURCE} from './processing/original-shadow.mjs';

const SHA=/^[0-9a-f]{64}$/i,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const canonical=v=>JSON.stringify(sort(v));
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');

/** Historical comparison authority is explicit. Never masquerade as HEAD or
 * pass a rewritten API adapter into existing HEAD-only gates. This helper
 * performs the same live identity/tenant/permission/Original evidence checks,
 * but resolves the selected nonbranch version from the real history endpoint.
 * Returned runtime is ephemeral comparison data, not Save/Final authority. */
export async function prepareSavedVersionSpecialComparison({api,selection,expectedAsset,guard,signal}={}){
  if(!(api instanceof TrialClient)||api.supportsRecipeHistory!==true||typeof api.getRecipeHistory!=='function'||
      typeof guard!=='function'||!UUID.test(selection?.assetId)||!Number.isSafeInteger(selection?.revision)||selection.revision<1||
      !SHA.test(selection?.bodySHA256)||selection.assetId!==expectedAsset?.id||!SHA.test(expectedAsset?.sha256))
    throw Error('HISTORICAL_COMPARISON_CONTRACT');
  selection={...selection};expectedAsset={...expectedAsset};
  const check=()=>{checkAbort(signal);guard();};
  const read=async task=>{check();const result=await task();check();return result;};
  const hash=bytes=>read(()=>digest(bytes));
  let identity,firstAssets;
  // SitesClient inherits getSession() from TrialClient, but the actual Sites
  // worker responds with mode SITES. Pin the expected mode to the real client;
  // accepting an arbitrary alternate mode would weaken identity continuity.
  const expectedMode=api instanceof SitesClient?'SITES':'INVITED_LOCAL_TRIAL';
  const principal=session=>{
    const p=session?.principal;
    if(session?.mode!==expectedMode||!UUID.test(p?.id)||p.tenantId!==`trial-${p.id}`||
        expectedMode==='SITES'&&!['author','admin'].includes(p.role)||
        identity&&(p.id!==identity.id||p.tenantId!==identity.tenantId))throw Error('HISTORICAL_COMPARISON_SESSION_CHANGED');
    return {id:p.id,tenantId:p.tenantId};
  };
  identity=principal(await read(()=>api.getSession()));
  const historical=async()=>{
    const rows=await read(()=>api.getRecipeHistory(selection.assetId,{signal}));
    if(!Array.isArray(rows))throw Error('RECIPE_HISTORY_INVALID');
    const found=rows.filter(row=>row?.revision===selection.revision&&row.branch!==true);
    if(found.length!==1)throw Error('HISTORICAL_COMPARISON_VERSION_MISSING');
    const recipe=structuredClone(found[0].body);validateRecipe(recipe);
    if(await hash(new TextEncoder().encode(canonical(recipe)))!==selection.bodySHA256.toLowerCase())throw Error('HISTORICAL_COMPARISON_BODY_CHANGED');
    return recipe;
  };
  const recipe=await historical(),extra=recipe.parameters.extendedParameters;
  const bw=extra.bwEdgeManual,add=extra.addShadowManual,originalShadow=extra.originalShadowManual;
  if(!bw&&!add&&!originalShadow)throw Error('HISTORICAL_COMPARISON_DOCUMENT_REQUIRED');
  // Existing product does not define stacking two different shadow composites.
  if(add&&originalShadow)throw Error('ORIGINAL_SHADOW_FINAL_ADD_SHADOW_UNDEFINED');
  const documents=[bw,add,originalShadow].filter(Boolean),binding=documents[0].binding;
  for(const doc of documents){
    const b=doc.binding;
    if(!b||b.assetID!==expectedAsset.id||b.originalSHA256?.toLowerCase()!==expectedAsset.sha256.toLowerCase()||
        b.sourceWidth!==binding.sourceWidth||b.sourceHeight!==binding.sourceHeight)
      throw Error('HISTORICAL_COMPARISON_BINDING_MISMATCH');
  }
  if(!Number.isSafeInteger(binding.sourceWidth)||!Number.isSafeInteger(binding.sourceHeight)||
      binding.sourceWidth<1||binding.sourceHeight<1||binding.sourceWidth*binding.sourceHeight>MAX_SOURCE_PIXELS)
    throw Error('HISTORICAL_COMPARISON_SOURCE_CAPACITY');
  if(add)validateAddShadowManualDocument(add,add.binding,{signal});
  if(originalShadow)validateOriginalShadowManualDocument(originalShadow,originalShadow.binding,{signal});
  const backdrop=(add||originalShadow)?.binding;
  const claims=[{id:expectedAsset.id,sha256:expectedAsset.sha256,action:'edit'},
    ...(backdrop?[{id:backdrop.backdropID,sha256:backdrop.backdropSHA256,action:'export'}]:[])];
  const live=async()=>{
    principal(await read(()=>api.getSession()));
    const assets=await read(()=>api.listAssets());
    if(!Array.isArray(assets))throw Error('HISTORICAL_COMPARISON_ASSET_LIST');
    const checked=[];
    for(const [index,claim] of claims.entries()){
      const matches=assets.filter(item=>item?.id===claim.id),a=matches[0];
      if(matches.length!==1||a.tenantId!==identity.tenantId||a.deletedAt!==null||a.cloudSafe!==true||
          !SHA.test(a.sha256)||a.sha256.toLowerCase()!==claim.sha256.toLowerCase()||
          !Number.isSafeInteger(a.size)||a.size<1||a.size>MAX_INPUT_BYTES||
          firstAssets&&a.size!==firstAssets[index].size||index===0&&expectedAsset.size!==undefined&&a.size!==expectedAsset.size)
        throw Error('HISTORICAL_COMPARISON_ASSET_CHANGED');
      const permission=await read(()=>api.assertPermission(claim.id,claim.action));
      if(permission?.authorized!==true)throw Error('HISTORICAL_COMPARISON_PERMISSION_DENIED');
      checked.push({id:a.id,sha256:a.sha256.toLowerCase(),size:a.size});
    }
    principal(await read(()=>api.getSession()));
    return checked;
  };
  firstAssets=await live();
  const originals=async()=>{
    const buffers=[];
    for(const a of firstAssets){
      const bytes=await read(()=>api.getOriginal(a.id,{signal}));
      if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==a.size||await hash(bytes)!==a.sha256)
        throw Error('HISTORICAL_COMPARISON_ORIGINAL_CHANGED');
      buffers.push(bytes);
    }
    return buffers;
  };
  const buffers=await originals();
  const recheck=async()=>{
    await live();
    if(canonical(await historical())!==canonical(recipe))throw Error('HISTORICAL_COMPARISON_BODY_CHANGED');
    await originals();await live();check();
  };
  const processing=createProcessing();
  let pixels,options={};const renderRecipe=structuredClone(recipe);
  try{
    const decoded=[];
    for(let i=0;i<buffers.length;i++){
      const result=await read(()=>processing.decodeRaw(buffers[i].slice(0),{mode:'proxy',signal}));
      assertPixels(result?.pixels);const proof=result.provenance;
      const source=sourceDimensions(result.pixels);
      if(proof?.sourceRepresentation!=='original-camera-raw'||proof.thumbnailFallback!==false||proof.mode!=='proxy'||
          proof.sourceSHA256?.toLowerCase()!==firstAssets[i].sha256||source.width!==binding.sourceWidth||
          source.height!==binding.sourceHeight)throw Error('HISTORICAL_COMPARISON_DECODE_MISMATCH');
      const proxy=await read(()=>processing.makeProxy(result.pixels,1600));
      // Only bounded Proxy frames proceed to masks/composites. Decoded actual
      // pixels stay capped at 24MP; canonical source metadata is separate.
      assertPixels(proxy);
      const scale=Math.min(1,1600/Math.max(binding.sourceWidth,binding.sourceHeight));
      if(proxy.width!==Math.max(1,Math.round(binding.sourceWidth*scale))||
          proxy.height!==Math.max(1,Math.round(binding.sourceHeight*scale))||
          sourceDimensions(proxy).width!==binding.sourceWidth||
          sourceDimensions(proxy).height!==binding.sourceHeight||
          proxy.width*proxy.height>8_000_000)throw Error('HISTORICAL_COMPARISON_PROXY_CAPACITY');
      decoded.push({width:proxy.width,height:proxy.height,data:proxy.data});
    }
    const original=decoded[0],background=decoded[1];
    pixels={...original,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight};
    if(bw){
      const bound=bw.binding,revision=selection.revision;
      const runtime={...bound,draftBaseRevision:revision,savedRevision:revision,
        confirmedSelections:{subject:true,correction:true},permissionEvidence:{...bound,savedRevision:revision,action:'edit',allowed:true}};
      validateBWEdgeManualContract(bw,runtime,{signal});
      options={...options,bwEdgeRuntime:runtime,bwEdgeTarget:'proxy'};
    }
    if(add){
      const full={...add.binding,savedRevision:selection.revision};
      const subjectMask=rasterizeAddShadowManualSubjectMask(original,add,add.binding,
        {target:'proxy',savedRevision:selection.revision,currentRevision:selection.revision,ownerConfirmed:true,signal});
      const selectionEvidence={kind:'owner-selected-image-backdrop-frame',...full,target:'proxy',
        width:background.width,height:background.height,pixelsSHA256:await hash(background.data)};
      const runtime=await read(()=>prepareAddShadowWorkerRuntime({original,selectedBackground:background,
        subjectMask,binding:full,selectionEvidence,settings:add.settings,target:'proxy',signal}));
      options={...options,addShadowRuntime:runtime,addShadowOriginal:original,addShadowTarget:'proxy'};
    }
    if(originalShadow){
      const context={assetID:expectedAsset.id,originalSHA256:originalShadow.binding.originalSHA256,savedRevision:selection.revision};
      const subjectMask=authorSubjectMask(original,originalShadow.subjectStrokes,context,{ownerConfirmed:true,signal});
      const shadow=authorSubjectMask(original,originalShadow.shadowStrokes,context,{ownerConfirmed:true,signal});
      const shadowMask={width:shadow.width,height:shadow.height,data:shadow.data,provenance:{kind:'original-shadow-mask',
        source:ORIGINAL_SHADOW_MASK_SOURCE,...context,width:shadow.width,height:shadow.height}};
      const composite=applyBackgroundComposite(original,background,subjectMask,context,{signal});
      const representation=original.width===binding.sourceWidth&&original.height===binding.sourceHeight?'original':'proxy';
      const bound={...context,backdropID:backdrop.backdropID,backdropSHA256:backdrop.backdropSHA256};
      const compositeEvidence={kind:'composited-replacement-background',source:'owner-selected-image-backdrop-unverified',
        ...bound,representation,width:composite.width,height:composite.height,pixelsSHA256:await hash(composite.data)};
      const rendered=await read(()=>processing.applyBoundOriginalShadowManual({representation,
        savedRecipe:{revision:selection.revision,body:recipe},binding:bound,
        original:representation==='original'?original:pixels,composite,compositeEvidence,subjectMask,shadowMask},{signal}));
      pixels={...rendered,sourceWidth:binding.sourceWidth,sourceHeight:binding.sourceHeight};
      delete renderRecipe.parameters.extendedParameters.originalShadowManual;
    }
    await recheck();
    return {kind:'historical-comparison-only',pixels,recipe:renderRecipe,options,recheck};
  }finally{processing.dispose();}
}
