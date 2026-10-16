import {createConnectedVersionsController} from './web-connected-versions-controller.mjs';

export function savedVersionOperationError(error){
  const code=error?.message;
  if(error?.name==='AbortError'||code==='NAMED_VERSION_RESTORE_CANCELLED')return '操作を取り消しました。一覧を再取得してください。';
  if(code==='RECIPE_HISTORY_LIMIT')return '履歴取得上限（1000版・本文合計16 MiB）を超えました。一部を省略して表示・成功扱いにはしません。';
  if(['NAMED_VERSION_CONFLICT','RESTORE_HEAD_CHANGED','RESTORE_SELECTION_STALE','DURABLE_DRAFT_REVISION_CONFLICT',
    'NAMED_VERSION_RESTORE_STALE','ORIGINAL_SHADOW_RESTORE_DRAFT_CHANGED',
    'ORIGINAL_SHADOW_RESTORE_HEAD_CHANGED','ORIGINAL_SHADOW_RESTORE_HISTORY_CHANGED','ORIGINAL_SHADOW_RESTORE_HINT_STALE'].includes(code))
    return '写真または保存版が別の操作で変わりました。再取得してから選び直してください。';
  if(['RESTORE_SAVE_REQUIRED','UNSAVED_EDITS'].includes(code))return '現在の未保存編集を保存してから、戻す版を選び直してください。';
  if(['RECIPE_HISTORY_UNSUPPORTED','NAMED_VERSION_HISTORY_UNAVAILABLE','NAMED_VERSION_HISTORY_NOT_EXPOSED','RESTORE_VERSION_UNAVAILABLE'].includes(code))
    return '選択版の履歴を取得できません。履歴対応の接続先で一覧を再取得してください。';
  if(code==='RESTORE_INDEPENDENT_MANUAL_RUNTIME_REQUIRED')
    return 'この版には編集復元へ未接続の個別人物補正が含まれています。設定を省略して戻すことはしません。';
  if(code==='RESTORE_BODY_SHA_MISMATCH'||code==='HISTORICAL_COMPARISON_BODY_CHANGED')
    return '選択した保存版と取得した設定が一致しません。復元せず、選び直してください。';
  if(['RESTORE_PERMISSION_DENIED','ORIGINAL_SHADOW_RESTORE_PERMISSION_DENIED','ORIGINAL_SHADOW_RESTORE_PRINCIPAL_CHANGED'].includes(code))
    return '対象写真または背景の利用権限を確認できません。ログイン状態と権限を確認してください。';
  if(['RESTORE_ASSET_CHANGED','ORIGINAL_SHADOW_RESTORE_ASSET_CHANGED','ORIGINAL_SHADOW_RESTORE_ORIGINAL_CHANGED'].includes(code))
    return '対象写真または背景の原本が保存版の情報と一致しません。別の画像で代用せず、復元を停止しました。';
  if(['ORIGINAL_SHADOW_RESTORE_DECODE_MISMATCH','ORIGINAL_SHADOW_RESTORE_PROXY_MISMATCH'].includes(code))
    return '影の復元に必要な原寸情報と縮小画像が一致しません。影を省略せず、復元を停止しました。';
  if(code==='ORIGINAL_SHADOW_RESTORE_SITES_REQUIRED')
    return 'この影設定の復元には、認可付き保存履歴を取得できるSites接続が必要です。';
  if(['ORIGINAL_SHADOW_RESTORE_HINT_INVALID','ORIGINAL_SHADOW_RESTORE_HINT_REQUIRED','ORIGINAL_SHADOW_RESTORE_SELECTION_INVALID'].includes(code))
    return '影設定の参照元を確認できません。保存版の一覧を再取得して選び直してください。';
  if(code==='ORIGINAL_SHADOW_RESTORE_HINT_LIMIT')
    return '影設定の復元参照数が上限に達しました。既存の参照を削除せず、今回の復元を停止しました。';
  if(code==='ORIGINAL_SHADOW_RESTORE_ROLLBACK_FAILED')
    return '復元処理に失敗し、直前の編集状態の復旧も完了していません。復元・保存を繰り返さず、復旧が必要な状態として扱ってください。';
  return '取得・保存できませんでした。権限、保存済み版、入力を確認して再取得してください。古い取得結果は使用しません。';
}

