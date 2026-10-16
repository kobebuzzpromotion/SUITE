import {applyWebManualClothing,validateWebManualClothing,WEB_MANUAL_CLOTHING_VERSION,LOCAL_BRUSH_VERSION} from './processing/web-manual-clothing.mjs';
import {assertPixels} from './processing/pure.mjs';
import {rasterizeLocalBrushMask} from './processing/local-mask-brush.mjs';

export function mountWebManualClothing(container,{session,canUse=()=>false}={}){
  const doc=container?.ownerDocument;
  if(!doc?.createElement||typeof session?.subscribe!=='function'||typeof canUse!=='function')throw Error('WEB_MANUAL_CLOTHING_UI_CONFIG');
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const root=el('section');root.setAttribute('aria-label','手動衣服しわ補正');
  root.append(el('h3','手動衣服しわ補正'),el('p','未編集・回転Crop前の画像で衣服の補正範囲を手塗りします。AIや衣服の自動検出は使いません。染み抜き・衣服境界の補正は対象外です。実処理24MPまでで、巨大原寸Final出力の保証ではありません。'));
  const fields=el('fieldset');fields.append(el('legend','しわ補正と手動ブラシ'));
  const number=(label,value,min,max,step='1')=>{const wrap=el('label',label),n=el('input');n.type='number';n.value=String(value);n.min=String(min);n.max=String(max);n.step=step;wrap.append(n);fields.append(wrap);return n;};
  const dewrinkle=number('しわ補正 全体（%）',0,0,100),fine=number('細かいしわ（%）',0,0,100),coarse=number('大きいしわ（%）',0,0,100);
  const processingRadius=number('補正処理の半径（1〜32）',4,1,32),brushRadius=number('塗るブラシ半径（短辺の%）',3,.1,50,'.1'),hardness=number('ブラシ硬さ（%）',50,0,100);
  fields.append(el('p','全体が0のときは細かいしわ・大きいしわも0として適用します。補正処理の半径と、塗る範囲のブラシ半径は別の設定です。'));
  const mode=el('select');mode.setAttribute('aria-label','範囲を塗る・消す');
  for(const [value,label] of [['add','範囲を塗る'],['erase','範囲を消す']]){const n=el('option',label);n.value=value;mode.append(n);}fields.append(mode);
  const mask=el('input');mask.type='checkbox';mask.checked=true;const maskLabel=el('label','マスクを表示');maskLabel.prepend(mask);fields.append(maskLabel);
  const button=text=>{const n=el('button',text);n.type='button';fields.append(n);return n;};
  const undo=button('最後の線を戻す'),clear=button('下書きの線を消す'),apply=button('衣服しわ補正を適用');
  const remove=el('button','適用済み衣服しわ補正を解除');remove.type='button';
  const canvas=el('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','衣服の補正範囲。矢印キーで位置移動、Enterで点を追加');canvas.style.cssText='display:block;width:100%;height:auto;max-width:800px;touch-action:none;cursor:crosshair;';
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('WEB_MANUAL_CLOTHING_CANVAS_UNAVAILABLE');
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(fields,remove,canvas,el('p','マスクOFFで補正結果を確認できます。最大64線・4096点・ブラシ処理量96M。青線はドラッグ中のガイドです。適用はUndo可能な編集となり、保存は通常のRecipe保存操作です。原本は変更しません。'),status);container.append(root);
  let state,signature=null,binding=null,base=null,strokes=[],active=null,pending=false,disposed=false,raf=null,lastImage=null;
  const listeners=[],keyboard={x:.5,y:.5};
  const on=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
  const sig=s=>JSON.stringify([s?.asset?.id,s?.asset?.sha256,s?.revision,s?.recipe,s?.afterURL]);
  function allowed(){try{return !disposed&&!pending&&Boolean(state?.asset)&&!state.busy&&!state.exporting&&canUse(state)===true&&typeof session.setWebManualClothing==='function';}catch{return false;}}
  function stop(){const previous=active;active=null;if(previous&&canvas.hasPointerCapture?.(previous.id))canvas.releasePointerCapture(previous.id);}
  function invalidate(){stop();binding=null;base=null;strokes=[];lastImage=null;ctx.clearRect(0,0,canvas.width,canvas.height);}
  function controls(){fields.disabled=!allowed()||!binding;canvas.setAttribute('aria-disabled',String(fields.disabled));canvas.style.touchAction=fields.disabled?'auto':'none';apply.disabled=undo.disabled=clear.disabled=!strokes.length;
    remove.disabled=!allowed()||!state?.recipe?.parameters?.extendedParameters?.webManualClothing;root.setAttribute('aria-busy',String(pending));}
  function ensure(){if(!allowed()||!binding||binding.signature!==sig(session.state)||binding.proxy!==session.proxy)throw Error('WEB_MANUAL_CLOTHING_DRAFT_STALE');}
  function num(n,min,max){if(!n.value.trim())throw Error('WEB_MANUAL_CLOTHING_CONTROLS');const v=Number(n.value);if(!Number.isFinite(v)||v<min||v>max)throw Error('WEB_MANUAL_CLOTHING_CONTROLS');return v;}
  function settings(list=strokes){const parent=num(dewrinkle,0,100)/100,radius=num(processingRadius,1,32);if(!Number.isInteger(radius))throw Error('WEB_MANUAL_CLOTHING_RADIUS_INTEGER');
    const value={schemaVersion:1,engineVersion:WEB_MANUAL_CLOTHING_VERSION,brushVersion:LOCAL_BRUSH_VERSION,strokes:structuredClone(list),dewrinkle:parent,
      fineWrinkles:parent===0?0:num(fine,0,100)/100,coarseWrinkles:parent===0?0:num(coarse,0,100)/100,radius};validateWebManualClothing(value);return value;}
  function guide(){if(!lastImage||disposed)return;ctx.putImageData(lastImage,0,0);if(active){ctx.save();ctx.strokeStyle='#00d5ff';ctx.lineWidth=Math.max(1,base.width/400);ctx.beginPath();active.stroke.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*base.width,p.y*base.height);else ctx.moveTo(p.x*base.width,p.y*base.height);});ctx.stroke();ctx.restore();}}
  function paint(){if(!binding||!base||disposed)return;let data=base.data.slice();
    if(strokes.length){const value=settings();if(mask.checked){const coverage=rasterizeLocalBrushMask({width:base.width,height:base.height,strokes,workBudget:{remaining:96_000_000}});
      for(let i=0;i<coverage.data.length;i++){const at=i*4;if(!data[at+3])continue;const a=coverage.data[i]/255*.6;data[at]=Math.round(data[at]*(1-a)+255*a);data[at+1]=Math.round(data[at+1]*(1-a));data[at+2]=Math.round(data[at+2]*(1-a)+170*a);}}
      else data=applyWebManualClothing(base,value).data;}
    lastImage=ctx.createImageData(base.width,base.height);lastImage.data.set(data);guide();}
  function schedule(){if(raf!==null)return;raf=doc.defaultView.requestAnimationFrame(()=>{raf=null;guide();});}
  function hydrate(){assertPixels(session.proxy);if(session.proxy.width>1600||session.proxy.height>1600)throw Error('WEB_MANUAL_CLOTHING_PROXY_REQUIRED');
    base={...session.proxy,data:session.proxy.data.slice()};canvas.width=base.width;canvas.height=base.height;
    const saved=state.recipe?.parameters?.extendedParameters?.webManualClothing;
    if(saved){validateWebManualClothing(saved);strokes=structuredClone(saved.strokes);dewrinkle.value=String(saved.dewrinkle*100);fine.value=String(saved.fineWrinkles*100);coarse.value=String(saved.coarseWrinkles*100);processingRadius.value=String(saved.radius);}
    else{strokes=[];dewrinkle.value=fine.value=coarse.value='0';processingRadius.value='4';}
    binding={signature:sig(state),proxy:session.proxy};paint();}
  function sync(value){if(disposed)return;state=value;const next=sig(value),changed=next!==signature||binding&&binding.proxy!==session.proxy;signature=next;
    if(changed||!allowed()){const lost=Boolean(active)||strokes.length>0;invalidate();if(lost&&!pending)status.textContent='画像・版・編集状態が変わったため下書きを破棄しました。';}
    if(allowed()&&!binding)try{hydrate();}catch(error){invalidate();status.textContent=error.message;}controls();}
  function point(event){const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(rect.width<=0||rect.height<=0||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('WEB_MANUAL_CLOTHING_POINT_OUTSIDE');return {x,y};}
  function stroke(p){return {points:[p],radius:num(brushRadius,.1,50)/100,hardness:num(hardness,0,100)/100,mode:mode.value};}
  function append(value){ensure();const previous=strokes,next=[...strokes,value];settings(next);strokes=next;try{paint();}catch(error){strokes=previous;try{paint();}catch{}throw error;}status.textContent='未適用です。範囲と補正結果を確認してください。';controls();}
  on(canvas,'pointerdown',event=>{if(event.button!==0||active)return;try{ensure();event.preventDefault();active={id:event.pointerId,stroke:stroke(point(event))};canvas.setPointerCapture(event.pointerId);schedule();}catch(error){stop();status.textContent=error.message;}});
  on(canvas,'pointermove',event=>{if(!active||active.id!==event.pointerId)return;try{ensure();event.preventDefault();const p=point(event),last=active.stroke.points.at(-1);if(Math.hypot((p.x-last.x)*base.width,(p.y-last.y)*base.height)<2)return;
    if(strokes.reduce((sum,s)=>sum+s.points.length,0)+active.stroke.points.length>=4096)throw Error('WEB_MANUAL_CLOTHING_POINT_LIMIT');active.stroke.points.push(p);schedule();}catch(error){stop();status.textContent=error.message;schedule();}});
  on(canvas,'pointerup',event=>{if(!active||active.id!==event.pointerId)return;const value=active.stroke;stop();try{append(value);}catch(error){status.textContent=error.message;schedule();}});
  for(const event of ['pointercancel','lostpointercapture'])on(canvas,event,()=>{if(active){stop();schedule();}});
  on(canvas,'keydown',event=>{try{ensure();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();keyboard.x=Math.max(0,Math.min(1,keyboard.x+(event.key==='ArrowRight' ? .01 : event.key==='ArrowLeft' ? -.01 : 0)));keyboard.y=Math.max(0,Math.min(1,keyboard.y+(event.key==='ArrowDown' ? .01 : event.key==='ArrowUp' ? -.01 : 0)));status.textContent=`位置 ${Math.round(keyboard.x*100)}%, ${Math.round(keyboard.y*100)}%。Enterで点を追加。`;}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();append(stroke({...keyboard}));}}catch(error){status.textContent=error.message;}});
  for(const n of [dewrinkle,fine,coarse,processingRadius,mask])on(n,'input',()=>{try{ensure();paint();}catch(error){status.textContent=error.message;}});
  on(undo,'click',()=>{try{ensure();stop();strokes.pop();paint();controls();}catch(error){status.textContent=error.message;}});
  on(clear,'click',()=>{try{ensure();stop();strokes=[];paint();controls();}catch(error){status.textContent=error.message;}});
  async function commit(clearValue){try{if(clearValue){if(!allowed()||signature!==sig(session.state))throw Error('WEB_MANUAL_CLOTHING_DRAFT_STALE');}else ensure();
    const value=clearValue?null:settings();if(value)applyWebManualClothing(base,value);stop();pending=true;controls();await session.setWebManualClothing(value);
    if(!disposed)status.textContent=clearValue?'衣服しわ補正を解除しました。':'衣服しわ補正を編集へ反映しました。通常の保存操作で保存してください。';
    }catch(error){if(!disposed)status.textContent=`適用できません：${error.message}`;}finally{pending=false;if(!disposed)sync(session.state);}}
  on(apply,'click',()=>{void commit(false);});on(remove,'click',()=>{void commit(true);});
  const unsubscribe=session.subscribe(sync);
  return Object.freeze({refresh(){if(!disposed)sync(session.state);},dispose(){if(disposed)return;disposed=true;stop();if(raf!==null)doc.defaultView.cancelAnimationFrame(raf);unsubscribe?.();for(const off of listeners)off();root.remove();}});
}
