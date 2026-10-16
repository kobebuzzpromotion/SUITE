import {BrowserLocalAPI} from './browser-local-api.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code='LOCAL_SAVED_MAKEUP_CONSENT_REQUIRED'){throw Error(code);}
function own(value,key){
  const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;
  if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('LOCAL_SAVED_MAKEUP_CONSENT_INPUT');
  return d.value;
}
function scope(api,asset){
  if(!api||Object.getPrototypeOf(api)!==BrowserLocalAPI.prototype)fail('LOCAL_SAVED_MAKEUP_CONSENT_LOCAL_ONLY');
  const factory=own(api,'factory'),databaseName=own(api,'databaseName');
  const id=own(asset,'id'),sha256=own(asset,'sha256'),size=own(asset,'size');
  if(!factory||typeof factory!=='object'||typeof databaseName!=='string'||!databaseName||
    typeof id!=='string'||!UUID.test(id)||typeof sha256!=='string'||!/^[0-9a-f]{64}$/i.test(sha256)||
    !Number.isSafeInteger(size)||size<1||size>128*1024*1024)fail('LOCAL_SAVED_MAKEUP_CONSENT_INPUT');
  return {api,factory,databaseName,id,sha256:sha256.toLowerCase(),size};
}
function people(value){
  if(!Array.isArray(value)||value.length<1||value.length>64||Reflect.ownKeys(value).length!==value.length+1)fail('LOCAL_SAVED_MAKEUP_CONSENT_INPUT');
  const result=[];
  for(let i=0;i<value.length;i++){
    const id=own(value,String(i));
    if(typeof id!=='string'||!UUID.test(id))fail('LOCAL_SAVED_MAKEUP_CONSENT_INPUT');
    result.push(id.toLowerCase());
  }
  if(new Set(result).size!==result.length)fail('LOCAL_SAVED_MAKEUP_CONSENT_INPUT');
  return result.sort();
}
const same=(a,b)=>['api','factory','databaseName','id','sha256','size'].every(key=>a[key]===b[key]);
/** Ephemeral UI consent for replaying explicit, saved photo-local coordinates.
 * No face inference, production approval, authenticated person identity, Original
 * or historical-recipe authority is supplied here. Runtime verifies those inputs
 * independently. Nothing is persisted or transferable between API instances. */
export function createLocalSavedMakeupConsent(){
  let receipt=null;
  return Object.freeze({
    grant({api,asset,personIDs,confirmed}={}){
      if(confirmed!==true)fail('LOCAL_SAVED_MAKEUP_CONSENT_CONFIRMATION_REQUIRED');
      const next=scope(api,asset),ids=people(personIDs);
      if(receipt&&!same(receipt,next))fail('LOCAL_SAVED_MAKEUP_CONSENT_SCOPE_CHANGED');
      receipt={...next,personIDs:ids};
      return {granted:true,personIDs:ids.slice()};
    },
    assert({api,asset,personIDs}={}){
      const current=scope(api,asset),ids=people(personIDs);
      if(!receipt)fail();
      if(!same(receipt,current)){receipt=null;fail('LOCAL_SAVED_MAKEUP_CONSENT_SCOPE_CHANGED');}
      if(ids.some(id=>!receipt.personIDs.includes(id)))fail();
      return true;
    },
    revoke(){receipt=null;},
    status({api,asset}={}){
      try{
        const current=scope(api,asset);
        if(receipt&&same(receipt,current))return {granted:true,personIDs:receipt.personIDs.slice()};
      }catch{/* Display status is deliberately nonauthoritative and fail-closed. */}
      receipt=null;return {granted:false,personIDs:[]};
    }
  });
}
