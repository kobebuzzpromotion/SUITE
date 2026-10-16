import {validatePointColorSelections} from './processing/lr-point-color.mjs';

/** Manual ranges and explicitly sampled ranges; visualization never replaces After. */
export function mountWebConnectedPointColor(container,{session,canUse=()=>false,afterImage}={}){
  const document=container?.ownerDocument;
  if(!document?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('POINT_COLOR_PANEL_CONFIG');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','ポイントカラー');root.append(el('h3','ポイントカラー'),el('p','SUITE独自の範囲選択。最大16選択。内部は分割処理し、通常Web描画の24MP上限に対応します。大判ファイルの分割書き出しとは別です。LはHSL明度です。採色モードではAfter画像内をクリックします。範囲表示は専用プレビューだけで、After画像やFinalを変更しません。'));
  const form=el('form');form.noValidate=true;const fields=el('fieldset');fields.append(el('legend','選択範囲'));
  const choiceLabel=el('label','編集する選択'),choice=el('select');choiceLabel.append(choice);fields.append(choiceLabel);
  const button=text=>{const b=el('button',text);b.type='button';fields.append(b);return b;};
  const add=button('選択を追加'),remove=button('選択を削除');
  const picker=button('採色モードをON'),preview=button('選択範囲を表示');picker.setAttribute('aria-pressed','false');
  const canvas=el('canvas');canvas.hidden=true;canvas.setAttribute('aria-label','ポイントカラー選択範囲プレビュー');canvas.style.maxWidth='100%';root.append(canvas);
  const active=el('fieldset');active.append(el('legend','選択中の色範囲'));
  const enabledLabel=el('label','この選択を有効にする'),enabled=el('input');enabled.type='checkbox';enabledLabel.prepend(enabled);active.append(enabledLabel);
  const allLabel=el('label','全色相（無彩色を含む）'),all=el('input');all.type='checkbox';allLabel.prepend(all);active.append(allLabel);
  const inputs=new Map();
  function numeric(parent,key,title,min,max,step){const label=el('label',title),n=el('input');n.type='number';n.min=String(min);n.max=String(max);n.step=String(step);n.required=true;label.append(n);parent.append(label);inputs.set(key,n);return n;}
  numeric(active,'center','色相中心（度）',0,360,1);numeric(active,'inner','色相内側幅（度）',0,180,1);numeric(active,'outer','色相外側幅（度）',0,180,1);
  const edges=['外側下限','内側下限','内側上限','外側上限'];
  for(const [key,title] of [['saturation','彩度範囲'],['lightness','明度範囲']])for(let i=0;i<4;i++)numeric(active,`${key}${i}`,`${title} ${edges[i]}（0〜1）`,0,1,.01);
  numeric(active,'adjustHue','調整 色相（度）',-180,180,1);numeric(active,'adjustSaturation','調整 彩度',-100,100,1);numeric(active,'adjustLightness','調整 明度',-100,100,1);
  fields.append(active);const amount=numeric(fields,'amount','全体適用量',0,1,.01);
  const apply=button('適用');apply.type='submit';const reset=button('ポイントカラーをリセット');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(fields,status);root.append(form);container.append(root);
  let current=null,signature=null,selections=[],selected=-1,dirty=false,pending=false,disposed=false,valid=true,mode=false,binding=null,generation=0;
  function clearPreview(){canvas.hidden=true;canvas.width=0;canvas.height=0;}
  function permitted(){try{return Boolean(current?.asset)&&!current.busy&&!current.exporting&&canUse(current)===true&&typeof session.setPointColor==='function';}catch{return false;}}
  function controls(){fields.disabled=disposed||pending||!valid||!permitted();active.disabled=selected<0;choice.disabled=!selections.length;add.disabled=selections.length>=16;remove.disabled=selected<0;apply.disabled=!selections.length;picker.disabled=!afterImage?.addEventListener||!current?.afterURL||typeof session.samplePointColorAt!=='function'||typeof session.applySampledPointColor!=='function'||selections.length>=16;preview.disabled=!selections.length||typeof session.renderPointColorRange!=='function';if(!permitted())mode=false;picker.textContent=mode?'採色モードをOFF':'採色モードをON';picker.setAttribute('aria-pressed',String(mode));for(const k of ['center','inner','outer'])inputs.get(k).disabled=all.checked;root.setAttribute('aria-busy',String(pending));}
  function number(key){const n=inputs.get(key),v=Number(n.value);if(n.value.trim()===''||!Number.isFinite(v)||v<Number(n.min)||v>Number(n.max)){n.focus();throw Error('POINT_COLOR_INPUT');}return v;}
  function capture(){
    if(selected<0)return;
    const s={id:selections[selected].id,enabled:enabled.checked,hue:all.checked?null:{center:number('center'),inner:number('inner'),outer:number('outer')},
      saturation:[0,1,2,3].map(i=>number(`saturation${i}`)),lightness:[0,1,2,3].map(i=>number(`lightness${i}`)),
      adjustment:{hue:number('adjustHue'),saturation:number('adjustSaturation'),lightness:number('adjustLightness')}};
    selections[selected]=validatePointColorSelections([s])[0];
  }
  function show(){
    choice.replaceChildren();selections.forEach((s,i)=>{const o=el('option',`選択 ${i+1}${s.enabled?'':'（無効）'}`);o.value=String(i);choice.append(o);});choice.value=String(selected);
    const s=selections[selected];enabled.checked=s?.enabled??true;all.checked=s?.hue===null;
    for(const k of ['center','inner','outer'])inputs.get(k).value=String(s?.hue?.[k]??({center:0,inner:10,outer:20}[k]));
    for(const key of ['saturation','lightness'])for(let i=0;i<4;i++)inputs.get(`${key}${i}`).value=String(s?.[key]?.[i]??[0,0,1,1][i]);
    for(const [key,field] of [['adjustHue','hue'],['adjustSaturation','saturation'],['adjustLightness','lightness']])inputs.get(key).value=String(s?.adjustment[field]??0);
    controls();
  }
  function synchronize(value){if(disposed)return;current=value;const next=JSON.stringify([value?.asset?.id??null,value?.revision??null,value?.recipe??null,value?.afterURL??null]);
    if(next!==signature){const lost=dirty;signature=next;generation++;mode=false;binding=null;clearPreview();try{const p=value?.recipe?.parameters?.extendedParameters?.postDecodeAdjustments?.color?.pointColor;
      selections=p?validatePointColorSelections(p.selections):[];const a=p?.amount??1;if(!Number.isFinite(a)||a<0||a>1)throw Error('POINT_COLOR_AMOUNT');amount.value=String(a);selected=selections.length?0:-1;dirty=false;valid=true;show();status.textContent=lost?'写真またはRecipeが変わったため、未適用の入力を破棄しました。':'';
    }catch{valid=false;status.textContent='保存済みポイントカラーを解釈できません。保存内容は変更していません。';}}controls();}
  form.addEventListener('input',()=>{dirty=true;clearPreview();status.textContent='未適用の入力があります。';controls();});
  all.addEventListener('change',controls);
  choice.addEventListener('change',()=>{const next=Number(choice.value);try{capture();selected=next;show();}catch{choice.value=String(selected);status.textContent='範囲の順序・内外幅・入力値を確認してください。';}});
  add.addEventListener('click',()=>{if(!permitted()||pending||selections.length>=16)return;try{capture();selections.push(validatePointColorSelections([{id:crypto.randomUUID(),hue:{center:0,inner:10,outer:20},saturation:[0,0,1,1],lightness:[0,0,1,1]}])[0]);selected=selections.length-1;dirty=true;show();status.textContent='選択を追加しました。まだ未適用です。';}catch{status.textContent='現在の範囲入力を確認してください。';}});
  remove.addEventListener('click',()=>{if(!permitted()||pending||selected<0)return;selections.splice(selected,1);selected=Math.min(selected,selections.length-1);dirty=true;show();status.textContent=selections.length?'選択を削除しました。まだ未適用です。':'選択がありません。保存済み設定を消すにはリセットを押してください。';});
  async function commit(clear){if(disposed||pending||!valid||!permitted())return;let value;try{if(clear)value=null;else{capture();value={selections:validatePointColorSelections(selections),amount:number('amount')};}}catch{status.textContent='範囲は外側下限 ≤ 内側下限 ≤ 内側上限 ≤ 外側上限、色相は内側幅 ≤ 外側幅にしてください。';return;}
    pending=true;mode=false;const assetId=current.asset.id;controls();try{if(!clear&&binding)await session.applySampledPointColor({...value,binding});else await session.setPointColor(value);if(!disposed&&current?.asset?.id===assetId){signature=null;synchronize(session.state??current);status.textContent=clear?'リセットしました。Recipeの保存は既存の保存操作で行ってください。':'適用しました。Recipeの保存は既存の保存操作で行ってください。';}}catch{if(!disposed)status.textContent='適用できませんでした。権限・処理状態・画像上限を確認してください。';}finally{pending=false;if(!disposed)controls();}}
  form.addEventListener('submit',event=>{event.preventDefault();void commit(false);});reset.addEventListener('click',()=>{void commit(true);});
  function coordinates(event){
    const view=document.defaultView,style=view?.getComputedStyle(afterImage),rect=afterImage.getBoundingClientRect(),nw=afterImage.naturalWidth,nh=afterImage.naturalHeight;
    if(!style||!afterImage.complete||!nw||!nh||rect.width<=0||rect.height<=0||style.objectFit!=='contain'||!['50% 50%','center center','center'].includes(style.objectPosition))throw Error('POINT_COLOR_GEOMETRY');
    for(let node=afterImage;node;node=node.parentElement){const css=view.getComputedStyle(node);if(css.transform!=='none'||css.zoom&&!['1','normal'].includes(css.zoom))throw Error('POINT_COLOR_GEOMETRY');}
    const px=name=>parseFloat(style[name])||0,left=px('borderLeftWidth')+px('paddingLeft'),top=px('borderTopWidth')+px('paddingTop');
    const w=rect.width-left-px('borderRightWidth')-px('paddingRight'),h=rect.height-top-px('borderBottomWidth')-px('paddingBottom');if(w<=0||h<=0)throw Error('POINT_COLOR_GEOMETRY');
    const scale=Math.min(w/nw,h/nh),dw=nw*scale,dh=nh*scale,x=(event.clientX-rect.left-left-(w-dw)/2)/dw,y=(event.clientY-rect.top-top-(h-dh)/2)/dh;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=1||y<0||y>=1)throw Error('POINT_COLOR_LETTERBOX');return {x,y};
  }
  const pickerMode=event=>{if(event.detail!=='point-color'){mode=false;generation++;controls();}};
  add.addEventListener('click',clearPreview);remove.addEventListener('click',clearPreview);
  picker.addEventListener('click',()=>{if(disposed||pending||!permitted()||picker.disabled)return;mode=!mode;if(mode)afterImage.dispatchEvent(new document.defaultView.CustomEvent('suite-image-picker-mode',{detail:'point-color'}));controls();});
  const sampleClick=async event=>{
    if(disposed||!mode)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();if(pending||!permitted()||selections.length>=16)return;
    let point;try{capture();point=coordinates(event);}catch{status.textContent='範囲入力とAfter画像内の位置を確認してください。余白は採色しません。';return;}
    const token=generation;pending=true;controls();try{const result=await session.samplePointColorAt(point);if(disposed||token!==generation)return;
      if(!result?.binding)throw Error('POINT_COLOR_SAMPLE_BINDING');
      const next=validatePointColorSelections([...selections,result.selection]);binding=result.binding;selections=next;selected=next.length-1;dirty=true;clearPreview();show();status.textContent='採色した範囲を追加しました。調整値を入力して適用してください。';
    }catch{if(!disposed&&token===generation)status.textContent='採色できませんでした。画像・範囲数・現在のRecipeを確認してください。';}finally{pending=false;if(!disposed)controls();}
  };
  preview.addEventListener('click',async()=>{
    if(disposed||pending||!permitted()||preview.disabled)return;let values;try{capture();values=validatePointColorSelections(selections);}catch{status.textContent='範囲入力を確認してください。';return;}
    const token=generation;pending=true;clearPreview();controls();try{const frame=await session.renderPointColorRange({selections:values,mode:'overlay'});if(disposed||token!==generation)return;
      if(!Number.isSafeInteger(frame?.width)||!Number.isSafeInteger(frame?.height)||frame.width<1||frame.height<1||frame.width*frame.height>24000000||!(frame.data instanceof Uint8ClampedArray||frame.data instanceof Uint8Array)||frame.data.length!==frame.width*frame.height*4)throw Error('POINT_COLOR_PREVIEW_FRAME');
      canvas.width=frame.width;canvas.height=frame.height;const context=canvas.getContext('2d');if(!context)throw Error('POINT_COLOR_PREVIEW_CONTEXT');const data=context.createImageData(frame.width,frame.height);data.data.set(frame.data);context.putImageData(data,0,0);canvas.hidden=false;status.textContent='選択範囲の専用プレビューです。After・Finalは変更していません。';
    }catch{if(!disposed&&token===generation){clearPreview();status.textContent='範囲を表示できませんでした。画像と設定を確認してください。';}}finally{pending=false;if(!disposed)controls();}
  });
  afterImage?.addEventListener('suite-image-picker-mode',pickerMode);afterImage?.addEventListener('click',sampleClick,true);
  const unsubscribe=session.subscribe(synchronize);
  return Object.freeze({refresh(){if(!disposed)synchronize(session.state??current);},dispose(){if(disposed)return;disposed=true;generation++;if(typeof unsubscribe==='function')unsubscribe();afterImage?.removeEventListener('click',sampleClick,true);afterImage?.removeEventListener('suite-image-picker-mode',pickerMode);root.remove();}});
}
