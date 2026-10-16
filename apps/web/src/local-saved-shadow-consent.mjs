import {BrowserLocalAPI} from './browser-local-api.mjs';
export const LOCAL_SHADOW_BRANCHES=['bwEdgeManual','addShadowManual','originalShadowManual'];
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
export function localShadowEntries(recipe,inventory=[]){
  const extra=recipe?.parameters?.extendedParameters??{};
  return LOCAL_SHADOW_BRANCHES.filter(k=>Object.hasOwn(extra,k)).map(kind=>{
    const doc=extra[kind],b=doc.binding;
    return {key:JSON.stringify(sort({kind,document:doc})),kind,backgroundAssetId:b.backdropID??null,backgroundSHA256:b.backdropSHA256?.toLowerCase()??null,backgroundName:inventory.find(a=>a.id===b.backdropID)?.name??''};
  });
}
function scope(api,asset){
  if(Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype||!api.factory||!api.databaseName||!asset?.id||!/^[0-9a-f]{64}$/i.test(asset.sha256)||!Number.isSafeInteger(asset.size)||asset.size<1)throw Error('LOCAL_SAVED_SHADOW_CONSENT_SCOPE');
  return {api,factory:api.factory,databaseName:api.databaseName,crypto:api.crypto,id:asset.id,sha:asset.sha256.toLowerCase(),size:asset.size};
}
const same=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
/** Ephemeral local replay consent, not production authorization or history evidence. */
export function createLocalSavedShadowConsent(){
  let receipt=null;
  return Object.freeze({
    grant({api,asset,entries,confirmed}={}){
      if(confirmed!==true||!Array.isArray(entries)||!entries.length||entries.some(e=>typeof e.key!=='string'||!LOCAL_SHADOW_BRANCHES.includes(e.kind)))throw Error('LOCAL_SAVED_SHADOW_CONSENT_REQUIRED');
      receipt={scope:scope(api,asset),entries:structuredClone(entries)};
    },
    assert({api,asset,backdrop,recipe}={}){
      const current=scope(api,asset),entries=localShadowEntries(recipe);
      if(!receipt||!same(receipt.scope,current)||!entries.length||entries.some(e=>!receipt.entries.some(r=>r.key===e.key&&r.backgroundAssetId===e.backgroundAssetId&&r.backgroundSHA256===e.backgroundSHA256)))throw Error('LOCAL_SAVED_SHADOW_CONSENT_REQUIRED');
      for(const e of entries)if(e.backgroundAssetId&&(backdrop?.id!==e.backgroundAssetId||backdrop?.sha256?.toLowerCase()!==e.backgroundSHA256))throw Error('LOCAL_SAVED_SHADOW_BACKGROUND_CHANGED');
      return true;
    },
    revoke(){receipt=null;},
    status({api,asset}={}){try{if(receipt&&same(receipt.scope,scope(api,asset)))return {granted:true,entries:structuredClone(receipt.entries)};}catch{}receipt=null;return {granted:false,entries:[]};}
  });
}
