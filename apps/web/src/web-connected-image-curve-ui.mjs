/** Image-targeted existing point curves, not a second curve renderer. */
export function mountWebConnectedImageCurve(container,{session,canUse=()=>false,afterImage}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function'||!afterImage?.addEventListener)throw Error('IMAGE_CURVE_PANEL_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','画像上のカーブ調整');root.append(el('h3','画像上のカーブ調整'),el('p','After画像の値を選び、既存のポイントカーブを調整します。この操作は最大16点です。既存17点以上のカーブは切り捨てず採取を拒否します。'));
  const fields=el('fieldset');fields.append(el('legend','画像からカーブ位置を選択'));
  const channelLabel=el('label','チャンネル'),channel=el('select');for(const [value,title] of [['master','全体'],['red','赤'],['green','緑'],['blue','青']]){const option=el('option',title);option.value=value;channel.append(option);}channelLabel.append(channel);fields.append(channelLabel);
  const toggle=el('button','カーブ採取モードをON');toggle.type='button';toggle.setAttribute('aria-pressed','false');fields.append(toggle);
  const sampleText=el('p','未選択');sampleText.setAttribute('aria-live','polite');fields.append(sampleText);
  const deltaLabel=el('label','変更量（−255〜255）'),delta=el('input');delta.type='number';delta.min='-255';delta.max='255';delta.step='1';delta.value='0';deltaLabel.append(delta);fields.append(deltaLabel);
  const apply=el('button','カーブに適用');apply.type='button';fields.append(apply);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,status);container.append(root);
  let current=null,signature=null,mode=false,sampled=false,pending=false,disposed=false,generation=0;
  function permitted(){try{return Boolean(current?.asset&&current?.afterURL)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.sampleCurveAt==='function'&&typeof session.applySampledCurve==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!sampled;toggle.textContent=mode?'カーブ採取モードをOFF':'カーブ採取モードをON';toggle.setAttribute('aria-pressed',String(mode));root.setAttribute('aria-busy',String(pending));}
  function invalidate(){generation++;sampled=false;mode=false;sampleText.textContent='未選択';delta.value='0';}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.afterURL??null]);if(next!==signature){const had=mode||sampled;signature=next;invalidate();if(had)status.textContent='画像またはRecipeが変わったため、選択を無効にしました。';}if(!permitted())mode=false;controls();}
  function coordinates(event){
    const view=document.defaultView,style=view?.getComputedStyle(afterImage),rect=afterImage.getBoundingClientRect(),nw=afterImage.naturalWidth,nh=afterImage.naturalHeight;
    if(!style||!afterImage.complete||!nw||!nh||rect.width<=0||rect.height<=0||style.objectFit!=='contain'||!['50% 50%','center center','center'].includes(style.objectPosition))throw Error('IMAGE_CURVE_GEOMETRY');
    for(let node=afterImage;node;node=node.parentElement){const css=view.getComputedStyle(node);if(css.transform!=='none'||css.zoom&&!['1','normal'].includes(css.zoom))throw Error('IMAGE_CURVE_GEOMETRY');}
    const px=key=>{const v=parseFloat(style[key]);return Number.isFinite(v)?v:0;};
    const left=px('borderLeftWidth')+px('paddingLeft'),right=px('borderRightWidth')+px('paddingRight'),top=px('borderTopWidth')+px('paddingTop'),bottom=px('borderBottomWidth')+px('paddingBottom');
    const width=rect.width-left-right,height=rect.height-top-bottom;if(width<=0||height<=0)throw Error('IMAGE_CURVE_GEOMETRY');
    const scale=Math.min(width/nw,height/nh),dw=nw*scale,dh=nh*scale,x=(event.clientX-rect.left-left-(width-dw)/2)/dw,y=(event.clientY-rect.top-top-(height-dh)/2)/dh;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1||y<0||y>=1)throw Error('IMAGE_CURVE_LETTERBOX');return {x,y};
  }
  const pickerEvent=event=>{if(event.detail!=='curve'){invalidate();controls();}};
  afterImage.addEventListener('suite-image-picker-mode',pickerEvent);
  toggle.addEventListener('click',()=>{
    if(disposed||pending||!permitted())return;mode=!mode;
    if(mode){const EventClass=document.defaultView?.CustomEvent??globalThis.CustomEvent;afterImage.dispatchEvent(new EventClass('suite-image-picker-mode',{detail:'curve'}));}
    status.textContent=mode?'After画像内をクリックしてください。':'カーブ採取モードを終了しました。';controls();
  });
  channel.addEventListener('change',()=>{invalidate();status.textContent='チャンネルを変更しました。再度採取してください。';controls();});
  const capture=async event=>{
    if(disposed||!mode)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(pending||!permitted())return;
    let point;try{point=coordinates(event);}catch{status.textContent='画像の余白、または未対応の表示配置です。中央配置のAfter画像内を選択してください。';return;}
    const token=generation,selectedChannel=channel.value;pending=true;sampled=false;controls();
    try{const result=await session.sampleCurveAt({...point,channel:selectedChannel});if(disposed||token!==generation)return;
      if(!result||result.channel!==selectedChannel||!Number.isFinite(result.input)||result.input<0||result.input>255)throw Error('IMAGE_CURVE_SAMPLE_INVALID');
      sampled=true;sampleText.textContent=`${result.channel} ／ 入力値 ${result.input}`;status.textContent='変更量を入力して適用してください。';
    }catch{if(!disposed&&token===generation){sampled=false;sampleText.textContent='未選択';status.textContent='採取できませんでした。カーブ点数（最大16点）・画像・権限を確認してください。';}}
    finally{pending=false;if(!disposed)controls();}
  };
  afterImage.addEventListener('click',capture,true);
  apply.addEventListener('click',async()=>{
    if(disposed||pending||!sampled||!permitted())return;const value=Number(delta.value);
    if(delta.value.trim()===''||!Number.isFinite(value)||value < -255||value>255){status.textContent='変更量に−255〜255を入力してください。';delta.focus();return;}
    pending=true;mode=false;const assetID=current.asset.id;controls();
    try{await session.applySampledCurve({delta:value});if(!disposed&&current?.asset?.id===assetID){invalidate();status.textContent='カーブに適用しました。次の調整は再採取してください。Recipe保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed){invalidate();status.textContent='適用できませんでした。再採取してからやり直してください。';}}
    finally{pending=false;if(!disposed)controls();}
  });
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;generation++;if(typeof unsubscribe==='function')unsubscribe();afterImage.removeEventListener('click',capture,true);afterImage.removeEventListener('suite-image-picker-mode',pickerEvent);root.remove();}});
}
