import {BrowserDraftStore} from './api-client.mjs';
import {updatePresetLibrary,presetCatalogMetadata} from './delta66-preset-library.mjs';

const empty=()=>({schemaVersion:1,version:0,groups:[],entries:[]});
const reference=item=>({kind:item.kind,id:item.id,version:item.version});
const key=item=>JSON.stringify([item.kind,item.id,item.version]);
function checked(value){const doc=value??empty();presetCatalogMetadata(doc);if(JSON.stringify(doc).length>1024*1024)throw Error('LOCAL_LIBRARY_LIMIT');return structuredClone(doc);}

/** Companion metadata only, isolated by freshly authenticated principal/tenant/backend. */
export function mountLocalPresetLibrary(container,{api,canUse,onChange}={}){
  const document=container.ownerDocument,el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.append(el('h4','自分用のローカル分類'),el('p','分類・グループはこのブラウザ内だけの管理情報です。公式の分類・人気度ではありません。Preset本文・適用処理は変更せず、同じIDでも版が変われば分類を引き継ぎません。アカウント・tenant・接続先を確認できない場合は保存しません。'));
  const fields=el('fieldset');root.append(fields);const makeSelect=title=>{const label=el('label',title),select=el('select');label.append(select);fields.append(label);return select;};
  const target=makeSelect('分類する公開Presetの版'),category=makeSelect('自分で分類を指定'),groups=makeSelect('所属グループ（複数選択可）');groups.multiple=true;
  for(const [value,title] of [['','分類を選択'],['default','Default（自分用）'],['adjusted','Adjusted（自分用）']]){const option=el('option',title);option.value=value;category.append(option);}
  const nameLabel=el('label','新しいグループ名'),name=el('input');name.maxLength=255;nameLabel.append(name);fields.append(nameLabel);
  const button=text=>{const b=el('button',text);b.type='button';fields.append(b);return b;};
  const reload=button('本人確認・分類を再取得'),create=button('グループを作成'),save=button('選択版の分類を保存'),remove=button('選択版の分類を解除');
  const manageGroup=makeSelect('改名・削除するグループ');
  const renameLabel=el('label','変更後のグループ名'),renameName=el('input');renameName.maxLength=255;renameLabel.append(renameName);fields.append(renameLabel);
  const renameGroup=button('グループ名を変更');
  const deleteLabel=el('label','グループとその所属情報だけを削除することを確認（Preset・Recipeは残す）'),deleteConfirmed=el('input');deleteConfirmed.type='checkbox';deleteLabel.prepend(deleteConfirmed);fields.append(deleteLabel);
  const deleteGroup=button('選択グループを削除');fields.append(el('p','改名は所属先を維持します。削除は各版のローカル所属情報からこのグループだけを外します。Preset本文・分類・原本・Recipeは削除しません。'));
  const filters=el('fieldset');filters.append(el('legend','ローカル分類で絞り込む'));const filter=el('select'),groupFilter=el('select');filter.setAttribute('aria-label','分類フィルター');groupFilter.setAttribute('aria-label','グループフィルター');for(const [value,title] of [['all','すべて'],['default','Default'],['adjusted','Adjusted']]){const option=el('option',title);option.value=value;filter.append(option);}filters.append(filter,groupFilter);root.append(filters);
  const status=el('p','ローカル分類は未取得です。「本人確認・分類を再取得」を押してください。');status.setAttribute('role','status');root.append(status);container.append(root);
  let inventory=[],doc=empty(),scope=null,busy=false,dead=false,ready=false,epoch=0;
  function allowed(){try{return !dead&&canUse()===true;}catch{return false;}}
  function reset(){epoch++;scope=null;ready=false;doc=empty();filter.value='all';groupFilter.replaceChildren();category.value='';groups.replaceChildren();manageGroup.replaceChildren();renameName.value='';deleteConfirmed.checked=false;onChange();}
  function controls(){fields.disabled=busy||!allowed();filters.disabled=busy||!allowed()||!ready;save.disabled=remove.disabled=create.disabled=!ready;reload.disabled=busy||!allowed();const hasGroup=ready&&doc.groups.some(group=>group.id===manageGroup.value);manageGroup.disabled=!ready;renameName.disabled=renameGroup.disabled=deleteConfirmed.disabled=!hasGroup;deleteGroup.disabled=!hasGroup||!deleteConfirmed.checked;}
  async function identity(){if(typeof api?.getSession!=='function')throw Error('LOCAL_LIBRARY_IDENTITY_UNAVAILABLE');const session=await api.getSession();if(dead||!allowed()||session?.endedReason||!['SITES','INVITED_LOCAL_TRIAL'].includes(session?.mode)||typeof session.principal?.id!=='string'||!session.principal.id||typeof session.principal?.tenantId!=='string'||!session.principal.tenantId)throw Error('LOCAL_LIBRARY_IDENTITY_UNAVAILABLE');const url=new URL(api.baseURL||document.defaultView.location.origin,document.defaultView.location.href);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('LOCAL_LIBRARY_BACKEND');url.hash='';url.search='';return JSON.stringify([url.href,session.mode,session.principal.tenantId,session.principal.id]);}
  async function storeFor(value){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return new BrowserDraftStore(`preset-library-${Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')}`);}
  function draw({preserveDraft=false}={}){const selected=target.value,draftCategory=category.value,draftGroups=[...groups.selectedOptions].map(option=>option.value),managed=manageGroup.value;target.replaceChildren();const blank=el('option','版を選択してください');blank.value='';target.append(blank);for(const item of inventory){const option=el('option',`${item.name} · v${item.version}`);option.value=key(item);target.append(option);}target.value=inventory.some(item=>key(item)===selected)?selected:'';groups.replaceChildren();const old=groupFilter.value;groupFilter.replaceChildren();const all=el('option','すべてのグループ');all.value='';groupFilter.append(all);manageGroup.replaceChildren();const choose=el('option','グループを選択してください');choose.value='';manageGroup.append(choose);for(const group of doc.groups){const option=el('option',group.name);option.value=group.id;groups.append(option);const f=el('option',group.name);f.value=group.id;groupFilter.append(f);const m=el('option',group.name);m.value=group.id;manageGroup.append(m);}groupFilter.value=doc.groups.some(group=>group.id===old)?old:'';manageGroup.value=doc.groups.some(group=>group.id===managed)?managed:'';renameName.value=doc.groups.find(group=>group.id===manageGroup.value)?.name??'';deleteConfirmed.checked=false;hydrate();if(preserveDraft&&selected&&target.value===selected){category.value=draftCategory;for(const option of groups.options)option.selected=draftGroups.includes(option.value);}controls();}
  function hydrate(){const entry=doc.entries.find(entry=>key(entry)===target.value);category.value=entry?.category??'';for(const option of groups.options)option.selected=entry?.groups.includes(option.value)??false;}
  async function run(work,success='本人・接続先を確認し、ローカル分類を更新しました。Preset本文は変更していません。'){if(busy||!allowed())return;busy=true;controls();try{await work();if(!dead)status.textContent=success;}catch(error){if(!dead){reset();draw();status.textContent=error?.message==='PRESET_LIBRARY_VERSION_CONFLICT'?'別の操作と競合しました。分類を再取得してください。':'本人・接続先・保存状態を確認できません。ローカル分類は使用せず、再取得が必要です。';}}finally{busy=false;if(!dead)controls();}}
  reload.addEventListener('click',()=>{void run(async()=>{const verified=await identity(),store=await storeFor(verified),next=checked(await store.get('metadata'));if(await identity()!==verified)throw Error('LOCAL_LIBRARY_IDENTITY_CHANGED');if(dead)return;scope=verified;doc=next;ready=true;draw();onChange();});});
  async function mutate(operation){if(!ready)throw Error('LOCAL_LIBRARY_NOT_READY');const verified=await identity();if(verified!==scope)throw Error('LOCAL_LIBRARY_IDENTITY_CHANGED');const token=epoch,baseVersion=doc.version,store=await storeFor(verified),db=await store.db();if(await identity()!==verified)throw Error('LOCAL_LIBRARY_IDENTITY_CHANGED');
    const next=await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),records=tx.objectStore('drafts');let result,error;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error);tx.onerror=()=>{error??=tx.error;};const request=records.get('metadata');request.onsuccess=()=>{try{if(dead||!allowed()||epoch!==token||scope!==verified)throw Error('LOCAL_LIBRARY_STALE');if(operation.type==='set-entry'&&!inventory.some(item=>key(item)===key(operation.entry)))throw Error('LOCAL_LIBRARY_VERSION_UNAVAILABLE');result=checked(updatePresetLibrary(checked(request.result),{baseVersion,operation}));records.put(result,'metadata');}catch(cause){error=cause;tx.abort();}};});
    if(dead||token!==epoch)return;if(await identity()!==verified)throw Error('LOCAL_LIBRARY_IDENTITY_CHANGED');doc=next;draw({preserveDraft:['create-group','rename-group','delete-group'].includes(operation.type)});onChange();
  }
  create.addEventListener('click',()=>{void run(()=>{const groupName=name.value.trim();if(doc.groups.some(group=>group.name===groupName))throw Error('LOCAL_LIBRARY_DUPLICATE_GROUP');return mutate({type:'create-group',id:crypto.randomUUID(),name:groupName});});});
  save.addEventListener('click',()=>{void run(()=>{const item=inventory.find(item=>key(item)===target.value);if(!item||!['default','adjusted'].includes(category.value))throw Error('LOCAL_LIBRARY_SELECTION');const old=doc.entries.find(entry=>key(entry)===key(item));return mutate({type:'set-entry',entry:{...reference(item),category:category.value,hot:old?.hot??false,groups:[...groups.selectedOptions].map(option=>option.value),tags:old?.tags??[],outputIntent:old?.outputIntent??'any'}});});});
  remove.addEventListener('click',()=>{void run(()=>{const item=inventory.find(item=>key(item)===target.value);if(!item)throw Error('LOCAL_LIBRARY_SELECTION');return mutate({type:'remove-entry',reference:reference(item)});});});
  manageGroup.addEventListener('change',()=>{renameName.value=doc.groups.find(group=>group.id===manageGroup.value)?.name??'';deleteConfirmed.checked=false;controls();});
  deleteConfirmed.addEventListener('change',controls);
  renameGroup.addEventListener('click',()=>{
    if(busy||!allowed()||renameGroup.disabled)return;const id=manageGroup.value,label=renameName.value.trim();
    if(!label||label.length>255||/[\u0000-\u001f\u007f]/u.test(label)||doc.groups.some(group=>group.id!==id&&group.name===label)){status.textContent='空でない重複しないグループ名を指定してください。';return;}
    void run(()=>mutate({type:'rename-group',id,name:label}),'グループ名を変更しました。所属と分類は維持しています。未保存の分類入力はまだ未保存です。');
  });
  deleteGroup.addEventListener('click',()=>{
    if(busy||!allowed()||deleteGroup.disabled||!deleteConfirmed.checked)return;const id=manageGroup.value;deleteConfirmed.checked=false;
    void run(()=>mutate({type:'delete-group',id}),'ローカルグループとその所属情報を削除しました。Preset・分類・原本・Recipeは残っています。削除グループで絞込中だった場合は全グループ表示に戻しました。');
  });
  target.addEventListener('change',hydrate);filter.addEventListener('change',onChange);groupFilter.addEventListener('change',onChange);controls();
  return Object.freeze({setInventory(items){inventory=items;draw();},metadata(){return ready?presetCatalogMetadata(doc):[];},filters(){return ready?{filter:filter.value,group:doc.groups.find(group=>group.id===groupFilter.value)?.name??null}:{};},invalidate(){if(ready||scope){reset();draw();status.textContent='本人確認が失効しました。分類を再取得してください。';}},refresh:controls,dispose(){dead=true;epoch++;root.remove();}});
}
