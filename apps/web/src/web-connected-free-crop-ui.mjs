const FIELDS=[['x','左位置',0],['y','上位置',0],['width','幅',1],['height','高さ',1]];
function validate(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||FIELDS.some(([key])=>!Object.hasOwn(value,key)||!Number.isFinite(value[key])||value[key]<0||value[key]>1)||value.width<=0||value.height<=0||value.x+value.width>1||value.y+value.height>1)throw Error('FREE_CROP_RECTANGLE');
  return Object.fromEntries(FIELDS.map(([key])=>[key,value[key]]));
}

/** Numeric crop draft. Reading a fixed-ratio crop never replaces its metadata. */
export function mountWebConnectedFreeCrop(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('FREE_CROP_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','自由トリミング');root.append(el('h3','自由トリミング（数値指定）'),el('p','幾何補正・回転後、トリミング前の枠を左上原点で指定します。座標は0〜1の割合です。現在の矩形を表示するだけでは既存の比率設定は変わりません。「自由矩形を適用」で既存の切抜きを置き換えます。ドラッグ操作ではありません。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','切抜き矩形'));
  const inputs=new Map();for(const [key,title,value] of FIELDS){const label=el('label',title),input=el('input');input.type='number';input.min='0';input.max='1';input.step='.001';input.required=true;input.value=String(value);label.append(input);fields.append(label);inputs.set(key,input);}
  const apply=el('button','自由矩形を適用');apply.type='submit';const reset=el('button','切抜きを解除');reset.type='button';fields.append(apply,reset);
  const saved=el('p'),status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,saved,status);root.append(form);container.append(root);
  let current=null,signature=null,dirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setFreeCrop==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!validSaved;for(const input of inputs.values())input.disabled=!validSaved;root.setAttribute('aria-busy',String(pending));}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){const lost=dirty;signature=next;dirty=false;try{
      const extra=value?.recipe?.parameters?.extendedParameters,hasCrop=Boolean(extra&&Object.hasOwn(extra,'crop')),crop=extra?.crop;
      const rect=validate(hasCrop?crop?.crop_rect:{x:0,y:0,width:1,height:1});for(const [key,input] of inputs)input.value=String(rect[key]);validSaved=true;
      saved.textContent=hasCrop?`現在の切抜き：${String(crop.preset_name??crop.preset_id??'保存済み設定')}（表示のみでは変更しません）`:'現在は切抜きなしです。';
      status.textContent=lost?'写真またはRecipeが変わったため、未適用の矩形を破棄しました。':'';
    }catch{validSaved=false;saved.textContent='保存済み切抜き矩形を表示できません。';status.textContent='自動置換はしません。明示的な切抜き解除は可能です。';}}
    controls();
  }
  form.addEventListener('input',()=>{dirty=true;status.textContent='未適用の矩形があります。適用すると既存の切抜きを置き換えます。';});
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!validSaved)return;let rect=null;
    if(!clear){try{const draft={};for(const [key,input] of inputs){if(input.value.trim()===''){input.focus();throw Error('FREE_CROP_REQUIRED');}draft[key]=Number(input.value);}rect=validate(draft);}catch{status.textContent='0〜1の数値を入力し、幅・高さを0より大きく、右端・下端を1以下にしてください。';return;}}
    pending=true;const assetID=current.asset.id;controls();try{await session.setFreeCrop(rect);if(!disposed&&current?.asset?.id===assetID){signature=null;synchronize(session.state??current);status.textContent=clear?'切抜きを解除しました。幾何補正・回転は維持しています。':'自由矩形に置き換えました。Recipe保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed)status.textContent='適用できませんでした。矩形の大きさ・権限・処理状態を確認してください。';}finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();}});
}
