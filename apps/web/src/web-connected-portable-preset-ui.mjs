import {encodePortablePresetSnapshot,decodePortablePresetSnapshot} from './delta66-preset-catalog.mjs';
import {portableParameters} from '../preset-policy.mjs';
import {encodeLocalLUTPreset,decodeLocalLUTPreset,LUT_PRESET_MAX_BYTES} from './local-lut-preset-transfer.mjs';

const MAX_TEXT=350000;
/** Unsigned local text exchange only. The portable contract, not this UI,
 * decides which settings may travel. Unsupported fields are never stripped. */
export function mountWebConnectedPortablePreset(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('PORTABLE_PRESET_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','SUITE設定テキストの受渡し');
  root.append(el('h3','SUITE設定テキストの受渡し'),el('p','署名のないSUITE設定コピーです。個人Lookの33係数と強度も含められますが、学習写真やライブラリの名前・IDは含みません。作者確認済みPreset・共有URL・クラウド同期ではありません。写真固有マスクや未対応LUTを黙って除外しません。テキストは手動でコピーしてください。'));
  const fields=el('fieldset');fields.append(el('legend','書き出し・読み込み'));
  const name=el('input');name.type='text';name.maxLength=255;name.value='SUITE設定';
  const nameLabel=el('label','設定名');nameLabel.append(name);fields.append(nameLabel);
  const exportButton=el('button','現在の設定をテキスト化');exportButton.type='button';fields.append(exportButton);
  const output=el('textarea');output.readOnly=true;output.rows=4;output.setAttribute('aria-label','書き出した設定テキスト');fields.append(output);
  const input=el('textarea');input.rows=4;input.maxLength=MAX_TEXT;input.spellcheck=false;input.setAttribute('aria-label','読み込む設定テキスト');fields.append(input);
  const inspect=el('button','読み込む内容を確認');inspect.type='button';fields.append(inspect);
  const summary=el('pre');summary.setAttribute('aria-label','確認済み設定の内容');fields.append(summary);
  fields.append(el('p','記載された設定ブロックを置き換えます。個人Lookを含む場合は色設定と一緒に適用し、含まない場合は適用先の個人Lookを維持します。取込に無い設定ブロックは維持します。適用は未保存の編集となり、保存には通常のRecipe保存操作が必要です。'));
  const consent=el('input');consent.type='checkbox';const consentLabel=el('label','署名のない設定コピーの内容を確認し、現在の画像へ適用する');consentLabel.prepend(consent);fields.append(consentLabel);
  const apply=el('button','確認した設定を適用');apply.type='button';fields.append(apply);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,status);container.append(root);
  let current=null,binding=null,proposal=null,pending=false,disposed=false,generation=0;
  const signature=value=>JSON.stringify([value?.asset?.id??null,value?.asset?.sha256??null,value?.revision??null,
    value?.recipe??null,value?.afterURL??null]);
  function allowed(){try{return Boolean(current?.asset&&current?.recipe)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function clear(){generation++;proposal=null;summary.textContent='';output.value='';consent.checked=false;}
  function render(){
    fields.disabled=disposed||pending||!allowed();
    inspect.disabled=!input.value.length;apply.disabled=!proposal||!consent.checked||typeof session.applyPortablePreset!=='function';
    root.setAttribute('aria-busy',String(pending));
  }
  function synchronize(value){
    if(disposed)return;current=value;const next=signature(value);
    if(next!==binding||!allowed()){
      const had=Boolean(proposal)||Boolean(output.value);clear();binding=next;
      if(had)status.textContent='画像・編集状態・利用可否が変わったため、確認済み内容と書き出し結果を破棄しました。';
    }
    render();
  }
  function fresh(){
    const state=session.state??current;
    if(disposed||pending)throw Error('PORTABLE_PRESET_UNAVAILABLE');
    if(signature(state)!==binding){synchronize(state);throw Error('PORTABLE_PRESET_STALE');}
    current=state;if(!allowed()){clear();render();throw Error('PORTABLE_PRESET_UNAVAILABLE');}
  }
  function errorMessage(error){status.textContent=`処理できませんでした。非対応設定を除外せず停止しました。${String(error?.message??'PORTABLE_PRESET_ERROR').slice(0,200)}`;}
  exportButton.addEventListener('click',()=>{
    try{fresh();clear();
      // Validate the complete current Recipe; do not build a sanitized subset.
      portableParameters(current.recipe);
      output.value=encodePortablePresetSnapshot({name:name.value,recipe:current.recipe});
      status.textContent='署名のない設定テキストを作成しました。上の欄から手動でコピーできます。';
    }catch(error){if(!disposed){clear();errorMessage(error);}}render();
  });
  input.addEventListener('input',()=>{clear();status.textContent='変更したテキストの内容を確認してください。';render();});
  name.addEventListener('input',()=>{output.value='';});
  consent.addEventListener('change',render);
  inspect.addEventListener('click',()=>{
    try{fresh();clear();
      const text=input.value;if(!text.length||text.length>MAX_TEXT)throw Error('PRESET_SNAPSHOT_INVALID');
      const decoded=decodePortablePresetSnapshot(text),parameters=portableParameters(decoded.recipe);
      proposal={parameters:structuredClone(parameters),binding,text};
      summary.textContent=`設定名：${decoded.name}\n個人Look：${Object.hasOwn(parameters,'personalLook')?`含む（33係数・強度${parameters.personalLook.strength*100}%）。適用先の個人Lookを置換。`:'含まない。適用先の個人Lookを維持。'}\n${JSON.stringify(parameters,null,2)}`;
      status.textContent='内容を確認しました。まだ適用していません。同意してから適用してください。';
    }catch(error){if(!disposed){clear();errorMessage(error);}}render();
  });
  apply.addEventListener('click',async()=>{
    let token,assetID;
    try{
      fresh();
      if(!proposal||!consent.checked||proposal.binding!==binding||proposal.text!==input.value||
          typeof session.applyPortablePreset!=='function')throw Error('PORTABLE_PRESET_CONFIRMATION_REQUIRED');
      const parameters=structuredClone(proposal.parameters);assetID=current.asset.id;token=++generation;
      pending=true;render();
      await session.applyPortablePreset(parameters);
      if(!disposed&&current?.asset?.id===assetID){clear();status.textContent='SUITE設定を編集へ適用しました。必要に応じてUndoまたは通常のRecipe保存を行ってください。';}
    }catch(error){if(!disposed&&(token===undefined||current?.asset?.id===assetID)){clear();errorMessage(error);}}
    finally{pending=false;if(!disposed)render();}
  });
  const lutPanel=mountLocalLUTBundle(root,{session,canUse});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed){synchronize(session.state??current);lutPanel.refresh();}},dispose(){
    if(disposed)return;disposed=true;clear();input.value='';lutPanel.dispose();if(typeof unsubscribe==='function')unsubscribe();root.remove();
  }});
}

