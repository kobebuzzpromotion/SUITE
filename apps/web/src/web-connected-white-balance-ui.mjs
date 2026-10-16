/** The sampling image must be the unedited upright Proxy (Before), never After.
 * pickerEventTarget is the shared After picker event hub, not a sample source. */
export function mountWebConnectedWhiteBalance(container,{session,beforeImage,pickerEventTarget=beforeImage,canUse=()=>false}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function'||!beforeImage?.addEventListener||!pickerEventTarget?.addEventListener)throw Error('WHITE_BALANCE_PANEL_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','Auto・灰色点ホワイトバランス');
  root.append(el('h3','Auto・灰色点ホワイトバランス'),el('p','未編集のBefore（Proxy）から推定します。灰色点はBefore表示に切り替え、実際に無彩色と分かる部分を指定してください。表示用の近似で、RAWカメラWBや色温度の測定ではありません。結果を確認して明示適用します。'));
  const fields=el('fieldset');fields.append(el('legend','推定と適用'));
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const auto=button('Autoを推定'),picker=button('灰色点モードをON'),apply=button('推定結果を適用'),reset=button('推定WBをリセット');
  const resultText=el('p','未推定'),savedText=el('p'),status=el('p');resultText.setAttribute('aria-live','polite');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,resultText,savedText,status);container.append(root);
  let current=null,signature=null,proposal=null,mode=false,pending=false,disposed=false,generation=0;
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true;}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();auto.disabled=typeof session.proposeWhiteBalance!=='function';picker.disabled=auto.disabled||!current?.beforeURL;apply.disabled=!proposal||typeof session.applyProposedWhiteBalance!=='function';reset.disabled=typeof session.resetWhiteBalance!=='function';if(!permitted())mode=false;picker.textContent=mode?'灰色点モードをOFF':'灰色点モードをON';picker.setAttribute('aria-pressed',String(mode));root.setAttribute('aria-busy',String(pending));}
  function gainsText(value){const gains=value?.gains;if(!Array.isArray(gains)||gains.length!==3||gains.some(n=>!Number.isFinite(n)||n<.25||n>4))throw Error('WHITE_BALANCE_GAINS');return `R ${gains[0].toFixed(3)} / G ${gains[1].toFixed(3)} / B ${gains[2].toFixed(3)}`;}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.beforeURL??null,value?.afterURL??null]);
    if(next!==signature){const lost=Boolean(proposal)||mode;signature=next;generation++;proposal=null;mode=false;resultText.textContent='未推定';status.textContent=lost?'画像またはRecipeが変わったため、未適用の推定を破棄しました。':'';
      const saved=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.whiteBalance;
      try{savedText.textContent=saved?`現在の固定ゲイン：${gainsText(saved)}`:'推定WBは未設定です。';}catch{savedText.textContent='保存済み推定WBはこの画面で表示できません。自動置換はしません。';}
    }controls();
  }
  function coordinates(event){const view=document.defaultView,style=view?.getComputedStyle(beforeImage),rect=beforeImage.getBoundingClientRect(),nw=beforeImage.naturalWidth,nh=beforeImage.naturalHeight;
    if(!style||!beforeImage.complete||!nw||!nh||rect.width<=0||rect.height<=0||style.objectFit!=='contain'||!['50% 50%','center center','center'].includes(style.objectPosition))throw Error('WHITE_BALANCE_GEOMETRY');
    for(let n=beforeImage;n;n=n.parentElement){const css=view.getComputedStyle(n);if(css.transform!=='none'||css.zoom&&!['1','normal'].includes(css.zoom))throw Error('WHITE_BALANCE_GEOMETRY');}
    const px=name=>parseFloat(style[name])||0,left=px('borderLeftWidth')+px('paddingLeft'),top=px('borderTopWidth')+px('paddingTop'),w=rect.width-left-px('borderRightWidth')-px('paddingRight'),h=rect.height-top-px('borderBottomWidth')-px('paddingBottom');
    if(w<=0||h<=0)throw Error('WHITE_BALANCE_GEOMETRY');const scale=Math.min(w/nw,h/nh),dw=nw*scale,dh=nh*scale,x=(event.clientX-rect.left-left-(w-dw)/2)/dw,y=(event.clientY-rect.top-top-(h-dh)/2)/dh;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1||y<0||y>=1)throw Error('WHITE_BALANCE_LETTERBOX');return {x,y};
  }
  async function estimate(options){if(disposed||pending||!permitted()||typeof session.proposeWhiteBalance!=='function')return;const token=generation;pending=true;proposal=null;resultText.textContent='推定中…';controls();
    try{const value=await session.proposeWhiteBalance(options);if(disposed||token!==generation)return;if(!value?.binding||value.whiteBalance?.domain!=='linear-rec709')throw Error('WHITE_BALANCE_PROPOSAL');const label=gainsText(value.whiteBalance);proposal=value;resultText.textContent=`推定ゲイン：${label}`;status.textContent='未適用です。結果を確認して適用してください。';}
    catch{if(!disposed&&token===generation){proposal=null;resultText.textContent='未推定';status.textContent='推定できませんでした。Before画像・選択位置・処理状態を確認してください。';}}finally{pending=false;if(!disposed)controls();}
  }
  const modeEvent=event=>{if(event.detail!=='white-balance'){mode=false;generation++;controls();}};
  pickerEventTarget.addEventListener('suite-image-picker-mode',modeEvent);
  picker.addEventListener('click',()=>{if(disposed||pending||!permitted()||picker.disabled)return;mode=!mode;if(mode)pickerEventTarget.dispatchEvent(new document.defaultView.CustomEvent('suite-image-picker-mode',{detail:'white-balance'}));status.textContent=mode?'未編集のBefore画像で灰色点を指定してください。':'灰色点モードを終了しました。';controls();});
  auto.addEventListener('click',()=>{mode=false;void estimate({mode:'auto'});});
  const sampleClick=event=>{if(disposed||!mode)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(pending||!permitted())return;try{void estimate({mode:'selector',...coordinates(event),radius:2});}catch{status.textContent='Before画像の余白ではなく、中央配置された画像内を指定してください。';}};
  beforeImage.addEventListener('click',sampleClick,true);
  async function commit(clear){if(disposed||pending||!permitted()||!clear&&!proposal)return;const assetID=current.asset.id,value=proposal;pending=true;mode=false;controls();
    try{if(clear)await session.resetWhiteBalance();else await session.applyProposedWhiteBalance(value);if(!disposed&&current?.asset?.id===assetID){proposal=null;resultText.textContent='未推定';status.textContent=clear?'推定WBをリセットしました。':'推定WBを適用しました。Recipeの保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed){proposal=null;resultText.textContent='未推定';status.textContent='適用できませんでした。再推定してからやり直してください。';}}finally{pending=false;if(!disposed)controls();}
  }
  apply.addEventListener('click',()=>{void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;generation++;if(typeof unsubscribe==='function')unsubscribe();beforeImage.removeEventListener('click',sampleClick,true);pickerEventTarget.removeEventListener('suite-image-picker-mode',modeEvent);root.remove();}});
}
