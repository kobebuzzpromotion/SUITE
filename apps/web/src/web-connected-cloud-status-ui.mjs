/** Sites Asset metadata observation only. Not provider verification, quota,
 * storage usage accounting, cross-device sync, or a new Cloud Safe decision.
 * refresh() updates availability only; network reads require the button click.
 */
export function mountWebConnectedCloudStatus(container,{session,canUse,isSites}={}){
  if(!container?.ownerDocument||typeof container.append!=='function'||
      typeof session?.api?.listAssets!=='function'||typeof canUse!=='function'||typeof isSites!=='boolean')
    throw Error('CLOUD_STATUS_HOST_INVALID');
  const document=container.ownerDocument;
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=element('section'),title=element('h3','原本のサーバー保存記録'),
    note=element('p','一覧APIが返す保存記録を確認します。実ストレージの再検証、端末間同期や契約容量・使用率の確認ではありません。'),
    button=element('button','保存記録を再取得'),status=element('p'),summary=element('p');
  button.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(title,note,button,status,summary);container.append(root);
  let disposed=false,generation=0,pending=false,lastIdentity=null;
  const lifetime=new AbortController();
  function allowed(){try{return !disposed&&isSites===true&&canUse()===true;}catch{return false;}}
  // The caller owns authorization and must dispose on principal/tenant changes.
  // API instance replacement also invalidates observations; metadata grants no access.
  function identity(){return session.api;}
  function clear(){summary.textContent='';}
  function refresh(){
    if(disposed)return;
    const permitted=allowed(),current=identity();
    if(!permitted||lastIdentity!==null&&lastIdentity!==current){generation++;pending=false;clear();
      status.textContent=!isSites?'Sitesの認証済み保存記録は、この利用モードでは取得できません。':!permitted?'現在は保存記録を取得できません。':'接続先が変わりました。再取得してください。';}
    lastIdentity=current;button.disabled=!permitted||pending;
  }
  function counts(rows){
    if(!Array.isArray(rows)||rows.length>100000)throw Error('CLOUD_STATUS_ASSETS_INVALID');
    const seen=new Set();let total=0,recorded=0,bytes=0,missingSizes=0;
    for(const asset of rows){
      if(!asset||typeof asset!=='object'||Array.isArray(asset)||typeof asset.id!=='string'||!asset.id||
          typeof asset.name!=='string'||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(asset.sha256)||
          typeof asset.cloudSafe!=='boolean'||seen.has(asset.id)||
          !Object.hasOwn(asset,'deletedAt')||asset.deletedAt!==null&&typeof asset.deletedAt!=='string')
        throw Error('CLOUD_STATUS_ASSET_INVALID');
      seen.add(asset.id);if(asset.deletedAt!==null)continue;
      total++;if(asset.cloudSafe===true)recorded++;
      if(Number.isSafeInteger(asset.size)&&asset.size>0){
        if(!Number.isSafeInteger(bytes+asset.size))throw Error('CLOUD_STATUS_BYTES_OVERFLOW');bytes+=asset.size;
      }else missingSizes++;
    }return {total,recorded,unconfirmed:total-recorded,bytes,missingSizes};
  }
  async function read(){
    refresh();if(!allowed()||pending)return;
    const token=++generation,api=session.api;pending=true;clear();status.textContent='保存記録を取得中…';button.disabled=true;
    try{
      const rows=await api.listAssets();
      if(disposed||token!==generation)return;
      if(!allowed()||api!==session.api){refresh();return;}
      const result=counts(rows),time=new Date();
      summary.textContent=`対象 ${result.total} 件 ／ サーバー保存記録あり ${result.recorded} 件 ／ 未確認 ${result.unconfirmed} 件。`+
        `対象原本サイズの合計（有効値のみ）: ${result.bytes.toLocaleString()} bytes。`+
        (result.missingSizes?` ${result.missingSizes} 件はサイズ欠損・無効のため合計に含みません。`:'')+
        `取得時刻: ${time.toLocaleString()} (${time.toISOString()})。`;
      status.textContent='保存記録を取得しました。現在の原本永続性を再検証した結果ではありません。';
    }catch(error){
      if(disposed||token!==generation)return;
      clear();status.textContent=allowed()?`取得できませんでした: ${error?.message||'CLOUD_STATUS_READ_FAILED'}`:'現在は保存記録を取得できません。';
    }finally{if(!disposed&&token===generation){pending=false;refresh();}}
  }
  button.addEventListener('click',read,{signal:lifetime.signal});
  status.textContent='未取得です。ボタンを押すと保存記録を確認します。';refresh();
  const unsubscribe=typeof session.subscribe==='function'?session.subscribe(refresh):null;
  return Object.freeze({refresh,dispose(){if(disposed)return;disposed=true;generation++;pending=false;clear();lifetime.abort();unsubscribe?.();root.remove();}});
}
