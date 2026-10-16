import {analyzeCullingFrame,suggestCulling} from './processing/astra-culling-analysis.mjs';
import {createLocalCullingMarks,cullingMarkScope,validateCullingMark} from './web-local-culling-marks.mjs';

const copy=value=>structuredClone(value);
const digest=/^[a-f0-9]{64}$/i;
const aborted=signal=>{if(signal.aborted)throw new DOMException('中断しました','AbortError');};
function inventory(rows){
  if(!Array.isArray(rows)||rows.length>10000)throw Error('CULLING_LIBRARY_INVALID');
  const result=new Map();
  for(const row of rows){
    if(row?.deletedAt!=null)continue;
    if(typeof row?.id!=='string'||!row.id||!digest.test(row.sha256??'')||result.has(row.id))throw Error('CULLING_LIBRARY_INVALID');
    result.set(row.id,{id:row.id,sha256:row.sha256.toLowerCase(),name:typeof row.name==='string'?row.name:row.id});
  }return result;
}
const same=(a,b)=>a&&b&&a.id===b.id&&a.sha256?.toLowerCase()===b.sha256?.toLowerCase();

/** Read-only local Proxy consumer. Never opens Originals to fill a cache miss,
 * switches Editor assets, invokes face detection, or deletes files. Only the
 * separate explicit saveMark operation persists user-entered local marks.
 * Quality refers to the unedited cached Proxy, not the rendered Final.
 * No cross-run analysis cache: a changed Proxy must be analyzed anew.
 */
