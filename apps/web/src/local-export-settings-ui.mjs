import {BrowserDraftStore} from './api-client.mjs';
import {validateWorkspaceExportPresetSettings} from './workspace-export-preset-client.mjs';
import {validateOutputSharpening} from './export-output-adjustments.mjs';
import {parseExportSizeSelection} from './export-size-selection.mjs';

/** Reuse validation only. No Workspace client, token, route or identity bridge. */
export function validateLocalExportSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==4||!['format','size','resolution','outputSharpening'].every(key=>Object.hasOwn(value,key)))throw Error('LOCAL_EXPORT_SETTINGS_INVALID');
  const outputSharpening=validateOutputSharpening(value.outputSharpening);
  const input=value.size;
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('LOCAL_EXPORT_SIZE');
  const colors={white:[255,255,255],gray:[128,128,128],black:[0,0,0]};
  const background=Object.keys(colors).find(key=>JSON.stringify(colors[key])===JSON.stringify(input.background));
  const size=parseExportSizeSelection(input.kind,{...input,background:background??''});
  if(Reflect.ownKeys(input).length!==Object.keys(size).length||Object.keys(size).some(key=>JSON.stringify(size[key])!==JSON.stringify(input[key])))throw Error('LOCAL_EXPORT_SIZE');
  const validated=validateWorkspaceExportPresetSettings({...value,size:{kind:'original'},outputSharpening:{kind:'none'}});
  return {...validated,size,outputSharpening};
}
function checkedName(name){if(typeof name!=='string'||!name.trim()||name.trim().length>120||/[\u0000-\u001f\u007f]/.test(name))throw Error('LOCAL_EXPORT_NAME');return name.trim();}
function checkedDocument(value){
  if(value===undefined)return {schemaVersion:1,entries:[]};
  if(!value||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>50)throw Error('LOCAL_EXPORT_DOCUMENT');
  const ids=new Set();return {schemaVersion:1,entries:value.entries.map(entry=>{if(typeof entry?.id!=='string'||!entry.id||ids.has(entry.id))throw Error('LOCAL_EXPORT_DOCUMENT');ids.add(entry.id);return {id:entry.id,name:checkedName(entry.name),settings:validateLocalExportSettings(entry.settings)};})};
}

/** Per-origin/account/browser settings, not cloud or distributed Presets. */
export function mountLocalExportSettings(container,{scope,canUse,readSettings,applySettings}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof scope!=='string'||!scope||scope.length>4096||[canUse,readSettings,applySettings].some(fn=>typeof fn!=='function'))throw Error('LOCAL_EXPORT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','ローカル書き出し設定');root.append(el('h3','ローカル書き出し設定'),el('p','このorigin・アカウント・ブラウザ内だけに保存します。Workspace／Cloud Presetではなく、端末間同期・共有はありません。ブラウザデータ削除で消えます。単写真の手動書出しフォームの形式・サイズ・密度・出力シャープの4設定が対象です。JPEG品質・命名は含みません。厳密な幅×高さは余白・中央切抜き・引伸ばしの処理方法と、余白色（白・グレー・黒）も保持します。サイズ・密度は一括とも共通ですが、一括専用の形式・シャープは変更しません。'));
  const fields=el('fieldset');fields.append(el('legend','手動書出し設定の保存・再利用'));
  const nameLabel=el('label','保存名'),name=el('input');name.type='text';name.maxLength=120;nameLabel.append(name);fields.append(nameLabel);
  const selectLabel=el('label','ローカル設定'),select=el('select');selectLabel.append(select);fields.append(selectLabel);
  const button=text=>{const node=el('button',text);node.type='button';fields.append(node);return node;};
  const save=button('現在の4設定を新しく保存'),load=button('選択設定をフォームへ適用'),remove=button('選択したローカル設定を削除'),reload=button('一覧を再取得');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,status);container.append(root);
  let disposed=false,pending=false,entries=[];
  let storePromise;
  const getStore=()=>storePromise??=(async()=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope));return new BrowserDraftStore(`local-export-${Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('')}`);})();
  function permitted(){try{return !disposed&&canUse()===true;}catch{return false;}}
  function guard(){if(!permitted())throw Error('LOCAL_EXPORT_NOT_READY');}
  function refresh(){fields.disabled=disposed||pending||!permitted();load.disabled=remove.disabled=!entries.some(entry=>entry.id===select.value);save.disabled=entries.length>=50;root.setAttribute('aria-busy',String(pending));}
  function draw(next){const old=select.value;entries=next;select.replaceChildren();const blank=el('option','選択してください');blank.value='';select.append(blank);for(const entry of entries){const option=el('option',entry.name);option.value=entry.id;select.append(option);}select.value=entries.some(entry=>entry.id===old)?old:'';refresh();}
  async function mutate(change){const store=await getStore();guard();const db=await store.db();guard();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),records=tx.objectStore('drafts');let result,error;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error??Error('LOCAL_EXPORT_SAVE_ABORTED'));tx.onerror=()=>{error??=tx.error;};const request=records.get('presets');request.onsuccess=()=>{try{guard();const value=checkedDocument(request.result);change(value.entries);result=checkedDocument(value);records.put(result,'presets');}catch(cause){error=cause;tx.abort();}};});}
  async function run(task){if(pending||!permitted())return;pending=true;refresh();try{const message=await task();if(!disposed&&permitted())status.textContent=message;}catch{if(!disposed)status.textContent='設定を取得・保存・適用できませんでした。入力、対応サイズ、保存容量、権限・処理状態を確認してください。設定は自動補完しません。';}finally{pending=false;if(!disposed)refresh();}}
  reload.addEventListener('click',()=>{void run(async()=>{const store=await getStore();guard();const value=checkedDocument(await store.get('presets'));guard();draw(value.entries);return 'ローカル一覧を再取得しました。';});});
  select.addEventListener('change',refresh);
  save.addEventListener('click',()=>{void run(async()=>{const settings=validateLocalExportSettings(readSettings()),label=checkedName(name.value);const value=await mutate(rows=>{if(rows.length>=50)throw Error('LOCAL_EXPORT_LIMIT');rows.push({id:crypto.randomUUID(),name:label,settings});});guard();draw(value.entries);select.value=value.entries.at(-1).id;return '4設定をブラウザ内に保存しました。書き出しは実行していません。';});});
  load.addEventListener('click',()=>{const id=select.value;void run(async()=>{const store=await getStore();guard();const value=checkedDocument(await store.get('presets'));guard();const entry=value.entries.find(row=>row.id===id);if(!entry)throw Error('LOCAL_EXPORT_MISSING');const settings=validateLocalExportSettings(entry.settings);guard();const readback=validateLocalExportSettings(applySettings(settings));if(JSON.stringify(readback)!==JSON.stringify(settings))throw Error('LOCAL_EXPORT_READBACK');return '手動フォームへ適用しました。「この設定で書き出す」で実行してください。原本・Recipeは変更していません。';});});
  remove.addEventListener('click',()=>{const id=select.value;void run(async()=>{const value=await mutate(rows=>{const index=rows.findIndex(row=>row.id===id);if(index<0)throw Error('LOCAL_EXPORT_MISSING');rows.splice(index,1);});guard();draw(value.entries);return '選択したローカル出力設定だけを削除しました。原本・Recipeは削除していません。';});});
  refresh();
  return Object.freeze({refresh,dispose(){disposed=true;root.remove();}});
}
