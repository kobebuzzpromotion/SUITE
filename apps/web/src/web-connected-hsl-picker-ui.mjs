/** After-only manual sampler. The host supplies the actual displayed <img>, not
 * a Before/After wrapper; arbitrary CSS transforms/object-position are rejected.
 * Standard centered object-fit:contain excludes letterbox padding and borders.
 */
export function mountWebConnectedHSLPicker(container,{session,canUse=()=>false,afterImage}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function'||!afterImage?.addEventListener)throw Error('HSL_PICKER_CONFIG');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.setAttribute('aria-label','HSL採色');root.append(el('h3','HSL採色'),el('p','採色モード中にAfter画像をクリックしてください。余白は採色しません。標本色に近い既存8色HSL帯を調整します。ポイントカラーの独立範囲選択とは異なります。'));
  const fields=el('fieldset');fields.append(el('legend','After画像の標本色'));
  const toggle=el('button','採色モードをON');toggle.type='button';toggle.setAttribute('aria-pressed','false');fields.append(toggle);
  const sampleText=el('p','未採色');sampleText.setAttribute('aria-live','polite');fields.append(sampleText);
  const channelLabel=el('label','調整する項目'),channel=el('select');for(const [value,title] of [['hue','色相'],['saturation','彩度'],['luminance','輝度相当']]){const option=el('option',title);option.value=value;channel.append(option);}channelLabel.append(channel);fields.append(channelLabel);
  const deltaLabel=el('label','変更量（−200〜200）'),delta=el('input');delta.type='number';delta.min='-200';delta.max='200';delta.step='1';delta.value='0';deltaLabel.append(delta);fields.append(deltaLabel);
  const apply=el('button','標本色のHSLに適用');apply.type='button';fields.append(apply);
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(fields,status);container.append(root);
  let current=null,signature=null,mode=false,sampled=false,pending=false,disposed=false,generation=0;
  function permitted(){try{return Boolean(current?.asset&&current?.afterURL)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.sampleHSLAt==='function'&&typeof session.applySampledHSL==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!permitted();apply.disabled=!sampled;toggle.textContent=mode?'採色モードをOFF':'採色モードをON';toggle.setAttribute('aria-pressed',String(mode));root.setAttribute('aria-busy',String(pending));}
  function invalidate(){generation++;sampled=false;mode=false;sampleText.textContent='未採色';delta.value='0';}
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.afterURL??null]);if(next!==signature){const had=sampled||mode;signature=next;invalidate();if(had)status.textContent='画像またはRecipeが変わったため、採色結果を無効にしました。';}if(!permitted())mode=false;controls();}
  function coordinates(event){
    const view=document.defaultView,style=view?.getComputedStyle(afterImage),rect=afterImage.getBoundingClientRect();
    const naturalWidth=afterImage.naturalWidth,naturalHeight=afterImage.naturalHeight;
    if(!style||!afterImage.complete||!naturalWidth||!naturalHeight||rect.width<=0||rect.height<=0||style.transform!=='none'||style.objectFit!=='contain'||!['50% 50%','center center','center'].includes(style.objectPosition))throw Error('HSL_PICKER_GEOMETRY');
    for(let node=afterImage;node;node=node.parentElement){const css=view.getComputedStyle(node);if(css.transform!=='none'||css.zoom&& !['1','normal'].includes(css.zoom))throw Error('HSL_PICKER_GEOMETRY');}
    const px=name=>{const value=parseFloat(style[name]);return Number.isFinite(value)?value:0;};
    const left=px('borderLeftWidth')+px('paddingLeft'),right=px('borderRightWidth')+px('paddingRight'),top=px('borderTopWidth')+px('paddingTop'),bottom=px('borderBottomWidth')+px('paddingBottom');
    const width=rect.width-left-right,height=rect.height-top-bottom;
    if(width<=0||height<=0)throw Error('HSL_PICKER_GEOMETRY');
    const scale=Math.min(width/naturalWidth,height/naturalHeight),drawWidth=naturalWidth*scale,drawHeight=naturalHeight*scale;
    const x=(event.clientX-rect.left-left-(width-drawWidth)/2)/drawWidth,y=(event.clientY-rect.top-top-(height-drawHeight)/2)/drawHeight;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1||y<0||y>=1)throw Error('HSL_PICKER_LETTERBOX');
    return {x,y,radius:1};
  }
  const pickerMode=event=>{if(event.detail!=='hsl'){mode=false;controls();}};
  afterImage.addEventListener('suite-image-picker-mode',pickerMode);
  toggle.addEventListener('click',()=>{if(disposed||pending||!permitted())return;mode=!mode;if(mode)afterImage.dispatchEvent(new document.defaultView.CustomEvent('suite-image-picker-mode',{detail:'hsl'}));status.textContent=mode?'After画像内をクリックしてください。':'採色モードを終了しました。';controls();});
  const capture=async event=>{
    if(disposed||!mode)return;
    // Mode alone owns this interaction, including rejected letterbox clicks.
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(pending||!permitted())return;
    let point;try{point=coordinates(event);}catch{status.textContent='画像の余白、または未対応の表示配置です。中央配置のAfter画像内を選んでください。';return;}
    const token=generation;pending=true;sampled=false;controls();
    try{const result=await session.sampleHSLAt(point);if(disposed||token!==generation)return;
      if(!result||!Array.isArray(result.sampleRGB)||result.sampleRGB.length!==3||result.sampleRGB.some(v=>!Number.isFinite(v)||v<0||v>255)||!Number.isFinite(result.hue))throw Error('HSL_PICKER_RESULT');
      sampled=true;sampleText.textContent=`RGB ${result.sampleRGB.map(Math.round).join(', ')} ／ 色相 ${result.hue.toFixed(1)}°`;status.textContent='標本色を選択しました。変更量を入力して適用してください。';
    }catch{if(!disposed&&token===generation){sampled=false;sampleText.textContent='未採色';status.textContent='採色できませんでした。画像と処理状態を確認してください。';}}
    finally{pending=false;if(!disposed)controls();}
  };
  afterImage.addEventListener('click',capture,true);
  apply.addEventListener('click',async()=>{
    if(disposed||pending||!sampled||!permitted())return;const value=Number(delta.value);
    if(delta.value.trim()===''||!Number.isFinite(value)||value < -200||value>200||!['hue','saturation','luminance'].includes(channel.value)){status.textContent='変更量に−200〜200を入力してください。';delta.focus();return;}
    pending=true;mode=false;const token=generation;controls();
    try{await session.applySampledHSL({channel:channel.value,delta:value});if(!disposed){invalidate();status.textContent='HSLに適用しました。次の調整は再採色してください。Recipe保存は既存の保存操作で行ってください。';}}
    catch{if(!disposed){if(token===generation)sampled=false;status.textContent='適用できませんでした。再採色してからやり直してください。';}}
    finally{pending=false;if(!disposed)controls();}
  });
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;generation++;if(typeof unsubscribe==='function')unsubscribe();afterImage.removeEventListener('click',capture,true);afterImage.removeEventListener('suite-image-picker-mode',pickerMode);root.remove();}});
}