export function createWebConnectedCulling({session,onSelection,canUse=()=>true}={}){
  if(typeof session?.api?.listAssets!=='function'||typeof session?.storage?.get!=='function'||
      typeof canUse!=='function'||(onSelection!==undefined&&typeof onSelection!=='function'))throw Error('CULLING_HOST_REQUIRED');
  let state={status:'idle',completed:0,total:0,results:[],skipped:[],proposal:null,selected:[],error:null},
    job=null,closed=false,confirming=false,markJob=null,generation=0,hostKey=null,marksStore=null,storeAPI=null,storeScope=null;
  const listeners=new Set();
  const live=()=>{if(closed)throw Error('CULLING_CLOSED');};
  const available=()=>{try{const s=session.state;return !closed&&!s?.busy&&!s?.exporting&&!s?.dirty&&canUse()===true;}catch{return false;}};
  const permitted=()=>{live();if(!available())throw Error('CULLING_HOST_NOT_READY');};
  const emit=patch=>{state={...state,...patch};for(const listener of listeners){try{listener(copy(state));}catch{/* View failure is not an analysis failure. */}}};
  function markStore(){const api=session.api,scope=cullingMarkScope(api);if(api!==storeAPI||scope!==storeScope){marksStore=createLocalCullingMarks(api);storeAPI=api;storeScope=scope;}return marksStore;}
  const unsubscribeHost=typeof session.subscribe==='function'?session.subscribe(value=>{
    const next=JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.busy,value?.exporting,value?.dirty,available()]);
    if(next!==hostKey){hostKey=next;generation++;job?.abort();markJob?.abort();if(state.results.length)emit({status:'idle',results:[],skipped:[],selected:[],proposal:null,marksReady:false,markPending:null,markNotice:'写真・編集状態が変わりました。解析をやり直してください。'});}
  }):null;
  async function run({assetIDs,settings={}}={}){
    permitted();if(job||confirming||markJob)throw Error('CULLING_BUSY');
    const epoch=++generation,api=session.api;
    const guard=()=>{permitted();if(epoch!==generation||api!==session.api)throw Error('CULLING_GENERATION_CHANGED');};
    const controller=new AbortController();job=controller;const {signal}=controller;
    emit({status:'running',completed:0,total:0,results:[],skipped:[],proposal:null,selected:[],error:null,marksReady:false,markPending:null,markNotice:null});
    try{
      const listed=inventory(await session.api.listAssets());aborted(signal);guard();
      const ids=assetIDs===undefined?[...listed.keys()]:[...assetIDs];
      if(!Array.isArray(assetIDs??ids)||ids.length>2000||new Set(ids).size!==ids.length||ids.some(id=>!listed.has(id)))throw Error('CULLING_SELECTION_INVALID');
      // Validate selection options even when all proxies turn out to be unavailable.
      suggestCulling([],settings);
      const results=[],skipped=[];emit({total:ids.length});
      for(const id of ids){
        aborted(signal);guard();const asset=listed.get(id);
        try{
          const cached=await session.storage.get(id);aborted(signal);guard();
          const current=session.state;
          const proxy=same(current?.asset,asset)&&session.proxy?session.proxy:
            same(cached?.asset,asset)?cached.proxy:null;
          if(!proxy){skipped.push({id,name:asset.name,reason:'PROXY_NOT_READY'});}
          else{
            const analysis=await analyzeCullingFrame(proxy,{faces:false,signal});aborted(signal);guard();
            results.push({id,originalSHA256:asset.sha256,name:asset.name,analysis});
          }
        }catch(error){aborted(signal);guard();skipped.push({id,name:asset.name,reason:error?.message||'PROXY_ANALYSIS_FAILED'});}
        emit({completed:results.length+skipped.length});
        // Yield between frames so cancel and paint can be serviced.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const fresh=inventory(await session.api.listAssets());aborted(signal);guard();
      if(results.some(row=>!same(listed.get(row.id),fresh.get(row.id))))throw Error('CULLING_LIBRARY_CHANGED');
      const proposal=suggestCulling(results,{...settings,signal});aborted(signal);guard();
      let marksReady=false,markNotice=null;
      try{const stored=await markStore().load(results,{guard,signal});guard();aborted(signal);results.forEach((row,i)=>{row.manualMark=stored[i];});marksReady=true;}
      catch(error){aborted(signal);guard();markNotice=`手動評価を復元できません: ${error?.message??'保存領域を確認してください'}`;}
      const matched=inventory(await session.api.listAssets());guard();aborted(signal);
      if(results.some(row=>matched.get(row.id)?.sha256!==row.originalSHA256))throw Error('CULLING_LIBRARY_CHANGED');
      emit({status:'ready',results,skipped,proposal,selected:[],marksReady,markNotice});return copy(state);
    }catch(error){if(!closed&&epoch===generation)emit({status:signal.aborted?'cancelled':'error',error:signal.aborted?null:error?.message||'CULLING_FAILED',proposal:null,selected:[]});
      if(!signal.aborted)throw error;return copy(state);
    }finally{if(job===controller)job=null;}
  }
  return Object.freeze({run,available,
    async saveMark(id,mark){
      permitted();if(job||confirming||markJob||state.status!=='ready'||!state.marksReady)throw Error('CULLING_MARK_NOT_READY');
      const row=state.results.find(item=>item.id===id);if(!row)throw Error('CULLING_MARK_BINDING');
      const value=validateCullingMark(mark),epoch=generation,api=session.api,scope=cullingMarkScope(api),controller=new AbortController();markJob=controller;
      const guard=()=>{permitted();if(epoch!==generation||api!==session.api||cullingMarkScope(api)!==scope)throw Error('CULLING_MARK_STALE');};
      emit({markPending:id,markNotice:null});
      try{
        const fresh=inventory(await api.listAssets());guard();if(fresh.get(id)?.sha256!==row.originalSHA256)throw Error('CULLING_LIBRARY_CHANGED');
        const saved=await markStore().save(row,value,{guard,signal:controller.signal});guard();
        const final=inventory(await api.listAssets());guard();if(final.get(id)?.sha256!==row.originalSHA256)throw Error('CULLING_LIBRARY_CHANGED');
        emit({results:state.results.map(item=>item.id===id?{...item,manualMark:saved}:item),markNotice:'手動評価をこのブラウザ内に保存しました。解析提案は保存していません。'});return copy(saved);
      }catch(error){if(!closed&&epoch===generation)emit({markNotice:`評価の保存を確認できませんでした。再解析で保存状態を確認してください: ${error?.message??'保存容量・権限を確認してください'}`});throw error;}
      finally{if(markJob===controller)markJob=null;if(!closed&&epoch===generation)emit({markPending:null});}
    },
    snapshot:()=>copy(state),
    subscribe(listener){live();if(typeof listener!=='function')throw Error('CULLING_LISTENER_INVALID');listeners.add(listener);listener(copy(state));return()=>listeners.delete(listener);},
    cancel(){job?.abort();},
    setSelected(id,value){permitted();if(state.status!=='ready'||confirming||markJob||typeof value!=='boolean'||!state.results.some(row=>row.id===id))throw Error('CULLING_SELECTION_UNAVAILABLE');
      const selected=new Set(state.selected);if(value)selected.add(id);else selected.delete(id);emit({selected:[...selected]});},
    selectProposed(){permitted();if(state.status!=='ready'||confirming||markJob)throw Error('CULLING_SELECTION_UNAVAILABLE');emit({selected:[...state.proposal.picks]});},
    async confirmSelection(){
      permitted();if(state.status!=='ready'||job||confirming||markJob||!state.selected.length)throw Error('CULLING_SELECTION_UNAVAILABLE');
      confirming=true;emit({status:'confirming',error:null});
      try{
        const fresh=inventory(await session.api.listAssets());permitted();
        const selected=state.results.filter(row=>state.selected.includes(row.id));
        if(selected.some(row=>fresh.get(row.id)?.sha256!==row.originalSHA256))throw Error('CULLING_LIBRARY_CHANGED');
        const output={assetIDs:selected.map(row=>row.id),bindings:selected.map(row=>({id:row.id,originalSHA256:row.originalSHA256})),proposalOnly:true};
        // Host may adopt a transient selection, never interpret this as saved culling marks.
        if(onSelection)await onSelection(copy(output));live();emit({status:'ready'});return output;
      }catch(error){if(!closed)emit({status:'error',error:error?.message||'CULLING_SELECTION_FAILED',proposal:null,selected:[]});throw error;}
      finally{confirming=false;}
    },
    destroy(){closed=true;generation++;job?.abort();markJob?.abort();if(typeof unsubscribeHost==='function')unsubscribeHost();listeners.clear();state={status:'closed',results:[],skipped:[],selected:[],proposal:null};}
  });
}
