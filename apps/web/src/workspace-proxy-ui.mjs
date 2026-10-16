import {createWorkspaceProxyEditorHost} from './workspace-proxy-editor-host.mjs';

/** Explicit, authenticated Proxy transfer. Never uploads from mount/refresh. */
export function mountWorkspaceProxyPanel(container,{session,trialSession,workspaceContext,signal,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('WORKSPACE_PROXY_UI_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','Workspace Proxy');
  root.append(el('h3','Workspace Proxy'),el('p','保存済み写真の軽量Proxyだけを、確認済みWorkspaceへ明示操作で送信します。送信するのは編集後の完成画像ではなく、編集用の元Proxyです。原本RAWは送信・削除しません。Proxyの保存完了は原本のCloud Safeを意味しません。中断後は同じ内容を全体再送します。'));
  const reason=el('p'),fields=el('fieldset');fields.append(el('legend','選択写真のProxy同期'));
  const confirmLabel=el('label'),confirm=el('input');confirm.type='checkbox';confirmLabel.append(confirm,document.createTextNode('この写真のProxyを所属Workspaceへ送信する'));fields.append(confirmLabel);
  const upload=el('button','Proxyを送信／同一内容を再送'),list=el('button','保存状態を再取得'),cancel=el('button','取消');
  for(const button of [upload,list,cancel])button.type='button';fields.append(upload,list,cancel);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const records=el('ul');records.setAttribute('aria-label','保存Proxy一覧');root.append(reason,fields,status,records);container.append(root);
  let host=null,disposed=false,busy=false,epoch=0,active=null,signature=null,initializing=false;
  const lifetime=new AbortController();
  const stop=()=>{epoch++;active?.abort();active=null;busy=false;};
  function permitted(){try{const state=session.state;return !disposed&&!signal?.aborted&&canUse(state)===true&&Boolean(state.asset)&&state.revision>0&&!state.dirty&&!state.busy&&!state.exporting;}catch{return false;}}
  function availability(){try{return host?.availability()??{available:false,reason:'実Node認証・Workspace APIが未接続です。ローカルProxyは引き続き利用できます。'};}catch{return {available:false,reason:'Workspaceの状態を確認できません。'};}}
  function controls(){
    const ready=availability(),allowed=permitted();
    const details=Array.isArray(ready.blockers)&&ready.blockers.length?`（${ready.blockers.join(' / ')}）`:'';
    reason.textContent=initializing?'実Node認証とWorkspace所属を確認中です。':String(ready.reason??(ready.available?'Workspace接続済み。操作時にも認証・対象写真を再確認します。':`Workspaceは現在利用できません。保存済み写真・対応Recipe・実認証を確認してください。${details}`));
    confirm.disabled=disposed||busy||!ready.available||!allowed;
    upload.disabled=disposed||busy||!ready.available||!allowed||!confirm.checked;
    list.disabled=disposed||busy||!ready.available||!allowed;cancel.disabled=disposed||!busy;
    root.setAttribute('aria-busy',String(busy||initializing));
  }
  function synchronize(){
    if(disposed)return;
    const state=session.state;
    const next=JSON.stringify([state.asset?.id??null,state.asset?.sha256??null,state.revision??0,state.recipe??null]);
    if(signature!==next){signature=next;const interrupted=busy;stop();confirm.checked=false;records.replaceChildren();status.textContent=interrupted?'写真または編集版が変わったため中断しました。送信結果は一覧で再確認してください。':'';}
    if(busy&&!permitted()){stop();confirm.checked=false;status.textContent='写真の編集・保存状態が変わったため中断しました。送信結果は再確認してください。';}
    controls();
  }
  async function run(kind){
    if(disposed||busy||!host||!availability().available||!permitted()||kind==='upload'&&!confirm.checked)return;
    const token=++epoch,controller=new AbortController();active=controller;busy=true;controls();
    status.textContent=kind==='upload'?'選択写真のProxyを確認して送信しています。':'保存Proxyの状態を取得しています。';
    try{
      const result=await host[kind]({signal:controller.signal});
      if(disposed||token!==epoch)return;
      if(kind==='list'){
        const rows=Array.isArray(result)?result:result?.proxies;
        if(!Array.isArray(rows))throw Error('WORKSPACE_PROXY_UI_RESPONSE');
        records.replaceChildren(...rows.map(row=>el('li',`${row.level} · ${row.width} × ${row.height} · ${row.size} bytes · ${row.state==='committed'?'Proxy保存済み':'送信未完了'} · 編集版 ${row.recipeVersion}`)));
        status.textContent=`${rows.length}件のProxy状態を取得しました。原本Cloud Safeの確認ではありません。`;
      }else{
        const record=result?.record??result;
        if(record?.state!=='committed')throw Error('WORKSPACE_PROXY_UI_NOT_COMMITTED');
        confirm.checked=false;status.textContent='Proxyの保存完了を確認しました。原本RAWのCloud Safeは未確認です。';
      }
    }catch(error){if(!disposed&&token===epoch)status.textContent=kind==='upload'?'送信は完了確認できていません。権限・容量・保存版を確認し、一覧取得または同じ内容の再送を行ってください。原本は削除していません。':'状態を取得できませんでした。認証・所属・対象写真を確認してください。';}
    finally{if(!disposed&&token===epoch){busy=false;active=null;controls();}}
  }
  upload.addEventListener('click',()=>{void run('upload');});list.addEventListener('click',()=>{void run('list');});confirm.addEventListener('change',controls);
  cancel.addEventListener('click',()=>{if(!busy)return;stop();confirm.checked=false;status.textContent='中断しました。サーバー側の保存結果は不確定です。一覧で確認してから再送してください。';controls();});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&busy){event.preventDefault();cancel.click();}});
  const unsubscribe=session.subscribe(synchronize);
  function dispose(){if(disposed)return;disposed=true;stop();lifetime.abort();signal?.removeEventListener('abort',dispose);if(typeof unsubscribe==='function')unsubscribe();host?.dispose();root.remove();}
  signal?.addEventListener('abort',dispose,{once:true});
  if(signal?.aborted){dispose();return Object.freeze({refresh(){},dispose});}
  if(trialSession?.mode==='NODE_WORKSPACE'&&workspaceContext){
    initializing=true;controls();
    void createWorkspaceProxyEditorHost({session,trialSession,workspaceContext,signal:lifetime.signal}).then(connection=>{
      if(disposed){connection.dispose();return;}host=connection;initializing=false;controls();
    }).catch(()=>{if(disposed)return;initializing=false;status.textContent='実Node認証・Workspace所属・API接続を確認できません。共有送信は開始していません。';controls();});
  }else controls();
  return Object.freeze({refresh:synchronize,dispose});
}
