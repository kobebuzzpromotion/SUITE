import {resolveLocalAIRuntimeStatus} from './local-ai-runtime-status.mjs';
import {mountLocalFaceRuntimePanel} from './local-face-runtime-panel.mjs';

// Repeated catalog mounting replaces only this status section, never selections.
const mounts = new WeakMap();
export function mountLocalAIRuntimeStatus(document,root,{snapshotProvider,manualTargets=[],inputProvider,subscribeContext,hostAccess}={}) {
  mounts.get(root)?.dispose();
  let disposed=false, revision=0;
  const section=document.createElement('section');section.className='control-section';
  section.setAttribute('aria-label','ローカルAIの準備状態');
  const title=document.createElement('h3');title.textContent='ローカル人物照合AIの準備状態';
  const status=document.createElement('p');status.setAttribute('role','status');
  const content=document.createElement('div');
  const button=document.createElement('button');button.type='button';button.textContent='状態を更新';
  const note=document.createElement('p');note.textContent='コード・資産・接続・許諾を別々に表示します。自動ダウンロード・クラウド送信はしません。';
  section.append(title,status,content,button,note);
  const runtimePanel=document.createElement('div');
  section.append(runtimePanel);
  // Explicit local setup/analysis only. Without a photo provider, no inference
  // button is shown. This surface never mutates the editor's Recipe.
  const runtimeHandle=mountLocalFaceRuntimePanel(runtimePanel,{inputProvider,subscribeContext,hostAccess,
    onStateChange:()=>queueMicrotask(()=>{if(!disposed)void refresh();})});
  const anchor=root.querySelector('#save-section');
  if(anchor)anchor.before(section);else root.append(section);
  const flag=value=>value===true?'確認あり':value===false?'なし':'未確認';
  const permission=value=>value==='confirmed'?'確認記録あり':value==='denied'?'許可なし':'未確認';
  function render(result) {
    content.replaceChildren();
    const row=(label,value)=>{const p=document.createElement('p');p.textContent=`${label}：${value}`;content.append(p);};
    row('コード',flag(result.codePresent));
    row('端末対応',flag(result.device.operatingSystemSupported));
    row('作業メモリ予算',result.device.availableWorkingBytes===null?'未確認':`${result.device.availableWorkingBytes} bytes`);
    row('温度状態',result.device.thermal);
    row('runtime組込',flag(result.runtime.included));
    row('推論呼び出し接続',flag(result.runtime.connected));
    if(!result.models.length)row('必要モデル','一覧未確定・資産状態未確認');
    for(const model of result.models){
      row(`モデル ${model.modelID}`,`導入 ${flag(model.installed)} ／ SHA-256照合 ${flag(model.hashVerified)}`);
      row(`${model.modelID}の許諾`,`商用利用 ${permission(model.commercialUse)} ／ 再配布 ${permission(model.redistribution)}`);
    }
    row('推論結果','未確認（この一覧は推論を実行しません）');
    row('手動代替',result.manualFallback.available?'利用可能との報告あり':'導線未確認');
    for(const target of manualTargets){
      if(!/^[a-z0-9-]+$/.test(target.id)||!root.querySelector(`#${target.id}`))continue;
      const link=document.createElement('button');link.type='button';link.textContent=target.label;
      link.addEventListener('click',()=>{
        const destination=root.querySelector(`#${target.id}`);if(!destination)return;
        // Navigation only: never start a brush, alter a Recipe or bypass its guards.
        destination.scrollIntoView({block:'center'});destination.focus();
      });content.append(link);
    }
    row('自動クラウド切替','なし');
    row('利用費用',result.cost==='noPerUseCharge'?'従量料金なしとの報告あり':result.cost==='paidGeneration'?'有料生成は別操作':'未確認');
    const list=document.createElement('ul');
    for(const blocker of result.blockers){const li=document.createElement('li');li.textContent=(blocker.modelID?`${blocker.modelID}：`:'')+blocker.description;list.append(li);}
    content.append(list);
  }
  async function refresh(){
    const generation=++revision;button.disabled=true;
    status.textContent='状態を確認中';
    try{
      const connected=typeof snapshotProvider==='function';
      let input=connected?await snapshotProvider():{};
      if(disposed||generation!==revision)return;
      if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_STATUS');
      const actual=runtimeHandle.snapshot();
      if(['ready','running'].includes(actual.status)){
        // Only successful initialization is evidence of loaded/verified assets.
        // It does not establish redistribution rights, RAM or thermal evidence.
        input={...input,runtime:{...input.runtime,included:true,connected:true},
          models:{...input.models,...Object.fromEntries(['yunet','sface'].map(id=>
            [id,{...input.models?.[id],installed:true,hashVerified:true}]))}};
      }
      const result=resolveLocalAIRuntimeStatus(input);render(result);
      status.textContent=!connected?'状態取得元は未接続です。準備済みとは判定しません。':
        result.canRunLocally?'前提条件の確認報告あり。推論成功・配布承認は未確認です。':'未確認・不足項目があります。';
    }catch{
      if(disposed||generation!==revision)return;
      render(resolveLocalAIRuntimeStatus());status.textContent='状態を取得できません。以前の準備済み表示は引き継ぎません。';
    }finally{if(!disposed&&generation===revision)button.disabled=false;}
  }
  button.addEventListener('click',refresh);
  const handle={refresh,dispose(){disposed=true;revision++;runtimeHandle.dispose();button.removeEventListener('click',refresh);section.remove();}};
  mounts.set(root,handle);void refresh();return handle;
}
