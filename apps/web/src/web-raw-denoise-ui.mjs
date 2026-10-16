import {validateWebRawDenoise} from './processing/web-raw-denoise.mjs';

const defaults=()=>({schemaVersion:1,engineVersion:'suite-web-raw-denoise-1',strength:.5,radius:1,sigma:.015});
const settingsOf=state=>state?.recipe?.parameters?.extendedParameters?.webRawDenoise;
const signature=state=>JSON.stringify([state?.asset?.id,state?.asset?.sha256,state?.revision,state?.recipe]);

/** Numeric draft only. Session verifies actual RAW bytes, runtime and budget. */
export function mountWebRawDenoise(container,{session,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('RAW_DENOISE_PANEL_CONFIG');
  const el=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
  const root=el('section');root.setAttribute('aria-label','非AI RAWノイズ除去');
  root.append(el('h3','非AI RAWノイズ除去'),el('p','デモザイク後の線形RGB16へ適用するRAW専用処理です。縮小Proxyだけに処理する機能ではなく、原寸で処理してからProxyを作成します。元のRAWは変更しません。AIモデル・HDR出力・大判処理は対象外です。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','未適用の数値設定'));
  function number(label,min,max,step,value){const wrapper=el('label',label),input=el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.required=true;wrapper.append(input);fields.append(wrapper);return input;}
  const strength=number('強度（0〜1） ',0,1,.05,.5),radius=number('半径（1〜4の整数、原寸画素） ',1,4,1,1),sigma=number('ノイズ尺度 sigma（線形信号、ISO値ではありません） ',1/65535,.25,'any',.015);
  const apply=el('button','このRAWノイズ除去設定を適用');apply.type='submit';fields.append(apply);
  const clear=el('button','RAWノイズ除去を解除');clear.type='button';
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(fields,clear,status);root.append(form,el('p','実処理画像24MP以下でも演算量・メモリ予算を超える場合は拒否します。半径を大きくすると処理時間と負荷が増えます。適用・解除時は原本の取得と再現像で時間がかかる場合があります。失敗時は旧編集を保持し、成功後も通常のRecipe保存が必要です。数値入力だけでは処理しません。'));container.append(root);
  let state=null,key=null,accessKey=null,selectionKey=null,selectionEpoch=0,dirty=false,validSaved=true,pending=false,disposed=false;
  function allowed(){try{return !disposed&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebRawDenoise==='function';}catch{return false;}}
  function controls(){fields.disabled=pending||!allowed()||!validSaved;clear.disabled=pending||!allowed()||settingsOf(state)===undefined;root.setAttribute('aria-busy',String(pending));}
  function fill(value){strength.value=String(value.strength);radius.value=String(value.radius);sigma.value=String(value.sigma);}
  function synchronize(value){
    if(disposed)return;state=value;
    const nextSelection=JSON.stringify([value?.asset?.id,value?.asset?.sha256]);
    if(nextSelection!==selectionKey){selectionKey=nextSelection;selectionEpoch++;}
    const next=signature(value),permitted=allowed();
    if(next!==key||permitted!==accessKey){
      const lost=dirty;key=next;accessKey=permitted;dirty=false;
      try{const stored=settingsOf(value)??defaults();validateWebRawDenoise(stored);fill(stored);validSaved=true;
        status.textContent=pending?'RAWを再処理中です。完了までお待ちください。':lost?'写真・Recipe・利用状態が変わったため、未適用の入力を破棄しました。':settingsOf(value)?'現在のRecipeにRAWノイズ除去設定があります。':'RAWノイズ除去は未設定です。実RAWの対応可否は適用時に確認します。';
      }catch{validSaved=false;status.textContent='保存済み設定をこのパネルで解釈できません。自動置換はしません。明示解除は可能です。';}
    }controls();
  }
  function fresh(){const value=session.state??state;if(signature(value)!==key){synchronize(value);throw Error('写真またはRecipeが変わりました。設定を確認してください。');}state=value;if(!allowed()||pending||disposed)throw Error('現在はRAWノイズ除去設定を変更できません。');}
  function read(){
    for(const input of [strength,radius,sigma])if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw Error('すべての値を有限の数値で指定してください。');
    const value={...defaults(),strength:Number(strength.value),radius:Number(radius.value),sigma:Number(sigma.value)};validateWebRawDenoise(value);return value;
  }
  form.addEventListener('input',()=>{if(disposed||pending||!allowed()||!validSaved)return;dirty=true;status.textContent='未適用の入力です。適用ボタンを押すまで画像・Recipeは変更しません。';});
  async function commit(remove){
    if(disposed||pending)return;let epoch,value;
    try{
      fresh();if(!remove&&!validSaved)throw Error('保存済み設定を確認できません。');value=remove?null:read();epoch=selectionEpoch;
      pending=true;controls();status.textContent='原寸RAWを再処理中です。完了までお待ちください。';
      await session.setWebRawDenoise(value);
      if(!disposed&&epoch===selectionEpoch){
        const current=session.state??state;state=current;
        if(allowed()&&JSON.stringify(settingsOf(current)??null)===JSON.stringify(value)){
          key=null;synchronize(current);status.textContent=remove?'RAWノイズ除去を解除しました。Recipeを保存してください。':'RAWノイズ除去設定を適用しました。Recipeを保存してください。';
        }
      }
    }catch(error){if(!disposed&&(epoch===undefined||epoch===selectionEpoch))status.textContent=`変更できませんでした。実RAW・権限・画素数・演算予算を確認してください。${String(error?.message??error).slice(0,180)}`;}
    finally{pending=false;if(!disposed)controls();}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});clear.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??state);},dispose(){if(disposed)return;disposed=true;selectionEpoch++;unsubscribe?.();root.remove();}});
}
