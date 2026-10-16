import {validateColorGrading} from './processing/lr-color-grading.mjs';

/** Explicit draft -> session mutation; this panel never writes a Recipe itself.
 * canUse(state) must return true synchronously (host permission + operation gate).
 * An external asset/revision/Recipe change discards un-applied input with notice.
 */
export function mountWebConnectedGrading(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')
    throw Error('GRADING_PANEL_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','カラーグレーディング');
  root.append(el('h3','カラーグレーディング'),el('p','SUITE独自の色調整です。数値を変更して「適用」を押してください。Recipeの保存は既存の保存操作で行います。'));
  const form=el('form');form.noValidate=true;
  const fields=el('fieldset');fields.append(el('legend','全体と明暗帯のH / S / L'));
  const inputs=new Map();
  const wheels=[['global','全体'],['shadows','暗部'],['midtones','中間'],['highlights','明部']];
  function field(parent,key,title,min,max,step){
    const label=el('label',title),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.required=true;
    input.setAttribute('aria-label',title);label.append(input);parent.append(label);inputs.set(key,input);
    input.addEventListener('input',()=>{draftDirty=true;status.textContent='未適用の入力があります。';});
  }
  for(const [key,title] of wheels){
    const group=el('fieldset');group.append(el('legend',title));
    field(group,`${key}.hue`,`${title} 色相 H`,0,360,1);
    field(group,`${key}.saturation`,`${title} 彩度 S`,0,100,1);
    field(group,`${key}.luminance`,`${title} 輝度 L`,-100,100,1);
    fields.append(group);
  }
  field(fields,'blending','ブレンド',0,100,1);field(fields,'balance','明暗バランス',-100,100,1);field(fields,'amount','適用量',0,1,.01);
  const apply=el('button','適用');apply.type='submit';const reset=el('button','グレーディングをリセット');reset.type='button';fields.append(apply,reset);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,draftDirty=false,pending=false,disposed=false,validSaved=true;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setColorGrading==='function';}catch{return false;}}
  function state(){fields.disabled=disposed||pending||!validSaved||!permitted();root.setAttribute('aria-busy',String(pending));}
  function fill(settings){for(const [key,input] of inputs){const parts=key.split('.');input.value=String(parts.length===1?settings[key]:settings[parts[0]][parts[1]]);}draftDirty=false;}
  function synchronize(value){
    if(disposed)return;current=value;
    const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null]);
    if(next!==signature){
      const lost=draftDirty;signature=next;
      try{fill(validateColorGrading(value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.grading??{}));validSaved=true;
        status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄して現在の値へ戻しました。':'';
      }catch{validSaved=false;status.textContent='保存済みグレーディングを解釈できません。既存の保存内容は変更していません。';}
    }
    state();
  }
  function settings(){
    const value={};for(const [key,input] of inputs){
      if(input.value.trim()===''){input.focus();throw Error('GRADING_VALUE_REQUIRED');}
      const n=Number(input.value),parts=key.split('.');
      if(!Number.isFinite(n)||n<Number(input.min)||n>Number(input.max)){input.focus();throw Error('GRADING_VALUE_RANGE');}
      if(parts.length===1)value[key]=n;else{value[parts[0]]??={};value[parts[0]][parts[1]]=n;}
    }
    return validateColorGrading(value);
  }
  async function commit(clear){
    if(disposed||pending||!validSaved||!permitted())return;
    let value;try{value=clear?null:settings();}catch{status.textContent='入力範囲を確認してください。';return;}
    pending=true;const startingAsset=current.asset.id;state();
    try{
      await session.setColorGrading(value);
      if(!disposed&&current?.asset?.id===startingAsset){fill(validateColorGrading(current?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.grading??{}));status.textContent=clear?'グレーディングをリセットしました。保存は既存の保存操作で行ってください。':'適用しました。保存は既存の保存操作で行ってください。';}
    }catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態と現在のRecipeを確認してください。';}
    finally{pending=false;if(!disposed)state();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});
  reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({
    refresh(){if(!disposed)synchronize(session.state??current);},
    dispose(){if(disposed)return;disposed=true;if(typeof unsubscribe==='function')unsubscribe();root.remove();},
  });
}
