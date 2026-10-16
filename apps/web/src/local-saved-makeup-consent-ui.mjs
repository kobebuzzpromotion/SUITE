const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/i;
const stateKey=state=>JSON.stringify([state?.asset?.id,state?.asset?.sha256,state?.revision,state?.recipe]);

/** Explicit page-local consent only; Session supplies actual saved-history scope. */
export function mountLocalSavedMakeupConsent(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LOCAL_SAVED_MAKEUP_CONSENT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','保存済み手動メイクのローカル再適用への同意');
  root.append(el('h3','保存済み手動メイクの再適用'),el('p','この端末の実際の保存履歴から、旧手動メイク（チーク・瞳色・アイシャドウ・アイライン・そばかす）の対象を取得します。顔の検出・推論や写真の送信は行いません。この同意はサーバー認証・人物識別・他者の権限の証明とは別です。新しい人物領域を自動作成しません。ページ終了または写真切替後は再同意が必要です。'));
  const fields=el('fieldset'),load=el('button','保存済みの対象一覧を取得'),details=el('p'),agree=el('input'),agreeLabel=el('label','写真と写っている人物の編集許可を得ており、保存済み手動領域をこの端末で再適用する'),grant=el('button','確認した対象に同意する'),revoke=el('button','このローカル同意を取り消す'),actual=el('p'),status=el('p');
  for(const button of [load,grant,revoke])button.type='button';agree.type='checkbox';agreeLabel.prepend(agree);
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');actual.setAttribute('aria-live','polite');
  fields.append(load,details,agreeLabel,grant,revoke);root.append(fields,actual,status);container.append(root);
  let current=null,key=null,permission=null,scope=null,pending=false,disposed=false,generation=0;
  function available(){try{return !disposed&&Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function clearScope(){generation++;scope=null;agree.checked=false;details.textContent='';}
  function actualStatus(){
    try{
      const value=session.localSavedMakeupConsentStatus;
      if(!value||typeof value.granted!=='boolean'||!Array.isArray(value.personIDs)||value.personIDs.length>64||value.personIDs.some(id=>typeof id!=='string'||!UUID.test(id)))throw Error('STATUS_INVALID');
      actual.textContent=value.granted?`現在、この写真の保存済み手動領域 ${value.personIDs.length} 人分にローカル同意があります。`:'現在、この写真へのローカル同意はありません。';
      return value.granted;
    }catch{actual.textContent='現在のローカル同意状態は取得できません。';return false;}
  }
  function render(){
    const allowed=available();fields.disabled=pending||!allowed;
    load.disabled=typeof session.getLocalSavedMakeupConsentScope!=='function';agree.disabled=!scope;grant.disabled=!scope||!agree.checked||typeof session.grantLocalSavedMakeupConsent!=='function';
    const granted=actualStatus();revoke.disabled=typeof session.revokeLocalSavedMakeupConsent!=='function'||!granted;
    if(!allowed)actual.textContent='利用状態を確認できないため、同意状態を表示しません。';
    root.setAttribute('aria-busy',String(pending));
  }
  function synchronize(state){
    if(disposed)return;current=state;const next=stateKey(state),allowed=available();
    if(next!==key||allowed!==permission){const had=Boolean(scope);clearScope();key=next;permission=allowed;if(had)status.textContent='写真・編集状態・利用可否が変わったため、取得した対象と確認チェックを破棄しました。';}
    render();
  }
  function fresh(){const state=session.state??current;current=state;if(disposed||pending||!available()||stateKey(state)!==key){synchronize(state);throw Error('対象写真や利用状態が変わりました。対象一覧を再取得してください。');}}
  function checkedScope(value){
    const keys=['assetId','sha256','personIDs','versions'];
    if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(name=>{const d=Object.getOwnPropertyDescriptor(value,name);return !d?.enumerable||!Object.hasOwn(d,'value');})||
      value.assetId!==current.asset.id||typeof value.sha256!=='string'||!SHA.test(value.sha256)||value.sha256.toLowerCase()!==current.asset.sha256?.toLowerCase()||
      !Number.isSafeInteger(value.versions)||value.versions<1||!Array.isArray(value.personIDs)||value.personIDs.length<1||value.personIDs.length>64||
      Reflect.ownKeys(value.personIDs).length!==value.personIDs.length+1)throw Error('保存履歴の対象情報を確認できません。');
    const seen=new Set();for(let i=0;i<value.personIDs.length;i++){
      const d=Object.getOwnPropertyDescriptor(value.personIDs,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!UUID.test(d.value)||seen.has(d.value.toLowerCase()))throw Error('保存履歴の人物一覧を確認できません。');seen.add(d.value.toLowerCase());
    }
    return {assetId:value.assetId,sha256:value.sha256,personIDs:[...value.personIDs],versions:value.versions};
  }
  async function perform(kind){
    if(disposed||pending)return;let token,selection;
    try{
      fresh();selection=key;let approved;
      if(kind==='grant'){
        if(!scope||!agree.checked||scope.binding!==key)throw Error('対象一覧を取得して、許可の確認チェックを入れてください。');
        approved={assetId:scope.assetId,sha256:scope.sha256,personIDs:[...scope.personIDs],confirmed:true};
      }
      clearScope();token=generation;pending=true;render();status.textContent=kind==='load'?'保存履歴から実際の対象を取得中…':kind==='grant'?'明示した同意を設定中…':'ローカル同意を取消中…';
      let result;
      if(kind==='load')result=await session.getLocalSavedMakeupConsentScope();
      else if(kind==='grant')await session.grantLocalSavedMakeupConsent(approved);
      else await session.revokeLocalSavedMakeupConsent();
      const state=session.state??current;current=state;
      if(disposed||token!==generation||selection!==stateKey(state)||!available())return;
      if(kind==='load'){
        scope={...checkedScope(result),binding:selection};const name=typeof state.asset.name==='string'?state.asset.name:'選択中の写真';
        details.textContent=`写真：${name} ／ SHA-256：${scope.sha256.slice(0,12)}… ／ 保存済み人物ID ${scope.personIDs.length} 人分 ／ 対象 ${scope.versions} 版`;
        status.textContent='一覧を取得しました。まだ同意していません。写真と対象を確認してから明示同意してください。';
      }else status.textContent=kind==='grant'?'同意設定の処理が完了しました。現在の状態は上の表示を確認してください。':'同意取消の処理が完了しました。現在の状態は上の表示を確認してください。';
    }catch(error){if(!disposed&&(token===undefined||token===generation)){clearScope();status.textContent=`処理できませんでした。${String(error?.message??error).slice(0,180)}`;}}
    finally{pending=false;if(!disposed)render();}
  }
  load.addEventListener('click',()=>{void perform('load');});agree.addEventListener('change',render);grant.addEventListener('click',()=>{void perform('grant');});revoke.addEventListener('click',()=>{void perform('revoke');});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(disposed)return;clearScope();status.textContent='確認対象を破棄しました。保存済みの対象一覧を再取得してください。';synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;clearScope();unsubscribe?.();root.remove();}});
}
