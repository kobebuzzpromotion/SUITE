import {preflightCrossDeviceCapabilities} from './cross-device-capabilities.mjs';
import {readAppleLocalEditJSON} from './apple-local-edit-import.mjs';
import {createLocalBackdropPreviewUI} from './local-backdrop-preview-ui.mjs';
import {createAppleDocumentRestoreSession,prepareAppleDocumentRestore} from './apple-document-restore.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ASSESSMENT = Object.freeze({supported:'supported',unverified:'unverified',unsupported:'unsupported'});

/** Display only. This is not an authentication, transfer, Apple render, or Final gate. */
export function createCrossDeviceCompatReportUI({document,backdropHost,restoreHost}={}) {
  if (!document || typeof document.createElement!=='function') throw Error('CROSS_DEVICE_REPORT_DOCUMENT_REQUIRED');
  const make=(tag,className,text)=>{
    const node=document.createElement(tag);
    node.className=className;
    node.textContent=text;
    return node;
  };
  const element=make('section','control-section cross-device-compat-report','');
  element.setAttribute('aria-label','Web→iPad Recipe互換性の参考診断');
  const heading=make('h3','','Web→iPad Recipe互換性');
  const note=make('p','control-help','保存済みRecipeのdata-only参考診断です。認証、転送、iPadでの描画・画質・実機動作は未検証です。');
  const status=make('p','control-help','保存済みの写真を選択すると参考診断を表示します。');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const list=make('ul','cross-device-compat-findings','');
  list.setAttribute('aria-label','Recipe項目ごとの互換性評価');
  element.append(heading,note,status,list);
  let disposed=false;
  let importGeneration=0,imported=null;
  const importBox=make('details','','');
  importBox.append(make('summary','','Apple保存JSONを読み込む（原文保持・対応編集の復元）'));
  const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Apple Recipeまたは旧ProjectCheckpoint JSON');
  const importedStatus=make('p','control-help','ファイルを選ぶと全履歴を読みます。現在の写真・編集・保存版には適用しません。');
  const download=make('button','quiet-button','読み込んだ原文JSONを保存');download.type='button';download.disabled=true;
  const restoreSession=restoreHost?createAppleDocumentRestoreSession(restoreHost):null;
  const restore=make('button','quiet-button','対応する編集を現在の写真へ追加');restore.type='button';restore.disabled=true;
  const consent=document.createElement('input');consent.type='checkbox';
  const consentLabel=make('label','control-help','この写真への編集権限があり、対応範囲の編集を追加します。保存は通常の保存操作で行います。');consentLabel.prepend(consent);
  const restoreNote=make('p','control-help','復元対象は中立設定と90度単位の回転のみ。局所補正・背景・変形・色変更などが含まれる場合は削除せず復元を拒否します。元JSONの全履歴は原文保存から保持できます。');
  function refreshRestore(){restore.disabled=true;if(!restoreSession||!imported||!consent.checked)return;try{prepareAppleDocumentRestore(imported.originalJSON);restore.disabled=false;}catch{}}
  consent.addEventListener('change',()=>{restoreSession?.cancel();refreshRestore();});
  restore.addEventListener('click',async()=>{
    if(restore.disabled||!imported)return;
    const generation=importGeneration;restore.disabled=true;
    try{await restoreSession.restore(imported.originalJSON);if(!disposed&&generation===importGeneration)importedStatus.textContent='対応編集をUndo履歴へ追加しました。原本と読み込んだ全履歴JSONは変更していません。サーバーへの保存は通常の保存操作で行ってください。';}
    catch(error){if(!disposed&&generation===importGeneration)importedStatus.textContent=error?.name==='AbortError'?'写真・権限・設定の変更により復元を取り消しました。':'この編集は復元できません。未対応処理を削除して適用することはありません。';}
    finally{refreshRestore();}
  });
  importBox.append(consentLabel,restore,restoreNote);
  importBox.append(file,importedStatus,download);element.append(importBox);
  const backdropPreview=createLocalBackdropPreviewUI({document,backdropHost});importBox.append(backdropPreview.element);
  file.addEventListener('change',async()=>{
    const generation=++importGeneration;restoreSession?.cancel();consent.checked=false;imported=null;download.disabled=true;refreshRestore();backdropPreview.setImported(null);
    const selected=file.files?.[0];if(!selected)return;
    importedStatus.textContent='読み込み中';
    try{
      if(selected.size>2_000_000)throw Error('SIZE');
      const text=await selected.text();if(disposed||generation!==importGeneration)return;
      imported=readAppleLocalEditJSON(text,{preflight:preflightCrossDeviceCapabilities});
      backdropPreview.setImported(imported);
      const unsupported=imported.reports.filter(report=>report.assessment==='unsupported').length;
      importedStatus.textContent=`${imported.historyCount}件の履歴を保持して読込。非対応 ${unsupported}件。読込だけでは適用しません。中立設定と90度回転のみ上の明示操作で復元できます。局所補正・背景・変形は下の専用非保存見本で確認し、通常編集への復元は未対応です。`;
      download.disabled=false;
    }catch{if(!disposed&&generation===importGeneration){imported=null;importedStatus.textContent='未知版・不正形式・容量超過のため読み込めません。元ファイルと現在の編集は変更していません。';}}
  });
  download.addEventListener('click',()=>{
    if(disposed||!imported)return;
    const url=URL.createObjectURL(new Blob([imported.originalJSON],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='suite-apple-preserved.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function clear(message='保存済みの写真を選択すると参考診断を表示します。') {
    list.replaceChildren();
    status.textContent=message;
    element.removeAttribute('data-asset-id');
    element.removeAttribute('data-revision');
    return null;
  }
  function update(state) {
    if(disposed)return null;
    if(state?.blocked||state?.dirty||state?.busy||state?.exporting||state?.pending)backdropPreview.cancel();
    if(state?.blocked)return clear('権限が失効したため参考診断を破棄しました。');
    if(state?.dirty)return clear('未保存の変更があります。保存済みRecipeの参考診断は表示しません。');
    if(state?.busy||state?.exporting||state?.pending)return clear('処理中のため参考診断を表示しません。');
    const asset=state?.asset,revision=state?.revision;
    if(!asset||!UUID.test(asset.id)||!SHA256.test(asset.sha256)||
        !Number.isSafeInteger(revision)||revision<1||!state.recipe)
      return clear();
    const matches=Array.isArray(state.assets)?state.assets.filter(item=>item?.id===asset.id):[];
    if(matches.length!==1||typeof matches[0].sha256!=='string'||
        matches[0].sha256.toLowerCase()!==asset.sha256.toLowerCase())
      return clear('選択写真と現在のライブラリが一致しません。参考診断を破棄しました。');
    let report;
    try {report=preflightCrossDeviceCapabilities({direction:'web-to-apple',kind:'recipe',record:state.recipe});}
    catch {return clear('このRecipeはdata-only互換性判定の対象外です。転送可とは扱いません。');}
    // The preflight is synchronous. Replace every row on each state publication,
    // so a different selection, revision, or body cannot retain old findings.
    list.replaceChildren();
    const rows=[...report.stages.map(row=>({kind:'処理',...row})),
      ...report.extensions.map(row=>({kind:'拡張',...row})),
      {kind:'処理順序',name:'processingOrder',assessment:report.order.assessment}];
    for(const row of rows){
      const item=make('li','cross-device-compat-finding',`${row.kind} · ${row.name}: ${ASSESSMENT[row.assessment]}`);
      item.setAttribute('data-assessment',row.assessment);
      list.append(item);
    }
    element.setAttribute('data-asset-id',asset.id);
    element.setAttribute('data-revision',String(revision));
    status.textContent=`保存済みRecipe r${revision} · data-only総合: ${ASSESSMENT[report.assessment]}。認証・転送・iPad描画は未検証。`;
    return Object.freeze({assetId:asset.id,originalSHA256:asset.sha256,revision,
      assessment:report.assessment,operationAllowed:false});
  }
  function destroy(){disposed=true;importGeneration++;imported=null;restoreSession?.dispose();backdropPreview.dispose();clear('');element.remove();}
  return Object.freeze({element,update,clear,destroy});
}
