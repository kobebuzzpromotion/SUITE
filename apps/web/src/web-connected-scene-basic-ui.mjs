const FIELDS=[['brightness','明るさ'],['dehaze','かすみ除去']];
function validate(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!FIELDS.some(([field])=>field===key)))throw Error('SCENE_BASIC_PANEL_FIELDS');
  return Object.fromEntries(FIELDS.map(([key])=>{const value=input[key]??0;if(!Number.isFinite(value)||value < -100||value>100)throw Error('SCENE_BASIC_PANEL_RANGE');return [key,value];}));
}

/** Explicit display-referred edit draft; no RAW recovery or direct Recipe save. */
export function mountWebConnectedSceneBasic(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('SCENE_BASIC_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','明るさ・かすみ除去');
  root.append(el('h3','明るさ・かすみ除去'),el('p','Exposureとは別の、現像後の表示用補正です。RAWの白飛び・黒つぶれなど失われた情報を復元する処理ではありません。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','表示用補正（−100〜100）'));
  const inputs=new Map();
  for(const [key,title] of FIELDS){const label=el('label',title),input=el('input');input.type='number';input.min='-100';input.max='100';input.step='1';input.required=true;input.value='0';label.append(input);fields.append(label);inputs.set(key,input);}
  const apply=el('button','適用');apply.type='submit';const reset=el('button','明るさ・かすみ除去をリセット');reset.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setSceneBasic==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved;for(const input of inputs.values())input.disabled=!validSaved;root.setAttribute('aria-busy',String(pending));}
  function synchronize(value){
    if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;
      try{const settings=validate(value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.sceneBasic??{});for(const [key,input] of inputs)input.value=String(settings[key]);dirty=false;validSaved=true;status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';}
      catch{validSaved=false;status.textContent='保存済み設定を解釈できません。自動置換はしません。明示リセットは可能です。';}
    }controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の入力があります。';});
  async function commit(clear){
    if(disposed||pending||!permitted()||!clear&&!validSaved)return;
    let settings=null;if(!clear){try{const values={};for(const [key,input] of inputs){if(input.value.trim()===''){input.focus();throw Error('SCENE_BASIC_VALUE_REQUIRED');}values[key]=Number(input.value);}settings=validate(values);}catch{status.textContent='各項目に−100〜100の数値を入力してください。';return;}}
    pending=true;const assetID=current.asset.id;controls();
    try{await session.setSceneBasic(settings);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'表示用補正をリセットしました。Exposureは変更していません。':'適用しました。Recipeの保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態・現在のRecipeを確認してください。';}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