/** A separate local asset-bearing file, never an author-published preset. */
function mountLocalLUTBundle(container,{session,canUse}){
  const document=container.ownerDocument,el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.append(el('h4','手持ちLUT付き設定ファイル'),el('p','CUBE原文を同梱する自分用のローカルファイルです。学習写真・原写真・マスクは含みません。クラウド送信・公開・同期はしません。利用・持出し権利を確認した手持ちLUTだけを扱ってください。CUBE最大32MiB、同梱ファイル最大46MiB。取込後のLUTはこのブラウザ内に保存します。'));
  const fields=el('fieldset'),name=el('input');name.type='text';name.maxLength=255;name.value='LUT付き設定';
  const nameLabel=el('label','ファイル内の設定名');nameLabel.append(name);fields.append(nameLabel);
  const exportRights=el('input');exportRights.type='checkbox';const exportLabel=el('label','現在のLUTをこのファイルへ持ち出す権利を確認した');exportLabel.prepend(exportRights);fields.append(exportLabel);
  const download=el('button','LUT付き設定をダウンロード');download.type='button';fields.append(download);
  const file=el('input');file.type='file';file.accept='.json,application/json';const fileLabel=el('label','LUT付き設定ファイルを1件選択');fileLabel.append(file);fields.append(fileLabel);
  const inspect=el('button','選択ファイルの内容を確認');inspect.type='button';fields.append(inspect);
  const summary=el('pre');fields.append(summary);
  const rights=el('input');rights.type='checkbox';const rightsLabel=el('label','同梱LUTの利用権利と表示内容を確認し、設定を現在の写真へ適用する');rightsLabel.prepend(rights);fields.append(rightsLabel);
  const apply=el('button','確認したLUT付き設定を適用');apply.type='button';fields.append(apply);
  const cancel=el('button','取消');cancel.type='button';const status=el('p');status.setAttribute('role','status');root.append(fields,cancel,status);container.append(root);
  let current=null,binding=null,proposal=null,pending=false,committing=false,commitAsset=null,disposed=false,generation=0,controller=null,url=null,urlTimer=null;
  const signature=value=>JSON.stringify([value?.asset?.id,value?.asset?.sha256,value?.revision,value?.recipe,value?.afterURL]);
  const revoke=()=>{if(urlTimer!==null){clearTimeout(urlTimer);urlTimer=null;}if(url){URL.revokeObjectURL(url);url=null;}};
  function available(){try{return Boolean(current?.asset&&current?.recipe)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function clear(){proposal=null;rights.checked=false;summary.textContent='';}
  function stop(){
    controller?.abort();clear();revoke();
    // Keep the controls locked until an in-flight Recipe commit has rolled back.
    if(committing)return;
    generation++;controller=null;pending=false;
  }
  function render(){fields.disabled=disposed||pending||!available();download.disabled=!exportRights.checked;inspect.disabled=file.files?.length!==1;apply.disabled=!proposal||!rights.checked||typeof session.applyLocalLUTPreset!=='function';cancel.disabled=!pending&&!proposal;root.setAttribute('aria-busy',String(pending));}
  function sync(state){
    if(disposed)return;current=state;const next=signature(state);
    // During commit, the Session itself publishes busy/new Recipe. Do not abort
    // the commit we requested, but discard displayed confirmation immediately.
    if(next!==binding||!available()){
      if(pending&&!committing)stop();
      if(committing){let access=false;try{access=canUse(state)===true;}catch{}if(!access||state?.asset?.id!==commitAsset)controller?.abort();}
      clear();revoke();exportRights.checked=false;binding=next;
    }
    render();
  }
  function fresh(){current=session.state??current;if(disposed||pending||!available()||signature(current)!==binding)throw Error('LUT_PRESET_STALE_OR_UNAVAILABLE');}
  function start(){fresh();clear();revoke();pending=true;controller=new AbortController();const task={generation:++generation,binding,signal:controller.signal};render();return task;}
  function ensure(task){const state=session.state??current;if(disposed||task.generation!==generation||task.signal.aborted||signature(state)!==task.binding)throw Error('LUT_PRESET_STALE_OR_CANCELLED');current=state;if(!available())throw Error('LUT_PRESET_UNAVAILABLE');}
  function finish(task,error){if(disposed||task&&task.generation!==generation)return;pending=false;controller=null;if(error){clear();status.textContent=`処理を停止しました。${String(error?.message??error).slice(0,180)}`;}render();}
  download.addEventListener('click',async()=>{
    let task;try{
      if(!exportRights.checked)throw Error('LUT_EXPORT_RIGHTS_REQUIRED');
      task=start();const recipe=structuredClone(current.recipe),label=name.value;
      const blob=await encodeLocalLUTPreset({name:label,recipe},{signal:task.signal});ensure(task);
      url=URL.createObjectURL(blob);const link=el('a');link.href=url;link.download='suite-lut-preset.json';root.append(link);
      try{link.click();}finally{link.remove();}urlTimer=setTimeout(revoke,1000);
      status.textContent='手持ちLUT付き設定ファイルを作成しました。第三者への配布権利は保証しません。';
    }catch(error){finish(task,error);return;}finish(task);
  });
  inspect.addEventListener('click',async()=>{
    let task;try{
      const selected=file.files?.length===1?file.files[0]:null;
      if(!selected||selected.size<1||selected.size>LUT_PRESET_MAX_BYTES)throw Error('LUT_PRESET_FILE_SIZE');
      task=start();const decoded=await decodeLocalLUTPreset(selected,{signal:task.signal});ensure(task);
      if(file.files?.[0]!==selected)throw Error('LUT_PRESET_FILE_CHANGED');
      proposal={...decoded,file:selected,binding:task.binding};
      summary.textContent=`設定名：${decoded.name}\nLUT：${decoded.profile.lutRef.byteLength} bytes\nSHA-256：${decoded.profile.lutRef.sha256}\nLUT強度：${decoded.profile.intensity*100}%\n個人Look：${Object.hasOwn(decoded.parameters,'personalLook')?'含む（係数を置換）':'含まない（適用先を維持）'}\n色設定：${JSON.stringify(decoded.parameters,null,2)}\nまだ保存・適用していません。`;
      status.textContent='内容と利用権利を確認後、別の適用ボタンを押してください。';
    }catch(error){finish(task,error);return;}finish(task);
  });
  apply.addEventListener('click',async()=>{
    let task;try{
      fresh();if(!proposal||!rights.checked||proposal.binding!==binding||proposal.file!==file.files?.[0]||typeof session.applyLocalLUTPreset!=='function')throw Error('LUT_PRESET_CONFIRMATION_REQUIRED');
      const value=proposal,assetID=current.asset.id;task=start();committing=true;commitAsset=assetID;
      await session.applyLocalLUTPreset({parameters:value.parameters,profile:value.profile,bytes:value.bytes},{signal:task.signal});
      if(!disposed&&!task.signal.aborted&&task.generation===generation&&session.state?.asset?.id===assetID)status.textContent='LUT付き設定を一度の編集として適用しました。Recipe保存は通常の保存操作で行ってください。';
    }catch(error){finish(task,error);return;}finally{committing=false;commitAsset=null;}finish(task);
  });
  file.addEventListener('change',()=>{stop();status.textContent='選択ファイルを改めて確認してください。';render();});
  name.addEventListener('input',()=>{stop();render();});rights.addEventListener('change',render);exportRights.addEventListener('change',render);
  cancel.addEventListener('click',()=>{stop();status.textContent='取消しました。保存済みLUT資産が残る場合も、写真へ勝手に再適用しません。';render();});
  const unsubscribe=session.subscribe(sync);
  return {refresh(){sync(session.state??current);},dispose(){if(disposed)return;disposed=true;stop();file.value='';unsubscribe?.();root.remove();}};
}