/** Call refresh() after mounting. All IDs/config are fixed for the panel lifetime;
 * destroy/remount on account, backend or selected asset change. onCompare receives
 * re-authorized saved Recipe rows, not rendered pixels and never an applied edit.
 */
export function createConnectedVersionsPanel({document=globalThis.document,onCompare,onRestore,onInvalidateComparison=()=>{},disabled=false,...config}={}){
  if(!document?.createElement||onCompare!==undefined&&typeof onCompare!=='function'||onRestore!==undefined&&typeof onRestore!=='function'||typeof onInvalidateComparison!=='function')throw Error('NAMED_VERSION_PANEL_CONFIG');
  const controller=createConnectedVersionsController(config),aborter=new AbortController();
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','名前付き編集版');
  root.append(el('h3','名前付き編集版'),el('p',controller.mode==='saved-head-only'?
    '名前はこのブラウザ内に保存。現在の保存済み版へ命名できます。過去版の取得APIは未公開のため、更新後の旧版表示・復元は未対応です。':
    controller.mode==='saved-history'?'認可付きで保存済みRecipe履歴を再取得し、過去版へ命名・比較対象を選択できます。名前はブラウザ内保存で端末間同期はありません。':
    '保存済みWorkspace履歴への名前参照です。名前の端末間同期は未接続です。'));
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const fieldset=el('fieldset');fieldset.append(el('legend','保存済み版と名前'));
  const select=title=>{const label=el('label',title),input=el('select');label.append(input);fieldset.append(label);return input;};
  const saved=select('保存済みRecipe版'),named=select('名前付き版'),left=select('比較・左'),right=select('比較・右');
  const summaries=el('div');summaries.setAttribute('aria-label','選択した保存版の補正概要');
  const summaryNodes=[saved,named,left,right].map((node,index)=>{const text=el('p');summaries.append(text);return {node,text,label:['保存済み版','名前付き版','比較・左','比較・右'][index]};});
  summaries.append(el('p','取得した保存設定の概要です。補正効果・自動検出・描画成功を保証する表示ではありません。'));fieldset.append(summaries);
  const label=el('label','名前'),name=el('input');name.type='text';name.maxLength=120;label.append(name);fieldset.append(label);
  const confirmation=el('label','この名前だけを削除する（原本・Recipe履歴は残す）'),confirmed=el('input');confirmed.type='checkbox';confirmation.prepend(confirmed);fieldset.append(confirmation);
  const button=text=>{const b=el('button',text);b.type='button';fieldset.append(b);return b;};
  const create=button('保存済み版に命名'),rename=button('改名'),remove=button('名前を削除'),selection=button('比較対象を保存'),compare=button('比較を表示');
  const restoreLabel=el('label','この版を現在の編集へ戻す（保存は別）ことに同意する'),restoreConfirmed=el('input');restoreConfirmed.type='checkbox';restoreLabel.prepend(restoreConfirmed);fieldset.append(restoreLabel);
  const restore=button('この版を現在の編集へ戻す（保存は別）');
  const restoreNotice=el('p');fieldset.append(restoreNotice);
  const reload=el('button','一覧を再取得');reload.type='button';root.append(reload,fieldset,status);
  if(!onCompare)root.append(el('p','比較画像の描画は未接続です。比較対象の選択のみ保存できます。'));
  let snapshot=null,busy=false,dead=false,external=Boolean(disabled),summariesFresh=false,summaryGeneration=0;
  function showSummaries(){
    for(const {node,text,label} of summaryNodes){
      text.textContent='';
      if(dead||external||busy||!snapshot||!summariesFresh)continue;
      if(controller.mode==='workspace-history'){text.textContent=`${label}: この接続では本文SHA付き補正概要を取得していません。`;continue;}
      if(!node.value){text.textContent=`${label}: 未選択`;continue;}
      const entry=node===saved?{recipeVersion:Number(node.value),bodySHA256:node.selectedOptions[0]?.dataset.bodySha256}:
        snapshot.document.entries.find(item=>item.id===node.value);
      const matches=entry&&!snapshot.unavailableEntryIds.includes(entry.id)&&Array.isArray(snapshot.versionSummaries)?
        snapshot.versionSummaries.filter(item=>item.revision===entry.recipeVersion&&item.bodySHA256===entry.bodySHA256):[];
      if(matches.length!==1||!/^[a-f0-9]{64}$/.test(entry?.bodySHA256??'')||!Array.isArray(matches[0].labels)||matches[0].labels.some(item=>typeof item!=='string')){
        text.textContent=`${label}: 一致する補正概要を取得できません。一覧を再取得してください。`;continue;
      }
      text.textContent=`${label} v${entry.recipeVersion}: ${matches[0].labels.length?matches[0].labels.join(' ／ '):'概要対象の補正設定なし'}`;
    }
  }
  function restorable(){const entry=snapshot?.document.entries.find(e=>e.id===named.value);return Boolean(onRestore&&typeof controller.resolve==='function'&&controller.mode==='saved-history'&&entry&&/^[a-f0-9]{64}$/.test(entry.bodySHA256)&&!snapshot.unavailableEntryIds.includes(entry.id));}
  function controls(){
    fieldset.disabled=external||busy||!snapshot;reload.disabled=external||busy;
    create.disabled=!snapshot?.availableVersions.length;rename.disabled=remove.disabled=!snapshot?.document.entries.length;
    compare.disabled=!onCompare;restoreConfirmed.disabled=!restorable();restore.disabled=!restorable()||!restoreConfirmed.checked;
    restoreNotice.textContent=controller.mode==='workspace-history'?'Workspaceの名前参照は本文SHA付き復元契約に未対応のため、ここからは戻せません。':controller.mode!=='saved-history'?'この接続先は過去版取得に未対応のため、ここからは戻せません。':!onRestore||typeof controller.resolve!=='function'?'現在の編集へ戻す処理は未接続です。':'取得可能な名前付き版を選択してください。原本・過去版は変更せず、最新保存revisionも巻き戻しません。影を含む版では対象写真と背景の原本・権限を再確認します。現在の編集への反映後、保存は別操作です。';
    root.setAttribute('aria-busy',String(busy));
    showSummaries();
  }
  function options(node,rows,value=''){
    node.replaceChildren();const blank=el('option','選択してください');blank.value='';node.append(blank);
    for(const [id,text] of rows){const o=el('option',text);o.value=String(id);node.append(o);}node.value=String(value??'');
  }
  function draw(){
    const d=snapshot.document,rows=d.entries.map(e=>[e.id,`${e.name} · v${e.recipeVersion}${snapshot.unavailableEntryIds.includes(e.id)?'（現在取得不可）':''}`]);
    options(saved,snapshot.availableVersions.map(v=>[v,`v${v}`]),snapshot.availableVersions.at(-1));
    for(const option of saved.options){const rows=snapshot.versionSummaries?.filter(row=>String(row.revision)===option.value)??[];
      if(rows.length===1&&/^[a-f0-9]{64}$/.test(rows[0].bodySHA256))option.dataset.bodySha256=rows[0].bodySHA256;}
    options(named,rows);options(left,rows,d.comparison.left);options(right,rows,d.comparison.right);confirmed.checked=false;restoreConfirmed.checked=false;controls();
  }
  async function run(work,successMessage='保存済み版の参照を更新しました。',{restoring=false}={}){
    if(dead||busy||external)return false;const summaryToken=summaryGeneration;summariesFresh=false;onInvalidateComparison();busy=true;status.textContent='';controls();
    let applied=false;
    try{await work();applied=true;if(dead)return false;snapshot=await controller.refresh({signal:aborter.signal});if(dead)return false;summariesFresh=!external&&summaryToken===summaryGeneration;draw();status.textContent=successMessage;return true;}
    catch(error){if(!dead){onInvalidateComparison();snapshot=null;for(const node of [saved,named,left,right])node.replaceChildren();status.textContent=restoring&&applied?'選択版は現在の編集へ反映済みですが、一覧の再取得に失敗しました。まだ保存していません。現在の編集を確認し、一覧だけ再取得してください。':savedVersionOperationError(error);}return false;}
    finally{busy=false;if(!dead)controls();}
  }
  const input=()=>({baseRevision:snapshot.document.revision,signal:aborter.signal});
  reload.addEventListener('click',()=>run(async()=>{}));
  create.addEventListener('click',()=>run(()=>controller.create({...input(),recipeVersion:Number(saved.value),name:name.value})));
  rename.addEventListener('click',()=>run(()=>controller.rename({...input(),id:named.value,name:name.value})));
  remove.addEventListener('click',()=>{if(!confirmed.checked){status.textContent='名前のみ削除することを確認してください。';return;}run(()=>controller.remove({...input(),id:named.value}));});
  named.addEventListener('change',()=>{name.value=snapshot?.document.entries.find(e=>e.id===named.value)?.name??'';confirmed.checked=false;restoreConfirmed.checked=false;controls();});
  for(const node of [saved,left,right])node.addEventListener('change',showSummaries);
  restoreConfirmed.addEventListener('change',controls);
  restore.addEventListener('click',()=>{
    if(dead||busy||external||!restorable()||!restoreConfirmed.checked)return;
    const selected=structuredClone(snapshot.document.entries.find(e=>e.id===named.value));
    void run(async()=>{
      const resolved=await controller.resolve({id:selected.id,signal:aborter.signal});
      if(dead||external||aborter.signal.aborted)throw Error('NAMED_VERSION_RESTORE_CANCELLED');
      if(resolved?.assetId!==config.assetId||resolved.entry?.id!==selected.id||resolved.entry.recipeVersion!==selected.recipeVersion||resolved.entry.bodySHA256!==selected.bodySHA256)throw Error('NAMED_VERSION_CONFLICT');
      restoreConfirmed.checked=false;
      await onRestore({assetId:resolved.assetId,revision:resolved.entry.recipeVersion,bodySHA256:resolved.entry.bodySHA256,signal:aborter.signal});
    },'選択版を現在の編集へ反映しました。まだ保存していません。原本・過去版・最新保存revisionは変更していません。',{restoring:true});
  });
  selection.addEventListener('click',()=>run(()=>controller.selectComparison({...input(),left:left.value||null,right:right.value||null})));
  compare.addEventListener('click',()=>run(async()=>{
    if(!onCompare)throw Error('NAMED_VERSION_COMPARE_NOT_CONNECTED');
    const selected=await controller.selectComparison({...input(),left:left.value||null,right:right.value||null});
    const result=await controller.compare({signal:aborter.signal});
    if(result.metadataRevision!==selected.document.revision)throw Error('NAMED_VERSION_CONFLICT');
    if(!dead&&!external&&!aborter.signal.aborted)await onCompare({...result,signal:aborter.signal});
  }));
  controls();
  return Object.freeze({element:root,refresh:()=>run(async()=>{}),setDisabled(value){external=Boolean(value);if(external){summariesFresh=false;summaryGeneration++;restoreConfirmed.checked=false;onInvalidateComparison();}controls();},destroy(){dead=true;summariesFresh=false;summaryGeneration++;aborter.abort();onInvalidateComparison();snapshot=null;showSummaries();root.remove();}});
}
