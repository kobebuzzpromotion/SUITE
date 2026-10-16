const BANDS=[['shadows','暗部'],['darks','暗い中間部'],['lights','明るい中間部'],['highlights','明部']];
function validated(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!BANDS.some(([name])=>name===k)))throw Error('TONAL_BANDS_FIELDS');
  return Object.fromEntries(BANDS.map(([key])=>{const value=input[key]??0;if(!Number.isFinite(value)||value < -100||value>100)throw Error('TONAL_BANDS_RANGE');return [key,value];}));
}

/** Four-band explicit edit draft. Never silently replaces the legacy three-band
 * color.toneCurve; only the host session mutates the current Recipe. */
export function mountWebConnectedTonalBands(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('TONAL_BANDS_PANEL_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','4帯域カーブ');root.append(el('h3','4帯域カーブ'),el('p','SUITE独自の4明暗帯調整です。適用後のRecipe保存は既存の保存操作で行ってください。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','帯域ごとの調整（−100〜100）'));
  const inputs=new Map();for(const [key,title] of BANDS){const label=el('label',title),input=el('input');input.type='number';input.min='-100';input.max='100';input.step='1';input.required=true;input.value='0';label.append(input);fields.append(label);inputs.set(key,input);}
  const apply=el('button','適用');apply.type='submit';const reset=el('button','4帯域だけをリセット');reset.type='button';fields.append(apply,reset);
  const conflict=el('p');conflict.setAttribute('role','status');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(fields,conflict,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true,legacyActive=false;
  const color=()=>current?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setTonalBands==='function';}catch{return false;}}
  function controls(){
    fields.disabled=disposed||pending||!permitted();apply.disabled=legacyActive||!validSaved;
    for(const input of inputs.values())input.disabled=!validSaved;
    conflict.textContent=legacyActive?'旧3帯域カーブをリセットしてから使用してください。旧値は自動削除しません。4帯域だけのリセットは可能です。':'';
    root.setAttribute('aria-busy',String(pending));
  }
  function fill(value){for(const [key,input] of inputs)input.value=String(value[key]);dirty=false;}
  function synchronize(value){
    if(disposed)return;current=value;
    // Unknown/malformed legacy values are also non-neutral: fail closed.
    const legacy=color()?.toneCurve;
    legacyActive=legacy!==undefined&&(legacy===null||typeof legacy!=='object'||Array.isArray(legacy)||Object.values(legacy).some(v=>v!==0));
    const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;try{fill(validated(color()?.tonalBands??{}));validSaved=true;status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';}catch{validSaved=false;status.textContent='保存済み4帯域設定を解釈できません。適用は停止しています。';}}
    controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の入力があります。';});
  async function commit(clear){
    if(disposed||pending||!permitted())return;
    if(!clear&&(legacyActive||!validSaved)){controls();return;}
    let value=null;if(!clear){try{
      const draft={};for(const [key,input] of inputs){if(input.value.trim()===''){input.focus();throw Error('TONAL_BANDS_REQUIRED');}draft[key]=Number(input.value);}
      value=validated(draft);
    }catch{status.textContent='各帯域に−100〜100の数値を入力してください。';return;}}
    pending=true;const assetID=current.asset.id;controls();
    try{await session.setTonalBands(value);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'4帯域をリセットしました。旧3帯域は変更していません。':'4帯域を適用しました。Recipeの保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。旧3帯域・権限・処理状態を確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
