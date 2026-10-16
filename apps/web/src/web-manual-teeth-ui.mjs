import {applyWebManualTeeth,validateWebManualTeeth,WEB_MANUAL_TEETH_VERSION,LOCAL_BRUSH_VERSION} from './processing/web-manual-teeth.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

export function mountWebManualTeeth(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('WEB_MANUAL_TEETH_UI_CONFIG');
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手動歯の明るさ・脱色');
  root.append(el('h3','手動歯の明るさ・脱色'),el('p','未編集・回転Crop前の画像で、歯に適用したい範囲だけを自分で塗ってください。歯・顔の検出や本人確認は行いません。指定範囲の明るさと彩度だけを変えます。歯の生成・矯正・欠損修復ではありません。実処理24MPまで、RAW原寸出力の制限は別です。'));
  const fields=el('fieldset');fields.append(el('legend','手動範囲と補正'));
  const numeric=(label,value,min,max,step='1')=>{const l=el('label',label),n=el('input');n.type='number';n.value=String(value);n.min=String(min);n.max=String(max);n.step=step;l.append(n);fields.append(l);return n;};
  const brightness=numeric('明るさ',15,-100,100),desaturation=numeric('脱色',30,0,100),radius=numeric('ブラシ半径（短辺の%）',1,.1,50,'.1'),hardness=numeric('硬さ（%）',50,0,100);
  const mode=el('select');mode.setAttribute('aria-label','塗る・消す');for(const [value,label] of [['add','範囲を塗る'],['erase','範囲を消す']]){const n=el('option',label);n.value=value;mode.append(n);}fields.append(mode);
  const label=el('label','マスクを表示'),mask=el('input');mask.type='checkbox';mask.checked=true;label.append(mask);fields.append(label);
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const undo=button('最後の線を戻す'),clear=button('下書きの線を消す'),apply=button('歯の明るさ・脱色を適用'),remove=button('適用済み歯の明るさ・脱色を解除');
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','歯の手動範囲。矢印で位置移動、Enterで点を追加');canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('WEB_MANUAL_TEETH_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,canvas,el('p','マスクOFFで補正結果を確認できます。最大64線・4096点、ブラシ処理量96M。青い線はドラッグ中の経路です。適用は編集履歴へ反映し、通常の保存操作で保存します。原本は変更しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,strokes=[],active=null,pending=false,disposed=false,raf=null,lastImage=null;
  const keyboard={x:.5,y:.5},listeners=[];
  const on=(n,t,f)=>{n.addEventListener(t,f);listeners.push(()=>n.removeEventListener(t,f));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  function available(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebManualTeeth==='function';}catch{return false;}}
  function stop(){const a=active;active=null;if(a&&canvas.hasPointerCapture?.(a.id))canvas.releasePointerCapture(a.id);}
  function invalidate(){stop();binding=null;base=null;strokes=[];lastImage=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!available()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';apply.disabled=!strokes.length;undo.disabled=!strokes.length;clear.disabled=!strokes.length;remove.disabled=!available()||!state?.recipe?.parameters?.extendedParameters?.webManualTeeth;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!available()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('WEB_MANUAL_TEETH_DRAFT_STALE');}
  function num(n,min,max){if(n.value.trim()==='')throw Error('WEB_MANUAL_TEETH_CONTROLS');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('WEB_MANUAL_TEETH_CONTROLS');return v;}
  function settings(list=strokes){const value={schemaVersion:1,engineVersion:WEB_MANUAL_TEETH_VERSION,brushVersion:LOCAL_BRUSH_VERSION,strokes:structuredClone(list),brightness:num(brightness,-100,100),desaturation:num(desaturation,0,100)};validateWebManualTeeth(value);return value;}
  function guide(){if(!lastImage||disposed)return;ctx.putImageData(lastImage,0,0);if(active){ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);ctx.beginPath();active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();ctx.restore();}}
  function paint(){if(!binding||!base||disposed)return;let data=base.data.slice();
    if(strokes.length){const value=settings();if(mask.checked){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes,workBudget:{remaining:96_000_000}});
      for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+170*a);}}
      else data=applyWebManualTeeth(base,value).data;}
    lastImage=ctx.createImageData(base.width,base.height);lastImage.data.set(data);guide();}
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;guide();});}
  function hydrate(){assertPixels(session.proxy);if(session.proxy.width>1600||session.proxy.height>1600)throw Error('WEB_MANUAL_TEETH_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=state.recipe?.parameters?.extendedParameters?.webManualTeeth;
    if(saved){validateWebManualTeeth(saved);strokes=structuredClone(saved.strokes);brightness.value=String(saved.brightness);desaturation.value=String(saved.desaturation);}else{strokes=[];brightness.value='15';desaturation.value='30';}
    binding={signature:sig(state),proxy:session.proxy};paint();}
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!available()){const lost=Boolean(active)||strokes.length>0;invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(available()&&!binding)try{hydrate();}catch(e){invalidate();status.textContent=e.message;}controls();}
  function point(event){const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(r.width<=0||r.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('WEB_MANUAL_TEETH_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:num(radius,.1,50)/100,hardness:num(hardness,0,100)/100,mode:mode.value};}
  function append(s){ensure();const previous=strokes,next=[...strokes,s];settings(next);strokes=next;try{paint();}catch(e){strokes=previous;paint();throw e;}status.textContent='未適用です。範囲と補正結果を確認して適用してください。';controls();}
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={id:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(e){stop();status.textContent=e.message;}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if(strokes.reduce((n,s)=>n+s.points.length,0)+active.stroke.points.length>=4096)throw Error('WEB_MANUAL_TEETH_POINT_LIMIT');active.stroke.points.push(p);schedule();}catch(e){stop();status.textContent=e.message;schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const s=active.stroke;stop();try{append(s);}catch(e){status.textContent=e.message;schedule();}});
  for(const name of ['pointercancel','lostpointercapture'])on(canvas,name,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(e){status.textContent=e.message;}});
  for(const n of [brightness,desaturation,mask])on(n,'input',()=>{try{ensure();paint();}catch(e){status.textContent=e.message;}});
  on(undo,'click',()=>{try{ensure();stop();strokes.pop();paint();controls();}catch(e){status.textContent=e.message;}});
  on(clear,'click',()=>{try{ensure();stop();strokes=[];paint();controls();}catch(e){status.textContent=e.message;}});
  async function commit(clearValue){try{if(clearValue){if(!available()||signature!==sig(session.state))throw Error('WEB_MANUAL_TEETH_DRAFT_STALE');}else ensure();
    const value=clearValue?null:settings();if(value)applyWebManualTeeth(base,value);stop();pending=true;controls();await session.setWebManualTeeth(value);
    if(!disposed)status.textContent=clearValue?'歯の明るさ・脱色を解除しました。':'歯の明るさ・脱色を編集へ適用しました。通常の保存操作で保存してください。';
  }catch(e){if(!disposed)status.textContent=`適用できません：${e.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
