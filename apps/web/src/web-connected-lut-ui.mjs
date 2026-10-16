import {createWorkspaceLUTSync,workspaceLUTAvailability} from './workspace-lut-sync.mjs';
const MAX_BYTES=32*1024*1024;

/** Browser-origin-local CUBE import; never uploads or distributes LUT bytes. */
export function mountWebConnectedLUT(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('LUT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','ローカルCUBE LUT');
  root.append(el('h3','ローカルCUBE LUT'),el('p','32 MiB以下のCUBEファイルをこのブラウザのoriginごとに保存します。他端末へ自動同期されず、ブラウザデータを削除すると再取込が必要です。持ち運ぶ場合は利用権利を確認してLUT同梱設定を書き出してください。写真固有の局所範囲を含む設定は可搬Presetにはできません。別のLUTを取り込むと既存の局所範囲を解除し、現在の標準・白黒プロファイルを置き換えます。同じLUTの強度変更では範囲を保持します。'));
  const fields=el('fieldset');fields.append(el('legend','LUTの取込と強度'));
  const fileLabel=el('label','CUBEファイル'),file=el('input');file.type='file';file.accept='.cube';fileLabel.append(file);fields.append(fileLabel);
  const amountLabel=el('label','強度（0〜1）'),amount=el('input');amount.type='number';amount.min='0';amount.max='1';amount.step='.01';amount.value='1';amountLabel.append(amount);fields.append(amountLabel);
  const button=text=>{const node=el('button',text);node.type='button';fields.append(node);return node;};
  const load=button('選択したLUTを取込・適用'),apply=button('強度を適用'),reset=button('LUTを解除');
  const reference=el('p'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,reference,status);container.append(root);
  let current=null,signature=null,pending=false,disposed=false,dirty=false,generation=0,local=false;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();load.disabled=!file.files?.length||typeof session.importLocalLUT!=='function';apply.disabled=!local||typeof session.setLocalLUTIntensity!=='function';reset.disabled=!local||typeof session.setColorProfile!=='function';root.setAttribute('aria-busy',String(pending));}
  function intensity(){const value=Number(amount.value);if(amount.value.trim()===''||!Number.isFinite(value)||value<0||value>1)throw Error('LUT_INTENSITY');return value;}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;generation++;dirty=false;file.value='';
      const p=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.profile;local=p?.kind==='local-lut';amount.value=String(local&&Number.isFinite(p.intensity)?p.intensity:1);
      reference.textContent=local?`ローカル保存参照 SHA-256：${p.lutRef?.sha256??'不明'} ／ ${p.lutRef?.byteLength??'不明'} bytes（実データの読込確認は描画時）`:'ローカルLUTは未設定です。';
      status.textContent=lost?'写真またはRecipeが変わったため、未適用のファイル選択・入力を破棄しました。':'';
    }controls();
  }
  file.addEventListener('change',()=>{dirty=true;status.textContent='未取込です。「取込・適用」を押してください。';controls();});
  amount.addEventListener('input',()=>{dirty=true;status.textContent='未適用の強度です。';});
  async function run(action){if(disposed||pending||!permitted())return;if(action==='import'&&load.disabled||action==='intensity'&&apply.disabled||action==='reset'&&reset.disabled)return;
    let value,chosen;if(action!=='reset'){try{value=intensity();}catch{status.textContent='強度に0〜1の数値を入力してください。';amount.focus();return;}}
    if(action==='import'){chosen=file.files?.[0];if(!chosen||!Number.isSafeInteger(chosen.size)||chosen.size<1||chosen.size>MAX_BYTES||typeof chosen.arrayBuffer!=='function'){status.textContent='空ではない32 MiB以下のCUBEファイルを選択してください。';return;}}
    const token=generation,assetID=current.asset.id;pending=true;controls();
    try{
      if(action==='import'){const buffer=await chosen.arrayBuffer();if(disposed||token!==generation)return;if(!permitted())throw Error('LUT_STATE_CHANGED');if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==chosen.size||buffer.byteLength>MAX_BYTES)throw Error('LUT_FILE_LENGTH');await session.importLocalLUT(new Uint8Array(buffer),{intensity:value});}
      else if(action==='intensity')await session.setLocalLUTIntensity(value);else await session.setColorProfile(null);
      if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=action==='reset'?'LUT参照を解除しました。ローカル資産は削除していません。':'適用しました。Recipeの保存は既存の保存操作で行ってください。';}
    }catch{if(!disposed&&current?.asset?.id===assetID)status.textContent='適用できませんでした。CUBE内容・ローカル保存容量・権限・現在のRecipeを確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  load.addEventListener('click',()=>{void run('import');});apply.addEventListener('click',()=>{void run('intensity');});reset.addEventListener('click',()=>{void run('reset');});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;generation++;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}

/** Authenticated host integration; absent hosts remain visibly unavailable. */
export function mountWorkspaceLUTSync(container,{session,host=null,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function')throw Error('WORKSPACE_LUT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','Workspace LUT');root.append(el('h3','Workspace LUT'));
  root.append(el('p','権限のあるWorkspaceから選択したLUTだけを端末へ取得します。写真・LUTのアップロードやライブラリ全体の同期は行いません。適用の取消・失敗後も検証済みLUTデータがローカルに残る場合があります。'));
  const reason=el('p'),select=el('select');select.setAttribute('aria-label','Workspace LUTの選択');
  const amount=el('input');amount.type='number';amount.min='0';amount.max='1';amount.step='.01';amount.value='1';amount.setAttribute('aria-label','Workspace LUTの強度');
  const refresh=el('button','LUT一覧を取得'),apply=el('button','選択LUTを取得・適用'),cancel=el('button','取消');for(const button of [refresh,apply,cancel])button.type='button';
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(reason,refresh,select,amount,apply,cancel,status);container.append(root);
  let client=null,busy=false,disposed=false,controller=null,rows=[],epoch=0;
  try{client=createWorkspaceLUTSync({host,session});}catch{}
  function permitted(){try{return Boolean(session.state?.asset)&&!session.state.busy&&!session.state.exporting&&canUse(session.state)===true;}catch{return false;}}
  function controls(){const availability=workspaceLUTAvailability(host);reason.textContent=availability.reason;
    refresh.disabled=disposed||busy||!client||!availability.available;select.disabled=busy||!rows.length||!availability.available;amount.disabled=busy||!availability.available;
    apply.disabled=disposed||busy||!client||!availability.available||!select.value||!permitted();cancel.disabled=!busy;root.setAttribute('aria-busy',String(busy));}
  function reset(){epoch++;controller?.abort();client?.cancel();rows=[];select.replaceChildren();if(!disposed)controls();}
  const offHost=typeof host?.subscribe==='function'?host.subscribe(()=>{reset();status.textContent='認証状態が変わったため一覧と処理を破棄しました。';}):null;
  const offSession=session.subscribe(controls);
  async function run(kind){if(disposed||busy||!client||!workspaceLUTAvailability(host).available||kind==='apply'&&!permitted())return;
    const intensity=Number(amount.value);if(kind==='apply'&&(!amount.value.trim()||!Number.isFinite(intensity)||intensity<0||intensity>1)){status.textContent='強度は0〜1で指定してください。';return;}
    const token=epoch;controller=new AbortController();busy=true;controls();status.textContent=kind==='list'?'一覧を取得しています。':'LUTを検証してローカルへ取得しています。';
    try{if(kind==='list'){const result=await client.list({signal:controller.signal});if(disposed||token!==epoch)return;rows=result;select.replaceChildren();for(const row of rows){const option=el('option',row.name);option.value=row.id;select.append(option);}status.textContent=rows.length?`${rows.length}件のLUTを取得しました。`:'利用できるLUTはありません。';}
      else{await client.apply(select.value,{intensity,signal:controller.signal});if(!disposed&&token===epoch)status.textContent='LUTをローカルへ取得して適用しました。Recipeは既存の保存操作で保存してください。';}}
    catch(error){if(!disposed&&token===epoch)status.textContent=error?.name==='AbortError'?'取り消しました。取得済みのLUTデータはローカルに残る場合があります。':'取得・適用できませんでした。権限、資産情報、通信、保存容量を確認してください。取得済みデータはローカルに残る場合があります。';}
    finally{busy=false;controller=null;if(!disposed)controls();}
  }
  refresh.addEventListener('click',()=>{void run('list');});apply.addEventListener('click',()=>{void run('apply');});cancel.addEventListener('click',()=>{controller?.abort();client?.cancel();});select.addEventListener('change',controls);controls();
  return Object.freeze({refresh:controls,dispose(){disposed=true;reset();client?.dispose();if(typeof offHost==='function')offHost();if(typeof offSession==='function')offSession();root.remove();}});
}
