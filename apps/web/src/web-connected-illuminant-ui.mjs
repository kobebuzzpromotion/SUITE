const MODES=[['daylight','日光'],['cloudy','曇天'],['shade','日陰'],['tungsten','電球'],['fluorescent','蛍光灯'],['flash','フラッシュ']];

/** Display-referred illuminant draft. Recipe mutation belongs to the session. */
export function mountWebConnectedIlluminant(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('ILLUMINANT_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','固定照明ホワイトバランス');
  root.append(el('h3','固定照明ホワイトバランス'),el('p','現像後の表示用近似であり、RAWのカメラホワイトバランスではありません。色温度・色かぶりは後段の微調整として維持します。'));
  const form=el('form'),fields=el('fieldset');fields.append(el('legend','照明条件'));
  const label=el('label','照明'),select=el('select');
  const empty=el('option','未設定（照明を選択してください）');empty.value='';select.append(empty);
  for(const [value,title] of MODES){const option=el('option',title);option.value=value;select.append(option);}label.append(select);fields.append(label);
  const apply=el('button','適用');apply.type='submit';const reset=el('button','固定照明をリセット');reset.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true;
  const validMode=value=>MODES.some(([mode])=>mode===value);
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setIlluminant==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();select.disabled=!validSaved;apply.disabled=!validSaved||!validMode(select.value);root.setAttribute('aria-busy',String(pending));}
  function synchronize(value){
    if(disposed)return;current=value;
    const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;dirty=false;
      const color=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color;
      const present=Boolean(color&&Object.hasOwn(color,'illuminant')),saved=color?.illuminant;
      validSaved=!present||validMode(saved);select.value=validSaved&&present?saved:'';
      status.textContent=!validSaved?'保存済み照明を解釈できません。自動置換はしません。明示リセットは可能です。':lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';
    }controls();
  }
  select.addEventListener('change',()=>{dirty=true;status.textContent='未適用の入力があります。';controls();});
  async function commit(clear){
    if(disposed||pending||!permitted()||(!clear&&(!validSaved||!validMode(select.value))))return;
    const mode=clear?null:select.value,assetID=current.asset.id;pending=true;controls();
    try{await session.setIlluminant(mode);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'固定照明をリセットしました。色温度・色かぶりは維持しています。':'適用しました。Recipeの保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態・現在のRecipeを確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
