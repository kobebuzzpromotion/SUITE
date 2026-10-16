function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['kind','intensity'].includes(k))||
    !['standard','black-and-white'].includes(input.kind)||!Number.isFinite(input.intensity)||input.intensity<0||input.intensity>1)throw Error('PROFILE_PANEL_SETTINGS');
  return {kind:input.kind,intensity:input.intensity};
}

/** Display-referred standard/B&W draft only. The session owns Recipe mutation. */
export function mountWebConnectedProfile(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('PROFILE_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','プロファイル');
  root.append(el('h3','プロファイル'),el('p','現像後のSUITE標準／白黒プロファイルです。RAWカメラプロファイル、ICC、LUTはこのパネルの対象外です。標準は色を変更しません。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','種類と強度'));
  const kindLabel=el('label','種類'),kind=el('select');
  for(const [value,title] of [['standard','標準'],['black-and-white','白黒']]){const option=el('option',title);option.value=value;kind.append(option);}kindLabel.append(kind);fields.append(kindLabel);
  const intensityLabel=el('label','強度（0〜1）'),intensity=el('input');intensity.type='number';intensity.min='0';intensity.max='1';intensity.step='0.01';intensity.required=true;intensity.value='1';intensityLabel.append(intensity);fields.append(intensityLabel);
  const apply=el('button','適用');apply.type='submit';const reset=el('button','プロファイルをリセット');reset.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setColorProfile==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved;kind.disabled=intensity.disabled=!validSaved;root.setAttribute('aria-busy',String(pending));}
  function synchronize(value){
    if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;
      try{const p=validate(value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.profile??{kind:'standard',intensity:1});kind.value=p.kind;intensity.value=String(p.intensity);dirty=false;validSaved=true;status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';}
      catch{validSaved=false;const saved=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.profile;status.textContent=saved?.kind==='local-lut'?'ローカルLUTを選択中です。強度はLUTパネルで調整してください。標準・白黒へ切り替える場合は、まず明示リセットしてください。':'保存済みプロファイルはこのパネルで編集できません。自動置換はしません。明示リセットは可能です。';}
    }controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の入力があります。';});
  kind.addEventListener('change',()=>{dirty=true;status.textContent='未適用の入力があります。';});
  async function commit(clear){
    if(disposed||pending||!permitted()||!clear&&!validSaved)return;
    let settings=null;if(!clear){try{if(intensity.value.trim()==='')throw Error('PROFILE_INTENSITY_REQUIRED');settings=validate({kind:kind.value,intensity:Number(intensity.value)});}catch{status.textContent='強度に0〜1の数値を入力してください。';intensity.focus();return;}}
    pending=true;const assetID=current.asset.id;controls();
    try{await session.setColorProfile(settings);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'プロファイルをリセットしました。Recipeの保存は既存の保存操作で行ってください。':'適用しました。Recipeの保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態・現在のRecipeを確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
