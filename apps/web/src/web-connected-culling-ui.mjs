import {createWebConnectedCulling} from './web-connected-culling.mjs';

/** Mount in a dedicated host-owned container. No global selectors or HTML from assets. */
export function mountWebConnectedCulling(container,{session,onSelection,canUse}={}){
  if(!container?.ownerDocument||typeof container.append!=='function')throw Error('CULLING_CONTAINER_REQUIRED');
  const doc=container.ownerDocument,controller=createWebConnectedCulling({session,onSelection,canUse});
  const node=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const root=node('section'),heading=node('h3','品質・類似写真の選別（提案）'),
    note=node('p','準備済みの未編集Proxyのみ解析。品質は相対的な目安です。顔・表情の判定、原本の読込み、削除はしません。撮影日時は未使用のため、時間帯を問わず類似度を比較します。手動評価は各写真の保存ボタンで、このブラウザのローカルライブラリ内だけに保存します。提案やチェック状態から評価を自動設定しません。他端末への同期はなく、ブラウザデータ削除で失われます。'),
    status=node('p'),markStatus=node('p'),actions=node('div'),list=node('ul'),skips=node('p');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const run=node('button','ライブラリの準備済みProxyを解析'),cancel=node('button','中断'),
    proposed=node('button','全体の提案をチェック（非表示も対象）'),confirm=node('button','チェックした写真を選択');
  for(const button of [run,cancel,proposed,confirm])button.type='button';
  markStatus.setAttribute('role','status');
  const hiddenNotice=node('span'),filters=node('fieldset'),minimum=node('select'),flagFilter=node('select'),sort=node('select'),counts=node('p'),clearHidden=node('button','隠れたチェックを解除');
  clearHidden.type='button';filters.append(node('legend','保存済み評価で一覧表示（チェック・提案は変えません）'));
  for(let value=0;value<=5;value++){const option=node('option',value===0?'すべて':`${value} 星以上`);option.value=String(value);minimum.append(option);}
  for(const [value,text] of [['all','すべて'],['neutral','未指定'],['pick','採用'],['reject','除外候補']]){const option=node('option',text);option.value=value;flagFilter.append(option);}
  for(const [value,text] of [['original','元の順序'],['name','名前順'],['rating','星の高い順']]){const option=node('option',text);option.value=value;sort.append(option);}
  for(const [text,control] of [['最低評価 ',minimum],['フラグ ',flagFilter],['並べ替え ',sort]]){const label=node('label',text);label.append(control);filters.append(label);}
  filters.append(node('p','各行の未保存入力は表示条件に使いません。保存済み評価なしは0星・未指定として扱います。非表示のチェックも確定対象です。'),clearHidden);
  hiddenNotice.setAttribute('aria-live','polite');counts.setAttribute('aria-live','polite');
  actions.append(run,cancel,proposed,confirm,hiddenNotice);root.append(heading,note,actions,status,markStatus,filters,counts,skips,list);container.append(root);
  let disposed=false;
  const action=fn=>async()=>{try{await fn();}catch(error){if(!disposed)status.textContent=error?.message||'処理できませんでした';}};
  run.addEventListener('click',action(()=>controller.run()));cancel.addEventListener('click',()=>controller.cancel());
  proposed.addEventListener('click',action(()=>controller.selectProposed()));confirm.addEventListener('click',action(()=>controller.confirmSelection()));
  let renderedResults=null,lastStateKey=null,filter={minimum:0,flag:'all',sort:'original'};const controls=new Map();
  const stateKey=state=>JSON.stringify([state.status,state.results,state.selected,state.markPending,state.marksReady]);
  const matches=row=>(row.manualMark?.rating??0)>=filter.minimum&&(filter.flag==='all'||(row.manualMark?.flag??'neutral')===filter.flag);
  function freshView(){
    const state=controller.snapshot();
    if(disposed||!controller.available()||state.status!=='ready'||state.markPending||!state.marksReady||stateKey(state)!==lastStateKey)throw Error('CULLING_VIEW_STALE_OR_UNAVAILABLE');
    return state;
  }
  const render=state=>{
    if(disposed)return;
    lastStateKey=stateKey(state);
    const running=state.status==='running',busy=running||state.status==='confirming'||Boolean(state.markPending);
    const allowed=controller.available();
    run.disabled=busy||!allowed;cancel.disabled=!running;proposed.disabled=busy||!allowed||state.status!=='ready'||!state.proposal?.picks.length;
    confirm.disabled=busy||!allowed||state.status!=='ready'||!state.selected.length||!onSelection;
    filters.disabled=busy||!allowed||state.status!=='ready'||!state.marksReady;
    minimum.value=String(filter.minimum);flagFilter.value=filter.flag;sort.value=filter.sort;
    markStatus.textContent=state.markPending?'手動評価を保存中…':state.markNotice??'';
    status.textContent=state.error||({idle:'未解析',running:`解析中 ${state.completed} / ${state.total}`,cancelled:'中断しました（提案は未確定）',
      ready:`解析 ${state.results.length} 枚・提案 ${state.proposal?.picks.length??0} 枚・チェック ${state.selected.length} 枚`,confirming:'選択対象を確認中'}[state.status]||state.status);
    skips.textContent=state.skipped.length?`未解析 ${state.skipped.length} 枚: ${state.skipped.map(row=>`${row.name} (${row.reason})`).join(' / ')}`:'';
    const signature=state.results.map(row=>row.id+':'+row.originalSHA256).join('|');
    if(signature!==renderedResults){
      renderedResults=signature;list.replaceChildren();controls.clear();
      for(const row of state.results){
        const item=node('li'),label=node('label'),check=node('input');check.type='checkbox';check.dataset.assetId=row.id;
        const cluster=state.proposal?.clusters.find(group=>group.members.some(member=>member.id===row.id));
        const description=node('span',`${row.name} — 品質目安 ${Math.round(row.analysis.quality.quality*100)} / 100 ・類似グループ ${cluster?.members.length??1} 枚${state.proposal?.picks.includes(row.id)?' ・提案':''}`);
        check.addEventListener('change',action(()=>controller.setSelected(row.id,check.checked)));label.append(check,description);item.append(label);
        const ratingLabel=node('label','手動評価 '),rating=node('select'),flagLabel=node('label','フラグ '),flag=node('select'),save=node('button','この評価を保存'),saved=node('span');
        for(let value=0;value<=5;value++){const option=node('option',value===0?'0（評価なし）':`${value} 星`);option.value=String(value);rating.append(option);}
        for(const [value,text] of [['neutral','未指定'],['pick','採用'],['reject','除外候補']]){const option=node('option',text);option.value=value;flag.append(option);}
        save.type='button';ratingLabel.append(rating);flagLabel.append(flag);item.append(ratingLabel,flagLabel,save,saved);list.append(item);
        const entry={item,rating,flag,save,saved,signature:undefined};controls.set(row.id,entry);
        const changed=()=>{saved.textContent='未保存の手動変更';};rating.addEventListener('change',changed);flag.addEventListener('change',changed);
        save.addEventListener('click',async()=>{if(disposed||save.disabled)return;try{await controller.saveMark(row.id,{rating:Number(rating.value),flag:flag.value});if(!disposed&&controller.available()&&controls.get(row.id)===entry)saved.textContent='保存済み（このブラウザのみ）';}catch{/* Controller reports current-generation storage failures; stale completions never repaint. */}});
      }
    }
    for(const row of state.results){const entry=controls.get(row.id);if(!entry)continue;const signature=JSON.stringify(row.manualMark??null);
      if(entry.signature!==signature){entry.signature=signature;entry.rating.value=String(row.manualMark?.rating??0);entry.flag.value=row.manualMark?.flag??'neutral';entry.saved.textContent=row.manualMark?'保存済み（このブラウザのみ）':'保存済み評価なし';}
      for(const control of [entry.rating,entry.flag,entry.save])control.disabled=busy||!allowed||state.status!=='ready'||!state.marksReady;
    }
    for(const check of list.querySelectorAll('input[type=checkbox]')){check.checked=state.selected.includes(check.dataset.assetId);check.disabled=busy||!allowed||state.status!=='ready';}
    // Reuse the same row/control nodes: pending user edits survive filtering,
    // ordering and changes to another row's saved rating.
    const ordered=state.results.map((row,index)=>({row,index}));
    if(filter.sort==='name')ordered.sort((a,b)=>a.row.name.localeCompare(b.row.name)||a.index-b.index);
    if(filter.sort==='rating')ordered.sort((a,b)=>(b.row.manualMark?.rating??0)-(a.row.manualMark?.rating??0)||a.index-b.index);
    let visible=0,hiddenSelected=0,position=0;const selected=new Set(state.selected);
    for(const {row} of ordered){const entry=controls.get(row.id);if(!entry)continue;
      entry.item.hidden=!matches(row);if(!entry.item.hidden)visible++;else if(selected.has(row.id))hiddenSelected++;
      // Ordinary selection/save renders must not detach focused row controls.
      const expected=list.children[position];
      if(expected!==entry.item)list.insertBefore(entry.item,expected??null);
      position++;
    }
    counts.textContent=`表示 ${visible} / ${state.results.length} 枚・隠れたチェック ${hiddenSelected} 枚${state.results.length&&!state.marksReady?'（保存済み評価は未取得）':''}`;
    hiddenNotice.textContent=hiddenSelected?` ※ 非表示のチェック ${hiddenSelected} 枚も選択に含まれます。`:' 非表示のチェックはありません。';
    clearHidden.disabled=busy||!allowed||state.status!=='ready'||!state.marksReady||hiddenSelected===0;
  };
  for(const control of [minimum,flagFilter,sort])control.addEventListener('change',()=>{
    try{
      freshView();const next={minimum:Number(minimum.value),flag:flagFilter.value,sort:sort.value};
      if(!Number.isInteger(next.minimum)||next.minimum<0||next.minimum>5||!['all','neutral','pick','reject'].includes(next.flag)||!['original','name','rating'].includes(next.sort))throw Error('CULLING_VIEW_FILTER_INVALID');
      filter=next;render(controller.snapshot());
    }catch(error){if(!disposed){render(controller.snapshot());status.textContent=error?.message||'表示条件を変更できませんでした';}}
  });
  clearHidden.addEventListener('click',action(()=>{
    const initial=freshView(),selected=new Set(initial.selected);
    const hidden=initial.results.filter(row=>selected.has(row.id)&&!matches(row));
    for(const row of hidden){
      const state=freshView(),current=state.results.find(item=>item.id===row.id);
      if(!current||current.originalSHA256!==row.originalSHA256||JSON.stringify(current.manualMark??null)!==JSON.stringify(row.manualMark??null)||matches(current))throw Error('CULLING_VIEW_STALE');
      if(state.selected.includes(row.id))controller.setSelected(row.id,false);
    }
  }));
  const unsubscribe=controller.subscribe(render);
  const unsubscribeSession=typeof session.subscribe==='function'?session.subscribe(()=>render(controller.snapshot())):()=>{};
  return Object.freeze({controller,refresh(){if(!disposed)render(controller.snapshot());},destroy(){if(disposed)return;disposed=true;unsubscribe();unsubscribeSession();controller.destroy();root.remove();}});
}
