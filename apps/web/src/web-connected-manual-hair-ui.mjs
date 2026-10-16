import {applyManualHair,validateManualHair,MANUAL_HAIR_VERSION,LOCAL_BRUSH_VERSION} from './processing/manual-hair.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

export function mountWebConnectedManualHair(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('MANUAL_HAIR_UI_CONFIG');
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手動髪色・つや・なめらかさ・白髪補正');
  root.append(el('h3','手動髪色・つや・なめらかさ・白髪補正'),el('p','未編集・回転Crop前の画像で、髪の範囲を手塗りしてください。顔・髪の自動検出は行いません。色・つや・なめらかさを指定した範囲へ適用します。なめらかさ0は従来の処理です。実処理24MPまで、RAW原寸出力の制限は別です。'));
  const fields=el('fieldset');fields.append(el('legend','髪色・つや・なめらかさ'));
  const target=el('select');target.setAttribute('aria-label','手塗り対象');
  for(const [value,text] of [['hair','髪全体の範囲'],['gray','白髪補正の範囲']]){const o=el('option',text);o.value=value;target.append(o);}fields.append(target);
  fields.append(el('p','白髪補正の範囲は髪全体と別に手塗りします。黒くする処理は両範囲の重なりだけに作用し、自動検出は行いません。選択中の対象だけマスク表示・消去・線の取消ができます。白髪だけ先に下書きできますが、適用には髪全体の選択も必要です。'));
  const numeric=(label,value,min,max,step='1')=>{const l=el('label',label),n=el('input');n.type='number';n.value=String(value);n.min=String(min);n.max=String(max);n.step=step;l.append(n);fields.append(l);return n;};
  const amount=numeric('髪色の強さ',40,0,100),shine=numeric('つや',0,0,100),smooth=numeric('なめらかさ',0,0,100),radius=numeric('ブラシ半径（短辺の%）',1,.1,50,'.1'),hardness=numeric('硬さ（%）',50,0,100);
  const blacken=numeric('白髪を黒くする強さ',0,0,100);
  const colorLabel=el('label','髪色'),color=el('input');color.type='color';color.value='#704a30';colorLabel.append(color);fields.append(colorLabel);
  const mode=el('select');mode.setAttribute('aria-label','塗る・消す');for(const [value,label] of [['add','範囲を塗る'],['erase','範囲を消す']]){const n=el('option',label);n.value=value;mode.append(n);}fields.append(mode);
  const label=el('label','マスクを表示'),mask=el('input');mask.type='checkbox';mask.checked=true;label.append(mask);fields.append(label);
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const undo=button('選択対象の最後の線を戻す'),clear=button('選択対象の下書きの線を消す'),apply=button('髪の補正を適用'),remove=button('適用済み髪の補正を解除');
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','髪の範囲。矢印で位置移動、Enterで点を追加');canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('MANUAL_HAIR_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,canvas,el('p','マスクOFFで補正結果を確認できます。最大64線・4096点、ブラシ処理量96M。青い線はドラッグ中の経路です。適用は編集履歴へ反映し、通常の保存操作で保存します。原本は変更しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,strokes=[],grayStrokes=[],selectedTarget='hair',active=null,pending=false,disposed=false,raf=null,lastImage=null;
  const selectedStrokes=()=>selectedTarget==='hair'?strokes:grayStrokes;
  const setSelectedStrokes=value=>{if(selectedTarget==='hair')strokes=value;else grayStrokes=value;};
  const keyboard={x:.5,y:.5},listeners=[];
  const on=(n,t,f)=>{n.addEventListener(t,f);listeners.push(()=>n.removeEventListener(t,f));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  function available(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setManualHair==='function';}catch{return false;}}
  function stop(){const a=active;active=null;if(a&&canvas.hasPointerCapture?.(a.id))canvas.releasePointerCapture(a.id);}
  function invalidate(){stop();binding=null;base=null;strokes=[];grayStrokes=[];lastImage=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!available()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';apply.disabled=!strokes.length;undo.disabled=!selectedStrokes().length;clear.disabled=!selectedStrokes().length;remove.disabled=!available()||!state?.recipe?.parameters?.extendedParameters?.manualHair;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!available()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('MANUAL_HAIR_DRAFT_STALE');}
  function num(n,min,max){if(n.value.trim()==='')throw Error('MANUAL_HAIR_CONTROLS');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('MANUAL_HAIR_CONTROLS');return v;}
  function settings(){if(!/^#[0-9a-f]{6}$/i.test(color.value))throw Error('MANUAL_HAIR_CONTROLS');const value={schemaVersion:1,engineVersion:MANUAL_HAIR_VERSION,brushVersion:LOCAL_BRUSH_VERSION,strokes:structuredClone(strokes),grayStrokes:structuredClone(grayStrokes),blacken:num(blacken,0,100),amount:num(amount,0,100),shine:num(shine,0,100),smooth:num(smooth,0,100),color:{r:parseInt(color.value.slice(1,3),16),g:parseInt(color.value.slice(3,5),16),b:parseInt(color.value.slice(5,7),16)}};validateManualHair(value);return value;}
  function draftMask(){
    const all=[...strokes,...grayStrokes];
    if(all.length>64||all.reduce((sum,s)=>sum+s.points.length,0)>4096)throw Error('MANUAL_HAIR_SHARED_BRUSH_LIMIT');
    const workBudget={remaining:96_000_000};let selected;
    for(const [key,list] of [['hair',strokes],['gray',grayStrokes]]){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes:list,workBudget});if(key===selectedTarget)selected=coverage;}
    return selected;
  }
  function guide(){if(!lastImage||disposed)return;ctx.putImageData(lastImage,0,0);if(active){ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);ctx.beginPath();active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();ctx.restore();}}
  function paint(){if(!binding||!base||disposed)return;let data=base.data.slice();
    if(strokes.length||grayStrokes.length){if(mask.checked){const coverage=draftMask();
      for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+170*a);}}
      else{if(!strokes.length)throw Error('補正結果の表示・適用には髪全体の範囲も塗ってください。');data=applyManualHair(base,settings()).data;}}
    lastImage=ctx.createImageData(base.width,base.height);lastImage.data.set(data);guide();}
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;guide();});}
  function hydrate(){assertPixels(session.proxy);if(session.proxy.width>1600||session.proxy.height>1600)throw Error('MANUAL_HAIR_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=state.recipe?.parameters?.extendedParameters?.manualHair;
    if(saved){validateManualHair(saved);strokes=structuredClone(saved.strokes);grayStrokes=structuredClone(saved.grayStrokes??[]);blacken.value=String(saved.blacken??0);amount.value=String(saved.amount);shine.value=String(saved.shine);smooth.value=String(saved.smooth??0);color.value='#'+[saved.color.r,saved.color.g,saved.color.b].map(v=>v.toString(16).padStart(2,'0')).join('');}else{strokes=[];grayStrokes=[];blacken.value='0';amount.value='40';shine.value='0';smooth.value='0';color.value='#704a30';}
    binding={signature:sig(state),proxy:session.proxy};paint();}
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!available()){const lost=Boolean(active)||strokes.length>0||grayStrokes.length>0;invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため両対象の下書きを破棄しました。';}
    if(available()&&!binding)try{hydrate();}catch(e){invalidate();status.textContent=e.message;}controls();}
  function point(event){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(r.width<=0||r.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('MANUAL_HAIR_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:num(radius,.1,50)/100,hardness:num(hardness,0,100)/100,mode:mode.value};}
  function append(s){ensure();const previous=selectedStrokes(),next=[...previous,s];setSelectedStrokes(next);
    try{draftMask();paint();}catch(e){setSelectedStrokes(previous);try{paint();}catch{}throw e;}status.textContent='未適用です。髪全体と白髪範囲の重なりを確認して適用してください。';controls();}
  on(target,'change',()=>{try{ensure();stop();if(!['hair','gray'].includes(target.value))throw Error('MANUAL_HAIR_TARGET');selectedTarget=target.value;mask.checked=true;paint();controls();status.textContent='選択対象のマスクを表示します。補正結果はマスクOFFで確認できます。';}catch(e){target.value=selectedTarget;status.textContent=e.message;}});
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={id:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(e){stop();status.textContent=e.message;}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if([...strokes,...grayStrokes].reduce((n,s)=>n+s.points.length,0)+active.stroke.points.length>=4096)throw Error('MANUAL_HAIR_POINT_LIMIT');active.stroke.points.push(p);schedule();}catch(e){stop();status.textContent=e.message;schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const s=active.stroke;stop();try{append(s);}catch(e){status.textContent=e.message;schedule();}});
  for(const name of ['pointercancel','lostpointercapture'])on(canvas,name,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(e){status.textContent=e.message;}});
  for(const n of [amount,shine,smooth,blacken,color,mask])on(n,'input',()=>{try{ensure();paint();}catch(e){status.textContent=e.message;}});
  function removeDraft(all){try{ensure();stop();if(all)setSelectedStrokes([]);else selectedStrokes().pop();
    if(selectedTarget==='gray'&&!grayStrokes.length){blacken.value='0';status.textContent='白髪範囲が空になったため、白髪補正の強さを0に戻しました。';}
    if(!strokes.length)mask.checked=true;paint();controls();}catch(e){controls();status.textContent=e.message;}}
  on(undo,'click',()=>removeDraft(false));on(clear,'click',()=>removeDraft(true));
  async function commit(clearValue){try{if(clearValue){if(!available()||signature!==sig(session.state))throw Error('MANUAL_HAIR_DRAFT_STALE');}else ensure();
    const value=clearValue?null:settings();if(value)applyManualHair(base,value);stop();pending=true;controls();await session.setManualHair(value);
    if(!disposed)status.textContent=clearValue?'髪の補正を解除しました。':'髪色・つや・なめらかさ・白髪補正を編集へ適用しました。通常の保存操作で保存してください。';
  }catch(e){if(!disposed)status.textContent=`適用できません：${e.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
